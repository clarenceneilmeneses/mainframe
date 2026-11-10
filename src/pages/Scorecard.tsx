import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { BOARD_KEY, DEV_SNAPSHOT, scorecardFor, type BoardData } from "../lib/board";
import type { MeasureDef } from "../lib/scoring";
import { errorMessage, supabase } from "../lib/supabase";
import { unitValue } from "../lib/format";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/utils";
import { Button, Card, CardHeader, Input, PageHeader, Tabs } from "../components/ui";
import { HowItScores } from "../components/HowItScores";
import { BoardGate } from "../components/board-bits";

const RULE: Record<MeasureDef["direction"], string> = {
  higher: "Higher is better",
  lower: "At or under target",
  band: "Within the band",
};

export default function Scorecard() {
  return (
    <>
      <PageHeader
        eyebrow="Manage"
        title="Targets"
        description="What each business is aiming for, on its own scorecard. Change a target here and every score that uses it updates."
      />
      <BoardGate>
        {(d) => (
          <div className="space-y-6">
            <Targets data={d} />
            <HowItScores />
          </div>
        )}
      </BoardGate>
    </>
  );
}

/** One measure's draft. `quarters` is Q1–Q4, or null for one target all year. */
type Cell = { target: string; applicable: boolean; quarters: string[] | null };

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

const toNum = (t: string) => {
  const v = t.trim().replace(/[₱,%\s]/g, "");
  return v === "" ? null : Number(v);
};

function Targets({ data }: { data: BoardData }) {
  const { role } = useAuth();
  const owner = DEV_SNAPSHOT || role === "owner";
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const company = data.companies.find((c) => c.slug === params.get("c")) ?? data.companies[0];
  const sc = useMemo(() => (company ? scorecardFor(data, company.id) : null), [data, company]);

  const initial = useMemo(() => {
    const o: Record<string, Cell> = {};
    if (!company || !sc) return o;
    for (const m of sc.measures) {
      const cm = data.companyMeasures.find((x) => x.company_id === company.id && x.measure_code === m.code);
      // Pesos with their commas (3,000,000); toNum takes them off again on save.
      const show = (t: number | null | undefined) => (t == null ? "" : m.unit === "php" ? Number(t).toLocaleString("en-PH") : String(t));
      o[m.code] = {
        target: show(cm?.target),
        applicable: cm?.applicable ?? true,
        quarters: cm?.quarter_targets?.length === 4 ? cm.quarter_targets.map(show) : null,
      };
    }
    return o;
  }, [data.companyMeasures, company, sc]);
  const [draft, setDraft] = useState(initial);
  useEffect(() => setDraft(initial), [initial]);
  const cell = (m: string): Cell => draft[m] ?? { target: "", applicable: true, quarters: null };
  const set = (m: string, patch: Partial<Cell>) => setDraft((d) => ({ ...d, [m]: { ...cell(m), ...patch } }));
  const same = (a: Cell, b: Cell | undefined) =>
    !!b && a.target === b.target && a.applicable === b.applicable && JSON.stringify(a.quarters) === JSON.stringify(b.quarters);
  const changed = Object.keys(draft).filter((k) => !same(draft[k], initial[k]));

  const save = useMutation({
    mutationFn: async () => {
      if (DEV_SNAPSHOT) throw new Error("Saving is off in the local preview.");
      if (!company) return 0;
      const rows = changed.map((code) => {
        const c = draft[code];
        const target = toNum(c.target);
        const quarter_targets = c.quarters ? c.quarters.map(toNum) : null;
        if ((target != null && !Number.isFinite(target)) || quarter_targets?.some((q) => q != null && !Number.isFinite(q)))
          throw new Error("Targets must be numbers.");
        return {
          company_id: company.id,
          measure_code: code,
          target,
          applicable: c.applicable,
          // All four blank is the same as one target all year.
          quarter_targets: quarter_targets?.every((q) => q == null) ? null : quarter_targets,
        };
      });
      // Upsert: a business added later may not have a row for every measure yet.
      const { error } = await supabase.from("company_measures").upsert(rows, { onConflict: "company_id,measure_code" });
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(`Saved ${n} ${n === 1 ? "target" : "targets"} for ${company?.name}.`);
      void qc.invalidateQueries({ queryKey: BOARD_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!company || !sc) return null;
  const pick = (slug: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("c", slug);
        return next;
      },
      { replace: true },
    );
  const cats = [...sc.categories].sort((a, b) => a.sort - b.sort);
  const totalWeight = cats.reduce((a, c) => a + Number(c.weight), 0);
  const unset = sc.measures.filter((m) => {
    const c = cell(m.code);
    return (
      c.applicable &&
      m.direction !== "band" &&
      m.default_target == null &&
      toNum(c.target) == null &&
      !c.quarters?.some((q) => toNum(q) != null)
    );
  });

  return (
    <div className="space-y-4">
      <Tabs value={company.slug} onChange={pick} items={data.companies.map((c) => ({ value: c.slug, label: c.name }))} />
      <Card>
        <CardHeader
          title={`${company.name} — ${sc.scorecard?.name ?? "KPI scorecard"}`}
          description={
            owner
              ? `${cats.length} categories, weights total ${totalWeight}. A blank target uses the scorecard default. Untick a measure that doesn't apply to ${company.name}; it drops out of its score.`
              : "Only the owner can change targets."
          }
        />
        {unset.length > 0 && (
          <p className="mx-5 mb-3 rounded-xl bg-watch-50 px-3.5 py-2.5 text-[13px] text-ink-soft">
            <b className="font-semibold text-ink">
              {unset.length} {unset.length === 1 ? "measure has" : "measures have"} no target yet
            </b>
            , so {unset.length === 1 ? "it" : "they"} can't be scored: {unset.map((m) => m.name).join(" · ")}.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-mist-50 text-[11px] tracking-[0.12em] text-ink-muted uppercase">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Measure</th>
                <th className="px-3 py-2.5 font-semibold">Rule</th>
                <th className="px-3 py-2.5 font-semibold">Default</th>
                <th className="px-3 py-2.5 font-semibold">Applies</th>
                <th className="px-5 py-2.5 font-semibold">Monthly target</th>
              </tr>
            </thead>
            {cats.map((cat) => (
              <tbody key={cat.code} className="divide-y divide-mist-200 border-t border-mist-200">
                <tr className="bg-mist-50/60">
                  <td colSpan={5} className="px-5 py-2 text-[13px] font-semibold text-ink">
                    {cat.name} <span className="font-normal text-ink-muted">· weight {Number(cat.weight)}</span>
                    <span className="block text-xs font-normal text-ink-muted">{cat.target_text}</span>
                  </td>
                </tr>
                {sc.measures
                  .filter((m) => m.category_code === cat.code)
                  .sort((a, b) => a.sort - b.sort)
                  .map((m) => {
                    const v = cell(m.code);
                    const cm = data.companyMeasures.find((x) => x.company_id === company.id && x.measure_code === m.code);
                    const locked = !owner || !v.applicable || m.direction === "band";
                    const fallback =
                      m.direction === "band" ? "—" : m.default_target != null ? unitValue(m.default_target, m.unit) : "Not set";
                    return (
                      <tr key={m.code} className="align-top">
                        <td className="px-5 py-2.5">
                          <span className="text-ink">{m.name}</span>
                          {cm?.source === "system" && (
                            <span
                              className="ml-2 text-[10px] font-semibold tracking-wide text-brand-700 uppercase"
                              title="Synced from the NAM Supply system"
                            >
                              Sync
                            </span>
                          )}
                          {m.help && <span className="block max-w-[360px] text-xs text-ink-muted">{m.help}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-ink-muted">{RULE[m.direction]}</td>
                        <td className="px-3 py-2.5 text-ink-soft tabular-nums">
                          {m.direction === "band"
                            ? `±${unitValue(m.band, m.unit)}`
                            : m.default_target != null
                              ? unitValue(m.default_target, m.unit)
                              : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={v.applicable}
                            disabled={!owner}
                            onChange={(e) => set(m.code, { applicable: e.target.checked })}
                            className="size-4 accent-brand-700"
                            aria-label={`${m.name} applies to ${company.name}`}
                          />
                        </td>
                        <td className={cn("px-5 py-2", !v.applicable && "opacity-50")}>
                          {v.quarters ? (
                            <div className="flex items-end gap-1.5">
                              {QUARTERS.map((q, i) => (
                                <label key={q} className="block">
                                  <span className="mb-0.5 block text-[10px] font-semibold tracking-wide text-ink-muted uppercase">{q}</span>
                                  <Input
                                    value={v.quarters![i] ?? ""}
                                    inputMode="decimal"
                                    disabled={locked}
                                    placeholder={v.target || fallback}
                                    onChange={(e) => set(m.code, { quarters: v.quarters!.map((x, j) => (j === i ? e.target.value : x)) })}
                                    className="h-8 w-[92px] px-2 text-[13px] tabular-nums"
                                    aria-label={`${m.name} ${q} target for ${company.name}`}
                                  />
                                </label>
                              ))}
                            </div>
                          ) : (
                            <Input
                              value={v.target}
                              inputMode="decimal"
                              disabled={locked}
                              placeholder={fallback}
                              onChange={(e) => set(m.code, { target: e.target.value })}
                              className="h-8 w-36 text-[13px] tabular-nums"
                              aria-label={`${m.name} target for ${company.name}`}
                            />
                          )}
                          {owner && m.unit === "php" && v.applicable && (
                            <button
                              type="button"
                              onClick={() => set(m.code, { quarters: v.quarters ? null : [v.target, v.target, v.target, v.target] })}
                              className="mt-1 block cursor-pointer text-xs font-medium text-brand-700 hover:underline"
                            >
                              {v.quarters ? "Same target all year" : "Different by quarter"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            ))}
          </table>
        </div>
        {owner && (
          <div className="flex items-center justify-end gap-2 border-t border-mist-200 px-5 py-3">
            <span className="mr-auto text-sm text-ink-muted">{changed.length ? `${changed.length} unsaved` : ""}</span>
            <Button variant="secondary" disabled={!changed.length} onClick={() => setDraft(initial)}>
              Undo
            </Button>
            <Button disabled={!changed.length} loading={save.isPending} onClick={() => save.mutate()}>
              Save targets
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
