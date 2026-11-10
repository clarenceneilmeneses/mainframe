/**
 * Most results on the scorecard are one count out of another: milestones done
 * on time out of milestones due. People have the two counts, not the
 * percentage, so Record results asks for the counts and works the figure out
 * here. The counts are kept with the result (kpi_actuals.detail.num / .den) so
 * the board can show where a number came from and add months up properly.
 *
 * Pure functions, no I/O: tested in scoring.test.ts.
 */

/**
 * share = top ÷ bottom as %; cover = top ÷ bottom as times;
 * variance = (top − bottom) ÷ bottom as % (cost against budget);
 * markup = (top − bottom) ÷ bottom as % (sales against cost of goods) — the same sum, read as profit on cost.
 */
export type FormulaKind = "share" | "cover" | "variance" | "markup";

export interface Formula {
  kind: FormulaKind;
  /** The first box: the part. */
  top: string;
  /** The second box: the whole it is measured against. */
  bottom: string;
  /** Both boxes are pesos rather than counts. */
  money?: boolean;
}

/** By measure code. A measure that isn't here is typed in as a plain figure. */
export const FORMULAS: Record<string, Formula> = {
  gross_margin: { kind: "share", top: "Gross profit", bottom: "Sales", money: true },
  pipeline_cover: { kind: "cover", top: "Open qualified quotes", bottom: "Monthly sales target", money: true },
  collections: { kind: "share", top: "Collected", bottom: "Fell due this month", money: true },
  milestones_on_time: { kind: "share", top: "Done on time", bottom: "Milestones due" },
  cost_variance: { kind: "variance", top: "Actual cost", bottom: "Budget", money: true },
  benchmark_compliance: { kind: "share", top: "With competing quotes", bottom: "All purchases" },
  authorized_purchases: { kind: "share", top: "Approved purchases", bottom: "All purchases" },
  otif: { kind: "share", top: "On time, in full", bottom: "All deliveries" },
  first_time_acceptance: { kind: "share", top: "Accepted first time", bottom: "All handed over" },
  safety_checks: { kind: "share", top: "Checks done", bottom: "Checks required" },
  manpower_availability: { kind: "share", top: "Man-days available", bottom: "Man-days planned" },
  overtime_vs_budget: { kind: "share", top: "Overtime spent", bottom: "Overtime budget", money: true },
  approvals_compliance: { kind: "share", top: "Done on time", bottom: "Required" },
  complaint_sla: { kind: "share", top: "Closed within SLA", bottom: "Complaints received" },

  // NAM Trading
  tr_markup: { kind: "markup", top: "Sales", bottom: "Cost of goods", money: true },
  tr_collections: { kind: "share", top: "Collected on time", bottom: "Fell due this month", money: true },
  tr_retention: { kind: "share", top: "Bought again", bottom: "Existing clients" },
  tr_reports_on_time: { kind: "share", top: "On time and complete", bottom: "Reports due" },

  // ALM Management
  alm_headcount: { kind: "share", top: "People on board", bottom: "Approved manpower" },
  alm_attendance: { kind: "share", top: "Man-days worked", bottom: "Man-days scheduled" },
  alm_working_days: { kind: "share", top: "Working days delivered", bottom: "Working-day target" },
  alm_spend_vs_budget: { kind: "share", top: "Spent", bottom: "Approved budget", money: true },
  alm_profit_margin: { kind: "share", top: "Net profit", bottom: "Revenue", money: true },
  alm_reports_on_time: { kind: "share", top: "On time and accurate", bottom: "Reports due" },
  alm_accounts_kept: { kind: "share", top: "Accounts still active", bottom: "Accounts at the start" },
  alm_records_complete: { kind: "share", top: "Complete", bottom: "Required" },
};

/** The word that sits between the two boxes. */
export const JOINER: Record<FormulaKind, string> = { share: "out of", cover: "÷", variance: "against", markup: "on a cost of" };

/** The figure the two counts make, or null when there is nothing to measure against. */
export function compute(kind: FormulaKind, top: number, bottom: number): number | null {
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= 0) return null;
  const v = kind === "share" ? (top / bottom) * 100 : kind === "cover" ? top / bottom : ((top - bottom) / bottom) * 100; // variance and markup
  return Math.round(v * 100) / 100;
}

/** The counts saved with a result, if it was worked out from counts. */
export function countsOf(detail: Record<string, unknown> | null | undefined): { num: number; den: number } | null {
  const num = detail?.num;
  const den = detail?.den;
  return typeof num === "number" && typeof den === "number" ? { num, den } : null;
}
