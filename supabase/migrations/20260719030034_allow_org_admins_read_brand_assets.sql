create policy "Organization admins read brand assets"
on storage.objects for select to authenticated
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
