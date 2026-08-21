'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/TopNav'

const FONT = "'Ubuntu', sans-serif"
const C = {
  bg: 'var(--bg)', card: 'var(--surface)', border: 'var(--border)',
  primary: '#055074', text: 'var(--text)', muted: 'var(--text-soft)',
} as const

const GAME_ICONS: Record<string, string> = {
  golf: '⛳', berenjena: '🍆', truco: '🃏', generala: '🎲',
  wordle: '🔤', tabu: '🚫', mimica: '🎭', impostor: '🕵️',
}
const GAME_LABELS: Record<string, string> = {
  golf: 'Golf', berenjena: 'Berenjena', truco: 'Truco', generala: 'Generala',
  wordle: 'Wordle', tabu: 'Tabú', mimica: 'Mímica', impostor: 'El Impostor',
}

type GameStat = { played: number; won: number }

export default function DashboardPage() {
  const supabase = createClient()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [ranchadaCount, setRanchadaCount] = useState(0)
  const [perGame, setPerGame] = useState<Record<string, GameStat>>({})

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }

      const [{ count }, { data: sessionPlayers }] = await Promise.all([
        supabase.from('ranchadas').select('id', { count: 'exact', head: true }),
        supabase
          .from('game_session_players')
          .select('is_winner, session:game_sessions(game_type)')
          .eq('user_id', user.id),
      ])

      setRanchadaCount(count ?? 0)

      const byGame: Record<string, GameStat> = {}
      for (const sp of (sessionPlayers as any[]) ?? []) {
        const gt = sp.session?.game_type
        if (!gt) continue
        if (!byGame[gt]) byGame[gt] = { played: 0, won: 0 }
        byGame[gt].played++
        if (sp.is_winner) byGame[gt].won++
      }
      setPerGame(byGame)
      setLoading(false)
    })
  }, [])

  const totalPlayed = Object.values(perGame).reduce((a, g) => a + g.played, 0)
  const totalWon = Object.values(perGame).reduce((a, g) => a + g.won, 0)
  const winRate = totalPlayed > 0 ? Math.round((totalWon / totalPlayed) * 100) : 0
  const games = Object.entries(perGame).sort((a, b) => b[1].played - a[1].played)

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT, paddingBottom: 40 }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          <TopNav backHref="/" title="Estadísticas" />

          <div style={{ padding: '20px 18px' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted, fontSize: 13 }}>Cargando...</div>
            ) : totalPlayed === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>Todavía no hay partidas registradas</div>
                <div style={{ fontSize: 13, color: C.muted, marginBottom: 24 }}>Jugá y registrá tus partidas para ver tus estadísticas acá</div>
                <Link href="/ranchadas" style={{ display: 'inline-block', padding: '12px 28px', background: C.primary, color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none', fontFamily: FONT }}>
                  Ver mis ranchadas
                </Link>
              </div>
            ) : (
              <>
                {/* Resumen */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
                  <StatTile label="Ranchadas" value={ranchadaCount} />
                  <StatTile label="Partidas jugadas" value={totalPlayed} />
                  <StatTile label="Victorias" value={totalWon} accent="#22c55e" />
                  <StatTile label="% de victorias" value={`${winRate}%`} accent="#22c55e" />
                </div>

                {/* Por juego */}
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
                  Por juego
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {games.map(([gameType, stat]) => {
                    const pct = stat.played > 0 ? Math.round((stat.won / stat.played) * 100) : 0
                    return (
                      <div key={gameType} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ fontSize: 22, flexShrink: 0 }}>{GAME_ICONS[gameType] ?? '🎮'}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>{GAME_LABELS[gameType] ?? gameType}</div>
                          <div style={{ fontSize: 12, color: C.muted }}>
                            {stat.played} partida{stat.played !== 1 ? 's' : ''} · {stat.won} victoria{stat.won !== 1 ? 's' : ''}
                          </div>
                          <div style={{ height: 4, background: C.border, borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: '#22c55e', borderRadius: 2 }} />
                          </div>
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: pct >= 50 ? '#22c55e' : C.muted, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                          {pct}%
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function StatTile({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent ?? C.text, lineHeight: 1, fontFamily: FONT, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{label}</div>
    </div>
  )
}
