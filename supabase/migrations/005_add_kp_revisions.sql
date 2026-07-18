-- Preserve every accepted estimate while allowing the owner to open a new revision.

alter table kps add column if not exists current_revision integer not null default 1
  check (current_revision > 0);

alter table kp_confirmations add column if not exists revision integer not null default 1
  check (revision > 0);

alter table kp_confirmations drop constraint if exists kp_confirmations_kp_id_key;
alter table kp_confirmations drop constraint if exists kp_confirmations_kp_id_revision_key;
alter table kp_confirmations add constraint kp_confirmations_kp_id_revision_key
  unique (kp_id, revision);

create or replace function reopen_kp_for_revision(p_kp_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kp kps%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select * into v_kp from kps where id = p_kp_id for update;
  if not found or v_kp.owner_id <> (select auth.uid()) then
    raise exception 'KP not found or access denied';
  end if;
  if v_kp.status <> 'confirmed' then
    raise exception 'Only a confirmed KP can be reopened';
  end if;
  if not exists (
    select 1 from kp_approval_snapshots
    where kp_id = p_kp_id and version = v_kp.current_revision
  ) then
    raise exception 'The confirmed revision snapshot is missing';
  end if;

  update kps set
    current_revision = current_revision + 1,
    status = 'sent',
    confirmed_at = null,
    selected_total = null,
    valid_until = greatest(coalesce(valid_until, current_date), current_date + 7)
  where id = p_kp_id;

  return json_build_object(
    'success', true,
    'revision', v_kp.current_revision + 1,
    'public_token', v_kp.public_token
  );
end;
$$;

revoke execute on function reopen_kp_for_revision(uuid) from public, anon;
grant execute on function reopen_kp_for_revision(uuid) to authenticated;

create or replace function prevent_approval_snapshot_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and old.snapshot = new.snapshot
    and old.subtotal = new.subtotal
    and old.discount_amount = new.discount_amount
    and old.total = new.total
    and old.advance = new.advance
    and old.balance = new.balance
    and old.consent_text = new.consent_text
    and old.client_name is not distinct from new.client_name
    and old.client_phone is not distinct from new.client_phone
    and old.confirmed_at = new.confirmed_at
    and old.snapshot_hash = new.snapshot_hash
    and old.pdf_storage_path is null
    and new.pdf_storage_path is not null
    and new.pdf_generated_at is not null
  then
    return new;
  end if;
  raise exception 'Approval snapshots are immutable';
end;
$$;

create or replace function approve_public_kp(
  p_token uuid,
  p_client_name text,
  p_client_phone text,
  p_comment text,
  p_selected_variants jsonb,
  p_selected_options jsonb,
  p_consent boolean
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kp kps%rowtype;
  v_item record;
  v_variant record;
  v_group record;
  v_option record;
  v_variant_id uuid;
  v_option_id uuid;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_advance numeric := 0;
  v_balance numeric := 0;
  v_snapshot jsonb;
  v_items jsonb := '[]'::jsonb;
  v_item_options jsonb;
  v_snapshot_id uuid;
  v_hash text;
  v_consent_text text;
begin
  if p_consent is not true then
    raise exception 'Final estimate consent is required';
  end if;
  if jsonb_typeof(p_selected_variants) <> 'object' or jsonb_typeof(p_selected_options) <> 'object' then
    raise exception 'Invalid selection format';
  end if;

  select * into v_kp from kps where public_token = p_token for update;
  if not found then raise exception 'KP not found'; end if;
  if v_kp.status = 'confirmed' then
    select json_build_object('success', true, 'already_confirmed', true, 'snapshot_id', id,
      'revision', version, 'total', total, 'advance', advance, 'balance', balance,
      'pdf_storage_path', pdf_storage_path)
    from kp_approval_snapshots where kp_id = v_kp.id and version = v_kp.current_revision
    into v_snapshot;
    return v_snapshot;
  end if;
  if v_kp.status not in ('sent', 'viewed') then raise exception 'KP is not open for approval'; end if;
  if v_kp.valid_until is not null and v_kp.valid_until < current_date then raise exception 'KP has expired'; end if;

  for v_item in select * from kp_items where kp_id = v_kp.id order by sort_order loop
    begin v_variant_id := (p_selected_variants ->> v_item.id::text)::uuid;
    exception when others then v_variant_id := null; end;
    select v.* into v_variant from kp_item_variants v
      where v.id = v_variant_id and v.item_id = v_item.id;
    if not found then raise exception 'A valid variant is required for every item'; end if;

    v_item_options := '[]'::jsonb;
    for v_group in select * from kp_option_groups where item_id = v_item.id order by sort_order loop
      begin v_option_id := (p_selected_options ->> v_group.id::text)::uuid;
      exception when others then v_option_id := null; end;
      if v_option_id is null and v_group.is_required then
        raise exception 'A value is required for option group %', v_group.name;
      end if;
      if v_option_id is not null then
        select o.* into v_option from kp_option_values o
          where o.id = v_option_id and o.group_id = v_group.id;
        if not found then raise exception 'Invalid option value for group %', v_group.name; end if;
        v_subtotal := v_subtotal + (v_option.price_delta * v_item.quantity);
        v_item_options := v_item_options || jsonb_build_array(jsonb_build_object(
          'group_id', v_group.id, 'group_name', v_group.name, 'value_id', v_option.id,
          'value_name', v_option.name, 'brand', v_option.brand,
          'price_delta', v_option.price_delta
        ));
      end if;
    end loop;

    v_subtotal := v_subtotal + (v_variant.price * v_item.quantity);
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'item_id', v_item.id, 'name', v_item.name, 'description', v_item.description,
      'dimensions', v_item.dimensions, 'quantity', v_item.quantity,
      'image_url', coalesce(v_item.original_image_url, v_item.image_url),
      'sketch_image_url', v_item.sketch_image_url,
      'variant', jsonb_build_object('id', v_variant.id, 'name', v_variant.name,
        'material', v_variant.material, 'hardware', v_variant.hardware,
        'description', v_variant.description, 'price', v_variant.price),
      'options', v_item_options
    ));
  end loop;

  if jsonb_array_length(v_items) = 0 then raise exception 'KP has no items'; end if;
  if v_kp.discount_type = 'percent' then v_discount := round(v_subtotal * v_kp.discount_value / 100);
  elsif v_kp.discount_type = 'fixed' then v_discount := least(v_kp.discount_value, v_subtotal); end if;
  v_total := v_subtotal - v_discount;
  v_advance := round(v_total * v_kp.advance_percent / 100);
  v_balance := v_total - v_advance;
  v_consent_text := 'I have reviewed the selected configuration and agree with the final estimate.';
  v_snapshot := jsonb_build_object(
    'kp_id', v_kp.id, 'number', v_kp.number, 'revision', v_kp.current_revision,
    'client_name', v_kp.client_name, 'client_phone', v_kp.client_phone,
    'project_name', v_kp.project_name, 'items', v_items,
    'subtotal', v_subtotal, 'discount_amount', v_discount, 'total', v_total,
    'advance_percent', v_kp.advance_percent, 'advance', v_advance, 'balance', v_balance,
    'balance_condition', v_kp.balance_condition, 'confirmed_at', now()
  );
  v_hash := md5(v_snapshot::text || v_kp.id::text || v_kp.current_revision::text);

  insert into kp_confirmations(kp_id, revision, client_name, client_phone, comment,
    selected_variants, selected_total, confirmed_at)
  values(v_kp.id, v_kp.current_revision, left(trim(p_client_name),100), left(trim(p_client_phone),30),
    left(trim(p_comment),1000), p_selected_variants, v_total, now());

  insert into kp_approval_snapshots(kp_id, version, snapshot, subtotal, discount_amount,
    total, advance, balance, consent_text, client_name, client_phone, snapshot_hash)
  values(v_kp.id, v_kp.current_revision, v_snapshot, v_subtotal, v_discount, v_total,
    v_advance, v_balance, v_consent_text, left(trim(p_client_name),100),
    left(trim(p_client_phone),30), v_hash)
  returning id into v_snapshot_id;

  update kps set status='confirmed', confirmed_at=now(), selected_total=v_total where id=v_kp.id;
  return json_build_object('success',true,'already_confirmed',false,'snapshot_id',v_snapshot_id,
    'revision',v_kp.current_revision,'snapshot_hash',v_hash,'snapshot',v_snapshot,
    'total',v_total,'advance',v_advance,'balance',v_balance);
end;
$$;

revoke execute on function approve_public_kp(uuid,text,text,text,jsonb,jsonb,boolean) from public;
grant execute on function approve_public_kp(uuid,text,text,text,jsonb,jsonb,boolean) to anon, authenticated;

create or replace function attach_approval_pdf(
  p_token uuid,
  p_revision integer,
  p_storage_path text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_kp kps%rowtype; v_snapshot_id uuid;
begin
  select * into v_kp from kps where public_token=p_token and status='confirmed';
  if not found or v_kp.current_revision <> p_revision then raise exception 'Confirmed revision not found'; end if;
  if p_storage_path <> v_kp.id::text || '/' || v_kp.public_token::text || '/approval-v' || p_revision::text || '.pdf' then
    raise exception 'Invalid PDF path';
  end if;
  update kp_approval_snapshots set pdf_storage_path=p_storage_path,pdf_generated_at=now()
    where kp_id=v_kp.id and version=p_revision and pdf_storage_path is null returning id into v_snapshot_id;
  if v_snapshot_id is null then raise exception 'PDF is already attached'; end if;
  return json_build_object('success',true,'snapshot_id',v_snapshot_id,'pdf_storage_path',p_storage_path);
end;
$$;

revoke execute on function attach_approval_pdf(uuid,integer,text) from public;
grant execute on function attach_approval_pdf(uuid,integer,text) to anon, authenticated;

create policy "Confirmed clients upload one approval PDF"
on storage.objects for insert to anon
with check (
  bucket_id='kp-media'
  and name like '%/approval-v%.pdf'
  and exists (
    select 1 from kps
    where kps.id::text=(storage.foldername(name))[1]
      and kps.public_token::text=(storage.foldername(name))[2]
      and kps.status='confirmed'
      and name=kps.id::text || '/' || kps.public_token::text || '/approval-v' || kps.current_revision::text || '.pdf'
  )
);

create or replace function get_public_kp(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_kp kps%rowtype; v_expired boolean;
begin
  select * into v_kp from kps where public_token=p_token
    and status in ('sent','viewed','confirmed','expired');
  if not found then return null; end if;
  v_expired := v_kp.status <> 'confirmed' and v_kp.valid_until is not null and v_kp.valid_until < current_date;
  return json_build_object(
    'id',v_kp.id,'number',v_kp.number,'client_name',v_kp.client_name,
    'client_phone',v_kp.client_phone,'project_name',v_kp.project_name,
    'created_at',v_kp.created_at,'valid_until',v_kp.valid_until,'status',v_kp.status,
    'notes',v_kp.notes,'advance_percent',v_kp.advance_percent,
    'balance_condition',v_kp.balance_condition,'discount_type',v_kp.discount_type,
    'discount_value',v_kp.discount_value,'confirmed_at',v_kp.confirmed_at,
    'selected_total',v_kp.selected_total,'current_revision',v_kp.current_revision,
    'is_expired',v_expired,
    'approval',(
      select json_build_object('version',s.version,'snapshot',s.snapshot,'total',s.total,
        'advance',s.advance,'balance',s.balance,'confirmed_at',s.confirmed_at,
        'pdf_storage_path',s.pdf_storage_path)
      from kp_approval_snapshots s where s.kp_id=v_kp.id and s.version=v_kp.current_revision
    ),
    'selected_variants',(
      select c.selected_variants from kp_confirmations c
      where c.kp_id=v_kp.id and c.revision=v_kp.current_revision limit 1
    ),
    'items',(
      select coalesce(json_agg(json_build_object(
        'id',i.id,'name',i.name,'description',i.description,'dimensions',i.dimensions,
        'quantity',i.quantity,'image_url',i.image_url,'original_image_url',i.original_image_url,
        'sketch_image_url',i.sketch_image_url,'item_type',i.item_type,'sort_order',i.sort_order,
        'variants',(select coalesce(json_agg(json_build_object(
          'id',v.id,'name',v.name,'material',v.material,'hardware',v.hardware,
          'description',v.description,'price',v.price,'is_default',v.is_default,
          'sort_order',v.sort_order) order by v.sort_order),'[]'::json)
          from kp_item_variants v where v.item_id=i.id),
        'option_groups',(select coalesce(json_agg(json_build_object(
          'id',g.id,'name',g.name,'slug',g.slug,'description',g.description,
          'is_required',g.is_required,'sort_order',g.sort_order,
          'values',(select coalesce(json_agg(json_build_object(
            'id',o.id,'name',o.name,'brand',o.brand,'description',o.description,
            'image_url',o.image_url,'price_delta',o.price_delta,
            'production_days_delta',o.production_days_delta,'is_default',o.is_default,
            'sort_order',o.sort_order) order by o.sort_order),'[]'::json)
            from kp_option_values o where o.group_id=g.id)
        ) order by g.sort_order),'[]'::json) from kp_option_groups g where g.item_id=i.id)
      ) order by i.sort_order),'[]'::json) from kp_items i where i.kp_id=v_kp.id
    )
  );
end;
$$;

revoke execute on function get_public_kp(uuid) from public;
grant execute on function get_public_kp(uuid) to anon, authenticated;
