-- Corrige la tabla prode_stage2_picks si fue creada sin pen_winner
-- Ejecutar en Supabase SQL Editor si hay error "Could not find pen_winner column"

ALTER TABLE prode_stage2_picks
  ADD COLUMN IF NOT EXISTS pen_winner text CHECK (pen_winner IN ('h', 'a'));

-- Si la tabla no existe todavía, ejecutar add_stage2_picks.sql primero
