import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, RefreshCw } from "lucide-react";
import { BOARD_KEY, DEV_SNAPSHOT, useBoard, type BoardData, type Company } from "../lib/board";
import { targetFor, type MeasureDef } from "../lib/scoring";
import { errorMessage, supabase } from "../lib/supabase";
import { monthLabel } from "../lib/format";
import { canEdit, useAuth } from "../lib/auth";
import { cn } from "../lib/utils";
import { Button, Card, CardHeader, ErrorBox, Input, PageHeader, Tabs } from "../components/ui";
import { BoardGate, MonthSelect, usePeriod } from "../components/board-bits";

const UNIT_HINT: Record<MeasureDef["unit"], string> = {
  php: "₱",
  pct: "%",
  ratio: "×",
  score5: "/ 5",
};

/**
 * Monthly results, by hand. Until each business's own system or sheet feeds
 * the board, this is where a month's figures go in. Figures that sync from a
 * system (NAM Supply's sales numbers) are shown but locked.
 */
export default function Entry() {
  const { data } = useBoard();
  const [period, setPeriod] = usePeriod(data);
  const [params, setParams] = useSearchParams();
  const slug = params.get("c") ?? data?.companies[0]?.slug ?? "";
  const company = data?.companies.find((c) => c.slug === slug) ?? data?.companies[0];
  const { role } = useAuth();
  const editable = DEV_SNAPSHOT || canEdit(role);

  return (
    <>
      <PageHeader
        eyebrow="Data"
        title="Enter results"
        description={`One figure per measure for ${monthLabel(period)}. Leave a box empty when there's no result; it won't count against the score.`}
        actions={<MonthSelect data={data} value={period} onChange={setPeriod} />}
      />
      <BoardGate>
        {(d) => (
          <div className="space-y-5">
            <Tabs
              value={company?.slug ?? ""}
              onChange={(v) =>
                setParams(
                  (prev) => {
                    const next = new URLSearchParams(prev);
                    next.set("c", v);
                    return next;
                  },
                  { replace: true },
                )
              }
              items={d.companies.map((c) => ({ value: c.slug, label: c.name }))}
            />
            {!editable && (
              <ErrorBox>Your account can view results but not change them. Ask the owner for editor access.</ErrorBox>
            )}
            {company && <EntryForm key={`${company.id}:${period}`} data={d} company={company} period={period} editable={editable} />}
          </div>
        )}
      </BoardGate>
    </>
  );
}

interface Draft {
  actual: string;
  target: string;
}

function EntryForm({ data, company, period, editable }: { data: BoardData; company: Company; period: string; editable: boolean }) {
  const qc = useQueryClient();
  const cmBy = useMemo(
    () => new Map(data.companyMeasures.filter((c) => c.company_id === company.id).map((c) => [c.measure_code, c])),
    [data, company.id],
  );
  const rowBy = useMemo(
    () => new Map(data.actuals.filter((a) => a.company_id === company.id && a.period === period).map((a) => [a.measure_code, a])),
    [data, company.id, period],
  );

  const initial = useMemo(() => {
    const o: Record<string, Draft> = {};
    for (const m of data.measures) {
      const r = rowBy.get(m.code);
      o[m.code] = { actual: r ? String(Number(r.actual)) : "", target: r?.target != null ? String(r.target) : "" };
    }
    return o;
  }, [data.measures, rowBy]);
  const [draft, setDraft] = useState(initial);
  useEffect(() => setDraft(initial), [initial]);

  const changed = data.measures.filter(
    (m) => cmBy.get(m.code)?.source !== "system" && (draft[m.code]?.actual !== initial[m.code]?.actual || draft[m.code]?.target !== initial[m.code]?.target),
  );

  const save = useMutation({
    mutationFn: async () => {
      if (DEV_SNAPSHOT) throw new Error("Saving is off in the local preview.");
      const upserts = [];
      const deletes: string[] = [];
      for (const m of changed) {
        const a = draft[m.code].actual.trim();
        const t = draft[m.code].target.trim();
        if (a === "") {
          if (rowBy.has(m.code)) deletes.push(m.code);
          continue;
        }
        const actual = Number(a.replace(/[₱,%\s]/g, ""));
        const target = t === "" ? null : Number(t.replace(/[₱,%\s]/g, ""));
        if (!Number.isFinite(actual) || (target != null && !Number.isFinite(target))) throw new Error(`"${m.name}" needs a number.`);
        upserts.push({ company_id: company.id, measure_code: m.code, period, actual, target, source: "manual", updated_at: new Date().toISOString() });
      }
      if (upserts.length) {
        const { error } = await supabase.from("kpi_actuals").upsert(upserts);
        if (error) throw error;
      }
      if (deletes.length) {
        const { error } = await supabase
          .from("kpi_actuals")
          .delete()
          .eq("company_id", company.id)
          .eq("period", period)
          .in("measure_code", deletes);
        if (error) throw error;
      }
      return upserts.length + deletes.length;
    },
    onSuccess: (n) => {
      toast.success(`Saved ${n} ${n === 1 ? "figure" : "figures"} for ${company.name}, ${monthLabel(period)}.`);
      void qc.invalidateQueries({ queryKey: BOARD_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-4">
      {[...data.categories]
        .sort((a, b) => a.sort - b.sort)
        .map((cat) => {
          const measures = data.measures.filter((m) => m.category_code === cat.code).sort((a, b) => a.sort - b.sort);
          return (
            <Card key={cat.code}>
              <CardHeader title={cat.name} description={`Weight ${Number(cat.weight)}% · ${cat.target_text}`} />
              <ul className="divide-y divide-mist-200">
                {measures.map((m) => {
                  const cm = cmBy.get(m.code);
                  const system = cm?.source === "system";
                  const applicable = cm?.applicable ?? true;
                  const standing = targetFor(m, cm, null);
                  const locked = system || !editable || !applicable;
                  return (
                    <li key={m.code} className={cn("grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[1fr_170px_170px] md:items-center", !applicable && "opacity-50")}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">
                          {m.name}
                          {system && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                              <RefreshCw className="size-3" /> From the NAM Supply system
                            </span>
                          )}
                          {!applicable && <span className="ml-2 text-xs font-normal text-ink-muted">Doesn't apply to {company.name}</span>}
                        </p>
                        {m.help && <p className="mt-0.5 text-xs text-ink-muted">{m.help}</p>}
                      </div>
                      <NumberBox
                        label="Target"
                        unit={m.unit}
                        value={draft[m.code]?.target ?? ""}
                        placeholder={
                          m.direction === "band"
                            ? `±${m.band}`
                            : standing != null
                              ? standing.toLocaleString("en-PH")
                              : "Set a target"
                        }
                        disabled={locked || m.direction === "band"}
                        onChange={(v) => setDraft((d) => ({ ...d, [m.code]: { ...d[m.code], target: v } }))}
                      />
                      <NumberBox
                        label="Result"
                        unit={m.unit}
                        value={draft[m.code]?.actual ?? ""}
                        placeholder="—"
                        disabled={locked}
                        onChange={(v) => setDraft((d) => ({ ...d, [m.code]: { ...d[m.code], actual: v } }))}
                      />
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}

      {editable && (
        <div className="sticky bottom-[calc(var(--mobile-nav-space)+0.5rem)] z-20 flex items-center justify-between gap-3 rounded-2xl border border-mist-200 bg-white/95 px-4 py-3 shadow-level-3 backdrop-blur lg:bottom-4">
          <p className="text-sm text-ink-muted">
            {changed.length ? `${changed.length} unsaved ${changed.length === 1 ? "change" : "changes"}` : "Nothing to save"}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={!changed.length || save.isPending} onClick={() => setDraft(initial)}>
              Undo
            </Button>
            <Button disabled={!changed.length} loading={save.isPending} onClick={() => save.mutate()}>
              Save {monthLabel(period, "MMMM")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function NumberBox({
  label,
  unit,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  unit: MeasureDef["unit"];
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">
        {label}
        {disabled && <Lock className="size-3" aria-hidden />}
      </span>
      <span className="relative block">
        <Input
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cn("pr-10 tabular-nums", unit === "php" && "pl-7")}
        />
        {unit === "php" ? (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-ink-muted">₱</span>
        ) : (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-muted">{UNIT_HINT[unit]}</span>
        )}
      </span>
    </label>
  );
}
