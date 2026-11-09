import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BOARD_KEY, DEV_SNAPSHOT, type BoardData } from "../lib/board";
import type { MeasureDef } from "../lib/scoring";
import { errorMessage, supabase } from "../lib/supabase";
import { unitValue } from "../lib/format";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/utils";
import { Button, Card, CardHeader, Input, PageHeader } from "../components/ui";
import { HowItScores } from "../components/HowItScores";
import { BoardGate } from "../components/board-bits";

const RULE: Record<MeasureDef["direction"], string> = {
  higher: "Higher is better",
  lower: "At or under target",
  band: "Within the band",
};

export default function Scorecard() {
  return (
    <>
      <PageHeader
        eyebrow="Manage"
        title="Targets"
        description="What each business is aiming for. Change a target here and every score that uses it updates."
      />
      <BoardGate>
        {(d) => (
          <div className="space-y-6">
            <Targets data={d} />
            <HowItScores />
          </div>
        )}
      </BoardGate>
    </>
  );
}

type Cell = { target: string; applicable: boolean };

function Targets({ data }: { data: BoardData }) {
  const { role } = useAuth();
  const owner = DEV_SNAPSHOT || role === "owner";
  const qc = useQueryClient();

  const initial = useMemo(() => {
    const o: Record<string, Cell> = {};
    for (const cm of data.companyMeasures) {
      o[`${cm.company_id}:${cm.measure_code}`] = { target: cm.target != null ? String(cm.target) : "", applicable: cm.applicable };
    }
    return o;
  }, [data.companyMeasures]);
  const [draft, setDraft] = useState(initial);
  useEffect(() => setDraft(initial), [initial]);
  const key = (c: string, m: string) => `${c}:${m}`;
  const cell = (c: string, m: string): Cell => draft[key(c, m)] ?? { target: "", applicable: true };
  const changed = Object.keys(draft).filter(
    (k) => draft[k].target !== (initial[k]?.target ?? "") || draft[k].applicable !== (initial[k]?.applicable ?? true),
  );

  const save = useMutation({
    mutationFn: async () => {
      if (DEV_SNAPSHOT) throw new Error("Saving is off in the local preview.");
      const rows = changed.map((k) => {
        const [company_id, measure_code] = k.split(":");
        const t = draft[k].target.trim();
        const target = t === "" ? null : Number(t.replace(/[₱,%\s]/g, ""));
        if (target != null && !Number.isFinite(target)) throw new Error("Targets must be numbers.");
        return { company_id, measure_code, target, applicable: draft[k].applicable };
      });
      for (const r of rows) {
        const { error } = await supabase
          .from("company_measures")
          .update({ target: r.target, applicable: r.applicable })
          .eq("company_id", r.company_id)
          .eq("measure_code", r.measure_code);
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(`Saved ${n} ${n === 1 ? "target" : "targets"}.`);
      void qc.invalidateQueries({ queryKey: BOARD_KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const companies = data.companies;
  return (
    <Card>
      <CardHeader
        title="Measures and targets"
        description={
          owner
            ? "A blank target uses the scorecard default. Untick a box when a measure doesn't apply to that business; it drops out of its score."
            : "Only the owner can change targets."
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-mist-50 text-[11px] tracking-[0.12em] text-ink-muted uppercase">
            <tr>
              <th className="px-5 py-2.5 font-semibold">Measure</th>
              <th className="px-3 py-2.5 font-semibold">Rule</th>
              <th className="px-3 py-2.5 font-semibold">Default</th>
              {companies.map((c) => (
                <th key={c.id} className="px-3 py-2.5 font-semibold">
                  {c.short_name ?? c.name}
                </th>
              ))}
            </tr>
          </thead>
          {[...data.categories]
            .sort((a, b) => a.sort - b.sort)
            .map((cat) => (
              <tbody key={cat.code} className="divide-y divide-mist-200 border-t border-mist-200">
                <tr className="bg-mist-50/60">
                  <td colSpan={3 + companies.length} className="px-5 py-2 text-[13px] font-semibold text-ink">
                    {cat.name} <span className="font-normal text-ink-muted">· {Number(cat.weight)}%</span>
                  </td>
                </tr>
                {data.measures
                  .filter((m) => m.category_code === cat.code)
                  .sort((a, b) => a.sort - b.sort)
                  .map((m) => (
                    <tr key={m.code}>
                      <td className="px-5 py-2.5">
                        <span className="text-ink">{m.name}</span>
                        {m.help && <span className="block max-w-[320px] text-xs text-ink-muted">{m.help}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-ink-muted">{RULE[m.direction]}</td>
                      <td className="px-3 py-2.5 text-ink-soft tabular-nums">
                        {m.direction === "band" ? `±${unitValue(m.band, m.unit)}` : unitValue(m.default_target, m.unit)}
                      </td>
                      {companies.map((c) => {
                        const v = cell(c.id, m.code);
                        const cm = data.companyMeasures.find((x) => x.company_id === c.id && x.measure_code === m.code);
                        return (
                          <td key={c.id} className="px-3 py-2">
                            <div className={cn("flex items-center gap-2", !v.applicable && "opacity-50")}>
                              <input
                                type="checkbox"
                                checked={v.applicable}
                                disabled={!owner}
                                onChange={(e) => setDraft((d) => ({ ...d, [key(c.id, m.code)]: { ...v, applicable: e.target.checked } }))}
                                className="size-4 accent-brand-700"
                                aria-label={`${m.name} applies to ${c.name}`}
                              />
                              <Input
                                value={v.target}
                                inputMode="decimal"
                                disabled={!owner || !v.applicable || m.direction === "band"}
                                placeholder={m.direction === "band" ? "—" : "Default"}
                                onChange={(e) => setDraft((d) => ({ ...d, [key(c.id, m.code)]: { ...v, target: e.target.value } }))}
                                className="h-8 w-28 text-[13px] tabular-nums"
                                aria-label={`${m.name} target for ${c.name}`}
                              />
                              {cm?.source === "system" && (
                                <span className="text-[10px] font-semibold tracking-wide text-brand-700 uppercase" title="Synced from the NAM Supply system">
                                  Sync
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            ))}
        </table>
      </div>
      {owner && (
        <div className="flex items-center justify-end gap-2 border-t border-mist-200 px-5 py-3">
          <span className="mr-auto text-sm text-ink-muted">{changed.length ? `${changed.length} unsaved` : ""}</span>
          <Button variant="secondary" disabled={!changed.length} onClick={() => setDraft(initial)}>
            Undo
          </Button>
          <Button disabled={!changed.length} loading={save.isPending} onClick={() => save.mutate()}>
            Save targets
          </Button>
        </div>
      )}
    </Card>
  );
}
