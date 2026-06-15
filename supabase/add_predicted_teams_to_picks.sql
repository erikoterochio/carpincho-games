-- Add predicted home/away team names to KO picks.
-- For group-stage matches these are always the same as the real match teams,
-- but for KO matches the "teams" depend on each user's group-stage predictions —
-- this persists that per-user resolution alongside the score.
--
-- Run in the Supabase SQL editor.

alter table public.prode_stage1_picks
  add column if not exists predicted_home text,
  add column if not exists predicted_away text;
