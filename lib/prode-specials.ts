// Real-world results for stage-1 special awards (Balón de Oro, Botín de Oro, etc.)
// The source of truth is the `prode_real_specials` table (editable by the admin
// from the Premios admin tab). These are just the keys + seed fallback values,
// used before the DB value has loaded.
export const SPECIAL_KEYS = ['balon_oro', 'guante_oro', 'botin_oro', 'fair_play', 'revelacion', 'goleada_match_id'] as const

export const DEFAULT_REAL_SPECIALS: Record<string, string | null> = {
  balon_oro: null,
  guante_oro: null,
  botin_oro: null,
  fair_play: null,
  revelacion: 'Cabo Verde',
  goleada_match_id: '1489387', // Canada 6-0 Qatar (fase de grupos)
}

export const SPECIAL_PTS = 15
