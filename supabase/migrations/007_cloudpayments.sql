-- CloudPayments migration.
-- Adds new columns alongside the old yookassa_* ones (kept for safety,
-- can be dropped in a future migration once all data is verified).

alter table public.profiles
  add column if not exists cloudpayments_token text,
  add column if not exists cloudpayments_last_transaction_id bigint;

create index if not exists profiles_cp_token_idx
  on public.profiles(cloudpayments_token);
