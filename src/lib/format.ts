import { format, parseISO } from "date-fns";
import type { Unit } from "./scoring";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });

export function money(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return peso.format(Number.isFinite(v) ? v : 0);
}

export function compactMoney(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `₱${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `₱${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `₱${Math.round(n)}`;
}

/** A measure's value in its own unit: ₱1.17M, 95.1%, 3.2×, 4.6 / 5. */
export function unitValue(v: number | null | undefined, unit: Unit, opts: { full?: boolean } = {}) {
  if (v == null || !Number.isFinite(v)) return "—";
  switch (unit) {
    case "php":
      return opts.full ? money(v) : compactMoney(v);
    case "pct":
      return `${trim(v, 1)}%`;
    case "ratio":
      return `${trim(v, 1)}×`;
    case "score5":
      return `${trim(v, 2)} / 5`;
    case "count":
      return trim(v, 1);
  }
}

function trim(v: number, digits: number) {
  return Number(v.toFixed(digits)).toLocaleString("en-PH", { maximumFractionDigits: digits });
}

/** "2026-07-01" → "July 2026" */
export function monthLabel(period: string, pattern = "MMMM yyyy") {
  return format(parseISO(period), pattern);
}

export function prettyDateTime(s: string | null | undefined) {
  if (!s) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(new Date(s));
}

export function plural(n: number, word: string, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}
