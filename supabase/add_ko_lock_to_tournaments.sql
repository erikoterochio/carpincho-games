-- Add ko_lock_date column to prode_tournaments
-- When set, KO picks are locked once this timestamp is reached.
alter table prode_tournaments
  add column if not exists ko_lock_date timestamptz;
