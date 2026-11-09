import { Link } from "react-router-dom";
import { ArrowRight, ClipboardPen, RefreshCw } from "lucide-react";
import { companyScore, lastSync, useBoard, type BoardData, type Company } from "../lib/board";
import { statusOf, type CategoryResult, type MeasureResult } from "../lib/scoring";
import { monthLabel, plural, prettyDateTime, unitValue } from "../lib/format";
import { useAuth, canEdit } from "../lib/auth";
import { DEV_SNAPSHOT } from "../lib/board";
import { cn } from "../lib/utils";
import { Card, PageHeader, StatusBadge } from "../components/ui";
import { BoardGate, MonthSelect, usePeriod } from "../components/board-bits";
import { AttainmentBar, ScoreRing } from "../components/viz";
import { companyIcon } from "../components/Layout";

/**
 * The KPI Monitoring Board: one panel per business, stacked, as on the CEO's
 * sketch. Each shows its weighted score for the month and the nine scorecard
 * categories at a glance; a panel opens that business's full scorecard.
 */
export default function Board() {
  const { data } = useBoard();
  const [period, setPeriod] = usePeriod(data);
  const { role } = useAuth();
  const editable = DEV_SNAPSHOT || canEdit(role);

  return (
    <>
      <PageHeader
        eyebrow="2027 KPI scorecard"
        title="KPI Monitoring Board"
        description={`${monthLabel(period)} · every business on the same nine categories, weights totalling 100.`}
        actions={
          <>
            <MonthSelect data={data} value={period} onChange={setPeriod} />
            {editable && (
              <Link
                to={`/entry?m=${period.slice(0, 7)}`}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-medium text-mist-50 shadow-level-1 hover:bg-brand-700/90"
              >
                <ClipboardPen className="size-4" /> Enter results
              </Link>
            )}
          </>
        }
      />
      <BoardGate>
        {(d) => (
          <div className="space-y-5">
            {d.companies.map((c) => (
              <CompanyPanel key={c.id} data={d} company={c} period={period} />
            ))}
            <Legend />
          </div>
        )}
      </BoardGate>
    </>
  );
}

function CompanyPanel({ data, company, period }: { data: BoardData; company: Company; period: string }) {
  const s = companyScore(data, company.id, period);
  const Icon = companyIcon(data.companies, company.id);
  const synced = company.data_source ? lastSync(data, company.id) : null;
  const href = `/c/${company.slug}?m=${period.slice(0, 7)}`;

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(250px,290px)_1fr]">
        {/* The business and its score. */}
        <div className="flex flex-col gap-4 border-b border-mist-200 bg-mist-50 p-5 lg:border-r lg:border-b-0">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-lg leading-tight font-medium text-ink">{company.name}</h2>
              {company.description && <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{company.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ScoreRing score={s.score} status={s.status} size={104} />
            <div className="min-w-0 space-y-2">
              <StatusBadge status={s.status} />
              <p className="text-xs leading-snug text-ink-muted">
                {s.score == null
                  ? `Nothing recorded for ${monthLabel(period, "MMMM")} yet.`
                  : `Scored on ${Math.round(s.coverage)}% of the scorecard · ${s.measuresReported} of ${plural(s.measuresApplicable, "measure")} in.`}
              </p>
            </div>
          </div>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              {company.data_source ? (
                <>
                  <RefreshCw className="size-3.5" />
                  {synced ? `Synced ${prettyDateTime(synced)}` : "Waiting for first sync"}
                </>
              ) : (
                "Entered monthly"
              )}
            </span>
            <Link to={href} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
              Open scorecard <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>

        {/* The nine categories. */}
        <ul className="grid grid-cols-1 gap-px bg-mist-200 sm:grid-cols-2 xl:grid-cols-3">
          {s.categories.map((c) => (
            <CategoryCell key={c.def.code} cat={c} href={href} />
          ))}
        </ul>
      </div>
    </Card>
  );
}

function headline(m: MeasureResult) {
  if (m.actual == null) return null;
  return `${unitValue(m.actual, m.def.unit)}${m.target != null && m.def.direction !== "band" ? ` of ${unitValue(m.target, m.def.unit)}` : ""}`;
}

function CategoryCell({ cat, href }: { cat: CategoryResult; href: string }) {
  const pct = cat.attainment == null ? null : cat.attainment * 100;
  const status = statusOf(pct);
  const first = cat.measures.find((m) => m.actual != null);
  const reported = cat.measures.filter((m) => m.actual != null).length;
  const applicable = cat.measures.filter((m) => m.applicable).length;

  return (
    <li className="bg-white">
      <Link
        to={href}
        className={cn("flex h-full flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-mist-50", !cat.applicable && "opacity-50")}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-[13px] leading-snug font-medium text-ink">{cat.def.name}</span>
          <span className="shrink-0 rounded-full bg-mist-100 px-2 py-0.5 text-[11px] font-semibold text-ink-soft tabular-nums">
            {Number(cat.def.weight)}%
          </span>
        </div>
        <AttainmentBar value={cat.attainment} status={status} />
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="min-w-0 truncate text-ink-muted" title={first ? `${first.def.name}: ${headline(first)}` : undefined}>
            {!cat.applicable
              ? "Doesn't apply"
              : first
                ? `${first.def.name.split(" ")[0]} ${headline(first)}`
                : "No result yet"}
          </span>
          <span className="shrink-0 text-ink tabular-nums">
            {cat.points != null ? (
              <>
                <span className="font-display text-sm font-medium">{cat.points.toFixed(1)}</span>
                <span className="text-ink-muted"> / {Number(cat.def.weight)}</span>
              </>
            ) : cat.applicable ? (
              <span className="text-ink-muted">—</span>
            ) : null}
          </span>
        </div>
        {cat.applicable && reported > 0 && reported < applicable && (
          <span className="text-[11px] text-ink-muted">{`${reported} of ${applicable} measures in`}</span>
        )}
      </Link>
    </li>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-ink-muted">
      <StatusBadge status="on" label="On target · 95+" />
      <StatusBadge status="watch" label="Watch · 85–94" />
      <StatusBadge status="off" label="Off target · under 85" />
      <span className="inline-flex items-center gap-1.5">
        <span className="hatch inline-block h-1.5 w-8 rounded-full bg-mist-100" /> No result yet
      </span>
      <Link to="/scorecard" className="text-brand-700 hover:underline">
        How scores are worked out
      </Link>
    </div>
  );
}
