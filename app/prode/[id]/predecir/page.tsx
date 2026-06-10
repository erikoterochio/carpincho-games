'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { computeGroupStandings, computeBestThirds } from '@/lib/prode-standings'
import type { TeamStat } from '@/lib/prode-standings'

const RED = '#D4001A'
const NAVY = '#002B7F'
const TEXT = '#111111'
const MUTED = '#6B7280'
const BORDER = '#E5E7EB'
const BG_CARD = 'rgba(255,255,255,0.95)'
const DEADLINE = new Date('2026-06-11T19:00:00Z')

const FONT_NORMAL = "'FWC2026', 'Ubuntu', sans-serif"
const FONT_BLACK = "'FWC2026', 'Ubuntu', sans-serif"
const FONT_COND = "'FWC2026UltraCond', 'Ubuntu', sans-serif"

type Match = {
  id: string; home_team: string; away_team: string; home_flag: string; away_flag: string
  kickoff: string; group_name: string | null; sort_order: number; stage: string
}
type Picks = Record<string, { h: string; a: string }>
type Specials = {
  balon_oro: string; guante_oro: string; botin_oro: string
  fair_play: string; revelacion: string; goleada_match_id: string
}
const EMPTY_SPECIALS: Specials = {
  balon_oro: '', guante_oro: '', botin_oro: '', fair_play: '', revelacion: '', goleada_match_id: '',
}

const STAGES = [
  { key: 'group', label: 'Grupos' },
  { key: 'r32',   label: '16avos' },
  { key: 'r16',   label: '8vos' },
  { key: 'qf',    label: 'Cuartos' },
  { key: 'sf',    label: 'Semis' },
  { key: '3rd',   label: '3°/4°' },
  { key: 'final', label: 'Final' },
  { key: 'esp',   label: 'Especiales' },
]

const ABBREV: Record<string, string> = {
  'Argentina':'ARG','Brazil':'BRA','France':'FRA','England':'ENG','Germany':'GER','Spain':'ESP',
  'Portugal':'POR','Netherlands':'NED','Belgium':'BEL','Croatia':'CRO','Italy':'ITA','Uruguay':'URU',
  'Colombia':'COL','United States':'USA','Mexico':'MEX','Canada':'CAN','Morocco':'MAR','Japan':'JPN',
  'Australia':'AUS','South Korea':'KOR','Korea Republic':'KOR','South Africa':'RSA',
  'Saudi Arabia':'SAU','Iran':'IRN','Nigeria':'NGA','Senegal':'SEN','Egypt':'EGY','Ghana':'GHA',
  'Cameroon':'CMR',"Ivory Coast":'CIV','Côte d\'Ivoire':'CIV','Tunisia':'TUN','Algeria':'ALG',
  'New Zealand':'NZL','Switzerland':'SUI','Denmark':'DEN','Sweden':'SWE','Poland':'POL',
  'Serbia':'SRB','Austria':'AUT','Hungary':'HUN','Turkey':'TUR','Ukraine':'UKR','Scotland':'SCO',
  'Wales':'WAL','Paraguay':'PAR','Ecuador':'ECU','Venezuela':'VEN','Bolivia':'BOL','Peru':'PER',
  'Chile':'CHI','Jamaica':'JAM','Costa Rica':'CRC','Honduras':'HON','Panama':'PAN',
  'Guatemala':'GUA','Qatar':'QAT','Iraq':'IRQ','Jordan':'JOR','Uzbekistan':'UZB',
  'Czech Republic':'CZE','Slovakia':'SVK','Romania':'ROU','Greece':'GRE','Israel':'ISR',
  'Bosnia-Herzegovina':'BIH','Bosnia':'BIH','Albania':'ALB','Finland':'FIN','Norway':'NOR',
  'Russia':'RUS','DR Congo':'COD','Congo DR':'COD','Cape Verde':'CPV','Curacao':'CUW',
  'Haiti':'HAI','Cuba':'CUB','Trinidad and Tobago':'TRI',
}

function abbrev(name: string) {
  return ABBREV[name] ?? name.substring(0, 3).toUpperCase()
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit', minute: '2-digit',
  }) + ' hs'
}

const REVELATION_TEAMS = [
  'República Checa','Escocia','Túnez','RD del Congo','Uzbekistán','Qatar','Irak',
  'Sudáfrica','Arabia Saudita','Jordania','Bosnia y Herzegovina','Cabo Verde',
  'Ghana','Curazao','Haití','Nueva Zelanda',
]

export default function PredecirPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [matches, setMatches] = useState<Match[]>([])
  const [picks, setPicks] = useState<Picks>({})
  const [specials, setSpecials] = useState<Specials>(EMPTY_SPECIALS)
  const [activeStage, setActiveStage] = useState('group')
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'idle'|'saving'|'saved'>('idle')
  const [isParticipant, setIsParticipant] = useState(false)
  const [standings, setStandings] = useState<{group_name: string; rank: number; team_name: string}[]>([])

  const picksRef = useRef<Picks>({})
  const specialsRef = useRef<Specials>(EMPTY_SPECIALS)
  const matchesRef = useRef<Match[]>([])
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const specialsTimer = useRef<ReturnType<typeof setTimeout>|null>(null)
  const userRef = useRef<any>(null)
  const isDeadlinePast = new Date() >= DEADLINE

  useEffect(() => {
    if (!id) return
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      userRef.current = user
      const { data: part } = await supabase.from('prode_participants').select('id').eq('tournament_id', id).eq('user_id', user.id).maybeSingle()
      setIsParticipant(!!part)
      if (!part) { setLoading(false); return }
      const [{ data: ms }, { data: myPicks }, { data: mySpecials }, { data: st }] = await Promise.all([
        supabase.from('prode_matches').select('id,home_team,away_team,home_flag,away_flag,kickoff,group_name,sort_order,stage').order('sort_order'),
        supabase.from('prode_stage1_picks').select('match_id,home_score,away_score').eq('tournament_id', id).eq('user_id', user.id),
        supabase.from('prode_stage1_specials').select('*').eq('tournament_id', id).eq('user_id', user.id).maybeSingle(),
        supabase.from('prode_standings').select('group_name,rank,team_name').order('group_name').order('rank'),
      ])
      const matchList = (ms ?? []) as Match[]
      setMatches(matchList)
      matchesRef.current = matchList
      setStandings((st ?? []) as {group_name: string; rank: number; team_name: string}[])
      const pm: Picks = {}
      for (const p of (myPicks ?? [])) pm[p.match_id] = { h: String(p.home_score), a: String(p.away_score) }
      setPicks(pm); picksRef.current = pm
      if (mySpecials) {
        const sp: Specials = {
          balon_oro: mySpecials.balon_oro ?? '', guante_oro: mySpecials.guante_oro ?? '',
          botin_oro: mySpecials.botin_oro ?? '', fair_play: mySpecials.fair_play ?? '',
          revelacion: mySpecials.revelacion ?? '', goleada_match_id: mySpecials.goleada_match_id ?? '',
        }
        setSpecials(sp); specialsRef.current = sp
      }
      setLoading(false)
    }
    load()
  }, [id])

  const showSaved = useCallback(() => { setSaveStatus('saved'); setTimeout(() => setSaveStatus('idle'), 2000) }, [])

  const savePick = useCallback(async (matchId: string) => {
    const p = picksRef.current[matchId]
    if (!p || p.h === '' || p.a === '') return
    const h = parseInt(p.h), a = parseInt(p.a)
    if (isNaN(h) || isNaN(a)) return
    setSaveStatus('saving')
    // For KO matches, persist which teams the user predicted for that slot
    const m = matchesRef.current.find(mx => mx.id === matchId)
    const predicted_home = m?.home_team ?? null
    const predicted_away = m?.away_team ?? null
    const { error } = await supabase.from('prode_stage1_picks').upsert(
      { tournament_id: id, user_id: userRef.current?.id, match_id: matchId, home_score: h, away_score: a, predicted_home, predicted_away, updated_at: new Date().toISOString() },
      { onConflict: 'tournament_id,user_id,match_id' }
    )
    if (!error) showSaved(); else setSaveStatus('idle')
  }, [id, showSaved])

  const saveSpecials = useCallback(async () => {
    setSaveStatus('saving')
    const { error } = await supabase.from('prode_stage1_specials').upsert(
      { tournament_id: id, user_id: userRef.current?.id, ...specialsRef.current, updated_at: new Date().toISOString() },
      { onConflict: 'tournament_id,user_id' }
    )
    if (!error) showSaved(); else setSaveStatus('idle')
  }, [id, showSaved])

  const handlePickChange = (matchId: string, side: 'h'|'a', value: string) => {
    const match = matches.find(m => m.id === matchId)
    if (!match) return
    if (match.stage === 'group' ? isDeadlinePast : new Date() >= new Date(match.kickoff)) return
    const cleaned = value.replace(/\D/g, '').slice(0, 2)
    const updated = { ...(picksRef.current[matchId] ?? { h: '', a: '' }), [side]: cleaned }
    picksRef.current[matchId] = updated
    setPicks(prev => ({ ...prev, [matchId]: updated }))
    if (saveTimers.current[matchId]) clearTimeout(saveTimers.current[matchId])
    saveTimers.current[matchId] = setTimeout(() => savePick(matchId), 800)
  }

  const handleSpecialChange = (key: keyof Specials, value: string) => {
    if (isDeadlinePast) return
    const updated = { ...specialsRef.current, [key]: value }
    specialsRef.current = updated; setSpecials(updated)
    if (specialsTimer.current) clearTimeout(specialsTimer.current)
    specialsTimer.current = setTimeout(() => saveSpecials(), 800)
  }

  const stageMatches = (stage: string) => matches.filter(m => m.stage === stage).sort((a, b) => a.sort_order - b.sort_order)
  const groupMatchesByDate = (ms: Match[]) => {
    const map: Record<string, Match[]> = {}
    for (const m of ms) {
      const d = fmtDate(m.kickoff)
      if (!map[d]) map[d] = []
      map[d].push(m)
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }

  const groupMatches = stageMatches('group')
  const myPickCount = Object.values(picks).filter(p => p.h !== '' && p.a !== '').length
  const allTeams = [...new Set(groupMatches.flatMap(m => [m.home_team, m.away_team]))].sort()
  const availableStages = ['group', ...['r32','r16','qf','sf','3rd','final'].filter(s => stageMatches(s).length > 0)]

  // Fixed match numbering: 12 groups × 6 = 72 group matches, KO starts at P73
  const KO_STAGE_START: Record<string, number> = { group: 1, r32: 73, r16: 89, qf: 97, sf: 101, '3rd': 103, final: 104 }
  const matchByNum = useMemo(() => {
    const byStage: Record<string, Match[]> = {}
    for (const m of matches) {
      if (!byStage[m.stage]) byStage[m.stage] = []
      byStage[m.stage].push(m)
    }
    const result = new Map<number, Match>()
    for (const [stage, start] of Object.entries(KO_STAGE_START)) {
      const ms = (byStage[stage] ?? []).sort((a, b) => a.sort_order - b.sort_order)
      ms.forEach((m, i) => result.set(start + i, m))
    }
    return result
  }, [matches]) // eslint-disable-line react-hooks/exhaustive-deps

  const matchNumById = useMemo(() => {
    const m = new Map<string, number>()
    for (const [num, match] of matchByNum) m.set(match.id, num)
    return m
  }, [matchByNum])

  const teamToSeed = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of standings) {
      if (s.group_name && s.rank) m.set(s.team_name, `${s.rank}°${s.group_name}`)
    }
    return m
  }, [standings])

  function resolveTeam(name: string): { label: string; sub?: string } {
    if (!name) return { label: '?' }
    if (/^gan/i.test(name)) {
      const numMatch = name.match(/P(\d+)/i)
      if (numMatch) {
        const num = parseInt(numMatch[1])
        const ref = matchByNum.get(num)
        if (ref && ABBREV[ref.home_team] && ABBREV[ref.away_team]) {
          return { label: `P${num}`, sub: `${abbrev(ref.home_team)}/${abbrev(ref.away_team)}` }
        }
        return { label: `P${num}` }
      }
    }
    const w = name.match(/winner\s+group\s+([A-L])/i)
    if (w) return { label: `1°${w[1].toUpperCase()}` }
    const r = name.match(/runner[\s-]up\s+group\s+([A-L])/i)
    if (r) return { label: `2°${r[1].toUpperCase()}` }
    // Actual team name: show abbrev + seed from standings
    return { label: abbrev(name), sub: teamToSeed.get(name) }
  }

  // Compute all group standings from user's picks (client-side, no DB)
  const allGroupStandings = useMemo(() => {
    const result: Record<string, TeamStat[]> = {}
    for (const g of ['A','B','C','D','E','F','G','H','I','J','K','L']) {
      const gms = matches.filter(m => m.group_name === g).sort((a, b) => a.sort_order - b.sort_order)
      if (gms.length) result[g] = computeGroupStandings(gms, picks)
    }
    return result
  }, [matches, picks])

  const bestThirds = useMemo(() => computeBestThirds(allGroupStandings), [allGroupStandings])

  // Compact match row for group view
  const GroupMatchRow = ({ m }: { m: Match }) => {
    const p = picks[m.id] ?? { h: '', a: '' }
    const filled = p.h !== '' && p.a !== ''
    const started = new Date() >= new Date(m.kickoff)
    const locked = isDeadlinePast || started
    return (
      <div className="gmr">
        <span style={{ fontSize: 9, color: MUTED, fontFamily: FONT_NORMAL, flexShrink: 0, width: 34, textAlign: 'right', lineHeight: 1.2 }}>
          {new Date(m.kickoff).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit' })}
        </span>
        <img src={m.home_flag} alt="" style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover', border: '1px solid #eee', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        <span className="gmr-team right">{abbrev(m.home_team)}</span>
        <input type="text" inputMode="numeric" className="score-sm"
          value={p.h} onChange={e => handlePickChange(m.id, 'h', e.target.value)}
          disabled={locked} placeholder="—"
          style={{ borderColor: filled ? RED : BORDER, color: filled ? RED : TEXT }}
        />
        <span style={{ color: BORDER, fontWeight: 700, fontSize: 12, fontFamily: FONT_BLACK, flexShrink: 0 }}>:</span>
        <input type="text" inputMode="numeric" className="score-sm"
          value={p.a} onChange={e => handlePickChange(m.id, 'a', e.target.value)}
          disabled={locked} placeholder="—"
          style={{ borderColor: filled ? RED : BORDER, color: filled ? RED : TEXT }}
        />
        <img src={m.away_flag} alt="" style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover', border: '1px solid #eee', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        <span className="gmr-team">{abbrev(m.away_team)}</span>
      </div>
    )
  }

  // Group standings table
  const GroupStandingsTable = ({ standings }: { standings: TeamStat[] }) => (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        <tr style={{ borderBottom: `1.5px solid ${BORDER}` }}>
          <th style={{ padding: '4px 6px', textAlign: 'left', fontFamily: FONT_BLACK, fontSize: 9, color: MUTED, fontWeight: 900 }}>#</th>
          <th style={{ padding: '4px 6px', textAlign: 'left', fontFamily: FONT_BLACK, fontSize: 9, color: MUTED, fontWeight: 900 }}>Equipo</th>
          <th style={{ padding: '4px 4px', textAlign: 'center', fontFamily: FONT_BLACK, fontSize: 9, color: MUTED, fontWeight: 900 }}>J</th>
          <th style={{ padding: '4px 4px', textAlign: 'center', fontFamily: FONT_BLACK, fontSize: 9, color: MUTED, fontWeight: 900 }}>G</th>
          <th style={{ padding: '4px 4px', textAlign: 'center', fontFamily: FONT_BLACK, fontSize: 9, color: MUTED, fontWeight: 900 }}>E</th>
          <th style={{ padding: '4px 4px', textAlign: 'center', fontFamily: FONT_BLACK, fontSize: 9, color: MUTED, fontWeight: 900 }}>P</th>
          <th style={{ padding: '4px 4px', textAlign: 'center', fontFamily: FONT_BLACK, fontSize: 9, color: MUTED, fontWeight: 900 }}>DG</th>
          <th style={{ padding: '4px 6px', textAlign: 'center', fontFamily: FONT_BLACK, fontSize: 10, color: TEXT, fontWeight: 900 }}>Pts</th>
        </tr>
      </thead>
      <tbody>
        {standings.map((t, i) => (
          <tr key={t.name} className="st-row">
            <td style={{ padding: '5px 6px', textAlign: 'center', fontFamily: FONT_BLACK, fontWeight: 900, fontSize: 11,
              color: i < 2 ? '#16a34a' : i === 2 ? '#ca8a04' : MUTED }}>
              {i + 1}
            </td>
            <td style={{ padding: '5px 6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {t.flag && <img src={t.flag} alt="" style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover', border: '1px solid #eee', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />}
                <span style={{ fontFamily: i < 2 ? FONT_BLACK : FONT_NORMAL, fontWeight: i < 2 ? 900 : 400, fontSize: 11,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 70 }}>
                  {abbrev(t.name)}
                </span>
              </div>
            </td>
            <td style={{ padding: '5px 4px', textAlign: 'center', color: MUTED }}>{t.pj || '–'}</td>
            <td style={{ padding: '5px 4px', textAlign: 'center', color: MUTED }}>{t.pg || '–'}</td>
            <td style={{ padding: '5px 4px', textAlign: 'center', color: MUTED }}>{t.pe || '–'}</td>
            <td style={{ padding: '5px 4px', textAlign: 'center', color: MUTED }}>{t.pp || '–'}</td>
            <td style={{ padding: '5px 4px', textAlign: 'center',
              color: t.dg > 0 ? '#16a34a' : t.dg < 0 ? RED : MUTED }}>
              {t.pj > 0 ? (t.dg > 0 ? `+${t.dg}` : t.dg) : '–'}
            </td>
            <td style={{ padding: '5px 6px', textAlign: 'center', fontFamily: FONT_BLACK, fontWeight: 900, fontSize: 12, color: TEXT }}>
              {t.pj > 0 ? t.pts : '–'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  const MatchCard = ({ m }: { m: Match }) => {
    const pick = picks[m.id] ?? { h: '', a: '' }
    const filled = pick.h !== '' && pick.a !== ''
    const matchLocked = m.stage === 'group' ? isDeadlinePast : new Date() >= new Date(m.kickoff)
    const { label: homeLabel, sub: homeSub } = resolveTeam(m.home_team)
    const { label: awayLabel, sub: awaySub } = resolveTeam(m.away_team)
    return (
      <div style={{
        background: '#fff', border: `1.5px solid ${filled ? RED + '40' : BORDER}`,
        borderRadius: 14, padding: '12px 14px', transition: 'border-color 0.15s',
        opacity: matchLocked ? 0.7 : 1,
      }}>
        <div style={{ fontSize: 10, color: MUTED, textAlign: 'center', marginBottom: 8, fontFamily: FONT_NORMAL, letterSpacing: 0.5 }}>
          {m.stage === 'group'
            ? (m.group_name ? `GRUPO ${m.group_name} · ` : '')
            : `P${matchNumById.get(m.id) ?? '?'} · `
          }{fmtTime(m.kickoff)}
          {matchLocked && <span style={{ marginLeft: 6, color: RED, fontWeight: 700 }}>🔒</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Home */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 0 }}>
            <img src={m.home_flag} alt={m.home_team} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${BORDER}` }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <span style={{ fontSize: 12, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, letterSpacing: 0.5 }}>{homeLabel}</span>
            {homeSub && <span style={{ fontSize: 9, color: MUTED, fontFamily: FONT_NORMAL, letterSpacing: 0.3, textTransform: 'uppercase' }}>{homeSub}</span>}
          </div>
          {/* Scores */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <input
              type="text" inputMode="numeric"
              className="score-inp"
              value={pick.h}
              onChange={e => handlePickChange(m.id, 'h', e.target.value)}
              disabled={matchLocked}
              placeholder="—"
              style={{ borderColor: filled ? RED : BORDER, color: filled ? RED : TEXT }}
            />
            <span style={{ color: BORDER, fontWeight: 700, fontSize: 14, fontFamily: FONT_BLACK }}>:</span>
            <input
              type="text" inputMode="numeric"
              className="score-inp"
              value={pick.a}
              onChange={e => handlePickChange(m.id, 'a', e.target.value)}
              disabled={matchLocked}
              placeholder="—"
              style={{ borderColor: filled ? RED : BORDER, color: filled ? RED : TEXT }}
            />
          </div>
          {/* Away */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 0 }}>
            <img src={m.away_flag} alt={m.away_team} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${BORDER}` }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <span style={{ fontSize: 12, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, letterSpacing: 0.5 }}>{awayLabel}</span>
            {awaySub && <span style={{ fontSize: 9, color: MUTED, fontFamily: FONT_NORMAL, letterSpacing: 0.3, textTransform: 'uppercase' }}>{awaySub}</span>}
          </div>
        </div>
      </div>
    )
  }

  if (loading) return (
    <div style={{ background: '#f4f4f5', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_NORMAL }}>
      <div style={{ color: MUTED }}>Cargando...</div>
    </div>
  )

  if (!isParticipant) return (
    <div style={{ background: '#f4f4f5', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_NORMAL }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: TEXT, fontSize: 15, marginBottom: 8 }}>No estás inscripto en este torneo.</div>
        <Link href={`/prode/${id}`} style={{ color: RED, fontSize: 13 }}>← Volver</Link>
      </div>
    </div>
  )

  const TeamSelect = ({ field, label }: { field: keyof Specials; label: string }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 6, fontWeight: 700, fontFamily: FONT_NORMAL }}>{label}</div>
      <select value={specials[field]} onChange={e => handleSpecialChange(field, e.target.value)} disabled={isDeadlinePast || allTeams.length === 0}
        style={{ display: 'block', width: '100%', padding: '11px 14px', background: '#fff', color: specials[field] ? TEXT : '#bbb', border: `1.5px solid ${BORDER}`, borderRadius: 10, fontFamily: FONT_NORMAL, fontSize: 13, outline: 'none', appearance: 'none' }}>
        <option value="">Elegir equipo...</option>
        {allTeams.map(t => <option key={t} value={t} style={{ color: TEXT }}>{t}</option>)}
      </select>
    </div>
  )

  const TextInput = ({ field, label, placeholder }: { field: keyof Specials; label: string; placeholder: string }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 6, fontWeight: 700, fontFamily: FONT_NORMAL }}>{label}</div>
      <input type="text" value={specials[field]} onChange={e => handleSpecialChange(field, e.target.value)} disabled={isDeadlinePast} placeholder={placeholder}
        style={{ display: 'block', width: '100%', padding: '11px 14px', background: '#fff', color: TEXT, border: `1.5px solid ${BORDER}`, borderRadius: 10, fontFamily: FONT_NORMAL, fontSize: 13, outline: 'none' }} />
    </div>
  )

  return (
    <>
      <style>{`
        @font-face { font-family: 'FWC2026'; src: url('/fonts/FWC2026-NormalRegular.77c3c249.ttf') format('truetype'); font-weight: 400; }
        @font-face { font-family: 'FWC2026'; src: url('/fonts/FWC2026-NormalBlack.2bd896c8.ttf') format('truetype'); font-weight: 900; }
        @font-face { font-family: 'FWC2026UltraCond'; src: url('/fonts/FWC2026-UltraCondensedBlack.8e6ba053.ttf') format('truetype'); font-weight: 900; }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .pred-page {
          min-height: 100vh; font-family: ${FONT_NORMAL};
          background-image: url('/images/fifa-26-background-light.png');
          background-repeat: repeat; background-size: 400px;
        }

        .score-inp {
          width: 46px; height: 46px; text-align: center;
          background: #fafafa; border: 1.5px solid; border-radius: 10px;
          font-family: ${FONT_COND}; font-size: 20px; font-weight: 900;
          outline: none; -moz-appearance: textfield; transition: border-color 0.15s, color 0.15s;
        }
        .score-inp::-webkit-outer-spin-button, .score-inp::-webkit-inner-spin-button { -webkit-appearance: none; }
        .score-inp:focus { border-color: ${RED} !important; background: #fff0f1; }
        .score-inp:disabled { opacity: 0.4; cursor: not-allowed; }

        .stage-tab {
          padding: 8px 14px; background: transparent; border: 1.5px solid ${BORDER};
          border-radius: 20px; font-family: ${FONT_BLACK}; font-size: 12px; font-weight: 900;
          cursor: pointer; flex-shrink: 0; transition: all 0.12s; color: ${MUTED};
          white-space: nowrap;
        }
        .stage-tab.active { background: ${RED}; color: #fff; border-color: ${RED}; }
        .stage-tab:hover:not(.active) { border-color: ${TEXT}; color: ${TEXT}; }

        .date-header {
          display: flex; align-items: center; gap: 8px; margin: 20px 0 12px;
          font-family: ${FONT_NORMAL}; font-size: 12px; color: ${MUTED}; font-weight: 700;
        }
        .date-header::before, .date-header::after {
          content: ''; flex: 1; height: 1px; background: ${BORDER};
        }

        .matches-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
        @media (min-width: 640px) { .matches-grid { grid-template-columns: 1fr 1fr; } }
        @media (min-width: 900px) { .matches-grid { grid-template-columns: 1fr 1fr 1fr; } }

        .specials-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        @media (min-width: 640px) { .specials-grid { grid-template-columns: 1fr 1fr; } }
        @media (min-width: 900px) { .specials-grid { grid-template-columns: 1fr 1fr 1fr; } }

        select option { background: #fff; color: ${TEXT}; }

        /* Group stage layout */
        .groups-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        @media (min-width: 960px) { .groups-grid { grid-template-columns: 1fr 1fr; } }

        .group-body { display: flex; flex-direction: column; }
        @media (min-width: 520px) { .group-body { flex-direction: row; align-items: flex-start; } }

        .group-matches-col { flex: 1; padding: 10px 12px; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
        .group-table-col {
          padding: 8px 0; border-top: 1px solid ${BORDER};
          flex-shrink: 0; width: 100%;
        }
        @media (min-width: 520px) {
          .group-table-col { width: 210px; border-top: none; border-left: 1px solid ${BORDER}; }
        }

        .gmr { display: flex; align-items: center; gap: 5px; padding: 4px 0; border-bottom: 1px solid ${BORDER}; }
        .gmr:last-child { border-bottom: none; }
        .gmr-team { flex: 1; font-family: ${FONT_BLACK}; font-size: 11px; font-weight: 900; color: ${TEXT}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .gmr-team.right { text-align: right; }

        .score-sm {
          width: 34px; height: 34px; text-align: center;
          background: #fafafa; border: 1.5px solid; border-radius: 8px;
          font-family: ${FONT_COND}; font-size: 17px; font-weight: 900;
          outline: none; -moz-appearance: textfield; transition: border-color 0.12s;
        }
        .score-sm::-webkit-outer-spin-button, .score-sm::-webkit-inner-spin-button { -webkit-appearance: none; }
        .score-sm:focus { border-color: ${RED} !important; background: #fff0f1; }
        .score-sm:disabled { opacity: 0.4; cursor: not-allowed; }

        .st-row:nth-child(1) td, .st-row:nth-child(2) td { background: rgba(16,185,129,0.06); }
        .st-row:nth-child(3) td { background: rgba(234,179,8,0.06); }

        .thirds-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin-top: 16px; }
      `}</style>

      <div className="pred-page" style={{ paddingBottom: 60 }}>

        {/* Header */}
        <nav style={{ background: '#fff', borderBottom: `1px solid ${BORDER}`, boxShadow: '0 1px 8px rgba(0,0,0,0.06)', position: 'sticky', top: 0, zIndex: 20 }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href={`/prode/${id}`} style={{ color: MUTED, textDecoration: 'none', fontSize: 20, lineHeight: 1, flexShrink: 0 }}>←</Link>
            <img src="/images/fifa-26-emblem.png" alt="" style={{ height: 28, width: 'auto', objectFit: 'contain' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK }}>Mis predicciones</div>
              <div style={{ fontSize: 11, color: MUTED }}>{myPickCount} de {groupMatches.length} partidos completados</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: saveStatus === 'saved' ? '#10b981' : saveStatus === 'saving' ? '#f59e0b' : 'transparent', transition: 'color 0.3s', flexShrink: 0, fontFamily: FONT_NORMAL }}>
              {saveStatus === 'saving' ? '⏳ Guardando...' : '✓ Guardado'}
            </div>
          </div>
          {/* Progress */}
          <div style={{ height: 3, background: '#f0f0f0' }}>
            <div style={{ height: '100%', background: RED, width: `${groupMatches.length ? (myPickCount / groupMatches.length) * 100 : 0}%`, transition: 'width 0.4s' }} />
          </div>
        </nav>

        {isDeadlinePast && (
          <div style={{ background: '#fff0f1', borderBottom: '1px solid #ffc0c5', padding: '10px 20px', textAlign: 'center', fontSize: 13, color: RED, fontWeight: 700, fontFamily: FONT_BLACK }}>
            Las predicciones de fase de grupos están cerradas.
          </div>
        )}

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 20px' }}>

          {/* Stage tabs */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12, marginBottom: 4 }}>
            {STAGES.filter(s => s.key === 'esp' || s.key === 'group' || availableStages.includes(s.key)).map(s => (
              <button key={s.key} className={`stage-tab${activeStage === s.key ? ' active' : ''}`} onClick={() => setActiveStage(s.key)}>
                {s.label}
              </button>
            ))}
          </div>

          {/* Group stage — by group with live standings */}
          {activeStage === 'group' && (() => {
            const presentGroups = ['A','B','C','D','E','F','G','H','I','J','K','L'].filter(
              g => matches.some(m => m.group_name === g)
            )
            if (presentGroups.length === 0) return (
              <div style={{ textAlign: 'center', padding: '48px 0', color: MUTED, fontSize: 13, fontFamily: FONT_NORMAL }}>
                No hay partidos cargados todavía. El admin debe sincronizar desde la API.
              </div>
            )
            return (
              <>
                <div className="groups-grid">
                  {presentGroups.map(g => {
                    const gms = matches.filter(m => m.group_name === g).sort((a, b) => a.sort_order - b.sort_order)
                    const standings = allGroupStandings[g] ?? []
                    return (
                      <div key={g} style={{ background: BG_CARD, border: `1.5px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
                        {/* Group header */}
                        <div style={{ background: NAVY, padding: '7px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ color: '#fff', fontFamily: FONT_BLACK, fontWeight: 900, fontSize: 12, letterSpacing: 1 }}>GRUPO {g}</span>
                          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontFamily: FONT_NORMAL }}>
                            {gms.filter(m => picks[m.id]?.h !== '' && picks[m.id]?.a !== '').length}/{gms.length}
                          </span>
                        </div>
                        <div className="group-body">
                          {/* Left: fixtures */}
                          <div className="group-matches-col">
                            {gms.map(m => <GroupMatchRow key={m.id} m={m} />)}
                          </div>
                          {/* Right: standings */}
                          <div className="group-table-col">
                            <GroupStandingsTable standings={standings} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Best thirds panel */}
                {bestThirds.length > 0 && (
                  <div style={{ marginTop: 20, background: BG_CARD, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
                      Mejores terceros clasificados ({bestThirds.length}/8)
                    </div>
                    <div className="thirds-grid">
                      {bestThirds.map((t, i) => (
                        <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#f9fafb', borderRadius: 8, border: `1px solid ${BORDER}` }}>
                          <span style={{ fontSize: 11, fontWeight: 900, color: '#ca8a04', fontFamily: FONT_BLACK, width: 14 }}>{i + 1}</span>
                          {t.flag && <img src={t.flag} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', border: '1px solid #eee', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{abbrev(t.name)}</div>
                            <div style={{ fontSize: 9, color: MUTED, fontFamily: FONT_NORMAL }}>{t.pts}pts · DG {t.dg > 0 ? `+${t.dg}` : t.dg}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )
          })()}

          {/* Knockout stages */}
          {['r32','r16','qf','sf','3rd','final'].includes(activeStage) && (() => {
            const ms = stageMatches(activeStage)
            if (!ms.length) return (
              <div style={{ textAlign: 'center', padding: '48px 0', color: MUTED, fontSize: 13 }}>
                Los partidos de esta fase se cargarán cuando avance el torneo.
              </div>
            )
            return groupMatchesByDate(ms).map(([date, dayMs]) => (
              <div key={date}>
                <div className="date-header">📅 {date}</div>
                <div className="matches-grid">
                  {dayMs.map(m => <MatchCard key={m.id} m={m} />)}
                </div>
              </div>
            ))
          })()}

          {/* Especiales */}
          {activeStage === 'esp' && (
            <div className="specials-grid">

              <div style={{ background: 'rgba(255,255,255,0.92)', border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, marginBottom: 16 }}>⭐ Premios individuales (15 pts c/u)</div>
                <TextInput field="balon_oro" label="Balón de Oro — Jugador del torneo" placeholder="Nombre del jugador" />
                <TextInput field="guante_oro" label="Guante de Oro — Mejor arquero" placeholder="Nombre del arquero" />
                <TextInput field="botin_oro" label="Botín de Oro — Máximo goleador" placeholder="Nombre del goleador" />
              </div>

              <div style={{ background: 'rgba(255,255,255,0.92)', border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, marginBottom: 16 }}>💥 Otros especiales (15 pts c/u)</div>
                <TeamSelect field="fair_play" label="Premio Fair Play — Equipo" />

                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: MUTED, marginBottom: 6, fontWeight: 700 }}>Revelación — Equipo sorpresa</div>
                  <select value={specials.revelacion} onChange={e => handleSpecialChange('revelacion', e.target.value)} disabled={isDeadlinePast}
                    style={{ display: 'block', width: '100%', padding: '11px 14px', background: '#fff', color: specials.revelacion ? TEXT : '#bbb', border: `1.5px solid ${BORDER}`, borderRadius: 10, fontFamily: FONT_NORMAL, fontSize: 13, outline: 'none', appearance: 'none' }}>
                    <option value="">Elegir equipo...</option>
                    {REVELATION_TEAMS.map(t => <option key={t} value={t} style={{ color: TEXT }}>{t}</option>)}
                  </select>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: MUTED, marginBottom: 6, fontWeight: 700 }}>Goleada del torneo — Partido de grupos</div>
                  <select value={specials.goleada_match_id} onChange={e => handleSpecialChange('goleada_match_id', e.target.value)} disabled={isDeadlinePast || !groupMatches.length}
                    style={{ display: 'block', width: '100%', padding: '11px 14px', background: '#fff', color: specials.goleada_match_id ? TEXT : '#bbb', border: `1.5px solid ${BORDER}`, borderRadius: 10, fontFamily: FONT_NORMAL, fontSize: 13, outline: 'none', appearance: 'none' }}>
                    <option value="">Elegir partido...</option>
                    {groupMatches.map(m => <option key={m.id} value={m.id} style={{ color: TEXT }}>{m.home_team} vs {m.away_team} (Gr. {m.group_name})</option>)}
                  </select>
                </div>
              </div>

            </div>
          )}

        </div>
      </div>
    </>
  )
}
