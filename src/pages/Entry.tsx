import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Lock, RefreshCw } from "lucide-react";
import { BOARD_KEY, DEV_SNAPSHOT, defaultPeriod, scorecardFor, useBoard, type BoardData, type Company } from "../lib/board";
import { scoreCompany, statusOf, targetFor, type Actual, type MeasureDef, type MeasureResult } from "../lib/scoring";
import { compute, countsOf, FORMULAS, JOINER } from "../lib/formulas";
import { errorMessage, supabase } from "../lib/supabase";
import { monthLabel } from "../lib/format";
import { canEdit, useAuth } from "../lib/auth";
import { cn } from "../lib/utils";
import { Button, Card, CardHeader, EmptyState, ErrorBox, Input, PageHeader, StatusBadge, Tabs } from "../components/ui";
import { BoardGate, MonthSelect } from "../components/board-bits";

const UNIT_HINT: Record<MeasureDef["unit"], string> = {
  php: "₱",
  pct: "%",
  ratio: "×",
  score5: "/ 5",
  count: "",
};

/** "" → null, "1,250" or "₱1,250" or "95%" → the number, anything else → NaN. */
function toNum(s: string | undefined): number | null {
  const t = (s ?? "").trim().replace(/[₱,%×\s]/g, "");
  return t === "" ? null : Number(t);
}

/**
 * Monthly results, by hand. Until each business's own system or sheet feeds
 * the board, this is where a month's figures go in. Most results are one count
 * out of another, so the page takes the two counts and works the figure out;
 * the score at the bottom follows along as you type. Figures that sync from a
 * system (NAM Supply's sales numbers) are shown but locked.
 */
export default function Entry() {
  const { data } = useBoard();
  const [params, setParams] = useSearchParams();
  // This page works one month at a time (?m=2026-07), defaulting to the newest month with results.
  const m = params.get("m");
  const period = m && /^\d{4}-\d{2}$/.test(m) ? `${m}-01` : defaultPeriod(data);
  const setParam = (k: string, v: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(k, v);
        return next;
      },
      { replace: true },
    );
  const { session } = useAuth();
  const location = useLocation();
  const slug = params.get("c") ?? data?.companies[0]?.slug ?? "";
  const company = data?.companies.find((c) => c.slug === slug) ?? data?.companies[0];
  const { role } = useAuth();
  const editable = DEV_SNAPSHOT || canEdit(role);

  return (
    <>
      <PageHeader
        eyebrow="Manage"
        title="Record results"
        description={
          <span className="block max-w-2xl">
            The figures for {monthLabel(period)}. Type the two counts and the result works itself out, or type the result straight in. Leave a box empty
            if you don't have it yet; it won't count against the score.
          </span>
        }
        actions={<MonthSelect value={period} onChange={(p) => setParam("m", p.slice(0, 7))} />}
      />
      {!DEV_SNAPSHOT && !session ? (
        <EmptyState
          icon={<KeyRound />}
          title="Sign in to record results"
          action={
            <Link
              to="/login"
              state={{ from: location.pathname + location.search }}
              className="inline-flex h-10 items-center rounded-xl bg-brand-700 px-4 text-sm font-medium text-mist-50 shadow-level-1 hover:bg-brand-700/90"
            >
              Sign in
            </Link>
          }
        >
          Anyone with the link can look at the board. Changing it needs an account.
        </EmptyState>
      ) : (
      <BoardGate>
        {(d) => (
          <div className="space-y-5">
            <Tabs
              value={company?.slug ?? ""}
              onChange={(v) => setParam("c", v)}
              items={d.companies.map((c) => ({ value: c.slug, label: c.name }))}
            />
            {!editable && (
              <ErrorBox>Your account can view results but not change them. Ask the owner for editor access.</ErrorBox>
            )}
            {company && <EntryForm key={`${company.id}:${period}`} data={d} company={company} period={period} editable={editable} />}
          </div>
        )}
      </BoardGate>
      )}
    </>
  );
}

interface Draft {
  actual: string;
  target: string;
  /** The two counts the result is worked out from, when it is. */
  top: string;
  bottom: string;
}

const EMPTY: Draft = { actual: "", target: "", top: "", bottom: "" };
const FIELDS = ["actual", "target", "top", "bottom"] as const;

function EntryForm({ data, company, period, editable }: { data: BoardData; company: Company; period: string; editable: boolean }) {
  const qc = useQueryClient();
  // Only this business's own scorecard.
  const sc = useMemo(() => scorecardFor(data, company.id), [data, company.id]);
  const companyMeasures = useMemo(() => data.companyMeasures.filter((c) => c.company_id === company.id), [data, company.id]);
  const cmBy = useMemo(() => new Map(companyMeasures.map((c) => [c.measure_code, c])), [companyMeasures]);
  const rowBy = useMemo(
    () => new Map(data.actuals.filter((a) => a.company_id === company.id && a.period === period).map((a) => [a.measure_code, a])),
    [data, company.id, period],
  );

  const initial = useMemo(() => {
    const o: Record<string, Draft> = {};
    for (const m of sc.measures) {
      const r = rowBy.get(m.code);
      const counts = FORMULAS[m.code] ? countsOf(r?.detail) : null;
      o[m.code] = {
        actual: r ? String(Number(r.actual)) : "",
        target: r?.target != null ? String(r.target) : "",
        top: counts ? String(counts.num) : "",
        bottom: counts ? String(counts.den) : "",
      };
    }
    return o;
  }, [sc.measures, rowBy]);
  const [draft, setDraft] = useState(initial);
  useEffect(() => setDraft(initial), [initial]);
  const get = (code: string) => draft[code] ?? EMPTY;

  const edit = (code: string, field: (typeof FIELDS)[number], value: string) =>
    setDraft((d) => {
      const cur = { ...(d[code] ?? EMPTY), [field]: value };
      const formula = FORMULAS[code];
      if (field === "actual") {
        // A result typed straight in isn't explained by the counts any more.
        cur.top = "";
        cur.bottom = "";
      } else if (formula && (field === "top" || field === "bottom")) {
        const t = toNum(cur.top);
        const b = toNum(cur.bottom);
        const v = t != null && b != null ? compute(formula.kind, t, b) : null;
        cur.actual = v == null ? "" : String(v);
      }
      return { ...d, [code]: cur };
    });

  const changed = sc.measures.filter(
    (m) => cmBy.get(m.code)?.source !== "system" && FIELDS.some((f) => get(m.code)[f] !== (initial[m.code]?.[f] ?? "")),
  );

  // The score these figures would give, worked out as you type.
  const live = useMemo(() => {
    const actuals: Actual[] = [];
    for (const m of sc.measures) {
      const a = toNum(draft[m.code]?.actual);
      if (a == null || !Number.isFinite(a)) continue;
      const t = toNum(draft[m.code]?.target);
      actuals.push({
        company_id: company.id,
        measure_code: m.code,
        period,
        actual: a,
        target: t != null && Number.isFinite(t) ? t : null,
        note: null,
        source: "manual",
        detail: null,
        updated_by: null,
        updated_at: "",
      });
    }
    return scoreCompany({ categories: sc.categories, measures: sc.measures, companyMeasures, actuals, period });
  }, [sc, companyMeasures, company.id, period, draft]);
  const saved = useMemo(
    () => scoreCompany({ categories: sc.categories, measures: sc.measures, companyMeasures, actuals: [...rowBy.values()], period }),
    [sc, companyMeasures, rowBy, period],
  );
  const filled = live.categories.flatMap((c) => c.measures).filter((m) => m.applicable && m.actual != null).length;

  const save = useMutation({
    mutationFn: async () => {
      if (DEV_SNAPSHOT) throw new Error("Saving is off in the local preview.");
      const upserts = [];
      const deletes: string[] = [];
      for (const m of changed) {
        const d = get(m.code);
        const actual = toNum(d.actual);
        const target = toNum(d.target);
        if (actual == null) {
          if (rowBy.has(m.code)) deletes.push(m.code);
          continue;
        }
        if (!Number.isFinite(actual) || (target != null && !Number.isFinite(target))) throw new Error(`"${m.name}" needs a number.`);
        const top = toNum(d.top);
        const bottom = toNum(d.bottom);
        const counted = FORMULAS[m.code] && top != null && bottom != null && Number.isFinite(top) && Number.isFinite(bottom);
        upserts.push({
          company_id: company.id,
          measure_code: m.code,
          period,
          actual,
          target,
          source: "manual",
          detail: counted ? { num: top, den: bottom } : null,
          updated_at: new Date().toISOString(),
        });
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
      {live.categories.map((cat) => (
        <Card key={cat.def.code}>
          <CardHeader
            title={cat.def.name}
            description={`Weight ${Number(cat.def.weight)}% · ${cat.def.target_text}`}
            action={
              <p className="shrink-0 text-right whitespace-nowrap tabular-nums">
                {cat.points != null ? (
                  <>
                    <span className="font-display text-base font-medium text-ink">{cat.points.toFixed(1)}</span>
                    <span className="text-xs text-ink-muted"> / {Number(cat.def.weight)} pts</span>
                  </>
                ) : (
                  <span className="text-xs text-ink-muted">{cat.applicable ? "No result yet" : "Doesn't apply"}</span>
                )}
              </p>
            }
          />
          <ul className="divide-y divide-mist-200">
            {cat.measures.map((mr) => {
              const m = mr.def;
              const cm = cmBy.get(m.code);
              const system = cm?.source === "system";
              const standing = targetFor(m, cm, null, period);
              const locked = system || !editable || !mr.applicable;
              const formula = FORMULAS[m.code];
              const d = get(m.code);
              const bottom = toNum(d.bottom);
              return (
                <li key={m.code} className={cn("grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[1fr_170px_170px] md:items-start", !mr.applicable && "opacity-50")}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {m.name}
                      {system && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                          <RefreshCw className="size-3" /> From the NAM Supply system
                        </span>
                      )}
                      {!mr.applicable && <span className="ml-2 text-xs font-normal text-ink-muted">Doesn't apply to {company.name}</span>}
                    </p>
                    {m.help && <p className="mt-0.5 text-xs text-ink-muted">{m.help}</p>}
                    {formula && !locked && (
                      <div className="mt-2.5 flex flex-wrap items-end gap-x-2 gap-y-1.5">
                        <CountBox label={formula.top} money={formula.money} value={d.top} onChange={(v) => edit(m.code, "top", v)} />
                        <span className="pb-2 text-xs text-ink-muted">{JOINER[formula.kind]}</span>
                        <CountBox label={formula.bottom} money={formula.money} value={d.bottom} onChange={(v) => edit(m.code, "bottom", v)} />
                        {bottom != null && bottom <= 0 && (
                          <p className="basis-full text-xs text-ink-muted">Nothing to measure this month, so it stays out of the score.</p>
                        )}
                      </div>
                    )}
                  </div>
                  <NumberBox
                    label="Target"
                    unit={m.unit}
                    value={d.target}
                    placeholder={
                      m.direction === "band"
                        ? `±${m.band}`
                        : standing != null
                          ? standing.toLocaleString("en-PH")
                          : "Set a target"
                    }
                    disabled={locked || m.direction === "band"}
                    onChange={(v) => edit(m.code, "target", v)}
                  />
                  <div>
                    <NumberBox label="Result" unit={m.unit} value={d.actual} placeholder="—" disabled={locked} onChange={(v) => edit(m.code, "actual", v)} />
                    <Verdict mr={mr} raw={d.actual} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      {editable && (
        <div className="sticky bottom-[calc(var(--mobile-nav-space)+0.5rem)] z-20 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-mist-200 bg-white/95 px-4 py-3 shadow-level-3 backdrop-blur lg:bottom-4">
          <div className="flex min-w-0 items-center gap-3">
            <p className="flex items-baseline gap-1.5 whitespace-nowrap">
              <span className={cn("size-2 self-center rounded-full", { on: "bg-good", watch: "bg-watch", off: "bg-off", none: "bg-mist-300" }[live.status])} aria-hidden />
              <span className="font-display text-xl text-ink tabular-nums">{live.score == null ? "—" : live.score.toFixed(1)}</span>
              <span className="text-xs text-ink-muted">score with these figures</span>
            </p>
            <p className="hidden min-w-0 truncate border-l border-mist-200 pl-3 text-xs text-ink-muted sm:block">
              {filled} of {live.measuresApplicable} filled in
              {saved.score != null && live.score != null && Math.abs(live.score - saved.score) >= 0.05 && ` · was ${saved.score.toFixed(1)}`}
              {changed.length > 0 && ` · ${changed.length} unsaved`}
            </p>
          </div>
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

/** Under a result: what it scores against its target, straight away. */
function Verdict({ mr, raw }: { mr: MeasureResult; raw: string }) {
  const typed = toNum(raw);
  if (typed != null && !Number.isFinite(typed)) return <p className="mt-1.5 text-xs text-off">That isn't a number.</p>;
  if (!mr.applicable || mr.actual == null) return null;
  if (mr.attainment == null) {
    return (
      <p className="mt-1.5 text-xs text-watch">
        Needs a target before it can score.{" "}
        <Link to="/scorecard" className="font-medium underline">
          Targets
        </Link>
      </p>
    );
  }
  const pct = mr.attainment * 100;
  return <StatusBadge status={statusOf(pct)} label={`${Math.round(pct)}% of target`} className="mt-1.5" />;
}

function CountBox({ label, money, value, onChange }: { label: string; money?: boolean; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-ink-muted">{label}</span>
      <span className="relative block">
        <Input
          inputMode="decimal"
          value={value}
          placeholder="0"
          onChange={(e) => onChange(e.target.value)}
          className={cn("h-9 w-[132px] text-[13px] tabular-nums", money && "pl-6")}
        />
        {money && <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[13px] text-ink-muted">₱</span>}
      </span>
    </label>
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
