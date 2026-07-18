-- ============================================================
-- 003_fix_security_and_integrity.sql
-- Hardening RLS, secure RPC overrides, triggers, and permissions.
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. Helper function to check if KP is locked
-- ─────────────────────────────────────────────
create or replace function is_kp_locked(p_kp_id uuid)
returns boolean as $$
declare
  v_status text;
begin
  select status into v_status from kps where id = p_kp_id;
  return coalesce(v_status in ('confirmed', 'expired'), false);
end;
$$ language plpgsql security definer;

-- ─────────────────────────────────────────────
-- 2. Lock triggers for kps, kp_items, kp_item_variants
-- ─────────────────────────────────────────────

-- Trigger on kps
create or replace function check_kp_not_locked()
returns trigger as $$
begin
  -- Prevent modifications if already locked
  if (TG_OP = 'UPDATE' and (old.status = 'confirmed' or old.status = 'expired')) then
    -- Allow updates only if we are doing a duplicate/system action that doesn't modify locked status fields
    -- But since owners must not modify a confirmed/expired KP, we raise exception.
    raise exception 'КП подтверждено или просрочено и не может быть изменено';
  end if;
  if (TG_OP = 'DELETE' and (old.status = 'confirmed' or old.status = 'expired')) then
    raise exception 'КП подтверждено или просрочено и не может быть удалено';
  end if;
  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists kp_lock_trigger on kps;
create trigger kp_lock_trigger
  before update or delete on kps
  for each row
  execute function check_kp_not_locked();


-- Trigger on kp_items
create or replace function check_kp_item_not_locked()
returns trigger as $$
declare
  v_kp_id uuid;
begin
  if TG_OP = 'INSERT' then
    v_kp_id := new.kp_id;
  else
    v_kp_id := old.kp_id;
  end if;

  if is_kp_locked(v_kp_id) then
    raise exception 'КП подтверждено или просрочено и его позиции не могут быть изменены';
  end if;
  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists kp_item_lock_trigger on kp_items;
create trigger kp_item_lock_trigger
  before insert or update or delete on kp_items
  for each row
  execute function check_kp_item_not_locked();


-- Trigger on kp_item_variants
create or replace function check_kp_variant_not_locked()
returns trigger as $$
declare
  v_item_id uuid;
  v_kp_id uuid;
begin
  if TG_OP = 'INSERT' then
    v_item_id := new.item_id;
  else
    v_item_id := old.item_id;
  end if;

  select kp_id into v_kp_id from kp_items where id = v_item_id;

  if v_kp_id is not null and is_kp_locked(v_kp_id) then
    raise exception 'КП подтверждено или просрочено и его варианты не могут быть изменены';
  end if;
  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists kp_variant_lock_trigger on kp_item_variants;
create trigger kp_variant_lock_trigger
  before insert or update or delete on kp_item_variants
  for each row
  execute function check_kp_variant_not_locked();

-- ─────────────────────────────────────────────
-- 3. Publish requirements check trigger on kps
-- ─────────────────────────────────────────────
create or replace function check_kp_publish_requirements()
returns trigger as $$
declare
  v_item_count int;
  v_empty_item_count int;
begin
  -- Check requirements when transitioning to active states (sent, viewed) from draft/null
  if new.status != 'draft' and (old.status = 'draft' or old.status is null) then
    -- Check at least one item
    select count(*) into v_item_count from kp_items where kp_id = new.id;
    if v_item_count = 0 then
      raise exception 'Нельзя опубликовать КП без позиций';
    end if;

    -- Check all items have at least one variant
    select count(*) into v_empty_item_count
    from kp_items i
    where i.kp_id = new.id
      and not exists (
        select 1 from kp_item_variants v where v.item_id = i.id
      );

    if v_empty_item_count > 0 then
      raise exception 'Каждая позиция в КП должна содержать хотя бы один вариант';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists kp_publish_requirements_trigger on kps;
create trigger kp_publish_requirements_trigger
  before update on kps
  for each row
  execute function check_kp_publish_requirements();

-- ─────────────────────────────────────────────
-- 4. Unique constraint on items sort_order
-- ─────────────────────────────────────────────
alter table kp_items drop constraint if exists kp_items_kp_id_sort_order_key;
with normalized_items as (
  select id, row_number() over (
    partition by kp_id
    order by sort_order, id
  ) - 1 as normalized_sort_order
  from kp_items
)
update kp_items i
set sort_order = n.normalized_sort_order
from normalized_items n
where n.id = i.id
  and i.sort_order is distinct from n.normalized_sort_order;
alter table kp_items add constraint kp_items_kp_id_sort_order_key unique (kp_id, sort_order);

-- ─────────────────────────────────────────────
-- 5. RPC Overrides and New Functions
-- ─────────────────────────────────────────────

-- Add variant RPC with ownership and locked state check
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
  -- 1. Check ownership and status of parent KP
  if not exists (
    select 1
    from kp_items i
    join kps k on k.id = i.kp_id
    where i.id = p_item_id
      and k.owner_id = auth.uid()
      and k.status not in ('confirmed', 'expired')
  ) then
    raise exception 'Позиция не найдена или недоступна';
  end if;

  -- Serialize variant mutations for this item so concurrent requests cannot
  -- exceed the limit or create an inconsistent default selection.
  perform 1 from kp_items where id = p_item_id for update;

  -- 2. Check variant count limit
  select count(*) into v_count
  from kp_item_variants
  where item_id = p_item_id;

  if v_count >= 3 then
    raise exception 'Максимум 3 варианта на позицию';
  end if;

  -- 3. If first variant, force is_default = true
  if v_count = 0 then
    p_is_default := true;
  end if;

  -- 4. Compute next sort_order
  select coalesce(max(sort_order), -1) + 1 into v_max_sort
  from kp_item_variants
  where item_id = p_item_id;

  -- 5. If setting as default, unset other defaults
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


-- Delete variant RPC
create or replace function delete_kp_variant(
  p_item_id uuid,
  p_variant_id uuid
)
returns void as $$
declare
  v_was_default boolean;
  v_next_variant_id uuid;
begin
  -- 1. Check ownership and status of parent KP
  if not exists (
    select 1
    from kp_items i
    join kps k on k.id = i.kp_id
    where i.id = p_item_id
      and k.owner_id = auth.uid()
      and k.status not in ('confirmed', 'expired')
  ) then
    raise exception 'Позиция не найдена или недоступна';
  end if;

  perform 1 from kp_items where id = p_item_id for update;

  -- 2. Check if variant belongs to item and get its default status
  select is_default into v_was_default
  from kp_item_variants
  where id = p_variant_id and item_id = p_item_id;

  if not found then
    raise exception 'Вариант не найден';
  end if;

  -- 3. Delete the variant
  delete from kp_item_variants where id = p_variant_id;

  -- 4. If it was default, find another variant to make default
  if v_was_default then
    select id into v_next_variant_id
    from kp_item_variants
    where item_id = p_item_id
    order by sort_order, id
    limit 1;

    if v_next_variant_id is not null then
      update kp_item_variants
      set is_default = true
      where id = v_next_variant_id;
    end if;
  end if;
end;
$$ language plpgsql
security definer
set search_path = public;


-- Set default variant RPC
create or replace function set_default_kp_variant(
  p_item_id uuid,
  p_variant_id uuid
)
returns void as $$
begin
  -- Check owner and status of parent KP
  if not exists (
    select 1
    from kp_items i
    join kps k on k.id = i.kp_id
    where i.id = p_item_id
      and k.owner_id = auth.uid()
      and k.status not in ('confirmed', 'expired')
  ) then
    raise exception 'Позиция не найдена или недоступна';
  end if;

  perform 1 from kp_items where id = p_item_id for update;

  -- Check if variant belongs to this item
  if not exists (
    select 1
    from kp_item_variants
    where id = p_variant_id and item_id = p_item_id
  ) then
    raise exception 'Вариант не принадлежит данной позиции';
  end if;

  -- Update in correct order to avoid unique index conflict
  update kp_item_variants
  set is_default = false
  where item_id = p_item_id and is_default = true;

  update kp_item_variants
  set is_default = true
  where id = p_variant_id;
end;
$$ language plpgsql
security definer
set search_path = public;


-- Reorder items RPC with strict checks and safe update sequence
create or replace function reorder_kp_items(
  p_kp_id uuid,
  p_item_ids uuid[]
)
returns void as $$
declare
  v_expected_count int;
  v_array_length int;
  v_unique_passed_count int;
  v_matched_count int;
  i int;
  v_item_id uuid;
begin
  -- 1. Verify ownership and status
  if not exists (
    select 1 from kps
    where id = p_kp_id
      and owner_id = auth.uid()
      and status not in ('confirmed', 'expired')
  ) then
    raise exception 'КП не найдено или недоступно для редактирования';
  end if;

  -- 2. Check counts
  select count(*) into v_expected_count
  from kp_items
  where kp_id = p_kp_id;

  v_array_length := coalesce(cardinality(p_item_ids), 0);

  -- 3. Validate uniqueness of passed IDs
  select count(distinct val) into v_unique_passed_count
  from unnest(p_item_ids) as val;

  if v_unique_passed_count != v_array_length then
    raise exception 'Список содержит дубликаты позиций';
  end if;

  -- 4. Validate array length
  if v_array_length != v_expected_count then
    raise exception 'Неверное количество позиций для перестановки (ожидалось %, получено %)', v_expected_count, v_array_length;
  end if;

  -- 5. Validate that all passed IDs belong to this KP
  select count(*) into v_matched_count
  from kp_items
  where kp_id = p_kp_id
    and id = any(p_item_ids);

  if v_matched_count != v_expected_count then
    raise exception 'Некоторые позиции не принадлежат данному КП';
  end if;

  -- 6. Two-phase index update to prevent temporary unique index violation
  -- Phase 1: Set temporary negative indices
  for i in 1..v_array_length loop
    update kp_items
    set sort_order = -i
    where id = p_item_ids[i] and kp_id = p_kp_id;
  end loop;

  -- Phase 2: Set final positive indices (0-indexed)
  for i in 1..v_array_length loop
    update kp_items
    set sort_order = i - 1
    where id = p_item_ids[i] and kp_id = p_kp_id;
  end loop;
end;
$$ language plpgsql
security definer
set search_path = public;


-- Public view KP retriever with selected variants and expiry calculation
create or replace function get_public_kp(p_token uuid)
returns json as $$
declare
  result json;
  v_kp record;
  v_is_expired boolean;
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

  -- Calculate server-side expiry
  v_is_expired := false;
  if v_kp.status != 'confirmed' and v_kp.valid_until is not null and v_kp.valid_until < current_date then
    v_is_expired := true;
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
    'is_expired', v_is_expired,
    'selected_variants', (
      select selected_variants
      from kp_confirmations
      where kp_id = v_kp.id
      limit 1
    ),
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


-- Confirm public KP with strict validation, JSON check, and text limit limits
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
  v_variant_id uuid;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_total numeric;
  v_advance numeric;
  v_balance numeric;
  v_confirmed_at timestamptz := now();
  v_item_count int := 0;
  v_selected_count int := 0;
  v_passed_keys_count int := 0;
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
        'selected_total', v_kp.selected_total,
        'selected_variants', (select selected_variants from kp_confirmations where kp_id = v_kp.id limit 1)
      ) into v_result;
      return v_result;
    end if;
    raise exception 'КП не может быть подтверждено (статус: %)', v_kp.status;
  end if;

  -- 3. Check not expired
  if v_kp.valid_until is not null and v_kp.valid_until < current_date then
    raise exception 'Срок действия КП истёк';
  end if;

  -- 4. Validate selected_variants keys
  select count(*) into v_item_count
  from kp_items
  where kp_id = v_kp.id;

  if v_item_count = 0 then
    raise exception 'В КП нет позиций';
  end if;

  if jsonb_typeof(p_selected_variants) != 'object' then
    raise exception 'Неверный формат выбранных вариантов';
  end if;

  select count(*) into v_passed_keys_count
  from jsonb_object_keys(p_selected_variants);

  if v_passed_keys_count != v_item_count then
    raise exception 'Несоответствие количества позиций и вариантов выбора';
  end if;

  -- Check each item has a selection in JSON and validates variant ownership
  for v_item in
    select id, quantity from kp_items where kp_id = v_kp.id order by sort_order
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
      raise exception 'Выбранный вариант не принадлежит позиции КП';
    end if;

    -- Accumulate subtotal
    v_subtotal := v_subtotal + v_variant.price * v_item.quantity;
    v_selected_count := v_selected_count + 1;
  end loop;

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

  -- Truncate inputs safely to limit storage bloat
  p_client_name := left(trim(p_client_name), 100);
  p_client_phone := left(trim(p_client_phone), 30);
  p_comment := left(trim(p_comment), 1000);

  -- 6. Insert confirmation
  insert into kp_confirmations (
    kp_id, client_name, client_phone, comment,
    selected_variants, selected_total, confirmed_at
  ) values (
    v_kp.id, p_client_name, p_client_phone, p_comment,
    p_selected_variants, v_total, v_confirmed_at
  )
  -- The row lock above serializes confirmations. Never replace a previously
  -- recorded customer decision if legacy data already contains one.
  on conflict (kp_id) do nothing
  returning id into v_variant_id;  -- reuse variable

  if v_variant_id is null then
    select json_build_object(
      'success', true,
      'already_confirmed', true,
      'confirmed_at', c.confirmed_at,
      'selected_total', c.selected_total,
      'selected_variants', c.selected_variants
    ) into v_result
    from kp_confirmations c
    where c.kp_id = v_kp.id;
    return v_result;
  end if;

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
    'balance', v_balance,
    'selected_variants', p_selected_variants
  ) into v_result;

  return v_result;
end;
$$ language plpgsql
security definer
set search_path = public;


-- ─────────────────────────────────────────────
-- 6. Revoke PUBLIC EXECUTE permissions explicitly
-- ─────────────────────────────────────────────
revoke execute on function get_public_kp(uuid) from public;
revoke execute on function mark_kp_viewed(uuid) from public;
revoke execute on function confirm_public_kp(uuid, text, text, text, jsonb) from public;
revoke execute on function duplicate_kp(uuid) from public;
revoke execute on function reorder_kp_items(uuid, uuid[]) from public;
revoke execute on function add_kp_variant(uuid, text, text, text, text, numeric, boolean) from public;
revoke execute on function set_default_kp_variant(uuid, uuid) from public;
revoke execute on function delete_kp_variant(uuid, uuid) from public;
revoke execute on function is_kp_locked(uuid) from public;
revoke execute on function check_kp_not_locked() from public;
revoke execute on function check_kp_item_not_locked() from public;
revoke execute on function check_kp_variant_not_locked() from public;
revoke execute on function check_kp_publish_requirements() from public;

-- Grant EXECUTE to specific roles
grant execute on function get_public_kp(uuid) to anon, authenticated;
grant execute on function mark_kp_viewed(uuid) to anon, authenticated;
grant execute on function confirm_public_kp(uuid, text, text, text, jsonb) to anon, authenticated;

grant execute on function duplicate_kp(uuid) to authenticated;
grant execute on function reorder_kp_items(uuid, uuid[]) to authenticated;
grant execute on function add_kp_variant(uuid, text, text, text, text, numeric, boolean) to authenticated;
grant execute on function set_default_kp_variant(uuid, uuid) to authenticated;
grant execute on function delete_kp_variant(uuid, uuid) to authenticated;
