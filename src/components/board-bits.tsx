import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { addMonths, format, parseISO, startOfMonth, startOfQuarter, startOfYear, subMonths, subQuarters, subYears, endOfQuarter } from "date-fns";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Database, Lock } from "lucide-react";
import { dataSpan, defaultPeriod, monthsIn, PrivateBoardError, shiftRange, useBoard, type BoardData, type Range } from "../lib/board";
import { isMissingSchema, errorMessage } from "../lib/supabase";
import { cn } from "../lib/utils";
import { EmptyState, ErrorBox, Spinner } from "./ui";

/*
 * The period everything is looking at — Malaya's global date filter, by the
 * month. It lives in the URL (?p=this_year, or ?from=2026-01&to=2026-07) so
 * the top-bar picker, every page and every shared link agree on it.
 */

export type Preset = "this_month" | "last_month" | "this_quarter" | "last_quarter" | "this_year" | "last_year" | "all";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "this_quarter", label: "This quarter" },
  { key: "last_quarter", label: "Last quarter" },
  { key: "this_year", label: "This year" },
  { key: "last_year", label: "Last year" },
  { key: "all", label: "All time" },
];

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const ym = (p: string) => p.slice(0, 7);
const okYm = (s: string | null): s is string => !!s && /^\d{4}-\d{2}$/.test(s);

function resolvePreset(p: Preset, data: BoardData | undefined): Range {
  const now = startOfMonth(new Date());
  switch (p) {
    case "this_month":
      return { from: iso(now), to: iso(now) };
    case "last_month":
      return { from: iso(subMonths(now, 1)), to: iso(subMonths(now, 1)) };
    case "this_quarter":
      return { from: iso(startOfQuarter(now)), to: iso(now) };
    case "last_quarter": {
      const q = subQuarters(now, 1);
      return { from: iso(startOfQuarter(q)), to: iso(startOfMonth(endOfQuarter(q))) };
    }
    case "this_year":
      return { from: iso(startOfYear(now)), to: iso(now) };
    case "last_year": {
      const y = subYears(now, 1);
      return { from: iso(startOfYear(y)), to: iso(addMonths(startOfYear(y), 11)) };
    }
    case "all": {
      const span = dataSpan(data);
      return span ? { from: span.first, to: span.last } : { from: iso(now), to: iso(now) };
    }
  }
}

export function rangeLabel(r: Range) {
  const a = parseISO(r.from);
  const b = parseISO(r.to);
  if (r.from === r.to) return format(a, "MMMM yyyy");
  if (a.getFullYear() === b.getFullYear()) return `${format(a, "MMM")} – ${format(b, "MMM yyyy")}`;
  return `${format(a, "MMM yyyy")} – ${format(b, "MMM yyyy")}`;
}

/** "this month" / "these 7 months", for sentences. */
export function rangeNoun(r: Range) {
  const n = monthsIn(r).length;
  return n === 1 ? format(parseISO(r.from), "MMMM") : `these ${n} months`;
}

export function useRange() {
  const { data } = useBoard();
  const [params, setParams] = useSearchParams();
  const p = params.get("p") as Preset | null;
  const from = params.get("from");
  const to = params.get("to");
  const m = params.get("m");

  let range: Range;
  let preset: Preset | null = null;
  if (p && PRESETS.some((x) => x.key === p)) {
    preset = p;
    range = resolvePreset(p, data);
  } else if (okYm(from) && okYm(to)) {
    range = from <= to ? { from: `${from}-01`, to: `${to}-01` } : { from: `${to}-01`, to: `${from}-01` };
  } else if (okYm(m)) {
    range = { from: `${m}-01`, to: `${m}-01` };
  } else {
    const d = defaultPeriod(data);
    range = { from: d, to: d };
  }

  const write = (fn: (next: URLSearchParams) => void) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        ["p", "from", "to", "m"].forEach((k) => next.delete(k));
        fn(next);
        return next;
      },
      { replace: true },
    );

  return {
    range,
    preset,
    label: rangeLabel(range),
    months: monthsIn(range).length,
    setPreset: (key: Preset) => write((n) => n.set("p", key)),
    setRange: (r: Range) =>
      write((n) => {
        n.set("from", ym(r.from));
        n.set("to", ym(r.to));
      }),
  };
}

/** A link target that keeps the period the person is looking at. */
export function useWithPeriod() {
  const [params] = useSearchParams();
  return (to: string) => {
    const keep = new URLSearchParams();
    ["p", "from", "to", "m"].forEach((k) => {
      const v = params.get(k);
      if (v) keep.set(k, v);
    });
    const q = keep.toString();
    if (!q) return to;
    return `${to}${to.includes("?") ? "&" : "?"}${q}`;
  };
}

/** Top-bar period picker: ‹ [This year · Jan – Nov 2026 ▾] ›, presets and a month range in the popover. */
export function PeriodPicker({ className }: { className?: string }) {
  const { data } = useBoard();
  const { range, preset, label, setPreset, setRange } = useRange();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const span = dataSpan(data);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const btn =
    "grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-ink-muted transition-colors hover:bg-mist-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35";
  const atEnd = range.to >= iso(startOfMonth(new Date()));
  const presetLabel = PRESETS.find((x) => x.key === preset)?.label;

  return (
    <div ref={box} className={cn("relative", className)}>
      <div className="flex h-10 items-center gap-0.5 rounded-full border border-mist-300 bg-white px-1 shadow-level-1">
        <button type="button" className={btn} onClick={() => setRange(shiftRange(range, -1))} aria-label="Earlier">
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="flex h-8 min-w-0 cursor-pointer items-center gap-2 rounded-full px-2.5 text-sm text-ink hover:bg-mist-100"
        >
          <CalendarDays className="size-4 shrink-0 text-ink-muted" />
          <span className="truncate">
            {presetLabel && <span className="text-ink-muted">{presetLabel} · </span>}
            <span className="font-medium">{label}</span>
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-ink-muted" />
        </button>
        <button type="button" className={btn} onClick={() => setRange(shiftRange(range, 1))} disabled={atEnd} aria-label="Later">
          <ChevronRight className="size-4" />
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a period"
          className="absolute top-full right-0 z-50 mt-2 w-[320px] max-w-[calc(100vw-2rem)] rounded-3xl border border-mist-200 bg-white p-3 shadow-level-4 max-sm:left-1/2 max-sm:-translate-x-1/2"
        >
          <div className="grid grid-cols-2 gap-1">
            {PRESETS.map((x) => (
              <button
                key={x.key}
                type="button"
                onClick={() => {
                  setPreset(x.key);
                  setOpen(false);
                }}
                className={cn(
                  "cursor-pointer rounded-2xl px-3.5 py-2.5 text-left text-sm transition-colors",
                  preset === x.key ? "bg-brand-700 font-medium text-mist-50 shadow-level-2" : "text-ink hover:bg-mist-100",
                  x.key === "all" && "col-span-2",
                )}
              >
                {x.label}
              </button>
            ))}
          </div>
          <div className="mt-3 border-t border-mist-200 px-1 pt-3">
            <p className="eyebrow">Or pick the months</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block text-xs text-ink-muted">
                From
                <input
                  type="month"
                  value={ym(range.from)}
                  max={ym(range.to)}
                  onChange={(e) => okYm(e.target.value) && setRange({ from: `${e.target.value}-01`, to: range.to })}
                  className="mt-1 h-10 w-full rounded-xl border border-mist-300 bg-white px-2.5 text-sm text-ink focus:border-brand-700 focus:ring-2 focus:ring-brand-700/15 focus:outline-none"
                />
              </label>
              <label className="block text-xs text-ink-muted">
                To
                <input
                  type="month"
                  value={ym(range.to)}
                  min={ym(range.from)}
                  onChange={(e) => okYm(e.target.value) && setRange({ from: range.from, to: `${e.target.value}-01` })}
                  className="mt-1 h-10 w-full rounded-xl border border-mist-300 bg-white px-2.5 text-sm text-ink focus:border-brand-700 focus:ring-2 focus:ring-brand-700/15 focus:outline-none"
                />
              </label>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              Showing {label}.{" "}
              {span
                ? `Results run from ${format(parseISO(span.first), "MMMM yyyy")} to ${format(parseISO(span.last), "MMMM yyyy")}; months outside that are empty.`
                : "No results recorded yet."}{" "}
              Targets are monthly, so a span adds peso targets up and averages the rest.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** A plain month picker for pages that work on one month at a time (Record results). */
export function MonthSelect({ value, onChange, className }: { value: string; onChange: (p: string) => void; className?: string }) {
  const { data } = useBoard();
  const span = dataSpan(data);
  const now = iso(startOfMonth(new Date()));
  const first = span && span.first < now ? span.first : now;
  const options = monthsIn({ from: iso(subMonths(parseISO(first), 0)), to: now }).reverse();
  if (!options.includes(value)) options.unshift(value);
  return (
    <label className={cn("relative inline-flex h-10 items-center gap-2 rounded-full border border-mist-300 bg-white pr-3 pl-3.5 text-sm shadow-level-1", className)}>
      <CalendarDays className="size-4 text-ink-muted" aria-hidden />
      <span className="sr-only">Month</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-full cursor-pointer appearance-none bg-transparent pr-5 font-medium focus:outline-none">
        {options.map((p) => (
          <option key={p} value={p}>
            {format(parseISO(p), "MMMM yyyy")}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 size-3.5 text-ink-muted" />
    </label>
  );
}

/** Loading, errors, a private board and the not-set-up-yet case, so each page only renders the happy path. */
export function BoardGate({ children }: { children: (data: BoardData) => ReactNode }) {
  const { data, error, isLoading } = useBoard();
  if (isLoading) return <Spinner label="Loading the board" />;
  if (error instanceof PrivateBoardError) return <PrivateNotice />;
  if (error && (isMissingSchema(error) || /board_data/.test(String((error as { message?: string }).message)))) {
    return (
      <EmptyState icon={<Database />} title="The database isn't fully set up">
        Run <code className="rounded bg-mist-100 px-1">supabase/02_view_links.sql</code> in the Supabase SQL editor, then refresh.
      </EmptyState>
    );
  }
  if (error) return <ErrorBox>{errorMessage(error)}</ErrorBox>;
  if (!data) return null;
  return <>{children(data)}</>;
}

export function PrivateNotice() {
  return (
    <EmptyState
      icon={<Lock />}
      title="This board is private"
      action={
        <Link to="/login" className="inline-flex h-10 items-center rounded-xl border border-mist-300 bg-white px-4 text-sm font-medium text-ink shadow-level-1 hover:bg-mist-100">
          Sign in
        </Link>
      }
    >
      Open it from the link you were sent — after that this device remembers it. Or sign in if you have an account.
    </EmptyState>
  );
}
