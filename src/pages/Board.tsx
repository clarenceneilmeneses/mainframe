import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, CircleDashed, CircleHelp, ClipboardPen } from "lucide-react";
import {
  companyScore,
  DEV_SNAPSHOT,
  groupScore,
  measureCounts,
  previousRange,
  trendMonths,
  type BoardData,
  type Company,
  type Range,
} from "../lib/board";
import { statusOf, type CategoryResult, type MeasureResult } from "../lib/scoring";
import { unitValue } from "../lib/format";
import { canEdit, useAuth } from "../lib/auth";
import { cn } from "../lib/utils";
import { Button, Card, CardHeader, Modal, PageHeader, StatTile, StatusBadge, Tabs } from "../components/ui";
import { BoardGate, rangeNoun, useRange, useWithPeriod } from "../components/board-bits";
import { useDrill } from "../components/Drilldown";
import { HowItScoresSteps } from "../components/HowItScores";
import { ScoreRing, Sparkbars } from "../components/viz";
import { companyIcon } from "../components/Layout";

/** Short column heads for the matrix; the full names are in the tooltip and the drill-down. */
export const SHORT: Record<string, string> = {
  sales: "Sales",
  finance: "Finance",
  projects: "Projects",
  procurement: "Procurement",
  supply: "Delivery",
  quality: "Quality",
  hr: "People",
  governance: "Governance",
  customer: "Customers",
};

const tint = {
  on: "bg-good-50 hover:ring-good/40",
  watch: "bg-watch-50 hover:ring-watch/40",
  off: "bg-off-50 hover:ring-off/40",
  none: "hatch bg-mist-50 hover:ring-mist-300",
} as const;
const dot = { on: "bg-good", watch: "bg-watch", off: "bg-off", none: "bg-mist-300" } as const;

type View = "pct" | "points";

/**
 * The KPI board. Top to bottom: the headline numbers, every business against
 * every category in one grid (click a cell to drill in), then what needs
 * attention and what hasn't been reported.
 */
export default function Board() {
  const { range, label, months } = useRange();
  const { role } = useAuth();
  const editable = DEV_SNAPSHOT || canEdit(role);
  const [howOpen, setHowOpen] = useState(false);

  return (
    <>
      <PageHeader
        eyebrow="2027 KPI scorecard"
        title="KPI board"
        description={`${label}${months > 1 ? ` (${months} months)` : ""} · how each business is tracking against its targets.`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setHowOpen(true)}>
              <CircleHelp className="size-4" /> How it's scored
            </Button>
            {editable && (
              <Link
                to={`/entry?m=${range.to.slice(0, 7)}`}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-medium text-mist-50 shadow-level-1 hover:bg-brand-700/90"
              >
                <ClipboardPen className="size-4" /> Record results
              </Link>
            )}
          </>
        }
      />
      <BoardGate>{(d) => <Body data={d} range={range} />}</BoardGate>
      <Modal open={howOpen} onClose={() => setHowOpen(false)} title="How the score is worked out" description="The same rule for every business, every month." size="lg">
        <div className="-mx-6 -my-5 overflow-hidden">
          <HowItScoresSteps />
        </div>
      </Modal>
    </>
  );
}

function Body({ data, range }: { data: BoardData; range: Range }) {
  const prevR = previousRange(range);
  const scores = data.companies.map((c) => ({ company: c, s: companyScore(data, c.id, range), prev: companyScore(data, c.id, prevR) }));
  const group = groupScore(data, range);
  const groupPrev = groupScore(data, prevR);
  const counts = scores.map((x) => measureCounts(x.s)).reduce(
    (a, c) => ({ on: a.on + c.on, watch: a.watch + c.watch, off: a.off + c.off, missing: a.missing + c.missing }),
    { on: 0, watch: 0, off: 0, missing: 0 },
  );
  const reported = counts.on + counts.watch + counts.off;
  const total = reported + counts.missing;
  const [view, setView] = useState<View>("pct");
  const vs = rangeNoun(range).startsWith("these") ? "the period before" : "last month";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Card className="col-span-2 flex items-center gap-4 p-5 lg:col-span-1">
          <ScoreRing score={group} status={statusOf(group)} size={84} stroke={8} />
          <div className="min-w-0">
            <p className="eyebrow">Group score</p>
            <Delta now={group} before={groupPrev} vs={vs} className="mt-1.5" />
            <p className="mt-1 text-xs text-ink-muted">Average of the businesses that reported</p>
          </div>
        </Card>
        <StatTile
          label="KPIs on target"
          value={
            <>
              {counts.on}
              <span className="text-base text-ink-muted"> / {reported}</span>
            </>
          }
          sub="of the measures reported"
          icon={<CheckCircle2 />}
        />
        <StatTile
          label="Below target"
          value={counts.off + counts.watch}
          sub={`${counts.off} off target · ${counts.watch} to watch`}
          icon={<AlertTriangle />}
          tone={counts.off > 0 ? "warn" : "default"}
        />
        <StatTile
          label="Not reported"
          value={
            <>
              {counts.missing}
              <span className="text-base text-ink-muted"> / {total}</span>
            </>
          }
          sub="measures with no figure yet"
          icon={<CircleDashed />}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Every business, every category"
          description={
            view === "pct"
              ? "How close each category came to its target. Click a cell to see the numbers underneath."
              : "Points earned against each category's weight — the weights add up to 100. Click a cell to see the numbers underneath."
          }
          action={
            <Tabs
              value={view}
              onChange={setView}
              items={[
                { value: "pct", label: "% of target" },
                { value: "points", label: "Earned vs weight" },
              ]}
            />
          }
          className="flex-wrap"
        />
        <Matrix data={data} rows={scores} range={range} view={view} />
        <div className="flex flex-wrap items-center gap-2 border-t border-mist-200 px-5 py-3 text-xs text-ink-muted">
          <StatusBadge status="on" label="On target · 95%+" />
          <StatusBadge status="watch" label="Watch · 85–94%" />
          <StatusBadge status="off" label="Off target · under 85%" />
          <span className="inline-flex items-center gap-1.5">
            <span className="hatch inline-block size-3.5 rounded bg-mist-50 ring-1 ring-mist-200" /> Not reported
          </span>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Attention rows={scores} />
        <Missing rows={scores} range={range} />
      </div>
    </div>
  );
}

function Delta({ now, before, vs, className }: { now: number | null; before: number | null; vs: string; className?: string }) {
  if (now == null) return <p className={cn("text-xs text-ink-muted", className)}>Nothing reported</p>;
  const diff = before == null ? null : now - before;
  return (
    <p className={cn("flex items-baseline gap-2", className)}>
      {diff != null && Math.abs(diff) >= 0.05 ? (
        <span className={cn("inline-flex items-center gap-0.5 text-[13px] font-medium whitespace-nowrap tabular-nums", diff > 0 ? "text-good" : "text-off")}>
          {diff > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
          {Math.abs(diff).toFixed(1)} vs {vs}
        </span>
      ) : diff != null ? (
        <span className="text-xs text-ink-muted">same as {vs}</span>
      ) : (
        <span className="text-xs text-ink-muted">nothing earlier to compare</span>
      )}
    </p>
  );
}

type Row = { company: Company; s: ReturnType<typeof companyScore>; prev: ReturnType<typeof companyScore> };

function Cell({ c, onOpen, view, compact = false }: { c: CategoryResult; onOpen: () => void; view: View; compact?: boolean }) {
  const pct = c.attainment == null ? null : c.attainment * 100;
  const status = c.applicable ? statusOf(pct) : "none";
  const w = Number(c.def.weight);
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!c.applicable}
      title={`${c.def.name}: ${pct == null ? "not reported" : `${Math.round(pct)}% of target, ${c.points?.toFixed(1)} of ${w} weight points`}`}
      className={cn(
        "flex w-full cursor-pointer flex-col items-center justify-center rounded-lg ring-1 ring-transparent transition-shadow disabled:cursor-default disabled:opacity-40",
        compact ? "h-12" : "h-14",
        tint[status],
      )}
    >
      <span className="font-display text-[15px] leading-none text-ink tabular-nums">
        {!c.applicable ? "n/a" : pct == null ? "—" : view === "pct" ? `${Math.round(pct)}%` : c.points!.toFixed(1)}
      </span>
      {c.applicable && (view === "points" || c.points != null) && (
        <span className="mt-1 text-[10px] text-ink-muted tabular-nums">
          {view === "points" ? `of ${w}` : `${c.points!.toFixed(1)}/${w}`}
        </span>
      )}
    </button>
  );
}

function ScoreBlock({ s, prev, data, company, range }: { s: Row["s"]; prev: Row["prev"]; data: BoardData; company: Company; range: Range }) {
  const trend = trendMonths(range, 6)
    .slice(-12)
    .map((p) => companyScore(data, company.id, p).score);
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", dot[s.status])} aria-hidden />
          <span className="font-display text-lg text-ink tabular-nums">{s.score == null ? "—" : s.score.toFixed(1)}</span>
        </span>
        <Sparkbars values={trend} />
      </div>
      {s.score != null && prev.score != null && (
        <span className={cn("text-[11px] tabular-nums", s.score >= prev.score ? "text-good" : "text-off")}>
          {s.score >= prev.score ? "▲" : "▼"} {Math.abs(s.score - prev.score).toFixed(1)} vs before
        </span>
      )}
    </>
  );
}

function Matrix({ data, rows, range, view }: { data: BoardData; rows: Row[]; range: Range; view: View }) {
  const drill = useDrill();
  const withPeriod = useWithPeriod();
  const cats = [...data.categories].sort((a, b) => a.sort - b.sort);

  return (
    <>
      {/* Laptop: businesses down, categories across. */}
      <div className="hidden overflow-x-clip lg:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[210px]" />
            <col className="w-[132px]" />
            {cats.map((c) => (
              <col key={c.code} />
            ))}
          </colgroup>
          <thead>
            <tr className="text-[11px] text-ink-muted">
              <th className="px-5 pt-3 pb-2 text-left font-semibold tracking-[0.12em] uppercase">Business</th>
              <th className="px-2 pt-3 pb-2 text-left font-semibold tracking-[0.12em] uppercase">Score</th>
              {cats.map((c) => (
                <th key={c.code} className="px-1 pt-3 pb-2 text-center font-medium" title={c.name}>
                  <span className="block truncate text-[12px] text-ink-soft">{SHORT[c.code] ?? c.name}</span>
                  <span className="tabular-nums">weight {Number(c.weight)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ company, s, prev }) => {
              const Icon = companyIcon(data.companies, company.id);
              return (
                <tr key={company.id} className="border-t border-mist-200">
                  <td className="px-5 py-3">
                    <Link to={withPeriod(`/c/${company.slug}`)} className="group flex items-center gap-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink group-hover:text-brand-700 group-hover:underline">{company.name}</span>
                        <span className="block text-xs text-ink-muted">{s.score == null ? "Nothing reported" : `${Math.round(s.coverage)}% reported`}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-2 py-3">
                    <ScoreBlock s={s} prev={prev} data={data} company={company} range={range} />
                  </td>
                  {s.categories.map((c) => (
                    <td key={c.def.code} className="px-1 py-2">
                      <Cell c={c} view={view} onOpen={() => drill.open(company.slug, c.def.code)} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phone and tablet: one block per business, the categories in a 3 × 3 grid. */}
      <ul className="divide-y divide-mist-200 lg:hidden">
        {rows.map(({ company, s }) => (
          <li key={company.id} className="px-4 py-4">
            <Link to={withPeriod(`/c/${company.slug}`)} className="mb-3 flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{company.name}</span>
                <span className="block text-xs text-ink-muted">{s.score == null ? "Nothing reported" : `${Math.round(s.coverage)}% reported`}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className={cn("size-2 rounded-full", dot[s.status])} aria-hidden />
                <span className="font-display text-xl tabular-nums">{s.score == null ? "—" : s.score.toFixed(1)}</span>
                <ArrowRight className="size-4 text-ink-muted" />
              </span>
            </Link>
            <div className="grid grid-cols-3 gap-1.5">
              {s.categories.map((c) => (
                <div key={c.def.code} className="min-w-0">
                  <Cell c={c} view={view} compact onOpen={() => drill.open(company.slug, c.def.code)} />
                  <p className="mt-1 truncate text-center text-[11px] text-ink-muted">{SHORT[c.def.code] ?? c.def.name}</p>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function Attention({ rows }: { rows: Row[] }) {
  const drill = useDrill();
  const items = rows
    .flatMap(({ company, s }) =>
      s.categories.flatMap((c) =>
        c.measures
          .filter((m) => m.attainment != null && m.attainment < 0.95)
          .map((m) => ({ company, cat: c, m })),
      ),
    )
    .sort((a, b) => (a.m.attainment ?? 0) - (b.m.attainment ?? 0))
    .slice(0, 8);

  return (
    <Card>
      <CardHeader title="Needs attention" description="Measures below target, furthest off first." />
      {items.length ? (
        <ul className="divide-y divide-mist-200">
          {items.map(({ company, cat, m }) => (
            <li key={`${company.id}:${m.def.code}`}>
              <button
                type="button"
                onClick={() => drill.open(company.slug, cat.def.code)}
                className="flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-mist-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{m.def.name}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {company.name} · {valueVsTarget(m)}
                  </span>
                </span>
                <StatusBadge status={statusOf((m.attainment ?? 0) * 100)} label={`${Math.round((m.attainment ?? 0) * 100)}%`} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 px-5 py-6 text-sm text-ink-muted">
          <CheckCircle2 className="size-4 text-good" /> Everything reported is on target.
        </p>
      )}
    </Card>
  );
}

function valueVsTarget(m: MeasureResult) {
  const v = unitValue(m.actual, m.def.unit);
  if (m.def.direction === "band") return `${v}, aim within ±${unitValue(m.def.band, m.def.unit)}`;
  return `${v} vs ${unitValue(m.target, m.def.unit)} target`;
}

function Missing({ rows, range }: { rows: Row[]; range: Range }) {
  const m = range.to.slice(0, 7);
  return (
    <Card>
      <CardHeader title="Not reported yet" description={`Categories with no figure for ${rangeNoun(range)}. They don't count against the score, but they hide it.`} />
      <ul className="divide-y divide-mist-200">
        {rows.map(({ company, s }) => {
          const gaps = s.categories.filter((c) => c.applicable && c.points == null);
          return (
            <li key={company.id} className="flex items-start gap-3 px-5 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{company.name}</span>
                <span className="block text-xs leading-relaxed text-ink-muted">
                  {gaps.length ? gaps.map((c) => SHORT[c.def.code] ?? c.def.name).join(" · ") : "Everything is in."}
                </span>
              </span>
              {gaps.length > 0 && (
                <Link to={`/entry?c=${company.slug}&m=${m}`} className="shrink-0 text-sm font-medium text-brand-700 hover:underline">
                  Record
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
