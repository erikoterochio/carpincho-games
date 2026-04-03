import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import SessionBridge from '@/components/SessionBridge'

const FEATURED = [
  { name: 'El Impostor', href: '/impostor.html', color: '#0b2659', img: '/images/impostor.png' },
  { name: 'Berenjena',   href: '/berenjena.html', color: '#110736', img: '/images/berenjena.png' },
]

const MULTIPLAYER = [
  { name: 'El Impostor',       href: '/impostor.html',  color: '#0b2659', img: '/images/impostor.png' },
  { name: 'Berenjena',         href: '/berenjena.html', color: '#110736', img: '/images/berenjena.png' },
  { name: 'Tabú',              href: '/tabu.html',      color: '#065c6c', img: '/images/tabu.png' },
  { name: 'Dígalo con mímica', href: '/mimica.html',    color: '#055074', img: '/images/mimica.png' },
  { name: 'Truco',             href: '/truco.html',     color: '#110736', img: '/images/truco.png' },
  { name: 'Generala',          href: '/generala.html',  color: '#0b2659', img: '/images/generala.png' },
]

const TOOLS = [
  { name: 'Divisor de gastos', href: '/splitwise', color: '#04447b', img: '/images/splitwise.png' },
  { name: 'Golf',              href: '/golf',      color: '#065c6c', img: '/images/golf.png'      },
]

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const initials = user?.email ? user.email.substring(0, 2).toUpperCase() : null

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .wrap { max-width: 480px; margin: 0 auto; padding: 16px 18px; }
        .game-card { position: relative; border-radius: 14px; overflow: hidden; cursor: pointer; border: 1px solid #2a2448; background: #1e1736; transition: border-color 0.2s; aspect-ratio: 1 / 1; display: block; text-decoration: none; }
        .game-card:hover { border-color: #055074; }
        .game-card-bg { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: 1; transition: opacity 0.2s; }
        .game-card:hover .game-card-bg { opacity: 0.9; }
        .game-card-gradient { position: absolute; inset: 0; background: linear-gradient(to top, rgba(1,5,15,0.9) 0%, rgba(1,5,15,0.4) 35%, transparent 60%); }
        .game-card-name { position: absolute; bottom: 12px; left: 12px; right: 12px; font-family: 'Ubuntu', sans-serif; font-size: 14px; font-weight: 700; color: #c1c1c6; z-index: 1; }
        .game-card-name.large { font-size: 17px; bottom: 14px; left: 14px; }
        .sep { display: flex; align-items: center; gap: 10px; margin-bottom: 13px; }
        .sep-line { flex: 1; height: 1px; background: #1e1736; }
        .sep-text { font-size: 10px; font-weight: 700; color: #706c7e; letter-spacing: 1px; text-transform: uppercase; white-space: nowrap; font-family: 'Ubuntu', sans-serif; }
        .nav-inner { max-width: 480px; margin: 0 auto; padding: 0 18px; display: flex; align-items: center; justify-content: space-between; }
        .avatar { width: 32px; height: 32px; border-radius: 50%; background: #055074; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #c1c1c6; font-weight: 700; font-family: 'Ubuntu', sans-serif; text-decoration: none; border: 1px solid #04447b; transition: opacity 0.2s; }
        .avatar:hover { opacity: 0.85; }
      `}</style>

      <div style={{ background: '#01050F', minHeight: '100vh', fontFamily: "'Ubuntu', sans-serif" }}>

        {/* Navbar */}
        <nav style={{ background: '#01050F', borderBottom: '1px solid #1e1736', padding: '12px 0' }}>
          <div className="nav-inner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <div style={{ width: '28px', height: '28px', background: '#055074', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 32 32" fill="none"><rect x="4" y="10" width="24" height="16" rx="3" stroke="#c1c1c6" strokeWidth="2.2"/><path d="M4 15h24" stroke="#c1c1c6" strokeWidth="2.2"/><circle cx="10" cy="22" r="2" fill="#c1c1c6"/><circle cx="16" cy="22" r="2" fill="#c1c1c6"/><circle cx="22" cy="22" r="2" fill="#c1c1c6"/><path d="M11 10V8a5 5 0 0 1 10 0v2" stroke="#c1c1c6" strokeWidth="2.2" strokeLinecap="round"/></svg>
              </div>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#c1c1c6' }}>Ranchadapp</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {user ? (
                <>
                  <Link href="/amigos">
                    <button style={{ padding: '7px 12px', background: 'transparent', color: '#706c7e', border: '1px solid #1e1736', borderRadius: '8px', fontFamily: "'Ubuntu', sans-serif", fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                      Amigos
                    </button>
                  </Link>
                  <Link href="/cuenta" className="avatar">{initials}</Link>
                </>
              ) : (
                <>
                  <Link href="/login">
                    <button style={{ padding: '7px 14px', background: 'transparent', color: '#706c7e', border: '1px solid #1e1736', borderRadius: '8px', fontFamily: "'Ubuntu', sans-serif", fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                      Iniciar sesión
                    </button>
                  </Link>
                  <Link href="/login">
                    <button style={{ padding: '7px 14px', background: '#055074', color: '#c1c1c6', border: 'none', borderRadius: '8px', fontFamily: "'Ubuntu', sans-serif", fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
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
            <Link href="/cuenta" style={{ textDecoration: 'none', display: 'block', marginBottom: '14px' }}>
              <div style={{ background: '#1e1736', border: '1px solid #2a2448', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <div style={{ width: '34px', height: '34px', background: '#110736', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="#c1c1c6" strokeWidth="1.8"/><path d="M9 22V12h6v10" stroke="#c1c1c6" strokeWidth="1.8"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', color: '#706c7e', marginBottom: '2px' }}>Tus ranchadas</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '20px', fontWeight: 700, color: '#c1c1c6', lineHeight: 1 }}>0</span>
                    <span style={{ fontSize: '11px', color: '#706c7e' }}>juntadas</span>
                  </div>
                </div>
                <span style={{ fontSize: '11px', color: '#055074', fontWeight: 600 }}>Ver perfil →</span>
              </div>
            </Link>
          ) : (
            <Link href="/login" style={{ textDecoration: 'none', display: 'block', marginBottom: '14px' }}>
              <div style={{ background: '#1e1736', border: '1px solid #2a2448', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <div style={{ width: '34px', height: '34px', background: '#110736', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="#706c7e" strokeWidth="1.8"/><path d="M9 22V12h6v10" stroke="#706c7e" strokeWidth="1.8"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', color: '#c1c1c6', fontWeight: 600, marginBottom: '2px' }}>¿Cuántas ranchadas llevás?</div>
                  <div style={{ fontSize: '11px', color: '#706c7e' }}>Iniciá sesión o creá tu cuenta para llevar la cuenta</div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6" stroke="#706c7e" strokeWidth="2" strokeLinecap="round"/></svg>
              </div>
            </Link>
          )}

          {/* Hero: Prode Mundial */}
          <div style={{ border: '1px solid #04447b', borderRadius: '16px', marginBottom: '22px', overflow: 'hidden', display: 'flex', minHeight: '160px' }}>
            <div style={{ flex: '0 0 55%', background: '#0b2659', padding: '18px 16px 18px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, right: -20, width: 40, height: '100%', background: 'linear-gradient(to right, #0b2659, transparent)', zIndex: 1, pointerEvents: 'none' }} />
              <div style={{ display: 'inline-block', background: '#055074', color: '#c1c1c6', fontSize: '9px', fontWeight: 700, letterSpacing: '1px', padding: '3px 9px', borderRadius: '20px', marginBottom: '10px', width: 'fit-content' }}>
                MUNDIAL 2026
              </div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: '#c1c1c6', marginBottom: '5px', lineHeight: 1.3 }}>Prode del Mundial con tus amigos</div>
              <div style={{ fontSize: '11px', color: '#8aa8cc', marginBottom: '14px', lineHeight: 1.5 }}>Predecí resultados y ganá el ranking</div>
              <button style={{ background: '#c1c1c6', color: '#01050F', fontFamily: "'Ubuntu', sans-serif", fontSize: '12px', fontWeight: 700, padding: '8px 16px', borderRadius: '9px', border: 'none', cursor: 'not-allowed', opacity: 0.6, width: 'fit-content' }}>
                Próximamente
              </button>
            </div>
            <div style={{ flex: '0 0 45%', backgroundImage: 'url(/images/prode.png)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          </div>

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

        <div style={{ padding: '16px', textAlign: 'center', borderTop: '1px solid #1e1736' }}>
          <p style={{ fontSize: '11px', color: '#706c7e' }}>An app by CarpinchoGames ®</p>
        </div>

      </div>
      <SessionBridge />
    </>
  )
}