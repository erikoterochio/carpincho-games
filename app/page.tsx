import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import SessionBridge from '@/components/SessionBridge'
import ThemeToggle from '@/components/ThemeToggle'

const FEATURED = [
  { name: 'El Impostor', href: '/impostor', color: '#0b2659', img: '/images/impostor.png' },
  { name: 'Berenjena',   href: '/berenjena', color: '#110736', img: '/images/berenjena.png' },
]

const MULTIPLAYER = [
  { name: 'El Impostor',       href: '/impostor',  color: '#0b2659', img: '/images/impostor.png' },
  { name: 'Berenjena',         href: '/berenjena', color: '#110736', img: '/images/berenjena.png' },
  { name: 'Tabú',              href: '/tabu',      color: '#065c6c', img: '/images/tabu.png' },
  { name: 'Dígalo con mímica', href: '/mimica',    color: '#055074', img: '/images/mimica.png' },
  { name: 'Truco',             href: '/truco',     color: '#110736', img: '/images/truco.png' },
  { name: 'Generala',          href: '/generala',  color: '#0b2659', img: '/images/generala.png' },
]

const TOOLS = [
  { name: 'Divisor de gastos', href: '/splitwise', color: '#04447b', img: '/images/splitwise.png' },
  { name: 'Golf',              href: '/golf',      color: '#065c6c', img: '/images/golf.png'      },
]

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const initials = user?.email ? user.email.substring(0, 2).toUpperCase() : null

  let ranchadaCount = 0
  let gamesPlayed = 0
  let gamesWon = 0
  if (user) {
    const [{ count }, { data: sessionPlayers }] = await Promise.all([
      supabase.from('ranchadas').select('id', { count: 'exact', head: true }),
      supabase.from('game_session_players').select('is_winner').eq('user_id', user.id),
    ])
    ranchadaCount = count ?? 0
    gamesPlayed = sessionPlayers?.length ?? 0
    gamesWon = sessionPlayers?.filter(p => p.is_winner).length ?? 0
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .wrap { max-width: 480px; margin: 0 auto; padding: 16px 18px; }
        .game-card { position: relative; border-radius: 14px; overflow: hidden; cursor: pointer; border: 1px solid var(--border); background: var(--surface); transition: border-color 0.2s; aspect-ratio: 1 / 1; display: block; text-decoration: none; }
        .game-card:hover { border-color: var(--accent); }
        .game-card-bg { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: 1; transition: opacity 0.2s; }
        .game-card:hover .game-card-bg { opacity: 0.9; }
        .game-card-gradient { position: absolute; inset: 0; background: linear-gradient(to top, rgba(1,5,15,0.9) 0%, rgba(1,5,15,0.4) 35%, transparent 60%); }
        .game-card-name { position: absolute; bottom: 12px; left: 12px; right: 12px; font-family: 'Ubuntu', sans-serif; font-size: 14px; font-weight: 700; color: #fff; z-index: 1; }
        .game-card-name.large { font-size: 17px; bottom: 14px; left: 14px; }
        .sep { display: flex; align-items: center; gap: 10px; margin-bottom: 13px; }
        .sep-line { flex: 1; height: 1px; background: var(--border); }
        .sep-text { font-size: 10px; font-weight: 700; color: var(--text-soft); letter-spacing: 1px; text-transform: uppercase; white-space: nowrap; font-family: 'Ubuntu', sans-serif; }
        .nav-inner { max-width: 480px; margin: 0 auto; padding: 0 18px; display: flex; align-items: center; justify-content: space-between; }
        .avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 12px; color: #fff; font-weight: 700; font-family: 'Ubuntu', sans-serif; text-decoration: none; border: 1px solid var(--accent); transition: opacity 0.2s; }
        .avatar:hover { opacity: 0.85; }
      `}</style>

      <div style={{ background: 'var(--bg)', minHeight: '100vh', fontFamily: "'Ubuntu', sans-serif" }}>

        {/* Navbar */}
        <nav style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '12px 0' }}>
          <div className="nav-inner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <div style={{ width: '28px', height: '28px', background: 'var(--accent)', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 32 32" fill="none"><rect x="4" y="10" width="24" height="16" rx="3" stroke="#fff" strokeWidth="2.2"/><path d="M4 15h24" stroke="#fff" strokeWidth="2.2"/><circle cx="10" cy="22" r="2" fill="#fff"/><circle cx="16" cy="22" r="2" fill="#fff"/><circle cx="22" cy="22" r="2" fill="#fff"/><path d="M11 10V8a5 5 0 0 1 10 0v2" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/></svg>
              </div>
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>Ranchadapp</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              {user ? (
                <>
                  <Link href="/amigos">
                    <button style={{ padding: '7px 12px', background: 'transparent', color: 'var(--text-soft)', border: '1px solid var(--border)', borderRadius: '8px', fontFamily: "'Ubuntu', sans-serif", fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                      Amigos
                    </button>
                  </Link>
                  <Link href="/cuenta" className="avatar">{initials}</Link>
                </>
              ) : (
                <>
                  <Link href="/login">
                    <button style={{ padding: '7px 14px', background: 'transparent', color: 'var(--text-soft)', border: '1px solid var(--border)', borderRadius: '8px', fontFamily: "'Ubuntu', sans-serif", fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                      Iniciar sesión
                    </button>
                  </Link>
                  <Link href="/login">
                    <button style={{ padding: '7px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontFamily: "'Ubuntu', sans-serif", fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                      Registrarse
                    </button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </nav>

        <div className="wrap">

          {/* Tarjeta de ranchadas */}
          {user ? (
            <Link href="/ranchadas" style={{ textDecoration: 'none', display: 'block', marginBottom: '14px' }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <div style={{ width: '34px', height: '34px', background: 'var(--surface-2)', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="var(--text)" strokeWidth="1.8"/><path d="M9 22V12h6v10" stroke="var(--text)" strokeWidth="1.8"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-soft)', marginBottom: '2px' }}>Tus ranchadas</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{ranchadaCount}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-soft)' }}>juntada{ranchadaCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>Ver todas →</span>
              </div>
            </Link>
          ) : null}

          {/* Tarjeta de estadísticas */}
          {user && (
            <Link href="/dashboard" style={{ textDecoration: 'none', display: 'block', marginBottom: '14px' }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <div style={{ width: '34px', height: '34px', background: 'var(--surface-2)', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 3v18h18" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round"/><path d="M8 17V10M13 17V6M18 17v-4" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-soft)', marginBottom: '2px' }}>Tus estadísticas</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{gamesWon}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-soft)' }}>victoria{gamesWon !== 1 ? 's' : ''} en {gamesPlayed} partida{gamesPlayed !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>Ver más →</span>
              </div>
            </Link>
          )}

          {!user && (
            <Link href="/login" style={{ textDecoration: 'none', display: 'block', marginBottom: '14px' }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <div style={{ width: '34px', height: '34px', background: 'var(--surface-2)', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="var(--text-soft)" strokeWidth="1.8"/><path d="M9 22V12h6v10" stroke="var(--text-soft)" strokeWidth="1.8"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 600, marginBottom: '2px' }}>¿Cuántas ranchadas llevás?</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-soft)' }}>Iniciá sesión o creá tu cuenta para llevar la cuenta</div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6" stroke="var(--text-soft)" strokeWidth="2" strokeLinecap="round"/></svg>
              </div>
            </Link>
          )}

          {/* Destacados */}
          <div className="sep"><div className="sep-line" /><span className="sep-text">Destacados</span><div className="sep-line" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '22px' }}>
            {FEATURED.map(game => (
              <Link key={game.name} href={game.href} className="game-card">
                <div className="game-card-bg" style={{ backgroundImage: `url(${game.img})`, backgroundColor: game.color }} />
                <div className="game-card-gradient" />
                <span className="game-card-name large">{game.name}</span>
              </Link>
            ))}
          </div>

          {/* Juegos multijugador */}
          <div className="sep"><div className="sep-line" /><span className="sep-text">Juegos multijugador</span><div className="sep-line" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '22px' }}>
            {MULTIPLAYER.map(game => (
              <Link key={game.name} href={game.href} className="game-card">
                <div className="game-card-bg" style={{ backgroundImage: `url(${game.img})`, backgroundColor: game.color }} />
                <div className="game-card-gradient" />
                <span className="game-card-name">{game.name}</span>
              </Link>
            ))}
          </div>

          {/* Herramientas */}
          <div className="sep"><div className="sep-line" /><span className="sep-text">Herramientas</span><div className="sep-line" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '22px' }}>
            {TOOLS.map(tool => (
              <Link key={tool.name} href={tool.href} className="game-card">
                <div className="game-card-bg" style={{ backgroundImage: `url(${tool.img})`, backgroundColor: tool.color }} />
                <div className="game-card-gradient" />
                <span className="game-card-name">{tool.name}</span>
              </Link>
            ))}
          </div>

        </div>

        <div style={{ padding: '16px', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: '11px', color: 'var(--text-soft)' }}>An app by CarpinchoGames ®</p>
        </div>

      </div>
      <SessionBridge />
    </>
  )
}