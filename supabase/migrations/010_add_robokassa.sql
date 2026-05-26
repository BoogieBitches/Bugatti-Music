-- Migration: add Robokassa recurring payment columns
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS robokassa_rebill_id bigint,
  ADD COLUMN IF NOT EXISTS robokassa_last_inv_id bigint;