/**
 * How the board turns monthly results into a score. Pure functions, no I/O,
 * so the rules can be tested and shown to the CEO exactly as they run.
 *
 *  1. Each measure gets an attainment from 0 to 1 against its target
 *     (capped at 1: beating a target doesn't buy points elsewhere).
 *  2. A category's attainment is the average of its measures that have a
 *     result this month. Its points are weight × attainment.
 *  3. A business's score is its points over the weight of the categories that
 *     reported, out of 100. Categories with no result yet don't count as zero;
 *     they show as gaps, and coverage says how much of the scorecard is in.
 */

export type Unit = "php" | "pct" | "ratio" | "score5" | "count";
export type Direction = "higher" | "lower" | "band";
export type Status = "on" | "watch" | "off" | "none";

/** A score at or above `on` is on target; at or above `watch` needs watching; below is off target. */
export const STATUS_CUTS = { on: 95, watch: 85 } as const;

/** One business's scorecard. Each business is judged on its own (supabase/03_scorecards.sql). */
export interface ScorecardDef {
  code: string;
  name: string;
  description: string | null;
  sort: number;
}

export interface CategoryDef {
  code: string;
  /** Which scorecard it belongs to. Missing on a database from before 03_scorecards.sql: then it is on every one. */
  scorecard_code?: string | null;
  /** Short label for the board's grid. */
  short_name?: string | null;
  name: string;
  weight: number;
  target_text: string;
  sort: number;
}

export interface MeasureDef {
  code: string;
  category_code: string;
  name: string;
  unit: Unit;
  direction: Direction;
  default_target: number | null;
  band: number | null;
  help: string | null;
  sort: number;
}

export interface CompanyMeasure {
  company_id: string;
  measure_code: string;
  applicable: boolean;
  target: number | null;
  /** A monthly target per quarter, {Q1, Q2, Q3, Q4}; overrides `target` when set. */
  quarter_targets?: number[] | null;
  source: "manual" | "system";
}

export interface Actual {
  company_id: string;
  measure_code: string;
  period: string;
  actual: number;
  target: number | null;
  note: string | null;
  source: "manual" | "system" | "sheet";
  detail: Record<string, unknown> | null;
  updated_by: string | null;
  updated_at: string;
}

export interface MeasureResult {
  def: MeasureDef;
  applicable: boolean;
  source: "manual" | "system";
  target: number | null;
  actual: number | null;
  attainment: number | null;
  row: Actual | null;
}

export interface CategoryResult {
  def: CategoryDef;
  measures: MeasureResult[];
  applicable: boolean;
  attainment: number | null;
  points: number | null;
}

export interface CompanyScore {
  categories: CategoryResult[];
  /** 0–100, over the categories that reported. null when nothing has. */
  score: number | null;
  /** Share of the applicable weight that has a result, 0–100. */
  coverage: number;
  measuresReported: number;
  measuresApplicable: number;
  status: Status;
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));

export function attainment(
  actual: number | null | undefined,
  target: number | null | undefined,
  direction: Direction,
  band?: number | null,
): number | null {
  if (actual == null || !Number.isFinite(actual)) return null;
  if (direction === "band") {
    // Within ± band of the target (usually 0) is full marks; the score then
    // falls away and reaches zero at twice the band.
    const b = Math.abs(band ?? 0);
    const dev = Math.abs(actual - (target ?? 0));
    if (dev <= b) return 1;
    return b > 0 ? clamp(1 - (dev - b) / b) : 0;
  }
  if (target == null || !Number.isFinite(target)) return null;
  // "Zero accidents": with a target of zero, any at all is a miss.
  if (direction === "lower" && target === 0) return actual <= 0 ? 1 : 0;
  if (target <= 0) return null;
  if (direction === "lower") return actual <= target ? 1 : clamp(target / actual);
  return clamp(actual / target);
}

export function statusOf(score: number | null): Status {
  if (score == null) return "none";
  if (score >= STATUS_CUTS.on) return "on";
  if (score >= STATUS_CUTS.watch) return "watch";
  return "off";
}

export interface Drag {
  category: CategoryResult;
  measure: MeasureResult;
  /** Points the business's score would gain if this measure were at full marks. */
  lost: number;
}

/**
 * What is pulling a score down, biggest first. A measure's cost is its share
 * of its category's weight, on the same scale as the score — so the costs of
 * every measure add up to exactly 100 − score. This is why a small miss in
 * Sales (weight 30) can matter more than a big miss in HR (weight 4).
 */
export function drags(s: CompanyScore): Drag[] {
  const reported = s.categories.filter((c) => c.applicable && c.points != null);
  const reportedWeight = reported.reduce((a, c) => a + Number(c.def.weight), 0);
  if (reportedWeight <= 0) return [];
  return reported
    .flatMap((category) => {
      const scored = category.measures.filter((m) => m.attainment != null);
      return scored
        .filter((m) => (m.attainment ?? 1) < 1)
        .map((measure) => ({
          category,
          measure,
          lost: ((Number(category.def.weight) * (1 - (measure.attainment ?? 1))) / scored.length / reportedWeight) * 100,
        }));
    })
    .sort((a, b) => b.lost - a.lost);
}

/** The monthly target set for the quarter a month falls in, if the target differs by quarter. */
export function quarterTarget(cm: CompanyMeasure | undefined, period: string | null | undefined): number | null {
  const q = cm?.quarter_targets;
  if (!q || q.length !== 4 || !period) return null;
  const month = Number(period.slice(5, 7));
  if (!(month >= 1 && month <= 12)) return null;
  const t = q[Math.floor((month - 1) / 3)];
  return t == null || !Number.isFinite(Number(t)) ? null : Number(t);
}

/**
 * The target a result is judged against: one typed in with that month's result,
 * else the business's target for that quarter, else its standing target, else
 * the scorecard default.
 */
export function targetFor(def: MeasureDef, cm: CompanyMeasure | undefined, row: Actual | null, period?: string | null) {
  return row?.target ?? quarterTarget(cm, period ?? row?.period) ?? cm?.target ?? def.default_target;
}

/**
 * The categories and measures a business is judged on: those of its own
 * scorecard. Categories with no scorecard (a database from before
 * 03_scorecards.sql) count for everyone, so the board keeps working until
 * the SQL is run.
 */
export function pickScorecard<C extends CategoryDef, M extends MeasureDef>(
  scorecardCode: string | null | undefined,
  categories: C[],
  measures: M[],
): { categories: C[]; measures: M[] } {
  const cats = categories.filter((c) => c.scorecard_code == null || c.scorecard_code === scorecardCode);
  const codes = new Set(cats.map((c) => c.code));
  return { categories: cats, measures: measures.filter((m) => codes.has(m.category_code)) };
}

export function scoreCompany(input: {
  categories: CategoryDef[];
  measures: MeasureDef[];
  companyMeasures: CompanyMeasure[];
  actuals: Actual[];
  /** The month being scored, for targets that differ by quarter when a measure has no result. */
  period?: string;
}): CompanyScore {
  const cmBy = new Map(input.companyMeasures.map((c) => [c.measure_code, c]));
  const rowBy = new Map(input.actuals.map((a) => [a.measure_code, a]));

  const categories: CategoryResult[] = [...input.categories]
    .sort((a, b) => a.sort - b.sort)
    .map((def) => {
      const measures: MeasureResult[] = input.measures
        .filter((m) => m.category_code === def.code)
        .sort((a, b) => a.sort - b.sort)
        .map((m) => {
          const cm = cmBy.get(m.code);
          const applicable = cm?.applicable ?? true;
          const row = applicable ? (rowBy.get(m.code) ?? null) : null;
          const target = targetFor(m, cm, row, row?.period ?? input.period);
          const actual = row ? Number(row.actual) : null;
          return {
            def: m,
            applicable,
            source: cm?.source ?? "manual",
            target,
            actual,
            attainment: applicable ? attainment(actual, target, m.direction, m.band) : null,
            row,
          };
        });
      const scored = measures.filter((m) => m.attainment != null);
      const applicable = measures.some((m) => m.applicable);
      const att = scored.length ? scored.reduce((s, m) => s + (m.attainment ?? 0), 0) / scored.length : null;
      return {
        def,
        measures,
        applicable,
        attainment: applicable ? att : null,
        points: applicable && att != null ? Number(def.weight) * att : null,
      };
    });

  const live = categories.filter((c) => c.applicable);
  const totalWeight = live.reduce((s, c) => s + Number(c.def.weight), 0);
  const reported = live.filter((c) => c.points != null);
  const reportedWeight = reported.reduce((s, c) => s + Number(c.def.weight), 0);
  const points = reported.reduce((s, c) => s + (c.points ?? 0), 0);
  const score = reportedWeight > 0 ? (points / reportedWeight) * 100 : null;

  const allMeasures = live.flatMap((c) => c.measures).filter((m) => m.applicable);
  return {
    categories,
    score,
    coverage: totalWeight > 0 ? (reportedWeight / totalWeight) * 100 : 0,
    measuresReported: allMeasures.filter((m) => m.attainment != null).length,
    measuresApplicable: allMeasures.length,
    status: statusOf(score),
  };
}
