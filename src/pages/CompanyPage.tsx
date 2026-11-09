import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ClipboardPen, RefreshCw, SearchX } from "lucide-react";
import {
  companyScore,
  DEV_SNAPSHOT,
  lastSync,
  monthsEnding,
  useBoard,
  useCompanyTrend,
  type BoardData,
  type Company,
} from "../lib/board";
import { statusOf, type CategoryResult, type CompanyScore, type MeasureResult } from "../lib/scoring";
import { monthLabel, prettyDateTime, unitValue } from "../lib/format";
import { canEdit, useAuth } from "../lib/auth";
import { cn } from "../lib/utils";
import { Card, CardHeader, EmptyState, PageHeader, StatTile, StatusBadge } from "../components/ui";
import { BoardGate, MonthSelect, usePeriod } from "../components/board-bits";
import { AmountVsTarget, AttainmentBar, ScoreRing, ScoreTrend } from "../components/viz";

export default function CompanyPage() {
  const { slug } = useParams();
  const { data } = useBoard();
  const [period, setPeriod] = usePeriod(data);
  const company = data?.companies.find((c) => c.slug === slug);
  const { role } = useAuth();
  const editable = DEV_SNAPSHOT || canEdit(role);

  return (
    <>
      <PageHeader
        eyebrow="Scorecard"
        title={company?.name ?? "Business"}
        description={`${monthLabel(period)}${company?.description ? ` · ${company.description}` : ""}`}
        actions={
          <>
            <MonthSelect data={data} value={period} onChange={setPeriod} />
            {editable && company && (
              <Link
                to={`/entry?c=${company.slug}&m=${period.slice(0, 7)}`}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-medium text-mist-50 shadow-level-1 hover:bg-brand-700/90"
              >
                <ClipboardPen className="size-4" /> Enter results
              </Link>
            )}
          </>
        }
      />
      <BoardGate>
        {(d) =>
          company ? (
            <Body data={d} company={company} period={period} />
          ) : (
            <EmptyState icon={<SearchX />} title="No such business">
              It may have been renamed. Pick one from the menu.
            </EmptyState>
          )
        }
      </BoardGate>
    </>
  );
}

function Body({ data, company, period }: { data: BoardData; company: Company; period: string }) {
  const s = companyScore(data, company.id, period);
  const trend = useCompanyTrend(data, company.id, period, 6);
  const scoredCats = s.categories.filter((c) => c.attainment != null);
  const best = [...scoredCats].sort((a, b) => (b.attainment ?? 0) - (a.attainment ?? 0))[0];
  const worst = [...scoredCats].sort((a, b) => (a.attainment ?? 0) - (b.attainment ?? 0))[0];
  const synced = company.data_source ? lastSync(data, company.id) : null;

  // Sales against the monthly target, where the business reports sales.
  const sales = useMemo(() => {
    const def = data.measures.find((m) => m.code === "sales_vs_target");
    const cm = data.companyMeasures.find((x) => x.company_id === company.id && x.measure_code === "sales_vs_target");
    const pts = monthsEnding(period, 6).map((p) => {
      const row = data.actuals.find((a) => a.company_id === company.id && a.measure_code === "sales_vs_target" && a.period === p);
      return {
        label: format(parseISO(p), "MMM"),
        value: row ? Number(row.actual) : null,
        target: row?.target ?? cm?.target ?? def?.default_target ?? null,
      };
    });
    return { pts, target: cm?.target ?? def?.default_target ?? null, any: pts.some((p) => p.value != null) };
  }, [data, company.id, period]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="flex items-center gap-4 p-5">
          <ScoreRing score={s.score} status={s.status} size={88} stroke={8} />
          <div className="min-w-0">
            <p className="eyebrow">Weighted score</p>
            <StatusBadge status={s.status} className="mt-2" />
          </div>
        </Card>
        <StatTile
          label="Scorecard reported"
          value={`${Math.round(s.coverage)}%`}
          sub={`${s.measuresReported} of ${s.measuresApplicable} measures have a result`}
        />
        <StatTile
          label="Strongest"
          value={best ? `${Math.round((best.attainment ?? 0) * 100)}%` : "—"}
          sub={best?.def.name ?? "No results yet"}
        />
        <StatTile
          label="Needs attention"
          value={worst ? `${Math.round((worst.attainment ?? 0) * 100)}%` : "—"}
          sub={worst?.def.name ?? "No results yet"}
          tone={worst && (worst.attainment ?? 1) < 0.85 ? "warn" : "default"}
        />
      </div>

      <Card>
        <CardHeader
          title={`${company.name} — 2027 KPI scorecard`}
          description={`Results for ${monthLabel(period)}. Each category earns its weight × how close its measures came to target.`}
          action={
            company.data_source ? (
              <span className="hidden items-center gap-1.5 text-xs text-ink-muted sm:inline-flex">
                <RefreshCw className="size-3.5" /> {synced ? `Synced ${prettyDateTime(synced)}` : "Not synced yet"}
              </span>
            ) : undefined
          }
        />
        <ScorecardTable s={s} />
      </Card>

      <div className={cn("grid grid-cols-1 gap-6", sales.any && "xl:grid-cols-2")}>
        <Card>
          <CardHeader title="Score by month" description="Last six months. The dashed line is 95, on target." />
          <div className="px-3 pt-4 pb-3">
            <ScoreTrend data={trend} />
          </div>
        </Card>
        {sales.any && (
          <Card>
            <CardHeader title="Sales vs monthly target" description="Booked sales per month. The dashed line is the target." />
            <div className="px-3 pt-4 pb-3">
              <AmountVsTarget data={sales.pts} target={sales.target} name="Sales" />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function measureStatus(m: MeasureResult) {
  return statusOf(m.attainment == null ? null : m.attainment * 100);
}

function MeasureLine({ m }: { m: MeasureResult }) {
  const target =
    m.def.direction === "band"
      ? `within ±${unitValue(m.def.band, m.def.unit)}`
      : m.def.direction === "lower"
        ? `≤ ${unitValue(m.target, m.def.unit)}`
        : `≥ ${unitValue(m.target, m.def.unit)}`;
  return (
    <li className={cn("flex items-start justify-between gap-3 py-1", !m.applicable && "opacity-50")}>
      <span className="min-w-0 text-[13px] text-ink-soft">
        {m.def.name}
        {m.source === "system" && (
          <span className="ml-1.5 rounded-full bg-brand-50 px-1.5 py-px text-[10px] font-semibold tracking-wide text-brand-700 uppercase">
            Synced
          </span>
        )}
        <span className="block text-[11px] text-ink-muted">
          {!m.applicable ? "Doesn't apply" : m.target == null && m.def.direction !== "band" ? "Target not set" : `Target ${target}`}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2 text-[13px] tabular-nums">
        {m.actual == null ? (
          <span className="text-ink-muted">—</span>
        ) : (
          <>
            <span className="font-medium text-ink" title={m.def.unit === "php" ? unitValue(m.actual, "php", { full: true }) : undefined}>
              {unitValue(m.actual, m.def.unit)}
            </span>
            <span
              className={cn(
                "size-2 rounded-full",
                { on: "bg-good", watch: "bg-watch", off: "bg-off", none: "bg-mist-300" }[measureStatus(m)],
              )}
              title={`${Math.round((m.attainment ?? 0) * 100)}% of target`}
            />
          </>
        )}
      </span>
    </li>
  );
}

function ScoreCell({ c }: { c: CategoryResult }) {
  const status = statusOf(c.attainment == null ? null : c.attainment * 100);
  return (
    <div className="w-full min-w-[120px]">
      <div className="mb-1.5 flex items-baseline justify-end gap-1 tabular-nums">
        {c.points != null ? (
          <>
            <span className="font-display text-base font-medium text-ink">{c.points.toFixed(1)}</span>
            <span className="text-xs text-ink-muted">/ {Number(c.def.weight)}</span>
          </>
        ) : (
          <span className="text-xs text-ink-muted">{c.applicable ? "No result" : "N/A"}</span>
        )}
      </div>
      <AttainmentBar value={c.attainment} status={status} />
    </div>
  );
}

function ScorecardTable({ s }: { s: CompanyScore }) {
  const reportedWeight = s.categories.filter((c) => c.points != null).reduce((a, c) => a + Number(c.def.weight), 0);
  const points = s.categories.reduce((a, c) => a + (c.points ?? 0), 0);
  return (
    <>
      {/* Laptop: the table from the scorecard slide, with this month's results added. */}
      <div className="hidden md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-mist-50 text-[11px] tracking-[0.12em] text-ink-muted uppercase">
            <tr>
              <th className="px-5 py-2.5 font-semibold">KPI category</th>
              <th className="px-3 py-2.5 text-right font-semibold">Weight</th>
              <th className="px-3 py-2.5 font-semibold">Performance target</th>
              <th className="px-3 py-2.5 font-semibold">This month</th>
              <th className="px-5 py-2.5 text-right font-semibold">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mist-200">
            {s.categories.map((c) => (
              <tr key={c.def.code} className="align-top">
                <td className="px-5 py-3.5 font-medium text-ink">{c.def.name}</td>
                <td className="px-3 py-3.5 text-right tabular-nums text-ink-soft">{Number(c.def.weight)}%</td>
                <td className="max-w-[280px] px-3 py-3.5 text-[13px] leading-snug text-ink-muted">{c.def.target_text}</td>
                <td className="min-w-[260px] px-3 py-2.5">
                  <ul className="divide-y divide-mist-100">
                    {c.measures.map((m) => (
                      <MeasureLine key={m.def.code} m={m} />
                    ))}
                  </ul>
                </td>
                <td className="px-5 py-3.5">
                  <ScoreCell c={c} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-mist-200 bg-mist-50">
            <tr>
              <td className="px-5 py-3 font-semibold text-ink">Total</td>
              <td className="px-3 py-3 text-right font-semibold tabular-nums">100%</td>
              <td className="px-3 py-3 text-[13px] text-ink-muted" colSpan={2}>
                {reportedWeight > 0
                  ? `${points.toFixed(1)} points earned of the ${reportedWeight} available from the categories that reported`
                  : "No results this month"}
              </td>
              <td className="px-5 py-3 text-right">
                <span className="font-display text-lg font-medium tabular-nums">{s.score == null ? "—" : s.score.toFixed(1)}</span>
                <span className="text-xs text-ink-muted"> / 100</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Phone: one card per category. */}
      <ul className="divide-y divide-mist-200 md:hidden">
        {s.categories.map((c) => (
          <li key={c.def.code} className="space-y-2 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{c.def.name}</p>
                <p className="text-xs text-ink-muted">Weight {Number(c.def.weight)}%</p>
              </div>
              <div className="w-28 shrink-0">
                <ScoreCell c={c} />
              </div>
            </div>
            <p className="text-xs leading-snug text-ink-muted">{c.def.target_text}</p>
            <ul className="divide-y divide-mist-100 rounded-xl bg-mist-50 px-3 py-1">
              {c.measures.map((m) => (
                <MeasureLine key={m.def.code} m={m} />
              ))}
            </ul>
          </li>
        ))}
        <li className="flex items-center justify-between bg-mist-50 px-4 py-3">
          <span className="font-semibold">Total</span>
          <span>
            <span className="font-display text-lg font-medium tabular-nums">{s.score == null ? "—" : s.score.toFixed(1)}</span>
            <span className="text-xs text-ink-muted"> / 100</span>
          </span>
        </li>
      </ul>
    </>
  );
}
