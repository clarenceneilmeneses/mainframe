import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { monthsEnding, monthsIn, previousRange, thisMonth, type BoardData, type Range } from "../lib/board";
import { HEADLINES, headlineMonth, headlineValue, type BusinessHeadlines, type HeadlineDef } from "../lib/sample";
import { unitValue } from "../lib/format";
import { cn } from "../lib/utils";
import { Card } from "./ui";
import { rangeLabel, rangeNoun, useWithPeriod } from "./board-bits";
import { companyIcon } from "./Layout";

/*
 * "At a glance": each business's top four numbers, for reading on a phone.
 * The figures are samples until each business sends its own four
 * (src/lib/sample.ts); the badge says so.
 */

const SEGMENT = ["bg-brand-800", "bg-brand-600", "bg-brand-300", "bg-brand-200"];

export function AtAGlance({ data, range }: { data: BoardData; range: Range }) {
  const months = monthsIn(range);
  const before = monthsIn(previousRange(range));
  const vs = rangeNoun(range).startsWith("these") ? "the period before" : "last month";
  const running = range.to === thisMonth();

  const incomes = HEADLINES.map((b) => {
    const def = b.figures.find((f) => f.code === "income");
    return { b, now: def ? headlineValue(b.slug, def, months) : null, prev: def ? headlineValue(b.slug, def, before) : null };
  });
  const total = incomes.reduce((a, x) => a + (x.now ?? 0), 0);
  const totalPrev = incomes.reduce((a, x) => a + (x.prev ?? 0), 0);

  return (
    <section aria-labelledby="glance-title">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="glance-title" className="font-display text-lg font-medium text-ink">
          At a glance
        </h2>
        <span
          className="rounded-full bg-watch-50 px-2.5 py-0.5 text-[11px] font-medium text-watch ring-1 ring-watch/30 ring-inset"
          title="Made-up figures to show the layout. Each business's real top four replace them."
        >
          Sample figures
        </span>
        <p className="w-full text-xs text-ink-muted">
          Each business's top four for {rangeLabel(range)}
          {running ? " (month to date)" : ""}, against {vs}.
        </p>
      </div>

      <Card className="mb-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div>
            <p className="eyebrow">Group income</p>
            <p className="mt-1 font-display text-[28px] leading-none text-ink tabular-nums">{unitValue(total, "php")}</p>
          </div>
          {!running && <Change def={{ unit: "php" }} now={total} before={totalPrev} vs={vs} />}
        </div>
        <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-mist-100" aria-hidden>
          {incomes.map(({ b, now }, i) => (
            <span key={b.slug} className={cn("h-full", SEGMENT[i % SEGMENT.length], i > 0 && "border-l-2 border-white")} style={{ width: `${total ? ((now ?? 0) / total) * 100 : 0}%` }} />
          ))}
        </div>
        <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
          {incomes.map(({ b, now }, i) => (
            <li key={b.slug} className="flex min-w-0 items-center gap-1.5">
              <span className={cn("size-2 shrink-0 rounded-full", SEGMENT[i % SEGMENT.length])} aria-hidden />
              <span className="truncate text-ink-muted">{b.name.replace(/^NAM /, "").replace(/ Management$/, "")}</span>
              <span className="ml-auto font-medium text-ink tabular-nums sm:ml-0">{unitValue(now, "php")}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {HEADLINES.map((b) => (
          <BusinessCard key={b.slug} b={b} data={data} range={range} months={months} before={before} vs={vs} running={running} />
        ))}
      </div>
    </section>
  );
}

/** One business's four numbers, two by two. */
export function BusinessCard({
  b,
  data,
  range,
  months,
  before,
  vs,
  running,
  linked = true,
}: {
  b: BusinessHeadlines;
  data: BoardData;
  range: Range;
  months: string[];
  before: string[];
  vs: string;
  running: boolean;
  linked?: boolean;
}) {
  const withPeriod = useWithPeriod();
  const company = data.companies.find((c) => c.slug === b.slug);
  const Icon = companyIcon(data.companies, company?.id ?? "");
  const head = (
    <>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-ink">{company?.name ?? b.name}</span>
      {linked && company && <ChevronRight className="size-4 shrink-0 text-ink-muted" />}
    </>
  );

  return (
    <Card className="overflow-hidden">
      {linked && company ? (
        <Link to={withPeriod(`/c/${company.slug}`)} className="flex items-center gap-2.5 px-4 py-3 transition-colors hover:bg-mist-50">
          {head}
        </Link>
      ) : (
        <div className="flex items-center gap-2.5 px-4 py-3">{head}</div>
      )}
      <dl className="grid grid-cols-2 gap-px border-t border-mist-200 bg-mist-200">
        {b.figures.map((f) => (
          <Figure key={f.code} slug={b.slug} def={f} range={range} months={months} before={before} vs={vs} running={running} />
        ))}
      </dl>
    </Card>
  );
}

function Figure({
  slug,
  def,
  range,
  months,
  before,
  vs,
  running,
}: {
  slug: string;
  def: HeadlineDef;
  range: Range;
  months: string[];
  before: string[];
  vs: string;
  running: boolean;
}) {
  const now = headlineValue(slug, def, months);
  const prev = headlineValue(slug, def, before);
  const trend = monthsEnding(range.to, 12).map((p) => headlineMonth(slug, def, p));
  // A month still running has only part of its amounts in; comparing them with a whole month reads as a fall.
  const comparable = !(running && def.agg === "sum");
  return (
    <div className="min-w-0 bg-white px-3.5 py-3 sm:px-4">
      <dt className="truncate text-[11px] font-semibold tracking-[0.08em] text-ink-muted uppercase">{def.label}</dt>
      <dd className="mt-1.5 font-display text-[22px] leading-none text-ink tabular-nums">{unitValue(now, def.unit)}</dd>
      <dd className="mt-2 flex items-end justify-between gap-2">
        {comparable ? <Change def={def} now={now} before={prev} vs={vs} compact /> : <span className="text-[11px] text-ink-muted">so far</span>}
        <MiniBars values={trend} />
      </dd>
    </div>
  );
}

/** ▲ 8% vs last month; rates move in points. Up is good for every headline figure. */
function Change({
  def,
  now,
  before,
  vs,
  compact = false,
}: {
  def: Pick<HeadlineDef, "unit">;
  now: number | null;
  before: number | null;
  vs: string;
  compact?: boolean;
}) {
  if (now == null || before == null || before === 0) return <span className="text-[11px] text-ink-muted">—</span>;
  const diff = def.unit === "pct" ? now - before : ((now - before) / before) * 100;
  const flat = Math.abs(diff) < 0.5;
  const text = def.unit === "pct" ? `${Math.abs(diff).toFixed(1)} pts` : `${Math.abs(diff).toFixed(0)}%`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium whitespace-nowrap tabular-nums",
        compact ? "text-[12px]" : "text-[13px]",
        flat ? "text-ink-muted" : diff > 0 ? "text-good" : "text-off",
      )}
      title={`vs ${vs}: ${unitValue(before, def.unit)}`}
    >
      {flat ? "→ flat" : `${diff > 0 ? "▲" : "▼"} ${text}`}
      {!compact && <span className="font-normal text-ink-muted">vs {vs}</span>}
    </span>
  );
}

/** Twelve months as tiny bars, scaled between the series' own low and high so the movement shows. */
function MiniBars({ values }: { values: (number | null)[] }) {
  const nums = values.filter((v): v is number => v != null);
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return (
    <span className="flex h-5 shrink-0 items-end gap-[2px]" aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className={cn("w-[4px] rounded-t-[1.5px]", v == null ? "h-[2px] bg-mist-200" : i === values.length - 1 ? "bg-brand-700" : "bg-brand-200")}
          style={v == null ? undefined : { height: `${hi > lo ? 25 + ((v - lo) / (hi - lo)) * 75 : 60}%` }}
        />
      ))}
    </span>
  );
}
