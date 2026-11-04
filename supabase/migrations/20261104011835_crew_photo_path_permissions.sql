-- Qualify the object path: an unqualified `name` inside the crews subquery
-- resolves to crews.name, so valid owner uploads and member reads were denied.
alter policy crew_photo_read on storage.objects
using(bucket_id='crew-photos' and exists(
  select 1 from public.crews c
  where c.id::text=(storage.foldername(objects.name))[1]
    and private.is_crew_member(c.id)
));
alter policy crew_photo_insert on storage.objects
with check(bucket_id='crew-photos' and exists(
  select 1 from public.crews c
  where c.id::text=(storage.foldername(objects.name))[1]
    and c.created_by=(select auth.uid())
));
alter policy crew_photo_update on storage.objects
using(bucket_id='crew-photos' and exists(
  select 1 from public.crews c
  where c.id::text=(storage.foldername(objects.name))[1]
    and c.created_by=(select auth.uid())
))
with check(bucket_id='crew-photos' and exists(
  select 1 from public.crews c
  where c.id::text=(storage.foldername(objects.name))[1]
    and c.created_by=(select auth.uid())
));
alter policy crew_photo_delete on storage.objects
using(bucket_id='crew-photos' and exists(
  select 1 from public.crews c
  where c.id::text=(storage.foldername(objects.name))[1]
    and c.created_by=(select auth.uid())
));
