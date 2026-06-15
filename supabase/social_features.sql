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

-- ============================================================
-- FIX COLUMNAS FALTANTES EN GOLF_PLAYERS
-- Correr si aparece error "sort_order column not found in schema cache"
-- ============================================================
ALTER TABLE golf_players
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Forzar recarga del schema cache de PostgREST
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- FIX RLS GOLF (correr si falla al crear torneos/canchas)
-- ============================================================

ALTER TABLE golf_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_hole_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_competition_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_competition_unit_members ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para usuarios autenticados (golf es colaborativo por invite_code)
DO $$ BEGIN

  -- golf_tournaments
  DROP POLICY IF EXISTS "golf_tournaments_select" ON golf_tournaments;
  DROP POLICY IF EXISTS "golf_tournaments_insert" ON golf_tournaments;
  DROP POLICY IF EXISTS "golf_tournaments_update" ON golf_tournaments;
  DROP POLICY IF EXISTS "golf_tournaments_delete" ON golf_tournaments;
  CREATE POLICY "golf_tournaments_select" ON golf_tournaments FOR SELECT USING (auth.uid() IS NOT NULL);
  CREATE POLICY "golf_tournaments_insert" ON golf_tournaments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  CREATE POLICY "golf_tournaments_update" ON golf_tournaments FOR UPDATE USING (auth.uid() IS NOT NULL);
  CREATE POLICY "golf_tournaments_delete" ON golf_tournaments FOR DELETE USING (created_by = auth.uid());

  -- golf_courses
  DROP POLICY IF EXISTS "golf_courses_select" ON golf_courses;
  DROP POLICY IF EXISTS "golf_courses_insert" ON golf_courses;
  DROP POLICY IF EXISTS "golf_courses_update" ON golf_courses;
  DROP POLICY IF EXISTS "golf_courses_delete" ON golf_courses;
  CREATE POLICY "golf_courses_select" ON golf_courses FOR SELECT USING (auth.uid() IS NOT NULL);
  CREATE POLICY "golf_courses_insert" ON golf_courses FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  CREATE POLICY "golf_courses_update" ON golf_courses FOR UPDATE USING (auth.uid() IS NOT NULL);
  CREATE POLICY "golf_courses_delete" ON golf_courses FOR DELETE USING (auth.uid() IS NOT NULL);

  -- Resto de tablas golf: acceso total a usuarios autenticados
  DROP POLICY IF EXISTS "golf_players_all" ON golf_players;
  CREATE POLICY "golf_players_all" ON golf_players FOR ALL USING (auth.uid() IS NOT NULL);

  DROP POLICY IF EXISTS "golf_formats_all" ON golf_formats;
  CREATE POLICY "golf_formats_all" ON golf_formats FOR ALL USING (auth.uid() IS NOT NULL);

  DROP POLICY IF EXISTS "golf_rounds_all" ON golf_rounds;
  CREATE POLICY "golf_rounds_all" ON golf_rounds FOR ALL USING (auth.uid() IS NOT NULL);

  DROP POLICY IF EXISTS "golf_hole_scores_all" ON golf_hole_scores;
  CREATE POLICY "golf_hole_scores_all" ON golf_hole_scores FOR ALL USING (auth.uid() IS NOT NULL);

  DROP POLICY IF EXISTS "golf_competition_units_all" ON golf_competition_units;
  CREATE POLICY "golf_competition_units_all" ON golf_competition_units FOR ALL USING (auth.uid() IS NOT NULL);

  DROP POLICY IF EXISTS "golf_competition_unit_members_all" ON golf_competition_unit_members;
  CREATE POLICY "golf_competition_unit_members_all" ON golf_competition_unit_members FOR ALL USING (auth.uid() IS NOT NULL);

END $$;
