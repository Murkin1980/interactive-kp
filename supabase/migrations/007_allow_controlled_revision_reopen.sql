create or replace function check_kp_not_locked()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status in ('confirmed','expired') then
    if current_setting('app.reopen_kp', true) = 'on'
      and old.status = 'confirmed'
      and new.status = 'sent'
      and new.current_revision = old.current_revision + 1
      and new.confirmed_at is null
      and new.selected_total is null
    then
      return new;
    end if;
    raise exception 'КП подтверждено или просрочено и не может быть изменено';
  end if;
  if tg_op = 'DELETE' and old.status in ('confirmed','expired') then
    raise exception 'КП подтверждено или просрочено и не может быть удалено';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function reopen_kp_for_revision(p_kp_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_kp kps%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select * into v_kp from kps where id=p_kp_id for update;
  if not found or v_kp.owner_id <> (select auth.uid()) then raise exception 'KP not found or access denied'; end if;
  if v_kp.status <> 'confirmed' then raise exception 'Only a confirmed KP can be reopened'; end if;
  if not exists(select 1 from kp_approval_snapshots where kp_id=p_kp_id and version=v_kp.current_revision) then
    raise exception 'The confirmed revision snapshot is missing';
  end if;
  perform set_config('app.reopen_kp','on',true);
  update kps set current_revision=current_revision+1,status='sent',confirmed_at=null,selected_total=null,
    valid_until=greatest(coalesce(valid_until,current_date),current_date+7) where id=p_kp_id;
  return json_build_object('success',true,'revision',v_kp.current_revision+1,'public_token',v_kp.public_token);
end;
$$;

revoke execute on function reopen_kp_for_revision(uuid) from public,anon;
grant execute on function reopen_kp_for_revision(uuid) to authenticated;
revoke execute on function check_kp_not_locked() from public,anon,authenticated;
