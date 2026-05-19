-- Drop YooKassa columns — replaced by CloudPayments.
-- Run in Supabase SQL Editor.

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS yookassa_payment_method_id,
  DROP COLUMN IF EXISTS yookassa_last_payment_id;

