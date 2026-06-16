-- Migration: track number of AI mix generations per user (for freemium quota)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mix_generations_count int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.mix_generations_count IS
  'Total number of AI mix generations by this user. Free users get 1 free; premium/admin get unlimited.';
