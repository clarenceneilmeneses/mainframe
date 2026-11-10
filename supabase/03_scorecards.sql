-- ============================================================================
-- Mainframe 03 — each business gets its own scorecard (2026-11-10).
-- Run once in the Supabase SQL editor, after setup.sql and 02_view_links.sql.
-- Safe to re-run.
--
-- Until now the board judged every business on one scorecard, the NAM
-- Builders & Supply Corp. 2027 scorecard (nine categories). The secretary's
-- workbook ("Clarence for dashboard.xlsx", 2026-11-10) has one tab per
-- business, each with its own scorecard:
--
--   NAM BUILDERS     the 2027 scorecard already here (9 categories)
--   nam trading      Quarterly Sales KPI Scorecard (6 KPIs) — ₱3,000,000 a
--                    month in Q1–Q2, ₱4,200,000 a month in Q3–Q4, 33% mark-up
--   ALM MANAGEMENT   KPI Performance Scorecard (7 KPIs)
--
-- What this does:
--   1. A `scorecards` table. Each category belongs to one scorecard and each
--      business points at one. The existing nine become the 'builders' one,
--      so every number already recorded keeps its meaning.
--   2. The Trading and ALM scorecards, as the workbook gives them.
--   3. ALM Management joins the board; NAM Trading moves to its own scorecard.
--   4. A measure can have a different monthly target per quarter
--      (company_measures.quarter_targets), for Trading's ₱3M / ₱4.2M.
--   5. A 'count' unit (new clients, accidents).
--
-- OPEN: which business NAM Supply (the one whose figures sync) belongs to.
-- It stays on the Builders scorecard here, unchanged. The sheet titles the
-- nine-category scorecard "NAM Builders & Supply Corp.", but NAM Trading's
-- KPIs (sales, mark-up, collection) are what the NAM Supply system records.
-- The note at the bottom of this file says what each answer means.
--
-- Targets the workbook doesn't give are left blank and show as "no target
-- yet" until the owner sets them on Targets: Trading's new clients a month and
-- retention %, ALM's revenue and profit margin.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Scorecards
-- ---------------------------------------------------------------------------
create table if not exists public.scorecards (
  code        text primary key,
  name        text not null,
  description text,
  sort        int not null default 0
);

alter table public.scorecards enable row level security;
drop policy if exists "members read" on public.scorecards;
create policy "members read" on public.scorecards for select to authenticated using (public.is_member());
drop policy if exists "owners write" on public.scorecards;
create policy "owners write" on public.scorecards for all to authenticated using (public.is_owner()) with check (public.is_owner());

insert into public.scorecards (code, name, description, sort) values
  ('builders', '2027 KPI scorecard',            'NAM Builders & Supply Corp. — nine categories, weights total 100.', 1),
  ('trading',  'Quarterly sales KPI scorecard', 'NAM Trading — six KPIs, weights total 100.', 2),
  ('alm',      'KPI performance scorecard',     'ALM Management — seven KPIs, weights total 100.', 3)
on conflict (code) do nothing;

alter table public.kpi_categories add column if not exists scorecard_code text references public.scorecards (code) on update cascade;
alter table public.kpi_categories add column if not exists short_name text;
alter table public.companies      add column if not exists scorecard_code text references public.scorecards (code) on update cascade;

-- The nine that were here are the Builders scorecard.
update public.kpi_categories set scorecard_code = 'builders' where scorecard_code is null;
update public.kpi_categories k set short_name = v.short
from (values
  ('sales', 'Sales'), ('finance', 'Finance'), ('projects', 'Projects'), ('procurement', 'Procurement'),
  ('supply', 'Delivery'), ('quality', 'Quality'), ('hr', 'People'), ('governance', 'Governance'), ('customer', 'Customers')
) as v(code, short)
where k.code = v.code and k.short_name is null;
alter table public.kpi_categories alter column scorecard_code set not null;

-- A monthly target per quarter: {Q1, Q2, Q3, Q4}. Null = the one target all year.
alter table public.company_measures add column if not exists quarter_targets numeric[];
alter table public.company_measures drop constraint if exists company_measures_quarter_targets_check;
alter table public.company_measures add constraint company_measures_quarter_targets_check
  check (quarter_targets is null or cardinality(quarter_targets) = 4);

-- Counts (new clients, accidents) next to pesos, percents, times and ratings.
alter table public.kpi_measures drop constraint if exists kpi_measures_unit_check;
alter table public.kpi_measures add constraint kpi_measures_unit_check
  check (unit in ('php', 'pct', 'ratio', 'score5', 'count'));

-- ---------------------------------------------------------------------------
-- 2. NAM Trading — Quarterly Sales KPI Scorecard
-- ---------------------------------------------------------------------------
insert into public.kpi_categories (code, scorecard_code, name, short_name, weight, target_text, sort) values
  ('tr_sales',      'trading', 'Sales Target vs. Actual',      'Sales',       40, 'Meet the approved quarterly sales target (₱3,000,000 a month in Q1–Q2, ₱4,200,000 a month in Q3–Q4)', 1),
  ('tr_markup',     'trading', 'Mark-up Percentage',           'Mark-up',     25, 'At least 33% mark-up on total sales', 2),
  ('tr_collection', 'trading', 'Collection',                   'Collection',  15, 'Collect clients'' dues on time', 3),
  ('tr_new',        'trading', 'New Client Acquisition',       'New clients', 10, 'Expand the customer base: find prospects and turn them into active, transacting clients', 4),
  ('tr_retention',  'trading', 'Existing Client Retention',    'Retention',    5, 'Keep existing customers transacting through regular follow-ups', 5),
  ('tr_reporting',  'trading', 'Sales Reporting & Compliance', 'Reporting',    5, 'Timely, accurate and complete sales reports; follow company policies and documentation', 6)
on conflict (code) do nothing;

insert into public.kpi_measures (code, category_code, name, unit, direction, default_target, band, help, sort) values
  ('tr_sales_vs_target', 'tr_sales',      'Sales vs monthly target',           'php',   'higher', null, null, 'Booked sales for the month, against the monthly target for that quarter.', 1),
  ('tr_markup',          'tr_markup',     'Mark-up',                           'pct',   'higher', 33,   null, '(Sales − cost of goods) ÷ cost of goods. At least 33%.', 1),
  ('tr_collections',     'tr_collection', 'Dues collected on time',            'pct',   'higher', 100,  null, 'Amounts that fell due this month and were collected by their due date ÷ amounts that fell due.', 1),
  ('tr_new_clients',     'tr_new',        'New transacting clients',           'count', 'higher', null, null, 'Clients who bought for the first time this month.', 1),
  ('tr_retention',       'tr_retention',  'Existing clients who bought again', 'pct',   'higher', null, null, 'Existing clients who bought this month ÷ existing clients being followed up.', 1),
  ('tr_reports_on_time', 'tr_reporting',  'Sales reports on time and complete', 'pct',  'higher', 100,  null, 'Sales reports handed in on time, accurate and complete ÷ reports due.', 1)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 3. ALM Management — KPI Performance Scorecard
-- ---------------------------------------------------------------------------
insert into public.kpi_categories (code, scorecard_code, name, short_name, weight, target_text, sort) values
  ('alm_headcount',  'alm', 'Headcount Achievement',                  'Headcount',   20, 'Meet the approved quarterly manpower target', 1),
  ('alm_attendance', 'alm', 'Attendance and Working Days',            'Attendance',  15, 'At least 95% attendance and meet quarterly working-day targets', 2),
  ('alm_cost',       'alm', 'Cost Control and Budget Management',     'Cost',        20, 'Control expenses within the approved budget', 3),
  ('alm_revenue',    'alm', 'Revenue and Profitability',              'Revenue',     20, 'Meet approved revenue and profit margin targets', 4),
  ('alm_reporting',  'alm', 'Operational Efficiency and Reporting',   'Reporting',   10, 'Submit accurate and timely reports', 5),
  ('alm_clients',    'alm', 'Client Satisfaction and Business Growth', 'Clients',    10, 'Maintain existing accounts and support client expansion', 6),
  ('alm_compliance', 'alm', 'Compliance, Safety, and Documentation',  'Compliance',   5, 'Maintain compliance and complete required records. Zero accidents, zero NLTI.', 7)
on conflict (code) do nothing;

insert into public.kpi_measures (code, category_code, name, unit, direction, default_target, band, help, sort) values
  ('alm_headcount',        'alm_headcount',  'People on board vs approved manpower', 'pct',   'higher', 100,  null, 'People deployed at month end ÷ the approved manpower.', 1),
  ('alm_attendance',       'alm_attendance', 'Attendance',                           'pct',   'higher', 95,   null, 'Man-days worked ÷ man-days scheduled. At least 95%.', 1),
  ('alm_working_days',     'alm_attendance', 'Working days vs target',               'pct',   'higher', 100,  null, 'Working days delivered ÷ the working-day target.', 2),
  ('alm_spend_vs_budget',  'alm_cost',       'Spending vs approved budget',          'pct',   'lower',  100,  null, 'Expenses as a % of the approved budget. At or under 100% is on target.', 1),
  ('alm_revenue_vs_target','alm_revenue',    'Revenue vs target',                    'php',   'higher', null, null, 'Revenue for the month, against the approved revenue target.', 1),
  ('alm_profit_margin',    'alm_revenue',    'Profit margin',                        'pct',   'higher', null, null, 'Net profit ÷ revenue, against the approved margin.', 2),
  ('alm_reports_on_time',  'alm_reporting',  'Reports on time and accurate',         'pct',   'higher', 100,  null, 'Reports handed in on time and accurate ÷ reports due.', 1),
  ('alm_accounts_kept',    'alm_clients',    'Client accounts kept',                 'pct',   'higher', 100,  null, 'Client accounts still active at month end ÷ accounts at the start of the month.', 1),
  ('alm_records_complete', 'alm_compliance', 'Required records complete',            'pct',   'higher', 100,  null, 'Compliance records and documents complete ÷ required.', 1),
  ('alm_safety_incidents', 'alm_compliance', 'Accidents and injuries',               'count', 'lower',  0,    null, 'Accidents and injuries at work this month, lost-time or not. The target is zero.', 2)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 4. The businesses
-- ---------------------------------------------------------------------------
insert into public.companies (slug, name, short_name, description, data_source, sort, scorecard_code) values
  ('alm-management', 'ALM Management', 'ALM', 'Judged on the ALM Management KPI performance scorecard.', null, 4, 'alm')
on conflict (slug) do nothing;

update public.companies set scorecard_code = 'trading'  where slug = 'nam-trading' and scorecard_code is null;
update public.companies set description = 'Judged on the NAM Trading quarterly sales scorecard.'
  where slug = 'nam-trading' and description = 'Name to confirm.';
-- Everyone else stays on the scorecard they were judged on until now.
update public.companies set scorecard_code = 'builders' where scorecard_code is null;
alter table public.companies alter column scorecard_code set not null;

-- Each business gets a row for every measure on its own scorecard...
insert into public.company_measures (company_id, measure_code)
select c.id, m.code
from public.companies c
join public.kpi_categories k on k.scorecard_code = c.scorecard_code
join public.kpi_measures m on m.category_code = k.code
on conflict do nothing;

-- ...and loses the ones from a scorecard it isn't on, unless it already has
-- results recorded against them (none do today; this never deletes figures).
delete from public.company_measures cm
using public.companies c, public.kpi_measures m, public.kpi_categories k
where cm.company_id = c.id and cm.measure_code = m.code and m.category_code = k.code
  and k.scorecard_code <> c.scorecard_code
  and not exists (
    select 1 from public.kpi_actuals a where a.company_id = cm.company_id and a.measure_code = cm.measure_code
  );

-- NAM Trading's sales target: ₱3M a month in Q1–Q2, ₱4.2M a month in Q3–Q4.
update public.company_measures cm set quarter_targets = array[3000000, 3000000, 4200000, 4200000]::numeric[]
from public.companies c
where cm.company_id = c.id and c.slug = 'nam-trading' and cm.measure_code = 'tr_sales_vs_target'
  and cm.quarter_targets is null and cm.target is null;

-- ---------------------------------------------------------------------------
-- 5. board_data() also returns the scorecards
-- ---------------------------------------------------------------------------
create or replace function public.board_data(p_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.is_member()
    or exists (select 1 from public.view_links v where v.token = p_token and not v.revoked)
  ) then
    raise exception 'This board is private.' using errcode = '42501';
  end if;

  if p_token is not null then
    update public.view_links set last_used_at = now() where token = p_token;
  end if;

  return jsonb_build_object(
    'scorecards',      coalesce((select jsonb_agg(to_jsonb(s) order by s.sort) from public.scorecards s), '[]'::jsonb),
    'companies',       coalesce((select jsonb_agg(to_jsonb(c) order by c.sort) from public.companies c), '[]'::jsonb),
    'categories',      coalesce((select jsonb_agg(to_jsonb(k) order by k.sort) from public.kpi_categories k), '[]'::jsonb),
    'measures',        coalesce((select jsonb_agg(to_jsonb(m) order by m.sort) from public.kpi_measures m), '[]'::jsonb),
    'companyMeasures', coalesce((select jsonb_agg(to_jsonb(cm)) from public.company_measures cm), '[]'::jsonb),
    'actuals',         coalesce((select jsonb_agg(to_jsonb(a) order by a.period) from public.kpi_actuals a), '[]'::jsonb)
  );
end
$$;

revoke all on function public.board_data(text) from public;
grant execute on function public.board_data(text) to anon, authenticated;

commit;

-- ---------------------------------------------------------------------------
-- LATER, once the secretary says where NAM Supply belongs:
--
-- (a) NAM Supply is part of NAM Builders & Supply Corp.: its figures already
--     sit on the Builders scorecard, so the two boxes become one. Ask Claude
--     to fold "NAM Supply" and the empty "NAM Builders" together.
-- (b) NAM Supply IS NAM Trading: its synced figures move to the Trading
--     measures (sales; mark-up worked out from cost; collection) and the sync
--     changes to match. Also a job for Claude, not a one-liner.
-- ---------------------------------------------------------------------------
