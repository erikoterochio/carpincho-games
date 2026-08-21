import Link from 'next/link'
import TopNav from '@/components/TopNav'

const FONT = "'Ubuntu', sans-serif"

export default function WordlePage() {
  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={{ background: 'var(--bg)', minHeight: '100vh', fontFamily: FONT, color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>

        {/* Navbar */}
        <TopNav backHref="/" title="Wordle" />

        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <div style={{ maxWidth: 480, width: '100%', margin: '0 auto' }}>

          {/* Hero */}
          <div style={{
            background: 'linear-gradient(135deg, #14532d 0%, #15803d 55%, #22c55e 100%)',
            padding: '26px 20px 30px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', right: -30, top: -30, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
            <div style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', width: 96, height: 96, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 50 }}>🔤</span>
            </div>
            <div style={{ maxWidth: '58%' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, fontFamily: FONT }}>Carpincho Games</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: '#ffffff', lineHeight: 1, marginBottom: 10, fontFamily: FONT }}>Wordle</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.5, fontFamily: FONT }}>Adiviná la palabra en 6 intentos.</div>
            </div>
          </div>

          {/* Content */}
          <div style={{ padding: '24px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '18px 16px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.7 }}>
                Cada intento revela qué letras están en la palabra y en qué posición. Tenés 6 oportunidades para encontrarla.
              </div>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: 'var(--border)', color: 'var(--text-soft)', borderRadius: 12,
              padding: '14px 20px', fontSize: 14, fontWeight: 600, fontFamily: FONT,
              border: '1px solid #2a2448',
            }}>
              Próximamente en Ranchadapp
            </div>

          </div>
          </div>
        </div>
      </div>
    </>
  )
}
