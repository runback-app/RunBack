-- Lets players list their own photo folder so old photos can be cleaned up after a new upload.
create policy "Players list their own photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
