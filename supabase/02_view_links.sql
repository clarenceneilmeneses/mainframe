-- ============================================================================
-- Mainframe 02 — view the board without signing in, through a private link.
-- Run once in the Supabase SQL editor, after setup.sql. Safe to re-run.
--
-- The tables stay locked to members. Anyone holding a view link's token can
-- READ the board through board_data(); nobody can change anything without
-- signing in. Revoke a link by setting revoked = true.
-- ============================================================================

create table if not exists public.view_links (
  token        text primary key default encode(gen_random_bytes(16), 'hex'),
  label        text not null,
  revoked      boolean not null default false,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.view_links enable row level security;

drop policy if exists "owners manage" on public.view_links;
create policy "owners manage" on public.view_links
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- Everything the board shows, in one call. Members get it as themselves;
-- everyone else needs a live view-link token.
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

-- The first link, for the CEO.
insert into public.view_links (label)
select 'CEO — view only'
where not exists (select 1 from public.view_links);
