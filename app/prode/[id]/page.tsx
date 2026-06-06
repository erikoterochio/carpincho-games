'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { computeGroupStandings, computeBestThirds } from '@/lib/prode-standings'
import type { TeamStat } from '@/lib/prode-standings'

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

type Tab = 'predecir' | 'fixture' | 'posiciones' | 'tabla' | 'reglamento' | 'info'

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
}
type UserPick = { match_id: string; home_score: number; away_score: number; user_id: string }

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

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('predecir')
  const [user, setUser] = useState<any>(null)
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [allPicks, setAllPicks] = useState<UserPick[]>([])
  const [myEditPicks, setMyEditPicks] = useState<Record<string, {h:string;a:string}>>({})
  const [saveStatus, setSaveStatus] = useState<'idle'|'saving'|'saved'>('idle')
  const picksEditRef = useRef<Record<string, {h:string;a:string}>>({})
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [loading, setLoading] = useState(true)
  const [standings, setStandings] = useState<Standing[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [isParticipant, setIsParticipant] = useState(false)
  const [pointsOpen, setPointsOpen] = useState(false)
  const liveRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  const savePick = useCallback(async (matchId: string) => {
    if (!user) return
    const p = picksEditRef.current[matchId]
    if (!p || p.h === '' || p.a === '') return
    const h = parseInt(p.h), a = parseInt(p.a)
    if (isNaN(h) || isNaN(a)) return
    setSaveStatus('saving')
    const { error } = await supabase.from('prode_stage1_picks').upsert(
      { tournament_id: id, user_id: user.id, match_id: matchId, home_score: h, away_score: a, updated_at: new Date().toISOString() },
      { onConflict: 'tournament_id,user_id,match_id' }
    )
    if (!error) showSaved()
    else setSaveStatus('idle')
  }, [id, user, showSaved])

  const handlePickChange = (matchId: string, side: 'h'|'a', value: string) => {
    if (isDeadlinePast) return
    const cleaned = value.replace(/\D/g, '').slice(0, 2)
    const updated = { ...(picksEditRef.current[matchId] ?? { h: '', a: '' }), [side]: cleaned }
    picksEditRef.current[matchId] = updated
    setMyEditPicks(prev => ({ ...prev, [matchId]: updated }))
    if (saveTimersRef.current[matchId]) clearTimeout(saveTimersRef.current[matchId])
    saveTimersRef.current[matchId] = setTimeout(() => savePick(matchId), 800)
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
    { key: 'predecir', label: 'Predecir' },
    { key: 'fixture', label: 'Fixture' },
    { key: 'posiciones', label: 'Posiciones' },
    { key: 'tabla', label: 'Tabla' },
    { key: 'reglamento', label: 'Reglamento' },
    { key: 'info', label: 'Info' },
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
      if (gms.length) result[g] = computeGroupStandings(gms, myEditPicks)
    }
    return result
  }, [matches, myEditPicks])

  const bestThirds = useMemo(() => computeBestThirds(allGroupStandings), [allGroupStandings])

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
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 0', borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ fontSize: 9, color: MUTED, flexShrink: 0, width: 30, textAlign: 'right', lineHeight: 1.2, fontFamily: FONT_NORMAL }}>
          {new Date(m.kickoff).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit' })}
        </span>
        <img src={m.home_flag} alt="" style={{ width: 15, height: 15, borderRadius: '50%', objectFit: 'cover', border: '1px solid #eee', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        <span style={{ flex: 1, fontFamily: FONT_BLACK, fontSize: 11, fontWeight: 900, color: TEXT, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{abbrev(m.home_team)}</span>
        <input type="text" inputMode="numeric" className="grp-inp"
          value={p.h} onChange={e => handlePickChange(m.id, 'h', e.target.value)}
          disabled={isDeadlinePast} placeholder="—"
          style={{ borderColor: filled ? RED : BORDER, color: filled ? RED : TEXT }}
        />
        <span style={{ color: BORDER, fontWeight: 700, fontSize: 11, fontFamily: FONT_BLACK, flexShrink: 0 }}>:</span>
        <input type="text" inputMode="numeric" className="grp-inp"
          value={p.a} onChange={e => handlePickChange(m.id, 'a', e.target.value)}
          disabled={isDeadlinePast} placeholder="—"
          style={{ borderColor: filled ? RED : BORDER, color: filled ? RED : TEXT }}
        />
        <img src={m.away_flag} alt="" style={{ width: 15, height: 15, borderRadius: '50%', objectFit: 'cover', border: '1px solid #eee', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        <span style={{ flex: 1, fontFamily: FONT_BLACK, fontSize: 11, fontWeight: 900, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{abbrev(m.away_team)}</span>
      </div>
    )
  }

  const GroupStandingsTable = ({ standings }: { standings: TeamStat[] }) => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: `1.5px solid ${BORDER}` }}>
          {['#','Equipo','J','G','E','P','DG','Pts'].map((h, i) => (
            <th key={h} style={{ padding: i <= 1 ? '4px 6px' : '4px 3px', textAlign: i <= 1 ? 'left' : 'center', fontFamily: FONT_BLACK, fontSize: 9, color: MUTED, fontWeight: 900 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {standings.map((t, i) => (
          <tr key={t.name} style={{ background: i < 2 ? 'rgba(16,185,129,0.06)' : i === 2 ? 'rgba(234,179,8,0.06)' : undefined, borderBottom: `1px solid ${BORDER}` }}>
            <td style={{ padding: '5px 6px', textAlign: 'center', fontFamily: FONT_BLACK, fontWeight: 900, fontSize: 11, color: i < 2 ? '#16a34a' : i === 2 ? '#ca8a04' : MUTED }}>{i + 1}</td>
            <td style={{ padding: '5px 6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {t.flag && <img src={t.flag} alt="" style={{ width: 13, height: 13, borderRadius: '50%', objectFit: 'cover', border: '1px solid #eee', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />}
                <span style={{ fontFamily: i < 2 ? FONT_BLACK : FONT_NORMAL, fontWeight: i < 2 ? 900 : 400, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 65 }}>{abbrev(t.name)}</span>
              </div>
            </td>
            <td style={{ padding: '5px 3px', textAlign: 'center', fontSize: 11, color: MUTED }}>{t.pj || '–'}</td>
            <td style={{ padding: '5px 3px', textAlign: 'center', fontSize: 11, color: MUTED }}>{t.pg || '–'}</td>
            <td style={{ padding: '5px 3px', textAlign: 'center', fontSize: 11, color: MUTED }}>{t.pe || '–'}</td>
            <td style={{ padding: '5px 3px', textAlign: 'center', fontSize: 11, color: MUTED }}>{t.pp || '–'}</td>
            <td style={{ padding: '5px 3px', textAlign: 'center', fontSize: 11, color: t.dg > 0 ? '#16a34a' : t.dg < 0 ? RED : MUTED }}>
              {t.pj > 0 ? (t.dg > 0 ? `+${t.dg}` : t.dg) : '–'}
            </td>
            <td style={{ padding: '5px 6px', textAlign: 'center', fontFamily: FONT_BLACK, fontWeight: 900, fontSize: 12, color: TEXT }}>{t.pj > 0 ? t.pts : '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

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

  const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
    <div style={{ background: 'rgba(255,255,255,0.92)', border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '16px 18px', backdropFilter: 'blur(4px)', ...style }}>
      {children}
    </div>
  )

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 11, fontWeight: 900, color: TEXT, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12, fontFamily: FONT_BLACK }}>
      {children}
    </div>
  )

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
        @media (min-width: 1000px) { .grp-grid { grid-template-columns: 1fr 1fr; } }
        .grp-body { display: flex; flex-direction: column; }
        @media (min-width: 520px) { .grp-body { flex-direction: row; } }
        .grp-matches { flex: 1; padding: 10px 12px; display: flex; flex-direction: column; gap: 0; min-width: 0; }
        .grp-table-col { width: 100%; border-top: 1px solid ${BORDER}; padding: 8px 0; flex-shrink: 0; }
        @media (min-width: 520px) { .grp-table-col { width: 205px; border-top: none; border-left: 1px solid ${BORDER}; } }
        .grp-inp {
          width: 32px; height: 32px; text-align: center; background: #fafafa;
          border: 1.5px solid; border-radius: 7px; font-family: ${FONT_COND};
          font-size: 16px; font-weight: 900; outline: none; -moz-appearance: textfield;
          transition: border-color 0.12s; flex-shrink: 0;
        }
        .grp-inp::-webkit-outer-spin-button,.grp-inp::-webkit-inner-spin-button{-webkit-appearance:none;}
        .grp-inp:focus { border-color: ${RED} !important; background: #fff0f1; }
        .grp-inp:disabled { opacity: 0.35; cursor: not-allowed; }
        .grp-thirds { display: grid; grid-template-columns: repeat(auto-fill,minmax(130px,1fr)); gap: 8px; margin-top: 12px; }
        .pred-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
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
                  {/* Progress + save status */}
                  <div className="pred-header">
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 900, fontFamily: FONT_BLACK, color: TEXT, marginBottom: 6 }}>Fase de grupos — Etapa I</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="prog-bar" style={{ width: 140 }}>
                          <div className="prog-fill" style={{ width: `${progress}%` }} />
                        </div>
                        <span style={{ fontSize: 12, color: MUTED, fontFamily: FONT_NORMAL }}>{myPickCount}/{groupMatches.length}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: saveStatus === 'saved' ? '#10b981' : saveStatus === 'saving' ? '#f59e0b' : 'transparent', fontFamily: FONT_NORMAL, flexShrink: 0, transition: 'color 0.3s' }}>
                      {saveStatus === 'saving' ? '⏳ Guardando...' : '✓ Guardado'}
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
                  ) : (
                    <>
                      <div className="grp-grid">
                        {GROUPS.filter(g => matches.some(m => m.group_name === g)).map(g => {
                          const gms = matches.filter(m => m.group_name === g).sort((a, b) => a.sort_order - b.sort_order)
                          const gSt = allGroupStandings[g] ?? []
                          const filled = gms.filter(m => myEditPicks[m.id]?.h !== '' && myEditPicks[m.id]?.a !== '').length
                          return (
                            <div key={g} style={{ background: 'rgba(255,255,255,0.92)', border: `1.5px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
                              <div style={{ background: NAVY, padding: '7px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: '#fff', fontFamily: FONT_BLACK, fontSize: 12, fontWeight: 900, letterSpacing: 1 }}>GRUPO {g}</span>
                                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontFamily: FONT_NORMAL }}>{filled}/{gms.length}</span>
                              </div>
                              <div className="grp-body">
                                <div className="grp-matches">
                                  {gms.map(m => <GroupMatchRow key={m.id} m={m} />)}
                                </div>
                                <div className="grp-table-col">
                                  <GroupStandingsTable standings={gSt} />
                                </div>
                              </div>
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
                    </>
                  )}
                </>
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

        </div>
      </div>
    </>
  )
}
