-- Add podium_revealed flag to prode_tournaments.
-- When true, all participants see a podium (top 3 Etapa I + top 3 Etapa II)
-- instead of the normal Home tab. Toggled by the admin.
alter table public.prode_tournaments
  add column if not exists podium_revealed boolean not null default false;
