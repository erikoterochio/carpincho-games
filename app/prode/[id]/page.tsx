'use client'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { computeGroupStandings, computeBestThirds } from '@/lib/prode-standings'
import type { TeamStat } from '@/lib/prode-standings'
import { WC26_PLAYERS, WC26_TEAMS_ES } from '@/lib/wc26-players'

const RED = '#D4001A'
const NAVY = '#002B7F'
const GOLD = '#C8950A'
const BORDER = '#E5E7EB'
const TEXT = '#111111'
const MUTED = '#6B7280'
const STAGE1_DEADLINE = new Date('2026-06-11T19:00:00Z')
const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
const FONT_NORMAL = "'FWC2026', 'Ubuntu', sans-serif"
const FONT_BLACK  = "'FWC2026Black', 'Ubuntu', sans-serif"
const FONT_COND   = "'FWC2026UltraCond', 'Ubuntu', sans-serif"

const LIVE_STATUSES = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'])

// FIFA rankings June 2026 (lower number = better rank)
const FIFA_RANKS: Record<string, number> = {
  'Argentina': 1, 'France': 2, 'Spain': 3, 'England': 4, 'Brazil': 5,
  'Portugal': 6, 'Netherlands': 7, 'Germany': 8, 'Belgium': 9, 'Croatia': 10,
  'Italy': 11, 'Uruguay': 12, 'Colombia': 13, 'Morocco': 14, 'United States': 15,
  'Mexico': 16, 'Japan': 17, 'Denmark': 19, 'Switzerland': 20, 'Senegal': 21,
  'South Korea': 22, 'Korea Republic': 22, 'Australia': 23, 'Canada': 24,
  'Ukraine': 25, 'Austria': 26, 'Ecuador': 27, 'Serbia': 28, 'Iran': 29,
  'Sweden': 32, 'Nigeria': 33, 'Czech Republic': 34, 'Poland': 35,
  'Turkey': 37, 'Hungary': 39, 'Peru': 40, 'Norway': 41, 'Egypt': 43,
  'Venezuela': 44, 'Algeria': 45, 'Chile': 46,
  'Ivory Coast': 47, "Côte d'Ivoire": 47,
  'Scotland': 48, 'Romania': 49, 'Slovakia': 50, 'Greece': 51,
  'DR Congo': 52, 'Paraguay': 53, 'Panama': 54, 'Tunisia': 55,
  'Bosnia-Herzegovina': 56, 'Bosnia': 56, 'Saudi Arabia': 57, 'South Africa': 58,
  'Cameroon': 59, 'Ghana': 62, 'Bolivia': 64, 'Albania': 68,
  'Cape Verde': 71, 'Honduras': 72, 'Uzbekistan': 74, 'Qatar': 77,
  'Iraq': 78, 'Jordan': 79, 'Costa Rica': 80, 'Haiti': 89,
  'New Zealand': 91, 'Curacao': 93,
}


const REVELATION_TEAMS_ES = [
  'República Checa','Escocia','Túnez','Congo RD','Uzbekistán','Catar','Irak',
  'Sudáfrica','Arabia Saudita','Jordania','Bosnia y Herzegovina','Cabo Verde',
  'Ghana','Curazao','Haití','Nueva Zelanda',
]

const BONUS_FIELDS: Array<{key: string; label: string; pts: number; type: 'player'|'team'|'revelation'|'match'}> = [
  { key: 'balon_oro',      label: 'Balón de Oro',       pts: 15, type: 'player' },
  { key: 'guante_oro',     label: 'Guante de Oro',      pts: 15, type: 'player' },
  { key: 'botin_oro',      label: 'Botín de Oro',       pts: 15, type: 'player' },
  { key: 'fair_play',      label: 'Fair Play',           pts: 15, type: 'team' },
  { key: 'revelacion',     label: 'Equipo Revelación',   pts: 15, type: 'revelation' },
  { key: 'mayor_goleada',  label: 'Mayor Goleada',       pts: 15, type: 'match' },
]

const ABBREV: Record<string, string> = {
  'Argentina':'ARG','Brazil':'BRA','France':'FRA','England':'ENG','Germany':'GER','Spain':'ESP',
  'Portugal':'POR','Netherlands':'NED','Belgium':'BEL','Croatia':'CRO','Italy':'ITA','Uruguay':'URU',
  'Colombia':'COL','United States':'USA','Mexico':'MEX','Canada':'CAN','Morocco':'MAR','Japan':'JPN',
  'Australia':'AUS','South Korea':'KOR','Korea Republic':'KOR','South Africa':'RSA',
  'Saudi Arabia':'SAU','Iran':'IRN','Nigeria':'NGA','Senegal':'SEN','Egypt':'EGY','Ghana':'GHA',
  'Cameroon':'CMR','Ivory Coast':'CIV','Côte d\'Ivoire':'CIV','Tunisia':'TUN','Algeria':'ALG',
  'New Zealand':'NZL','Switzerland':'SUI','Denmark':'DEN','Sweden':'SWE','Poland':'POL',
  'Serbia':'SRB','Austria':'AUT','Hungary':'HUN','Turkey':'TUR','Ukraine':'UKR','Scotland':'SCO',
  'Paraguay':'PAR','Ecuador':'ECU','Venezuela':'VEN','Bolivia':'BOL','Peru':'PER','Chile':'CHI',
  'Costa Rica':'CRC','Honduras':'HON','Panama':'PAN','Qatar':'QAT','Iraq':'IRQ','Jordan':'JOR',
  'Uzbekistan':'UZB','Czech Republic':'CZE','Slovakia':'SVK','Romania':'ROU','Greece':'GRE',
  'Bosnia-Herzegovina':'BIH','Bosnia':'BIH','Albania':'ALB','Norway':'NOR',
  'DR Congo':'COD','Cape Verde':'CPV','Curacao':'CUW','Haiti':'HAI',
}
function abbrev(name: string) { return ABBREV[name] ?? name.substring(0, 3).toUpperCase() }

type Tab = 'home' | 'predecir' | 'fixture' | 'posiciones' | 'tabla' | 'reglamento' | 'info' | 'admin'

type Standing = {
  group_name: string
  team_id: number
  team_name: string
  team_logo: string | null
  rank: number
  played: number
  win: number
  draw: number
  lose: number
  goals_for: number
  goals_against: number
  goal_diff: number
  points: number
}
type Tournament = { id: string; name: string; code: string; stage1_deadline: string; admin_id: string }
type Participant = {
  user_id: string; paid: boolean
  profiles: { username: string; nombre?: string; apellido?: string } | null
  pick_count?: number
}
type Match = {
  id: string; home_team: string; away_team: string; home_flag: string; away_flag: string
  kickoff: string; stage: string; group_name: string | null; sort_order: number
  home_score: number | null; away_score: number | null; status: string
  venue: string | null
}
type UserPick = { match_id: string; home_score: number; away_score: number; user_id: string }
type KoMatchNode = {
  id: string; home: TeamStat | null; away: TeamStat | null
  homeLabel: string; awayLabel: string
  winner: TeamStat | null; loser: TeamStat | null; isTied: boolean
  kickoff?: string; venue?: string
}

const STAGE_LABEL: Record<string, string> = {
  group: 'Fase de Grupos', r32: '16avos', r16: '8vos',
  qf: 'Cuartos', sf: 'Semis', '3rd': '3°/4°', final: 'Final',
}

function calcScore(pick: UserPick, match: Match) {
  if (match.home_score === null || match.away_score === null) return null
  const ph = pick.home_score, pa = pick.away_score, rh = match.home_score, ra = match.away_score
  if (ph === rh && pa === ra) return 12
  const ok = Math.sign(ph - pa) === Math.sign(rh - ra)
  const one = ph === rh || pa === ra
  if (ok && one) return 7
  if (ok) return 5
  if (one) return 2
  return 0
}

function fmtKickoff(d: string) {
  const tz = 'America/Argentina/Buenos_Aires'
  const date = new Date(d).toLocaleDateString('es-AR', { timeZone: tz, day: '2-digit', month: '2-digit' })
  const time = new Date(d).toLocaleTimeString('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date} · ${time} hs`
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ background: 'rgba(255,255,255,0.92)', border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '16px 18px', backdropFilter: 'blur(4px)', ...style }}>
    {children}
  </div>
)

function BonusSection({ initialBonus, bonusVersion, onSave }: {
  initialBonus: Record<string, string>
  bonusVersion: number
  onSave: (b: Record<string, string>) => void
}) {
  const [local, setLocal] = React.useState<Record<string, string>>(initialBonus)
  const [saved, setSaved] = React.useState(false)

  React.useEffect(() => { setLocal(initialBonus) }, [bonusVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  const upd = (key: string, val: string) => setLocal(p => ({ ...p, [key]: val }))

  const handleSave = () => {
    onSave(local)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Card style={{ padding: '12px 16px' }}>
      <datalist id="players-list">{WC26_PLAYERS.map(p => <option key={p} value={p} />)}</datalist>
      <datalist id="teams-list">{WC26_TEAMS_ES.map(t => <option key={t} value={t} />)}</datalist>
      <datalist id="revelation-list">{REVELATION_TEAMS_ES.map(t => <option key={t} value={t} />)}</datalist>
      {BONUS_FIELDS.map(f => (
        <div key={f.key} style={{ padding: '9px 0', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: FONT_NORMAL, fontSize: 12, fontWeight: 600, color: TEXT }}>{f.label}</div>
              <div style={{ fontFamily: FONT_NORMAL, fontSize: 9, color: MUTED }}>+{f.pts} pts</div>
            </div>
            {f.type === 'match' ? (
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  key={`${f.key}_home-${bonusVersion}`}
                  list="teams-list"
                  defaultValue={local[`${f.key}_home`] ?? ''}
                  onChange={e => upd(`${f.key}_home`, e.target.value)}
                  placeholder="Local"
                  autoComplete="off"
                  style={{ width: 110, padding: '6px 8px', border: `1.5px solid ${BORDER}`, borderRadius: 8, fontFamily: FONT_NORMAL, fontSize: 11, color: TEXT, outline: 'none', background: '#fafafa' }}
                />
                <input
                  key={`${f.key}_score-${bonusVersion}`}
                  defaultValue={local[`${f.key}_score`] ?? ''}
                  onChange={e => upd(`${f.key}_score`, e.target.value.replace(/[^0-9-]/g, '').slice(0, 5))}
                  placeholder="X-Y"
                  style={{ width: 50, padding: '6px 6px', border: `1.5px solid ${BORDER}`, borderRadius: 8, fontFamily: FONT_NORMAL, fontSize: 11, color: TEXT, outline: 'none', background: '#fafafa', textAlign: 'center' }}
                />
                <input
                  key={`${f.key}_away-${bonusVersion}`}
                  list="teams-list"
                  defaultValue={local[`${f.key}_away`] ?? ''}
                  onChange={e => upd(`${f.key}_away`, e.target.value)}
                  placeholder="Visitante"
                  autoComplete="off"
                  style={{ width: 110, padding: '6px 8px', border: `1.5px solid ${BORDER}`, borderRadius: 8, fontFamily: FONT_NORMAL, fontSize: 11, color: TEXT, outline: 'none', background: '#fafafa' }}
                />
              </div>
            ) : (
              <input
                key={`${f.key}-${bonusVersion}`}
                list={f.type === 'player' ? 'players-list' : f.type === 'revelation' ? 'revelation-list' : 'teams-list'}
                defaultValue={local[f.key] ?? ''}
                onChange={e => upd(f.key, e.target.value)}
                placeholder="Buscar..."
                autoComplete="off"
                style={{ width: 160, padding: '6px 10px', border: `1.5px solid ${BORDER}`, borderRadius: 8, fontFamily: FONT_NORMAL, fontSize: 12, color: TEXT, outline: 'none', background: '#fafafa' }}
              />
            )}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <button
          onClick={handleSave}
          style={{ padding: '8px 20px', background: saved ? '#10b981' : TEXT, color: '#fff', border: 'none', borderRadius: 8, fontFamily: FONT_NORMAL, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'background 0.25s' }}
        >{saved ? '✓ Guardado' : 'Guardar'}</button>
      </div>
    </Card>
  )
}

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('home')
  const [user, setUser] = useState<any>(null)
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [allPicks, setAllPicks] = useState<UserPick[]>([])
  const [adminAllPicks, setAdminAllPicks] = useState<UserPick[]>([])
  const [myEditPicks, setMyEditPicks] = useState<Record<string, {h:string;a:string}>>({})
  const [saveStatus, setSaveStatus] = useState<'idle'|'saving'|'saved'>('idle')
  const picksEditRef = useRef<Record<string, {h:string;a:string}>>({})
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({}) // kept for cleanup only
  const [loading, setLoading] = useState(true)
  const [standings, setStandings] = useState<Standing[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [isParticipant, setIsParticipant] = useState(false)
  const [pointsOpen, setPointsOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(GROUPS))
  const [koEditPicks, setKoEditPicks] = useState<Record<string, {h:string; a:string; pen?:'h'|'a'}>>({})
  const koPicksRef = useRef<Record<string, {h:string; a:string; pen?:'h'|'a'}>>({})
  const liveRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [bonus, setBonus] = useState<Record<string, string>>({})
  const [bonusVersion, setBonusVersion] = useState(0)
  const [openRounds, setOpenRounds] = useState<Set<string>>(new Set())
  const toggleRound = (label: string) => setOpenRounds(prev => {
    const next = new Set(prev)
    if (next.has(label)) next.delete(label); else next.add(label)
    return next
  })

  useEffect(() => {
    if (!id) return
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      const [{ data: t }, { data: ps }, { data: ms }, { data: st }] = await Promise.all([
        supabase.from('prode_tournaments').select('*').eq('id', id).maybeSingle(),
        supabase.from('prode_participants').select('user_id, paid, profiles(username, nombre, apellido)').eq('tournament_id', id),
        supabase.from('prode_matches').select('*').order('sort_order'),
        supabase.from('prode_standings').select('*').order('group_name').order('rank'),
      ])
      setTournament(t)
      const matchList = (ms ?? []) as Match[]
      setMatches(matchList)
      setStandings((st ?? []) as Standing[])
      if (user && ps) {
        setIsParticipant(!!(ps as any[]).find(p => p.user_id === user.id))
        const { data: picks } = await supabase
          .from('prode_stage1_picks').select('match_id,home_score,away_score,user_id').eq('tournament_id', id)
        const allP = (picks ?? []) as UserPick[]
        setAllPicks(allP)
        const pm: Record<string, {h:string;a:string}> = {}
        for (const p of allP.filter(pk => pk.user_id === user.id)) {
          pm[p.match_id] = { h: String(p.home_score ?? ''), a: String(p.away_score ?? '') }
        }
        setMyEditPicks(pm)
        picksEditRef.current = pm
        setParticipants((ps as any[]).map(p => ({ ...p, pick_count: allP.filter(pk => pk.user_id === p.user_id).length })))

        // Admin: fetch all picks bypassing RLS (anon client only sees own picks)
        if ((t as any)?.admin_id === user.id) {
          fetch(`/api/prode/${id}/all-picks`)
            .then(r => r.json())
            .then((allAdminPicks: UserPick[]) => {
              if (!Array.isArray(allAdminPicks)) return
              setAdminAllPicks(allAdminPicks)
              setParticipants(prev => prev.map(p => ({
                ...p,
                pick_count: allAdminPicks.filter(pk => pk.user_id === p.user_id).length,
              })))
            })
            .catch(() => {})
        }
      } else {
        setParticipants((ps ?? []) as any[])
      }
      setLoading(false)

      // Auto-sync if admin and no matches loaded yet
      if (user && t && (t as any).admin_id === user.id && matchList.length === 0) {
        fetch('/api/prode/sync', { method: 'POST' })
          .then(r => r.json())
          .then(async json => {
            if (json.synced > 0) {
              const { data: ms2 } = await supabase.from('prode_matches').select('*').order('sort_order')
              setMatches((ms2 ?? []) as Match[])
            }
          }).catch(() => {})
      }

      // Auto-refresh live scores every 60s while a match is in progress
      const hasLive = matchList.some(m => LIVE_STATUSES.has(m.status))
      if (hasLive) startLiveRefresh()
    }
    load()
    return () => stopLiveRefresh()
  }, [id])

  useEffect(() => {
    if (!user?.id || !id) return
    try {
      const saved = localStorage.getItem(`prode_bonus_${id}_${user.id}`)
      if (saved) { setBonus(JSON.parse(saved)); setBonusVersion(v => v + 1) }
    } catch {}
  }, [user?.id, id])

  const stopLiveRefresh = () => {
    if (liveRefreshRef.current) { clearInterval(liveRefreshRef.current); liveRefreshRef.current = null }
  }

  const startLiveRefresh = () => {
    stopLiveRefresh()
    liveRefreshRef.current = setInterval(async () => {
      const res = await fetch('/api/prode/live')
      const json = await res.json()
      if (!json.live?.length) { stopLiveRefresh(); return }
      // Merge live updates into local match list
      setMatches(prev => prev.map(m => {
        const live = json.live.find((l: any) => l.id === m.id)
        return live ? { ...m, home_score: live.home_score, away_score: live.away_score, status: live.status } : m
      }))
    }, 300_000)
  }

  const handleSync = async () => {
    setSyncing(true); setSyncMsg(null)
    const res = await fetch('/api/prode/sync', { method: 'POST' })
    const json = await res.json()
    if (json.synced != null) {
      const parts = [`✓ ${json.synced} partidos`]
      if (json.standingsSynced) parts.push(`${json.standingsSynced} posiciones`)
      setSyncMsg(parts.join(' · ') + ' sincronizados')
      const [{ data: ms }, { data: st }] = await Promise.all([
        supabase.from('prode_matches').select('*').order('sort_order'),
        supabase.from('prode_standings').select('*').order('group_name').order('rank'),
      ])
      setMatches((ms ?? []) as Match[])
      setStandings((st ?? []) as Standing[])
    } else {
      setSyncMsg(`Error: ${json.error}`)
    }
    setSyncing(false)
  }

  const handleJoin = async () => {
    if (!user) { router.push('/login'); return }
    const { error: e } = await supabase.from('prode_participants').insert({ tournament_id: id, user_id: user.id })
    if (!e || e.code === '23505') { setIsParticipant(true); window.location.reload() }
  }

  const myPickCount = useMemo(() =>
    Object.values(myEditPicks).filter(p => p.h !== '' && p.a !== '').length
  , [myEditPicks])

  const isDeadlinePast = new Date() >= STAGE1_DEADLINE
  const groupMatches = matches.filter(m => m.stage === 'group')
  const progress = groupMatches.length > 0 ? Math.round((myPickCount / groupMatches.length) * 100) : 0
  const isAdmin = user?.id === tournament?.admin_id

  const showSaved = useCallback(() => {
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 2000)
  }, [])

  const saveAllPicks = useCallback(async () => {
    if (!user) return
    const entries = Object.entries(picksEditRef.current).filter(([, v]) => v.h !== '' && v.a !== '')
    if (!entries.length) return
    setSaveStatus('saving')
    const rows = entries.map(([matchId, v]) => ({
      tournament_id: id,
      user_id: user.id,
      match_id: matchId,
      home_score: parseInt(v.h),
      away_score: parseInt(v.a),
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('prode_stage1_picks').upsert(rows, { onConflict: 'tournament_id,user_id,match_id' })
    if (!error) showSaved()
    else setSaveStatus('idle')
  }, [id, user, showSaved])

  const toggleGroup = (g: string) => setOpenGroups(prev => {
    const next = new Set(prev)
    if (next.has(g)) next.delete(g); else next.add(g)
    return next
  })

  const handlePickChange = (matchId: string, side: 'h'|'a', value: string) => {
    if (isDeadlinePast) return
    const cleaned = value.replace(/\D/g, '').slice(0, 2)
    const updated = { ...(picksEditRef.current[matchId] ?? { h: '', a: '' }), [side]: cleaned }
    picksEditRef.current[matchId] = updated
    setMyEditPicks(prev => ({ ...prev, [matchId]: updated }))
  }

  const handleKoPick = (matchId: string, side: 'h'|'a', value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 2)
    const current = koPicksRef.current[matchId] ?? { h: '', a: '' }
    const updated = { ...current, [side]: cleaned }
    koPicksRef.current[matchId] = updated
    setKoEditPicks(prev => ({ ...prev, [matchId]: updated }))
  }

  const handleKoPen = (matchId: string, winner: 'h'|'a') => {
    const current = koPicksRef.current[matchId] ?? { h: '', a: '' }
    const pen: 'h'|'a'|undefined = current.pen === winner ? undefined : winner
    const updated = { ...current, pen }
    koPicksRef.current[matchId] = updated
    setKoEditPicks(prev => ({ ...prev, [matchId]: { ...(prev[matchId] ?? { h:'', a:'' }), pen } }))
  }

  const handleBonusSave = (b: Record<string, string>) => {
    setBonus(b)
    if (user?.id && id) localStorage.setItem(`prode_bonus_${id}_${user.id}`, JSON.stringify(b))
  }

  const handleTogglePaid = async (targetUserId: string, currentPaid: boolean) => {
    const res = await fetch('/api/prode/mark-paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournament_id: id, user_id: targetUserId, paid: !currentPaid }),
    })
    if (res.ok) setParticipants(prev => prev.map(p => p.user_id === targetUserId ? { ...p, paid: !currentPaid } : p))
  }

  const leaderboard = participants.map(p => {
    const name = p.profiles?.nombre
      ? `${p.profiles.nombre} ${p.profiles.apellido ?? ''}`.trim()
      : p.profiles?.username ?? 'Jugador'
    const userPicks = allPicks.filter(pk => pk.user_id === p.user_id)
    const pts = isDeadlinePast
      ? userPicks.reduce((acc, pk) => { const m = matches.find(m => m.id === pk.match_id); return acc + (m ? (calcScore(pk, m) ?? 0) : 0) }, 0)
      : null
    return { user_id: p.user_id, name, pick_count: p.pick_count ?? 0, pts, paid: p.paid }
  }).sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0) || (b.pick_count ?? 0) - (a.pick_count ?? 0))

  const TABS: { key: Tab; label: string }[] = [
    { key: 'home', label: 'Home' },
    { key: 'predecir', label: 'Predecir' },
    { key: 'fixture', label: 'Fixture' },
    { key: 'posiciones', label: 'Posiciones' },
    { key: 'tabla', label: 'Tabla' },
    { key: 'reglamento', label: 'Reglamento' },
    { key: 'info', label: 'Info' },
    ...(isAdmin ? [{ key: 'admin' as Tab, label: '⚙ Admin' }] : []),
  ]

  const REVELATION_TEAMS = [
    'República Checa','Escocia','Túnez','RD del Congo','Uzbekistán','Qatar','Irak',
    'Sudáfrica','Arabia Saudita','Jordania','Bosnia y Herzegovina','Cabo Verde',
    'Ghana','Curazao','Haití','Nueva Zelanda',
  ]

  const groupByDate = (ms: Match[]) => {
    const map: Record<string, Match[]> = {}
    for (const m of ms) {
      const d = fmtDate(m.kickoff)
      if (!map[d]) map[d] = []
      map[d].push(m)
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }

  const allGroupStandings = useMemo(() => {
    const result: Record<string, TeamStat[]> = {}
    for (const g of GROUPS) {
      const gms = matches.filter(m => m.group_name === g).sort((a, b) => a.sort_order - b.sort_order)
      if (gms.length) result[g] = computeGroupStandings(gms, myEditPicks, FIFA_RANKS)
    }
    return result
  }, [matches, myEditPicks])

  const bestThirds = useMemo(() => computeBestThirds(allGroupStandings, FIFA_RANKS), [allGroupStandings])

  const homeMatches = useMemo(() => {
    const tz = 'America/Argentina/Buenos_Aires'
    const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: tz })
    const matchDateIso = (m: Match) => new Date(m.kickoff).toLocaleDateString('en-CA', { timeZone: tz })
    const allDates = [...new Set(matches.map(matchDateIso))].sort()
    const futureDates = allDates.filter(d => d >= todayIso)
    const datesToShow = new Set(futureDates.slice(0, 2))
    return matches
      .filter(m => datesToShow.has(matchDateIso(m)) || LIVE_STATUSES.has(m.status))
      .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
  }, [matches])


  const bracketData = useMemo(() => {
    const getGrp = (pos: 1|2, grp: string): TeamStat | null => allGroupStandings[grp]?.[pos-1] ?? null
    const get3rd = (idx: number): TeamStat | null => bestThirds[idx] ?? null

    const getWinner = (id: string, home: TeamStat | null, away: TeamStat | null): TeamStat | null => {
      if (!home || !away) return null
      const p = koEditPicks[id]
      if (!p || p.h === '' || p.a === '') return null
      const h = parseInt(p.h), a = parseInt(p.a)
      if (h > a) return home
      if (a > h) return away
      if (p.pen === 'h') return home
      if (p.pen === 'a') return away
      return null
    }
    const getLoser = (id: string, home: TeamStat | null, away: TeamStat | null): TeamStat | null => {
      const w = getWinner(id, home, away)
      return (w && home && away) ? (w === home ? away : home) : null
    }
    const mkNode = (id: string, home: TeamStat | null, away: TeamStat | null, homeLabel: string, awayLabel: string, kickoff?: string, venue?: string): KoMatchNode => {
      const p = koEditPicks[id] ?? { h: '', a: '' }
      const filled = p.h !== '' && p.a !== ''
      return { id, home, away, homeLabel, awayLabel, winner: getWinner(id, home, away), loser: getLoser(id, home, away), isTied: filled && parseInt(p.h) === parseInt(p.a), kickoff, venue }
    }

    const koByStage = (stage: string) =>
      matches.filter(m => m.stage === stage).sort((a, b) => a.sort_order - b.sort_order)

    const r32Ms = koByStage('r32')
    const r16Ms = koByStage('r16')
    const qfMs  = koByStage('qf')
    const sfMs  = koByStage('sf')
    const thirdMs = koByStage('3rd')
    const finalMs = koByStage('final')

    const r32 = [
      mkNode('ko-r32-0',  getGrp(1,'A'), getGrp(2,'B'), '1° A','2° B', r32Ms[0]?.kickoff, r32Ms[0]?.venue ?? undefined),
      mkNode('ko-r32-1',  getGrp(1,'B'), getGrp(2,'A'), '1° B','2° A', r32Ms[1]?.kickoff, r32Ms[1]?.venue ?? undefined),
      mkNode('ko-r32-2',  getGrp(1,'C'), getGrp(2,'D'), '1° C','2° D', r32Ms[2]?.kickoff, r32Ms[2]?.venue ?? undefined),
      mkNode('ko-r32-3',  getGrp(1,'D'), getGrp(2,'C'), '1° D','2° C', r32Ms[3]?.kickoff, r32Ms[3]?.venue ?? undefined),
      mkNode('ko-r32-4',  getGrp(1,'E'), getGrp(2,'F'), '1° E','2° F', r32Ms[4]?.kickoff, r32Ms[4]?.venue ?? undefined),
      mkNode('ko-r32-5',  getGrp(1,'F'), getGrp(2,'E'), '1° F','2° E', r32Ms[5]?.kickoff, r32Ms[5]?.venue ?? undefined),
      mkNode('ko-r32-6',  getGrp(1,'G'), getGrp(2,'H'), '1° G','2° H', r32Ms[6]?.kickoff, r32Ms[6]?.venue ?? undefined),
      mkNode('ko-r32-7',  getGrp(1,'H'), getGrp(2,'G'), '1° H','2° G', r32Ms[7]?.kickoff, r32Ms[7]?.venue ?? undefined),
      mkNode('ko-r32-8',  getGrp(1,'I'), getGrp(2,'J'), '1° I','2° J', r32Ms[8]?.kickoff, r32Ms[8]?.venue ?? undefined),
      mkNode('ko-r32-9',  getGrp(1,'J'), getGrp(2,'I'), '1° J','2° I', r32Ms[9]?.kickoff, r32Ms[9]?.venue ?? undefined),
      mkNode('ko-r32-10', getGrp(1,'K'), getGrp(2,'L'), '1° K','2° L', r32Ms[10]?.kickoff, r32Ms[10]?.venue ?? undefined),
      mkNode('ko-r32-11', getGrp(1,'L'), getGrp(2,'K'), '1° L','2° K', r32Ms[11]?.kickoff, r32Ms[11]?.venue ?? undefined),
      mkNode('ko-r32-12', get3rd(0), get3rd(1), '3° mejor 1','3° mejor 2', r32Ms[12]?.kickoff, r32Ms[12]?.venue ?? undefined),
      mkNode('ko-r32-13', get3rd(2), get3rd(3), '3° mejor 3','3° mejor 4', r32Ms[13]?.kickoff, r32Ms[13]?.venue ?? undefined),
      mkNode('ko-r32-14', get3rd(4), get3rd(5), '3° mejor 5','3° mejor 6', r32Ms[14]?.kickoff, r32Ms[14]?.venue ?? undefined),
      mkNode('ko-r32-15', get3rd(6), get3rd(7), '3° mejor 7','3° mejor 8', r32Ms[15]?.kickoff, r32Ms[15]?.venue ?? undefined),
    ]
    const r16 = Array.from({length:8}, (_,i) => mkNode(`ko-r16-${i}`, r32[i*2].winner, r32[i*2+1].winner, `Gan. P${49+i*2}`,`Gan. P${50+i*2}`, r16Ms[i]?.kickoff, r16Ms[i]?.venue ?? undefined))
    const qf  = Array.from({length:4}, (_,i) => mkNode(`ko-qf-${i}`, r16[i*2].winner, r16[i*2+1].winner, `Gan. R16-${i*2+1}`,`Gan. R16-${i*2+2}`, qfMs[i]?.kickoff, qfMs[i]?.venue ?? undefined))
    const sf  = Array.from({length:2}, (_,i) => mkNode(`ko-sf-${i}`, qf[i*2].winner, qf[i*2+1].winner, `Gan. QF-${i*2+1}`,`Gan. QF-${i*2+2}`, sfMs[i]?.kickoff, sfMs[i]?.venue ?? undefined))
    const third = mkNode('ko-3rd', sf[0].loser, sf[1].loser, 'Per. SF-1','Per. SF-2', thirdMs[0]?.kickoff, thirdMs[0]?.venue ?? undefined)
    const final = mkNode('ko-final', sf[0].winner, sf[1].winner, 'Gan. SF-1','Gan. SF-2', finalMs[0]?.kickoff, finalMs[0]?.venue ?? undefined)
    return { r32, r16, qf, sf, third, final }
  }, [allGroupStandings, bestThirds, koEditPicks, matches])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_NORMAL, background: '#f5f5f5' }}>
      <div style={{ color: MUTED }}>Cargando...</div>
    </div>
  )

  if (!tournament) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_NORMAL, background: '#f5f5f5' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: TEXT, fontSize: 15, marginBottom: 12 }}>Torneo no encontrado.</div>
        <Link href="/prode" style={{ color: RED, fontSize: 13 }}>← Volver</Link>
      </div>
    </div>
  )

  const GroupMatchRow = ({ m }: { m: Match }) => {
    const p = myEditPicks[m.id] ?? { h: '', a: '' }
    const filled = p.h !== '' && p.a !== ''
    const ko = new Date(m.kickoff)
    const date = ko.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit' })
    const time = ko.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false })
    return (
      <div style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 0' }}>
          {/* Fecha + Hora */}
          <div style={{ flexShrink: 0, width: 36, textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: MUTED, fontFamily: FONT_NORMAL, lineHeight: 1.4 }}>{date}</div>
            <div style={{ fontSize: 8, color: MUTED, fontFamily: FONT_NORMAL, lineHeight: 1.4 }}>{time}</div>
          </div>
          {/* Local: nombre + bandera */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, minWidth: 0 }}>
            <span style={{ fontFamily: FONT_NORMAL, fontSize: 11, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{abbrev(m.home_team)}</span>
            <img src={m.home_flag} alt="" style={{ width: 22, height: 15, borderRadius: 2, objectFit: 'cover', border: '1px solid #ddd', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </div>
          {/* Marcadores */}
          <input type="text" inputMode="numeric" className="grp-inp"
            value={p.h} onChange={e => handlePickChange(m.id, 'h', e.target.value)}
            disabled={isDeadlinePast} placeholder="—"
            style={{ borderColor: filled ? RED : BORDER, color: filled ? RED : TEXT }}
          />
          <span style={{ color: MUTED, fontFamily: FONT_NORMAL, fontSize: 10, flexShrink: 0 }}>-</span>
          <input type="text" inputMode="numeric" className="grp-inp"
            value={p.a} onChange={e => handlePickChange(m.id, 'a', e.target.value)}
            disabled={isDeadlinePast} placeholder="—"
            style={{ borderColor: filled ? RED : BORDER, color: filled ? RED : TEXT }}
          />
          {/* Visitante: bandera + nombre */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <img src={m.away_flag} alt="" style={{ width: 22, height: 15, borderRadius: 2, objectFit: 'cover', border: '1px solid #ddd', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <span style={{ fontFamily: FONT_NORMAL, fontSize: 11, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{abbrev(m.away_team)}</span>
          </div>
        </div>
        {m.venue && (
          <div style={{ fontSize: 8, color: MUTED, fontFamily: FONT_NORMAL, paddingBottom: 4, paddingLeft: 41, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: 0.2 }}>
            📍 {m.venue}
          </div>
        )}
      </div>
    )
  }

  const GroupStandingsTable = ({ standings }: { standings: TeamStat[] }) => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: 'rgba(0,0,0,0.04)', borderBottom: `1px solid ${BORDER}` }}>
          {['#','Equipo','J','G','E','P','DG','Pts'].map((h, i) => (
            <th key={h} style={{ padding: i <= 1 ? '5px 6px' : '5px 3px', textAlign: i <= 1 ? 'left' : 'center', fontFamily: FONT_NORMAL, fontSize: 9, color: MUTED, fontWeight: 700, letterSpacing: 0.3 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {standings.map((t, i) => (
          <tr key={t.name} style={{ background: i < 2 ? 'rgba(16,185,129,0.05)' : i === 2 ? 'rgba(234,179,8,0.05)' : undefined, borderBottom: `1px solid ${BORDER}` }}>
            <td style={{ padding: '5px 6px', textAlign: 'center', fontFamily: FONT_NORMAL, fontWeight: 700, fontSize: 11, color: i < 2 ? '#16a34a' : i === 2 ? '#ca8a04' : TEXT }}>{i + 1}</td>
            <td style={{ padding: '5px 6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {t.flag && <img src={t.flag} alt="" style={{ width: 18, height: 12, borderRadius: 2, objectFit: 'cover', border: '1px solid #ddd', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />}
                <span style={{ fontFamily: FONT_NORMAL, fontWeight: 600, fontSize: 11, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 65 }}>{abbrev(t.name)}</span>
              </div>
            </td>
            <td style={{ padding: '5px 3px', textAlign: 'center', fontFamily: FONT_NORMAL, fontSize: 11, color: TEXT }}>{t.pj || '–'}</td>
            <td style={{ padding: '5px 3px', textAlign: 'center', fontFamily: FONT_NORMAL, fontSize: 11, color: TEXT }}>{t.pg || '–'}</td>
            <td style={{ padding: '5px 3px', textAlign: 'center', fontFamily: FONT_NORMAL, fontSize: 11, color: TEXT }}>{t.pe || '–'}</td>
            <td style={{ padding: '5px 3px', textAlign: 'center', fontFamily: FONT_NORMAL, fontSize: 11, color: TEXT }}>{t.pp || '–'}</td>
            <td style={{ padding: '5px 3px', textAlign: 'center', fontFamily: FONT_NORMAL, fontSize: 11, color: t.dg > 0 ? '#16a34a' : t.dg < 0 ? RED : TEXT }}>
              {t.pj > 0 ? (t.dg > 0 ? `+${t.dg}` : t.dg) : '–'}
            </td>
            <td style={{ padding: '5px 6px', textAlign: 'center', fontFamily: FONT_NORMAL, fontWeight: 700, fontSize: 12, color: TEXT }}>{t.pj > 0 ? t.pts : '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  const koMatchLabel = (id: string): string => {
    if (id === 'ko-final') return 'FINAL'
    if (id === 'ko-3rd') return '3°/4° Puesto'
    if (id.startsWith('ko-r32-')) return `P${49 + parseInt(id.slice(7))}`
    if (id.startsWith('ko-r16-')) return `R16-${+id.slice(7) + 1}`
    if (id.startsWith('ko-qf-')) return `QF-${+id.slice(6) + 1}`
    if (id.startsWith('ko-sf-')) return `SF-${+id.slice(6) + 1}`
    return id
  }

  const KoMatchCard = ({ m }: { m: KoMatchNode }) => {
    const pick = koEditPicks[m.id] ?? { h: '', a: '' }
    const filled = pick.h !== '' && pick.a !== ''
    const noTeams = !m.home || !m.away
    const label = koMatchLabel(m.id)
    return (
      <div style={{ background: 'rgba(255,255,255,0.92)', border: m.id === 'ko-final' ? `1.5px solid ${GOLD}` : `1.5px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ background: m.id === 'ko-final' ? GOLD : m.id === 'ko-3rd' ? '#8B6914' : NAVY, padding: m.id === 'ko-final' ? '8px 12px' : '5px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: FONT_BLACK, fontSize: m.id === 'ko-final' ? 13 : 10, color: '#fff', letterSpacing: 0.5 }}>{label}</span>
          {m.winner && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {m.winner.flag && <img src={m.winner.flag} alt="" style={{ width: 14, height: 10, borderRadius: 1, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.3)', flexShrink: 0 }} />}
              <span style={{ fontFamily: FONT_NORMAL, fontSize: 9, color: '#6ee7b7' }}>{abbrev(m.winner.name)}</span>
            </div>
          )}
        </div>
        {(m.kickoff || m.venue) && (
          <div style={{ fontSize: 9, color: MUTED, fontFamily: FONT_NORMAL, padding: '3px 10px', borderBottom: `1px solid ${BORDER}`, background: '#fafafa', display: 'flex', gap: 6, overflow: 'hidden' }}>
            {m.kickoff && (
              <span style={{ flexShrink: 0 }}>
                {new Date(m.kickoff).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit' })}
                {' · '}
                {new Date(m.kickoff).toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false })} hs
              </span>
            )}
            {m.venue && (
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📍 {m.venue}</span>
            )}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 10px' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, minWidth: 0 }}>
            {m.home ? (
              <>
                <span style={{ fontFamily: FONT_NORMAL, fontSize: 11, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{abbrev(m.home.name)}</span>
                <img src={m.home.flag} alt="" style={{ width: 20, height: 14, borderRadius: 2, objectFit: 'cover', border: '1px solid #ddd', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              </>
            ) : (
              <span style={{ fontSize: 9, color: MUTED, fontStyle: 'italic', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.homeLabel}</span>
            )}
          </div>
          <input type="text" inputMode="numeric" className="grp-inp"
            value={pick.h} onChange={e => handleKoPick(m.id, 'h', e.target.value)}
            disabled={noTeams} placeholder="—"
            style={{ borderColor: filled ? NAVY : BORDER, color: filled ? NAVY : TEXT }}
          />
          <span style={{ color: MUTED, fontFamily: FONT_NORMAL, fontSize: 10, flexShrink: 0 }}>-</span>
          <input type="text" inputMode="numeric" className="grp-inp"
            value={pick.a} onChange={e => handleKoPick(m.id, 'a', e.target.value)}
            disabled={noTeams} placeholder="—"
            style={{ borderColor: filled ? NAVY : BORDER, color: filled ? NAVY : TEXT }}
          />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            {m.away ? (
              <>
                <img src={m.away.flag} alt="" style={{ width: 20, height: 14, borderRadius: 2, objectFit: 'cover', border: '1px solid #ddd', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                <span style={{ fontFamily: FONT_NORMAL, fontSize: 11, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{abbrev(m.away.name)}</span>
              </>
            ) : (
              <span style={{ fontSize: 9, color: MUTED, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.awayLabel}</span>
            )}
          </div>
        </div>
        {m.isTied && !noTeams && (
          <div style={{ padding: '5px 10px', borderTop: `1px solid ${BORDER}`, background: '#fffbf0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, color: MUTED, fontFamily: FONT_NORMAL, flexShrink: 0 }}>PEN:</span>
            <button onClick={() => handleKoPen(m.id, 'h')} style={{ flex: 1, padding: '3px 6px', background: pick.pen === 'h' ? NAVY : 'transparent', color: pick.pen === 'h' ? '#fff' : TEXT, border: `1px solid ${pick.pen === 'h' ? NAVY : BORDER}`, borderRadius: 4, fontSize: 10, fontFamily: FONT_NORMAL, cursor: 'pointer' }}>
              {abbrev(m.home!.name)}
            </button>
            <button onClick={() => handleKoPen(m.id, 'a')} style={{ flex: 1, padding: '3px 6px', background: pick.pen === 'a' ? NAVY : 'transparent', color: pick.pen === 'a' ? '#fff' : TEXT, border: `1px solid ${pick.pen === 'a' ? NAVY : BORDER}`, borderRadius: 4, fontSize: 10, fontFamily: FONT_NORMAL, cursor: 'pointer' }}>
              {abbrev(m.away!.name)}
            </button>
          </div>
        )}
      </div>
    )
  }

  const MatchRow = ({ m }: { m: Match }) => {
    const isLive = LIVE_STATUSES.has(m.status)
    const isDone = ['FT', 'AET', 'PEN'].includes(m.status)
    const liveLabel = m.status === 'HT' ? 'DESCANSO' : m.status === 'ET' ? 'PRÓRROGA' : m.status === 'BT' ? 'PENALES' : 'EN VIVO'
    return (
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${BORDER}`, background: isLive ? 'rgba(16,185,129,0.04)' : undefined }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 12, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.home_team}</span>
          <img src={m.home_flag} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${BORDER}`, flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </div>
        <div style={{ padding: '0 12px', textAlign: 'center', flexShrink: 0, minWidth: 100 }}>
          {isDone ? (
            <span style={{ fontSize: 15, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK }}>{m.home_score} - {m.away_score}</span>
          ) : isLive ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#10b981', fontFamily: FONT_BLACK }}>{m.home_score ?? 0} - {m.away_score ?? 0}</span>
              <span style={{ fontSize: 9, color: '#10b981', fontFamily: FONT_NORMAL, display: 'flex', alignItems: 'center', gap: 3 }}>
                <span className="live-dot" />
                {liveLabel}
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 10, color: MUTED, fontFamily: FONT_NORMAL }}>{fmtKickoff(m.kickoff)}</span>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <img src={m.away_flag} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${BORDER}`, flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          <span style={{ fontSize: 12, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.away_team}</span>
        </div>
      </div>
    )
  }


  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 11, fontWeight: 900, color: TEXT, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12, fontFamily: FONT_BLACK }}>
      {children}
    </div>
  )

  const getDateLabel = (isoDate: string): string => {
    const tz = 'America/Argentina/Buenos_Aires'
    const today = new Date()
    const todayStr = today.toLocaleDateString('en-CA', { timeZone: tz })
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toLocaleDateString('en-CA', { timeZone: tz })
    if (isoDate === todayStr) return 'Hoy'
    if (isoDate === tomorrowStr) return 'Mañana'
    const [y, mo, d] = isoDate.split('-').map(Number)
    return new Date(y, mo - 1, d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  const HomeMatchCard = ({ m }: { m: Match }) => {
    const isLive = LIVE_STATUSES.has(m.status)
    const isDone = ['FT', 'AET', 'PEN'].includes(m.status)
    const liveLabel = m.status === 'HT' ? 'DESCANSO' : m.status === 'ET' ? 'PRÓRROGA' : m.status === 'BT' ? 'PENALES' : 'EN VIVO'
    const myPick = myEditPicks[m.id]
    const hasPick = !!(myPick && myPick.h !== '' && myPick.a !== '')
    const pickScore = hasPick
      ? calcScore({ match_id: m.id, home_score: parseInt(myPick.h), away_score: parseInt(myPick.a), user_id: '' }, m)
      : null

    const timeStr = new Date(m.kickoff).toLocaleTimeString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false,
    })
    const stageLabel = m.stage === 'group' ? `Grupo ${m.group_name}` : STAGE_LABEL[m.stage]

    const pickColor = pickScore === null ? MUTED
      : pickScore >= 12 ? '#10b981'
      : pickScore >= 7 ? '#0ea5e9'
      : pickScore >= 5 ? '#d97706'
      : pickScore >= 2 ? '#f97316'
      : RED
    const pickBg = isDone && pickScore !== null
      ? pickScore >= 12 ? '#f0fdf4' : pickScore >= 7 ? '#eff6ff' : pickScore >= 5 ? '#fffbeb' : pickScore >= 2 ? '#fff7ed' : '#fef2f2'
      : '#f3f4f6'
    const SCORE_LABELS: Record<number, string> = { 12: 'EXACTO', 7: 'RESULTADO+GOL', 5: 'PARCIAL', 2: 'UN GOL', 0: 'FALLASTE' }

    return (
      <div style={{ background: 'rgba(255,255,255,0.92)', border: `1.5px solid ${isLive ? '#10b981' : BORDER}`, borderRadius: 14, padding: '12px 16px', backdropFilter: 'blur(4px)', ...(isLive ? { boxShadow: '0 0 0 3px rgba(16,185,129,0.12)' } : {}) }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 900, color: NAVY, letterSpacing: 1, fontFamily: FONT_BLACK, textTransform: 'uppercase' }}>
            {stageLabel}
          </span>
          {isLive ? (
            <span style={{ fontSize: 10, color: '#10b981', display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONT_NORMAL, fontWeight: 700 }}>
              <span className="live-dot" />{liveLabel}
            </span>
          ) : isDone ? (
            <span style={{ fontSize: 10, color: MUTED, fontFamily: FONT_NORMAL, fontWeight: 600 }}>FINALIZADO</span>
          ) : (
            <span style={{ fontSize: 10, color: MUTED, fontFamily: FONT_NORMAL }}>{timeStr} hs</span>
          )}
        </div>

        {/* Match row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{abbrev(m.home_team)}</span>
            <img src={m.home_flag} alt="" style={{ width: 26, height: 19, borderRadius: 3, objectFit: 'cover', border: `1px solid ${BORDER}`, flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </div>
          <div style={{ padding: '0 10px', textAlign: 'center', flexShrink: 0, minWidth: 72 }}>
            {isDone ? (
              <span style={{ fontSize: 20, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK }}>{m.home_score} - {m.away_score}</span>
            ) : isLive ? (
              <span style={{ fontSize: 22, fontWeight: 900, color: '#10b981', fontFamily: FONT_BLACK }}>{m.home_score ?? 0} - {m.away_score ?? 0}</span>
            ) : (
              <span style={{ fontSize: 12, color: MUTED, fontFamily: FONT_NORMAL, fontWeight: 700 }}>VS</span>
            )}
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <img src={m.away_flag} alt="" style={{ width: 26, height: 19, borderRadius: 3, objectFit: 'cover', border: `1px solid ${BORDER}`, flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <span style={{ fontSize: 13, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{abbrev(m.away_team)}</span>
          </div>
        </div>

        {/* Pick row */}
        {user && isParticipant && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: pickBg, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: MUTED, fontFamily: FONT_NORMAL, flexShrink: 0 }}>Mi pick</span>
            <span style={{ flex: 1 }} />
            {hasPick ? (
              <>
                <span style={{ fontSize: 15, fontWeight: 900, color: isDone && pickScore !== null ? pickColor : TEXT, fontFamily: FONT_BLACK }}>
                  {myPick.h} - {myPick.a}
                </span>
                {isDone && pickScore !== null && (
                  <span style={{ fontSize: 10, fontWeight: 900, fontFamily: FONT_BLACK, color: '#fff', background: pickColor, padding: '2px 8px', borderRadius: 6 }}>
                    {pickScore > 0 ? `+${pickScore}` : '—'} · {SCORE_LABELS[pickScore] ?? ''}
                  </span>
                )}
                {isLive && (
                  <span style={{ fontSize: 10, color: '#10b981', fontFamily: FONT_NORMAL }}>
                    {pickScore !== null && pickScore > 0 ? `~+${pickScore} pts` : 'en juego'}
                  </span>
                )}
              </>
            ) : (
              <span style={{ fontSize: 11, color: MUTED, fontFamily: FONT_NORMAL, fontStyle: 'italic' }}>Sin predicción</span>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <style>{`
        @font-face { font-family: 'FWC2026'; src: url('/fonts/FWC2026-NormalRegular.77c3c249.ttf') format('truetype'); font-weight: 400; }
        @font-face { font-family: 'FWC2026'; src: url('/fonts/FWC2026-NormalBlack.2bd896c8.ttf') format('truetype'); font-weight: 900; }
        @font-face { font-family: 'FWC2026UltraCond'; src: url('/fonts/FWC2026-UltraCondensedBlack.8e6ba053.ttf') format('truetype'); font-weight: 900; }
        @font-face { font-family: 'FWC2026Black'; src: url('/fonts/FWC2026-NormalBlack.2bd896c8.ttf') format('truetype'); font-weight: 900; }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .t-page {
          min-height: 100vh; font-family: ${FONT_NORMAL};
          background-image: url('/images/fifa-26-background-light.png');
          background-repeat: repeat; background-size: 220px;
        }
        @media (min-width: 768px) { .t-page { background-size: 320px; } }
        .wrap { max-width: 1100px; margin: 0 auto; padding: 20px; }

        .tab-btn {
          padding: 14px 18px; background: transparent; border: none;
          border-bottom: 3px solid transparent; color: ${MUTED};
          font-family: ${FONT_BLACK}; font-size: 13px; font-weight: 900;
          cursor: pointer; transition: all 0.15s; margin-bottom: -1px; white-space: nowrap;
        }
        .tab-btn.active { border-bottom-color: ${RED}; color: ${RED}; }
        .tab-btn:hover:not(.active) { color: ${TEXT}; }

        .prog-bar { height: 8px; background: ${BORDER}; border-radius: 4px; overflow: hidden; }
        .prog-fill { height: 100%; background: ${RED}; border-radius: 4px; transition: width 0.4s; }

        .stage-chip {
          padding: 5px 12px; border-radius: 20px; border: 1.5px solid ${BORDER};
          font-family: ${FONT_BLACK}; font-size: 11px; font-weight: 900;
          color: ${MUTED}; background: rgba(255,255,255,0.8); cursor: default;
        }

        .fixture-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
        @media (min-width: 768px) { .fixture-grid { grid-template-columns: 1fr 1fr; } }

        .pts-row { display: flex; gap: 12px; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid ${BORDER}; }
        .pts-row:last-child { border-bottom: none; }

        .lb-row { display: flex; align-items: center; padding: 11px 18px; border-bottom: 1px solid ${BORDER}; }
        .lb-row:last-child { border-bottom: none; }

        @keyframes livePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        .live-dot { width: 6px; height: 6px; border-radius: 50%; background: #10b981; display: inline-block; animation: livePulse 1.2s ease-in-out infinite; flex-shrink: 0; }

        .st-table { width: 100%; border-collapse: collapse; }
        .st-table th { font-family: ${FONT_BLACK}; font-size: 10px; font-weight: 900; color: #fff; text-align: center; padding: 7px 4px; }
        .st-table th:first-child { text-align: left; padding-left: 14px; }
        .st-table td { font-family: ${FONT_NORMAL}; font-size: 12px; color: ${TEXT}; text-align: center; padding: 8px 4px; border-bottom: 1px solid ${BORDER}; }
        .st-table td:first-child { text-align: left; padding-left: 14px; }
        .st-table tr:last-child td { border-bottom: none; }
        .st-table tr:nth-child(1) td, .st-table tr:nth-child(2) td { background: rgba(16,185,129,0.05); }

        /* Inline prediction */
        .grp-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
        .grp-body { display: flex; flex-direction: column; }
        @media (min-width: 480px) { .grp-body { flex-direction: row; } }
        .grp-matches { flex: 1; padding: 8px 10px; display: flex; flex-direction: column; gap: 0; min-width: 0; }
        .grp-table-col { width: 100%; border-top: 1px solid ${BORDER}; padding: 6px 0; flex-shrink: 0; }
        @media (min-width: 480px) { .grp-table-col { width: 220px; border-top: none; border-left: 1px solid ${BORDER}; } }
        .grp-inp {
          width: 30px; height: 28px; text-align: center; background: #fafafa;
          border: 1.5px solid; border-radius: 6px; font-family: ${FONT_NORMAL};
          font-size: 14px; font-weight: 600; outline: none; -moz-appearance: textfield;
          transition: border-color 0.12s; flex-shrink: 0;
        }
        .grp-inp::-webkit-outer-spin-button,.grp-inp::-webkit-inner-spin-button{-webkit-appearance:none;}
        .grp-inp:focus { border-color: ${RED} !important; background: #fff0f1; }
        .grp-inp:disabled { opacity: 0.35; cursor: not-allowed; }
        .grp-thirds { display: grid; grid-template-columns: repeat(auto-fill,minmax(130px,1fr)); gap: 8px; margin-top: 12px; }
        .pred-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }

        .ko-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
        @media (min-width: 480px) { .ko-grid { grid-template-columns: 1fr 1fr; } }
      `}</style>

      <div className="t-page">

        {/* ── NAV ── */}
        <nav style={{ background: '#fff', borderBottom: `1px solid ${BORDER}`, boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px', height: 60, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/prode" style={{ color: MUTED, textDecoration: 'none', fontSize: 20, lineHeight: 1, flexShrink: 0 }}>←</Link>
            <img src="/images/fifa-26-emblem.png" alt="FIFA 26" style={{ height: 32, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tournament.name}</div>
              <div style={{ fontSize: 11, color: MUTED, fontFamily: FONT_NORMAL }}>
                Código: <span style={{ color: RED, fontWeight: 700 }}>{tournament.code}</span> · {participants.length} participantes · {matches.length} partidos
              </div>
            </div>
            {isAdmin && (
              <button
                onClick={handleSync} disabled={syncing}
                style={{ padding: '7px 14px', background: syncing ? '#eee' : TEXT, color: '#fff', border: 'none', borderRadius: 8, fontFamily: FONT_BLACK, fontSize: 11, fontWeight: 900, cursor: syncing ? 'default' : 'pointer', flexShrink: 0 }}
              >
                {syncing ? '⏳ Sync...' : '↻ Sync API'}
              </button>
            )}
          </div>
          {syncMsg && (
            <div style={{ background: syncMsg.startsWith('✓') ? '#f0fdf4' : '#fff0f1', color: syncMsg.startsWith('✓') ? '#16a34a' : RED, fontSize: 12, padding: '6px 20px', fontFamily: FONT_NORMAL, borderTop: `1px solid ${BORDER}` }}>
              {syncMsg}
            </div>
          )}
        </nav>

        {/* ── TABS ── */}
        <div style={{ background: 'rgba(255,255,255,0.9)', borderBottom: `1px solid ${BORDER}`, backdropFilter: 'blur(4px)', overflowX: 'auto', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px', display: 'flex' }}>
            {TABS.map(t => (
              <button key={t.key} className={`tab-btn${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>
        </div>

        <div className="wrap">

          {/* ── HOME ── */}
          {tab === 'home' && (
            <div style={{ maxWidth: 680, margin: '0 auto' }}>
              {homeMatches.length === 0 ? (
                <Card style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, marginBottom: 6 }}>Sin partidos próximos</div>
                  <div style={{ fontSize: 12, color: MUTED, fontFamily: FONT_NORMAL, lineHeight: 1.6 }}>No hay partidos programados para hoy ni el próximo día con fixture.</div>
                </Card>
              ) : (() => {
                const tz = 'America/Argentina/Buenos_Aires'
                const matchDateIso = (m: Match) => new Date(m.kickoff).toLocaleDateString('en-CA', { timeZone: tz })
                const byDate: Record<string, Match[]> = {}
                for (const m of homeMatches) {
                  const d = matchDateIso(m)
                  if (!byDate[d]) byDate[d] = []
                  byDate[d].push(m)
                }
                return (
                  <>
                    {Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, ms]) => (
                      <div key={date} style={{ marginBottom: 22 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                          <span style={{ fontSize: 12, fontWeight: 900, color: TEXT, letterSpacing: 1, textTransform: 'uppercase', fontFamily: FONT_BLACK }}>
                            {getDateLabel(date)}
                          </span>
                          <span style={{ fontSize: 11, color: MUTED, fontFamily: FONT_NORMAL }}>
                            · {new Date(ms[0].kickoff).toLocaleDateString('es-AR', { timeZone: tz, day: '2-digit', month: '2-digit' })}
                          </span>
                          {ms.some(m => LIVE_STATUSES.has(m.status)) && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#10b981', fontFamily: FONT_NORMAL }}>
                              <span className="live-dot" />EN VIVO
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {ms.map(m => <HomeMatchCard key={m.id} m={m} />)}
                        </div>
                      </div>
                    ))}
                  </>
                )
              })()}
            </div>
          )}

          {/* ── PREDECIR ── */}
          {tab === 'predecir' && (
            <div style={{ maxWidth: 680, margin: '0 auto' }}>
              {!user ? (
                <Card style={{ textAlign: 'center', padding: 32 }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>⚽</div>
                  <div style={{ fontSize: 15, fontWeight: 900, fontFamily: FONT_BLACK, marginBottom: 8, color: TEXT }}>Iniciá sesión para predecir</div>
                  <Link href="/login" style={{ display: 'inline-block', padding: '10px 28px', background: RED, color: '#fff', fontFamily: FONT_BLACK, fontSize: 14, fontWeight: 900, borderRadius: 10, textDecoration: 'none' }}>Iniciar sesión</Link>
                </Card>
              ) : !isParticipant ? (
                <Card style={{ textAlign: 'center', padding: 32 }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>⚽</div>
                  <div style={{ fontSize: 15, fontWeight: 900, fontFamily: FONT_BLACK, marginBottom: 6, color: TEXT }}>¿Querés participar?</div>
                  <div style={{ fontSize: 13, color: MUTED, marginBottom: 20, fontFamily: FONT_NORMAL }}>Uníte al torneo para hacer tus predicciones.</div>
                  <button onClick={handleJoin} style={{ padding: '12px 32px', background: RED, color: '#fff', border: 'none', borderRadius: 10, fontFamily: FONT_BLACK, fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>Unirme</button>
                </Card>
              ) : (
                <>
                  {/* Progress */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: FONT_NORMAL, color: TEXT }}>Fase de grupos — Etapa I</div>
                      <Link href={`/prode/${id}/planilla`} target="_blank" style={{ fontSize: 11, color: MUTED, fontFamily: FONT_NORMAL, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, borderBottom: `1px dashed ${BORDER}` }}>
                        🖨 Planilla imprimible
                      </Link>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="prog-bar" style={{ width: 140 }}>
                        <div className="prog-fill" style={{ width: `${progress}%` }} />
                      </div>
                      <span style={{ fontSize: 12, color: MUTED, fontFamily: FONT_NORMAL }}>{myPickCount}/{groupMatches.length} predicciones</span>
                    </div>
                  </div>

                  {isDeadlinePast && (
                    <div style={{ background: '#fff0f1', borderRadius: 10, border: '1px solid #ffc0c5', padding: '10px 14px', marginBottom: 14, fontSize: 13, color: RED, fontWeight: 900, fontFamily: FONT_BLACK }}>
                      Las predicciones de la Etapa I están cerradas.
                    </div>
                  )}

                  {/* Groups with live standings */}
                  {groupMatches.length === 0 ? (
                    <Card style={{ textAlign: 'center', padding: 32 }}>
                      <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, marginBottom: 6 }}>
                        {isAdmin ? 'Cargando partidos...' : 'Sin partidos todavía'}
                      </div>
                      <div style={{ fontSize: 12, color: MUTED, fontFamily: FONT_NORMAL, lineHeight: 1.6 }}>
                        {isAdmin ? 'Sincronizando automáticamente desde la API.' : 'El admin debe sincronizar los partidos.'}
                      </div>
                    </Card>
                  ) : !GROUPS.some(g => matches.some(m => m.group_name === g)) ? (
                    <Card style={{ textAlign: 'center', padding: 32 }}>
                      <div style={{ fontSize: 28, marginBottom: 10 }}>🔄</div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, marginBottom: 6 }}>
                        {isAdmin ? 'Grupos sin asignar — hacé Sync API' : 'Grupos en proceso de sincronización'}
                      </div>
                      <div style={{ fontSize: 12, color: MUTED, fontFamily: FONT_NORMAL, lineHeight: 1.6, marginBottom: isAdmin ? 14 : 0 }}>
                        {isAdmin
                          ? 'El cron desactualizó los grupos. Presioná Sync API arriba para restaurarlos.'
                          : 'El admin está actualizando los datos. Volvé en unos minutos.'}
                      </div>
                      {isAdmin && (
                        <button
                          onClick={handleSync}
                          disabled={syncing}
                          style={{ padding: '10px 28px', background: syncing ? '#eee' : RED, color: '#fff', border: 'none', borderRadius: 10, fontFamily: FONT_BLACK, fontSize: 13, fontWeight: 900, cursor: syncing ? 'default' : 'pointer' }}
                        >
                          {syncing ? '⏳ Sincronizando...' : '↻ Sync API ahora'}
                        </button>
                      )}
                    </Card>
                  ) : (
                    <div style={{ paddingBottom: 100 }}>
                      <div className="grp-grid">
                        {GROUPS.filter(g => matches.some(m => m.group_name === g)).map(g => {
                          const gms = matches.filter(m => m.group_name === g).sort((a, b) => a.sort_order - b.sort_order)
                          const gSt = allGroupStandings[g] ?? []
                          const filled = gms.filter(m => myEditPicks[m.id]?.h !== '' && myEditPicks[m.id]?.a !== '').length
                          const isOpen = openGroups.has(g)
                          return (
                            <div key={g} style={{ background: 'rgba(255,255,255,0.92)', border: `1.5px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
                              <div
                                onClick={() => toggleGroup(g)}
                                style={{ background: NAVY, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
                              >
                                <span style={{ color: '#fff', fontFamily: FONT_BLACK, fontSize: 12, fontWeight: 900, letterSpacing: 1 }}>GRUPO {g}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span style={{ color: filled === gms.length ? '#6ee7b7' : 'rgba(255,255,255,0.5)', fontSize: 10, fontFamily: FONT_NORMAL }}>{filled}/{gms.length}</span>
                                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, lineHeight: 1 }}>{isOpen ? '▲' : '▼'}</span>
                                </div>
                              </div>
                              {isOpen && (
                                <div className="grp-body">
                                  <div className="grp-matches">
                                    {gms.map(m => <GroupMatchRow key={m.id} m={m} />)}
                                  </div>
                                  <div className="grp-table-col">
                                    <GroupStandingsTable standings={gSt} />
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {bestThirds.length > 0 && (
                        <Card style={{ marginTop: 14 }}>
                          <SectionTitle>Mejores terceros clasificados ({bestThirds.length}/8)</SectionTitle>
                          <div className="grp-thirds">
                            {bestThirds.map((t, i) => (
                              <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', background: '#f9fafb', borderRadius: 8, border: `1px solid ${BORDER}` }}>
                                <span style={{ fontSize: 11, fontWeight: 900, color: '#ca8a04', fontFamily: FONT_BLACK, width: 14, flexShrink: 0 }}>{i + 1}</span>
                                {t.flag && <img src={t.flag} alt="" style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover', border: '1px solid #eee', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />}
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 11, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{abbrev(t.name)}</div>
                                  <div style={{ fontSize: 9, color: MUTED, fontFamily: FONT_NORMAL }}>{t.pts}pts · DG {t.dg > 0 ? `+${t.dg}` : t.dg}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </Card>
                      )}

                      {/* Llave proyectada */}
                      {Object.keys(allGroupStandings).length > 0 && (
                        <div style={{ marginTop: 20 }}>
                          <div style={{ fontSize: 11, fontWeight: 900, color: TEXT, letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: FONT_BLACK, marginBottom: 6 }}>
                            Llave proyectada
                          </div>
                          <div style={{ fontSize: 11, color: MUTED, fontFamily: FONT_NORMAL, marginBottom: 16 }}>
                            Completá los marcadores para armar tu llave hasta la Final. Si hay empate, elegí el ganador por penales.
                          </div>
                          {([
                            { label: '16avos de Final', matches: bracketData.r32 },
                            { label: '8vos de Final', matches: bracketData.r16 },
                            { label: 'Cuartos de Final', matches: bracketData.qf },
                            { label: 'Semifinales', matches: bracketData.sf },
                            { label: 'Tercer Puesto', matches: [bracketData.third] },
                            { label: 'Final', matches: [bracketData.final] },
                          ] as { label: string; matches: KoMatchNode[] }[]).map(({ label, matches }) => {
                            const isOpen = openRounds.has(label)
                            return (
                              <div key={label} style={{ marginBottom: 8 }}>
                                <div
                                  onClick={() => toggleRound(label)}
                                  style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isOpen ? 8 : 0, cursor: 'pointer', userSelect: 'none' }}
                                >
                                  <div style={{ flex: 1, height: 1, background: BORDER }} />
                                  <span style={{ fontFamily: FONT_BLACK, fontSize: 13, fontWeight: 900, color: TEXT, letterSpacing: 0.5, whiteSpace: 'nowrap' }}>
                                    {label.toUpperCase()}
                                  </span>
                                  <span style={{ fontSize: 10, color: MUTED }}>{isOpen ? '▲' : '▼'}</span>
                                  <div style={{ flex: 1, height: 1, background: BORDER }} />
                                </div>
                                {isOpen && (
                                  <div className={matches.length > 1 ? 'ko-grid' : undefined}>
                                    {matches.map((m, i) => <KoMatchCard key={i} m={m} />)}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Predicciones extra */}
                      {isParticipant && (
                        <div style={{ marginTop: 20 }}>
                          <div style={{ fontSize: 11, fontWeight: 900, color: TEXT, letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: FONT_BLACK, marginBottom: 6 }}>
                            Predicciones extra
                          </div>
                          <div style={{ fontSize: 11, color: MUTED, fontFamily: FONT_NORMAL, marginBottom: 14 }}>
                            15 puntos cada una. Se guardan localmente.
                          </div>
                          <BonusSection
                            initialBonus={bonus}
                            bonusVersion={bonusVersion}
                            onSave={handleBonusSave}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {/* Barra sticky de guardado */}
              {!isDeadlinePast && isParticipant && (
                <div style={{
                  position: 'fixed', bottom: 0, left: 0, right: 0,
                  background: 'rgba(255,255,255,0.97)',
                  borderTop: `1px solid ${BORDER}`,
                  padding: '10px 20px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  zIndex: 99,
                }}>
                  <div>
                    <div style={{ fontSize: 12, color: TEXT, fontFamily: FONT_NORMAL, fontWeight: 600 }}>
                      {myPickCount}/{groupMatches.length} predicciones cargadas
                    </div>
                    <div className="prog-bar" style={{ width: 110, marginTop: 4 }}>
                      <div className="prog-fill" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <button
                    onClick={saveAllPicks}
                    disabled={saveStatus === 'saving' || myPickCount === 0}
                    style={{
                      padding: '10px 22px',
                      background: saveStatus === 'saved' ? '#10b981' : TEXT,
                      color: '#fff', border: 'none', borderRadius: 8,
                      fontFamily: FONT_NORMAL, fontSize: 13, fontWeight: 600,
                      cursor: saveStatus === 'saving' ? 'wait' : myPickCount === 0 ? 'default' : 'pointer',
                      transition: 'background 0.25s',
                      opacity: myPickCount === 0 ? 0.35 : 1,
                    }}
                  >
                    {saveStatus === 'saving' ? 'Guardando...' : saveStatus === 'saved' ? '✓ Guardado' : 'Guardar predicciones'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── FIXTURE ── */}
          {tab === 'fixture' && (
            <div>
              {matches.length === 0 ? (
                <Card style={{ textAlign: 'center', padding: 32, maxWidth: 480, margin: '0 auto' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, marginBottom: 6 }}>No hay partidos cargados</div>
                  <div style={{ fontSize: 12, color: MUTED, fontFamily: FONT_NORMAL, marginBottom: isAdmin ? 16 : 0, lineHeight: 1.6 }}>
                    {isAdmin ? 'Presioná "↻ Sync API" en el header para cargar los 104 partidos del Mundial.' : 'El administrador del torneo debe sincronizar los partidos.'}
                  </div>
                  {isAdmin && (
                    <button onClick={handleSync} disabled={syncing} style={{ padding: '11px 28px', background: TEXT, color: '#fff', border: 'none', borderRadius: 10, fontFamily: FONT_BLACK, fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>
                      {syncing ? '⏳ Sincronizando...' : '↻ Sincronizar desde API'}
                    </button>
                  )}
                </Card>
              ) : (
                <>
                  {/* Group stage by date */}
                  {groupByDate(matches.filter(m => m.stage === 'group')).map(([date, ms]) => (
                    <div key={date} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 900, color: TEXT, letterSpacing: 1, textTransform: 'uppercase', fontFamily: FONT_BLACK, marginBottom: 8 }}>📅 {date}</div>
                      <div className="fixture-grid">
                        {ms.sort((a, b) => a.sort_order - b.sort_order).reduce<Match[][]>((rows, m, i) => {
                          if (i % 2 === 0) rows.push([])
                          rows[rows.length - 1].push(m)
                          return rows
                        }, []).map((pair, ri) => (
                          <Card key={ri} style={{ padding: '12px 14px' }}>
                            {pair.map((m, mi) => (
                              <div key={m.id} style={{ borderBottom: mi < pair.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                                <div style={{ fontSize: 9, color: MUTED, fontFamily: FONT_NORMAL, marginTop: mi > 0 ? 8 : 0, marginBottom: 4 }}>GRUPO {m.group_name}</div>
                                <MatchRow m={m} />
                              </div>
                            ))}
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Knockout stages */}
                  {(['r32','r16','qf','sf','3rd','final'] as const).map(stage => {
                    const ms = matches.filter(m => m.stage === stage).sort((a, b) => a.sort_order - b.sort_order)
                    if (!ms.length) return null
                    return (
                      <div key={stage} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 900, color: TEXT, letterSpacing: 1, textTransform: 'uppercase', fontFamily: FONT_BLACK, marginBottom: 8 }}>
                          🏆 {STAGE_LABEL[stage]}
                        </div>
                        <Card style={{ padding: '4px 14px' }}>
                          {ms.map(m => <MatchRow key={m.id} m={m} />)}
                        </Card>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          )}

          {/* ── POSICIONES ── */}
          {tab === 'posiciones' && (() => {
            const groups = GROUPS.filter(g => standings.some(s => s.group_name === g))
            if (groups.length === 0) return (
              <Card style={{ textAlign: 'center', padding: 32, maxWidth: 480, margin: '0 auto' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, marginBottom: 6 }}>Sin posiciones todavía</div>
                <div style={{ fontSize: 12, color: MUTED, fontFamily: FONT_NORMAL, lineHeight: 1.6 }}>
                  Las posiciones reales se cargan cuando el admin hace{' '}
                  <span style={{ fontWeight: 700 }}>↻ Sync API</span> durante el torneo.
                </div>
              </Card>
            )
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 12 }}>
                {groups.map(g => {
                  const rows = standings.filter(s => s.group_name === g)
                  return (
                    <Card key={g} style={{ padding: 0, overflow: 'hidden' }}>
                      <div style={{ background: NAVY, padding: '8px 14px' }}>
                        <span style={{ fontSize: 12, fontWeight: 900, color: '#fff', fontFamily: FONT_BLACK, letterSpacing: 1 }}>GRUPO {g}</span>
                      </div>
                      <table className="st-table">
                        <thead>
                          <tr style={{ background: TEXT }}>
                            <th style={{ minWidth: 130 }}>Equipo</th>
                            <th>J</th><th>G</th><th>E</th><th>P</th>
                            <th>GF</th><th>GC</th><th>DG</th>
                            <th style={{ color: GOLD }}>Pts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(s => (
                            <tr key={s.team_id}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                  {s.team_logo && (
                                    <img src={s.team_logo} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${BORDER}`, flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                  )}
                                  <span style={{ fontWeight: s.rank <= 2 ? 900 : 400, fontFamily: s.rank <= 2 ? FONT_BLACK : FONT_NORMAL }}>{s.team_name}</span>
                                </div>
                              </td>
                              <td>{s.played}</td>
                              <td>{s.win}</td>
                              <td>{s.draw}</td>
                              <td>{s.lose}</td>
                              <td>{s.goals_for}</td>
                              <td>{s.goals_against}</td>
                              <td style={{ color: s.goal_diff > 0 ? '#10b981' : s.goal_diff < 0 ? RED : TEXT }}>
                                {s.goal_diff > 0 ? `+${s.goal_diff}` : s.goal_diff}
                              </td>
                              <td style={{ fontWeight: 900, fontFamily: FONT_BLACK, color: TEXT }}>{s.points}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Card>
                  )
                })}
              </div>
            )
          })()}

          {/* ── TABLA ── */}
          {tab === 'tabla' && (
            <div style={{ maxWidth: 680, margin: '0 auto' }}>
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '10px 18px', background: TEXT }}>
                  <div style={{ width: 32, fontSize: 10, fontWeight: 900, color: '#fff', fontFamily: FONT_BLACK }}>#</div>
                  <div style={{ flex: 1, fontSize: 10, fontWeight: 900, color: '#fff', fontFamily: FONT_BLACK }}>JUGADOR</div>
                  <div style={{ width: 72, textAlign: 'center', fontSize: 10, fontWeight: 900, color: '#fff', fontFamily: FONT_BLACK }}>PICKS</div>
                  <div style={{ width: 52, textAlign: 'center', fontSize: 10, fontWeight: 900, color: isDeadlinePast ? '#ffcc00' : '#fff', fontFamily: FONT_BLACK }}>PTS</div>
                </div>
                {leaderboard.length === 0 ? (
                  <div style={{ padding: '24px 18px', textAlign: 'center', color: MUTED, fontSize: 13, fontFamily: FONT_NORMAL }}>Nadie se unió todavía.</div>
                ) : leaderboard.map((p, i) => (
                  <div key={p.user_id} className="lb-row">
                    <div style={{ width: 32, fontSize: 14, fontWeight: 900, fontFamily: FONT_COND, color: i === 0 ? GOLD : i < 3 ? MUTED : '#ccc' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </div>
                    <div style={{ flex: 1, fontSize: 13, fontWeight: p.user_id === user?.id ? 900 : 400, color: p.user_id === user?.id ? RED : TEXT, fontFamily: p.user_id === user?.id ? FONT_BLACK : FONT_NORMAL }}>
                      {p.name}{p.user_id === user?.id ? ' (vos)' : ''}{p.user_id === tournament.admin_id ? ' 👑' : ''}
                    </div>
                    <div style={{ width: 72, textAlign: 'center', fontSize: 12, color: MUTED, fontFamily: FONT_NORMAL }}>
                      {p.pick_count}/{groupMatches.length || '?'}
                    </div>
                    <div style={{ width: 52, textAlign: 'center', fontSize: 15, fontWeight: 900, color: isDeadlinePast ? TEXT : MUTED, fontFamily: FONT_COND }}>
                      {isDeadlinePast ? (p.pts ?? 0) : '—'}
                    </div>
                  </div>
                ))}
              </Card>
              {!isDeadlinePast && (
                <div style={{ fontSize: 11, color: MUTED, textAlign: 'center', marginTop: 12, fontFamily: FONT_NORMAL }}>Los puntos se calculan a partir del 11 de junio.</div>
              )}
            </div>
          )}

          {/* ── REGLAMENTO ── */}
          {tab === 'reglamento' && (
            <div style={{ maxWidth: 760, margin: '0 auto' }}>
              <Card style={{ marginBottom: 12, background: TEXT, border: 'none', display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ fontSize: 40, lineHeight: 1 }}>🎻</div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', fontFamily: FONT_BLACK }}>Prode Violines Mundial 2026</div>
                  <div style={{ fontSize: 12, color: '#aaa', fontFamily: FONT_NORMAL }}>Reglamento Oficial · Carpincho Games SRL</div>
                </div>
              </Card>

              <Card style={{ marginBottom: 12 }}>
                <SectionTitle>Sistema de puntuación — Partidos</SectionTitle>
                <div style={{ fontSize: 11, color: MUTED, marginBottom: 14, fontFamily: FONT_NORMAL }}>Aplica para Etapa I y Etapa II</div>
                {[
                  { pts: 12, color: '#10b981', label: '¡Marcador exacto!', desc: 'Resultado y goles exactos (9 + 3 adicionales)' },
                  { pts: 7,  color: '#3b82f6', label: 'Resultado general',  desc: 'Ganador correcto + goles de un equipo' },
                  { pts: 5,  color: GOLD,      label: 'Resultado parcial',  desc: 'Ganador/empate correcto, goles no' },
                  { pts: 2,  color: '#f97316', label: 'Un goleador',        desc: 'Goles de un equipo bien, ganador no' },
                  { pts: 0,  color: MUTED,     label: 'Sin aciertos',       desc: '' },
                ].map(({ pts, color, label, desc }) => (
                  <div key={pts} className="pts-row">
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}18`, border: `1.5px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 15, fontWeight: 900, color, fontFamily: FONT_COND }}>{pts}</span>
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK }}>{label}</div>
                      {desc && <div style={{ fontSize: 11, color: MUTED, fontFamily: FONT_NORMAL }}>{desc}</div>}
                    </div>
                  </div>
                ))}
                {/* Example */}
                <div style={{ marginTop: 14, background: '#f9f9f9', borderRadius: 10, padding: '12px 14px', border: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: MUTED, fontFamily: FONT_BLACK, marginBottom: 8 }}>EJEMPLO — Resultado oficial: A 3 · B 1</div>
                  {[['3-1','12 pts','Exacto ✓'],['3-0','7 pts','Ganador + goles de A'],['2-0','5 pts','Ganador correcto'],['0-1','2 pts','Goles de B correctos'],['0-0','0 pts','Nada']].map(([pred,pts,note]) => (
                    <div key={pred} style={{ display: 'flex', gap: 10, padding: '4px 0', borderBottom: `1px solid ${BORDER}` }}>
                      <span style={{ width: 36, fontSize: 12, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK }}>{pred}</span>
                      <span style={{ width: 50, fontSize: 12, fontWeight: 900, color: RED, fontFamily: FONT_BLACK }}>{pts}</span>
                      <span style={{ fontSize: 11, color: MUTED, fontFamily: FONT_NORMAL }}>{note}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card style={{ marginBottom: 12 }}>
                <SectionTitle>Puntos especiales — Etapa I</SectionTitle>
                {[
                  ['6','Orden final correcto de todos los equipos en el grupo'],
                  ['6','Por equipo acertado que llegó a 16avos'],
                  ['10','Por equipo acertado que llegó a 8vos'],
                  ['14','Por equipo acertado que llegó a Cuartos'],
                  ['18','Por equipo acertado que llegó a Semis'],
                  ['25','Por acertar el 4to puesto'],
                  ['30','Por acertar el 3er puesto'],
                  ['35','Por acertar el Subcampeón'],
                  ['40','Por acertar el Campeón'],
                  ['15','Por cada acierto: Balón de Oro, Guante de Oro, Botín de Oro, Fair Play'],
                  ['15','Por el partido con la mayor goleada en fase de grupos'],
                  ['15','Por el Equipo Revelación (que llegue más lejos de la lista elegible)'],
                ].map(([pts, desc], i) => (
                  <div key={i} className="pts-row">
                    <div style={{ width: 36, height: 32, borderRadius: 8, background: `${GOLD}18`, border: `1px solid ${GOLD}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 900, color: GOLD, fontFamily: FONT_COND }}>{pts}</span>
                    </div>
                    <div style={{ fontSize: 12, color: TEXT, fontFamily: FONT_NORMAL, lineHeight: 1.5 }}>{desc}</div>
                  </div>
                ))}
                <div style={{ marginTop: 14, background: '#f9f9f9', borderRadius: 10, padding: '12px 14px', border: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: MUTED, fontFamily: FONT_BLACK, marginBottom: 8 }}>EQUIPOS ELEGIBLES A REVELACIÓN</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {REVELATION_TEAMS.map(t => (
                      <span key={t} style={{ padding: '3px 9px', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 20, fontSize: 11, color: TEXT, fontFamily: FONT_NORMAL }}>{t}</span>
                    ))}
                  </div>
                </div>
              </Card>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12, marginBottom: 12 }}>
                <Card>
                  <SectionTitle>Premios</SectionTitle>
                  {[['Etapa I (Pozo)','$32.500'],['Etapa II (Pozo)','$17.500'],['Inscripción','$70.000 · alias: erik.ars']].map(([l,v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}` }}>
                      <span style={{ fontSize: 12, color: MUTED, fontFamily: FONT_NORMAL }}>{l}</span>
                      <span style={{ fontSize: 12, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK }}>{v}</span>
                    </div>
                  ))}
                </Card>
                <Card>
                  <SectionTitle>Plazos</SectionTitle>
                  {[['Etapa I — cierre','Mié 11 jun · 16:00 ARG'],['Etapa II — cierre','1h antes de cada partido'],['Pago inscripción','Vie 10 jun 2026']].map(([l,v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: `1px solid ${BORDER}`, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 12, color: MUTED, fontFamily: FONT_NORMAL, flexShrink: 0 }}>{l}</span>
                      <span style={{ fontSize: 12, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, textAlign: 'right' }}>{v}</span>
                    </div>
                  ))}
                </Card>
              </div>
            </div>
          )}

          {/* ── INFO ── */}
          {tab === 'info' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14 }}>
              <Card>
                <SectionTitle>Información del torneo</SectionTitle>
                {[['Nombre',tournament.name],['Código',tournament.code],['Participantes',String(participants.length)],['Partidos cargados',String(matches.length)],['Cierre Etapa I','mié 11 jun · 16:00 (ARG)']].map(([l,v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${BORDER}` }}>
                    <span style={{ fontSize: 12, color: MUTED, fontFamily: FONT_NORMAL }}>{l}</span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK }}>{v}</span>
                  </div>
                ))}
                {isAdmin && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 11, color: MUTED, fontFamily: FONT_NORMAL, marginBottom: 10, lineHeight: 1.6 }}>
                      Como admin, podés sincronizar los partidos del Mundial desde la API haciendo click en el botón "↻ Sync API" del header. Los datos vienen de API-Football (FIFA 2026, league 1, season 2026).
                    </div>
                    <button onClick={handleSync} disabled={syncing} style={{ padding: '10px 20px', background: TEXT, color: '#fff', border: 'none', borderRadius: 10, fontFamily: FONT_BLACK, fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>
                      {syncing ? '⏳ Sincronizando...' : '↻ Sincronizar partidos desde API'}
                    </button>
                    {syncMsg && <div style={{ fontSize: 12, marginTop: 8, color: syncMsg.startsWith('✓') ? '#16a34a' : RED, fontFamily: FONT_NORMAL }}>{syncMsg}</div>}
                  </div>
                )}
              </Card>

              <Card>
                <SectionTitle>Participantes ({participants.length})</SectionTitle>
                {participants.map(p => (
                  <div key={p.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${BORDER}` }}>
                    <span style={{ fontSize: 13, fontWeight: p.user_id === user?.id ? 900 : 400, color: p.user_id === user?.id ? RED : TEXT, fontFamily: p.user_id === user?.id ? FONT_BLACK : FONT_NORMAL }}>
                      {p.profiles?.nombre ? `${p.profiles.nombre} ${p.profiles.apellido ?? ''}`.trim() : p.profiles?.username ?? 'Jugador'}
                      {p.user_id === user?.id ? ' (vos)' : ''}
                      {p.user_id === tournament.admin_id ? ' 👑' : ''}
                    </span>
                    <span style={{ fontSize: 11, color: p.paid ? '#10b981' : MUTED, fontWeight: 700, fontFamily: FONT_NORMAL }}>{p.paid ? '✓ Pagó' : 'Sin pagar'}</span>
                  </div>
                ))}
              </Card>
            </div>
          )}

          {/* ── ADMIN ── */}
          {tab === 'admin' && isAdmin && (
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
              <Card style={{ marginBottom: 14 }}>
                <SectionTitle>Pagos y predicciones</SectionTitle>
                <div style={{ fontSize: 11, color: MUTED, fontFamily: FONT_NORMAL, marginBottom: 12 }}>
                  {participants.filter(p => p.paid).length}/{participants.length} pagados · {participants.filter(p => (p.pick_count ?? 0) >= groupMatches.length).length}/{participants.length} con predicciones completas
                </div>
                {participants.map(p => {
                  const name = p.profiles?.nombre
                    ? `${p.profiles.nombre} ${p.profiles.apellido ?? ''}`.trim()
                    : p.profiles?.username ?? 'Jugador'
                  const userPicksList = adminAllPicks.filter(pk => pk.user_id === p.user_id)
                  const pts = isDeadlinePast
                    ? userPicksList.reduce((acc, pk) => { const m = matches.find(m => m.id === pk.match_id); return acc + (m ? (calcScore(pk, m) ?? 0) : 0) }, 0)
                    : null
                  const pct = groupMatches.length > 0 ? Math.round((p.pick_count ?? 0) / groupMatches.length * 100) : 0
                  return (
                    <div key={p.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: `1px solid ${BORDER}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: FONT_NORMAL, fontWeight: 600, fontSize: 13, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {name}{p.user_id === user?.id ? ' (vos)' : ''}
                        </div>
                        <div style={{ fontFamily: FONT_NORMAL, fontSize: 10, color: MUTED, marginTop: 2 }}>
                          {p.pick_count ?? 0}/{groupMatches.length} picks ({pct}%) {isDeadlinePast && `· ${pts} pts`}
                        </div>
                      </div>
                      <button
                        onClick={() => handleTogglePaid(p.user_id, p.paid)}
                        style={{
                          padding: '5px 14px', border: `1.5px solid ${p.paid ? '#10b981' : BORDER}`,
                          background: p.paid ? '#f0fdf4' : '#fafafa', color: p.paid ? '#16a34a' : MUTED,
                          borderRadius: 20, fontFamily: FONT_NORMAL, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        {p.paid ? '✓ Pagó' : 'Sin pagar'}
                      </button>
                    </div>
                  )
                })}
              </Card>

              {/* Pick breakdown — matches as rows, participants as columns */}
              <Card>
                <SectionTitle>Detalle de predicciones</SectionTitle>
                {adminAllPicks.length === 0 ? (
                  <div style={{ fontSize: 12, color: MUTED, fontFamily: FONT_NORMAL, padding: '12px 0' }}>Cargando predicciones...</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
                      <thead>
                        <tr style={{ background: TEXT }}>
                          <th style={{ padding: '8px 10px', textAlign: 'left', color: '#fff', fontFamily: FONT_BLACK, fontSize: 10, position: 'sticky', left: 0, background: TEXT, whiteSpace: 'nowrap', minWidth: 110 }}>Partido</th>
                          <th style={{ padding: '8px 6px', textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontFamily: FONT_NORMAL, fontSize: 9, whiteSpace: 'nowrap' }}>Fecha</th>
                          <th style={{ padding: '8px 6px', textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontFamily: FONT_NORMAL, fontSize: 9, whiteSpace: 'nowrap' }}>Real</th>
                          {participants.map(p => (
                            <th key={p.user_id} style={{ padding: '8px 4px', textAlign: 'center', color: '#fff', fontFamily: FONT_BLACK, fontSize: 9, whiteSpace: 'nowrap', minWidth: 52 }}>
                              {p.profiles?.username ?? '?'}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {groupMatches.map((m, i) => {
                          const matchDate = m.kickoff
                            ? new Date(m.kickoff).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit' })
                            : '—'
                          const hasResult = m.home_score !== null && m.away_score !== null
                          return (
                            <tr key={m.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9f9', borderBottom: `1px solid ${BORDER}` }}>
                              <td style={{ padding: '6px 10px', fontFamily: FONT_NORMAL, color: TEXT, fontWeight: 600, position: 'sticky', left: 0, background: i % 2 === 0 ? '#fff' : '#f9f9f9', whiteSpace: 'nowrap', fontSize: 10 }}>
                                {abbrev(m.home_team)} vs {abbrev(m.away_team)}
                              </td>
                              <td style={{ padding: '6px 6px', textAlign: 'center', fontFamily: FONT_NORMAL, color: MUTED, fontSize: 9, whiteSpace: 'nowrap' }}>{matchDate}</td>
                              <td style={{ padding: '6px 6px', textAlign: 'center', fontFamily: FONT_BLACK, fontSize: 10, whiteSpace: 'nowrap', color: hasResult ? TEXT : MUTED }}>
                                {hasResult ? `${m.home_score}-${m.away_score}` : '—'}
                              </td>
                              {participants.map(p => {
                                const pk = adminAllPicks.find(pk => pk.user_id === p.user_id && pk.match_id === m.id)
                                const score = pk && hasResult ? calcScore(pk, m) : null
                                const color = score === null ? MUTED : score >= 12 ? '#15803d' : score >= 7 ? '#16a34a' : score >= 5 ? '#ca8a04' : score >= 2 ? '#f97316' : RED
                                return (
                                  <td key={p.user_id} style={{ padding: '6px 4px', textAlign: 'center', fontFamily: FONT_NORMAL, fontSize: 10, color, whiteSpace: 'nowrap' }}>
                                    {pk ? `${pk.home_score}-${pk.away_score}` : '—'}
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
