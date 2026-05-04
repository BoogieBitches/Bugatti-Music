-- Bugatti Sound: keep only the 10 curated genres in the UI.
-- Deletes non-curated genres if no tracks reference them. Idempotent.
--
-- Curated slugs (must match the home Genres section and the marquee):
--   house, club-house, bass-house, tech-house, garage,
--   baile-funk, pop-dance, drum-bass, hip-hop, techno

delete from public.genres g
where g.slug not in (
  'house', 'club-house', 'bass-house', 'tech-house', 'garage',
  'baile-funk', 'pop-dance', 'drum-bass', 'hip-hop', 'techno'
)
and not exists (
  select 1 from public.tracks t where t.genre_id = g.id
);

-- Re-position curated genres to display in the desired order in filters.
update public.genres set position = 10  where slug = 'house';
update public.genres set position = 20  where slug = 'club-house';
update public.genres set position = 30  where slug = 'bass-house';
update public.genres set position = 40  where slug = 'tech-house';
update public.genres set position = 50  where slug = 'garage';
update public.genres set position = 60  where slug = 'baile-funk';
update public.genres set position = 70  where slug = 'pop-dance';
update public.genres set position = 80  where slug = 'drum-bass';
update public.genres set position = 90  where slug = 'hip-hop';
update public.genres set position = 100 where slug = 'techno';

-- Make sure EN/RU display names match the requested labels.
update public.genres set name_en = 'House',           name_ru = 'Хаус'          where slug = 'house';
update public.genres set name_en = 'Club House',      name_ru = 'Клаб-хаус'     where slug = 'club-house';
update public.genres set name_en = 'Bass House',      name_ru = 'Басс-хаус'     where slug = 'bass-house';
update public.genres set name_en = 'Tech House',      name_ru = 'Тек-хаус'      where slug = 'tech-house';
update public.genres set name_en = 'Garage',          name_ru = 'Гэрэдж'        where slug = 'garage';
update public.genres set name_en = 'Baile Funk',      name_ru = 'Байле-фанк'    where slug = 'baile-funk';
update public.genres set name_en = 'Pop-Dance',       name_ru = 'Поп-данс'      where slug = 'pop-dance';
update public.genres set name_en = 'D''n''B',         name_ru = 'Драм-н-бэйс'   where slug = 'drum-bass';
update public.genres set name_en = 'Rap & Hip-Hop',   name_ru = 'Рэп и Хип-хоп' where slug = 'hip-hop';
update public.genres set name_en = 'Techno',          name_ru = 'Техно'         where slug = 'techno';
