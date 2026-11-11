import { useSyncExternalStore } from "react";
import { addMonths, differenceInCalendarMonths, format, getDaysInMonth, parseISO, startOfMonth, subMonths } from "date-fns";
import { targetFor, type Actual, type Unit } from "./scoring";
import { FORMULAS } from "./formulas";
import type { BoardData } from "./board";

/*
 * Sample figures, so the board can be seen full before every business reports.
 *
 * Two things live here:
 *  - the top four headline numbers per business ("At a glance"), with their
 *    breakdowns. Each business will send its own four; until then they are
 *    made-up figures, labelled as such;
 *  - sample mode: every measure on every scorecard filled with believable
 *    results and breakdowns. On by default while the businesses are still
 *    setting up (SAMPLE_DEFAULT); `?sample=0` or the pill in the top bar turns it
 *    off on that device, `?sample=1` turns it back on.
 *
 * Every figure comes from a seeded random number per business, figure and
 * month, so the same month always shows the same sample.
 */

/** Flip to false once the businesses report for real. */
const SAMPLE_DEFAULT = true;

// ---------------------------------------------------------------------------
// The switch
// ---------------------------------------------------------------------------

const KEY = "mainframe:sample";
const listeners = new Set<() => void>();
let on = SAMPLE_DEFAULT;

function init() {
  try {
    const v = localStorage.getItem(KEY);
    if (v != null) on = v === "1";
  } catch {
    /* storage blocked: the default */
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
// Made-up names for breakdowns
// ---------------------------------------------------------------------------

const PROJECTS = ["Bayside Towers, phase 2", "Tierra Alta clubhouse", "Kalinaw Steel warehouse", "Islas Logistics hub", "Northpoint office fit-out", "Everything else"];
const TRADE_CUSTOMERS = ["Northpoint Developers", "Bayside Towers Inc.", "Tierra Alta Estates", "Kalinaw Steel", "Islas Logistics", "Everything else"];
const SUPPLY_CUSTOMERS = ["Kalinaw Steel", "Sampaguita Foods", "Islas Logistics", "Bayside Towers Inc.", "Mabini Power Plant", "Everything else"];
const ALM_CLIENTS = ["Sampaguita Foods", "Kalinaw Steel", "Islas Logistics", "Mabini Power Plant", "Lakeside Hospital", "Everything else"];
const TRADE_LINES = ["Rebar and steel", "Cement", "Electrical", "Plumbing", "Paint and finishes", "Everything else"];
const SUPPLY_LINES = ["Industrial fasteners", "Safety gear", "Pipes and fittings", "Power tools", "Welding supplies", "Everything else"];
const WORK_TYPES = ["Civil works", "Structural steel", "Electrical", "Fit-out", "Repairs and upkeep"];
const ROLES = ["Security", "Housekeeping", "Warehouse crew", "Admin and clerical", "Technicians"];
const SITES = ["Kalinaw Steel, Batangas", "Sampaguita Foods, Laguna", "Islas Logistics, Pasig", "Mabini Power Plant", "Lakeside Hospital", "Other sites"];
const INDUSTRIES = ["Manufacturing", "Logistics", "Food", "Healthcare", "Property", "Energy"];
const OWED_AGE = ["Not yet due", "1–30 days late", "31–60 days late", "61–90 days late", "Over 90 days late"];
const PIPE_STAGES = ["Enquiry", "Quoted", "Negotiating", "Verbal yes"];
const PROJECT_STAGES = ["Mobilising", "Under way", "Punch list", "Handing over"];
const SIZES = ["Under ₱5M", "₱5M–₱20M", "Over ₱20M"];
const FINISH = ["Within 3 months", "3–6 months", "6–12 months", "Over a year"];
const COST_TYPES = ["Materials", "Labour", "Subcontractors", "Equipment", "Overheads"];

// ---------------------------------------------------------------------------
// Headline figures: each business's top four
// ---------------------------------------------------------------------------

/**
 * One way of cutting a figure. "share" splits the figure into parts that add
 * up to it (sales by customer); "rate" gives each part its own rate around the
 * figure (gross margin by product line); "amount" is a peso split of a
 * related amount (what is still owed, by age).
 */
export interface Split {
  title: string;
  labels: string[];
  kind: "share" | "rate" | "amount";
  /** For "amount": how big the amount is against a month of the business's first figure. */
  scale?: number;
}

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
  /** One line on what the figure is. */
  help: string;
  splits: Split[];
}

export interface BusinessHeadlines {
  slug: string;
  name: string;
  figures: HeadlineDef[];
}

const share = (title: string, labels: string[]): Split => ({ title, labels, kind: "share" });
const rate = (title: string, labels: string[]): Split => ({ title, labels, kind: "rate" });

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
      { code: "revenue", label: "Revenue", unit: "php", agg: "sum", base: 6_800_000, growth: 0.012, noise: 0.16, help: "Work billed to clients.", splits: [share("By project", PROJECTS), share("By type of work", WORK_TYPES)] },
      { code: "income", label: "Income", unit: "php", agg: "sum", base: 1_050_000, growth: 0.014, noise: 0.2, help: "Revenue less the cost of doing the work.", splits: [share("By project", PROJECTS), share("By type of work", WORK_TYPES)] },
      { code: "projects", label: "Active projects", unit: "count", agg: "last", base: 13, growth: 0.01, noise: 0.12, help: "Projects on site at the month end.", splits: [share("By stage", PROJECT_STAGES), share("By contract size", SIZES)] },
      { code: "backlog", label: "Backlog", unit: "php", agg: "last", base: 46_000_000, growth: 0.008, noise: 0.05, help: "Contracted work not yet billed, at the month end.", splits: [share("By project", PROJECTS), share("When it gets billed", FINISH)] },
    ],
  },
  {
    slug: "nam-trading",
    name: "NAM Trading",
    figures: [
      { code: "sales", label: "Sales", unit: "php", agg: "sum", base: 3_300_000, growth: 0.015, noise: 0.14, help: "Invoiced sales.", splits: [share("By customer", TRADE_CUSTOMERS), share("By product line", TRADE_LINES)] },
      { code: "income", label: "Income", unit: "php", agg: "sum", base: 480_000, growth: 0.012, noise: 0.18, help: "Sales less the cost of the goods sold.", splits: [share("By product line", TRADE_LINES), share("By customer", TRADE_CUSTOMERS)] },
      { code: "gross_margin", label: "Gross margin", unit: "pct", agg: "avg", base: 17.5, growth: 0.04, noise: 1.6, help: "Income as a share of sales.", splits: [rate("By product line", TRADE_LINES.slice(0, 5))] },
      { code: "collections", label: "Collected", unit: "pct", agg: "avg", base: 89, growth: 0.15, noise: 4, help: "Of what fell due, how much came in on time.", splits: [rate("By customer", TRADE_CUSTOMERS.slice(0, 5)), { title: "Still owed, by age", labels: OWED_AGE, kind: "amount", scale: 0.6 }] },
    ],
  },
  {
    slug: "nam-supply",
    name: "NAM Supply",
    figures: [
      { code: "sales", label: "Sales", unit: "php", agg: "sum", base: 5_100_000, growth: 0.01, noise: 0.15, help: "Invoiced sales.", splits: [share("By customer", SUPPLY_CUSTOMERS), share("By product line", SUPPLY_LINES)] },
      { code: "income", label: "Income", unit: "php", agg: "sum", base: 640_000, growth: 0.009, noise: 0.2, help: "Sales less the cost of the goods sold.", splits: [share("By product line", SUPPLY_LINES), share("By customer", SUPPLY_CUSTOMERS)] },
      { code: "gross_margin", label: "Gross margin", unit: "pct", agg: "avg", base: 14.2, growth: 0.03, noise: 1.4, help: "Income as a share of sales.", splits: [rate("By product line", SUPPLY_LINES.slice(0, 5))] },
      { code: "pipeline", label: "Pipeline", unit: "php", agg: "last", base: 21_000_000, growth: 0.012, noise: 0.09, help: "Open quotes still in play, at the month end.", splits: [share("By stage", PIPE_STAGES), share("By customer", SUPPLY_CUSTOMERS)] },
    ],
  },
  {
    slug: "alm-management",
    name: "ALM Management",
    figures: [
      { code: "headcount", label: "Headcount", unit: "count", agg: "last", base: 172, growth: 0.011, noise: 0.025, help: "People deployed at the month end.", splits: [share("By client site", SITES), share("By role", ROLES)] },
      { code: "income", label: "Income", unit: "php", agg: "sum", base: 590_000, growth: 0.013, noise: 0.15, help: "Revenue less payroll and the cost of deployment.", splits: [share("By client", ALM_CLIENTS), share("By role", ROLES)] },
      { code: "revenue", label: "Revenue", unit: "php", agg: "sum", base: 4_000_000, growth: 0.012, noise: 0.09, help: "Billed to clients for manpower.", splits: [share("By client", ALM_CLIENTS), share("By role", ROLES)] },
      { code: "clients", label: "Clients", unit: "count", agg: "last", base: 21, growth: 0.008, noise: 0.06, help: "Clients with people deployed.", splits: [share("By industry", INDUSTRIES), share("By size of deployment", ["Under 5 people", "5–15 people", "Over 15 people"])] },
    ],
  },
];

export function findHeadline(slug: string | null | undefined, code: string | null | undefined) {
  const b = HEADLINES.find((x) => x.slug === slug);
  const def = b?.figures.find((f) => f.code === code);
  return b && def ? { b, def } : null;
}

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
  return combine(def, vals);
}

export function combine(def: Pick<HeadlineDef, "agg">, vals: number[]): number | null {
  if (!vals.length) return null;
  if (def.agg === "sum") return vals.reduce((a, b) => a + b, 0);
  if (def.agg === "last") return vals[vals.length - 1];
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Weights for the parts of a split: steady per business, nudged a little month to month. "Everything else" stays a middling slice. */
function weights(key: string, labels: string[], months: string[]) {
  const ws = labels.map((l, i) => {
    const base = l === "Everything else" || l === "Other sites" ? 0.55 : 0.35 + rand(`${key}|${l}`) * (1.6 - i * 0.18);
    const wobble = months.reduce((a, p) => a + (rand(`${key}|${l}|${p}`) - 0.5) * 0.25, 0) / Math.max(1, months.length);
    return Math.max(0.05, base + wobble);
  });
  const sum = ws.reduce((a, b) => a + b, 0);
  return ws.map((w) => w / sum);
}

export interface BreakdownRows {
  title: string;
  unit: "php" | "pct" | "count";
  rows: { label: string; value: number }[];
}

/** The breakdowns of a figure over a span of months. */
export function headlineBreakdowns(b: BusinessHeadlines, def: HeadlineDef, months: string[]): BreakdownRows[] {
  const total = headlineValue(b.slug, def, months);
  if (total == null) return [];
  return def.splits.map((s) => {
    const key = `${b.slug}|${def.code}|${s.title}`;
    if (s.kind === "rate") {
      return {
        title: s.title,
        unit: "pct" as const,
        rows: s.labels
          .map((label) => ({ label, value: Math.min(100, Math.round((total + (rand(`${key}|${label}`) - 0.5) * (def.code === "collections" ? 22 : 9)) * 10) / 10) }))
          .sort((x, y) => y.value - x.value),
      };
    }
    if (s.kind === "amount") {
      const first = b.figures[0];
      const amount = (headlineMonth(b.slug, first, months[months.length - 1]) ?? first.base) * (s.scale ?? 1) * (1 + (100 - total) / 40);
      const ws = weights(key, s.labels, months.slice(-1)).map((w, i) => w * (i === 0 ? 2.2 : 1 / i));
      const sum = ws.reduce((a, c) => a + c, 0);
      return { title: s.title, unit: "php" as const, rows: s.labels.map((label, i) => ({ label, value: Math.round(((amount * ws[i]) / sum) / 1000) * 1000 })) };
    }
    const ws = weights(key, s.labels, months);
    let rows = s.labels.map((label, i) => ({ label, value: total * ws[i] }));
    if (def.unit === "count") {
      rows = rows.map((r) => ({ ...r, value: Math.floor(r.value) }));
      let left = Math.round(total) - rows.reduce((a, r) => a + r.value, 0);
      for (let i = 0; left > 0; i = (i + 1) % rows.length, left--) rows[i].value++;
    } else rows = rows.map((r) => ({ ...r, value: Math.round(r.value / 1000) * 1000 }));
    // Named parts biggest first; "Everything else" stays at the bottom.
    const named = rows.filter((r) => r.label !== "Everything else" && r.label !== "Other sites").sort((x, y) => y.value - x.value);
    const rest = rows.filter((r) => r.label === "Everything else" || r.label === "Other sites");
    return { title: s.title, unit: def.unit === "count" ? ("count" as const) : ("php" as const), rows: [...named, ...rest] };
  });
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

const CUSTOMERS: Record<string, string[]> = {
  "nam-builders": PROJECTS,
  "nam-trading": TRADE_CUSTOMERS,
  "nam-supply": SUPPLY_CUSTOMERS,
  "alm-management": ALM_CLIENTS,
};
const LINES: Record<string, string[]> = {
  "nam-builders": WORK_TYPES,
  "nam-trading": TRADE_LINES,
  "nam-supply": SUPPLY_LINES,
  "alm-management": ROLES,
};

/** The peso breakdowns a sample peso result carries, as the NAM Supply sync writes them. */
function pesoBreakdowns(slug: string, code: string, period: string, actual: number) {
  const cost = /cost|spend|budget|overtime/.test(code);
  const cuts = cost
    ? [{ title: "By cost type", labels: COST_TYPES }]
    : [
        { title: slug === "nam-builders" ? "By project" : slug === "alm-management" ? "By client" : "By customer", labels: CUSTOMERS[slug] ?? TRADE_CUSTOMERS },
        { title: slug === "nam-builders" ? "By type of work" : slug === "alm-management" ? "By role" : "By product line", labels: LINES[slug] ?? TRADE_LINES },
      ];
  return cuts.map((c) => {
    const ws = weights(`${slug}|${code}|${c.title}`, c.labels, [period]);
    const rows = c.labels.map((label, i) => ({ label, value: Math.round((actual * ws[i]) / 1000) * 1000 }));
    const named = rows.filter((r) => r.label !== "Everything else").sort((a, b) => b.value - a.value);
    return { title: c.title, unit: "php" as const, rows: [...named, ...rows.filter((r) => r.label === "Everything else")] };
  });
}

/** Counts behind a sample percentage, so the drill-down can say "19 out of 20". */
function sampleCounts(slug: string, code: string, period: string, actual: number) {
  const f = FORMULAS[code];
  if (!f || f.kind !== "share") return null;
  const r = rand(`${slug}|${code}|${period}|den`);
  const den = f.money ? Math.round((800_000 + r * 4_000_000) / 1000) * 1000 : Math.round(12 + r * 60);
  const num = f.money ? Math.round((den * actual) / 100 / 1000) * 1000 : Math.round((den * actual) / 100);
  return { num, den, actual: Math.round((num / den) * 10000) / 100 };
}

const cache = new WeakMap<BoardData, BoardData>();

/**
 * The board's own scorecards and targets with sample results in place of the
 * real ones: 22 months up to the month running, every applicable measure,
 * with breakdowns on the peso ones and counts behind the percentages.
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
        actual = tidy(actual, m.unit);

        let detail: Record<string, unknown> | null = null;
        if (m.unit === "php") {
          detail = { breakdowns: pesoBreakdowns(company.slug, m.code, p, actual) };
        } else if (m.unit === "pct") {
          const c = sampleCounts(company.slug, m.code, p, actual);
          if (c) {
            actual = c.actual;
            detail = { num: c.num, den: c.den };
            // The fields the drill-down's "how it was worked out" reads for these two.
            if (m.code === "gross_margin") Object.assign(detail, { income: c.num, sales: c.den });
            if (m.code === "collections") Object.assign(detail, { collected: c.num, amount_due: c.den, lines_due: Math.round(c.den / 9000) });
          }
        }

        actuals.push({
          company_id: company.id,
          measure_code: m.code,
          period: p,
          actual,
          target: null,
          note: null,
          source: "manual",
          detail,
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
