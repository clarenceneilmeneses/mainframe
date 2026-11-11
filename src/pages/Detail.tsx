import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, SearchX } from "lucide-react";
import { scorecardFor, shortName, useBoard, type BoardData, type Company, type Range } from "../lib/board";
import { findHeadline } from "../lib/sample";
import { EmptyState, PageHeader, Tabs } from "../components/ui";
import { BoardGate, rangeLabel, useRange, useWithPeriod } from "../components/board-bits";
import { CategoryView, ScoreView } from "../components/Drilldown";
import { FigureView } from "../components/FigureDetail";

/*
 * The detail pages, full screen: one of a business's top four numbers
 * (/c/:slug/top/:code) and one of its scorecard categories, or its score
 * (/c/:slug/kpi/:category). Tabs along the top step between siblings
 * without going back.
 */

function Back({ company }: { company: Company | undefined }) {
  const withPeriod = useWithPeriod();
  if (!company) return null;
  return (
    <Link
      to={withPeriod(`/c/${company.slug}`)}
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-mist-300 bg-white px-4 text-sm font-medium text-ink shadow-level-1 hover:bg-mist-100"
    >
      <ArrowLeft className="size-4" /> {company.name}
    </Link>
  );
}

const NotFound = () => (
  <EmptyState icon={<SearchX />} title="Nothing here">
    It may have been renamed. Pick a business from the menu.
  </EmptyState>
);

export function FigurePage() {
  const { slug, code } = useParams();
  const { data } = useBoard();
  const { range } = useRange();
  const navigate = useNavigate();
  const withPeriod = useWithPeriod();
  const hit = findHeadline(slug, code);
  const company = data?.companies.find((c) => c.slug === slug);

  if (!hit) return <NotFound />;
  return (
    <>
      <PageHeader
        eyebrow={`${company?.name ?? hit.b.name} · ${rangeLabel(range)}`}
        title={hit.def.label}
        description={
          <span className="inline-flex items-center gap-2">
            Top four
            <span className="rounded-full bg-watch-50 px-2 py-0.5 text-[11px] font-medium text-watch ring-1 ring-watch/30 ring-inset">Sample figures</span>
          </span>
        }
        actions={<Back company={company} />}
      />
      <Tabs
        className="-mt-2 mb-5"
        value={hit.def.code}
        onChange={(c) => navigate(withPeriod(`/c/${hit.b.slug}/top/${c}`), { replace: true })}
        items={hit.b.figures.map((f) => ({ value: f.code, label: f.label }))}
      />
      <FigureView b={hit.b} def={hit.def} range={range} />
    </>
  );
}

export function KpiPage() {
  const { slug, category } = useParams();
  const { data } = useBoard();
  const { range } = useRange();
  const company = data?.companies.find((c) => c.slug === slug);
  const cat = data && company ? scorecardFor(data, company.id).categories.find((c) => c.code === category) : undefined;
  const scoreView = category === "score";

  return (
    <>
      <PageHeader
        eyebrow={`${company?.name ?? "Business"} · ${rangeLabel(range)}`}
        title={scoreView ? "Where the score comes from" : (cat?.name ?? "Scorecard")}
        description={cat ? `Weight ${Number(cat.weight)} of 100 on the ${scorecardFor(data!, company!.id).scorecard?.name ?? "scorecard"}.` : undefined}
        actions={<Back company={company} />}
      />
      <BoardGate>{(d) => (company && (cat || scoreView) ? <KpiBody data={d} company={company} category={category!} range={range} /> : <NotFound />)}</BoardGate>
    </>
  );
}

function KpiBody({ data, company, category, range }: { data: BoardData; company: Company; category: string; range: Range }) {
  const navigate = useNavigate();
  const withPeriod = useWithPeriod();
  const go = (c: string) => navigate(withPeriod(`/c/${company.slug}/kpi/${c}`), { replace: true });
  const cats = scorecardFor(data, company.id).categories;
  return (
    <>
      <Tabs
        className="-mt-2 mb-5"
        value={category}
        onChange={go}
        items={[{ value: "score", label: "Score" }, ...cats.map((c) => ({ value: c.code, label: shortName(c) }))]}
      />
      {category === "score" ? (
        <ScoreView data={data} companyId={company.id} slug={company.slug} range={range} onOpen={(c) => navigate(withPeriod(`/c/${company.slug}/kpi/${c}`))} />
      ) : (
        <CategoryView key={category} data={data} companyId={company.id} slug={company.slug} categoryCode={category} range={range} />
      )}
    </>
  );
}
