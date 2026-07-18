-- ============================================================
-- 002_security_hardening.sql
-- P0 + P1 security fixes for Interactive KP Light
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. Drop ALL existing public policies
-- ─────────────────────────────────────────────

-- kps
drop policy if exists "Public read access to confirmed/sent/viewed kps" on kps;
drop policy if exists "Public update status to viewed" on kps;

-- kp_items
drop policy if exists "Public read access to kp_items" on kp_items;

-- kp_item_variants
drop policy if exists "Public read access to kp_item_variants" on kp_item_variants;

-- kp_confirmations
drop policy if exists "Public insert on kp_confirmations" on kp_confirmations;

-- owner policies (will be recreated with owner_id)
drop policy if exists "Owner full access on clients" on clients;
drop policy if exists "Owner full access on kps" on kps;
drop policy if exists "Owner full access on kp_items" on kp_items;
drop policy if exists "Owner full access on kp_item_variants" on kp_item_variants;
drop policy if exists "Owner full access on kp_confirmations" on kp_confirmations;
drop policy if exists "Owner full access on kp_counters" on kp_counters;

-- ─────────────────────────────────────────────
-- 2. Add missing columns and owner_id
-- ─────────────────────────────────────────────

-- sort_order on variants (missing from original schema)
alter table kp_item_variants add column if not exists sort_order int default 0;

-- Owner columns
alter table clients add column if not exists owner_id uuid not null default auth.uid();
alter table kps add column if not exists owner_id uuid not null default auth.uid();

create index if not exists idx_clients_owner on clients(owner_id);
create index if not exists idx_kps_owner on kps(owner_id);

-- ─────────────────────────────────────────────
-- 3. Add data integrity constraints
-- ─────────────────────────────────────────────

-- kp_items: quantity must be positive
alter table kp_items add constraint kp_items_quantity_check
  check (quantity >= 1);

-- kp_item_variants: price must be non-negative
alter table kp_item_variants add constraint kp_item_variants_price_check
  check (price >= 0);

-- kps: discount_value must be non-negative
alter table kps add constraint kps_discount_value_check
  check (discount_value >= 0);

-- kps: percent discount cannot exceed 100
alter table kps add constraint kps_discount_percent_check
  check (discount_type != 'percent' or discount_value <= 100);

-- kp_confirmations: one confirmation per KP
alter table kp_confirmations add constraint kp_confirmations_unique_kp
  unique (kp_id);

-- kp_confirmations: selected_total must be non-negative
alter table kp_confirmations add constraint kp_confirmations_total_check
  check (selected_total >= 0);

-- ─────────────────────────────────────────────
-- 4. Partial unique index: one default variant per item
-- ─────────────────────────────────────────────

create unique index if not exists idx_kp_item_variants_one_default
  on kp_item_variants(item_id)
  where is_default = true;

-- ─────────────────────────────────────────────
-- 5. Owner RLS policies (authenticated + owner_id match)
-- ─────────────────────────────────────────────

create policy "Owner full access on clients"
  on clients for all
  using (auth.uid() is not null and owner_id = auth.uid());

create policy "Owner full access on kps"
  on kps for all
  using (auth.uid() is not null and owner_id = auth.uid());

create policy "Owner full access on kp_items"
  on kp_items for all
  using (
    auth.uid() is not null
    and exists (
      select 1 from kps
      where kps.id = kp_items.kp_id
        and kps.owner_id = auth.uid()
    )
  );

create policy "Owner full access on kp_item_variants"
  on kp_item_variants for all
  using (
    auth.uid() is not null
    and exists (
      select 1 from kp_items
      join kps on kps.id = kp_items.kp_id
      where kp_items.id = kp_item_variants.item_id
        and kps.owner_id = auth.uid()
    )
  );

create policy "Owner full access on kp_confirmations"
  on kp_confirmations for all
  using (
    auth.uid() is not null
    and exists (
      select 1 from kps
      where kps.id = kp_confirmations.kp_id
        and kps.owner_id = auth.uid()
    )
  );

create policy "Owner full access on kp_counters"
  on kp_counters for all
  using (auth.uid() is not null);

-- ─────────────────────────────────────────────
-- 6. RPC: get_public_kp(p_token uuid)
--    Returns one KP + items + variants by token.
--    Only for non-expired or expired (for display) statuses.
--    Uses SECURITY DEFINER to bypass RLS.
-- ─────────────────────────────────────────────

create or replace function get_public_kp(p_token uuid)
returns json as $$
declare
  result json;
  v_kp record;
begin
  select id, number, client_name, client_phone, project_name,
         created_at, valid_until, status, notes,
         advance_percent, balance_condition,
         discount_type, discount_value,
         confirmed_at, selected_total
  into v_kp
  from kps
  where public_token = p_token
    and status in ('sent', 'viewed', 'confirmed', 'expired');

  if not found then
    return null;
  end if;

  select json_build_object(
    'id', v_kp.id,
    'number', v_kp.number,
    'client_name', v_kp.client_name,
    'client_phone', v_kp.client_phone,
    'project_name', v_kp.project_name,
    'created_at', v_kp.created_at,
    'valid_until', v_kp.valid_until,
    'status', v_kp.status,
    'notes', v_kp.notes,
    'advance_percent', v_kp.advance_percent,
    'balance_condition', v_kp.balance_condition,
    'discount_type', v_kp.discount_type,
    'discount_value', v_kp.discount_value,
    'confirmed_at', v_kp.confirmed_at,
    'selected_total', v_kp.selected_total,
    'items', (
      select coalesce(json_agg(
        json_build_object(
          'id', i.id,
          'name', i.name,
          'description', i.description,
          'dimensions', i.dimensions,
          'quantity', i.quantity,
          'image_url', i.image_url,
          'sort_order', i.sort_order,
          'variants', (
            select coalesce(json_agg(
              json_build_object(
                'id', v.id,
                'name', v.name,
                'material', v.material,
                'hardware', v.hardware,
                'description', v.description,
                'price', v.price,
                'is_default', v.is_default,
                'sort_order', v.sort_order
              ) order by v.sort_order
            ), '[]'::json)
            from kp_item_variants v
            where v.item_id = i.id
          )
        ) order by i.sort_order
      ), '[]'::json)
      from kp_items i
      where i.kp_id = v_kp.id
    )
  ) into result;

  return result;
end;
$$ language plpgsql
security definer
set search_path = public;

-- Allow anonymous access to the RPC only
grant execute on function get_public_kp(uuid) to anon;
grant execute on function get_public_kp(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- 7. RPC: mark_kp_viewed(p_token uuid)
--    Sets status from 'sent' to 'viewed'. Idempotent.
-- ─────────────────────────────────────────────

create or replace function mark_kp_viewed(p_token uuid)
returns void as $$
begin
  update kps
  set status = 'viewed'
  where public_token = p_token
    and status = 'sent';
end;
$$ language plpgsql
security definer
set search_path = public;

grant execute on function mark_kp_viewed(uuid) to anon;
grant execute on function mark_kp_viewed(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- 8. RPC: confirm_public_kp(...)
--    Atomic confirmation: validate, calculate, insert, update.
--    Returns the confirmation result.
-- ─────────────────────────────────────────────

create or replace function confirm_public_kp(
  p_token uuid,
  p_client_name text default null,
  p_client_phone text default null,
  p_comment text default null,
  p_selected_variants jsonb default '{}'::jsonb
)
returns json as $$
declare
  v_kp record;
  v_item record;
  v_variant record;
  v_item_id uuid;
  v_variant_id uuid;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_total numeric;
  v_advance numeric;
  v_balance numeric;
  v_selected_total numeric;
  v_confirmed_at timestamptz := now();
  v_item_count int := 0;
  v_selected_count int := 0;
  v_result json;
begin
  -- 1. Find KP by token, lock for update
  select * into v_kp
  from kps
  where public_token = p_token
  for update;

  if not found then
    raise exception 'КП не найдено';
  end if;

  -- 2. Check status allows confirmation
  if v_kp.status not in ('sent', 'viewed') then
    if v_kp.status = 'confirmed' then
      -- Return existing confirmation
      select json_build_object(
        'success', true,
        'already_confirmed', true,
        'confirmed_at', v_kp.confirmed_at,
        'selected_total', v_kp.selected_total
      ) into v_result;
      return v_result;
    end if;
    raise exception 'КП не может быть подтверждено (статус: %)', v_kp.status;
  end if;

  -- 3. Check not expired
  if v_kp.valid_until is not null and v_kp.valid_until < current_date then
    raise exception 'Срок действия КП истёк';
  end if;

  -- 4. Validate selected_variants: must have exactly one variant per item
  select count(*) into v_item_count
  from kp_items
  where kp_id = v_kp.id;

  -- Check each item has a selection
  for v_item in
    select id from kp_items where kp_id = v_kp.id order by sort_order
  loop
    v_variant_id := null;

    -- Extract variant ID from JSON
    begin
      v_variant_id := (p_selected_variants ->> v_item.id::text)::uuid;
    exception when others then
      v_variant_id := null;
    end;

    if v_variant_id is null then
      raise exception 'Не выбран вариант для позиции';
    end if;

    -- Verify variant belongs to this item and KP
    select * into v_variant
    from kp_item_variants v
    join kp_items i on i.id = v.item_id
    where v.id = v_variant_id
      and i.kp_id = v_kp.id
      and i.id = v_item.id;

    if not found then
      raise exception 'Вариант не принадлежит данной позиции';
    end if;

    -- Accumulate subtotal
    v_subtotal := v_subtotal + v_variant.price * (
      select quantity from kp_items where id = v_item.id
    );
    v_selected_count := v_selected_count + 1;
  end loop;

  if v_selected_count != v_item_count then
    raise exception 'Не все позиции имеют выбранный вариант';
  end if;

  -- 5. Calculate totals (server-side, authoritative)
  if v_kp.discount_type = 'percent' then
    v_discount := round(v_subtotal * v_kp.discount_value / 100);
  elsif v_kp.discount_type = 'fixed' then
    v_discount := least(v_kp.discount_value, v_subtotal);
  else
    v_discount := 0;
  end if;

  v_total := v_subtotal - v_discount;
  v_advance := round(v_total * v_kp.advance_percent / 100);
  v_balance := v_total - v_advance;

  -- 6. Insert confirmation (unique constraint prevents duplicates)
  insert into kp_confirmations (
    kp_id, client_name, client_phone, comment,
    selected_variants, selected_total, confirmed_at
  ) values (
    v_kp.id, p_client_name, p_client_phone, p_comment,
    p_selected_variants, v_total, v_confirmed_at
  )
  on conflict (kp_id) do update set
    client_name = excluded.client_name,
    client_phone = excluded.client_phone,
    comment = excluded.comment,
    selected_variants = excluded.selected_variants,
    selected_total = excluded.selected_total,
    confirmed_at = excluded.confirmed_at
  returning id into v_variant_id;  -- reuse variable

  -- 7. Update KP status
  update kps
  set status = 'confirmed',
      confirmed_at = v_confirmed_at,
      selected_total = v_total
  where id = v_kp.id;

  -- 8. Return result
  select json_build_object(
    'success', true,
    'already_confirmed', false,
    'confirmed_at', v_confirmed_at,
    'selected_total', v_total,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'advance', v_advance,
    'balance', v_balance
  ) into v_result;

  return v_result;
end;
$$ language plpgsql
security definer
set search_path = public;

grant execute on function confirm_public_kp(uuid, text, text, text, jsonb) to anon;
grant execute on function confirm_public_kp(uuid, text, text, text, jsonb) to authenticated;

-- ─────────────────────────────────────────────
-- 9. RPC: duplicate_kp(p_kp_id uuid)
--    Creates a full copy with new number, token, draft status.
--    Uses atomic operations within a transaction.
-- ─────────────────────────────────────────────

create or replace function duplicate_kp(p_kp_id uuid)
returns uuid as $$
declare
  v_new_kp_id uuid;
  v_new_number text;
  v_new_token uuid;
  v_item record;
  v_variant record;
  v_new_item_id uuid;
begin
  -- Verify source KP exists and belongs to owner
  if not exists (
    select 1 from kps
    where id = p_kp_id and owner_id = auth.uid()
  ) then
    raise exception 'КП не найдено';
  end if;

  -- Generate new number
  v_new_number := get_next_kp_number();
  v_new_token := gen_random_uuid();

  -- Create new KP
  insert into kps (
    number, client_id, client_name, client_phone,
    project_name, valid_until, status, notes,
    advance_percent, balance_condition,
    discount_type, discount_value,
    public_token, owner_id
  )
  select
    v_new_number, client_id, client_name, client_phone,
    project_name, valid_until, 'draft', notes,
    advance_percent, balance_condition,
    discount_type, discount_value,
    v_new_token, auth.uid()
  from kps
  where id = p_kp_id
  returning id into v_new_kp_id;

  -- Copy items and variants
  for v_item in
    select * from kp_items where kp_id = p_kp_id order by sort_order
  loop
    insert into kp_items (
      kp_id, name, description, dimensions,
      quantity, image_url, sort_order
    ) values (
      v_new_kp_id, v_item.name, v_item.description, v_item.dimensions,
      v_item.quantity, v_item.image_url, v_item.sort_order
    )
    returning id into v_new_item_id;

    -- Copy variants
    for v_variant in
      select * from kp_item_variants where item_id = v_item.id order by sort_order
    loop
      insert into kp_item_variants (
        item_id, name, material, hardware,
        description, price, is_default, sort_order
      ) values (
        v_new_item_id, v_variant.name, v_variant.material, v_variant.hardware,
        v_variant.description, v_variant.price, v_variant.is_default, v_variant.sort_order
      );
    end loop;
  end loop;

  return v_new_kp_id;
end;
$$ language plpgsql
security definer
set search_path = public;

grant execute on function duplicate_kp(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- 10. RPC: reorder_kp_items(p_kp_id uuid, p_item_ids uuid[])
--     Atomically reorder items.
-- ─────────────────────────────────────────────

create or replace function reorder_kp_items(
  p_kp_id uuid,
  p_item_ids uuid[]
)
returns void as $$
declare
  i int;
  v_item_id uuid;
begin
  -- Verify ownership
  if not exists (
    select 1 from kps
    where id = p_kp_id and owner_id = auth.uid()
  ) then
    raise exception 'КП не найдено';
  end if;

  -- Update sort_order for each item
  for i in 1..array_length(p_item_ids, 1)
  loop
    v_item_id := p_item_ids[i];
    update kp_items
    set sort_order = i - 1
    where id = v_item_id and kp_id = p_kp_id;
  end loop;
end;
$$ language plpgsql
security definer
set search_path = public;

grant execute on function reorder_kp_items(uuid, uuid[]) to authenticated;

-- ─────────────────────────────────────────────
-- 11. RPC: add_kp_variant(p_item_id uuid, ...)
--     Server-side 3-variant limit enforcement.
-- ─────────────────────────────────────────────

create or replace function add_kp_variant(
  p_item_id uuid,
  p_name text,
  p_material text default null,
  p_hardware text default null,
  p_description text default null,
  p_price numeric default 0,
  p_is_default boolean default false
)
returns kp_item_variants as $$
declare
  v_count int;
  v_max_sort int;
  v_new_variant kp_item_variants%rowtype;
begin
  -- Check variant count limit
  select count(*) into v_count
  from kp_item_variants
  where item_id = p_item_id;

  if v_count >= 3 then
    raise exception 'Максимум 3 варианта на позицию';
  end if;

  -- Compute next sort_order
  select coalesce(max(sort_order), -1) + 1 into v_max_sort
  from kp_item_variants
  where item_id = p_item_id;

  -- If setting as default, unset other defaults
  if p_is_default then
    update kp_item_variants set is_default = false
    where item_id = p_item_id and is_default = true;
  end if;

  insert into kp_item_variants (
    item_id, name, material, hardware, description,
    price, is_default, sort_order
  ) values (
    p_item_id, p_name, p_material, p_hardware, p_description,
    p_price, p_is_default, v_max_sort
  )
  returning * into v_new_variant;

  return v_new_variant;
end;
$$ language plpgsql
security definer
set search_path = public;

grant execute on function add_kp_variant(uuid, text, text, text, text, numeric, boolean) to authenticated;
