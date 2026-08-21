import Link from 'next/link'
import TopNav from '@/components/TopNav'

const FONT = "'Ubuntu', sans-serif"

export default function TrucoPage() {
  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={{ background: 'var(--bg)', minHeight: '100vh', fontFamily: FONT, color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>

        <TopNav backHref="/" title="Truco" />

        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <div style={{ maxWidth: 480, width: '100%', margin: '0 auto' }}>
          <div style={{ background: 'linear-gradient(135deg, #110736 0%, #4c1d95 55%, #7c3aed 100%)', padding: '26px 20px 30px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', right: -30, top: -30, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
            <div style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', width: 96, height: 96, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <img src="/images/truco.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ maxWidth: '58%' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, fontFamily: FONT }}>Carpincho Games</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: '#ffffff', lineHeight: 1, marginBottom: 10, fontFamily: FONT }}>Truco</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.5, fontFamily: FONT }}>El juego de cartas argentino por excelencia.</div>
            </div>
          </div>

          <div style={{ padding: '24px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '18px 16px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.7 }}>Envido, truco, flor y todas las puyas. Jugá al truco con el marcador digital para no perder la cuenta.</div>
            </div>
            <Link href="/truco/jugar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#4c1d95', color: '#ffffff', borderRadius: 12, padding: '14px 20px', textDecoration: 'none', fontSize: 15, fontWeight: 700, fontFamily: FONT }}>
              🃏 Nuevo partido
            </Link>
            <a href="/truco.html" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'transparent', color: 'var(--text-soft)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 20px', textDecoration: 'none', fontSize: 13, fontFamily: FONT }}>
              Jugar rápido sin guardar
            </a>
          </div>
          </div>
        </div>
      </div>
    </>
  )
}
