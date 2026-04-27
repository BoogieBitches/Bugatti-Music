-- Bugatti Sound: storage buckets + policies
-- Buckets:
--   audio-tracks  (private)  full-quality audio, premium-gated download
--   audio-previews (public)  30-sec previews for free playback
--   covers        (public)   cover images & cover videos

insert into storage.buckets (id, name, public)
values
  ('audio-tracks', 'audio-tracks', false),
  ('audio-previews', 'audio-previews', true),
  ('covers', 'covers', true)
on conflict (id) do nothing;

-- =========================
-- audio-tracks (private)
-- Upload path convention: <user_id>/<track_id>/<filename>
-- Authenticated user can upload to own folder.
-- Read access is granted via signed URLs from server (service role) only,
-- so no SELECT policy is added for public/authenticated here.
-- =========================
drop policy if exists "audio_tracks_insert_own_folder" on storage.objects;
create policy "audio_tracks_insert_own_folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'audio-tracks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "audio_tracks_update_own" on storage.objects;
create policy "audio_tracks_update_own" on storage.objects
  for update to authenticated using (
    bucket_id = 'audio-tracks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "audio_tracks_delete_own_or_admin" on storage.objects;
create policy "audio_tracks_delete_own_or_admin" on storage.objects
  for delete to authenticated using (
    bucket_id = 'audio-tracks'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

-- Admins can read full audio (for moderation playback)
drop policy if exists "audio_tracks_admin_read" on storage.objects;
create policy "audio_tracks_admin_read" on storage.objects
  for select to authenticated using (
    bucket_id = 'audio-tracks' and public.is_admin()
  );

-- =========================
-- audio-previews (public read)
-- =========================
drop policy if exists "audio_previews_public_read" on storage.objects;
create policy "audio_previews_public_read" on storage.objects
  for select using (bucket_id = 'audio-previews');

drop policy if exists "audio_previews_insert_own" on storage.objects;
create policy "audio_previews_insert_own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'audio-previews'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "audio_previews_update_own" on storage.objects;
create policy "audio_previews_update_own" on storage.objects
  for update to authenticated using (
    bucket_id = 'audio-previews'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "audio_previews_delete_own_or_admin" on storage.objects;
create policy "audio_previews_delete_own_or_admin" on storage.objects
  for delete to authenticated using (
    bucket_id = 'audio-previews'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

-- =========================
-- covers (public read, image + video)
-- =========================
drop policy if exists "covers_public_read" on storage.objects;
create policy "covers_public_read" on storage.objects
  for select using (bucket_id = 'covers');

drop policy if exists "covers_insert_own" on storage.objects;
create policy "covers_insert_own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "covers_update_own" on storage.objects;
create policy "covers_update_own" on storage.objects
  for update to authenticated using (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "covers_delete_own_or_admin" on storage.objects;
create policy "covers_delete_own_or_admin" on storage.objects
  for delete to authenticated using (
    bucket_id = 'covers'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );
