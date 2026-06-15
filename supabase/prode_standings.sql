-- Run this in the Supabase SQL editor to create the prode_standings table.
-- It stores real API-Football group standings (synced when admin clicks Sync API).
-- Standings from the API are for display only — the user's bracket always uses
-- their own predictions.

create table if not exists public.prode_standings (
  group_name   text    not null,   -- 'A' .. 'L'
  team_id      integer not null,
  team_name    text    not null,
  team_logo    text,
  rank         integer not null,
  played       integer not null default 0,
  win          integer not null default 0,
  draw         integer not null default 0,
  lose         integer not null default 0,
  goals_for    integer not null default 0,
  goals_against integer not null default 0,
  goal_diff    integer not null default 0,
  points       integer not null default 0,
  updated_at   timestamptz default now(),
  primary key (group_name, team_id)
);

alter table public.prode_standings enable row level security;

create policy "Public read standings"
  on public.prode_standings for select using (true);

create policy "Authenticated write standings"
  on public.prode_standings for all using (auth.uid() is not null);
