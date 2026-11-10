import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarMonths, format, parseISO, startOfMonth, subMonths, addMonths } from "date-fns";
import { supabase } from "./supabase";
import { viewToken } from "./view-link";
import { compute, countsOf, FORMULAS } from "./formulas";
import {
  pickScorecard,
  scoreCompany,
  statusOf,
  targetFor,
  type Actual,
  type CategoryDef,
  type CompanyMeasure,
  type CompanyScore,
  type MeasureDef,
  type ScorecardDef,
} from "./scoring";

export interface Company {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  description: string | null;
  data_source: string | null;
  sort: number;
  /** The scorecard it is judged on (supabase/03_scorecards.sql). */
  scorecard_code?: string | null;
}

export interface BoardData {
  /** Empty on a database from before 03_scorecards.sql. */
  scorecards: ScorecardDef[];
  companies: Company[];
  categories: CategoryDef[];
  measures: MeasureDef[];
  companyMeasures: CompanyMeasure[];
  actuals: Actual[];
}

/** A span of whole months, both ends inclusive, as "yyyy-MM-01". A single month has from === to. */
export interface Range {
  from: string;
  to: string;
}

/** Local preview only: `VITE_DEV_SNAPSHOT=1 npm run dev` reads public/dev-snapshot.json (gitignored). */
export const DEV_SNAPSHOT = import.meta.env.DEV && import.meta.env.VITE_DEV_SNAPSHOT === "1";

export const BOARD_KEY = ["board"] as const;

export class PrivateBoardError extends Error {}

async function fetchBoard(): Promise<BoardData> {
  if (DEV_SNAPSHOT) {
    const res = await fetch("/dev-snapshot.json");
    if (!res.ok) throw new Error("No dev snapshot. Run: npm run sync:nam -- --snapshot");
    return normalise((await res.json()) as BoardData);
  }
  // One call for everything. Members read as themselves; anyone else needs the
  // private view link's token (supabase/02_view_links.sql).
  const { data, error } = await supabase.rpc("board_data", { p_token: viewToken() });
  if (error) {
    if (error.code === "42501") throw new PrivateBoardError(error.message);
    throw error;
  }
  return normalise(data as BoardData);
}

/** Numbers come back from Postgres numerics as strings; the snapshot may predate scorecards. */
function normalise(raw: BoardData): BoardData {
  const num = <T extends object>(rows: T[], keys: (keyof T)[]) =>
    rows.map((r) => {
      const o = { ...r };
      for (const k of keys) if (o[k] != null) (o as Record<keyof T, unknown>)[k] = Number(o[k]);
      return o;
    });
  return {
    scorecards: raw.scorecards ?? [],
    companies: raw.companies,
    categories: num(raw.categories, ["weight", "sort"]),
    measures: num(raw.measures, ["default_target", "band", "sort"]),
    companyMeasures: num(raw.companyMeasures, ["target"]).map((cm) => ({
      ...cm,
      quarter_targets: cm.quarter_targets ? cm.quarter_targets.map((t) => (t == null ? (null as unknown as number) : Number(t))) : null,
    })),
    actuals: num(raw.actuals, ["actual", "target"]),
  };
}

/** The scorecard a business is judged on, with just its categories and measures. */
export function scorecardFor(data: BoardData, companyId: string) {
  const company = data.companies.find((c) => c.id === companyId);
  const code = company?.scorecard_code ?? null;
  const { categories, measures } = pickScorecard(code, data.categories, data.measures);
  const scorecard = data.scorecards.find((s) => s.code === code) ?? null;
  return { scorecard, categories, measures };
}

/** "2027 KPI scorecard", or a plain fallback before 03_scorecards.sql. */
export function scorecardName(data: BoardData, companyId: string) {
  return scorecardFor(data, companyId).scorecard?.name ?? "KPI scorecard";
}

/** Short label for a category on the board's grid. */
export function shortName(c: CategoryDef) {
  return c.short_name ?? LEGACY_SHORT[c.code] ?? c.name;
}

const LEGACY_SHORT: Record<string, string> = {
  sales: "Sales",
  finance: "Finance",
  projects: "Projects",
  procurement: "Procurement",
  supply: "Delivery",
  quality: "Quality",
  hr: "People",
  governance: "Governance",
  customer: "Customers",
};

/**
 * The money measure a business's page charts month by month: the first peso
 * measure on its scorecard (sales for NAM Supply and Trading, revenue for ALM).
 */
export function headlineMeasure(data: BoardData, companyId: string): MeasureDef | null {
  const { categories, measures } = scorecardFor(data, companyId);
  const order = new Map(categories.map((c) => [c.code, c.sort]));
  return (
    [...measures]
      .filter((m) => m.unit === "php" && m.direction === "higher")
      .sort((a, b) => (order.get(a.category_code) ?? 0) - (order.get(b.category_code) ?? 0) || a.sort - b.sort)[0] ?? null
  );
}

export function useBoard() {
  return useQuery({ queryKey: BOARD_KEY, queryFn: fetchBoard, staleTime: 60_000, retry: (n, e) => !(e instanceof PrivateBoardError) && n < 1 });
}

// ---------------------------------------------------------------------------
// Months and ranges
// ---------------------------------------------------------------------------

export const thisMonth = () => format(startOfMonth(new Date()), "yyyy-MM-dd");
const iso = (d: Date) => format(d, "yyyy-MM-dd");

export function monthsIn(r: Range) {
  const n = differenceInCalendarMonths(parseISO(r.to), parseISO(r.from)) + 1;
  return Array.from({ length: Math.max(1, n) }, (_, i) => iso(addMonths(parseISO(r.from), i)));
}

/** The same number of months, just before. */
export function previousRange(r: Range): Range {
  const n = monthsIn(r).length;
  return { from: iso(subMonths(parseISO(r.from), n)), to: iso(subMonths(parseISO(r.from), 1)) };
}

export function shiftRange(r: Range, by: number): Range {
  const n = monthsIn(r).length * by;
  return { from: iso(addMonths(parseISO(r.from), n)), to: iso(addMonths(parseISO(r.to), n)) };
}

/** First and last month that have any result. */
export function dataSpan(data: BoardData | undefined) {
  const ps = [...new Set(data?.actuals.map((a) => a.period) ?? [])].sort();
  return ps.length ? { first: ps[0], last: ps[ps.length - 1] } : null;
}

/**
 * The month the board opens on: the newest finished month that has any result.
 * The month still running is skipped while an earlier one exists, because ten
 * days of sales against a whole month's target reads as a collapse.
 */
export function defaultPeriod(data: BoardData | undefined) {
  const span = dataSpan(data);
  if (!span) return thisMonth();
  const now = thisMonth();
  const finished = [...new Set(data?.actuals.map((a) => a.period) ?? [])].filter((p) => p < now).sort();
  return finished.length ? finished[finished.length - 1] : span.last;
}

/** The last `n` months ending at `period`, oldest first. */
export function monthsEnding(period: string, n: number) {
  const end = parseISO(period);
  return Array.from({ length: n }, (_, i) => iso(subMonths(end, n - 1 - i)));
}

// ---------------------------------------------------------------------------
// Scoring over a month or a span of months
// ---------------------------------------------------------------------------

type Breakdown = { title: string; unit: "php" | "pct"; rows: { label: string; value: number }[] };

/**
 * One figure per measure for a span of months:
 *  - peso measures add up, against the targets added up (Jan–Jul sales vs 7 × the monthly target);
 *  - collections and gross margin are worked out again from the combined totals when the sync left them;
 *  - everything else is the average of the months that have a figure, against the average target.
 */
function aggregate(data: BoardData, companyId: string, months: string[]): Actual[] {
  const set = new Set(months);
  const rows = data.actuals.filter((a) => a.company_id === companyId && set.has(a.period));
  if (months.length === 1) return rows;
  const byMeasure = new Map<string, Actual[]>();
  rows.forEach((r) => byMeasure.set(r.measure_code, [...(byMeasure.get(r.measure_code) ?? []), r]));

  const out: Actual[] = [];
  for (const [code, list] of byMeasure) {
    const def = data.measures.find((m) => m.code === code);
    if (!def) continue;
    const cm = data.companyMeasures.find((x) => x.company_id === companyId && x.measure_code === code);
    const monthTarget = (r: Actual) => targetFor(def, cm, r);
    const sum = (f: (r: Actual) => number | null | undefined) => list.reduce((a, r) => a + Number(f(r) ?? 0), 0);
    const targets = list.map(monthTarget).filter((t): t is number => t != null);

    const detail = mergeDetail(list);
    let actual: number;
    let target: number | null;
    if (def.unit === "php") {
      actual = sum((r) => r.actual);
      target = targets.length === list.length ? targets.reduce((a, b) => a + b, 0) : null;
    } else if (code === "collections" && detail.amount_due) {
      actual = (Number(detail.collected ?? 0) / Number(detail.amount_due)) * 100;
      target = targets.length ? targets.reduce((a, b) => a + b, 0) / targets.length : null;
    } else if (code === "gross_margin" && detail.sales) {
      actual = (Number(detail.income ?? 0) / Number(detail.sales)) * 100;
      target = targets.length ? targets.reduce((a, b) => a + b, 0) / targets.length : null;
    } else {
      // Results typed in as counts (19 of 20) are worked out again from the counts added up,
      // which is the true figure for the span; a plain average would let a quiet month count as much as a busy one.
      const formula = FORMULAS[code];
      const counted = formula && list.every((r) => countsOf(r.detail)) ? compute(formula.kind, Number(detail.num), Number(detail.den)) : null;
      actual = counted ?? sum((r) => r.actual) / list.length;
      target = targets.length ? targets.reduce((a, b) => a + b, 0) / targets.length : null;
    }
    // Counts only explain the figure when every month has them.
    if (!list.every((r) => countsOf(r.detail))) {
      delete detail.num;
      delete detail.den;
    }
    const last = list.reduce((a, b) => (b.updated_at > a.updated_at ? b : a));
    out.push({ ...last, period: months[0], actual, target, detail: { ...detail, months_reported: list.length } });
  }
  return out;
}

const SUMMABLE = ["sales_rows", "income", "sales", "amount_due", "collected", "lines_due", "quote_lines", "num", "den"];

function mergeDetail(list: Actual[]) {
  const out: Record<string, unknown> = {};
  for (const k of SUMMABLE) {
    const vals = list.map((r) => (r.detail as Record<string, unknown> | null)?.[k]).filter((v) => typeof v === "number") as number[];
    if (vals.length) out[k] = vals.reduce((a, b) => a + b, 0);
  }
  // Peso breakdowns add up label by label; percentage ones don't, so they're left out of a span.
  const merged = new Map<string, Map<string, number>>();
  for (const r of list) {
    for (const b of ((r.detail as { breakdowns?: Breakdown[] } | null)?.breakdowns ?? []).filter((x) => x.unit === "php")) {
      const m = merged.get(b.title) ?? new Map<string, number>();
      b.rows.forEach((row) => m.set(row.label, (m.get(row.label) ?? 0) + row.value));
      merged.set(b.title, m);
    }
  }
  out.breakdowns = [...merged].map(([title, m]) => {
    const rows = [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    const other = rows.filter((r) => r.label === "Everything else");
    const named = rows.filter((r) => r.label !== "Everything else");
    return { title, unit: "php", rows: [...named.slice(0, 6), ...other] } satisfies Breakdown;
  });
  return out as Record<string, number | Breakdown[] | undefined> & { breakdowns: Breakdown[] };
}

const asRange = (p: string | Range): Range => (typeof p === "string" ? { from: p, to: p } : p);

export function companyScore(data: BoardData, companyId: string, period: string | Range): CompanyScore {
  const { categories, measures } = scorecardFor(data, companyId);
  const months = monthsIn(asRange(period));
  return scoreCompany({
    categories,
    measures,
    companyMeasures: data.companyMeasures.filter((c) => c.company_id === companyId),
    actuals: aggregate(data, companyId, months),
    period: months[0],
  });
}

/** How many of a business's measures are on target, to watch, off, or not in yet. */
export function measureCounts(s: CompanyScore) {
  const ms = s.categories.flatMap((c) => c.measures).filter((m) => m.applicable);
  const counts = { on: 0, watch: 0, off: 0, missing: 0 };
  for (const m of ms) {
    if (m.attainment == null) counts.missing++;
    else counts[statusOf(m.attainment * 100) as "on" | "watch" | "off"]++;
  }
  return counts;
}

/** The average score of the businesses that reported. */
export function groupScore(data: BoardData, period: string | Range) {
  const scores = data.companies.map((c) => companyScore(data, c.id, period).score).filter((s): s is number => s != null);
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}

/** Score month by month, for trend charts: the months of the range, or the 12 ending at its end when shorter. */
export function trendMonths(r: Range, min = 12) {
  const inRange = monthsIn(r);
  return inRange.length >= min ? inRange : monthsEnding(r.to, min);
}

export function useCompanyTrend(data: BoardData | undefined, companyId: string | undefined, r: Range) {
  return useMemo(() => {
    if (!data || !companyId) return [];
    return trendMonths(r).map((p) => {
      const s = companyScore(data, companyId, p);
      return { period: p, label: format(parseISO(p), "MMM yy"), score: s.score, coverage: s.coverage };
    });
  }, [data, companyId, r.from, r.to]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** One measure, month by month, for a drill-down chart. */
export function measureSeries(data: BoardData, companyId: string, measureCode: string, r: Range) {
  const def = data.measures.find((m) => m.code === measureCode);
  const cm = data.companyMeasures.find((x) => x.company_id === companyId && x.measure_code === measureCode);
  return trendMonths(r).map((p) => {
    const row = data.actuals.find((a) => a.company_id === companyId && a.measure_code === measureCode && a.period === p);
    return {
      period: p,
      label: format(parseISO(p), "MMM"),
      value: row ? Number(row.actual) : null,
      target: def ? targetFor(def, cm, row ?? null, p) : null,
    };
  });
}

/** The latest time a system figure for this business was written. */
export function lastSync(data: BoardData, companyId: string) {
  const rows = data.actuals.filter((a) => a.company_id === companyId && a.source === "system");
  return rows.reduce<string | null>((max, r) => (!max || r.updated_at > max ? r.updated_at : max), null);
}
