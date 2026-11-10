// Run with `npm test` (Node strips the types itself).
import { test } from "node:test";
import assert from "node:assert/strict";
import { attainment, drags, pickScorecard, quarterTarget, scoreCompany, statusOf, targetFor, type CategoryDef, type MeasureDef } from "./scoring.ts";
import { compute, countsOf } from "./formulas.ts";

test("higher-is-better measures cap at full marks", () => {
  assert.equal(attainment(1_250_000, 2_500_000, "higher"), 0.5);
  assert.equal(attainment(3_000_000, 2_500_000, "higher"), 1);
  assert.equal(attainment(-10, 100, "higher"), 0);
  assert.equal(attainment(50, null, "higher"), null, "no target, no score");
  assert.equal(attainment(null, 100, "higher"), null, "no result, no score");
});

test("lower-is-better measures are full marks at or under target", () => {
  assert.equal(attainment(80, 100, "lower"), 1);
  assert.equal(attainment(125, 100, "lower"), 0.8);
});

test("band measures: full inside ±band, zero at twice the band", () => {
  assert.equal(attainment(4.9, 0, "band", 5), 1);
  assert.equal(attainment(-5, 0, "band", 5), 1);
  assert.equal(attainment(7.5, 0, "band", 5), 0.5);
  assert.equal(attainment(-12, 0, "band", 5), 0);
});

test("status cuts", () => {
  assert.equal(statusOf(95), "on");
  assert.equal(statusOf(94.9), "watch");
  assert.equal(statusOf(84.9), "off");
  assert.equal(statusOf(null), "none");
});

const categories: CategoryDef[] = [
  { code: "sales", name: "Sales", weight: 30, target_text: "", sort: 1 },
  { code: "finance", name: "Finance", weight: 20, target_text: "", sort: 2 },
  { code: "hr", name: "HR", weight: 50, target_text: "", sort: 3 },
];
const m = (code: string, category_code: string, default_target: number): MeasureDef => ({
  code,
  category_code,
  name: code,
  unit: "pct",
  direction: "higher",
  default_target,
  band: null,
  help: null,
  sort: 1,
});
const measures = [m("a", "sales", 100), m("b", "sales", 100), m("c", "finance", 95), m("d", "hr", 95)];
const row = (measure_code: string, actual: number) => ({
  company_id: "x",
  measure_code,
  period: "2026-07-01",
  actual,
  target: null,
  note: null,
  source: "manual" as const,
  detail: null,
  updated_by: null,
  updated_at: "",
});

test("a business scores over the categories that reported, and says how much is in", () => {
  const s = scoreCompany({
    categories,
    measures,
    companyMeasures: [],
    actuals: [row("a", 50), row("b", 100), row("c", 95)],
  });
  // sales: avg(0.5, 1) = 0.75 → 22.5 of 30; finance: 1 → 20 of 20. 42.5 / 50 = 85.
  assert.equal(s.score, 85);
  assert.equal(s.coverage, 50);
  assert.equal(s.measuresReported, 3);
  assert.equal(s.measuresApplicable, 4);
  assert.equal(s.status, "watch");
});

test("what drags a score down adds up to the points missing, heaviest first", () => {
  const s = scoreCompany({
    categories,
    measures,
    companyMeasures: [],
    actuals: [row("a", 50), row("b", 100), row("c", 76), row("d", 95)],
  });
  // sales: a at 50% is half of a 30-point category → 7.5 lost; finance: c at 80% of a 20-point category → 4 lost.
  const d = drags(s);
  assert.deepEqual(d.map((x) => x.measure.def.code), ["a", "c"]);
  assert.ok(Math.abs(d[0].lost - 7.5) < 1e-9);
  assert.ok(Math.abs(d[1].lost - 4) < 1e-9);
  assert.ok(Math.abs(d.reduce((a, x) => a + x.lost, 0) - (100 - s.score!)) < 1e-9);
});

test("a drag is on the score's own scale when only part of the scorecard is in", () => {
  const s = scoreCompany({ categories, measures, companyMeasures: [], actuals: [row("a", 50), row("b", 100), row("c", 95)] });
  // 42.5 of the 50 points reported → 85. The 7.5 lost points are 15 on that scale.
  const d = drags(s);
  assert.equal(d.length, 1);
  assert.ok(Math.abs(d[0].lost - 15) < 1e-9);
});

test("counts become the figure; nothing to measure gives no figure", () => {
  assert.equal(compute("share", 19, 20), 95);
  assert.equal(compute("share", 2, 3), 66.67);
  assert.equal(compute("cover", 7_500_000, 2_500_000), 3);
  assert.equal(compute("variance", 1_040_000, 1_000_000), 4);
  assert.equal(compute("variance", 900_000, 1_000_000), -10);
  assert.equal(compute("share", 0, 0), null);
  assert.deepEqual(countsOf({ num: 19, den: 20 }), { num: 19, den: 20 });
  assert.equal(countsOf({ sales: 5 }), null);
  assert.equal(countsOf(null), null);
});

test("switching a measure off takes it out of the scorecard", () => {
  const s = scoreCompany({
    categories,
    measures,
    companyMeasures: [{ company_id: "x", measure_code: "d", applicable: false, target: null, source: "manual" }],
    actuals: [row("a", 100), row("b", 100), row("c", 95)],
  });
  assert.equal(s.score, 100);
  assert.equal(s.coverage, 100);
  assert.equal(s.measuresApplicable, 3);
});

test("a per-business target beats the default, and a month's own target beats both", () => {
  const s = scoreCompany({
    categories,
    measures,
    companyMeasures: [{ company_id: "x", measure_code: "a", applicable: true, target: 200, source: "manual" }],
    actuals: [{ ...row("a", 100) }],
  });
  assert.equal(s.categories[0].measures[0].attainment, 0.5);
  const t = scoreCompany({
    categories,
    measures,
    companyMeasures: [{ company_id: "x", measure_code: "a", applicable: true, target: 200, source: "manual" }],
    actuals: [{ ...row("a", 100), target: 100 }],
  });
  assert.equal(t.categories[0].measures[0].attainment, 1);
});

// ---------------------------------------------------------------------------
// One scorecard per business (supabase/03_scorecards.sql)
// ---------------------------------------------------------------------------

test("a zero target on a lower-is-better measure: none is full marks, any is a miss", () => {
  assert.equal(attainment(0, 0, "lower"), 1);
  assert.equal(attainment(1, 0, "lower"), 0);
  assert.equal(attainment(0, 0, "higher"), null, "a zero target still can't score a higher-is-better measure");
});

test("a target set by quarter: ₱3M a month in Q1–Q2, ₱4.2M in Q3–Q4", () => {
  const cm = { company_id: "t", measure_code: "a", applicable: true, target: null, quarter_targets: [3_000_000, 3_000_000, 4_200_000, 4_200_000], source: "manual" as const };
  assert.equal(quarterTarget(cm, "2026-01-01"), 3_000_000);
  assert.equal(quarterTarget(cm, "2026-06-01"), 3_000_000);
  assert.equal(quarterTarget(cm, "2026-07-01"), 4_200_000);
  assert.equal(quarterTarget(cm, "2026-12-01"), 4_200_000);
  assert.equal(quarterTarget({ ...cm, quarter_targets: null }, "2026-07-01"), null);
  const def = { ...m("a", "sales", 100), unit: "php" as const, default_target: null };
  // A month's own target still wins; then the quarter's; then the standing one.
  assert.equal(targetFor(def, cm, { ...row("a", 1), period: "2026-08-01", target: 5_000_000 }), 5_000_000);
  assert.equal(targetFor(def, cm, { ...row("a", 1), period: "2026-08-01" }), 4_200_000);
  assert.equal(targetFor(def, { ...cm, quarter_targets: null, target: 2_500_000 }, null, "2026-08-01"), 2_500_000);
  // Scored against the quarter's target: ₱3.15M in August is 75% of ₱4.2M.
  const s = scoreCompany({ categories, measures: [def], companyMeasures: [cm], actuals: [{ ...row("a", 3_150_000), period: "2026-08-01" }] });
  assert.equal(s.categories[0].measures[0].attainment, 0.75);
});

test("each business sees only its own scorecard; categories with no scorecard are on all of them", () => {
  const cats: CategoryDef[] = [
    { code: "b1", scorecard_code: "builders", name: "B1", weight: 100, target_text: "", sort: 1 },
    { code: "t1", scorecard_code: "trading", name: "T1", weight: 60, target_text: "", sort: 1 },
    { code: "t2", scorecard_code: "trading", name: "T2", weight: 40, target_text: "", sort: 2 },
  ];
  const ms = [m("mb", "b1", 100), m("mt1", "t1", 100), m("mt2", "t2", 100)];
  const trading = pickScorecard("trading", cats, ms);
  assert.deepEqual(trading.categories.map((c) => c.code), ["t1", "t2"]);
  assert.deepEqual(trading.measures.map((x) => x.code), ["mt1", "mt2"]);
  assert.deepEqual(pickScorecard("builders", cats, ms).measures.map((x) => x.code), ["mb"]);
  // Before 03_scorecards.sql nothing has a scorecard, so everything counts, as before.
  assert.equal(pickScorecard(null, categories, measures).categories.length, categories.length);
  // A Trading score is out of Trading's own 100.
  const s = scoreCompany({ ...trading, companyMeasures: [], actuals: [row("mt1", 50), row("mt2", 100)] });
  assert.equal(s.score, 70);
});

test("mark-up is profit on cost", () => {
  assert.equal(compute("markup", 1_330_000, 1_000_000), 33);
  assert.equal(compute("markup", 900_000, 1_000_000), -10);
});
