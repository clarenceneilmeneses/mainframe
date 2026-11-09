import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!url || !key) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY");
}

export const supabase = createClient(url, key);

/** Turns a Supabase/Postgres error into a sentence a person can read. */
export function errorMessage(err: unknown): string {
  if (!err) return "Something went wrong.";
  if (typeof err === "string") return err;
  if (typeof err === "object" && "message" in err) {
    const msg = String((err as { message: unknown }).message);
    if (msg.includes("Failed to fetch")) return "Can't reach the server. Check your connection and try again.";
    if (msg.includes("row-level security")) return "Your account can view the board but can't change it.";
    return msg;
  }
  return "Something went wrong.";
}

/** True when the tables from supabase/setup.sql haven't been created yet. */
export function isMissingSchema(err: unknown) {
  const e = err as { code?: string; message?: string } | null;
  return e?.code === "PGRST205" || e?.code === "42P01" || /Could not find the table/i.test(e?.message ?? "");
}
