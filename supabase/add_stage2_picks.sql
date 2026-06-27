-- Etapa 2 picks: predicciones de partidos reales de eliminación
-- match_id es el UUID real del partido en prode_matches (no slot IDs como ko-r32-0)
-- Deadline: 1 hora antes de cada partido (enforcement en client)

CREATE TABLE IF NOT EXISTS prode_stage2_picks (
  tournament_id uuid NOT NULL REFERENCES prode_tournaments(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  match_id      uuid NOT NULL,
  home_score    integer NOT NULL,
  away_score    integer NOT NULL,
  pen_winner    text CHECK (pen_winner IN ('h', 'a')),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  PRIMARY KEY (tournament_id, user_id, match_id)
);

ALTER TABLE prode_stage2_picks ENABLE ROW LEVEL SECURITY;

-- Usuarios ven y editan solo sus propias picks
CREATE POLICY "stage2_picks_select_own"
  ON prode_stage2_picks FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "stage2_picks_insert_own"
  ON prode_stage2_picks FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "stage2_picks_update_own"
  ON prode_stage2_picks FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- El service role (scores/route.ts) bypasses RLS automáticamente
