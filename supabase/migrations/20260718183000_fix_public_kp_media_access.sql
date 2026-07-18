create or replace function public.can_read_public_kp_media(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select exists (
    select 1
    from public.kps
    where kps.id::text = (storage.foldername(object_name))[1]
      and kps.public_token::text = (storage.foldername(object_name))[2]
      and kps.status in ('sent', 'viewed', 'confirmed')
      and (storage.foldername(object_name))[3] = 'items'
  );
$$;

revoke all on function public.can_read_public_kp_media(text) from public;
grant execute on function public.can_read_public_kp_media(text) to anon, authenticated;

drop policy if exists "Public proposal reads token scoped item media" on storage.objects;
create policy "Public proposal reads token scoped item media"
on storage.objects for select to anon
using (
  bucket_id = 'kp-media'
  and public.can_read_public_kp_media(name)
);
