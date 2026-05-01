-- ============================================================
-- SOCIAL FEATURES: Ranchadas + Game Sessions + Stats
-- Correr en Supabase SQL Editor
-- ============================================================

-- Limpiar si hubo intentos previos (safe: tablas nuevas, sin datos)
DROP TABLE IF EXISTS game_session_players CASCADE;
DROP TABLE IF EXISTS game_sessions CASCADE;
DROP TABLE IF EXISTS ranchada_participants CASCADE;
DROP TABLE IF EXISTS ranchadas CASCADE;

-- 1. RANCHADAS (juntadas)
CREATE TABLE ranchadas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  notes        TEXT,
  created_by   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. PARTICIPANTES DE UNA RANCHADA
CREATE TABLE ranchada_participants (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ranchada_id    UUID NOT NULL REFERENCES ranchadas(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_name     TEXT,
  player_type    TEXT NOT NULL DEFAULT 'guest'
                   CHECK (player_type IN ('owner', 'friend', 'user', 'guest')),
  CONSTRAINT must_have_identity CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)
);

-- 3. SESIONES DE JUEGO (una por partida dentro de una ranchada)
CREATE TABLE game_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ranchada_id         UUID REFERENCES ranchadas(id) ON DELETE SET NULL,
  game_type           TEXT NOT NULL
                        CHECK (game_type IN ('golf','berenjena','truco','generala','wordle','tabu','mimica','impostor')),
  golf_tournament_id  UUID REFERENCES golf_tournaments(id) ON DELETE SET NULL,
  played_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes               TEXT,
  created_by          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 4. JUGADORES EN UNA SESIÓN + SUS STATS
CREATE TABLE game_session_players (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_name      TEXT,
  player_type     TEXT NOT NULL DEFAULT 'guest'
                    CHECK (player_type IN ('friend', 'user', 'guest')),
  team            TEXT,            -- para truco: 'A' o 'B'
  final_position  INTEGER,         -- 1 = ganador
  is_winner       BOOLEAN NOT NULL DEFAULT FALSE,
  stats           JSONB NOT NULL DEFAULT '{}',
  -- Stats por juego en stats JSONB:
  -- berenjena: { fium, won, last_place, final_played, final_won }
  -- truco:     { won, durmio_afuera, durmio_palier }
  -- generala:  { won, generala, escalera, full, poker, cuatro_iguales, max_score }
  -- otros:     { won }
  CONSTRAINT must_have_identity CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)
);

-- 5. EXTENDER GOLF PLAYERS PARA VINCULAR A PERFILES
ALTER TABLE golf_players
  ADD COLUMN IF NOT EXISTS profile_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS player_type TEXT DEFAULT 'guest'
    CHECK (player_type IN ('friend', 'user', 'guest'));

-- 6. VINCULAR TORNEOS DE GOLF A RANCHADAS
ALTER TABLE golf_tournaments
  ADD COLUMN IF NOT EXISTS ranchada_id UUID REFERENCES ranchadas(id) ON DELETE SET NULL;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE ranchadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranchada_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_session_players ENABLE ROW LEVEL SECURITY;

-- ranchadas: visible si sos el creador o participante
CREATE POLICY "ranchadas_select" ON ranchadas FOR SELECT
  USING (
    created_by = auth.uid()
    OR id IN (SELECT ranchada_id FROM ranchada_participants WHERE user_id = auth.uid())
  );
CREATE POLICY "ranchadas_insert" ON ranchadas FOR INSERT
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "ranchadas_update" ON ranchadas FOR UPDATE
  USING (created_by = auth.uid());
CREATE POLICY "ranchadas_delete" ON ranchadas FOR DELETE
  USING (created_by = auth.uid());

-- ranchada_participants
CREATE POLICY "ranchada_participants_select" ON ranchada_participants FOR SELECT
  USING (
    user_id = auth.uid()
    OR ranchada_id IN (SELECT id FROM ranchadas WHERE created_by = auth.uid())
  );
CREATE POLICY "ranchada_participants_all" ON ranchada_participants FOR ALL
  USING (ranchada_id IN (SELECT id FROM ranchadas WHERE created_by = auth.uid()));

-- game_sessions
CREATE POLICY "game_sessions_select" ON game_sessions FOR SELECT
  USING (
    created_by = auth.uid()
    OR ranchada_id IN (SELECT id FROM ranchadas WHERE created_by = auth.uid())
    OR ranchada_id IN (SELECT ranchada_id FROM ranchada_participants WHERE user_id = auth.uid())
    OR id IN (SELECT session_id FROM game_session_players WHERE user_id = auth.uid())
  );
CREATE POLICY "game_sessions_insert" ON game_sessions FOR INSERT
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "game_sessions_update" ON game_sessions FOR UPDATE
  USING (created_by = auth.uid());
CREATE POLICY "game_sessions_delete" ON game_sessions FOR DELETE
  USING (created_by = auth.uid());

-- game_session_players
CREATE POLICY "game_session_players_select" ON game_session_players FOR SELECT
  USING (
    user_id = auth.uid()
    OR session_id IN (SELECT id FROM game_sessions WHERE created_by = auth.uid())
  );
CREATE POLICY "game_session_players_all" ON game_session_players FOR ALL
  USING (session_id IN (SELECT id FROM game_sessions WHERE created_by = auth.uid()));
