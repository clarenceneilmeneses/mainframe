import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, ClipboardPen, RefreshCw } from "lucide-react";
import { companyScore, DEV_SNAPSHOT, measureSeries, previousRange, useBoard, type BoardData, type Range } from "../lib/board";
import { statusOf, type MeasureResult } from "../lib/scoring";
import { money, unitValue } from "../lib/format";
import { canEdit, useAuth } from "../lib/auth";
import { Sheet, StatusBadge } from "./ui";
import { rangeLabel, rangeNoun, useRange } from "./board-bits";
import { AttainmentBar, BreakdownBars, MeasureTrend, ScoreRing, WeightVsEarned } from "./viz";

/**
 * The drill-down: click any category anywhere and this panel opens with what
 * sits underneath it — each measure, a year of history against the target,
 * and for synced figures the breakdown the number was built from.
 * Lives in the URL (?d=nam-supply~sales), so a drill-down can be shared.
 */
export function useDrill() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("d");
  const [slug, category] = raw?.split("~") ?? [];
  const set = (v: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v) next.set("d", v);
        else next.delete("d");
        return next;
      },
      { replace: false },
    );
  return {
    slug: slug ?? null,
    category: category ?? null,
    open: (s: string, c: string) => set(`${s}~${c}`),
    close: () => set(null),
  };
}

export function Drilldown() {
  const { data } = useBoard();
  const drill = useDrill();
  const { range } = useRange();
  const company = data?.companies.find((c) => c.slug === drill.slug);
  const cat = data?.categories.find((c) => c.code === drill.category);
  // "~score" opens the business's score itself: where its points came from.
  const scoreView = drill.category === "score";
  const open = Boolean(data && company && (cat || scoreView));

  return (
    <Sheet
      open={open}
      onClose={drill.close}
      title={
        company && (cat || scoreView) ? (
          <div className="min-w-0">
            <p className="eyebrow truncate">
              {company.name} · {rangeLabel(range)}
            </p>
            <p className="truncate font-display text-lg font-medium text-ink">{scoreView ? "Where the score comes from" : cat!.name}</p>
          </div>
        ) : null
      }
    >
      {open && data && company && scoreView && (
        <ScoreBody data={data} companyId={company.id} slug={company.slug} range={range} onOpen={(c) => drill.open(company.slug, c)} />
      )}
      {open && data && company && cat && <Body data={data} companyId={company.id} slug={company.slug} categoryCode={cat.code} range={range} />}
    </Sheet>
  );
}

function Body({ data, companyId, slug, categoryCode, range }: { data: BoardData; companyId: string; slug: string; categoryCode: string; range: Range }) {
  const s = companyScore(data, companyId, range);
  const c = s.categories.find((x) => x.def.code === categoryCode)!;
  const status = statusOf(c.attainment == null ? null : c.attainment * 100);
  const { role } = useAuth();
  const editable = DEV_SNAPSHOT || canEdit(role);
  const m = range.to.slice(0, 7);

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="rounded-2xl border border-mist-200 bg-white p-4 shadow-level-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Category score</p>
            <p className="mt-1 font-display text-[28px] leading-none text-ink tabular-nums">
              {c.points == null ? "—" : c.points.toFixed(1)}
              <span className="text-base text-ink-muted"> / {Number(c.def.weight)} pts</span>
            </p>
          </div>
          <StatusBadge status={status} />
        </div>
        <AttainmentBar value={c.attainment} status={status} className="mt-3" />
        <p className="mt-3 text-[13px] leading-snug text-ink-muted">
          <span className="font-medium text-ink-soft">The target:</span> {c.def.target_text}
        </p>
      </div>

      {c.measures.map((mr) => (
        <MeasureBlock key={mr.def.code} data={data} companyId={companyId} mr={mr} range={range} recordHref={editable ? `/entry?c=${slug}&m=${m}` : null} />
      ))}

      <Link to={`/c/${slug}?from=${range.from.slice(0, 7)}&to=${m}`} className="flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-brand-700 hover:underline">
        Open the full scorecard <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

function howWorkedOut(mr: MeasureResult): string | null {
  const d = mr.row?.detail as Record<string, number> | null | undefined;
  if (!d) return null;
  switch (mr.def.code) {
    case "sales_vs_target":
      return d.sales_rows != null ? `Total of ${d.sales_rows.toLocaleString("en-PH")} sales lines${d.months_reported > 1 ? ` across ${d.months_reported} months` : " dated this month"}.` : null;
    case "gross_margin":
      return d.income != null ? `${money(d.income)} gross profit on ${money(d.sales)} of sales.` : null;
    case "pipeline_cover":
      return d.open_quotes_value != null
        ? d.months_reported > 1
          ? `Average of the ${d.months_reported} month-end readings: quotes still pending from the 60 days before each month end ÷ the monthly target.`
          : `${money(d.open_quotes_value)} in quotes still pending (${d.quote_lines} lines from the last ${d.window_days} days) ÷ the ${money(d.sales_target)} monthly target.`
        : null;
    case "collections":
      return d.amount_due != null
        ? `${money(d.collected)} collected of the ${money(d.amount_due)} that fell due${d.months_reported > 1 ? " in the period" : " this month"} (${d.lines_due.toLocaleString("en-PH")} delivered lines).`
        : null;
    default:
      return null;
  }
}

function MeasureBlock({
  data,
  companyId,
  mr,
  range,
  recordHref,
}: {
  data: BoardData;
  companyId: string;
  mr: MeasureResult;
  range: Range;
  recordHref: string | null;
}) {
  const status = statusOf(mr.attainment == null ? null : mr.attainment * 100);
  const series = measureSeries(data, companyId, mr.def.code, range);
  const hasHistory = series.some((p) => p.value != null);
  const breakdowns = ((mr.row?.detail as { breakdowns?: { title: string; unit: "php" | "pct"; rows: { label: string; value: number }[] }[] } | null)
    ?.breakdowns ?? []).filter((b) => b.rows.length);
  const how = howWorkedOut(mr);
  const { setRange } = useRange();
  const pickMonth = (p: string) => setRange({ from: p, to: p });
  const target =
    mr.def.direction === "band"
      ? `within ±${unitValue(mr.def.band, mr.def.unit)}`
      : mr.target == null
        ? "no target set"
        : `${mr.def.direction === "lower" ? "at most" : "at least"} ${unitValue(mr.target, mr.def.unit)}`;

  if (!mr.applicable) {
    return (
      <section className="rounded-2xl border border-dashed border-mist-300 px-4 py-3 text-sm text-ink-muted">
        {mr.def.name} doesn't apply to this business.
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-mist-200 bg-white shadow-level-1">
      <header className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {mr.def.name}
            {mr.source === "system" && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 align-middle text-[10px] font-semibold tracking-wide text-brand-700 uppercase">
                <RefreshCw className="size-3" /> Synced
              </span>
            )}
          </p>
          {mr.def.help && <p className="mt-0.5 text-xs text-ink-muted">{mr.def.help}</p>}
        </div>
        {mr.actual != null && <StatusBadge status={status} label={`${Math.round((mr.attainment ?? 0) * 100)}% of target`} />}
      </header>

      <div className="px-4 pt-3">
        {mr.actual == null ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-mist-50 px-3 py-2.5 text-sm text-ink-muted">
            Not recorded for {rangeNoun(range)}.
            {recordHref && mr.source !== "system" && (
              <Link to={recordHref} className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline">
                <ClipboardPen className="size-3.5" /> Record it
              </Link>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            <span className="font-display text-2xl text-ink tabular-nums">{unitValue(mr.actual, mr.def.unit, { full: true })}</span>
            <span className="ml-2">target {target}</span>
          </p>
        )}
        {how && <p className="mt-1.5 text-xs text-ink-muted">{how}</p>}
      </div>

      {hasHistory && (
        <div className="px-2 pt-3">
          <p className="px-2 pb-1 text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Month by month</p>
          <MeasureTrend data={series} unit={mr.def.unit} band={mr.def.band} direction={mr.def.direction} onPick={pickMonth} />
          <p className="px-2 pb-1 text-[11px] text-ink-muted">Click a month to look at just that month.</p>
        </div>
      )}

      {breakdowns.map((b) => (
        <div key={b.title} className="border-t border-mist-200 px-4 py-3.5">
          <p className="mb-2.5 text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">{b.title}</p>
          <BreakdownBars rows={b.rows} unit={b.unit} />
        </div>
      ))}
      {!breakdowns.length && <div className="h-4" />}
    </section>
  );
}

/** A business's score taken apart: each category's weight against what it earned, and what changed. */
function ScoreBody({
  data,
  companyId,
  slug,
  range,
  onOpen,
}: {
  data: BoardData;
  companyId: string;
  slug: string;
  range: Range;
  onOpen: (category: string) => void;
}) {
  const s = companyScore(data, companyId, range);
  const before = companyScore(data, companyId, previousRange(range));
  const earned = s.categories.reduce((a, c) => a + (c.points ?? 0), 0);
  const reportedWeight = s.categories.filter((c) => c.points != null).reduce((a, c) => a + Number(c.def.weight), 0);
  const moves = s.categories
    .map((c) => {
      const b = before.categories.find((x) => x.def.code === c.def.code);
      return { c, diff: c.points != null && b?.points != null ? c.points - b.points : null };
    })
    .filter((x): x is { c: typeof x.c; diff: number } => x.diff != null && Math.abs(x.diff) >= 0.05)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex items-center gap-4 rounded-2xl border border-mist-200 bg-white p-4 shadow-level-1">
        <ScoreRing score={s.score} status={s.status} size={88} stroke={8} />
        <div className="min-w-0 text-sm text-ink-muted">
          <StatusBadge status={s.status} />
          <p className="mt-2 leading-snug">
            {s.score == null
              ? "Nothing reported for this period."
              : `Earned ${earned.toFixed(2)} of the ${reportedWeight} weight points that have a figure, so the score is ${earned.toFixed(2)} ÷ ${reportedWeight} × 100 = ${s.score.toFixed(1)}.`}
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-mist-200 bg-white p-4 shadow-level-1">
        <p className="mb-3 text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Weight vs earned · click one to open it</p>
        <WeightVsEarned
          onPick={onOpen}
          rows={s.categories.map((c) => ({
            code: c.def.code,
            name: c.def.name,
            weight: Number(c.def.weight),
            earned: c.points,
            status: statusOf(c.attainment == null ? null : c.attainment * 100),
            applicable: c.applicable,
          }))}
        />
      </section>

      {moves.length > 0 && (
        <section className="rounded-2xl border border-mist-200 bg-white p-4 shadow-level-1">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">What moved since the period before</p>
          <ul className="divide-y divide-mist-100">
            {moves.map(({ c, diff }) => (
              <li key={c.def.code}>
                <button
                  type="button"
                  onClick={() => onOpen(c.def.code)}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 py-2 text-left text-sm hover:text-brand-700"
                >
                  <span className="min-w-0 truncate text-ink-soft">{c.def.name}</span>
                  <span className={diff > 0 ? "shrink-0 text-good tabular-nums" : "shrink-0 text-off tabular-nums"}>
                    {diff > 0 ? "▲" : "▼"} {Math.abs(diff).toFixed(1)} pts
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        to={`/c/${slug}?from=${range.from.slice(0, 7)}&to=${range.to.slice(0, 7)}`}
        className="flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-brand-700 hover:underline"
      >
        Open the full scorecard <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
