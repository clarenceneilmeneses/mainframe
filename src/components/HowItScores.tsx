import { STATUS_CUTS } from "../lib/scoring";
import { Card, CardHeader, StatusBadge } from "./ui";

export function HowItScoresSteps() {
  const steps = [
    ["Each measure", "earns 0–100% of its target. Beating a target caps at 100%, so one strong number can't hide a weak one."],
    ["Each category", "averages its measures that have a result, and earns that share of its weight. Sales at 30% weight and 75% of target earns 22.5 points."],
    ["Each business", "adds its points over the weight of the categories that reported, out of 100. Missing results show as gaps and lower the coverage figure — they aren't scored as zero."],
  ];
  return (
    <>
      <ol className="grid grid-cols-1 gap-px bg-mist-200 md:grid-cols-3">
        {steps.map(([title, body], i) => (
          <li key={title} className="bg-white px-5 py-4">
            <span className="grid size-7 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">{i + 1}</span>
            <p className="mt-2 text-sm font-medium text-ink">{title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{body}</p>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2 border-t border-mist-200 px-5 py-3 text-xs text-ink-muted">
        <StatusBadge status="on" label={`On target · ${STATUS_CUTS.on}+`} />
        <StatusBadge status="watch" label={`Watch · ${STATUS_CUTS.watch}–${STATUS_CUTS.on - 1}`} />
        <StatusBadge status="off" label={`Off target · under ${STATUS_CUTS.watch}`} />
      </div>
    </>
  );
}

export function HowItScores() {
  return (
    <Card className="overflow-hidden">
      <CardHeader title="How the score is worked out" description="The same rule for every business, every month." />
      <HowItScoresSteps />
    </Card>
  );
}
