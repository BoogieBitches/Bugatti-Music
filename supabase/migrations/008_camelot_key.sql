-- Add camelot_key column to tracks for harmonic mixing display.
-- camelot_key is separate from music_key (traditional notation like "Cm")
-- and uses the Camelot wheel notation (e.g. "8B", "1A").

alter table public.tracks
  add column if not exists camelot_key text
    check (camelot_key is null or camelot_key ~ '^(1[0-2]|[1-9])[AB]$');

create index if not exists tracks_camelot_key_idx
  on public.tracks(camelot_key)
  where camelot_key is not null;
