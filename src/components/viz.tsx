import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Status } from "../lib/scoring";
import { compactMoney, money } from "../lib/format";
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
export function ScoreTrend({ data }: { data: { label: string; score: number | null; coverage: number }[] }) {
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
          <Bar dataKey="score" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
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
}: {
  data: { label: string; value: number | null; target: number | null }[];
  target: number | null;
  name: string;
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
          <Bar dataKey="value" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
