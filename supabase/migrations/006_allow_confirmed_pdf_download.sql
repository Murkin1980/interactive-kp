create policy "Confirmed clients download their approval PDF"
on storage.objects for select to anon
using (
  bucket_id='kp-media'
  and exists (
    select 1 from kps
    where kps.id::text=(storage.foldername(name))[1]
      and kps.public_token::text=(storage.foldername(name))[2]
      and kps.status='confirmed'
      and name like kps.id::text || '/' || kps.public_token::text || '/approval-v%.pdf'
  )
);
