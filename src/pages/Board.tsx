import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, CircleDashed, CircleHelp, ClipboardPen, Gauge, Hourglass, TrendingDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  companyScore,
  thisMonth,
  DEV_SNAPSHOT,
  groupScore,
  measureCounts,
  previousRange,
  scorecardFor,
  shortName,
  trendMonths,
  type BoardData,
  type Company,
  type Range,
} from "../lib/board";
import { drags, statusOf, type CategoryResult, type Drag, type MeasureResult } from "../lib/scoring";
import { unitValue } from "../lib/format";
import { canEdit, useAuth } from "../lib/auth";
import { cn } from "../lib/utils";
import { Button, Card, CardHeader, Modal, PageHeader, StatTile, StatusBadge, Tabs } from "../components/ui";
import { BoardGate, rangeLabel, rangeNoun, useRange, useWithPeriod } from "../components/board-bits";
import { useDrill } from "../components/Drilldown";
import { HowItScoresSteps } from "../components/HowItScores";
import { ScoreRing, Sparkbars } from "../components/viz";
import { companyIcon } from "../components/Layout";

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
        eyebrow="KPI scorecards"
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
      <BoardGate>{(d) => <Body data={d} range={range} editable={editable} />}</BoardGate>
      <Modal
        open={howOpen}
        onClose={() => setHowOpen(false)}
        title="How the score is worked out"
        description="The same rule for every business, every month."
        size="lg"
        footer={
          <Link to="/guide" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
            See it worked out with the real numbers <ArrowRight className="size-4" />
          </Link>
        }
      >
        <div className="-mx-6 -my-5 overflow-hidden">
          <HowItScoresSteps />
        </div>
      </Modal>
    </>
  );
}

function Body({ data, range, editable }: { data: BoardData; range: Range; editable: boolean }) {
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
  const [list, setList] = useState<ListKind | null>(null);
  const vs = rangeNoun(range).startsWith("these") ? "the period before" : "last month";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <button type="button" onClick={() => setList("group")} className={cn(tileBtn, "col-span-2 lg:col-span-1")}>
          <Card className="lift flex h-full items-center gap-4 p-5">
            <ScoreRing score={group} status={statusOf(group)} size={84} stroke={8} />
            <div className="min-w-0">
              <p className="eyebrow">Group score</p>
              <Delta now={group} before={groupPrev} vs={vs} className="mt-1.5" />
              <p className="mt-1 text-xs text-ink-muted">Average of the businesses that reported</p>
            </div>
          </Card>
        </button>
        <button type="button" onClick={() => setList("on")} className={tileBtn}>
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
        </button>
        <button type="button" onClick={() => setList("below")} className={tileBtn}>
        <StatTile
          label="Below target"
          value={counts.off + counts.watch}
          sub={`${counts.off} off target · ${counts.watch} to watch`}
          icon={<AlertTriangle />}
          tone={counts.off > 0 ? "warn" : "default"}
        />
        </button>
        <button type="button" onClick={() => setList("missing")} className={cn(tileBtn, "col-span-2 lg:col-span-1")}>
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
        />
        </button>
      </div>
      <ListModal kind={list} onClose={() => setList(null)} rows={scores} range={range} vs={vs} />

      <InShort rows={scores} range={range} group={group} groupPrev={groupPrev} vs={vs} missing={counts.missing} total={total} editable={editable} />

      <Card className="overflow-hidden">
        <CardHeader
          title="Every business, every category"
          description={
            view === "pct"
              ? "Each business on its own scorecard: how close each category came to its target. Click a cell to see the numbers underneath."
              : "Points earned against each category's weight — every scorecard's weights add up to 100. Click a cell to see the numbers underneath."
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

const tileBtn =
  "block h-full w-full cursor-pointer rounded-2xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700";

type ListKind = "group" | "on" | "below" | "missing";

const LIST_TITLE: Record<ListKind, { title: string; description: string }> = {
  group: { title: "Group score, by business", description: "The group score is the average of these. Click one to see where its score comes from." },
  on: { title: "KPIs on target", description: "Measures at 95% of target or better. Click one to drill in." },
  below: { title: "Below target", description: "Measures under 95% of target, furthest off first. Click one to drill in." },
  missing: { title: "Not reported", description: "Measures with no figure for this period, by business." },
};

/** What sits behind each headline tile. */
function ListModal({ kind, onClose, rows, range, vs }: { kind: ListKind | null; onClose: () => void; rows: Row[]; range: Range; vs: string }) {
  const drill = useDrill();
  const go = (slug: string, code: string) => {
    onClose();
    drill.open(slug, code);
  };
  const measures = rows.flatMap(({ company, s }) =>
    s.categories.flatMap((c) => c.measures.filter((m) => m.applicable).map((m) => ({ company, cat: c, m }))),
  );
  const m = range.to.slice(0, 7);
  let body: React.ReactNode = null;

  if (kind === "group") {
    body = (
      <ul className="divide-y divide-mist-200">
        {rows.map(({ company, s, prev }) => (
          <li key={company.id}>
            <button type="button" onClick={() => go(company.slug, "score")} className="flex w-full cursor-pointer items-center gap-3 py-3 text-left hover:text-brand-700">
              <span className={cn("size-2 shrink-0 rounded-full", dot[s.status])} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{company.name}</span>
                <span className="block text-xs text-ink-muted">{s.score == null ? "Nothing reported — left out of the average" : `${Math.round(s.coverage)}% of the scorecard reported`}</span>
              </span>
              <span className="shrink-0 text-right tabular-nums">
                <span className="block font-display text-xl text-ink">{s.score == null ? "—" : s.score.toFixed(1)}</span>
                {s.score != null && prev.score != null && (
                  <span className={cn("text-[11px]", s.score >= prev.score ? "text-good" : "text-off")}>
                    {s.score >= prev.score ? "▲" : "▼"} {Math.abs(s.score - prev.score).toFixed(1)} vs {vs}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  } else if (kind === "on" || kind === "below") {
    const items = measures
      .filter(({ m: x }) => x.attainment != null && (kind === "on" ? x.attainment >= 0.95 : x.attainment < 0.95))
      .sort((a, b) => (kind === "on" ? (b.m.attainment ?? 0) - (a.m.attainment ?? 0) : (a.m.attainment ?? 0) - (b.m.attainment ?? 0)));
    body = items.length ? (
      <ul className="divide-y divide-mist-200">
        {items.map(({ company, cat, m: x }) => (
          <li key={company.id + x.def.code}>
            <button type="button" onClick={() => go(company.slug, cat.def.code)} className="flex w-full cursor-pointer items-center gap-3 py-3 text-left hover:text-brand-700">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{x.def.name}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {company.name} · {shortName(cat.def)} · {valueVsTarget(x)}
                </span>
              </span>
              <StatusBadge status={statusOf((x.attainment ?? 0) * 100)} label={`${Math.round((x.attainment ?? 0) * 100)}%`} />
            </button>
          </li>
        ))}
      </ul>
    ) : (
      <p className="py-6 text-center text-sm text-ink-muted">{kind === "on" ? "Nothing is on target yet." : "Nothing reported is below target."}</p>
    );
  } else if (kind === "missing") {
    body = (
      <div className="space-y-4">
        {rows.map(({ company, s }) => {
          const gaps = s.categories.flatMap((c) => c.measures.filter((x) => x.applicable && x.attainment == null).map((x) => ({ c, x })));
          return (
            <section key={company.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <p className="font-medium text-ink">
                  {company.name} <span className="text-sm font-normal text-ink-muted">· {gaps.length} missing</span>
                </p>
                {gaps.length > 0 && (
                  <Link to={`/entry?c=${company.slug}&m=${m}`} onClick={onClose} className="text-sm font-medium text-brand-700 hover:underline">
                    Record
                  </Link>
                )}
              </div>
              {gaps.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {gaps.map(({ c, x }) => (
                    <li key={x.def.code}>
                      <button
                        type="button"
                        onClick={() => go(company.slug, c.def.code)}
                        className="cursor-pointer rounded-full bg-mist-100 px-2.5 py-1 text-xs text-ink-soft hover:bg-brand-50 hover:text-brand-700"
                      >
                        {x.def.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-muted">Everything is in.</p>
              )}
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <Modal open={kind != null} onClose={onClose} title={kind ? LIST_TITLE[kind].title : ""} description={kind ? LIST_TITLE[kind].description : undefined} size="lg">
      {body}
    </Modal>
  );
}

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
  const drill = useDrill();
  const trend = trendMonths(range, 6)
    .slice(-12)
    .map((p) => companyScore(data, company.id, p).score);
  return (
    <button
      type="button"
      onClick={() => drill.open(company.slug, "score")}
      title="Where this score comes from"
      className="-mx-2 -my-1 block cursor-pointer rounded-lg px-2 py-1 text-left transition-colors hover:bg-mist-100"
    >
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
    </button>
  );
}

function Matrix({ data, rows, range, view }: { data: BoardData; rows: Row[]; range: Range; view: View }) {
  const drill = useDrill();
  const withPeriod = useWithPeriod();
  // Cells keep one width across the rows: as many columns as the longest scorecard.
  const cols = Math.max(1, ...rows.map((r) => r.s.categories.length));

  return (
    <>
      {/* Laptop: one row per business, its own scorecard's categories across. */}
      <div className="hidden lg:block">
        <div className="grid grid-cols-[210px_132px_1fr] border-b border-mist-200 text-[11px] text-ink-muted">
          <span className="px-5 pt-3 pb-2 font-semibold tracking-[0.12em] uppercase">Business</span>
          <span className="px-2 pt-3 pb-2 font-semibold tracking-[0.12em] uppercase">Score</span>
          <span className="px-1 pt-3 pb-2 font-semibold tracking-[0.12em] uppercase">Its scorecard, category by category</span>
        </div>
        <ul className="divide-y divide-mist-200">
          {rows.map(({ company, s, prev }) => {
            const Icon = companyIcon(data.companies, company.id);
            return (
              <li key={company.id} className="grid grid-cols-[210px_132px_1fr] items-center">
                <div className="px-5 py-3">
                  <Link to={withPeriod(`/c/${company.slug}`)} className="group flex items-center gap-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink group-hover:text-brand-700 group-hover:underline">{company.name}</span>
                      <span className="block truncate text-xs text-ink-muted" title={scorecardFor(data, company.id).scorecard?.name}>
                        {s.score == null ? "Nothing reported" : `${Math.round(s.coverage)}% reported`}
                      </span>
                    </span>
                  </Link>
                </div>
                <div className="px-2 py-3">
                  <ScoreBlock s={s} prev={prev} data={data} company={company} range={range} />
                </div>
                <div className="grid gap-1.5 py-2.5 pr-4 pl-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                  {s.categories.map((c) => (
                    <div key={c.def.code} className="min-w-0">
                      <Cell c={c} view={view} onOpen={() => drill.open(company.slug, c.def.code)} />
                      <p className="mt-1 truncate text-center text-[11px] text-ink-muted" title={`${c.def.name} · weight ${Number(c.def.weight)}`}>
                        {shortName(c.def)}
                      </p>
                    </div>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Phone and tablet: one block per business, its categories three to a row. */}
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
                  <p className="mt-1 truncate text-center text-[11px] text-ink-muted">{shortName(c.def)}</p>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Every measure below target, across the businesses, with what it costs its business's score. Biggest first. */
function allDrags(rows: Row[]): (Drag & { company: Company })[] {
  return rows
    .flatMap(({ company, s }) => drags(s).map((d) => ({ ...d, company })))
    .filter((d) => (d.measure.attainment ?? 1) < 0.95)
    .sort((a, b) => b.lost - a.lost);
}

const and = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * The board in sentences, for reading at a glance: the score and where it is
 * heading, the one thing costing the most, what is fine, and what is missing.
 */
function InShort({
  rows,
  range,
  group,
  groupPrev,
  vs,
  missing,
  total,
  editable,
}: {
  rows: Row[];
  range: Range;
  group: number | null;
  groupPrev: number | null;
  vs: string;
  missing: number;
  total: number;
  editable: boolean;
}) {
  const drill = useDrill();
  const label = rangeLabel(range);
  const reporting = rows.filter((r) => r.s.score != null);
  const silent = rows.filter((r) => r.s.score == null);
  const lines: { key: string; icon: React.ReactNode; tone: string; body: React.ReactNode; onClick?: () => void }[] = [];

  if (group == null) {
    lines.push({
      key: "none",
      icon: <Gauge />,
      tone: "bg-mist-100 text-ink-muted",
      body: <>Nothing has been recorded for {label} yet, so there is no score to show.</>,
    });
  } else {
    const status = statusOf(group);
    const words =
      status === "on" ? "on target" : status === "watch" ? "close, but under the 95 that counts as on target" : "well under the 95 that counts as on target";
    const diff = groupPrev == null ? null : group - groupPrev;
    const moved = diff != null && Math.abs(diff) >= 0.05 ? `, ${diff > 0 ? "up" : "down"} ${Math.abs(diff).toFixed(1)} from ${vs}` : "";
    const ranked = [...reporting].sort((a, b) => (b.s.score ?? 0) - (a.s.score ?? 0));
    const first = ranked[0];
    const last = ranked[ranked.length - 1];
    lines.push({
      key: "score",
      icon: <Gauge />,
      tone: { on: "bg-good-50 text-good", watch: "bg-watch-50 text-watch", off: "bg-off-50 text-off", none: "bg-mist-100 text-ink-muted" }[status],
      body:
        reporting.length === 1 ? (
          <>
            <b>{first.company.name}</b> scores <b>{group.toFixed(1)} of 100</b> for {label}: {words}
            {moved}.
          </>
        ) : (
          <>
            The group scores <b>{group.toFixed(1)} of 100</b> for {label}: {words}
            {moved}. {first.company.name} leads at {first.s.score?.toFixed(1)}; {last.company.name} is lowest at {last.s.score?.toFixed(1)}.
          </>
        ),
      onClick: reporting.length === 1 ? () => drill.open(first.company.slug, "score") : undefined,
    });

    const worst = allDrags(rows)[0];
    if (worst) {
      lines.push({
        key: "drag",
        icon: <TrendingDown />,
        tone: "bg-off-50 text-off",
        body: (
          <>
            The biggest drag is <b>{worst.measure.def.name}</b> at {worst.company.name}: {valueVsTarget(worst.measure)}. On target, it would lift{" "}
            {worst.company.name}'s score by about <b>{worst.lost.toFixed(1)} points</b>.
          </>
        ),
        onClick: () => drill.open(worst.company.slug, worst.category.def.code),
      });
    }

    const good = rows.flatMap(({ s }) => s.categories.flatMap((c) => c.measures.filter((m) => m.attainment != null && m.attainment >= 0.95)));
    if (good.length) {
      const names = [...new Set(good.map((m) => m.def.name))];
      lines.push({
        key: "good",
        icon: <CheckCircle2 />,
        tone: "bg-good-50 text-good",
        body: (
          <>
            On target: {and(names.slice(0, 3))}
            {names.length > 3 ? ` and ${names.length - 3} more` : ""}.
          </>
        ),
      });
    }
  }

  if (group != null && range.to === thisMonth()) {
    lines.push({
      key: "running",
      icon: <Hourglass />,
      tone: "bg-watch-50 text-watch",
      body: (
        <>
          <b>{format(parseISO(range.to), "MMMM")} is still running.</b> Its sales and collections are month-to-date against a full month's target, so
          they will keep rising until the month closes.
        </>
      ),
    });
  }

  if (missing > 0) {
    const partial = reporting.filter((r) => r.s.coverage < 99.5);
    lines.push({
      key: "gaps",
      icon: <CircleDashed />,
      tone: "bg-mist-100 text-ink-muted",
      body: (
        <>
          {missing} of {total} measures have no figure yet.
          {silent.length > 0 && group != null && ` ${and(silent.map((r) => r.company.name))} ${silent.length === 1 ? "has" : "have"} reported nothing.`}
          {partial.map((r) => ` ${r.company.name}'s score rests on ${Math.round(r.s.coverage)}% of its scorecard, so read it as partial.`)}
          {editable && (
            <>
              {" "}
              <Link to={`/entry?m=${range.to.slice(0, 7)}`} className="font-medium text-brand-700 hover:underline">
                Record results
              </Link>
            </>
          )}
        </>
      ),
    });
  }

  return (
    <Card>
      <CardHeader title="In short" description={`${label}, in plain words.`} />
      <ul className="divide-y divide-mist-200">
        {lines.map((l) => {
          const inner = (
            <>
              <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full [&_svg]:size-4", l.tone)}>{l.icon}</span>
              <span className="min-w-0 flex-1 text-sm leading-relaxed text-ink-soft [&_b]:font-semibold [&_b]:text-ink">{l.body}</span>
              {l.onClick && <ArrowRight className="mt-1.5 size-4 shrink-0 text-ink-muted" />}
            </>
          );
          return (
            <li key={l.key}>
              {l.onClick ? (
                <button type="button" onClick={l.onClick} className="flex w-full cursor-pointer items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-mist-50">
                  {inner}
                </button>
              ) : (
                <div className="flex items-start gap-3 px-5 py-3">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Attention({ rows }: { rows: Row[] }) {
  const drill = useDrill();
  const items = allDrags(rows).slice(0, 8);

  return (
    <Card>
      <CardHeader
        title="Needs attention"
        description="Measures below target, the one costing the score the most first. A miss in a heavy category costs more than the same miss in a light one."
      />
      {items.length ? (
        <ul className="divide-y divide-mist-200">
          {items.map(({ company, category, measure: m, lost }) => (
            <li key={`${company.id}:${m.def.code}`}>
              <button
                type="button"
                onClick={() => drill.open(company.slug, category.def.code)}
                className="flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-mist-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{m.def.name}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {company.name} · {valueVsTarget(m)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-display text-[15px] text-off tabular-nums">−{lost.toFixed(1)} pts</span>
                  <span className="block text-[11px] text-ink-muted tabular-nums">{Math.round((m.attainment ?? 0) * 100)}% of target</span>
                </span>
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
                  {gaps.length ? gaps.map((c) => shortName(c.def)).join(" · ") : "Everything is in."}
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
