-- Bugatti Sound: initial schema
-- Roles: 'user' (default), 'admin'
-- Track moderation: 'pending' -> 'approved' | 'rejected'

create extension if not exists "uuid-ossp";

-- =========================
-- profiles
-- =========================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  is_premium boolean not null default false,
  premium_until timestamptz,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  preferred_locale text not null default 'en' check (preferred_locale in ('en', 'ru')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.handle_updated_at();

-- Auto-create a profile when a new auth user is registered
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =========================
-- genres
-- =========================
create table if not exists public.genres (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  name_en text not null,
  name_ru text not null,
  position int not null default 0
);

-- =========================
-- tracks
-- =========================
create table if not exists public.tracks (
  id uuid primary key default uuid_generate_v4(),
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  artist text not null,
  description text,
  genre_id uuid references public.genres(id) on delete set null,
  style text,
  bpm int check (bpm > 0 and bpm < 400),
  music_key text,
  duration_seconds int check (duration_seconds >= 0),
  audio_path text not null,            -- storage path in 'audio-tracks' bucket (private)
  preview_path text,                   -- storage path in 'audio-previews' bucket (public)
  cover_image_path text,               -- storage path in 'covers' bucket (public)
  cover_video_path text,               -- storage path in 'covers' bucket (public, mp4/webm/gif)
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  plays_count bigint not null default 0,
  downloads_count bigint not null default 0,
  is_premium_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists tracks_updated_at on public.tracks;
create trigger tracks_updated_at
before update on public.tracks
for each row execute function public.handle_updated_at();

create index if not exists tracks_status_idx on public.tracks(status);
create index if not exists tracks_genre_idx on public.tracks(genre_id);
create index if not exists tracks_uploader_idx on public.tracks(uploader_id);
create index if not exists tracks_created_idx on public.tracks(created_at desc);
create index if not exists tracks_search_idx on public.tracks
  using gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(artist,'') || ' ' || coalesce(style,'')));

-- =========================
-- favorites
-- =========================
create table if not exists public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

-- =========================
-- audit_log (admin actions)
-- =========================
create table if not exists public.audit_log (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- =========================
-- helper: is_admin()
-- =========================
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p where p.id = uid and p.role = 'admin'
  );
$$;

-- =========================
-- RLS
-- =========================
alter table public.profiles enable row level security;
alter table public.tracks enable row level security;
alter table public.genres enable row level security;
alter table public.favorites enable row level security;
alter table public.audit_log enable row level security;

-- profiles: user can read own, admins read all; user can update own non-privileged fields
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- genres: readable by anyone, only admin writes (service role bypasses RLS anyway)
drop policy if exists "genres_select_all" on public.genres;
create policy "genres_select_all" on public.genres
  for select using (true);

drop policy if exists "genres_admin_write" on public.genres;
create policy "genres_admin_write" on public.genres
  for all using (public.is_admin()) with check (public.is_admin());

-- tracks
-- approved tracks visible to anyone; pending/rejected visible only to uploader and admins
drop policy if exists "tracks_select_visible" on public.tracks;
create policy "tracks_select_visible" on public.tracks
  for select using (
    status = 'approved'
    or uploader_id = auth.uid()
    or public.is_admin()
  );

-- only authenticated users can insert their own pending tracks
drop policy if exists "tracks_insert_self" on public.tracks;
create policy "tracks_insert_self" on public.tracks
  for insert with check (
    auth.uid() = uploader_id
    and status = 'pending'
  );

-- uploader can update own pending tracks (limited to text fields), admin can update any
drop policy if exists "tracks_update_uploader_pending" on public.tracks;
create policy "tracks_update_uploader_pending" on public.tracks
  for update using (
    (auth.uid() = uploader_id and status = 'pending')
    or public.is_admin()
  ) with check (
    (auth.uid() = uploader_id and status = 'pending')
    or public.is_admin()
  );

-- uploader can delete own pending tracks; admin can delete any
drop policy if exists "tracks_delete" on public.tracks;
create policy "tracks_delete" on public.tracks
  for delete using (
    (auth.uid() = uploader_id and status = 'pending')
    or public.is_admin()
  );

-- favorites: user can manage own only
drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own" on public.favorites
  for select using (auth.uid() = user_id);

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own" on public.favorites
  for insert with check (auth.uid() = user_id);

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own" on public.favorites
  for delete using (auth.uid() = user_id);

-- audit log: admin read only
drop policy if exists "audit_admin_read" on public.audit_log;
create policy "audit_admin_read" on public.audit_log
  for select using (public.is_admin());

-- =========================
-- RPC: increment counters (callable from clients on approved tracks)
-- =========================
create or replace function public.increment_plays(track_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.tracks
    set plays_count = plays_count + 1
    where id = track_id and status = 'approved';
end;
$$;

grant execute on function public.increment_plays(uuid) to anon, authenticated;
