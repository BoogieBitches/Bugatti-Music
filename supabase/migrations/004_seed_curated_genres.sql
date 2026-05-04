-- Bugatti Sound: seed curated genres shown on the home Genres section
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
insert into public.genres (slug, name_en, name_ru, position) values
  ('club-house', 'Club House',    'Клаб-хаус',       41),
  ('bass-house', 'Bass House',    'Басс-хаус',       42),
  ('tech-house', 'Tech House',    'Тек-хаус',        43),
  ('garage',     'Garage',        'Гэрэдж',          44),
  ('baile-funk', 'Baile Funk',    'Байле-фанк',      45),
  ('pop-dance',  'Pop-Dance',     'Поп-данс',        46)
on conflict (slug) do nothing;
