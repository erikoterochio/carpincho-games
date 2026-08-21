import Link from 'next/link'
import TopNav from '@/components/TopNav'

const FONT = "'Ubuntu', sans-serif"

export default function BerenjenPage() {
  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={{ background: 'var(--bg)', minHeight: '100vh', fontFamily: FONT, color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>

        <TopNav backHref="/" title="Berenjena" />

        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <div style={{ maxWidth: 480, width: '100%', margin: '0 auto' }}>
          <div style={{ background: 'linear-gradient(135deg, #3b0764 0%, #7c3aed 55%, #a855f7 100%)', padding: '26px 20px 30px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', right: -30, top: -30, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
            <div style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', width: 96, height: 96, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 50 }}>🍆</span>
            </div>
            <div style={{ maxWidth: '58%' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, fontFamily: FONT }}>Carpincho Games</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: '#ffffff', lineHeight: 1, marginBottom: 10, fontFamily: FONT }}>Berenjena</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.5, fontFamily: FONT }}>El juego de cartas más adictivo para grupos.</div>
            </div>
          </div>

          <div style={{ padding: '24px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '18px 16px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.7 }}>Jugá Berenjena con tus amigos. Cada ronda suma — el que llega a cero pierde.</div>
            </div>
            <a href="/berenjena.html" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#7c3aed', color: '#ffffff', borderRadius: 12, padding: '14px 20px', textDecoration: 'none', fontSize: 15, fontWeight: 700, fontFamily: FONT }}>
              🍆 Jugar Berenjena
            </a>
            <Link href="/registrar-partida?game=berenjena" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'transparent', color: 'var(--text-soft)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 20px', textDecoration: 'none', fontSize: 14, fontWeight: 600, fontFamily: FONT }}>
              📋 Registrar partida
            </Link>
          </div>
          </div>
        </div>
      </div>
    </>
  )
}
