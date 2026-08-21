export default function DashboardPage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>
      <div style={{ background: 'var(--bg)', minHeight: '100vh', fontFamily: "'Ubuntu', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ maxWidth: '360px', width: '100%', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', background: 'var(--border)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5z" stroke="var(--text-soft)" strokeWidth="1.8" strokeLinejoin="round"/><path d="M2 17l10 5 10-5" stroke="var(--text-soft)" strokeWidth="1.8" strokeLinejoin="round"/><path d="M2 12l10 5 10-5" stroke="var(--text-soft)" strokeWidth="1.8" strokeLinejoin="round"/></svg>
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginBottom: '10px' }}>En construcción</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-soft)', lineHeight: 1.6, marginBottom: '28px' }}>
            Tu perfil y estadísticas están en camino.<br />Pronto vas a poder ver tus ranchadas, historial de juegos y mucho más.
          </p>
          <a href="/" style={{ display: 'inline-block', background: '#055074', color: '#fff', fontSize: '14px', fontWeight: 700, padding: '12px 28px', borderRadius: '10px', textDecoration: 'none', fontFamily: "'Ubuntu', sans-serif" }}>
            Volver al inicio
          </a>
        </div>
      </div>
    </>
  )
}