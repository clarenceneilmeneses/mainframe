#!/usr/bin/env node
/**
 * NAM Supply → Mainframe. Works out NAM Supply's monthly KPI figures from its
 * sales system and writes them to kpi_actuals as source = 'system'.
 *
 *   npm run sync:nam -- --dump "path/to/u476854436_nam.sql"   from a phpMyAdmin dump
 *   npm run sync:nam -- --live                                from NAM's Supabase (needs NAM_SUPABASE_URL + NAM_SECRET_KEY)
 *   add --snapshot   to also write public/dev-snapshot.json for the local preview (gitignored)
 *   add --dry        to print the figures without writing to the database
 *
 * Reads .env.local for VITE_SUPABASE_URL + SUPABASE_SECRET_KEY (Mainframe's own project).
 *
 * What each figure means — keep in step with the help text in supabase/setup.sql:
 *   sales_vs_target  Σ total_nam_amount of sales dated in the month.
 *   gross_margin     Σ income ÷ Σ total_nam_amount for those sales, as %.
 *   pipeline_cover   Σ total_amount of quotations still Pending, dated in the 60 days
 *                    up to month end, ÷ the monthly sales target. (Quote rows are per item.)
 *   collections      Of the delivered sales whose due date falls in the month, the share
 *                    (by amount due) marked Paid, as %. Recent months rise as payments land.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);

function loadEnv(file) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}
loadEnv(".env.local");

const PIPELINE_WINDOW_DAYS = 60;
const DEFAULT_SALES_TARGET = 2_500_000;

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/** Rows of one table from a MySQL/MariaDB dump's INSERT statements. */
function dumpRows(src, table) {
  const rows = [];
  const re = new RegExp("INSERT INTO `" + table + "` [(]([^)]*)[)] VALUES[ \\r\\n]*", "g");
  let m;
  while ((m = re.exec(src))) {
    const cols = m[1].split(",").map((c) => c.trim().replace(/`/g, ""));
    const { tuples, end } = readTuples(src, re.lastIndex);
    for (const vals of tuples) rows.push(Object.fromEntries(cols.map((c, k) => [c, vals[k]])));
    re.lastIndex = end;
  }
  return rows;
}

/** Reads `(…), (…), …` from position i; strings in '…' with \ or '' escapes, NULL as null. */
function readTuples(src, i) {
  const tuples = [];
  for (;;) {
    while (/[\s,]/.test(src[i] ?? "")) i++;
    if (src[i] !== "(") break;
    i++;
    const vals = [];
    for (;;) {
      while (src[i] === " " || src[i] === "\n" || src[i] === "\r") i++;
      if (src[i] === "'") {
        let s = "";
        i++;
        for (;;) {
          const ch = src[i];
          if (ch === "\\") {
            const n = src[i + 1];
            s += n === "n" ? "\n" : n === "r" ? "\r" : n === "t" ? "\t" : n === "0" ? "\0" : n;
            i += 2;
          } else if (ch === "'" && src[i + 1] === "'") {
            s += "'";
            i += 2;
          } else if (ch === "'") {
            i++;
            break;
          } else {
            s += ch;
            i++;
          }
        }
        vals.push(s);
      } else {
        let j = i;
        while (src[j] !== "," && src[j] !== ")") j++;
        const raw = src.slice(i, j).trim();
        vals.push(/^null$/i.test(raw) ? null : raw);
        i = j;
      }
      while (src[i] === " ") i++;
      if (src[i] === ",") {
        i++;
        continue;
      }
      if (src[i] === ")") {
        i++;
        break;
      }
    }
    tuples.push(vals);
  }
  return { tuples, end: i };
}

async function liveRows(table, select) {
  const url = process.env.NAM_SUPABASE_URL;
  const key = process.env.NAM_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "--live needs NAM_SUPABASE_URL and NAM_SECRET_KEY in .env.local (NAM Supply's project, not Mainframe's).\n" +
        "The secret key is in NAM Supply's Supabase dashboard: Project Settings → API Keys → Secret keys.\n" +
        "Its publishable key won't do: sales and quotations are only readable by signed-in staff.",
    );
  }
  const out = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${url}/rest/v1/${table}?select=${select}&order=id`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` },
    });
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
    const page = await res.json();
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

const n = (v) => (v == null || v === "" ? 0 : Number(v));
const monthOf = (d) => (d ? `${String(d).slice(0, 7)}-01` : null);
const round = (v, d = 2) => Number(v.toFixed(d));
const clean = (v, fallback) => (v == null || String(v).trim() === "" ? fallback : String(v).trim().replace(/\s+/g, " "));
const add = (map, key, v) => map.set(key, (map.get(key) ?? 0) + v);
/** Largest entries first; the rest folded into "Everything else" when asked. */
function top(map, k, other = true) {
  const rows = [...map].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const out = rows.slice(0, k).map(([label, value]) => ({ label, value: round(value) }));
  const rest = rows.slice(k).reduce((a, [, v]) => a + v, 0);
  if (other && rest > 0) out.push({ label: "Everything else", value: round(rest) });
  return out;
}

export function monthlyFigures(sales, quotes, salesTarget) {
  const months = new Map();
  const get = (k) => {
    if (!months.has(k))
      months.set(k, { sales: 0, income: 0, rows: 0, due: 0, collected: 0, dueRows: 0, cat: new Map(), client: new Map(), unpaid: new Map() });
    return months.get(k);
  };
  for (const s of sales) {
    const k = monthOf(s.date);
    if (!k) continue;
    const m = get(k);
    m.sales += n(s.total_nam_amount);
    m.income += n(s.income);
    m.rows++;
    const cat = clean(s.category, "Uncategorised");
    const c = m.cat.get(cat) ?? { sales: 0, income: 0 };
    c.sales += n(s.total_nam_amount);
    c.income += n(s.income);
    m.cat.set(cat, c);
    add(m.client, clean(s.company, "No client name"), n(s.total_nam_amount));
  }
  for (const s of sales) {
    if (!s.date_delivered || !s.due_date) continue;
    const k = monthOf(s.due_date);
    if (!months.has(k)) continue; // only months the system has sales for
    const m = get(k);
    const amt = n(s.total_amount_due) || n(s.total_nam_amount);
    m.due += amt;
    m.dueRows++;
    if (s.payment_status === "Paid") m.collected += amt;
    else add(m.unpaid, clean(s.company, "No client name"), amt);
  }

  const figures = [];
  for (const [period, m] of [...months].sort(([a], [b]) => a.localeCompare(b))) {
    const end = new Date(`${period}T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - PIPELINE_WINDOW_DAYS);
    let pipe = 0;
    let pipeRows = 0;
    let quotesInSystem = false;
    const pipeBy = new Map();
    for (const q of quotes) {
      const d = new Date(`${String(q.date).slice(0, 10)}T00:00:00Z`);
      if (d < end) quotesInSystem = true;
      if (d >= start && d < end && q.status === "Pending") {
        pipe += n(q.total_amount);
        pipeRows++;
        add(pipeBy, clean(q.company, "No client name"), n(q.total_amount));
      }
    }

    figures.push({ period, measure_code: "sales_vs_target", actual: round(m.sales), detail: {
        sales_rows: m.rows,
        breakdowns: [
          { title: "Sales by product category", unit: "php", rows: top(new Map([...m.cat].map(([k, v]) => [k, v.sales])), 6) },
          { title: "Biggest clients this month", unit: "php", rows: top(m.client, 5, false) },
        ],
      } });
    if (m.sales > 0) {
      figures.push({
        period,
        measure_code: "gross_margin",
        actual: round((m.income / m.sales) * 100),
        detail: {
          income: round(m.income),
          sales: round(m.sales),
          breakdowns: [
            {
              title: "Margin by product category (biggest sellers)",
              unit: "pct",
              rows: [...m.cat]
                .filter(([, v]) => v.sales > 0)
                .sort((a, b) => b[1].sales - a[1].sales)
                .slice(0, 6)
                .map(([label, v]) => ({ label, value: round((v.income / v.sales) * 100) })),
            },
          ],
        },
      });
    }
    // Before the quotations module existed there is no pipeline to measure.
    if (quotesInSystem && pipeRows > 0) {
      figures.push({
        period,
        measure_code: "pipeline_cover",
        actual: round(pipe / salesTarget),
        detail: {
          open_quotes_value: round(pipe),
          quote_lines: pipeRows,
          window_days: PIPELINE_WINDOW_DAYS,
          sales_target: salesTarget,
          breakdowns: [{ title: "Open quotes by client", unit: "php", rows: top(pipeBy, 5, false) }],
        },
      });
    }
    if (m.due > 0) {
      figures.push({
        period,
        measure_code: "collections",
        actual: round((m.collected / m.due) * 100),
        detail: {
          amount_due: round(m.due),
          collected: round(m.collected),
          lines_due: m.dueRows,
          breakdowns: [{ title: "Still unpaid, by client", unit: "php", rows: top(m.unpaid, 5, false) }],
        },
      });
    }
  }
  return figures;
}

// ---------------------------------------------------------------------------
// Mainframe
// ---------------------------------------------------------------------------

const MF_URL = process.env.VITE_SUPABASE_URL;
const MF_KEY = process.env.SUPABASE_SECRET_KEY;

async function mf(pathAndQuery, init = {}) {
  const res = await fetch(`${MF_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: { apikey: MF_KEY, Authorization: `Bearer ${MF_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`${pathAndQuery}: ${res.status} ${text}`), { status: res.status, body: text });
  return text ? JSON.parse(text) : null;
}

/**
 * The scorecards straight out of supabase/setup.sql and 03_scorecards.sql, for
 * the offline snapshot: what the database looks like once both have run.
 */
function seedFromSetupSql() {
  const files = ["setup.sql", "03_scorecards.sql"]
    .map((f) => path.join(root, "supabase", f))
    .filter((f) => fs.existsSync(f))
    .map((f) => fs.readFileSync(f, "utf8"));
  // Every `insert into public.<table> (...) values ...` in either file, in order.
  const block = (table) =>
    files.flatMap((sql) => {
      const out = [];
      const head = `insert into public.${table} (`;
      for (let at = sql.indexOf(head); at !== -1; at = sql.indexOf(head, at + 1)) {
        const close = sql.indexOf(")", at);
        const valuesAt = sql.indexOf("values", close);
        // Only "insert ... values", not "insert ... select".
        if (valuesAt === -1 || sql.slice(close + 1, valuesAt).trim() !== "") continue;
        const cols = sql.slice(sql.indexOf("(", at) + 1, close).split(",").map((c) => c.trim());
        const { tuples } = readTuples(sql, valuesAt + 6);
        out.push(...tuples.map((v) => Object.fromEntries(cols.map((c, i) => [c, v[i]]))));
      }
      return out;
    });
  const num = (v) => (v == null ? null : Number(v));
  const scorecards = block("scorecards").map((r) => ({ ...r, sort: num(r.sort) }));
  // Categories from before 03 are the Builders scorecard, as 03 makes them.
  const LEGACY_SHORT = { sales: "Sales", finance: "Finance", projects: "Projects", procurement: "Procurement", supply: "Delivery", quality: "Quality", hr: "People", governance: "Governance", customer: "Customers" };
  const categories = block("kpi_categories").map((r) => ({
    scorecard_code: "builders",
    short_name: LEGACY_SHORT[r.code] ?? null,
    ...r,
    weight: num(r.weight),
    sort: num(r.sort),
  }));
  const measures = block("kpi_measures").map((r) => ({ ...r, default_target: num(r.default_target), band: num(r.band), sort: num(r.sort) }));
  const ON = { "nam-trading": "trading" }; // what 03's updates do
  const companies = block("companies").map((r, i) => ({
    id: `local-${i + 1}`,
    ...r,
    scorecard_code: r.scorecard_code ?? ON[r.slug] ?? "builders",
    sort: num(r.sort),
  }));
  const system = { sales_vs_target: DEFAULT_SALES_TARGET, gross_margin: 20, pipeline_cover: 3, collections: 95 };
  const companyMeasures = companies.flatMap((c) => {
    const cats = new Set(categories.filter((k) => k.scorecard_code === c.scorecard_code).map((k) => k.code));
    return measures
      .filter((m) => cats.has(m.category_code))
      .map((m) => {
        const sys = c.slug === "nam-supply" && m.code in system;
        const quarters = c.slug === "nam-trading" && m.code === "tr_sales_vs_target" ? [3000000, 3000000, 4200000, 4200000] : null;
        return {
          company_id: c.id,
          measure_code: m.code,
          applicable: true,
          target: sys ? system[m.code] : null,
          quarter_targets: quarters,
          source: sys ? "system" : "manual",
        };
      });
  });
  return { scorecards, companies, categories, measures, companyMeasures };
}

// ---------------------------------------------------------------------------

async function main() {
  const dump = opt("--dump");
  let sales;
  let quotes;
  let origin;
  if (dump) {
    const src = fs.readFileSync(dump, "utf8");
    sales = dumpRows(src, "sales");
    quotes = dumpRows(src, "quotations");
    origin = `dump ${path.basename(dump)}`;
  } else if (flag("--live")) {
    sales = await liveRows("sales", "id,date,company,category,total_nam_amount,income,date_delivered,due_date,payment_status,total_amount_due");
    quotes = await liveRows("quotations", "id,date,company,total_amount,status");
    origin = "NAM Supply live database";
  } else {
    console.error("Say where from: --dump <file.sql> or --live");
    process.exit(1);
  }
  console.log(`Read ${sales.length} sales and ${quotes.length} quotation lines from the ${origin}.`);

  // NAM Supply's own sales target, if the owner has changed it on the board.
  let companyId = null;
  let salesTarget = DEFAULT_SALES_TARGET;
  const online = !flag("--dry") && MF_URL && MF_KEY;
  if (online) {
    try {
      const [c] = await mf("companies?slug=eq.nam-supply&select=id");
      if (!c) throw new Error("No company with slug nam-supply. Run supabase/setup.sql first.");
      companyId = c.id;
      const [cm] = await mf(`company_measures?company_id=eq.${companyId}&measure_code=eq.sales_vs_target&select=target`);
      if (cm?.target) salesTarget = Number(cm.target);
    } catch (e) {
      if (/PGRST205|Could not find the table/.test(String(e.body ?? e.message))) {
        console.warn("Mainframe tables aren't there yet — run supabase/setup.sql. Skipping the database write.");
        companyId = null;
      } else throw e;
    }
  }

  const figures = monthlyFigures(sales, quotes, salesTarget);
  console.table(
    Object.values(
      figures.reduce((acc, f) => {
        (acc[f.period] ??= { month: f.period.slice(0, 7) })[f.measure_code] = f.actual;
        return acc;
      }, {}),
    ),
  );

  if (companyId) {
    const now = new Date().toISOString();
    const rows = figures.map((f) => ({
      company_id: companyId,
      measure_code: f.measure_code,
      period: f.period,
      actual: f.actual,
      source: "system",
      detail: { ...f.detail, origin },
      updated_by: "sync:nam-supply",
      updated_at: now,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      await mf("kpi_actuals?on_conflict=company_id,measure_code,period", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows.slice(i, i + 500)),
      });
    }
    console.log(`Wrote ${rows.length} figures to Mainframe for NAM Supply.`);
  }

  if (flag("--snapshot")) {
    const seed = seedFromSetupSql();
    const supply = seed.companies.find((c) => c.slug === "nam-supply");
    const now = new Date().toISOString();
    const actuals = figures.map((f) => ({
      company_id: supply.id,
      measure_code: f.measure_code,
      period: f.period,
      actual: f.actual,
      target: null,
      note: null,
      source: "system",
      detail: f.detail,
      updated_by: "sync:nam-supply",
      updated_at: now,
    }));
    const out = path.join(root, "public", "dev-snapshot.json");
    fs.writeFileSync(out, JSON.stringify({ ...seed, actuals }, null, 2));
    console.log(`Wrote ${path.relative(root, out)} (local preview only, gitignored).`);
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
