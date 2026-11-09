import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarMonths, format, parseISO, startOfMonth, subMonths, addMonths } from "date-fns";
import { supabase } from "./supabase";
import { viewToken } from "./view-link";
import {
  scoreCompany,
  statusOf,
  type Actual,
  type CategoryDef,
  type CompanyMeasure,
  type CompanyScore,
  type MeasureDef,
} from "./scoring";

export interface Company {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  description: string | null;
  data_source: string | null;
  sort: number;
}

export interface BoardData {
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
    return (await res.json()) as BoardData;
  }
  // One call for everything. Members read as themselves; anyone else needs the
  // private view link's token (supabase/02_view_links.sql).
  const { data, error } = await supabase.rpc("board_data", { p_token: viewToken() });
  if (error) {
    if (error.code === "42501") throw new PrivateBoardError(error.message);
    throw error;
  }
  const raw = data as BoardData;
  const num = <T extends object>(rows: T[], keys: (keyof T)[]) =>
    rows.map((r) => {
      const o = { ...r };
      for (const k of keys) if (o[k] != null) (o as Record<keyof T, unknown>)[k] = Number(o[k]);
      return o;
    });
  return {
    companies: raw.companies,
    categories: num(raw.categories, ["weight"]),
    measures: num(raw.measures, ["default_target", "band"]),
    companyMeasures: num(raw.companyMeasures, ["target"]),
    actuals: num(raw.actuals, ["actual", "target"]),
  };
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

/** The month the board opens on: the newest month that has any result, else this month. */
export function defaultPeriod(data: BoardData | undefined) {
  return dataSpan(data)?.last ?? thisMonth();
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
    const monthTarget = (r: Actual) => r.target ?? cm?.target ?? def.default_target;
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
      actual = sum((r) => r.actual) / list.length;
      target = targets.length ? targets.reduce((a, b) => a + b, 0) / targets.length : null;
    }
    const last = list.reduce((a, b) => (b.updated_at > a.updated_at ? b : a));
    out.push({ ...last, period: months[0], actual, target, detail: { ...detail, months_reported: list.length } });
  }
  return out;
}

const SUMMABLE = ["sales_rows", "income", "sales", "amount_due", "collected", "lines_due", "quote_lines"];

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
  return scoreCompany({
    categories: data.categories,
    measures: data.measures,
    companyMeasures: data.companyMeasures.filter((c) => c.company_id === companyId),
    actuals: aggregate(data, companyId, monthsIn(asRange(period))),
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
      target: row?.target ?? cm?.target ?? def?.default_target ?? null,
    };
  });
}

/** The latest time a system figure for this business was written. */
export function lastSync(data: BoardData, companyId: string) {
  const rows = data.actuals.filter((a) => a.company_id === companyId && a.source === "system");
  return rows.reduce<string | null>((max, r) => (!max || r.updated_at > max ? r.updated_at : max), null);
}
