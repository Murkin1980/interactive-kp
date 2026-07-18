create extension if not exists pgcrypto;
create schema if not exists private;
create schema if not exists analytics;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  analytics_opt_in boolean not null default true,
  crm_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','manager','viewer')),
  status text not null default 'active' check (status in ('invited','active','suspended')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_members_user_idx on public.organization_members(user_id, status);

create or replace function public.handle_new_platform_user()
returns trigger language plpgsql security definer set search_path=public,auth as $$
declare v_org_id uuid;
begin
  insert into public.organizations(name,slug,owner_user_id)
  values (coalesce(nullif(new.raw_user_meta_data->>'company_name',''),'Мебельная компания'),
          'company-' || left(replace(new.id::text,'-',''),12),new.id)
  returning id into v_org_id;
  insert into public.organization_members(organization_id,user_id,role,status) values(v_org_id,new.id,'owner','active');
  return new;
end; $$;
revoke all on function public.handle_new_platform_user() from public,anon,authenticated;
create trigger on_auth_user_create_workspace after insert on auth.users for each row execute function public.handle_new_platform_user();

create or replace function private.is_org_member(p_org_id uuid, p_roles text[] default null)
returns boolean language sql stable security definer set search_path = public, auth
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org_id and m.user_id = auth.uid() and m.status = 'active'
      and (p_roles is null or m.role = any(p_roles))
  );
$$;
revoke all on function private.is_org_member(uuid,text[]) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid,text[]) to authenticated;

-- Create one workspace for every existing owner and preserve all current data.
insert into public.organizations (name, slug, owner_user_id)
select 'Мебельная компания', 'company-' || left(replace(u.id::text,'-',''), 12), u.id
from (select distinct owner_id as id from public.kps where owner_id is not null
      union select distinct owner_id from public.clients where owner_id is not null) u
on conflict (slug) do nothing;

insert into public.organization_members (organization_id, user_id, role, status)
select o.id, o.owner_user_id, 'owner', 'active' from public.organizations o
on conflict (organization_id,user_id) do update set role='owner', status='active';

alter table public.clients add column organization_id uuid references public.organizations(id) on delete restrict;
alter table public.kps add column organization_id uuid references public.organizations(id) on delete restrict;
update public.clients c set organization_id=o.id from public.organizations o where o.owner_user_id=c.owner_id and c.organization_id is null;
alter table public.kps disable trigger kp_lock_trigger;
update public.kps k set organization_id=o.id from public.organizations o where o.owner_user_id=k.owner_id and k.organization_id is null;
alter table public.kps enable trigger kp_lock_trigger;
alter table public.clients alter column organization_id set not null;
alter table public.kps alter column organization_id set not null;
create index clients_organization_idx on public.clients(organization_id, created_at desc);
create index kps_organization_idx on public.kps(organization_id, created_at desc);

create or replace function private.assign_current_organization()
returns trigger language plpgsql security definer set search_path=public,auth as $$
begin
  if new.organization_id is null then
    select m.organization_id into new.organization_id from public.organization_members m
    where m.user_id=auth.uid() and m.status='active' order by (m.role='owner') desc,m.created_at limit 1;
  end if;
  if new.organization_id is null or not private.is_org_member(new.organization_id,array['owner','admin','manager']) then
    raise exception 'No writable organization membership';
  end if;
  return new;
end; $$;
revoke all on function private.assign_current_organization() from public;

create trigger clients_assign_organization before insert on public.clients for each row execute function private.assign_current_organization();
create trigger kps_assign_organization before insert on public.kps for each row execute function private.assign_current_organization();

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
create policy "Members read organization" on public.organizations for select to authenticated using (private.is_org_member(id));
create policy "Owners manage organization" on public.organizations for update to authenticated
  using (private.is_org_member(id,array['owner','admin'])) with check (private.is_org_member(id,array['owner','admin']));
create policy "Members read memberships" on public.organization_members for select to authenticated using (private.is_org_member(organization_id));
create policy "Owners manage memberships" on public.organization_members for all to authenticated
  using (private.is_org_member(organization_id,array['owner','admin'])) with check (private.is_org_member(organization_id,array['owner','admin']));

drop policy if exists "Owner full access on clients" on public.clients;
create policy "Organization access on clients" on public.clients for all to authenticated
  using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id,array['owner','admin','manager']));
drop policy if exists "Owner full access on kps" on public.kps;
create policy "Organization access on kps" on public.kps for all to authenticated
  using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id,array['owner','admin','manager']));

-- Full company-owned history: future CRM reads this, never the anonymized table.
create table public.crm_timeline_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  kp_id uuid references public.kps(id) on delete set null,
  event_type text not null check (event_type in ('client_created','proposal_created','proposal_viewed','proposal_confirmed','proposal_reopened','note','deadline')),
  title text not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index crm_timeline_org_time_idx on public.crm_timeline_events(organization_id,occurred_at desc);
create index crm_timeline_client_time_idx on public.crm_timeline_events(client_id,occurred_at desc);
alter table public.crm_timeline_events enable row level security;
create policy "Organization reads CRM history" on public.crm_timeline_events for select to authenticated using (private.is_org_member(organization_id));
create policy "Organization writes CRM history" on public.crm_timeline_events for insert to authenticated
  with check (private.is_org_member(organization_id,array['owner','admin','manager']));

-- Unexposed, PII-free product analytics. No client, user, KP, token, address,
-- image, comment or exact company identifier is stored here.
create table analytics.product_events (
  id bigint generated always as identity primary key,
  event_name text not null,
  event_month date not null,
  furniture_type text not null,
  material_category text,
  hardware_category text,
  countertop_category text,
  price_band text not null,
  revision_count_band text not null,
  country_code text,
  created_at timestamptz not null default now()
);
revoke all on schema analytics from public, anon, authenticated;
revoke all on all tables in schema analytics from public, anon, authenticated;

create or replace function private.capture_approved_proposal()
returns trigger language plpgsql security definer set search_path=public,analytics as $$
declare v_org public.organizations%rowtype; v_item jsonb; v_options jsonb; v_furniture text; v_material text; v_hardware text; v_countertop text;
begin
  select o.* into v_org from public.organizations o join public.kps k on k.organization_id=o.id where k.id=new.kp_id;
  insert into public.crm_timeline_events(organization_id,client_id,kp_id,event_type,title,details,occurred_at)
  select k.organization_id,k.client_id,k.id,'proposal_confirmed','КП согласовано',
    jsonb_build_object('revision',new.version,'total',new.total,'advance',new.advance,'balance',new.balance),new.confirmed_at
  from public.kps k where k.id=new.kp_id;
  if coalesce(v_org.analytics_opt_in,false) then
    v_item := coalesce(new.snapshot->'items'->0,'{}'::jsonb);
    v_options := coalesce(v_item->'options','[]'::jsonb);
    v_furniture := coalesce(nullif(v_item->>'item_type',''),nullif(v_item->>'name',''),'other');
    v_material := nullif(v_item->'variant'->>'material','');
    select nullif(x->>'brand','') into v_hardware from jsonb_array_elements(v_options) x where lower(x->>'group_name') like '%фурнит%' limit 1;
    select coalesce(nullif(x->>'name',''),nullif(x->>'brand','')) into v_countertop from jsonb_array_elements(v_options) x where lower(x->>'group_name') like '%столеш%' limit 1;
    insert into analytics.product_events(event_name,event_month,furniture_type,material_category,hardware_category,countertop_category,price_band,revision_count_band)
    values ('proposal_confirmed',date_trunc('month',new.confirmed_at)::date,left(v_furniture,80),left(v_material,80),left(v_hardware,80),left(v_countertop,80),
      case when new.total<500000 then 'under_500k' when new.total<1000000 then '500k_1m' when new.total<2000000 then '1m_2m' when new.total<5000000 then '2m_5m' else '5m_plus' end,
      case when new.version=1 then 'first' when new.version<=3 then '2_3' else '4_plus' end);
  end if;
  return new;
end; $$;
revoke all on function private.capture_approved_proposal() from public;
create trigger approval_snapshot_capture after insert on public.kp_approval_snapshots for each row execute function private.capture_approved_proposal();

grant select,insert,update,delete on public.organizations,public.organization_members,public.crm_timeline_events to authenticated;

create policy "Public proposal reads token scoped item media"
on storage.objects for select to anon
using (
  bucket_id='kp-media'
  and exists (
    select 1 from public.kps
    where kps.id::text=(storage.foldername(name))[1]
      and kps.public_token::text=(storage.foldername(name))[2]
      and kps.status in ('sent','viewed','confirmed')
      and (storage.foldername(name))[3]='items'
  )
);
