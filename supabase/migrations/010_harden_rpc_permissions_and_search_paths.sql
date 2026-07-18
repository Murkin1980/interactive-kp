-- Anonymous clients only need the four token-scoped public-offer operations.
revoke execute on all functions in schema public from anon;
grant execute on function public.get_public_kp(uuid) to anon;
grant execute on function public.mark_kp_viewed(uuid) to anon;
grant execute on function public.approve_public_kp(uuid,text,text,text,jsonb,jsonb,boolean) to anon;
grant execute on function public.attach_approval_pdf(uuid,integer,text) to anon;

-- Pin legacy helper resolution to the application schema.
alter function public.check_kp_item_not_locked() set search_path = public;
alter function public.update_updated_at_column() set search_path = public;
alter function public.get_next_kp_number() set search_path = public;
alter function public.is_kp_locked(uuid) set search_path = public;
alter function public.check_kp_variant_not_locked() set search_path = public;
alter function public.check_kp_publish_requirements() set search_path = public;
