-- ЮKassa migration (additive). Old stripe_* columns are kept untouched
-- and will be dropped in a later migration once all flows are verified.

alter table public.profiles
  add column if not exists yookassa_payment_method_id text,
  add column if not exists yookassa_last_payment_id text;

create index if not exists profiles_yookassa_payment_method_idx
  on public.profiles(yookassa_payment_method_id);
