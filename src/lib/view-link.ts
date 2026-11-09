/**
 * The private view link: https://…/?k=<token>. Opened once, the token is kept
 * on the device, so the CEO can bookmark the board and never sign in. The
 * token only lets the board be read (see supabase/02_view_links.sql).
 */
const KEY = "mainframe:view-token";
let memory: string | null = null;

function capture() {
  const url = new URL(window.location.href);
  const k = url.searchParams.get("k");
  if (!k) return;
  memory = k;
  try {
    localStorage.setItem(KEY, k);
  } catch {
    /* storage blocked: the token lives for this visit only */
  }
  // Take it out of the address bar so it isn't copied along with a page link by accident.
  url.searchParams.delete("k");
  window.history.replaceState(window.history.state, "", url.toString());
}
capture();

export function viewToken(): string | null {
  if (memory) return memory;
  try {
    memory = localStorage.getItem(KEY);
  } catch {
    /* ignore */
  }
  return memory;
}

export function forgetViewToken() {
  memory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
