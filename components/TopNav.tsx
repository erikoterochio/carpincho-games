'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ThemeToggle from './ThemeToggle'

const FONT = "'Ubuntu', sans-serif"

export default function TopNav({
  backHref, onBack, title, icon, actions, sticky = false,
}: {
  backHref?: string
  onBack?: () => void
  title: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  sticky?: boolean
}) {
  const router = useRouter()

  const back = (
    <button
      onClick={() => (onBack ? onBack() : backHref ? router.push(backHref) : router.back())}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', color: 'var(--text-soft)' }}
      aria-label="Volver"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )

  return (
    <nav
      style={{
        background: 'var(--bg)', borderBottom: '1px solid var(--border)',
        padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10,
        maxWidth: 480, margin: '0 auto',
        ...(sticky ? { position: 'sticky' as const, top: 0, zIndex: 10 } : {}),
      }}
    >
      {back}
      {icon}
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: FONT, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {title}
      </div>
      <ThemeToggle size={17} />
      {actions}
    </nav>
  )
}
