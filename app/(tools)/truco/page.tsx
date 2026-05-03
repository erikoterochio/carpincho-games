import Link from 'next/link'

const FONT = "'Ubuntu', sans-serif"

export default function TrucoPage() {
  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={{ background: '#01050F', minHeight: '100vh', fontFamily: FONT, color: '#c1c1c6' }}>

        <nav style={{ background: '#01050F', borderBottom: '1px solid #1e1736', padding: '12px 0' }}>
          <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M19 12H5M12 5l-7 7 7 7" stroke="#706c7e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontSize: 13, color: '#706c7e', fontFamily: FONT }}>Inicio</span>
            </Link>
          </div>
        </nav>

        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <div style={{ background: 'linear-gradient(135deg, #110736 0%, #4c1d95 55%, #7c3aed 100%)', padding: '26px 20px 30px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', right: -30, top: -30, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
            <div style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', width: 96, height: 96, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 50 }}>🃏</span>
            </div>
            <div style={{ maxWidth: '58%' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, fontFamily: FONT }}>Carpincho Games</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: '#ffffff', lineHeight: 1, marginBottom: 10, fontFamily: FONT }}>Truco</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.5, fontFamily: FONT }}>El juego de cartas argentino por excelencia.</div>
            </div>
          </div>

          <div style={{ padding: '24px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#0d0d1a', borderRadius: 14, padding: '18px 16px', border: '1px solid #1e1736' }}>
              <div style={{ fontSize: 13, color: '#706c7e', lineHeight: 1.7 }}>Envido, truco, flor y todas las puyas. Jugá al truco con el marcador digital para no perder la cuenta.</div>
            </div>
            <a href="/truco.html" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#4c1d95', color: '#ffffff', borderRadius: 12, padding: '14px 20px', textDecoration: 'none', fontSize: 15, fontWeight: 700, fontFamily: FONT }}>
              🃏 Jugar Truco
            </a>
            <Link href="/registrar-partida?game=truco" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'transparent', color: '#706c7e', border: '1px solid #1e1736', borderRadius: 12, padding: '12px 20px', textDecoration: 'none', fontSize: 14, fontWeight: 600, fontFamily: FONT }}>
              📋 Registrar partida
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
