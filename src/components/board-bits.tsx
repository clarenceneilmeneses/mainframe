import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { format, parseISO, addMonths } from "date-fns";
import { ChevronLeft, ChevronRight, Database } from "lucide-react";
import { defaultPeriod, periodsOf, useBoard, type BoardData } from "../lib/board";
import { isMissingSchema, errorMessage } from "../lib/supabase";
import { monthLabel } from "../lib/format";
import { cn } from "../lib/utils";
import { EmptyState, ErrorBox, Spinner } from "./ui";

/**
 * The month everything is looking at. It lives in the URL (?m=2026-07) so the
 * top-bar picker, every page and every shared link agree on it, as Malaya's
 * global date filter does.
 */
export function usePeriod() {
  const { data } = useBoard();
  const [params, setParams] = useSearchParams();
  const m = params.get("m");
  const period = m && /^\d{4}-\d{2}$/.test(m) ? `${m}-01` : defaultPeriod(data);
  const setPeriod = (p: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("m", p.slice(0, 7));
        return next;
      },
      { replace: true },
    );
  return [period, setPeriod] as const;
}

/** A link target that keeps the month the person is looking at. */
export function useWithMonth() {
  const [params] = useSearchParams();
  const m = params.get("m");
  return (to: string) => {
    if (!m) return to;
    return `${to}${to.includes("?") ? "&" : "?"}m=${m}`;
  };
}

/** Top-bar month picker: ‹ July 2026 ›, with the list in the middle. */
export function MonthNav({ className }: { className?: string }) {
  const { data } = useBoard();
  const [period, setPeriod] = usePeriod();
  const options = periodsOf(data);
  if (!options.includes(period)) options.unshift(period);
  const step = (n: number) => setPeriod(format(addMonths(parseISO(period), n), "yyyy-MM-dd"));
  const newest = options[0];
  const atNewest = period >= newest;
  const btn =
    "grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-ink-muted transition-colors hover:bg-mist-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35";
  return (
    <div
      className={cn(
        "flex h-10 items-center gap-0.5 rounded-full border border-mist-300 bg-white px-1 shadow-level-1",
        className,
      )}
    >
      <button type="button" className={btn} onClick={() => step(-1)} aria-label="Previous month">
        <ChevronLeft className="size-4" />
      </button>
      <label className="relative">
        <span className="sr-only">Month</span>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="h-8 cursor-pointer appearance-none rounded-full bg-transparent px-2 text-center text-sm font-medium text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700/20"
        >
          {options.map((p) => (
            <option key={p} value={p}>
              {monthLabel(p)}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className={btn} onClick={() => step(1)} disabled={atNewest} aria-label="Next month">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

/** Loading, errors and the not-set-up-yet case, so each page only renders the happy path. */
export function BoardGate({ children }: { children: (data: BoardData) => ReactNode }) {
  const { data, error, isLoading } = useBoard();
  if (isLoading) return <Spinner label="Loading the board" />;
  if (error && isMissingSchema(error)) {
    return (
      <EmptyState icon={<Database />} title="The database isn't set up yet">
        Run <code className="rounded bg-mist-100 px-1">supabase/setup.sql</code> in the Supabase SQL editor, then refresh.
      </EmptyState>
    );
  }
  if (error) return <ErrorBox>{errorMessage(error)}</ErrorBox>;
  if (!data) return null;
  return <>{children(data)}</>;
}
