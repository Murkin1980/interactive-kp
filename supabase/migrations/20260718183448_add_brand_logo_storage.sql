insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-assets',
  'brand-assets',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Organization admins upload brand assets"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'brand-assets'
  and exists (
    select 1 from public.organization_members m
    where m.organization_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
);

create policy "Organization admins update brand assets"
on storage.objects for update to authenticated
using (
  bucket_id = 'brand-assets'
  and exists (
    select 1 from public.organization_members m
    where m.organization_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
)
with check (
  bucket_id = 'brand-assets'
  and exists (
    select 1 from public.organization_members m
    where m.organization_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
);

create policy "Organization admins delete brand assets"
on storage.objects for delete to authenticated
using (
  bucket_id = 'brand-assets'
  and exists (
    select 1 from public.organization_members m
    where m.organization_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
);
