import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Status, Unit } from "../lib/scoring";
import { compactMoney, money, unitValue } from "../lib/format";
import { cn } from "../lib/utils";

// Malaya's single-hue rule: one series, one blue. Status is the only other
// colour on a chart, and it always travels with a word.
export const BLUE = "#1d5ba4";
const BLUE_SOFT = "#a9c0de";
const axis = { fontSize: 11, fill: "#5d6470" };

const statusStroke: Record<Status, string> = {
  on: "var(--color-good)",
  watch: "var(--color-watch)",
  off: "var(--color-off)",
  none: "var(--color-mist-300)",
};

/** The headline number: a ring that fills to the score, the score in the middle. */
export function ScoreRing({
  score,
  status,
  size = 112,
  stroke = 10,
  className,
}: {
  score: number | null;
  status: Status;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-mist-100)" strokeWidth={stroke} />
        {score != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={statusStroke[status]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * filled} ${c}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[28px] leading-none font-medium text-ink tabular-nums" style={{ fontSize: size * 0.26 }}>
          {score == null ? "—" : score.toFixed(1)}
        </span>
        <span className="mt-1 text-[10px] tracking-[0.14em] text-ink-muted uppercase">of 100</span>
      </div>
    </div>
  );
}

/** A thin bar that fills to an attainment (0–1), coloured by status. Hatched when there's no result. */
export function AttainmentBar({ value, status, className }: { value: number | null; status: Status; className?: string }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-mist-100", value == null && "hatch", className)}>
      {value != null && (
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, value * 100)}%`, background: statusStroke[status] }} />
      )}
    </div>
  );
}

interface TipPayload {
  payload?: Record<string, unknown>;
}

function TipBox({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-xl border border-mist-200 bg-white px-3 py-2 text-xs shadow-level-3">
      <p className="mb-1 font-semibold text-ink">{title}</p>
      {rows.map(([k, v]) => (
        <p key={k} className="flex justify-between gap-4 text-ink-soft">
          <span>{k}</span>
          <span className="text-ink tabular-nums">{v}</span>
        </p>
      ))}
    </div>
  );
}

/** Score by month: one bar per month, the 95 line marked. Months with no result are left empty. */
export function ScoreTrend({
  data,
  onPick,
}: {
  data: { period?: string; label: string; score: number | null; coverage: number }[];
  onPick?: (period: string) => void;
}) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="#e8eaee" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "#d9dce2" }} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={axis} tickLine={false} axisLine={false} width={40} />
          <ReferenceLine y={95} stroke="var(--color-good)" strokeDasharray="4 4" label={{ value: "95", position: "right", fontSize: 10, fill: "#5d6470" }} />
          <Tooltip
            cursor={{ fill: "rgba(29,91,164,0.06)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = (payload[0] as TipPayload).payload as { score: number | null; coverage: number };
              return (
                <TipBox
                  title={String(label)}
                  rows={
                    p.score == null
                      ? [["Score", "No results"]]
                      : [
                          ["Score", p.score.toFixed(1)],
                          ["Scorecard reported", `${Math.round(p.coverage)}%`],
                        ]
                  }
                />
              );
            }}
          />
          <Bar
            dataKey="score"
            fill={BLUE}
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
            isAnimationActive={false}
            cursor={onPick ? "pointer" : undefined}
            onClick={(d: { payload?: { period?: string } }) => {
              if (onPick && d?.payload?.period) onPick(d.payload.period);
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A peso measure by month against its target line (e.g. sales vs the monthly target). */
export function AmountVsTarget({
  data,
  target,
  name,
  onPick,
}: {
  data: { period?: string; label: string; value: number | null; target: number | null }[];
  target: number | null;
  name: string;
  onPick?: (period: string) => void;
}) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="#e8eaee" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "#d9dce2" }} />
          <YAxis
            tick={axis}
            tickLine={false}
            axisLine={false}
            width={56}
            domain={[0, (max: number) => Math.max(max, (target ?? 0) * 1.08)]}
            tickFormatter={(v: number) => compactMoney(v)}
          />
          {target != null && (
            <ReferenceLine y={target} stroke={BLUE_SOFT} strokeWidth={2} strokeDasharray="6 4" />
          )}
          <Tooltip
            cursor={{ fill: "rgba(29,91,164,0.06)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = (payload[0] as TipPayload).payload as { value: number | null; target: number | null };
              const rows: [string, string][] = [[name, p.value == null ? "—" : money(p.value)]];
              if (p.target) rows.push(["Target", money(p.target)]);
              if (p.target && p.value != null) rows.push(["Reached", `${Math.round((p.value / p.target) * 100)}%`]);
              return <TipBox title={String(label)} rows={rows} />;
            }}
          />
          <Bar
            dataKey="value"
            fill={BLUE}
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
            isAnimationActive={false}
            cursor={onPick ? "pointer" : undefined}
            onClick={(d: { payload?: { period?: string } }) => {
              if (onPick && d?.payload?.period) onPick(d.payload.period);
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A tiny bar per month for a table row. Empty months leave a gap; the last bar is the month in view. */
export function Sparkbars({ values, className }: { values: (number | null)[]; className?: string }) {
  const max = 100;
  return (
    <div className={cn("flex h-7 items-end gap-[3px]", className)} aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className={cn("w-[5px] rounded-t-[2px]", v == null ? "h-[3px] bg-mist-200" : i === values.length - 1 ? "bg-brand-700" : "bg-brand-300")}
          style={v == null ? undefined : { height: `${Math.max(8, (Math.min(v, max) / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function niceCeil(v: number) {
  const mag = 10 ** Math.floor(Math.log10(v));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * mag >= v) ?? 10;
  return step * mag;
}

const axisFor = (unit: Unit) => (v: number) => (unit === "php" ? compactMoney(v) : unitValue(v, unit));

/** One measure by month with its target, for a drill-down: bars for results, a dashed line for the target. */
export function MeasureTrend({
  data,
  unit,
  band,
  direction,
  onPick,
}: {
  data: { period?: string; label: string; value: number | null; target: number | null }[];
  onPick?: (period: string) => void;
  unit: Unit;
  band?: number | null;
  direction: "higher" | "lower" | "band";
}) {
  const target = [...data].reverse().find((d) => d.target != null)?.target ?? null;
  const values = data.map((d) => d.value ?? 0);
  const rawHi = Math.max(...values, direction === "band" ? Math.abs(band ?? 0) * 1.5 : (target ?? 0) * 1.1, 1);
  // Round the top of the axis to a number people read easily: 100% for shares, else a round step × 10ⁿ.
  const hi = unit === "pct" && direction !== "band" ? Math.max(100, Math.ceil(rawHi / 10) * 10) : niceCeil(rawHi);
  const lo = Math.min(...values, direction === "band" ? -Math.abs(band ?? 0) * 1.5 : 0);
  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="#e8eaee" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "#d9dce2" }} interval={0} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={52} domain={[lo, hi]} tickFormatter={axisFor(unit)} />
          {direction === "band" ? (
            <>
              <ReferenceLine y={Math.abs(band ?? 0)} stroke={BLUE_SOFT} strokeWidth={2} strokeDasharray="6 4" />
              <ReferenceLine y={-Math.abs(band ?? 0)} stroke={BLUE_SOFT} strokeWidth={2} strokeDasharray="6 4" />
            </>
          ) : (
            target != null && <ReferenceLine y={target} stroke={BLUE_SOFT} strokeWidth={2} strokeDasharray="6 4" />
          )}
          <Tooltip
            cursor={{ fill: "rgba(29,91,164,0.06)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = (payload[0] as TipPayload).payload as { value: number | null; target: number | null };
              const rows: [string, string][] = [["Result", p.value == null ? "Not recorded" : unitValue(p.value, unit, { full: true })]];
              if (direction !== "band" && p.target != null) rows.push(["Target", unitValue(p.target, unit, { full: true })]);
              return <TipBox title={String(label)} rows={rows} />;
            }}
          />
          <Bar
            dataKey="value"
            fill={BLUE}
            radius={[4, 4, 0, 0]}
            maxBarSize={26}
            isAnimationActive={false}
            cursor={onPick ? "pointer" : undefined}
            onClick={(d: { payload?: { period?: string } }) => {
              if (onPick && d?.payload?.period) onPick(d.payload.period);
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bars for a breakdown (e.g. sales by category). Values in the measure's unit. */
export function BreakdownBars({ rows, unit }: { rows: { label: string; value: number }[]; unit: Unit }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0);
  const total = unit === "php" ? rows.reduce((s, r) => s + r.value, 0) : 0;
  if (!rows.length) return <p className="py-3 text-sm text-ink-muted">Nothing to break down this month.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${unitValue(r.value, unit, { full: true })}`}>
          <div className="mb-1 flex justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-ink-soft capitalize">{r.label.toLowerCase()}</span>
            <span className="shrink-0 tabular-nums text-ink">
              {unitValue(r.value, unit)}
              {total > 0 && <span className="ml-1.5 text-xs text-ink-muted">{Math.round((r.value / total) * 100)}%</span>}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-mist-100">
            <div className="h-1.5 rounded-full" style={{ width: `${max ? (Math.abs(r.value) / max) * 100 : 0}%`, background: BLUE }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Weight vs earned — the scorecard's own question: each category could earn
 * its weight; how much of it did it actually earn? The track is the weight,
 * the fill is what was earned. Categories with no figure are hatched.
 */
export function WeightVsEarned({
  rows,
  onPick,
}: {
  rows: { code: string; name: string; weight: number; earned: number | null; status: Status; applicable: boolean }[];
  onPick?: (code: string) => void;
}) {
  const maxW = Math.max(...rows.map((r) => r.weight), 1);
  const earned = rows.reduce((a, r) => a + (r.earned ?? 0), 0);
  const reportedWeight = rows.filter((r) => r.earned != null).reduce((a, r) => a + r.weight, 0);
  return (
    <div>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li
            key={r.code}
            className={cn(
              !r.applicable && "opacity-40",
              onPick && r.applicable && "-mx-2 cursor-pointer rounded-lg px-2 py-1 transition-colors hover:bg-mist-50",
            )}
            onClick={onPick && r.applicable ? () => onPick(r.code) : undefined}
          >
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate text-ink-soft">{r.name}</span>
              <span className="shrink-0 tabular-nums">
                {r.earned == null ? (
                  <span className="text-ink-muted">{r.applicable ? "—" : "n/a"}</span>
                ) : (
                  <span className="font-medium text-ink">{r.earned.toFixed(1)}</span>
                )}
                <span className="text-ink-muted"> of {r.weight}</span>
              </span>
            </div>
            {/* The track is as long as the weight, so a 30% category is visibly bigger than a 4% one. */}
            <div className={cn("relative h-2.5 rounded-full bg-mist-100", r.earned == null && "hatch")} style={{ width: `${(r.weight / maxW) * 100}%` }}>
              {r.earned != null && (
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${Math.max(2, (r.earned / r.weight) * 100)}%`, background: statusStroke[r.status] }}
                />
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-mist-200 pt-3 text-sm">
        <span className="text-ink-soft">Earned</span>
        <span className="tabular-nums">
          <span className="font-display text-xl text-ink">{earned.toFixed(1)}</span>
          <span className="text-ink-muted"> of 100 weight points</span>
          {reportedWeight < 100 && <span className="block text-right text-xs text-ink-muted">{reportedWeight} of the 100 have a figure</span>}
        </span>
      </div>
    </div>
  );
}
