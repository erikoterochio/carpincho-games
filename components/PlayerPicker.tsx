'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export type PickedPlayer = {
  user_id?: string
  guest_name?: string
  player_type: 'friend' | 'user' | 'guest'
  display_name: string
  username?: string
}

interface Props {
  myId: string
  selected: PickedPlayer[]
  onChange: (players: PickedPlayer[]) => void
}

const AVATAR_COLORS = ['#04447b','#065c6c','#7c3aed','#b45309','#0369a1','#be123c','#15803d']
const FONT = "'Ubuntu', sans-serif"

function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const initials = name?.substring(0, 2).toUpperCase() || '?'
  const color = AVATAR_COLORS[name?.charCodeAt(0) % AVATAR_COLORS.length] || '#04447b'
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.35, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
      {initials}
    </div>
  )
}

type Profile = { id: string; username: string; nombre: string; apellido: string }

function profileDisplayName(p: Profile) {
  return p.nombre ? `${p.nombre} ${p.apellido || ''}`.trim() : p.username
}

export default function PlayerPicker({ myId, selected, onChange }: Props) {
  const supabase = createClient()
  const [friends, setFriends] = useState<Profile[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [guestName, setGuestName] = useState('')
  const [tab, setTab] = useState<'friends' | 'search' | 'guest'>('friends')
  const searchTimer = useRef<NodeJS.Timeout | null>(null)

  const selectedIds = new Set(selected.filter(p => p.user_id).map(p => p.user_id!))

  useEffect(() => {
    if (!myId) return
    supabase
      .from('friendships')
      .select(`
        requester_id, addressee_id, status,
        requester:profiles!friendships_requester_id_fkey(id, username, nombre, apellido),
        addressee:profiles!friendships_addressee_id_fkey(id, username, nombre, apellido)
      `)
      .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`)
      .eq('status', 'accepted')
      .then(({ data }) => {
        if (!data) return
        const list: Profile[] = data.map((f: any) => {
          const isRequester = f.requester_id === myId
          return isRequester ? f.addressee : f.requester
        }).filter(Boolean)
        setFriends(list)
      })
  }, [myId])

  const handleSearch = (val: string) => {
    setSearchQuery(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!val.trim() || val.length < 2) { setSearchResults([]); return }
    searchTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, nombre, apellido')
        .ilike('username', `%${val}%`)
        .neq('id', myId)
        .limit(6)
      setSearchResults(data || [])
    }, 350)
  }

  const addUser = (p: Profile, type: 'friend' | 'user') => {
    if (selectedIds.has(p.id)) return
    onChange([...selected, { user_id: p.id, player_type: type, display_name: profileDisplayName(p), username: p.username }])
  }

  const addGuest = () => {
    const name = guestName.trim()
    if (!name) return
    onChange([...selected, { guest_name: name, player_type: 'guest', display_name: name }])
    setGuestName('')
  }

  const remove = (idx: number) => {
    const next = [...selected]
    next.splice(idx, 1)
    onChange(next)
  }

  const tabBtn = (id: typeof tab, label: string) => ({
    onClick: () => setTab(id),
    style: {
      flex: 1, padding: '8px 4px', textAlign: 'center' as const, fontSize: 12,
      fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
      color: tab === id ? '#c1c1c6' : '#706c7e',
      background: 'transparent', border: 'none',
      borderBottom: tab === id ? '2px solid #055074' : '2px solid transparent',
    }
  })

  return (
    <div>
      {/* Selected players */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {selected.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0d1a2e', border: '1px solid #1e3a5f', borderRadius: 20, padding: '4px 10px 4px 6px' }}>
              <Avatar name={p.display_name} size={22} />
              <span style={{ fontSize: 12, color: '#c1c1c6', fontFamily: FONT }}>{p.display_name}</span>
              {p.player_type === 'guest' && (
                <span style={{ fontSize: 9, color: '#706c7e', fontFamily: FONT }}>invitado</span>
              )}
              <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: '#706c7e', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 0 0 2px' }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1e1736', marginBottom: 10 }}>
        <button {...tabBtn('friends', `Amigos (${friends.length})`)}>Amigos ({friends.length})</button>
        <button {...tabBtn('search', 'Buscar usuario')}>Buscar usuario</button>
        <button {...tabBtn('guest', 'Invitado')}>Invitado</button>
      </div>

      {/* Tab: amigos */}
      {tab === 'friends' && (
        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
          {friends.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: '#706c7e', fontSize: 12, fontFamily: FONT }}>
              No tenés amigos todavía.{' '}
              <a href="/amigos" style={{ color: '#055074' }}>Agregá amigos</a>
            </div>
          ) : friends.map(p => {
            const alreadyIn = selectedIds.has(p.id)
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #1e1736' }}>
                <Avatar name={profileDisplayName(p)} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#c1c1c6', fontFamily: FONT }}>{profileDisplayName(p)}</div>
                  <div style={{ fontSize: 11, color: '#706c7e', fontFamily: FONT }}>@{p.username}</div>
                </div>
                {alreadyIn
                  ? <span style={{ fontSize: 11, color: '#4ade80', fontFamily: FONT }}>✓ Agregado</span>
                  : <button onClick={() => addUser(p, 'friend')} style={{ padding: '5px 12px', background: '#0d2a1e', color: '#4ade80', border: '1px solid #166534', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>+ Agregar</button>
                }
              </div>
            )
          })}
        </div>
      )}

      {/* Tab: buscar */}
      {tab === 'search' && (
        <div>
          <input
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Buscá por nombre de usuario..."
            style={{ width: '100%', padding: '9px 12px', background: '#080812', border: '1px solid #1e1736', borderRadius: 8, color: '#c1c1c6', fontSize: 13, fontFamily: FONT, boxSizing: 'border-box', outline: 'none' }}
          />
          <div style={{ maxHeight: 160, overflowY: 'auto', marginTop: 6 }}>
            {searchResults.map(p => {
              const alreadyIn = selectedIds.has(p.id)
              const isFriend = friends.some(f => f.id === p.id)
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #1e1736' }}>
                  <Avatar name={profileDisplayName(p)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#c1c1c6', fontFamily: FONT }}>{profileDisplayName(p)}</div>
                    <div style={{ fontSize: 11, color: '#706c7e', fontFamily: FONT }}>@{p.username}</div>
                  </div>
                  {alreadyIn
                    ? <span style={{ fontSize: 11, color: '#4ade80', fontFamily: FONT }}>✓ Agregado</span>
                    : <button onClick={() => addUser(p, isFriend ? 'friend' : 'user')} style={{ padding: '5px 12px', background: '#0d2a1e', color: '#4ade80', border: '1px solid #166534', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>+ Agregar</button>
                  }
                </div>
              )
            })}
            {searchQuery.length >= 2 && searchResults.length === 0 && (
              <div style={{ textAlign: 'center', padding: 12, color: '#706c7e', fontSize: 12, fontFamily: FONT }}>Sin resultados</div>
            )}
          </div>
        </div>
      )}

      {/* Tab: invitado */}
      {tab === 'guest' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={guestName}
            onChange={e => setGuestName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addGuest()}
            placeholder="Nombre del invitado..."
            style={{ flex: 1, padding: '9px 12px', background: '#080812', border: '1px solid #1e1736', borderRadius: 8, color: '#c1c1c6', fontSize: 13, fontFamily: FONT, outline: 'none' }}
          />
          <button
            onClick={addGuest}
            disabled={!guestName.trim()}
            style={{ padding: '9px 16px', background: guestName.trim() ? '#055074' : '#1e1736', color: guestName.trim() ? '#c1c1c6' : '#706c7e', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: guestName.trim() ? 'pointer' : 'default', fontFamily: FONT }}
          >
            Agregar
          </button>
        </div>
      )}
    </div>
  )
}
