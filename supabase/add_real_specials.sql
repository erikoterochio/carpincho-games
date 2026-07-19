-- Real-world winners for stage-1 special awards (Balón de Oro, Botín de Oro, etc.)
-- Single global row (id = 1) editable by the admin from the Premios admin tab.
-- Run in the Supabase SQL editor BEFORE deploying the code changes.

create table if not exists public.prode_real_specials (
  id           integer primary key default 1,
  balon_oro    text,
  guante_oro   text,
  botin_oro    text,
  fair_play    text,
  revelacion   text,
  goleada_match_id text,
  updated_at   timestamptz default now(),
  constraint prode_real_specials_singleton check (id = 1)
);

alter table public.prode_real_specials enable row level security;

create policy "Public read real specials"
  on public.prode_real_specials for select using (true);

-- No insert/update/delete policy: writes only via the service-role admin API route.

insert into public.prode_real_specials (id, balon_oro, guante_oro, botin_oro, fair_play, revelacion, goleada_match_id)
values (1, null, null, null, null, 'Cabo Verde', '1489387')
on conflict (id) do nothing;
