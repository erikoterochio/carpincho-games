-- ============================================================
-- LA RESERVA DE CARDALES — Datos extraídos de la tarjeta de score
-- Correr en Supabase SQL Editor
-- ============================================================

-- 1. Insertar la cancha
INSERT INTO golf_courses (
  name, city, par, total_holes, is_public,
  -- Rating/slope por color de salida
  rating_blue,  slope_blue,   -- Azul (azul oscuro / violet en la tarjeta)
  rating_white, slope_white,  -- Blanco
  rating_yellow,slope_yellow, -- Amarillo
  rating_red,   slope_red     -- Rojo (damas)
) VALUES (
  'La Reserva de Cardales', 'Cardales', 72, 18, true,
  71.5, 130,   -- Azul (CALIF. 71.5 en tarjeta — slope estimado)
  69.0, 122,   -- Blanco (CALIF. 69)
  67.7, 116,   -- Amarillo (CALIF. 67.7)
  70.0, 120    -- Rojo / damas (CALIF. 70)
)
RETURNING id;

-- 2. Insertar los 18 hoyos (reemplazar <COURSE_ID> con el id del paso anterior)
-- Ejecutar el INSERT de holes por separado con el id correcto.
-- Datos: hole_number, par, stroke_index (Hcp Hombres), distancias en metros por salida

-- NOTA: Para correr este bloque, primero corré el INSERT de arriba,
-- copiá el id retornado y reemplazá los '<COURSE_ID>' de abajo.

-- Formato: (course_id, hole_number, par, stroke_index, dist_black, dist_blue, dist_white, dist_yellow, dist_red)
-- No hay salida Negra en La Reserva — se deja NULL.
-- Stroke index (Hcp Hombres): front 9 = impares, back 9 = pares.

DO $$
DECLARE
  cid UUID;
BEGIN
  SELECT id INTO cid FROM golf_courses WHERE name = 'La Reserva de Cardales' LIMIT 1;

  INSERT INTO golf_holes
    (course_id, hole_number, par, stroke_index, distance_black, distance_blue, distance_white, distance_yellow, distance_red)
  VALUES
  --  (cid, hoyo, par, hcp,  neg,  azul, blanco, amarillo, rojo)
    (cid,  1,   4,   7,  NULL,  324,   291,    286,    258),
    (cid,  2,   3,  17,  NULL,  166,   116,    107,     92),
    (cid,  3,   5,   1,  NULL,  577,   524,    516,    473),
    (cid,  4,   4,   3,  NULL,  420,   394,    352,    316),
    (cid,  5,   5,  11,  NULL,  534,   510,    459,    435),
    (cid,  6,   3,  13,  NULL,  197,   189,    184,    138),
    (cid,  7,   4,   9,  NULL,  346,   335,    298,    256),
    (cid,  8,   4,   5,  NULL,  372,   332,    324,    292),
    (cid,  9,   4,  15,  NULL,  328,   316,    274,    266),
    (cid, 10,   4,  16,  NULL,  408,   381,    374,    333),
    (cid, 11,   4,  12,  NULL,  371,   328,    323,    286),
    (cid, 12,   5,   8,  NULL,  482,   453,    450,    407),
    (cid, 13,   3,   6,  NULL,  196,   188,    153,    121),
    (cid, 14,   4,   2,  NULL,  364,   353,    329,    304),
    (cid, 15,   4,  10,  NULL,  403,   355,    350,    320),
    (cid, 16,   5,  18,  NULL,  534,   488,    483,    459),
    (cid, 17,   3,   4,  NULL,  172,   135,    131,    109),
    (cid, 18,   4,  14,  NULL,  444,   410,    382,    340);

END $$;
