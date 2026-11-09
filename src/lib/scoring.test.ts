// Run with `npm test` (Node strips the types itself).
import { test } from "node:test";
import assert from "node:assert/strict";
import { attainment, scoreCompany, statusOf, type CategoryDef, type MeasureDef } from "./scoring.ts";

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
