'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

// ── Inline style constants ─────────────────────────────────────────
const S = {
  page: { background: '#0b2659', minHeight: '100vh', fontFamily: "'Ubuntu', sans-serif", paddingBottom: '40px' } as React.CSSProperties,
  nav: { background: '#04447b', padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } as React.CSSProperties,
  navTitle: { fontSize: '15px', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' } as React.CSSProperties,
  backBtn: { fontSize: '12px', color: '#01050F', background: '#c1c1c6', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontWeight: 700, fontFamily: "'Ubuntu', sans-serif" } as React.CSSProperties,
  content: { maxWidth: '480px', margin: '0 auto', padding: '16px 18px' } as React.CSSProperties,
  section: { background: '#ffffff', border: '2px solid #04447b', borderRadius: '14px', marginBottom: '12px', overflow: 'hidden' } as React.CSSProperties,
  sectionH: { padding: '12px 16px', borderBottom: '1px solid #e6f0fb', background: '#f0f7ff' } as React.CSSProperties,
  sectionT: { fontSize: '13px', fontWeight: 700, color: '#0b2659' } as React.CSSProperties,
  sectionBody: { padding: '14px 16px' } as React.CSSProperties,
  inp: { width: '100%', padding: '10px 13px', background: '#f3f6fa', color: '#01050F', border: '1.5px solid #c8d8ec', borderRadius: '8px', fontSize: '14px', fontFamily: "'Ubuntu', sans-serif", outline: 'none', boxSizing: 'border-box' } as React.CSSProperties,
  userRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid #edf2f7' } as React.CSSProperties,
  userRowLast: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0 0' } as React.CSSProperties,
  userInfo: { flex: 1 } as React.CSSProperties,
  userName: { fontSize: '14px', fontWeight: 700, color: '#0b2659' } as React.CSSProperties,
  userHandle: { fontSize: '11px', color: '#5a7898' } as React.CSSProperties,
  btnAdd: { padding: '7px 14px', background: '#f0fdf4', color: '#16a34a', border: '1.5px solid #86efac', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: "'Ubuntu', sans-serif", whiteSpace: 'nowrap' } as React.CSSProperties,
  btnPending: { padding: '7px 14px', background: '#fefce8', color: '#a16207', border: '1.5px solid #fde68a', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'default', whiteSpace: 'nowrap' } as React.CSSProperties,
  btnAccept: { padding: '7px 12px', background: '#f0fdf4', color: '#16a34a', border: '1.5px solid #86efac', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: "'Ubuntu', sans-serif" } as React.CSSProperties,
  btnReject: { padding: '7px 10px', background: '#ffe4e6', color: '#be123c', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: "'Ubuntu', sans-serif" } as React.CSSProperties,
  btnRemove: { padding: '7px 12px', background: '#ffe4e6', color: '#be123c', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: "'Ubuntu', sans-serif", whiteSpace: 'nowrap' } as React.CSSProperties,
  emptyMsg: { textAlign: 'center', padding: '20px', color: '#5a7898', fontSize: '13px' } as React.CSSProperties,
}

const AVATAR_COLORS = ['#04447b','#065c6c','#7c3aed','#b45309','#0369a1','#be123c','#15803d']

function Avatar({ name, size = 38 }: { name: string; size?: number }) {
  const initials = name?.substring(0, 2).toUpperCase() || '?'
  const color = AVATAR_COLORS[name?.charCodeAt(0) % AVATAR_COLORS.length] || '#04447b'
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.35, fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden' }}>
      {initials}
    </div>
  )
}

type Profile = { id: string; username: string; nombre: string; apellido: string; avatar_url?: string }
type Friendship = { id: string; requester_id: string; addressee_id: string; status: string; profile: Profile }

export default function AmigosPage() {
  const supabase = createClient()
  const router = useRouter()

  const [myId, setMyId] = useState('')
  const [activeTab, setActiveTab] = useState<'amigos'|'solicitudes'>('amigos')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [friends, setFriends] = useState<Friendship[]>([])
  const [requests, setRequests] = useState<Friendship[]>([])
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const searchTimer = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setMyId(user.id)
      loadFriendships(user.id)
    })
  }, [])

  const loadFriendships = async (userId: string) => {
    setLoading(true)
    const { data } = await supabase
      .from('friendships')
      .select(`id, requester_id, addressee_id, status,
        requester:profiles!friendships_requester_id_fkey(id, username, nombre, apellido, avatar_url),
        addressee:profiles!friendships_addressee_id_fkey(id, username, nombre, apellido, avatar_url)`)
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)

    if (data) {
      const accepted: Friendship[] = []
      const pending: Friendship[] = []
      const sentSet = new Set<string>()

      data.forEach((f: any) => {
        const isRequester = f.requester_id === userId
        const otherProfile = isRequester ? f.addressee : f.requester

        if (f.status === 'accepted') {
          accepted.push({ ...f, profile: otherProfile })
        } else if (f.status === 'pending') {
          if (!isRequester) {
            pending.push({ ...f, profile: otherProfile })
          } else {
            sentSet.add(f.addressee_id)
          }
        }
      })

      setFriends(accepted)
      setRequests(pending)
      setSentIds(sentSet)
    }
    setLoading(false)
  }

  const handleSearch = (val: string) => {
    setSearchQuery(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!val.trim() || val.length < 2) { setSearchResults([]); return }
    searchTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, nombre, apellido, avatar_url')
        .ilike('username', `%${val}%`)
        .neq('id', myId)
        .limit(6)
      setSearchResults(data || [])
    }, 400)
  }

  const sendRequest = async (toId: string) => {
    await supabase.from('friendships').insert({ requester_id: myId, addressee_id: toId })
    setSentIds(prev => new Set(prev).add(toId))
  }

  const acceptRequest = async (friendshipId: string) => {
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)
    loadFriendships(myId)
  }

  const rejectRequest = async (friendshipId: string) => {
    await supabase.from('friendships').delete().eq('id', friendshipId)
    loadFriendships(myId)
  }

  const removeFriend = async (friendshipId: string) => {
    await supabase.from('friendships').delete().eq('id', friendshipId)
    loadFriendships(myId)
  }

  const friendIds = new Set(friends.map(f => f.profile?.id))

  const displayName = (p: Profile) => p?.nombre ? `${p.nombre} ${p.apellido || ''}`.trim() : p?.username || '?'

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={S.page}>

        {/* Navbar */}
        <nav style={S.nav}>
          <div style={S.navTitle}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="#fff" strokeWidth="2"/><circle cx="9" cy="7" r="4" stroke="#fff" strokeWidth="2"/><path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="#fff" strokeWidth="2"/><path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="#fff" strokeWidth="2"/></svg>
            Amigos
          </div>
          <button style={S.backBtn} onClick={() => router.push('/')}>← Inicio</button>
        </nav>

        <div style={S.content}>

          {/* Buscar */}
          <div style={S.section}>
            <div style={S.sectionH}><span style={S.sectionT}>Buscar usuarios</span></div>
            <div style={S.sectionBody}>
              <input
                style={S.inp}
                type="text"
                placeholder="Buscá por nombre de usuario..."
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
              />
              {searchResults.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  {searchResults.map((p, i) => {
                    const isFriend = friendIds.has(p.id)
                    const isPending = sentIds.has(p.id)
                    const isLast = i === searchResults.length - 1
                    return (
                      <div key={p.id} style={isLast ? S.userRowLast : S.userRow}>
                        <Avatar name={displayName(p)} />
                        <div style={S.userInfo}>
                          <div style={S.userName}>{displayName(p)}</div>
                          <div style={S.userHandle}>@{p.username}</div>
                        </div>
                        {isFriend
                          ? <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>✓ Amigo</span>
                          : isPending
                          ? <button style={S.btnPending} disabled>Pendiente</button>
                          : <button style={S.btnAdd} onClick={() => sendRequest(p.id)}>+ Agregar</button>
                        }
                      </div>
                    )
                  })}
                </div>
              )}
              {searchQuery.length >= 2 && searchResults.length === 0 && (
                <div style={{ ...S.emptyMsg, paddingTop: '12px' }}>No se encontraron usuarios</div>
              )}
            </div>
          </div>

          {/* Lista + Solicitudes */}
          <div style={S.section}>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e6f0fb' }}>
              {(['amigos', 'solicitudes'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{ flex: 1, padding: '10px', textAlign: 'center', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: activeTab === tab ? '#0b2659' : '#5a7898', background: 'transparent', border: 'none', borderBottom: activeTab === tab ? '2px solid #04447b' : '2px solid transparent', fontFamily: "'Ubuntu', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  {tab === 'amigos' ? `Mis amigos (${friends.length})` : (
                    <>
                      Solicitudes
                      {requests.length > 0 && <span style={{ background: '#be123c', color: '#fff', fontSize: '9px', padding: '1px 6px', borderRadius: '20px' }}>{requests.length}</span>}
                    </>
                  )}
                </button>
              ))}
            </div>

            <div style={S.sectionBody}>
              {loading ? (
                <div style={S.emptyMsg}>Cargando...</div>
              ) : activeTab === 'amigos' ? (
                friends.length === 0
                  ? <div style={S.emptyMsg}>Todavía no tenés amigos. ¡Buscá usuarios arriba!</div>
                  : friends.map((f, i) => (
                    <div key={f.id} style={i === friends.length - 1 ? S.userRowLast : S.userRow}>
                      <Avatar name={displayName(f.profile)} />
                      <div style={S.userInfo}>
                        <div style={S.userName}>{displayName(f.profile)}</div>
                        <div style={S.userHandle}>@{f.profile?.username}</div>
                      </div>
                      <button style={S.btnRemove} onClick={() => removeFriend(f.id)}>✕ Eliminar</button>
                    </div>
                  ))
              ) : (
                requests.length === 0
                  ? <div style={S.emptyMsg}>No tenés solicitudes pendientes</div>
                  : requests.map((r, i) => (
                    <div key={r.id} style={i === requests.length - 1 ? S.userRowLast : S.userRow}>
                      <Avatar name={displayName(r.profile)} />
                      <div style={S.userInfo}>
                        <div style={S.userName}>{displayName(r.profile)}</div>
                        <div style={S.userHandle}>@{r.profile?.username}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button style={S.btnAccept} onClick={() => acceptRequest(r.id)}>✓ Aceptar</button>
                        <button style={S.btnReject} onClick={() => rejectRequest(r.id)}>✕</button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}