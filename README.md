# NAM Mainframe

KPI monitoring board for the NAM businesses — each business scored month by month on its own
scorecard (weights totalling 100 on each): NAM Builders on the nine-category 2027 scorecard,
NAM Trading on its quarterly sales scorecard, ALM Management on its KPI performance scorecard.

Built on the Malaya OBS design layer (via the Vivienda port), recoloured to the NAM blue.

## Run

```
npm install
npm run dev                 # needs .env.local (see below)
npm test                    # scoring rules
npm run build
```

`.env.local` (never committed):

```
VITE_SUPABASE_URL=https://wapnfwcivfnfwazdhaof.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
SUPABASE_SECRET_KEY=sb_secret_…        # sync script only
NAM_SUPABASE_URL=…                     # NAM Supply's project, for --live
NAM_SECRET_KEY=…
```

## Database

Run `supabase/setup.sql` once in the Supabase SQL editor. It creates the tables, row-level security,
the 2027 scorecard, the three businesses and the first owner. Access is by the `members` table:
owner (everything), editor (enter results), viewer (read only).

Then, in order, once each (both safe to re-run):

- `supabase/02_view_links.sql`: the private view-only link (`?k=<token>`).
- `supabase/03_scorecards.sql`: one scorecard per business (the Trading and ALM scorecards,
  ALM Management, targets by quarter, the `count` unit). Its header says what is still open.

## NAM Supply sync

`npm run sync:nam -- --dump "<phpMyAdmin dump>.sql"` or `-- --live` works out NAM Supply's
sales vs target, gross margin, pipeline cover and collections per month and writes them as
`source = 'system'`. Definitions are at the top of `scripts/sync-nam-supply.mjs`.

Local preview without a login: `npm run sync:nam -- --dump <file> --snapshot`, then
`VITE_DEV_SNAPSHOT=1 npm run dev`. The snapshot file is gitignored; never commit real figures.

## Recording results

Most measures are one count out of another (19 milestones on time out of 20 due). Record results takes
the two counts and works the figure out (`src/lib/formulas.ts`); the counts are saved with the result in
`kpi_actuals.detail` as `num` / `den`, so a span of months is worked out from the counts added up. The
page shows the score the typed figures would give before anything is saved.

## At a glance and the sample board

The board opens with each business's top four numbers (`src/lib/sample.ts`, `HEADLINES`). Tap one
for its own page (`/c/<business>/top/<figure>`): a year against the year before, the year so far,
best and slowest months, its breakdowns and the last six months. Each business's page leads with the
same four and a month-by-month chart. They are **sample figures** until each business sends its own
four; the badge says so. Swap the entries in `HEADLINES` for the real figures once they are agreed.

Scorecard drill-downs are full pages too (`/c/<business>/kpi/<category>`, or `/kpi/score`), with tabs
to step between categories. Old `?d=` / `?f=` links redirect to them.

**The sample board** fills every scorecard with made-up results, breakdowns and counts, so every page
and drill-down has something in it. It is **on by default** for now (`SAMPLE_DEFAULT` in
`src/lib/sample.ts`; set it to `false` once the businesses report). It is flagged in the top bar and
recording results is off while it is on. The pill's ×, **Show real results** or `?sample=0` turns it
off on that device; `?sample=1` turns it back on.

## Scoring

`src/lib/scoring.ts` — measure attainment capped at 100%, category = average of its measures × weight,
business score = points over the weight that reported. Missing results are gaps, not zeros; the
board shows coverage next to every score.
