-- Agrega columnas de penales a prode_matches para detectar ganadores de PEN correctamente.
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE prode_matches
  ADD COLUMN IF NOT EXISTS pen_home INT,
  ADD COLUMN IF NOT EXISTS pen_away INT;
