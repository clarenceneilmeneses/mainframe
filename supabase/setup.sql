-- ============================================================================
-- Mainframe — KPI monitoring for the NAM businesses.
-- Run once, whole file, in the Supabase SQL editor (project wapnfwcivfnfwazdhaof).
-- Safe to re-run: every create is IF NOT EXISTS and every seed is an upsert
-- that leaves numbers someone has already edited alone.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Who can open the board. One row per person; the role decides what they can
-- change. Signing up on its own grants nothing: no row here, no data.
-- ---------------------------------------------------------------------------
create table if not exists public.members (
  email      text primary key,
  full_name  text,
  role       text not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now()
);

create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.members
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public
as $$ select public.my_role() is not null $$;

create or replace function public.can_edit()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() in ('owner', 'editor'), false) $$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() = 'owner', false) $$;

-- ---------------------------------------------------------------------------
-- The businesses on the board.
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  short_name  text,
  description text,
  -- Where its numbers come from. 'nam_supply' = synced from the NAM Supply
  -- sales system; null = entered by hand (or from the sheet) each month.
  data_source text,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- The scorecard: nine categories with their weight (they add to 100), and the
-- measures each one is judged on.
-- ---------------------------------------------------------------------------
create table if not exists public.kpi_categories (
  code        text primary key,
  name        text not null,
  weight      numeric(5, 2) not null check (weight >= 0),
  target_text text not null,
  sort        int not null default 0
);

create table if not exists public.kpi_measures (
  code           text primary key,
  category_code  text not null references public.kpi_categories (code) on update cascade on delete cascade,
  name           text not null,
  -- php = pesos, pct = percent (95 means 95%), ratio = times (3 means 3×), score5 = out of 5
  unit           text not null check (unit in ('php', 'pct', 'ratio', 'score5')),
  -- higher = more is better; lower = must stay at or under target; band = within ± band of zero
  direction      text not null check (direction in ('higher', 'lower', 'band')),
  default_target numeric,
  band           numeric,
  help           text,
  sort           int not null default 0
);

-- Per business: does the measure apply, and its own target if it differs.
create table if not exists public.company_measures (
  company_id   uuid not null references public.companies (id) on delete cascade,
  measure_code text not null references public.kpi_measures (code) on update cascade on delete cascade,
  applicable   boolean not null default true,
  target       numeric,
  source       text not null default 'manual' check (source in ('manual', 'system')),
  primary key (company_id, measure_code)
);

-- One result per business, measure and month (period = the 1st of the month).
create table if not exists public.kpi_actuals (
  company_id   uuid not null references public.companies (id) on delete cascade,
  measure_code text not null references public.kpi_measures (code) on update cascade on delete cascade,
  period       date not null check (extract(day from period) = 1),
  actual       numeric not null,
  target       numeric,              -- that month's target, when it differs from the standing one
  note         text,
  source       text not null default 'manual' check (source in ('manual', 'system', 'sheet')),
  detail       jsonb,                -- how a system figure was worked out (numerator, denominator, rows)
  updated_by   text default (auth.jwt() ->> 'email'),
  updated_at   timestamptz not null default now(),
  primary key (company_id, measure_code, period)
);

create index if not exists kpi_actuals_period_idx on public.kpi_actuals (period);

-- ---------------------------------------------------------------------------
-- Row-level security. Members read everything; owners and editors record
-- results; only owners change the scorecard itself and who has access.
-- ---------------------------------------------------------------------------
alter table public.members          enable row level security;
alter table public.companies        enable row level security;
alter table public.kpi_categories   enable row level security;
alter table public.kpi_measures     enable row level security;
alter table public.company_measures enable row level security;
alter table public.kpi_actuals      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['companies', 'kpi_categories', 'kpi_measures', 'company_measures', 'kpi_actuals'] loop
    execute format('drop policy if exists "members read" on public.%I', t);
    execute format('create policy "members read" on public.%I for select to authenticated using (public.is_member())', t);
  end loop;
  foreach t in array array['companies', 'kpi_categories', 'kpi_measures', 'company_measures'] loop
    execute format('drop policy if exists "owners write" on public.%I', t);
    execute format('create policy "owners write" on public.%I for all to authenticated using (public.is_owner()) with check (public.is_owner())', t);
  end loop;
end $$;

drop policy if exists "editors write" on public.kpi_actuals;
create policy "editors write" on public.kpi_actuals
  for all to authenticated using (public.can_edit()) with check (public.can_edit());

drop policy if exists "see own row" on public.members;
create policy "see own row" on public.members
  for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) or public.is_owner());

drop policy if exists "owners manage" on public.members;
create policy "owners manage" on public.members
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

grant execute on function public.my_role(), public.is_member(), public.can_edit(), public.is_owner() to authenticated;

-- ============================================================================
-- Seed: the 2027 KPI scorecard, as presented (weights add to 100).
-- ============================================================================
insert into public.kpi_categories (code, name, weight, target_text, sort) values
  ('sales',       'Sales & Business Development',      30, 'Achieve 100% of monthly sales target; maintain approved gross margin; qualified pipeline ≥3× sales target', 1),
  ('finance',     'Financial Performance & Cash Flow', 20, 'Achieve monthly break-even/profit target; collections ≥95% of amounts due', 2),
  ('projects',    'Project & Site Operations',         13, '≥95% on-time project milestones; cost variance within ±5%', 3),
  ('procurement', 'Procurement & Subcontractors',      10, '≥95% competitive benchmarking compliance; 100% authorized purchases', 4),
  ('supply',      'Supply & Delivery',                  8, '≥95% on-time, in-full delivery', 5),
  ('quality',     'Quality & Safety',                   6, '≥95% first-time acceptance; 100% required safety checks', 6),
  ('hr',          'HR & Workforce Productivity',        4, '≥95% manpower availability; overtime within budget', 7),
  ('governance',  'Governance & Internal Controls',     4, '100% required approvals and statutory compliance', 8),
  ('customer',    'Customer Satisfaction & Retention',  5, 'Customer satisfaction ≥4.5/5; ≥95% complaint resolution within Service Level Agreement', 9)
on conflict (code) do nothing;

insert into public.kpi_measures (code, category_code, name, unit, direction, default_target, band, help, sort) values
  ('sales_vs_target',      'sales',       'Sales vs monthly target',             'php',    'higher', null, null, 'Booked sales for the month, against that business''s monthly sales target.', 1),
  ('gross_margin',         'sales',       'Gross margin',                        'pct',    'higher', null, null, 'Gross profit ÷ sales for the month, against the approved margin.', 2),
  ('pipeline_cover',       'sales',       'Qualified pipeline cover',            'ratio',  'higher', 3,    null, 'Open, qualified quotations ÷ the monthly sales target. Target: 3×.', 3),
  ('profit_vs_target',     'finance',     'Profit vs break-even/profit target',  'php',    'higher', null, null, 'Net profit for the month, against the break-even or profit target.', 1),
  ('collections',          'finance',     'Collections of amounts due',          'pct',    'higher', 95,   null, 'Share of the receivables that fell due this month that has been collected.', 2),
  ('milestones_on_time',   'projects',    'Project milestones on time',          'pct',    'higher', 95,   null, 'Milestones completed by their planned date ÷ milestones due.', 1),
  ('cost_variance',        'projects',    'Cost variance',                       'pct',    'band',   0,    5,    '(Actual cost − budget) ÷ budget. Anything within ±5% is on target.', 2),
  ('benchmark_compliance', 'procurement', 'Competitive benchmarking compliance', 'pct',    'higher', 95,   null, 'Purchases backed by the required competing quotes ÷ all purchases.', 1),
  ('authorized_purchases', 'procurement', 'Authorized purchases',                'pct',    'higher', 100,  null, 'Purchases with the required approval ÷ all purchases.', 2),
  ('otif',                 'supply',      'On-time, in-full delivery',           'pct',    'higher', 95,   null, 'Deliveries made on the promised date with the full quantity ÷ all deliveries.', 1),
  ('first_time_acceptance','quality',     'First-time acceptance',               'pct',    'higher', 95,   null, 'Work or deliveries accepted without rework ÷ all handed over.', 1),
  ('safety_checks',        'quality',     'Required safety checks done',         'pct',    'higher', 100,  null, 'Safety checks completed ÷ safety checks required.', 2),
  ('manpower_availability','hr',          'Manpower availability',               'pct',    'higher', 95,   null, 'Man-days available ÷ man-days planned.', 1),
  ('overtime_vs_budget',   'hr',          'Overtime vs budget',                  'pct',    'lower',  100,  null, 'Overtime spent as a % of the overtime budget. At or under 100% is on target.', 2),
  ('approvals_compliance', 'governance',  'Approvals & statutory compliance',    'pct',    'higher', 100,  null, 'Required approvals and statutory filings completed on time ÷ required.', 1),
  ('csat',                 'customer',    'Customer satisfaction',               'score5', 'higher', 4.5,  null, 'Average customer rating out of 5.', 1),
  ('complaint_sla',        'customer',    'Complaints resolved within SLA',      'pct',    'higher', 95,   null, 'Complaints closed within the Service Level Agreement ÷ complaints received.', 2)
on conflict (code) do nothing;

-- The three businesses. Names are editable here or later in the app; slugs
-- are what the links use, so leave those.
insert into public.companies (slug, name, short_name, description, data_source, sort) values
  ('nam-supply',   'NAM Supply',   'Supply',   'Construction and industrial supply. Sales, margin, pipeline and collections sync from the NAM Supply system.', 'nam_supply', 1),
  ('nam-builders', 'NAM Builders', 'Builders', 'Construction and installation projects.', null, 2),
  ('nam-trading',  'NAM Trading',  'Trading',  'Name to confirm.', null, 3)
on conflict (slug) do nothing;

-- Every measure applies to every business until someone switches one off.
insert into public.company_measures (company_id, measure_code)
select c.id, m.code from public.companies c cross join public.kpi_measures m
on conflict do nothing;

-- NAM Supply: the four measures its sales system can answer come in by sync,
-- with its existing ₱2.5M monthly target (the one the NAM Supply dashboard
-- already uses). The 20% approved margin is a placeholder until confirmed.
update public.company_measures cm set source = 'system', target = v.target
from (values
  ('sales_vs_target', 2500000::numeric),
  ('gross_margin',    20::numeric),
  ('pipeline_cover',  3::numeric),
  ('collections',     95::numeric)
) as v(code, target), public.companies c
where c.slug = 'nam-supply' and cm.company_id = c.id and cm.measure_code = v.code
  and cm.source = 'manual' and cm.target is null;

-- The first owner. Add the CEO's own email here (or later from the app).
insert into public.members (email, full_name, role) values
  ('ceo@nam.test', 'Preview owner', 'owner')
on conflict (email) do nothing;
