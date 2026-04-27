-- Bugatti Sound: seed genres
insert into public.genres (slug, name_en, name_ru, position) values
  ('hip-hop',   'Hip-Hop',          'Хип-хоп',           10),
  ('rnb',       'R&B / Soul',       'R&B / Соул',        20),
  ('pop',       'Pop',              'Поп',               30),
  ('house',     'House',            'Хаус',              40),
  ('techno',    'Techno',           'Техно',             50),
  ('edm',       'EDM',              'EDM',               60),
  ('drum-bass', 'Drum & Bass',      'Драм-н-бэйс',       70),
  ('dubstep',   'Dubstep',          'Дабстеп',           80),
  ('reggaeton', 'Reggaeton / Latin','Реггетон / Латина', 90),
  ('afrobeats', 'Afrobeats',        'Афробитс',         100),
  ('rock',      'Rock',             'Рок',              110),
  ('country',   'Country',          'Кантри',           120),
  ('jazz',      'Jazz',             'Джаз',             130),
  ('classical', 'Classical',        'Классика',         140),
  ('lofi',      'Lo-Fi',            'Lo-Fi',            150),
  ('trap',      'Trap',             'Трэп',             160),
  ('phonk',     'Phonk',            'Фонк',             170),
  ('hardstyle', 'Hardstyle',        'Хардстайл',        180),
  ('ambient',   'Ambient',          'Эмбиент',          190),
  ('other',     'Other',            'Другое',           999)
on conflict (slug) do nothing;
