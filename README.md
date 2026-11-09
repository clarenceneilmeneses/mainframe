# NAM Mainframe

KPI monitoring board for the NAM businesses — every business scored on the same 2027 KPI scorecard
(nine categories, weights totalling 100), month by month.

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

## NAM Supply sync

`npm run sync:nam -- --dump "<phpMyAdmin dump>.sql"` or `-- --live` works out NAM Supply's
sales vs target, gross margin, pipeline cover and collections per month and writes them as
`source = 'system'`. Definitions are at the top of `scripts/sync-nam-supply.mjs`.

Local preview without a login: `npm run sync:nam -- --dump <file> --snapshot`, then
`VITE_DEV_SNAPSHOT=1 npm run dev`. The snapshot file is gitignored; never commit real figures.

## Scoring

`src/lib/scoring.ts` — measure attainment capped at 100%, category = average of its measures × weight,
business score = points over the weight that reported. Missing results are gaps, not zeros; the
board shows coverage next to every score.
