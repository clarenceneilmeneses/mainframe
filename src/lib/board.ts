import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, startOfMonth, subMonths } from "date-fns";
import { supabase } from "./supabase";
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

/** Local preview only: `VITE_DEV_SNAPSHOT=1 npm run dev` reads public/dev-snapshot.json (gitignored). */
export const DEV_SNAPSHOT = import.meta.env.DEV && import.meta.env.VITE_DEV_SNAPSHOT === "1";

export const BOARD_KEY = ["board"] as const;

async function fetchBoard(): Promise<BoardData> {
  if (DEV_SNAPSHOT) {
    const res = await fetch("/dev-snapshot.json");
    if (!res.ok) throw new Error("No dev snapshot. Run: npm run sync:nam -- --snapshot");
    return (await res.json()) as BoardData;
  }
  const [companies, categories, measures, companyMeasures, actuals] = await Promise.all([
    supabase.from("companies").select("*").order("sort"),
    supabase.from("kpi_categories").select("*").order("sort"),
    supabase.from("kpi_measures").select("*").order("sort"),
    supabase.from("company_measures").select("*"),
    supabase.from("kpi_actuals").select("*").order("period"),
  ]);
  for (const r of [companies, categories, measures, companyMeasures, actuals]) if (r.error) throw r.error;
  const num = <T extends object>(rows: T[], keys: (keyof T)[]) =>
    rows.map((r) => {
      const o = { ...r };
      for (const k of keys) if (o[k] != null) (o as Record<keyof T, unknown>)[k] = Number(o[k]);
      return o;
    });
  return {
    companies: companies.data as Company[],
    categories: num(categories.data as CategoryDef[], ["weight"]),
    measures: num(measures.data as MeasureDef[], ["default_target", "band"]),
    companyMeasures: num(companyMeasures.data as CompanyMeasure[], ["target"]),
    actuals: num(actuals.data as Actual[], ["actual", "target"]),
  };
}

export function useBoard() {
  return useQuery({ queryKey: BOARD_KEY, queryFn: fetchBoard, staleTime: 60_000 });
}

export function companyScore(data: BoardData, companyId: string, period: string): CompanyScore {
  return scoreCompany({
    categories: data.categories,
    measures: data.measures,
    companyMeasures: data.companyMeasures.filter((c) => c.company_id === companyId),
    actuals: data.actuals.filter((a) => a.company_id === companyId && a.period === period),
  });
}

export const thisMonth = () => format(startOfMonth(new Date()), "yyyy-MM-dd");

/** Months to offer in the picker: every month with a result, plus the current one, newest first. */
export function periodsOf(data: BoardData | undefined) {
  const set = new Set<string>([thisMonth()]);
  data?.actuals.forEach((a) => set.add(a.period));
  return [...set].sort().reverse();
}

/** The month the board opens on: the newest month that has any result, else this month. */
export function defaultPeriod(data: BoardData | undefined) {
  const withData = [...new Set(data?.actuals.map((a) => a.period) ?? [])].sort();
  return withData.at(-1) ?? thisMonth();
}

/** The last `n` months ending at `period`, oldest first. */
export function monthsEnding(period: string, n: number) {
  const end = parseISO(period);
  return Array.from({ length: n }, (_, i) => format(subMonths(end, n - 1 - i), "yyyy-MM-dd"));
}

export function useCompanyTrend(data: BoardData | undefined, companyId: string | undefined, period: string, n = 6) {
  return useMemo(() => {
    if (!data || !companyId) return [];
    return monthsEnding(period, n).map((p) => {
      const s = companyScore(data, companyId, p);
      return { period: p, label: format(parseISO(p), "MMM"), score: s.score, coverage: s.coverage };
    });
  }, [data, companyId, period, n]);
}

/** The latest time a system figure for this business was written. */
export function lastSync(data: BoardData, companyId: string) {
  const rows = data.actuals.filter((a) => a.company_id === companyId && a.source === "system");
  return rows.reduce<string | null>((max, r) => (!max || r.updated_at > max ? r.updated_at : max), null);
}

export function prevPeriod(period: string) {
  return format(subMonths(parseISO(period), 1), "yyyy-MM-dd");
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

/** The average score of the businesses that reported this month. */
export function groupScore(data: BoardData, period: string) {
  const scores = data.companies.map((c) => companyScore(data, c.id, period).score).filter((s): s is number => s != null);
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}

/** One measure, month by month, for a drill-down chart. */
export function measureSeries(data: BoardData, companyId: string, measureCode: string, period: string, n = 12) {
  const def = data.measures.find((m) => m.code === measureCode);
  const cm = data.companyMeasures.find((x) => x.company_id === companyId && x.measure_code === measureCode);
  return monthsEnding(period, n).map((p) => {
    const row = data.actuals.find((a) => a.company_id === companyId && a.measure_code === measureCode && a.period === p);
    return {
      period: p,
      label: format(parseISO(p), "MMM"),
      value: row ? Number(row.actual) : null,
      target: row?.target ?? cm?.target ?? def?.default_target ?? null,
    };
  });
}
