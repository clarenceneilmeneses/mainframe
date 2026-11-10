import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ClipboardPen, LayoutDashboard, Target } from "lucide-react";
import { companyScore, scorecardFor, useBoard, type BoardData, type Range } from "../lib/board";
import { STATUS_CUTS, statusOf, type MeasureResult } from "../lib/scoring";
import { FORMULAS } from "../lib/formulas";
import { unitValue } from "../lib/format";
import { Card, CardHeader, PageHeader, Spinner, StatusBadge, Tabs } from "../components/ui";
import { rangeLabel, useRange, useWithPeriod } from "../components/board-bits";

/**
 * The board explained to someone opening it for the first time: what it is,
 * what to do each month, what to gather, and one score worked out step by step
 * with the real numbers on the board.
 */
export default function Guide() {
  const { data, isLoading } = useBoard();
  const { range } = useRange();
  const withPeriod = useWithPeriod();

  const steps = [
    {
      icon: Target,
      title: "Set the targets, once",
      body: "Most targets come with each scorecard (95%, 100%, 33% mark-up). The peso ones differ per business, so type each business's monthly sales, profit or revenue target — by quarter if it changes during the year. Untick a measure that doesn't apply.",
      to: "/scorecard",
      cta: "Targets",
    },
    {
      icon: ClipboardPen,
      title: "Record the results, every month",
      body: "Pick the business and the month, then type what happened. For most lines you type two counts, such as 19 milestones done on time out of 20 due, and the percentage works itself out. NAM Supply's sales figures arrive from its sales system.",
      to: "/entry",
      cta: "Record results",
    },
    {
      icon: LayoutDashboard,
      title: "Read the board",
      body: "Every business gets a score out of 100. Green is on target, amber is close, red is off, and striped means nobody has reported it. Click any number to see what is underneath it.",
      to: withPeriod("/"),
      cta: "KPI board",
    },
  ];

  return (
    <>
      <PageHeader eyebrow="Help" title="How it works" description="What the board is, what to do each month, and how a score is worked out." />
      <div className="space-y-6">
        <Card>
          <CardHeader
            title="The idea"
            description="Each business has its own scorecard, scored the same way."
          />
          <p className="max-w-3xl px-5 py-4 text-sm leading-relaxed text-ink-soft">
            Every business is judged on its own scorecard — NAM Builders on the nine-category 2027 scorecard, NAM Trading on its quarterly sales
            scorecard, ALM Management on its KPI performance scorecard. Each category has a <b className="font-semibold text-ink">weight</b>, which is how
            many points it is worth, and on every scorecard the weights add up to 100. Each category has one or more{" "}
            <b className="font-semibold text-ink">measures</b> with a target. Every month a business earns points in each category by how close it came to
            those targets, and the points add up to its score out of 100 — so the businesses can sit side by side even though their scorecards differ.
          </p>
        </Card>

        <div>
          <p className="eyebrow mb-3">What to do</p>
          <ol className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {steps.map(({ icon: Icon, title, body, to, cta }, i) => (
              <li key={title}>
                <Card className="flex h-full flex-col p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                      <Icon className="size-[18px]" />
                    </span>
                    <p className="font-display text-base font-medium text-ink">
                      <span className="text-ink-muted">{i + 1}.</span> {title}
                    </p>
                  </div>
                  <p className="mt-3 flex-1 text-[13px] leading-relaxed text-ink-muted">{body}</p>
                  <Link to={to} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
                    {cta} <ArrowRight className="size-4" />
                  </Link>
                </Card>
              </li>
            ))}
          </ol>
        </div>

        {isLoading && <Spinner label="Loading the board" />}
        {data && <Worked data={data} range={range} />}
        {data && <Checklist data={data} />}

        <Card>
          <CardHeader title="Good to know" />
          <dl className="divide-y divide-mist-200">
            {[
              [
                "What the colours mean",
                <span key="c" className="flex flex-wrap items-center gap-2">
                  <StatusBadge status="on" label={`On target · ${STATUS_CUTS.on} or more`} />
                  <StatusBadge status="watch" label={`Watch · ${STATUS_CUTS.watch} to ${STATUS_CUTS.on - 1}`} />
                  <StatusBadge status="off" label={`Off target · under ${STATUS_CUTS.watch}`} />
                  <span>Striped means not reported.</span>
                </span>,
              ],
              ["We don't have a number this month", "Leave the box empty. An empty measure is left out of the score, not counted as zero. The board says how much of the scorecard is reported, so a score built on a few measures is plain to see."],
              ["Beating a target", "A measure tops out at 100% of its target. A strong month in sales can't cover for weak collections; each has to reach its own target."],
              ["Looking at several months", "Pick a quarter or a year at the top. Pesos add up against the targets added up. Results typed in as counts are worked out again from the counts added up. Anything else is the average of its months."],
              ["Why one miss costs more than another", "A measure's cost depends on its category's weight. Sales is worth 30 points and HR 4, so the same shortfall costs far more in Sales. Needs attention on the board is sorted by that cost."],
              ["Who can do what", "Anyone holding the private link can look. Recording results needs a sign-in. Only the owner changes targets."],
            ].map(([q, a]) => (
              <div key={String(q)} className="grid grid-cols-1 gap-1 px-5 py-3.5 md:grid-cols-[240px_1fr] md:gap-6">
                <dt className="text-sm font-medium text-ink">{q}</dt>
                <dd className="text-[13px] leading-relaxed text-ink-muted">{a}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}

const pct = (a: number | null) => (a == null ? "—" : `${Math.round(a * 100)}%`);

function targetWords(m: MeasureResult) {
  if (m.def.direction === "band") return `within ±${unitValue(m.def.band, m.def.unit)}`;
  return `${m.def.direction === "lower" ? "at most" : "at least"} ${unitValue(m.target, m.def.unit)}`;
}

/** One real score taken apart: measures → category → business. */
function Worked({ data, range }: { data: BoardData; range: Range }) {
  const scored = data.companies
    .map((company) => ({ company, s: companyScore(data, company.id, range) }))
    .filter((x) => x.s.score != null)
    .sort((a, b) => b.s.measuresReported - a.s.measuresReported)[0];

  if (!scored) {
    return (
      <Card>
        <CardHeader title="A score, worked out" description={`Nothing is recorded for ${rangeLabel(range)} yet.`} />
        <p className="px-5 py-4 text-sm text-ink-muted">
          Once a month has results, this section walks through that month's real numbers. Pick another period at the top to see one now.
        </p>
      </Card>
    );
  }

  const { company, s } = scored;
  const reported = s.categories.filter((c) => c.points != null);
  // The category with the most measures in makes the best example.
  const cat = [...reported].sort((a, b) => b.measures.filter((m) => m.attainment != null).length - a.measures.filter((m) => m.attainment != null).length)[0];
  const inCat = cat.measures.filter((m) => m.attainment != null);
  const weight = Number(cat.def.weight);
  const earned = reported.reduce((a, c) => a + (c.points ?? 0), 0);
  const reportedWeight = reported.reduce((a, c) => a + Number(c.def.weight), 0);
  const num = "grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700";

  return (
    <Card>
      <CardHeader title="A score, worked out" description={`${company.name}, ${rangeLabel(range)}. These are the numbers on the board right now.`} />
      <ol className="divide-y divide-mist-200">
        <li className="flex gap-3 px-5 py-4">
          <span className={num}>1</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">Each measure is compared with its target</p>
            <p className="mt-0.5 text-[13px] text-ink-muted">Taking {cat.def.name} as the example. Result ÷ target, never more than 100%.</p>
            <ul className="mt-3 divide-y divide-mist-100 rounded-xl bg-mist-50 px-4">
              {inCat.map((m) => (
                <li key={m.def.code} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-[13px]">
                  <span className="text-ink-soft">{m.def.name}</span>
                  <span className="flex items-center gap-2 text-ink-muted tabular-nums">
                    {unitValue(m.actual, m.def.unit)} against {targetWords(m)}
                    <StatusBadge status={statusOf((m.attainment ?? 0) * 100)} label={pct(m.attainment)} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </li>
        <li className="flex gap-3 px-5 py-4">
          <span className={num}>2</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">The category earns that share of its weight</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              {inCat.length > 1 ? (
                <>
                  The average of {inCat.map((m) => pct(m.attainment)).join(", ")} is <b className="font-semibold text-ink">{pct(cat.attainment)}</b>.{" "}
                </>
              ) : (
                <>
                  It has one measure in, at <b className="font-semibold text-ink">{pct(cat.attainment)}</b>.{" "}
                </>
              )}
              {cat.def.name} is worth {weight} points, so it earns {weight} × {pct(cat.attainment)} ={" "}
              <b className="font-semibold text-ink">{(cat.points ?? 0).toFixed(1)} points</b>.
            </p>
          </div>
        </li>
        <li className="flex gap-3 px-5 py-4">
          <span className={num}>3</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">The points add up to the score</p>
            <ul className="mt-3 divide-y divide-mist-100 rounded-xl bg-mist-50 px-4">
              {reported.map((c) => (
                <li key={c.def.code} className="flex items-center justify-between gap-4 py-2 text-[13px]">
                  <span className="text-ink-soft">{c.def.name}</span>
                  <span className="text-ink tabular-nums">
                    {(c.points ?? 0).toFixed(1)} <span className="text-ink-muted">of {Number(c.def.weight)}</span>
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-4 py-2 text-[13px] font-semibold">
                <span className="text-ink">Earned</span>
                <span className="text-ink tabular-nums">
                  {earned.toFixed(1)} <span className="font-normal text-ink-muted">of {reportedWeight}</span>
                </span>
              </li>
            </ul>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
              {reportedWeight < 100 ? (
                <>
                  Only {reportedWeight} of the 100 points have figures so far; the rest are left out, not counted as zero. So the score is{" "}
                  {earned.toFixed(2)} ÷ {reportedWeight} × 100 = <b className="font-semibold text-ink">{s.score?.toFixed(1)}</b>, and the board marks it as{" "}
                  {Math.round(s.coverage)}% reported.
                </>
              ) : (
                <>
                  Every category has a figure, so the score is the points earned: <b className="font-semibold text-ink">{s.score?.toFixed(1)}</b> of 100.
                </>
              )}
            </p>
          </div>
        </li>
        <li className="flex gap-3 px-5 py-4">
          <span className={num}>4</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">The group score is the average of the businesses</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              Only the businesses that reported something are averaged. One that hasn't reported is shown as not reported, not as zero.
            </p>
          </div>
        </li>
      </ol>
    </Card>
  );
}

/** What someone has to have in hand to fill a month in. */
function Checklist({ data }: { data: BoardData }) {
  const [slug, setSlug] = useState(data.companies[0]?.slug ?? "");
  const company = data.companies.find((c) => c.slug === slug) ?? data.companies[0];
  const sc = company ? scorecardFor(data, company.id) : { categories: data.categories, measures: data.measures, scorecard: null };
  const cats = [...sc.categories].sort((a, b) => a.sort - b.sort);
  return (
    <Card>
      <CardHeader
        title="What to gather each month"
        description={`For ${company?.name ?? "each business"}, on its ${sc.scorecard?.name ?? "scorecard"}. The board does the arithmetic; these are the figures it asks for.`}
      />
      <Tabs
        value={company?.slug ?? ""}
        onChange={setSlug}
        items={data.companies.map((c) => ({ value: c.slug, label: c.name }))}
        className="px-5 pb-3"
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-mist-50 text-[11px] tracking-[0.12em] text-ink-muted uppercase">
            <tr>
              <th className="px-5 py-2.5 font-semibold">Category</th>
              <th className="px-3 py-2.5 text-right font-semibold">Weight</th>
              <th className="px-3 py-2.5 font-semibold">Measure</th>
              <th className="px-5 py-2.5 font-semibold">Figures to bring</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mist-200">
            {cats.flatMap((c) => {
              const ms = sc.measures.filter((m) => m.category_code === c.code).sort((a, b) => a.sort - b.sort);
              return ms.map((m, i) => {
                const f = FORMULAS[m.code];
                return (
                  <tr key={m.code} className="align-top">
                    {i === 0 && (
                      <>
                        <td rowSpan={ms.length} className="px-5 py-3 font-medium text-ink">
                          {c.name}
                        </td>
                        <td rowSpan={ms.length} className="px-3 py-3 text-right text-ink-soft tabular-nums">
                          {Number(c.weight)}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-3 text-ink-soft">{m.name}</td>
                    <td className="px-5 py-3 text-[13px] text-ink-muted">
                      {f ? `${f.top} and ${f.bottom.charAt(0).toLowerCase()}${f.bottom.slice(1)}` : m.unit === "php" ? "The amount in pesos for the month" : m.unit === "score5" ? "The average rating out of 5" : m.unit === "count" ? "How many, this month" : "The figure for the month"}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
