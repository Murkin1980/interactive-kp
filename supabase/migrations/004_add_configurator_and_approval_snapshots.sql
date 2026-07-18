-- Configurable option groups, protected media metadata and immutable approvals.

alter table kp_items
  add column if not exists item_type text not null default 'wardrobe',
  add column if not exists original_image_url text,
  add column if not exists sketch_image_url text;

create table if not exists kp_option_groups (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references kp_items(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9_-]{0,49}$'),
  description text,
  is_required boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (item_id, slug),
  unique (item_id, sort_order)
);

create table if not exists kp_option_values (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references kp_option_groups(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  brand text check (brand is null or char_length(brand) <= 100),
  description text check (description is null or char_length(description) <= 1000),
  image_url text,
  price_delta numeric(14,2) not null default 0 check (price_delta >= 0),
  production_days_delta integer not null default 0 check (production_days_delta >= 0),
  is_default boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (group_id, sort_order)
);

create unique index if not exists kp_option_values_one_default_per_group
  on kp_option_values(group_id) where is_default;
create index if not exists kp_option_groups_item_id_idx on kp_option_groups(item_id);
create index if not exists kp_option_values_group_id_idx on kp_option_values(group_id);

create table if not exists kp_approval_snapshots (
  id uuid primary key default gen_random_uuid(),
  kp_id uuid not null references kps(id) on delete restrict,
  version integer not null check (version > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  total numeric(14,2) not null check (total >= 0),
  advance numeric(14,2) not null check (advance >= 0),
  balance numeric(14,2) not null check (balance >= 0),
  consent_text text not null check (char_length(trim(consent_text)) between 10 and 1000),
  client_name text check (client_name is null or char_length(client_name) <= 100),
  client_phone text check (client_phone is null or char_length(client_phone) <= 30),
  confirmed_at timestamptz not null default now(),
  pdf_storage_path text,
  pdf_generated_at timestamptz,
  snapshot_hash text not null,
  unique (kp_id, version),
  unique (snapshot_hash)
);

create index if not exists kp_approval_snapshots_kp_id_idx on kp_approval_snapshots(kp_id);

alter table kp_option_groups enable row level security;
alter table kp_option_values enable row level security;
alter table kp_approval_snapshots enable row level security;

create policy "Owners manage option groups"
on kp_option_groups for all to authenticated
using (
  exists (
    select 1 from kp_items i join kps k on k.id = i.kp_id
    where i.id = kp_option_groups.item_id and k.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from kp_items i join kps k on k.id = i.kp_id
    where i.id = kp_option_groups.item_id
      and k.owner_id = (select auth.uid())
      and k.status not in ('confirmed', 'expired')
  )
);

create policy "Owners manage option values"
on kp_option_values for all to authenticated
using (
  exists (
    select 1
    from kp_option_groups g
    join kp_items i on i.id = g.item_id
    join kps k on k.id = i.kp_id
    where g.id = kp_option_values.group_id and k.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from kp_option_groups g
    join kp_items i on i.id = g.item_id
    join kps k on k.id = i.kp_id
    where g.id = kp_option_values.group_id
      and k.owner_id = (select auth.uid())
      and k.status not in ('confirmed', 'expired')
  )
);

create policy "Owners read approval snapshots"
on kp_approval_snapshots for select to authenticated
using (
  exists (
    select 1 from kps
    where kps.id = kp_approval_snapshots.kp_id
      and kps.owner_id = (select auth.uid())
  )
);

-- Snapshots are inserted only by the confirmation RPC. No direct insert/update/delete
-- policy is intentionally provided to authenticated or anonymous clients.

create or replace function prevent_approval_snapshot_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Approval snapshots are immutable';
end;
$$;

drop trigger if exists approval_snapshots_immutable on kp_approval_snapshots;
create trigger approval_snapshots_immutable
before update or delete on kp_approval_snapshots
for each row execute function prevent_approval_snapshot_mutation();

revoke all on kp_option_groups, kp_option_values, kp_approval_snapshots from anon;
grant select, insert, update, delete on kp_option_groups, kp_option_values to authenticated;
grant select on kp_approval_snapshots to authenticated;

revoke execute on function prevent_approval_snapshot_mutation() from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kp-media',
  'kp-media',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Owners read their KP media"
on storage.objects for select to authenticated
using (
  bucket_id = 'kp-media'
  and exists (
    select 1 from kps
    where kps.id::text = (storage.foldername(name))[1]
      and kps.owner_id = (select auth.uid())
  )
);

create policy "Owners upload their KP media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'kp-media'
  and exists (
    select 1 from kps
    where kps.id::text = (storage.foldername(name))[1]
      and kps.owner_id = (select auth.uid())
      and kps.status not in ('confirmed', 'expired')
  )
);

create policy "Owners update their KP media"
on storage.objects for update to authenticated
using (
  bucket_id = 'kp-media'
  and exists (
    select 1 from kps
    where kps.id::text = (storage.foldername(name))[1]
      and kps.owner_id = (select auth.uid())
      and kps.status not in ('confirmed', 'expired')
  )
)
with check (
  bucket_id = 'kp-media'
  and exists (
    select 1 from kps
    where kps.id::text = (storage.foldername(name))[1]
      and kps.owner_id = (select auth.uid())
      and kps.status not in ('confirmed', 'expired')
  )
);

create policy "Owners delete their KP media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'kp-media'
  and exists (
    select 1 from kps
    where kps.id::text = (storage.foldername(name))[1]
      and kps.owner_id = (select auth.uid())
      and kps.status not in ('confirmed', 'expired')
  )
);
