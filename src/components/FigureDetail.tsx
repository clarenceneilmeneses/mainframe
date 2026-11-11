import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { format, parseISO, startOfYear, subYears } from "date-fns";
import { monthsEnding, monthsIn, previousRange, useBoard, type Range } from "../lib/board";
import { headlineBreakdowns, headlineMonth, headlineValue, type BusinessHeadlines, type HeadlineDef } from "../lib/sample";
import { unitValue } from "../lib/format";
import { cn } from "../lib/utils";
import { rangeNoun, useRange, useWithPeriod } from "./board-bits";
import { BreakdownBars, ThisYearVsLast } from "./viz";

/*
 * Tap one of a business's top four numbers and its page opens: the figure,
 * how it moved, a year against the year before, what it is made of, and the
 * last months. A page of its own (/c/nam-trading/top/sales) so it fills the
 * screen and can be shared.
 */

export function useFigure() {
  const navigate = useNavigate();
  const withPeriod = useWithPeriod();
  return { open: (slug: string, code: string) => navigate(withPeriod(`/c/${slug}/top/${code}`)) };
}

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const yearBack = (p: string) => iso(subYears(parseISO(p), 1));

export function FigureView({ b, def, range }: { b: BusinessHeadlines; def: HeadlineDef; range: Range }) {
  const { data } = useBoard();
  const { setRange } = useRange();
  const company = data?.companies.find((c) => c.slug === b.slug);
  const months = monthsIn(range);
  const before = monthsIn(previousRange(range));
  const lastYear = months.map(yearBack);
  const now = headlineValue(b.slug, def, months);
  const prev = headlineValue(b.slug, def, before);
  const ly = headlineValue(b.slug, def, lastYear);
  const vs = rangeNoun(range).startsWith("these") ? "the period before" : "last month";

  const trailing = monthsEnding(range.to, 12);
  const series = trailing.map((p) => ({ period: p, label: format(parseISO(p), "MMM"), value: headlineMonth(b.slug, def, p), last: headlineMonth(b.slug, def, yearBack(p)) }));
  const known = series.filter((s): s is typeof s & { value: number } => s.value != null);
  const best = known.reduce<(typeof known)[number] | null>((a, s) => (!a || s.value > a.value ? s : a), null);
  const worst = known.reduce<(typeof known)[number] | null>((a, s) => (!a || s.value < a.value ? s : a), null);
  const avg = known.length ? known.reduce((a, s) => a + s.value, 0) / known.length : null;
  const ytdMonths = monthsIn({ from: iso(startOfYear(parseISO(range.to))), to: range.to });
  const ytd = headlineValue(b.slug, def, ytdMonths);
  const ytdLast = headlineValue(b.slug, def, ytdMonths.map(yearBack));
  const yearStart = headlineMonth(b.slug, def, ytdMonths[0]);

  const stats: { label: string; value: string; sub?: React.ReactNode }[] =
    def.agg === "sum"
      ? [
          { label: `${format(parseISO(range.to), "yyyy")} so far`, value: unitValue(ytd, def.unit), sub: <Diff def={def} now={ytd} before={ytdLast} suffix="on last year" /> },
          { label: "Monthly average", value: unitValue(avg, def.unit), sub: "over the last 12 months" },
          { label: "Best month", value: unitValue(best?.value, def.unit), sub: best ? format(parseISO(best.period), "MMMM yyyy") : "—" },
          { label: "Slowest month", value: unitValue(worst?.value, def.unit), sub: worst ? format(parseISO(worst.period), "MMMM yyyy") : "—" },
        ]
      : [
          { label: "Start of the year", value: unitValue(yearStart, def.unit), sub: <Diff def={def} now={now} before={yearStart} suffix="since" /> },
          { label: "A year ago", value: unitValue(ly, def.unit), sub: <Diff def={def} now={now} before={ly} suffix="since" /> },
          { label: "12-month high", value: unitValue(best?.value, def.unit), sub: best ? format(parseISO(best.period), "MMMM yyyy") : "—" },
          { label: "12-month low", value: unitValue(worst?.value, def.unit), sub: worst ? format(parseISO(worst.period), "MMMM yyyy") : "—" },
        ];

  const splits = headlineBreakdowns(b, def, months);
  const recent = trailing.slice().reverse();

  const card = "rounded-2xl border border-mist-200/80 bg-white shadow-level-1";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className={cn(card, "p-5")}>
          <p className="text-xs text-ink-muted">{def.help}</p>
          <p className="mt-2 font-display text-[40px] leading-none text-ink tabular-nums sm:text-[48px]">{unitValue(now, def.unit)}</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
            <Diff def={def} now={now} before={prev} suffix={`vs ${vs}`} />
            <Diff def={def} now={now} before={ly} suffix="vs a year ago" />
          </div>
        </section>

        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-mist-200/80 bg-mist-200 shadow-level-1">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0 bg-white px-4 py-3 sm:px-5 sm:py-4">
              <p className="truncate text-[11px] font-semibold tracking-[0.08em] text-ink-muted uppercase">{s.label}</p>
              <p className="mt-1 font-display text-xl text-ink tabular-nums sm:text-2xl">{s.value}</p>
              <p className="mt-0.5 truncate text-xs text-ink-muted">{s.sub}</p>
            </div>
          ))}
        </section>
      </div>

      <section className={card}>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-5 pt-4">
          <h3 className="font-display text-base font-medium text-ink">Month by month</h3>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-brand-700" /> Last 12 months
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 border-t-2 border-dashed border-brand-300" /> A year earlier
            </span>
            <span>Tap a bar to look at that month.</span>
          </p>
        </div>
        <div className="px-2 pt-3 pb-3">
          <ThisYearVsLast data={series} unit={def.unit} name={def.label} onPick={(p) => setRange({ from: p, to: p })} height={300} />
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {splits.map((s) => (
          <section key={s.title} className={cn(card, "px-5 py-4")}>
            <h3 className="mb-3 font-display text-base font-medium text-ink">{s.title}</h3>
            <BreakdownBars rows={s.rows} unit={s.unit} />
          </section>
        ))}

        <section className={cn(card, splits.length % 2 === 0 && "lg:col-span-2")}>
          <h3 className="px-5 pt-4 pb-2 font-display text-base font-medium text-ink">The last 12 months</h3>
          <table className="w-full text-sm">
            <thead className="text-[11px] tracking-[0.08em] text-ink-muted uppercase">
              <tr className="border-b border-mist-200">
                <th className="px-5 py-2 text-left font-semibold">Month</th>
                <th className="px-3 py-2 text-right font-semibold">{def.label}</th>
                <th className="hidden px-3 py-2 text-right font-semibold sm:table-cell">A year earlier</th>
                <th className="px-5 py-2 text-right font-semibold">vs month before</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist-100">
              {recent.map((p) => {
                const v = headlineMonth(b.slug, def, p);
                const pb = headlineMonth(b.slug, def, iso(new Date(parseISO(p).getFullYear(), parseISO(p).getMonth() - 1, 1)));
                return (
                  <tr key={p} className={cn(months.includes(p) && "bg-brand-50/60")}>
                    <td className="px-5 py-2.5 text-ink-soft">{format(parseISO(p), "MMM yyyy")}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-ink tabular-nums">{unitValue(v, def.unit)}</td>
                    <td className="hidden px-3 py-2.5 text-right text-ink-muted tabular-nums sm:table-cell">{unitValue(headlineMonth(b.slug, def, yearBack(p)), def.unit)}</td>
                    <td className="px-5 py-2.5 text-right">
                      <Diff def={def} now={v} before={pb} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>

      {company && (
        <Link
          to={`/c/${company.slug}?from=${range.from.slice(0, 7)}&to=${range.to.slice(0, 7)}`}
          className="flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-brand-700 hover:underline"
        >
          Open {company.name}'s page <ArrowRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

/** ▲ 8% vs last month; rates move in points. Up is good for every headline figure. */
export function Diff({
  def,
  now,
  before,
  suffix,
  className,
}: {
  def: Pick<HeadlineDef, "unit">;
  now: number | null;
  before: number | null;
  suffix?: string;
  className?: string;
}) {
  if (now == null || before == null || before === 0) return <span className={cn("text-ink-muted", className)}>—</span>;
  const d = def.unit === "pct" ? now - before : ((now - before) / before) * 100;
  const flat = Math.abs(d) < 0.5;
  const text = def.unit === "pct" ? `${Math.abs(d).toFixed(1)} pts` : `${Math.abs(d).toFixed(0)}%`;
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium whitespace-nowrap tabular-nums", flat ? "text-ink-muted" : d > 0 ? "text-good" : "text-off", className)}>
      {flat ? "→ flat" : `${d > 0 ? "▲" : "▼"} ${text}`}
      {suffix && <span className="font-normal text-ink-muted">{suffix}</span>}
    </span>
  );
}
