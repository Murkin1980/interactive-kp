-- Managers may preview the public flow while signed in; apply the same tightly scoped
-- confirmed-PDF rules to authenticated sessions as to anonymous client sessions.
create policy "Authenticated preview uploads confirmed approval PDF"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'kp-media'
  and name like '%/approval-v%.pdf'
  and exists (
    select 1 from public.kps
    where kps.id::text = (storage.foldername(name))[1]
      and kps.public_token::text = (storage.foldername(name))[2]
      and kps.status = 'confirmed'
      and name = kps.id::text || '/' || kps.public_token::text || '/approval-v' || kps.current_revision::text || '.pdf'
  )
);

create policy "Authenticated preview downloads approval PDF"
on storage.objects for select to authenticated
using (
  bucket_id = 'kp-media'
  and exists (
    select 1 from public.kps
    where kps.id::text = (storage.foldername(name))[1]
      and kps.public_token::text = (storage.foldername(name))[2]
      and kps.status = 'confirmed'
      and name like kps.id::text || '/' || kps.public_token::text || '/approval-v%.pdf'
  )
);
