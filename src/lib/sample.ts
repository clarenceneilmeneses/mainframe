import { useSyncExternalStore } from "react";
import { addMonths, differenceInCalendarMonths, format, getDaysInMonth, parseISO, startOfMonth, subMonths } from "date-fns";
import { targetFor, type Actual, type Unit } from "./scoring";
import type { BoardData } from "./board";

/*
 * Sample figures, so the board can be seen full before every business reports.
 *
 * Two things live here:
 *  - the top four headline numbers per business ("At a glance"). Each business
 *    will send its own four; until then they are made-up figures, labelled as such;
 *  - sample mode: every measure on every scorecard filled with believable
 *    results, for showing the board. Off by default; `?sample=1` turns it on for
 *    that device, `?sample=0` or the switch on the board turns it off.
 *
 * Every figure comes from a seeded random number per business, figure and
 * month, so the same month always shows the same sample.
 */

// ---------------------------------------------------------------------------
// The switch
// ---------------------------------------------------------------------------

const KEY = "mainframe:sample";
const listeners = new Set<() => void>();
let on = false;

function init() {
  try {
    on = localStorage.getItem(KEY) === "1";
  } catch {
    /* storage blocked: off */
  }
  const url = new URL(window.location.href);
  const p = url.searchParams.get("sample");
  if (p == null) return;
  setSample(p === "1" || p === "true");
  url.searchParams.delete("sample");
  window.history.replaceState(window.history.state, "", url.toString());
}
init();

export function sampleOn() {
  return on;
}

export function setSample(v: boolean) {
  on = v;
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    /* this visit only */
  }
  listeners.forEach((l) => l());
}

export function useSample(): [boolean, (v: boolean) => void] {
  const v = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => on,
  );
  return [v, setSample];
}

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

/** 0–1, the same every time for the same key. */
function rand(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  // mulberry32 on the hash, to spread nearby keys apart.
  let t = (h += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const nowMonth = () => iso(startOfMonth(new Date()));

/** How much of the month still running is done, for month-to-date amounts. */
function monthDone(period: string) {
  if (period !== nowMonth()) return 1;
  const d = new Date();
  return d.getDate() / getDaysInMonth(d);
}

// ---------------------------------------------------------------------------
// Headline figures: each business's top four
// ---------------------------------------------------------------------------

export interface HeadlineDef {
  code: string;
  label: string;
  unit: Extract<Unit, "php" | "pct" | "count">;
  /** How months combine over a span: amounts add up, stock figures (headcount) take the latest, rates average. */
  agg: "sum" | "last" | "avg";
  /** A typical month, about a year ago. */
  base: number;
  /** Growth per month (0.01 = 1%); for rates, points per month. */
  growth: number;
  /** Month-to-month wobble (0.08 = ±8%); for rates, ± points. */
  noise: number;
}

export interface BusinessHeadlines {
  slug: string;
  name: string;
  figures: HeadlineDef[];
}

const fig = (code: string, label: string, unit: HeadlineDef["unit"], agg: HeadlineDef["agg"], base: number, growth: number, noise: number): HeadlineDef => ({
  code,
  label,
  unit,
  agg,
  base,
  growth,
  noise,
});

/**
 * The four numbers each business leads with. Income sits second on every
 * card so the eye finds it in the same place. Placeholders until each
 * business sends its own four.
 */
export const HEADLINES: BusinessHeadlines[] = [
  {
    slug: "nam-builders",
    name: "NAM Builders",
    figures: [
      fig("revenue", "Revenue", "php", "sum", 6_800_000, 0.012, 0.16),
      fig("income", "Income", "php", "sum", 1_050_000, 0.014, 0.2),
      fig("projects", "Active projects", "count", "last", 13, 0.01, 0.12),
      fig("backlog", "Backlog", "php", "last", 46_000_000, 0.008, 0.05),
    ],
  },
  {
    slug: "nam-trading",
    name: "NAM Trading",
    figures: [
      fig("sales", "Sales", "php", "sum", 3_300_000, 0.015, 0.14),
      fig("income", "Income", "php", "sum", 480_000, 0.012, 0.18),
      fig("gross_margin", "Gross margin", "pct", "avg", 17.5, 0.04, 1.6),
      fig("collections", "Collected", "pct", "avg", 89, 0.15, 4),
    ],
  },
  {
    slug: "nam-supply",
    name: "NAM Supply",
    figures: [
      fig("sales", "Sales", "php", "sum", 5_100_000, 0.01, 0.15),
      fig("income", "Income", "php", "sum", 640_000, 0.009, 0.2),
      fig("gross_margin", "Gross margin", "pct", "avg", 14.2, 0.03, 1.4),
      fig("pipeline", "Pipeline", "php", "last", 21_000_000, 0.012, 0.09),
    ],
  },
  {
    slug: "alm-management",
    name: "ALM Management",
    figures: [
      fig("headcount", "Headcount", "count", "last", 172, 0.011, 0.025),
      fig("income", "Income", "php", "sum", 590_000, 0.013, 0.15),
      fig("revenue", "Revenue", "php", "sum", 4_000_000, 0.012, 0.09),
      fig("clients", "Clients", "count", "last", 21, 0.008, 0.06),
    ],
  },
];

/** The first month the sample runs from. */
const SAMPLE_START = "2025-01-01";

/** One figure for one month; null before the sample starts or after the month running. */
export function headlineMonth(slug: string, def: HeadlineDef, period: string): number | null {
  if (period < SAMPLE_START || period > nowMonth()) return null;
  const t = differenceInCalendarMonths(parseISO(period), parseISO(SAMPLE_START));
  const r = rand(`${slug}|${def.code}|${period}`) * 2 - 1;
  const season = Math.sin(((parseISO(period).getMonth() + 1) / 12) * 2 * Math.PI + (slug.length % 5));

  if (def.unit === "pct") {
    return Math.min(100, Math.round((def.base + def.growth * t + def.noise * r + 0.4 * season) * 10) / 10);
  }
  let v = def.base * (1 + def.growth) ** t * (1 + def.noise * r + 0.05 * season);
  if (def.agg === "sum") v *= monthDone(period);
  return def.unit === "count" ? Math.max(0, Math.round(v)) : Math.max(0, Math.round(v / 1000) * 1000);
}

/** A figure over a span of months: added up, the latest, or the average, as the figure says. */
export function headlineValue(slug: string, def: HeadlineDef, months: string[]): number | null {
  const vals = months.map((p) => headlineMonth(slug, def, p)).filter((v): v is number => v != null);
  if (!vals.length) return null;
  if (def.agg === "sum") return vals.reduce((a, b) => a + b, 0);
  if (def.agg === "last") return vals[vals.length - 1];
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ---------------------------------------------------------------------------
// Sample mode: every measure filled
// ---------------------------------------------------------------------------

/** How well each business does, on average, against its targets; the rest of the sample wobbles around it. */
const FORM: Record<string, number> = {
  "nam-builders": 0.975,
  "nam-trading": 0.9,
  "nam-supply": 0.945,
  "alm-management": 0.925,
};

const cache = new WeakMap<BoardData, BoardData>();

/**
 * The board's own scorecards and targets with sample results in place of the
 * real ones: 22 months up to the month running, every applicable measure.
 */
export function withSample(data: BoardData): BoardData {
  const hit = cache.get(data);
  if (hit) return hit;

  const start = subMonths(parseISO(nowMonth()), 21);
  const months = Array.from({ length: 22 }, (_, i) => iso(addMonths(start, i)));
  const actuals: Actual[] = [];

  for (const company of data.companies) {
    const code = company.scorecard_code ?? null;
    const cats = new Set(data.categories.filter((c) => c.scorecard_code == null || c.scorecard_code === code).map((c) => c.code));
    const form = FORM[company.slug] ?? 0.93;

    for (const m of data.measures.filter((x) => cats.has(x.category_code))) {
      const cm = data.companyMeasures.find((x) => x.company_id === company.id && x.measure_code === m.code);
      if (cm && !cm.applicable) continue;

      months.forEach((p, i) => {
        const target = targetFor(m, cm, null, p);
        const r = rand(`${company.slug}|${m.code}|${p}`);
        // A little better each month, and a few measures that are simply harder for this business.
        const hard = rand(`${company.slug}|${m.code}`) < 0.2 ? 0.1 : 0;
        const f = form - hard - 0.05 * (1 - i / months.length) + (r - 0.5) * 0.2;
        let actual: number;

        if (m.direction === "band") {
          const b = Math.abs(m.band ?? 1) || 1;
          actual = (target ?? 0) + (r - 0.5) * 2.6 * b;
        } else if (target == null) {
          return;
        } else if (m.direction === "lower") {
          actual = target === 0 ? (r < 0.1 ? 1 : 0) : target / Math.max(0.5, f);
        } else {
          actual = target * f;
          if (m.unit === "php") actual *= monthDone(p);
        }

        actuals.push({
          company_id: company.id,
          measure_code: m.code,
          period: p,
          actual: tidy(actual, m.unit),
          target: null,
          note: null,
          source: "manual",
          detail: null,
          updated_by: null,
          updated_at: `${p}T00:00:00Z`,
        });
      });
    }
  }

  const out = { ...data, actuals };
  cache.set(data, out);
  return out;
}

function tidy(v: number, unit: Unit) {
  switch (unit) {
    case "php":
      return Math.max(0, Math.round(v / 1000) * 1000);
    case "pct":
      return Math.max(0, Math.min(100, Math.round(v * 10) / 10));
    case "score5":
      return Math.max(1, Math.min(5, Math.round(v * 100) / 100));
    case "count":
      return Math.max(0, Math.round(v));
    default:
      return Math.max(0, Math.round(v * 100) / 100);
  }
}
