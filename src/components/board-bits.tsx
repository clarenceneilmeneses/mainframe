import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, Database } from "lucide-react";
import { defaultPeriod, periodsOf, useBoard, type BoardData } from "../lib/board";
import { isMissingSchema, errorMessage } from "../lib/supabase";
import { monthLabel } from "../lib/format";
import { cn } from "../lib/utils";
import { EmptyState, ErrorBox, Spinner } from "./ui";

/** The month being looked at, kept in the URL (?m=2026-07) so a link opens on the same month. */
export function usePeriod(data: BoardData | undefined) {
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

export function MonthSelect({
  data,
  value,
  onChange,
  className,
}: {
  data: BoardData | undefined;
  value: string;
  onChange: (p: string) => void;
  className?: string;
}) {
  const options = periodsOf(data);
  if (!options.includes(value)) options.unshift(value);
  return (
    <label
      className={cn(
        "relative inline-flex h-10 items-center gap-2 rounded-full border border-mist-300 bg-white pr-3 pl-3.5 text-sm text-ink shadow-level-1 focus-within:ring-2 focus-within:ring-brand-700/15",
        className,
      )}
    >
      <CalendarDays className="size-4 text-ink-muted" aria-hidden />
      <span className="sr-only">Month</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full cursor-pointer appearance-none bg-transparent pr-5 font-medium focus:outline-none"
      >
        {options.map((p) => (
          <option key={p} value={p}>
            {monthLabel(p)}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-3 size-3 text-ink-muted" viewBox="0 0 12 12" aria-hidden>
        <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </label>
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
