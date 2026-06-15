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
const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

// Official WC2026 R32 bracket seedings — maps slot index (P73=0 … P88=15) to the two seeds
type SlotRef = { kind: 'first'|'second'; grp: string } | { kind: 'third'; idx: number }
const R32_SEEDS: [SlotRef, SlotRef][] = [
  [{ kind:'second',grp:'A' }, { kind:'second',grp:'B' }],  // P73
  [{ kind:'first', grp:'E' }, { kind:'third',  idx:0  }],  // P74
  [{ kind:'first', grp:'F' }, { kind:'second',grp:'C' }],  // P75
  [{ kind:'first', grp:'C' }, { kind:'second',grp:'F' }],  // P76
  [{ kind:'first', grp:'I' }, { kind:'third',  idx:1  }],  // P77
  [{ kind:'second',grp:'E' }, { kind:'second',grp:'I' }],  // P78
  [{ kind:'first', grp:'A' }, { kind:'third',  idx:2  }],  // P79
  [{ kind:'first', grp:'L' }, { kind:'third',  idx:3  }],  // P80
  [{ kind:'first', grp:'D' }, { kind:'third',  idx:4  }],  // P81
  [{ kind:'first', grp:'G' }, { kind:'third',  idx:5  }],  // P82
  [{ kind:'second',grp:'K' }, { kind:'second',grp:'L' }],  // P83
  [{ kind:'first', grp:'H' }, { kind:'second',grp:'J' }],  // P84
  [{ kind:'first', grp:'B' }, { kind:'third',  idx:6  }],  // P85
  [{ kind:'first', grp:'J' }, { kind:'second',grp:'H' }],  // P86
  [{ kind:'first', grp:'K' }, { kind:'third',  idx:7  }],  // P87
  [{ kind:'second',grp:'D' }, { kind:'second',grp:'G' }],  // P88
]
function resolveSlot(
  ref: SlotRef,
  c: { firsts: (string|null)[]; seconds: (string|null)[]; thirds: (string|null)[] }
): string | null {
  if (ref.kind === 'third') return c.thirds[ref.idx] ?? null
  const gi = GROUPS.indexOf(ref.grp)
  if (gi === -1) return null
  return (ref.kind === 'first' ? c.firsts : c.seconds)[gi] ?? null
}
const FONT_NORMAL = "'FWC2026', 'Ubuntu', sans-serif"
const FONT_BLACK  = "'FWC2026Black', 'Ubuntu', sans-serif"
const FONT_COND   = "'FWC2026UltraCond', 'Ubuntu', sans-serif"

const GROUP_COLORS: Record<string, string> = {
  A: '#20298b', B: '#0f766e', C: '#7c2d12', D: '#6d28d9',
  E: '#be123c', F: '#047857', G: '#1d4ed8', H: '#9333ea',
  I: '#b45309', J: '#0369a1', K: '#4d7c0f', L: '#9f1239',
}
const STAGE_COLORS: Record<string, string> = {
  r32: '#312E81', r16: '#1E1B4B', qf: '#0F172A', sf: '#172554', '3rd': '#1A1A2E', final: '#0A0A0A',
}

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
  { key: 'balon_oro',        label: 'Balón de Oro',       pts: 15, type: 'player' },
  { key: 'guante_oro',       label: 'Guante de Oro',      pts: 15, type: 'player' },
  { key: 'botin_oro',        label: 'Botín de Oro',       pts: 15, type: 'player' },
  { key: 'fair_play',        label: 'Fair Play',           pts: 15, type: 'team' },
  { key: 'revelacion',       label: 'Equipo Revelación',   pts: 15, type: 'revelation' },
  { key: 'goleada_match_id', label: 'Mayor Goleada',       pts: 15, type: 'match' },
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

type Tab = 'home' | 'predecir' | 'fixture' | 'posiciones' | 'tabla' | 'reglamento' | 'info' | 'admin' | 'predicciones'

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
  user_id: string; paid: boolean; late_join?: boolean
  profiles: { username: string; nombre?: string; apellido?: string } | null
  pick_count?: number
}
type Match = {
  id: string; home_team: string; away_team: string; home_flag: string; away_flag: string
  home_team_id: number; away_team_id: number
  kickoff: string; stage: string; group_name: string | null; sort_order: number
  home_score: number | null; away_score: number | null; status: string
  venue: string | null; elapsed?: number | null
}
type MatchEvent = {
  elapsed: number; extra: number | null
  team_id: number; player: string
  type: 'Goal' | 'Card'; detail: string
}
type UserPick = { match_id: string; home_score: number; away_score: number; user_id: string; predicted_home?: string | null; predicted_away?: string | null; pen_winner?: string | null }
type AdminSpecial = {
  user_id: string
  champion?: string | null; runner_up?: string | null; third_place?: string | null; fourth_place?: string | null
  balon_oro?: string | null; guante_oro?: string | null; botin_oro?: string | null
  fair_play?: string | null; revelacion?: string | null; goleada_match_id?: string | null
}
const SPECIAL_LABELS: Array<{ key: string; label: string }> = [
  { key: 'champion',         label: 'Campeón' },
  { key: 'runner_up',        label: 'Sub-campeón' },
  { key: 'third_place',      label: '3er puesto' },
  { key: 'fourth_place',     label: '4to puesto' },
  { key: 'balon_oro',        label: 'Balón de Oro' },
  { key: 'guante_oro',       label: 'Guante de Oro' },
  { key: 'botin_oro',        label: 'Botín de Oro' },
  { key: 'fair_play',        label: 'Fair Play' },
  { key: 'revelacion',       label: 'Revelación' },
  { key: 'goleada_match_id', label: 'Mayor Goleada' },
]
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

// Converts API-Football bracket placeholder names to "1° Gr A" style labels
function fmtKoTeam(name: string): string {
  if (!name) return '?'
  // "Winner Group A" → "1° Gr A", "Runner-up Group B" → "2° Gr B"
  const w = name.match(/winner\s+group\s+([A-L])/i)
  if (w) return `1° Gr ${w[1].toUpperCase()}`
  const r = name.match(/runner[\s-]up\s+group\s+([A-L])/i)
  if (r) return `2° Gr ${r[1].toUpperCase()}`
  // "3rd Group A/B/C" style (WC R32 third-place qualifiers)
  const t = name.match(/3rd\s+group\s+([A-L/]+)/i)
  if (t) return `3° ${t[1].toUpperCase()}`
  // Already a real team name — show it
  return name
}

// Official WC2026 bracket routing: which r32 slots feed each r16 match
// P89←P74,P77  P90←P73,P75  P91←P76,P78  P92←P79,P80
// P93←P83,P84  P94←P81,P82  P95←P86,P88  P96←P85,P87
const R16_FROM_R32: [number, number][] = [
  [1, 4], [0, 2], [3, 5], [6, 7], [10, 11], [8, 9], [13, 15], [12, 14]
]
// P97←P89,P90  P98←P93,P94  P99←P91,P92  P100←P95,P96
const QF_FROM_R16: [number, number][] = [
  [0, 1], [4, 5], [2, 3], [6, 7]
]

// Stable slot IDs for KO picks — independent of whether real match fixtures
// are loaded in the DB. Picks are always stored by slot, never by real match_id.
function koSlotId(stage: string, idx: number): string {
  if (stage === '3rd')   return 'ko-3rd'
  if (stage === 'final') return 'ko-final'
  return `ko-${stage}-${idx}`
}

// Compute predicted bracket winners per-participant from KO picks (cascading)
function computeKoBracket(
  picks: UserPick[],
  r32Ms: Match[], r16Ms: Match[], qfMs: Match[], sfMs: Match[],
  thirdMs: Match[], finalMs: Match[]
): Map<string, string> {
  const winners = new Map<string, string>()
  const losers  = new Map<string, string>()

  const applySlot = (slotId: string, homeSlotId: string, awaySlotId: string, fallbackHome: string, fallbackAway: string, predictedHome?: string | null, predictedAway?: string | null) => {
    const pk = picks.find(p => p.match_id === slotId)
    if (!pk) return
    // Priority: chained winner > pick's saved predicted team > external param > fixture fallback
    const home = (homeSlotId ? winners.get(homeSlotId) : null) ?? pk.predicted_home ?? predictedHome ?? fallbackHome
    const away = (awaySlotId ? winners.get(awaySlotId) : null) ?? pk.predicted_away ?? predictedAway ?? fallbackAway
    if (home === '?' || away === '?') return
    if (pk.home_score > pk.away_score)      { winners.set(slotId, home); losers.set(slotId, away) }
    else if (pk.away_score > pk.home_score) { winners.set(slotId, away); losers.set(slotId, home) }
    else if (pk.pen_winner === 'h')         { winners.set(slotId, home); losers.set(slotId, away) }
    else if (pk.pen_winner === 'a')         { winners.set(slotId, away); losers.set(slotId, home) }
  }

  for (let i = 0; i < 16; i++) {
    const pk = picks.find(p => p.match_id === `ko-r32-${i}`)
    applySlot(`ko-r32-${i}`, '', '', r32Ms[i]?.home_team ?? '?', r32Ms[i]?.away_team ?? '?', pk?.predicted_home, pk?.predicted_away)
  }
  for (let i = 0; i < 8; i++) { const m = r16Ms[i]; const [a,b] = R16_FROM_R32[i] ?? [i*2,i*2+1]; applySlot(`ko-r16-${i}`, `ko-r32-${a}`, `ko-r32-${b}`, m?.home_team ?? '?', m?.away_team ?? '?') }
  for (let i = 0; i < 4; i++) { const m = qfMs[i];  const [a,b] = QF_FROM_R16[i]  ?? [i*2,i*2+1]; applySlot(`ko-qf-${i}`,  `ko-r16-${a}`, `ko-r16-${b}`, m?.home_team ?? '?', m?.away_team ?? '?') }
  for (let i = 0; i < 2; i++) { const m = sfMs[i];  applySlot(`ko-sf-${i}`, `ko-qf-${i*2}`, `ko-qf-${i*2+1}`, m?.home_team ?? '?', m?.away_team ?? '?') }

  const thirdPk = picks.find(p => p.match_id === 'ko-3rd')
  if (thirdPk) {
    const home = losers.get('ko-sf-0') ?? thirdPk.predicted_home ?? thirdMs[0]?.home_team ?? '?'
    const away = losers.get('ko-sf-1') ?? thirdPk.predicted_away ?? thirdMs[0]?.away_team ?? '?'
    if (home !== '?' && away !== '?') {
      if (thirdPk.home_score > thirdPk.away_score)      winners.set('ko-3rd', home)
      else if (thirdPk.away_score > thirdPk.home_score) winners.set('ko-3rd', away)
      else if (thirdPk.pen_winner === 'h')               winners.set('ko-3rd', home)
      else if (thirdPk.pen_winner === 'a')               winners.set('ko-3rd', away)
    }
  }

  const finalPk = picks.find(p => p.match_id === 'ko-final')
  if (finalPk) {
    const home = winners.get('ko-sf-0') ?? finalPk.predicted_home ?? finalMs[0]?.home_team ?? '?'
    const away = winners.get('ko-sf-1') ?? finalPk.predicted_away ?? finalMs[0]?.away_team ?? '?'
    if (home !== '?' && away !== '?') {
      if (finalPk.home_score > finalPk.away_score)      { winners.set('ko-final', home); winners.set('ko-final-runner', away); losers.set('ko-final', away) }
      else if (finalPk.away_score > finalPk.home_score) { winners.set('ko-final', away); winners.set('ko-final-runner', home); losers.set('ko-final', home) }
      else if (finalPk.pen_winner === 'h')               { winners.set('ko-final', home); winners.set('ko-final-runner', away); losers.set('ko-final', away) }
      else if (finalPk.pen_winner === 'a')               { winners.set('ko-final', away); winners.set('ko-final-runner', home); losers.set('ko-final', home) }
    }
  }

  return winners
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

function BonusSection({ initialBonus, bonusVersion, groupMatches, onSave }: {
  initialBonus: Record<string, string>
  bonusVersion: number
  groupMatches: Match[]
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
              <select
                key={`${f.key}-${bonusVersion}`}
                value={local[f.key] ?? ''}
                onChange={e => upd(f.key, e.target.value)}
                style={{ width: 200, padding: '6px 10px', border: `1.5px solid ${local[f.key] ? '#D4001A' : BORDER}`, borderRadius: 8, fontFamily: FONT_NORMAL, fontSize: 11, color: local[f.key] ? TEXT : MUTED, outline: 'none', background: '#fafafa' }}
              >
                <option value="">— Elegir partido —</option>
                {groupMatches.map(m => (
                  <option key={m.id} value={m.id}>{abbrev(m.home_team)} vs {abbrev(m.away_team)}</option>
                ))}
              </select>
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
  const [predAllPicks, setPredAllPicks] = useState<UserPick[]>([])
  const [serverScores, setServerScores] = useState<Map<string, number> | null>(null)
  const [adminSpecials, setAdminSpecials] = useState<AdminSpecial[]>([])
  const [myEditPicks, setMyEditPicks] = useState<Record<string, {h:string;a:string}>>({})
  const [saveStatus, setSaveStatus] = useState<'idle'|'saving'|'saved'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const picksEditRef = useRef<Record<string, {h:string;a:string}>>({})
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({}) // kept for cleanup only
  const [loading, setLoading] = useState(true)
  const [standings, setStandings] = useState<Standing[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [isParticipant, setIsParticipant] = useState(false)
  const [isLateJoin, setIsLateJoin] = useState(false)
  const [pointsOpen, setPointsOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(GROUPS))
  const [koEditPicks, setKoEditPicks] = useState<Record<string, {h:string; a:string; pen?:'h'|'a'}>>({})
  const koPicksRef = useRef<Record<string, {h:string; a:string; pen?:'h'|'a'}>>({})
  const bracketNodeByIdRef = useRef<Map<string, KoMatchNode>>(new Map())
  const liveRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wasLiveRef = useRef(false)
  const [bonus, setBonus] = useState<Record<string, string>>({})
  const [adminTab, setAdminTab] = useState<'pagos'|'partidos'|'grupos'|'clasificados'|'cruces'|'ko'|'premios'>('pagos')
  const [predTab, setPredTab] = useState<'partidos'|'grupos'>('partidos')
  const [bonusVersion, setBonusVersion] = useState(0)
  const [openRounds, setOpenRounds] = useState<Set<string>>(new Set())
  const [matchEvents, setMatchEvents] = useState<Record<string, MatchEvent[]>>({})
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set())
  const [expandedPicksMatches, setExpandedPicksMatches] = useState<Set<string>>(new Set())
  const seenEventsRef = useRef<Set<string>>(new Set())
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | null>(null)
  const toggleMatchExpand = (id: string) => setExpandedMatches(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleRound = (label: string) => setOpenRounds(prev => {
    const next = new Set(prev)
    if (next.has(label)) next.delete(label); else next.add(label)
    return next
  })

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission)
    }
  }, [])

  useEffect(() => {
    if (!id) return
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      const [{ data: t }, { data: ps }, { data: ms }, { data: st }] = await Promise.all([
        supabase.from('prode_tournaments').select('*').eq('id', id).maybeSingle(),
        supabase.from('prode_participants').select('user_id, paid, late_join, profiles(username, nombre, apellido)').eq('tournament_id', id),
        supabase.from('prode_matches').select('*').order('sort_order'),
        supabase.from('prode_standings').select('*').order('group_name').order('rank'),
      ])
      setTournament(t)
      const matchList = (ms ?? []) as Match[]
      setMatches(matchList)
      setStandings((st ?? []) as Standing[])
      if (user && ps) {
        const myPart = (ps as any[]).find(p => p.user_id === user.id)
        setIsParticipant(!!myPart)
        setIsLateJoin(myPart?.late_join ?? false)
        const { data: picks } = await supabase
          .from('prode_stage1_picks').select('match_id,home_score,away_score,user_id,predicted_home,predicted_away,pen_winner').eq('tournament_id', id)
        const allP = (picks ?? []) as UserPick[]
        setAllPicks(allP)
        const groupMatchIdSet = new Set(matchList.filter(m => m.stage === 'group').map(m => m.id))
        const pm: Record<string, {h:string;a:string}> = {}
        for (const p of allP.filter(pk => pk.user_id === user.id && groupMatchIdSet.has(pk.match_id))) {
          pm[p.match_id] = { h: String(p.home_score ?? ''), a: String(p.away_score ?? '') }
        }
        setMyEditPicks(pm)
        picksEditRef.current = pm

        // Init KO bracket state from loaded picks (restores scores + penalty winner)
        const kopm: Record<string, {h:string;a:string;pen?:'h'|'a'}> = {}
        for (const p of allP.filter(pk => pk.user_id === user.id && !groupMatchIdSet.has(pk.match_id))) {
          const pen = (p.pen_winner === 'h' || p.pen_winner === 'a') ? p.pen_winner : undefined
          kopm[p.match_id] = { h: String(p.home_score ?? ''), a: String(p.away_score ?? ''), ...(pen ? { pen } : {}) }
        }
        setKoEditPicks(kopm)
        koPicksRef.current = kopm

        // Load user's own specials (overwrites localStorage data if present)
        const { data: mySpecials } = await supabase
          .from('prode_stage1_specials').select('balon_oro,guante_oro,botin_oro,fair_play,revelacion,goleada_match_id')
          .eq('tournament_id', id).eq('user_id', user.id).maybeSingle()
        if (mySpecials) {
          const bonusFromDB: Record<string, string> = {}
          for (const k of ['balon_oro','guante_oro','botin_oro','fair_play','revelacion','goleada_match_id']) {
            const v = (mySpecials as any)[k]
            if (v) bonusFromDB[k] = v
          }
          if (Object.keys(bonusFromDB).length > 0) {
            setBonus(bonusFromDB)
            setBonusVersion(v => v + 1)
          }
        }

        setParticipants((ps as any[]).map(p => ({ ...p, pick_count: allP.filter(pk => pk.user_id === p.user_id).length })))

        // Fetch all picks via service role (anon client only sees own picks due to RLS)
        // Available to any participant; admin tab also uses this data
        fetch(`/api/prode/${id}/all-picks`)
          .then(r => r.json())
          .then((allServicePicks: UserPick[]) => {
            if (!Array.isArray(allServicePicks)) return
            setPredAllPicks(allServicePicks)
            setParticipants(prev => prev.map(p => ({
              ...p,
              pick_count: allServicePicks.filter(pk => pk.user_id === p.user_id).length,
            })))
            if ((t as any)?.admin_id === user.id) {
              setAdminAllPicks(allServicePicks)
            }
          })
          .catch(() => {})

        // Fetch server-computed scores (admin client — same for all users regardless of RLS)
        fetch(`/api/prode/${id}/scores`)
          .then(r => r.ok ? r.json() : null)
          .then((data: { user_id: string; pts: number }[] | null) => {
            setServerScores(Array.isArray(data) ? new Map(data.map(s => [s.user_id, s.pts])) : new Map())
          })
          .catch(() => setServerScores(new Map()))

        if ((t as any)?.admin_id === user.id) {
          fetch(`/api/prode/${id}/all-specials`)
            .then(r => r.json())
            .then((data: unknown) => {
              if (Array.isArray(data)) setAdminSpecials(data as AdminSpecial[])
              else console.error('[all-specials]', data)
            })
            .catch(console.error)
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

      // Auto-refresh live scores every 60s — start if DB says live OR if kickoff passed recently (handles stale DB status when no admin synced)
      const now = Date.now()
      const FINISHED = ['FT', 'AET', 'PEN']
      const hasLive = matchList.some(m => LIVE_STATUSES.has(m.status))
      const hasRecentKickoff = matchList.some(m => {
        const ko = new Date(m.kickoff).getTime()
        return ko <= now && now - ko < 4 * 60 * 60 * 1000 && !FINISHED.includes(m.status)
      })
      if (hasLive || hasRecentKickoff) startLiveRefresh()
      // Any past match (>110 min after kickoff) not marked as finished → DB is stale → auto-sync
      const hasStaleFinished = !hasLive && matchList.some(m => {
        const ko = new Date(m.kickoff).getTime()
        return ko <= now && now - ko >= 110 * 60 * 1000 && !FINISHED.includes(m.status) && m.status !== 'CANC'
      })
      if (hasStaleFinished) {
        fetch('/api/prode/sync', { method: 'POST' })
          .then(() => Promise.all([
            supabase.from('prode_matches').select('*').order('sort_order'),
            supabase.from('prode_standings').select('*').order('group_name').order('rank'),
          ]))
          .then(([{ data: ms }, { data: st }]) => {
            if (ms) setMatches(ms as Match[])
            if (st) setStandings(st as Standing[])
          })
          .catch(() => {})
      }
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

  // Refresh matches, standings, and scores when user returns to tab
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible' || !id) return
      Promise.all([
        supabase.from('prode_matches').select('*').order('sort_order'),
        supabase.from('prode_standings').select('*').order('group_name').order('rank'),
      ]).then(([{ data: ms }, { data: st }]) => {
        if (ms) setMatches(ms as Match[])
        if (st) setStandings(st as Standing[])
      }).catch(() => {})
      fetch(`/api/prode/${id}/scores`)
        .then(r => r.ok ? r.json() : null)
        .then((data: { user_id: string; pts: number }[] | null) => {
          if (Array.isArray(data)) setServerScores(new Map(data.map(s => [s.user_id, s.pts])))
        })
        .catch(() => {})
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [id])

  useEffect(() => {
    const tz = 'America/Argentina/Buenos_Aires'
    const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: tz })
    const matchDateIso = (m: Match) => new Date(m.kickoff).toLocaleDateString('en-CA', { timeZone: tz })
    const allDates = [...new Set(matches.map(matchDateIso))].sort()
    const datesToShow = new Set(allDates.filter(d => d >= todayIso).slice(0, 2))
    const toFetch = matches.filter(m =>
      (datesToShow.has(matchDateIso(m)) || LIVE_STATUSES.has(m.status)) &&
      (LIVE_STATUSES.has(m.status) || ['FT', 'AET', 'PEN'].includes(m.status))
    )
    if (!toFetch.length) return
    for (const m of toFetch) {
      fetch(`/api/prode/events?fixture=${m.id}`)
        .then(r => r.json())
        .then((json: { events?: MatchEvent[] }) => {
          if (json.events?.length) {
            setMatchEvents(prev => ({ ...prev, [m.id]: json.events! }))
            // Pre-mark all existing events as seen so we don't notify about past events on load
            for (const evt of json.events!) {
              seenEventsRef.current.add(`${m.id}-${evt.elapsed}-${evt.type}-${evt.detail}-${evt.team_id}`)
            }
          }
        })
        .catch(() => {})
    }
  }, [matches])

  const stopLiveRefresh = () => {
    if (liveRefreshRef.current) { clearInterval(liveRefreshRef.current); liveRefreshRef.current = null }
  }

  const doLiveFetch = async () => {
    try {
      const res = await fetch('/api/prode/live')
      const json = await res.json()
      if (!json.live?.length) {
        stopLiveRefresh()
        // If we were tracking live matches and they just ended, auto-sync to capture final scores + FT status
        if (wasLiveRef.current) {
          wasLiveRef.current = false
          fetch('/api/prode/sync', { method: 'POST' })
            .then(() => Promise.all([
              supabase.from('prode_matches').select('*').order('sort_order'),
              supabase.from('prode_standings').select('*').order('group_name').order('rank'),
            ]))
            .then(([{ data: ms }, { data: st }]) => {
              if (ms) setMatches(ms as Match[])
              if (st) setStandings(st as Standing[])
              // Refresh server scores after matches finalize
              fetch(`/api/prode/${id}/scores`)
                .then(r => r.ok ? r.json() : null)
                .then((data: { user_id: string; pts: number }[] | null) => {
                  if (Array.isArray(data)) setServerScores(new Map(data.map(s => [s.user_id, s.pts])))
                })
                .catch(() => {})
            })
            .catch(() => {})
        }
        return
      }
      wasLiveRef.current = true
      setMatches(prev => prev.map(m => {
        const live = json.live.find((l: any) => l.id === m.id)
        return live ? { ...m, home_score: live.home_score, away_score: live.away_score, status: live.status, elapsed: live.elapsed ?? null } : m
      }))
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        for (const lm of json.live as any[]) {
          for (const evt of lm.events ?? []) {
            const key = `${lm.id}-${evt.elapsed}-${evt.type}-${evt.detail}-${evt.team_id}`
            if (seenEventsRef.current.has(key)) continue
            seenEventsRef.current.add(key)
            const icon = evt.type === 'Card' ? '🟥' : evt.detail === 'Own Goal' ? '⚽ (EC)' : evt.detail === 'Penalty' ? '⚽ (P)' : '⚽'
            const title = `${icon} ${lm.home_team} ${lm.home_score} – ${lm.away_score} ${lm.away_team}`
            const body = `${evt.player} '${evt.elapsed}${evt.extra ? '+' + evt.extra : ''}`
            new Notification(title, { body, icon: '/favicon.ico' })
          }
        }
      }
    } catch {}
  }

  const startLiveRefresh = () => {
    stopLiveRefresh()
    doLiveFetch() // immediate first fetch — populates elapsed right away
    liveRefreshRef.current = setInterval(doLiveFetch, 60_000)
  }

  const handleSync = async () => {
    setSyncing(true); setSyncMsg(null)
    const res = await fetch('/api/prode/sync', { method: 'POST' })
    const json = await res.json()
    if (json.synced != null) {
      const parts = [`✓ ${json.synced} partidos`]
      if (json.standingsSynced) parts.push(`${json.standingsSynced} posiciones`)
      setSyncMsg(parts.join(' · ') + ' sincronizados')
      const [{ data: ms }, { data: st }, { data: freshPicks }] = await Promise.all([
        supabase.from('prode_matches').select('*').order('sort_order'),
        supabase.from('prode_standings').select('*').order('group_name').order('rank'),
        supabase.from('prode_stage1_picks').select('match_id,home_score,away_score,user_id,predicted_home,predicted_away,pen_winner').eq('tournament_id', id),
      ])
      const matchList = (ms ?? []) as Match[]
      setMatches(matchList)
      setStandings((st ?? []) as Standing[])
      // Reload KO picks from DB so the bracket stays consistent with updated match data.
      // Without this, a sort_order change would shift which fixture appears in each bracket slot
      // and the in-memory koEditPicks (keyed by match_id) would show at the wrong positions.
      if (user && freshPicks) {
        const groupIds = new Set(matchList.filter(m => m.stage === 'group').map(m => m.id))
        const fpTyped = freshPicks as unknown as UserPick[]
        const kopm: Record<string, {h:string;a:string;pen?:'h'|'a'}> = {}
        for (const p of fpTyped.filter(pk => pk.user_id === user.id && !groupIds.has(pk.match_id))) {
          const pen = (p.pen_winner === 'h' || p.pen_winner === 'a') ? p.pen_winner : undefined
          kopm[p.match_id] = { h: String(p.home_score ?? ''), a: String(p.away_score ?? ''), ...(pen ? { pen } : {}) }
        }
        setKoEditPicks(kopm)
        koPicksRef.current = kopm
      }
      // Refresh server-computed scores after sync (match results may have changed)
      fetch(`/api/prode/${id}/scores`)
        .then(r => r.ok ? r.json() : null)
        .then((data: { user_id: string; pts: number }[] | null) => {
          if (Array.isArray(data)) setServerScores(new Map(data.map(s => [s.user_id, s.pts])))
        })
        .catch(() => {})
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

  const koPickCount = useMemo(() =>
    Object.values(koEditPicks).filter(p => p.h !== '' && p.a !== '').length
  , [koEditPicks])

  const myPickCount = useMemo(() =>
    Object.values(myEditPicks).filter(p => p.h !== '' && p.a !== '').length
  , [myEditPicks])

  const groupMatches  = matches.filter(m => m.stage === 'group')
  // Lock group picks once the first group match kicks off; KO and specials remain always editable.
  const isGroupPicksLocked = groupMatches.length > 0
    ? Date.now() >= Math.min(...groupMatches.map(m => new Date(m.kickoff).getTime()))
    : false
  const koMatches     = matches.filter(m => m.stage !== 'group')
  const groupMatchIds = new Set(groupMatches.map(m => m.id))
  const koMatchIds    = new Set(koMatches.map(m => m.id))
  const progress = groupMatches.length > 0 ? Math.round((myPickCount / groupMatches.length) * 100) : 0
  const isAdmin = user?.id === tournament?.admin_id

  // Fixed match numbering: 12 groups × 6 = 72 group matches, then KO starts at P73
  // group P1-P72, r32 P73-P88, r16 P89-P96, qf P97-P100, sf P101-P102, 3rd P103, final P104
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

  // Inverse of matchByNum: match.id → P number (P73, P74, …)
  const matchNumById = useMemo(() => {
    const m = new Map<string, number>()
    for (const [num, match] of matchByNum) m.set(match.id, num)
    return m
  }, [matchByNum])

  // team name → "1°A" / "2°B" seed label from real standings
  const teamToSeed = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of standings) {
      if (s.group_name && s.rank) m.set(s.team_name, `${s.rank}°${s.group_name}`)
    }
    return m
  }, [standings])

  // Resolve bracket placeholder names → { label, sub } for KO team slots
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
    // Actual team name: show abbrev + seed position from standings
    return { label: abbrev(name), sub: teamToSeed.get(name) }
  }

  // For admin table: "Gan. P73" or "Winner Group A" → display string
  function resolveKo(name: string): string {
    if (!name) return '?'
    if (/^gan/i.test(name)) {
      const numMatch = name.match(/P(\d+)/i)
      if (numMatch) {
        const num = parseInt(numMatch[1])
        const ref = matchByNum.get(num)
        if (ref && ABBREV[ref.home_team] && ABBREV[ref.away_team]) {
          return `P${num} (${abbrev(ref.home_team)}-${abbrev(ref.away_team)})`
        }
        return `P${num}`
      }
    }
    return fmtKoTeam(name)
  }

  // KO matches sorted by stage for bracket computation
  const r32Ms = useMemo(() => koMatches.filter(m => m.stage === 'r32').sort((a, b) => a.sort_order - b.sort_order), [koMatches])
  const r16Ms = useMemo(() => koMatches.filter(m => m.stage === 'r16').sort((a, b) => a.sort_order - b.sort_order), [koMatches])
  const qfMs  = useMemo(() => koMatches.filter(m => m.stage === 'qf' ).sort((a, b) => a.sort_order - b.sort_order), [koMatches])
  const sfMs  = useMemo(() => koMatches.filter(m => m.stage === 'sf' ).sort((a, b) => a.sort_order - b.sort_order), [koMatches])
  const thirdMs = useMemo(() => koMatches.filter(m => m.stage === '3rd'  ).sort((a, b) => a.sort_order - b.sort_order), [koMatches])
  const finalMs = useMemo(() => koMatches.filter(m => m.stage === 'final').sort((a, b) => a.sort_order - b.sort_order), [koMatches])

  // Returns true when the string is a real team name (not an API-Football bracket placeholder)
  function isRealTeamName(name: string): boolean {
    if (!name) return false
    return !name.match(/winner|runner[\s-]up|gan[.\s]|gan\s+p\d|3rd\s+group|\?/i)
  }

  // Real teams confirmed at each KO stage (only available after each round is scheduled/played)
  const realR32Set = useMemo(() => new Set(r32Ms.flatMap(m => [m.home_team, m.away_team]).filter(isRealTeamName)), [r32Ms])
  const realR16Set = useMemo(() => new Set(r16Ms.flatMap(m => [m.home_team, m.away_team]).filter(isRealTeamName)), [r16Ms])
  const realQfSet  = useMemo(() => new Set(qfMs.flatMap(m => [m.home_team, m.away_team]).filter(isRealTeamName)),  [qfMs])
  const realSfSet  = useMemo(() => new Set(sfMs.flatMap(m => [m.home_team, m.away_team]).filter(isRealTeamName)),  [sfMs])

  // Team → flag URL map, built from all match data
  const teamFlagMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const match of matches) {
      if (match.home_team && match.home_flag && isRealTeamName(match.home_team)) m.set(match.home_team, match.home_flag)
      if (match.away_team && match.away_flag && isRealTeamName(match.away_team)) m.set(match.away_team, match.away_flag)
    }
    return m
  }, [matches])

  const adminGroupStandings = useMemo(() => {
    const result = new Map<string, Map<string, TeamStat[]>>()
    for (const p of participants) {
      const pm: Record<string, {h:string;a:string}> = {}
      for (const pk of predAllPicks.filter(pk => pk.user_id === p.user_id))
        pm[pk.match_id] = { h: String(pk.home_score), a: String(pk.away_score) }
      const gm = new Map<string, TeamStat[]>()
      for (const g of GROUPS) {
        const ms = groupMatches.filter(m => m.group_name === g)
        if (ms.length) gm.set(g, computeGroupStandings(ms, pm, FIFA_RANKS))
      }
      result.set(p.user_id, gm)
    }
    return result
  }, [predAllPicks, participants, groupMatches])

  const publicGroupStandings = useMemo(() => {
    const result = new Map<string, Map<string, TeamStat[]>>()
    for (const p of participants) {
      const pm: Record<string, {h:string;a:string}> = {}
      for (const pk of predAllPicks.filter(pk => pk.user_id === p.user_id))
        pm[pk.match_id] = { h: String(pk.home_score), a: String(pk.away_score) }
      const gm = new Map<string, TeamStat[]>()
      for (const g of GROUPS) {
        const ms = groupMatches.filter(m => m.group_name === g)
        if (ms.length) gm.set(g, computeGroupStandings(ms, pm, FIFA_RANKS))
      }
      result.set(p.user_id, gm)
    }
    return result
  }, [predAllPicks, participants, groupMatches])

  const orderedParticipants = useMemo(() => {
    if (!user) return participants
    const me = participants.find(p => p.user_id === user.id)
    if (!me) return participants
    return [me, ...participants.filter(p => p.user_id !== user.id)]
  }, [participants, user])

  // Per-participant group qualifiers: who each user predicts will reach R32
  const perParticipantClassified = useMemo(() => {
    const result = new Map<string, { firsts: (string|null)[]; seconds: (string|null)[]; thirds: (string|null)[] }>()
    for (const p of participants) {
      const gs = adminGroupStandings.get(p.user_id)
      const firsts  = GROUPS.map(g => gs?.get(g)?.[0]?.name ?? null)
      const seconds = GROUPS.map(g => gs?.get(g)?.[1]?.name ?? null)
      const gsRecord: Record<string, TeamStat[]> = {}
      for (const g of GROUPS) { const t = gs?.get(g); if (t) gsRecord[g] = t }
      const bestTs = computeBestThirds(gsRecord, FIFA_RANKS)
      result.set(p.user_id, { firsts, seconds, thirds: bestTs.slice(0, 8).map(t => t.name) })
    }
    return result
  }, [adminGroupStandings, participants])

  // Per-participant bracket resolution: userId → (slotId → predicted winner team name)
  // Reads directly from saved DB values: predicted_home/away + score determines winner.
  // No group-standings chain, no augmentation — always consistent with what's in the DB.
  const perParticipantBracket = useMemo(() => {
    const result = new Map<string, Map<string, string>>()
    for (const p of participants) {
      const up = predAllPicks.filter(pk => pk.user_id === p.user_id)
      const bracket = new Map<string, string>()
      const addWinner = (pk: UserPick | undefined) => {
        if (!pk?.predicted_home || !pk?.predicted_away) return
        const home = pk.predicted_home
        const away = pk.predicted_away
        let winner: string | null = null
        if (pk.home_score > pk.away_score)      winner = home
        else if (pk.away_score > pk.home_score) winner = away
        else if (pk.pen_winner === 'h')         winner = home
        else if (pk.pen_winner === 'a')         winner = away
        if (!winner) return
        bracket.set(pk.match_id, winner)
        if (pk.match_id === 'ko-final') bracket.set('ko-final-runner', winner === home ? away : home)
      }
      for (let i = 0; i < 16; i++) addWinner(up.find(pk => pk.match_id === `ko-r32-${i}`))
      for (let i = 0; i < 8; i++)  addWinner(up.find(pk => pk.match_id === `ko-r16-${i}`))
      for (let i = 0; i < 4; i++)  addWinner(up.find(pk => pk.match_id === `ko-qf-${i}`))
      for (let i = 0; i < 2; i++)  addWinner(up.find(pk => pk.match_id === `ko-sf-${i}`))
      addWinner(up.find(pk => pk.match_id === 'ko-3rd'))
      addWinner(up.find(pk => pk.match_id === 'ko-final'))
      result.set(p.user_id, bracket)
    }
    return result
  }, [predAllPicks, participants])

  // Champion / runner-up / 3rd / 4th derived from each user's KO bracket picks
  const perParticipantFinals = useMemo(() => {
    type Finals = { champion: string|null; runnerUp: string|null; third: string|null; fourth: string|null }
    const result = new Map<string, Finals>()
    for (const p of participants) {
      const bracket = perParticipantBracket.get(p.user_id)
      const empty: Finals = { champion: null, runnerUp: null, third: null, fourth: null }
      if (!bracket) { result.set(p.user_id, empty); continue }

      const champion = bracket.get('ko-final') ?? null
      const sf0Win   = bracket.get('ko-sf-0') ?? null
      const sf1Win   = bracket.get('ko-sf-1') ?? null
      const runnerUp = champion
        ? (sf0Win === champion ? sf1Win : sf0Win) ?? bracket.get('ko-final-runner') ?? null
        : null

      const qf0Win   = bracket.get('ko-qf-0') ?? null
      const qf1Win   = bracket.get('ko-qf-1') ?? null
      const qf2Win   = bracket.get('ko-qf-2') ?? null
      const qf3Win   = bracket.get('ko-qf-3') ?? null
      const sf0Loser = sf0Win   ? (sf0Win === qf0Win ? qf1Win : qf0Win) : null
      const sf1Loser = sf1Win   ? (sf1Win === qf2Win ? qf3Win : qf2Win) : null
      const third    = bracket.get('ko-3rd') ?? null
      const fourth   = third    ? (third === sf0Loser ? sf1Loser : sf0Loser) : null

      result.set(p.user_id, { champion, runnerUp, third, fourth })
    }
    return result
  }, [perParticipantBracket, participants, finalMs, sfMs, qfMs, thirdMs])

  // Real final positions derived from actual match results
  const realFinals = useMemo(() => {
    const finalM = finalMs[0]
    const thirdM  = thirdMs[0]
    const champion = finalM && finalM.home_score !== null && finalM.away_score !== null
      && isRealTeamName(finalM.home_team) && isRealTeamName(finalM.away_team)
      ? (finalM.home_score > finalM.away_score ? finalM.home_team : finalM.away_score > finalM.home_score ? finalM.away_team : null)
      : null
    const runnerUp = champion && finalM
      ? (champion === finalM.home_team ? finalM.away_team : finalM.home_team)
      : null
    const third = thirdM && thirdM.home_score !== null && thirdM.away_score !== null
      && isRealTeamName(thirdM.home_team) && isRealTeamName(thirdM.away_team)
      ? (thirdM.home_score > thirdM.away_score ? thirdM.home_team : thirdM.away_score > thirdM.home_score ? thirdM.away_team : null)
      : null
    const fourth = third && thirdM
      ? (third === thirdM.home_team ? thirdM.away_team : thirdM.home_team)
      : null
    return { champion, runnerUp, third, fourth }
  }, [finalMs, thirdMs])

  const showSaved = useCallback(() => {
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 2000)
  }, [])

  const saveAll = useCallback(async () => {
    if (!user) return
    const groupEntries = (isGroupPicksLocked && !isLateJoin)
      ? []
      : Object.entries(picksEditRef.current).filter(([, v]) => v.h !== '' && v.a !== '')
    const koEntries    = Object.entries(koPicksRef.current).filter(([, v]) => v.h !== '' && v.a !== '')
    if (!groupEntries.length && !koEntries.length) return
    setSaveStatus('saving')
    setSaveError(null)
    const rows = [
      ...groupEntries.map(([matchId, v]) => ({
        tournament_id: id, user_id: user.id, match_id: matchId,
        home_score: parseInt(v.h), away_score: parseInt(v.a),
        updated_at: new Date().toISOString(),
      })),
      ...koEntries.map(([matchId, v]) => {
        const node = bracketNodeByIdRef.current.get(matchId)
        return {
          tournament_id: id, user_id: user.id, match_id: matchId,
          home_score: parseInt(v.h), away_score: parseInt(v.a),
          predicted_home: node?.home?.name ?? null,
          predicted_away: node?.away?.name ?? null,
          pen_winner: v.pen ?? null,
          updated_at: new Date().toISOString(),
        }
      }),
    ]
    let error: any = null
    if (isLateJoin) {
      const res = await fetch(`/api/prode/${id}/late-join-save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ picks: rows }),
      })
      if (!res.ok) error = true
    } else {
      const result = await supabase.from('prode_stage1_picks').upsert(rows as any[], { onConflict: 'tournament_id,user_id,match_id' })
      error = result.error
    }
    if (!error) {
      showSaved()
      const updatePicks = (prev: UserPick[]) => {
        let updated = [...prev]
        for (const row of rows) {
          updated = updated.filter(pk => !(pk.user_id === user.id && pk.match_id === row.match_id))
          updated.push({ user_id: user.id, match_id: row.match_id, home_score: row.home_score, away_score: row.away_score, predicted_home: (row as any).predicted_home ?? null, predicted_away: (row as any).predicted_away ?? null, pen_winner: (row as any).pen_winner ?? null })
        }
        return updated
      }
      setPredAllPicks(updatePicks)
      if (koEntries.length) {
        setAdminAllPicks(updatePicks)
      }
    } else {
      setSaveStatus('idle')
      setSaveError(typeof error === 'object' && error?.message ? error.message : 'Error al guardar')
    }
  }, [id, user, showSaved, isGroupPicksLocked, isLateJoin, matches])

  const toggleGroup = (g: string) => setOpenGroups(prev => {
    const next = new Set(prev)
    if (next.has(g)) next.delete(g); else next.add(g)
    return next
  })

  const handlePickChange = (matchId: string, side: 'h'|'a', value: string) => {
    if (isGroupPicksLocked && !isLateJoin) return
    if (isLateJoin) {
      const m = matches.find(mx => mx.id === matchId)
      if (m && Date.now() >= new Date(m.kickoff).getTime()) return
    }
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

  const handleBonusSave = useCallback(async (b: Record<string, string>) => {
    setBonus(b)
    if (user?.id && id) localStorage.setItem(`prode_bonus_${id}_${user.id}`, JSON.stringify(b))
    if (!user?.id || !id) return
    await supabase.from('prode_stage1_specials').upsert(
      {
        tournament_id: id, user_id: user.id,
        balon_oro:        b.balon_oro        || null,
        guante_oro:       b.guante_oro       || null,
        botin_oro:        b.botin_oro        || null,
        fair_play:        b.fair_play        || null,
        revelacion:       b.revelacion       || null,
        goleada_match_id: b.goleada_match_id || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tournament_id,user_id' }
    )
  }, [id, user, supabase])

  const handleTogglePaid = async (targetUserId: string, currentPaid: boolean) => {
    const res = await fetch('/api/prode/mark-paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournament_id: id, user_id: targetUserId, paid: !currentPaid }),
    })
    if (res.ok) setParticipants(prev => prev.map(p => p.user_id === targetUserId ? { ...p, paid: !currentPaid } : p))
  }

  const leaderboard = useMemo(() => {
    return participants.map(p => {
      const name = p.profiles?.nombre
        ? `${p.profiles.nombre} ${p.profiles.apellido ?? ''}`.trim()
        : p.profiles?.username ?? 'Jugador'
      // Server scores use admin client — same data for all users regardless of RLS or client staleness
      const pts = (isGroupPicksLocked && serverScores !== null) ? (serverScores.get(p.user_id) ?? 0) : null
      return { user_id: p.user_id, name, pick_count: p.pick_count ?? 0, pts, paid: p.paid }
    }).sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0) || (b.pick_count ?? 0) - (a.pick_count ?? 0))
  }, [participants, isGroupPicksLocked, serverScores])

  const TABS: { key: Tab; label: string }[] = [
    { key: 'home', label: 'Home' },
    ...(isParticipant ? [{ key: 'predicciones' as Tab, label: 'Predicciones' }] : []),
    { key: 'predecir', label: 'Predecir' },
    { key: 'tabla', label: 'Tabla' },
    { key: 'posiciones', label: 'Posiciones' },
    { key: 'fixture', label: 'Fixture' },
    { key: 'info', label: 'Info' },
    { key: 'reglamento', label: 'Reglamento' },
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

    // Always use stable slot IDs for picks — never real match IDs.
    // Real match data (kickoff, venue) is passed separately for display only.
    const id32 = (i: number) => `ko-r32-${i}`
    const id16 = (i: number) => `ko-r16-${i}`
    const idQf = (i: number) => `ko-qf-${i}`
    const idSf = (i: number) => `ko-sf-${i}`
    const idTh = () => 'ko-3rd'
    const idFn = () => 'ko-final'

    const r32 = [
      mkNode(id32(0),  getGrp(2,'A'), getGrp(2,'B'), '2° A','2° B', r32Ms[0]?.kickoff, r32Ms[0]?.venue ?? undefined),  // P73
      mkNode(id32(1),  getGrp(1,'E'), get3rd(0),     '1° E','3° mejor', r32Ms[1]?.kickoff, r32Ms[1]?.venue ?? undefined),  // P74
      mkNode(id32(2),  getGrp(1,'F'), getGrp(2,'C'), '1° F','2° C', r32Ms[2]?.kickoff, r32Ms[2]?.venue ?? undefined),  // P75
      mkNode(id32(3),  getGrp(1,'C'), getGrp(2,'F'), '1° C','2° F', r32Ms[3]?.kickoff, r32Ms[3]?.venue ?? undefined),  // P76
      mkNode(id32(4),  getGrp(1,'I'), get3rd(1),     '1° I','3° mejor', r32Ms[4]?.kickoff, r32Ms[4]?.venue ?? undefined),  // P77
      mkNode(id32(5),  getGrp(2,'E'), getGrp(2,'I'), '2° E','2° I', r32Ms[5]?.kickoff, r32Ms[5]?.venue ?? undefined),  // P78
      mkNode(id32(6),  getGrp(1,'A'), get3rd(2),     '1° A','3° mejor', r32Ms[6]?.kickoff, r32Ms[6]?.venue ?? undefined),  // P79
      mkNode(id32(7),  getGrp(1,'L'), get3rd(3),     '1° L','3° mejor', r32Ms[7]?.kickoff, r32Ms[7]?.venue ?? undefined),  // P80
      mkNode(id32(8),  getGrp(1,'D'), get3rd(4),     '1° D','3° mejor', r32Ms[8]?.kickoff, r32Ms[8]?.venue ?? undefined),  // P81
      mkNode(id32(9),  getGrp(1,'G'), get3rd(5),     '1° G','3° mejor', r32Ms[9]?.kickoff, r32Ms[9]?.venue ?? undefined),  // P82
      mkNode(id32(10), getGrp(2,'K'), getGrp(2,'L'), '2° K','2° L', r32Ms[10]?.kickoff, r32Ms[10]?.venue ?? undefined), // P83
      mkNode(id32(11), getGrp(1,'H'), getGrp(2,'J'), '1° H','2° J', r32Ms[11]?.kickoff, r32Ms[11]?.venue ?? undefined), // P84
      mkNode(id32(12), getGrp(1,'B'), get3rd(6),     '1° B','3° mejor', r32Ms[12]?.kickoff, r32Ms[12]?.venue ?? undefined), // P85
      mkNode(id32(13), getGrp(1,'J'), getGrp(2,'H'), '1° J','2° H', r32Ms[13]?.kickoff, r32Ms[13]?.venue ?? undefined), // P86
      mkNode(id32(14), getGrp(1,'K'), get3rd(7),     '1° K','3° mejor', r32Ms[14]?.kickoff, r32Ms[14]?.venue ?? undefined), // P87
      mkNode(id32(15), getGrp(2,'D'), getGrp(2,'G'), '2° D','2° G', r32Ms[15]?.kickoff, r32Ms[15]?.venue ?? undefined), // P88
    ]
    // R16 — official WC2026 routing (not sequential)
    const r16 = [
      mkNode(id16(0), r32[1].winner,  r32[4].winner,  'Gan. P74','Gan. P77', r16Ms[0]?.kickoff, r16Ms[0]?.venue ?? undefined), // P89
      mkNode(id16(1), r32[0].winner,  r32[2].winner,  'Gan. P73','Gan. P75', r16Ms[1]?.kickoff, r16Ms[1]?.venue ?? undefined), // P90
      mkNode(id16(2), r32[3].winner,  r32[5].winner,  'Gan. P76','Gan. P78', r16Ms[2]?.kickoff, r16Ms[2]?.venue ?? undefined), // P91
      mkNode(id16(3), r32[6].winner,  r32[7].winner,  'Gan. P79','Gan. P80', r16Ms[3]?.kickoff, r16Ms[3]?.venue ?? undefined), // P92
      mkNode(id16(4), r32[10].winner, r32[11].winner, 'Gan. P83','Gan. P84', r16Ms[4]?.kickoff, r16Ms[4]?.venue ?? undefined), // P93
      mkNode(id16(5), r32[8].winner,  r32[9].winner,  'Gan. P81','Gan. P82', r16Ms[5]?.kickoff, r16Ms[5]?.venue ?? undefined), // P94
      mkNode(id16(6), r32[13].winner, r32[15].winner, 'Gan. P86','Gan. P88', r16Ms[6]?.kickoff, r16Ms[6]?.venue ?? undefined), // P95
      mkNode(id16(7), r32[12].winner, r32[14].winner, 'Gan. P85','Gan. P87', r16Ms[7]?.kickoff, r16Ms[7]?.venue ?? undefined), // P96
    ]
    // QF — official WC2026 routing
    const qf = [
      mkNode(idQf(0), r16[0].winner, r16[1].winner, 'Gan. P89','Gan. P90', qfMs[0]?.kickoff, qfMs[0]?.venue ?? undefined), // P97
      mkNode(idQf(1), r16[4].winner, r16[5].winner, 'Gan. P93','Gan. P94', qfMs[1]?.kickoff, qfMs[1]?.venue ?? undefined), // P98
      mkNode(idQf(2), r16[2].winner, r16[3].winner, 'Gan. P91','Gan. P92', qfMs[2]?.kickoff, qfMs[2]?.venue ?? undefined), // P99
      mkNode(idQf(3), r16[6].winner, r16[7].winner, 'Gan. P95','Gan. P96', qfMs[3]?.kickoff, qfMs[3]?.venue ?? undefined), // P100
    ]
    const sf = [
      mkNode(idSf(0), qf[0].winner, qf[1].winner, 'Gan. P97','Gan. P98',  sfMs[0]?.kickoff, sfMs[0]?.venue ?? undefined), // P101
      mkNode(idSf(1), qf[2].winner, qf[3].winner, 'Gan. P99','Gan. P100', sfMs[1]?.kickoff, sfMs[1]?.venue ?? undefined), // P102
    ]
    const third = mkNode(idTh(), sf[0].loser, sf[1].loser, 'Per. P101','Per. P102', thirdMs[0]?.kickoff, thirdMs[0]?.venue ?? undefined)
    const final = mkNode(idFn(), sf[0].winner, sf[1].winner, 'Gan. P101','Gan. P102', finalMs[0]?.kickoff, finalMs[0]?.venue ?? undefined)

    // Build label map: real match ID → display label (P73, P89, FINAL, etc.)
    const matchLabels = new Map<string, string>()
    r32.forEach((n, i) => matchLabels.set(n.id, `P${73 + i}`))
    r16.forEach((n, i) => matchLabels.set(n.id, `P${89 + i}`))
    qf.forEach( (n, i) => matchLabels.set(n.id, `P${97 + i}`))
    sf.forEach( (n, i) => matchLabels.set(n.id, `P${101 + i}`))
    matchLabels.set(third.id, '3°/4° Puesto')
    matchLabels.set(final.id, 'FINAL')

    return { r32, r16, qf, sf, third, final, matchLabels }
  }, [allGroupStandings, bestThirds, koEditPicks, matches])

  // Keep bracketNodeByIdRef in sync so saveAll can read predicted teams without stale closure
  useEffect(() => {
    const m = new Map<string, KoMatchNode>()
    const nodes = [...bracketData.r32, ...bracketData.r16, ...bracketData.qf, ...bracketData.sf, bracketData.third, bracketData.final]
    for (const n of nodes) if (n) m.set(n.id, n)
    bracketNodeByIdRef.current = m
  }, [bracketData])

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
            disabled={(isGroupPicksLocked && !isLateJoin) || (isLateJoin && Date.now() >= new Date(m.kickoff).getTime())} placeholder="—"
            style={{ borderColor: filled ? RED : BORDER, color: filled ? RED : TEXT }}
          />
          <span style={{ color: MUTED, fontFamily: FONT_NORMAL, fontSize: 10, flexShrink: 0 }}>-</span>
          <input type="text" inputMode="numeric" className="grp-inp"
            value={p.a} onChange={e => handlePickChange(m.id, 'a', e.target.value)}
            disabled={(isGroupPicksLocked && !isLateJoin) || (isLateJoin && Date.now() >= new Date(m.kickoff).getTime())} placeholder="—"
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

  const koMatchLabel = (id: string): string =>
    bracketData.matchLabels.get(id) ?? id

  const KoMatchCard = ({ m }: { m: KoMatchNode }) => {
    const pick = koEditPicks[m.id] ?? { h: '', a: '' }
    const filled = pick.h !== '' && pick.a !== ''
    const noTeams = !m.home || !m.away
    const label = koMatchLabel(m.id)
    const isFinal = label === 'FINAL'
    const is3rd = label === '3°/4° Puesto'
    return (
      <div style={{ background: 'rgba(255,255,255,0.92)', border: isFinal ? `1.5px solid ${GOLD}` : `1.5px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ background: isFinal ? GOLD : is3rd ? '#8B6914' : NAVY, padding: isFinal ? '8px 12px' : '5px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: FONT_BLACK, fontSize: isFinal ? 13 : 10, color: '#fff', letterSpacing: 0.5 }}>{label}</span>
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
    const liveLabel = m.status === 'HT' ? 'ET' : m.status === 'ET' ? 'PRÓRROGA' : m.status === 'BT' ? 'PENALES' : 'EN VIVO'
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
                {m.status !== 'HT' && m.elapsed != null && <span style={{ fontWeight: 700 }}>&apos;{m.elapsed}</span>}
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
    const liveLabel = m.status === 'HT' ? 'ET' : m.status === 'ET' ? 'PRÓRROGA' : m.status === 'BT' ? 'PENALES' : 'EN VIVO'
    const myPick = myEditPicks[m.id]
    const hasPick = !!(myPick && myPick.h !== '' && myPick.a !== '')
    const pickScore = hasPick
      ? calcScore({ match_id: m.id, home_score: parseInt(myPick.h), away_score: parseInt(myPick.a), user_id: '' }, m)
      : null
    const events = matchEvents[m.id] ?? []

    const timeStr = new Date(m.kickoff).toLocaleTimeString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false,
    })

    const barColor = m.stage === 'group' && m.group_name
      ? (GROUP_COLORS[m.group_name] ?? '#20298b')
      : (STAGE_COLORS[m.stage] ?? '#20298b')

    const scoreColor = isDone ? '#20298b' : isLive ? '#18b26b' : '#b9c3d1'

    const pickColor = pickScore === null ? MUTED
      : pickScore >= 12 ? '#10b981'
      : pickScore >= 7 ? '#0ea5e9'
      : pickScore >= 5 ? '#d97706'
      : pickScore >= 2 ? '#f97316'
      : RED
    const SCORE_LABELS: Record<number, string> = { 12: 'EXACTO', 7: 'RESULTADO+GOL', 5: 'PARCIAL', 2: 'UN GOL', 0: 'FALLASTE' }

    const eventDisplay = (e: MatchEvent) => {
      if (e.type === 'Card') {
        if (e.detail === 'Red Card') return { icon: '🟥', accent: '#dc2626' }
        if (e.detail === 'Yellow Red Card') return { icon: '🟨🟥', accent: '#dc2626' }
        return { icon: '🟨', accent: '#eab308' }
      }
      if (e.detail === 'Own Goal') return { icon: '⚽ (EC)', accent: '#dc2626' }
      if (e.detail === 'Penalty') return { icon: '⚽ (P)', accent: '#16a34a' }
      return { icon: '⚽', accent: '#16a34a' }
    }

    const allEvents = [...events].sort((a, b) => a.elapsed - b.elapsed)
    const isExpanded = isDone ? expandedMatches.has(m.id) : true

    return (
      <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden',
        boxShadow: isLive ? '0 0 0 2px #10b981, 0 4px 20px rgba(16,185,129,0.15)' : '0 2px 12px rgba(0,0,0,0.12)' }}>

        {/* ── HEADER ── */}
        <div
          style={{ background: barColor, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', gap: 12, cursor: isDone ? 'pointer' : 'default', minHeight: isDone && !isExpanded ? 46 : 58 }}
          onClick={isDone ? () => toggleMatchExpand(m.id) : undefined}
        >
          {isDone && !isExpanded ? (
            <>
              <span style={{ fontFamily: FONT_BLACK, fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0 }}>
                {m.stage === 'group' ? `GR ${m.group_name ?? '?'}` : STAGE_LABEL[m.stage]?.toUpperCase()}
              </span>
              <span style={{ flex: 1, fontFamily: FONT_BLACK, fontSize: 13, fontWeight: 900, color: '#fff', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 10px' }}>
                {abbrev(m.home_team)} {m.home_score} – {m.away_score} {abbrev(m.away_team)}
              </span>
              <span style={{ fontFamily: FONT_NORMAL, fontSize: 11, color: 'rgba(255,255,255,0.55)', flexShrink: 0 }}>▼</span>
            </>
          ) : (
            <>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: FONT_BLACK, fontSize: 15, fontWeight: 800, color: '#fff', textTransform: 'uppercase', lineHeight: 1 }}>
                  {m.stage === 'group' ? `GRUPO ${m.group_name ?? '?'}` : STAGE_LABEL[m.stage]?.toUpperCase()}
                </div>
                {m.venue && (
                  <div style={{ fontFamily: FONT_NORMAL, fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.95)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.venue}
                  </div>
                )}
              </div>
              <div className="hm2-hdr-right">
                <div className="hm2-badge" style={{ background: isLive ? '#18b26b' : isDone ? '#4b5563' : '#36a8ff', color: '#fff', fontFamily: FONT_BLACK, fontWeight: 800, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 5 }}>
                  {isLive && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ff3b3b', display: 'inline-block', animation: 'livePulse 1.2s infinite', flexShrink: 0 }} />}
                  {isLive ? liveLabel : isDone ? 'FINAL' : 'PRÓXIMO'}
                  {isLive && m.status !== 'HT' && m.elapsed != null && (
                    <span style={{ fontFamily: FONT_NORMAL, fontWeight: 700, fontSize: 11, opacity: 0.9 }}>&apos;{m.elapsed}</span>
                  )}
                </div>
                {!isDone && !isLive && (
                  <>
                    <div className="hm2-hdiv" />
                    <span className="hm2-time" style={{ fontFamily: FONT_BLACK, fontWeight: 800, color: '#fff' }}>{timeStr} HS</span>
                  </>
                )}
                {isDone && (
                  <span style={{ fontFamily: FONT_NORMAL, fontSize: 11, color: 'rgba(255,255,255,0.55)', paddingLeft: 8 }}>▲</span>
                )}
              </div>
            </>
          )}
        </div>

        {isExpanded && (<>

        {/* ── MATCH AREA ── */}
        <div className="hm2-match">
          {/* Left flag */}
          <div className="hm2-flag">
            <img src={m.home_flag} alt="" aria-hidden
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>

          {/* Home name */}
          {(() => { const { label, sub } = resolveTeam(m.home_team); return (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', paddingRight: 12, minWidth: 0 }}>
              <span className="hm2-name" style={{ fontFamily: FONT_COND, color: '#111', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'right' }}>{label}</span>
              {sub && <span style={{ fontFamily: FONT_NORMAL, fontSize: 9, color: '#9ca3af', letterSpacing: 0.3, textTransform: 'uppercase', textAlign: 'right', lineHeight: 1.2, marginTop: 2 }}>{sub}</span>}
            </div>
          )})()}

          {/* Score cluster */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div className="hm2-sbox" style={{ borderRadius: 8, border: '1.5px solid #dde1e8', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="hm2-stxt" style={{ fontFamily: FONT_BLACK, fontWeight: 900, color: scoreColor }}>
                {isDone || isLive ? (m.home_score ?? 0) : '—'}
              </span>
            </div>
            <span style={{ fontFamily: FONT_NORMAL, fontSize: 11, color: '#b0b8c4', lineHeight: 1 }}>
              {isDone || isLive ? '-' : 'vs'}
            </span>
            <div className="hm2-sbox" style={{ borderRadius: 8, border: '1.5px solid #dde1e8', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="hm2-stxt" style={{ fontFamily: FONT_BLACK, fontWeight: 900, color: scoreColor }}>
                {isDone || isLive ? (m.away_score ?? 0) : '—'}
              </span>
            </div>
          </div>

          {/* Away name */}
          {(() => { const { label, sub } = resolveTeam(m.away_team); return (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', paddingLeft: 12, minWidth: 0 }}>
              <span className="hm2-name" style={{ fontFamily: FONT_COND, color: '#111', letterSpacing: 1, textTransform: 'uppercase' }}>{label}</span>
              {sub && <span style={{ fontFamily: FONT_NORMAL, fontSize: 9, color: '#9ca3af', letterSpacing: 0.3, textTransform: 'uppercase', lineHeight: 1.2, marginTop: 2 }}>{sub}</span>}
            </div>
          )})()}

          {/* Right flag */}
          <div className="hm2-flag">
            <img src={m.away_flag} alt="" aria-hidden
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        </div>

        {/* ── PREDICTION ── */}
        {user && isParticipant && (
          <div className="hm-pred-section" style={{ background: '#fff', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10, borderTop: `1px solid ${BORDER}` }}>
            <div style={{ fontFamily: FONT_BLACK, fontSize: 11, fontWeight: 900, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 0 }}>
              Tu predicción
            </div>
            {hasPick ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div className="hm-pred-box hm-pred-score" style={{ borderRadius: 6, border: '1px solid #d6d6d6', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_BLACK, fontWeight: 900, color: '#20298b', lineHeight: 1 }}>
                  {myPick.h} - {myPick.a}
                </div>
                {isDone && pickScore !== null && (
                  <div style={{ background: pickColor, color: '#fff', borderRadius: 6, padding: '4px 10px', fontFamily: FONT_BLACK, fontSize: 12, fontWeight: 900 }}>
                    {pickScore > 0 ? `+${pickScore}` : '—'} · {SCORE_LABELS[pickScore] ?? ''}
                  </div>
                )}
                {isLive && pickScore !== null && pickScore > 0 && (
                  <span style={{ fontFamily: FONT_NORMAL, fontSize: 10, color: '#10b981' }}>~+{pickScore} pts</span>
                )}
              </div>
            ) : (
              <div style={{ fontFamily: FONT_NORMAL, fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>Sin predicción</div>
            )}
          </div>
        )}

        {/* ── ALL PICKS (LIVE / DONE) ── */}
        {(isLive || isDone) && participants.length > 0 && (() => {
          const picksSource = predAllPicks
          const pickKey = m.stage === 'group' ? m.id : (() => {
            const stageMs = matches.filter(x => x.stage === m.stage).sort((a, b) => a.sort_order - b.sort_order)
            const idx = stageMs.findIndex(x => x.id === m.id)
            return idx >= 0 ? koSlotId(m.stage, idx) : m.id
          })()
          const rows = participants.map(p => {
            const name = p.profiles?.nombre ? p.profiles.nombre.split(' ')[0] : (p.profiles?.username ?? '?')
            const pk = picksSource.find(pk => pk.user_id === p.user_id && pk.match_id === pickKey)
            const pts = pk ? calcScore(pk, m) : null
            return { userId: p.user_id, name, pk, pts }
          }).sort((a, b) => (b.pts ?? -1) - (a.pts ?? -1))
          if (!rows.some(r => r.pk)) return null
          const SCORE_LABELS_SHORT: Record<number, string> = { 12: 'exacto', 7: 'res+gol', 5: 'parcial', 2: '1 gol', 0: '—' }
          return (
            <div style={{ borderTop: isLive ? '1px solid #d1fae5' : '1px solid #e5e7eb' }}>
              <div
                onClick={() => setExpandedPicksMatches(prev => { const s = new Set(prev); s.has(m.id) ? s.delete(m.id) : s.add(m.id); return s })}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 20px 5px', background: isLive ? '#f0fdf4' : '#f8fafc', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ fontFamily: FONT_BLACK, fontSize: 10, fontWeight: 900, color: isLive ? '#059669' : '#475569', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  {isDone ? 'Puntos' : 'Predicciones'}
                </span>
                {isLive && (
                  <span style={{ fontSize: 9, color: '#10b981', fontFamily: FONT_NORMAL, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span className="live-dot" /> en vivo
                  </span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: isLive ? '#059669' : '#9ca3af' }}>
                  {(isLive ? !expandedPicksMatches.has(m.id) : expandedPicksMatches.has(m.id)) ? '▲' : '▼'}
                </span>
              </div>
              <div style={{ background: isLive ? '#f7fef9' : '#fff', paddingBottom: 4, display: (isLive ? !expandedPicksMatches.has(m.id) : expandedPicksMatches.has(m.id)) ? 'block' : 'none' }}>
                {rows.map((row, i) => {
                  const ptColor = row.pts === null ? MUTED : row.pts >= 12 ? '#10b981' : row.pts >= 7 ? '#0ea5e9' : row.pts >= 5 ? '#d97706' : row.pts >= 2 ? '#f97316' : RED
                  return (
                    <div key={row.userId} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '5px 20px',
                      borderTop: i === 0 ? (isLive ? '1px solid #d1fae5' : '1px solid #e5e7eb') : '1px solid #f0f0f0',
                      background: row.userId === user?.id ? (isLive ? 'rgba(16,185,129,0.07)' : 'rgba(32,41,139,0.04)') : 'transparent',
                    }}>
                      <span style={{ flex: 1, fontFamily: FONT_NORMAL, fontSize: 12, fontWeight: row.userId === user?.id ? 700 : 400, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.name}
                      </span>
                      {row.pk ? (
                        <>
                          <span style={{ fontFamily: FONT_BLACK, fontSize: 11, color: '#20298b', letterSpacing: 0.3, flexShrink: 0 }}>
                            {row.pk.home_score}-{row.pk.away_score}
                          </span>
                          <span style={{ fontFamily: FONT_BLACK, fontSize: 11, fontWeight: 900, color: ptColor, flexShrink: 0, minWidth: 44, textAlign: 'right' }}>
                            {row.pts !== null ? (isLive ? `~+${row.pts}` : `+${row.pts}`) : '—'}
                          </span>
                          {isDone && row.pts !== null && (
                            <span style={{ fontFamily: FONT_NORMAL, fontSize: 9, color: ptColor, flexShrink: 0, minWidth: 50, textAlign: 'right' }}>
                              {SCORE_LABELS_SHORT[row.pts] ?? ''}
                            </span>
                          )}
                        </>
                      ) : (
                        <span style={{ fontFamily: FONT_NORMAL, fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>—</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* ── EVENTS ── */}
        {(isLive || isDone) && (
          <div style={{ borderTop: '1px solid #e5e7eb', padding: '12px 20px 16px' }}>
            <div style={{ fontFamily: FONT_BLACK, fontSize: 11, fontWeight: 900, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', marginBottom: 8 }}>
              Sucesos del partido
            </div>
            {allEvents.length === 0 ? (
              <div style={{ fontFamily: FONT_NORMAL, fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '4px 0' }}>
                Todavía no hay sucesos registrados.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {allEvents.map((e, i) => {
                  const { icon, accent } = eventDisplay(e)
                  const isHomeEvent = e.detail === 'Own Goal'
                    ? e.team_id === m.away_team_id
                    : e.team_id === m.home_team_id
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '42px 28px 1fr auto', alignItems: 'center', gap: 8, minHeight: 32, borderRadius: 10, background: '#f9fafb', padding: '7px 10px', borderLeft: `4px solid ${accent}` }}>
                      <span style={{ fontFamily: FONT_BLACK, fontSize: 12, fontWeight: 900, color: '#20298b', textAlign: 'right' }}>
                        {e.elapsed}{e.extra ? `+${e.extra}` : ''}'
                      </span>
                      <span style={{ fontSize: 14, textAlign: 'center' }}>{icon}</span>
                      <span style={{ fontFamily: FONT_NORMAL, fontSize: 12, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.player}
                      </span>
                      <span style={{ fontFamily: FONT_BLACK, fontSize: 11, color: '#6b7280', textTransform: 'uppercase' }}>
                        {isHomeEvent ? abbrev(m.home_team) : abbrev(m.away_team)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        </>)}

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

        /* ── HomeMatchCard ── */
        .hm-area {
          display: grid;
          grid-template-columns: 120px 90px 58px 64px 58px 90px 120px;
          align-items: center; justify-items: center;
          background: #f3f3f3; position: relative; height: 96px; overflow: hidden;
        }
        @media (max-width: 500px) {
          .hm-area { grid-template-columns: 48px 1fr 34px 42px 34px 1fr 48px; height: 82px; }
        }
        .hm-team { font-size: 30px; font-weight: 900; line-height: 1; }
        @media (max-width: 500px) { .hm-team { font-size: 19px; } }
        .hm-score { width: 54px; height: 54px; }
        .hm-score-text { font-size: 24px; }
        @media (max-width: 500px) { .hm-score { width: 36px; height: 36px; } .hm-score-text { font-size: 17px; } }
        .hm-icon { width: 64px; height: 86px; }
        .hm-logo-img { width: 48px; height: 48px; }
        @media (max-width: 500px) { .hm-icon { width: 42px; height: 54px; } .hm-logo-img { width: 34px; height: 34px; } }
        .hm-flag-left {
          position: absolute; left: -18px; top: 0; height: 100%; width: 150px;
          border-radius: 0 0 28px 0; object-fit: cover; z-index: 1;
        }
        .hm-flag-right {
          position: absolute; right: -18px; top: 0; height: 100%; width: 150px;
          border-radius: 0 0 0 28px; object-fit: cover; z-index: 1;
        }
        .hm-fade-left {
          position: absolute; left: 0; top: 0; height: 100%; width: 150px;
          background: linear-gradient(to right, rgba(243,243,243,0) 40%, #f3f3f3 100%);
          z-index: 2; pointer-events: none;
        }
        .hm-fade-right {
          position: absolute; right: 0; top: 0; height: 100%; width: 150px;
          background: linear-gradient(to left, rgba(243,243,243,0) 40%, #f3f3f3 100%);
          z-index: 2; pointer-events: none;
        }
        @media (max-width: 500px) {
          .hm-flag-left, .hm-flag-right { width: 76px; left: -12px; }
          .hm-flag-right { left: auto; right: -12px; }
          .hm-fade-left, .hm-fade-right { width: 76px; }
        }
        .hm-pred-section { padding: 9px 16px 10px; }
        @media (max-width: 500px) { .hm-pred-section { padding: 7px 14px 8px; } }
        .hm-pred-box { min-width: 94px; height: 36px; }
        @media (max-width: 500px) { .hm-pred-box { min-width: 64px; height: 28px; } }
        .hm-pred-score { font-size: 24px; }
        @media (max-width: 500px) { .hm-pred-score { font-size: 17px; } }

        /* ── HomeMatchCard v2 (flex) ── */
        .hm2-match { display: flex; align-items: stretch; height: 84px; background: #f5f6f8; }
        .hm2-flag { width: 90px; flex-shrink: 0; overflow: hidden; margin: 6px; border-radius: 5px; }
        .hm2-flag img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .hm2-name { font-size: 26px; font-weight: 900; line-height: 1; }
        .hm2-sbox { width: 42px; height: 42px; flex-shrink: 0; }
        .hm2-stxt { font-size: 22px; }
        .hm2-hdr-right { display: flex; align-items: center; flex-shrink: 0; }
        .hm2-badge { border-radius: 4px; padding: 6px 12px; font-size: 12px; }
        .hm2-hdiv { width: 1px; height: 18px; background: rgba(255,255,255,0.35); margin: 0 14px; }
        .hm2-time { font-size: 13px; }
        @media (max-width: 500px) {
          .hm2-match { height: 72px; }
          .hm2-flag { width: 66px; margin: 5px; border-radius: 4px; }
          .hm2-name { font-size: 20px; }
          .hm2-sbox { width: 34px; height: 34px; }
          .hm2-stxt { font-size: 17px; }
          .hm2-hdr-right { flex-direction: column; align-items: flex-end; gap: 3px; }
          .hm2-badge { padding: 3px 8px; font-size: 10px; }
          .hm2-hdiv { display: none; }
          .hm2-time { font-size: 12px; }
        }
      `}</style>

      <div className="t-page">

        {/* ── NOTIF PERMISSION BANNER ── */}
        {notifPermission === 'default' && (
          <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, fontFamily: FONT_NORMAL, color: '#92400e' }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>🔔</span>
            <span style={{ flex: 1 }}>Activar notificaciones para recibir alertas de goles y tarjetas rojas en vivo</span>
            <button
              onClick={() => Notification.requestPermission().then(p => setNotifPermission(p))}
              style={{ padding: '4px 12px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, fontFamily: FONT_BLACK, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
            >Activar</button>
            <button
              onClick={() => setNotifPermission('denied')}
              style={{ background: 'none', border: 'none', color: '#92400e', cursor: 'pointer', fontSize: 16, padding: '0 2px', flexShrink: 0, opacity: 0.6 }}
            >✕</button>
          </div>
        )}

        {/* ── GLOBAL SAVE ERROR BANNER ── */}
        {saveError && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, background: '#dc2626', color: '#fff', fontFamily: FONT_NORMAL, fontSize: 12, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Error al guardar: {saveError}</span>
            <button onClick={() => setSaveError(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>✕</button>
          </div>
        )}

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

                  {isGroupPicksLocked && !isLateJoin && (
                    <div style={{ background: '#fff0f1', borderRadius: 10, border: '1px solid #ffc0c5', padding: '10px 14px', marginBottom: 14, fontFamily: FONT_NORMAL }}>
                      <div style={{ fontSize: 13, color: RED, fontWeight: 900, fontFamily: FONT_BLACK }}>Fase de grupos cerrada.</div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>Todavía podés editar la llave KO y los adicionales.</div>
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
                            15 puntos cada una. Se guardan automáticamente.
                          </div>
                          <BonusSection
                            initialBonus={bonus}
                            bonusVersion={bonusVersion}
                            groupMatches={matches.filter(m => m.stage === 'group')}
                            onSave={handleBonusSave}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {/* Barra sticky de guardado */}
              {isParticipant && (
                <div style={{
                  position: 'fixed', bottom: 0, left: 0, right: 0,
                  background: 'rgba(255,255,255,0.97)',
                  borderTop: `1px solid ${BORDER}`,
                  padding: '10px 20px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  zIndex: 99,
                }}>
                  <div>
                    {!isGroupPicksLocked && (
                      <>
                        <div style={{ fontSize: 12, color: TEXT, fontFamily: FONT_NORMAL, fontWeight: 600 }}>
                          {myPickCount}/{groupMatches.length} grupos · {koPickCount} llave
                        </div>
                        <div className="prog-bar" style={{ width: 110, marginTop: 4 }}>
                          <div className="prog-fill" style={{ width: `${progress}%` }} />
                        </div>
                      </>
                    )}
                    {isGroupPicksLocked && !isLateJoin && (
                      <div style={{ fontSize: 12, color: TEXT, fontFamily: FONT_NORMAL, fontWeight: 600 }}>
                        {koPickCount > 0 ? `${koPickCount} picks de llave` : 'Grupos cerrados · editá la llave'}
                      </div>
                    )}
                    {isGroupPicksLocked && isLateJoin && (
                      <div style={{ fontSize: 12, color: TEXT, fontFamily: FONT_NORMAL, fontWeight: 600 }}>
                        {myPickCount > 0 || koPickCount > 0 ? `${myPickCount} grupos · ${koPickCount} llave` : 'Ingresá picks para guardar'}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={saveAll}
                    disabled={saveStatus === 'saving' || ((isGroupPicksLocked && !isLateJoin) ? koPickCount === 0 : myPickCount === 0 && koPickCount === 0)}
                    style={{
                      padding: '10px 22px',
                      background: saveStatus === 'saved' ? '#10b981' : TEXT,
                      color: '#fff', border: 'none', borderRadius: 8,
                      fontFamily: FONT_NORMAL, fontSize: 13, fontWeight: 600,
                      cursor: saveStatus === 'saving' ? 'wait' : 'pointer',
                      transition: 'background 0.25s',
                      opacity: (isGroupPicksLocked && !isLateJoin ? koPickCount === 0 : myPickCount === 0 && koPickCount === 0) ? 0.35 : 1,
                    }}
                  >
                    {saveStatus === 'saving' ? 'Guardando...' : saveStatus === 'saved' ? '✓ Guardado' : 'Guardar'}
                  </button>
                  {saveError && (
                    <div style={{ color: '#dc2626', fontSize: 11, fontFamily: FONT_NORMAL, marginTop: 6 }}>
                      Error: {saveError}
                    </div>
                  )}
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

                  {/* Knockout stages — HomeMatchCard so picks/scores are visible */}
                  {(['r32','r16','qf','sf','3rd','final'] as const).map(stage => {
                    const ms = matches.filter(m => m.stage === stage).sort((a, b) => a.sort_order - b.sort_order)
                    if (!ms.length) return null
                    return (
                      <div key={stage} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 900, color: TEXT, letterSpacing: 1, textTransform: 'uppercase', fontFamily: FONT_BLACK, marginBottom: 8 }}>
                          🏆 {STAGE_LABEL[stage]}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {ms.map(m => <HomeMatchCard key={m.id} m={m} />)}
                        </div>
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
                  <div style={{ width: 52, textAlign: 'center', fontSize: 10, fontWeight: 900, color: isGroupPicksLocked ? '#ffcc00' : '#fff', fontFamily: FONT_BLACK }}>PTS</div>
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
                    <div style={{ width: 52, textAlign: 'center', fontSize: 15, fontWeight: 900, color: isGroupPicksLocked ? TEXT : MUTED, fontFamily: FONT_COND }}>
                      {isGroupPicksLocked ? (serverScores !== null ? (p.pts ?? 0) : '·') : '—'}
                    </div>
                  </div>
                ))}
              </Card>
              {!isGroupPicksLocked && (
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
              {/* Admin sub-tab nav */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                {(['pagos','partidos','grupos','clasificados','cruces','ko','premios'] as const)
                  .filter(k => (k !== 'cruces' && k !== 'ko') || koMatches.length > 0)
                  .map(k => (
                    <button
                      key={k}
                      onClick={() => setAdminTab(k)}
                      style={{
                        padding: '6px 16px', border: `1.5px solid ${adminTab === k ? RED : BORDER}`,
                        background: adminTab === k ? RED : '#fff', color: adminTab === k ? '#fff' : TEXT,
                        borderRadius: 20, fontFamily: FONT_BLACK, fontSize: 11, cursor: 'pointer',
                      }}
                    >
                      {{ pagos: 'Pagos', partidos: 'Partidos', grupos: 'Grupos', clasificados: 'Clasificados', cruces: 'Cruces KO', ko: 'Picks KO', premios: 'Premios' }[k]}
                    </button>
                  ))}
              </div>

              {/* ── Pagos ── */}
              {adminTab === 'pagos' && (
                <Card>
                  <SectionTitle>Pagos y predicciones</SectionTitle>
                  <div style={{ fontSize: 11, color: MUTED, fontFamily: FONT_NORMAL, marginBottom: 12 }}>
                    {participants.filter(p => p.paid).length}/{participants.length} pagados · {participants.filter(p => (p.pick_count ?? 0) >= groupMatches.length).length}/{participants.length} con predicciones completas
                  </div>
                  {participants.map(p => {
                    const name = p.profiles?.nombre
                      ? `${p.profiles.nombre} ${p.profiles.apellido ?? ''}`.trim()
                      : p.profiles?.username ?? 'Jugador'
                    const userPicksList = adminAllPicks.filter(pk => pk.user_id === p.user_id)
                    const pts = isGroupPicksLocked
                      ? userPicksList.reduce((acc, pk) => { const m = matches.find(m => m.id === pk.match_id); return acc + (m ? (calcScore(pk, m) ?? 0) : 0) }, 0)
                      : null
                    const groupPickCount = userPicksList.filter(pk => groupMatchIds.has(pk.match_id)).length
                    const koPickCount    = userPicksList.filter(pk => koMatchIds.has(pk.match_id)).length
                    const special        = adminSpecials.find(s => s.user_id === p.user_id)
                    const bonusFilled    = special ? SPECIAL_LABELS.filter(f => (special as any)[f.key]).length : 0
                    return (
                      <div key={p.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: `1px solid ${BORDER}` }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: FONT_NORMAL, fontWeight: 600, fontSize: 13, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {name}{p.user_id === user?.id ? ' (vos)' : ''}
                          </div>
                          <div style={{ fontFamily: FONT_NORMAL, fontSize: 10, color: MUTED, marginTop: 2 }}>
                            Grupos: {groupPickCount}/{groupMatches.length}{koMatches.length > 0 && ` · KO: ${koPickCount}/${koMatches.length}`} · Adicionales: {bonusFilled}/{SPECIAL_LABELS.length}{isGroupPicksLocked && ` · ${pts} pts`}
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
              )}

              {/* ── Partidos (fase de grupos) ── */}
              {adminTab === 'partidos' && (
                <Card>
                  <SectionTitle>Partidos — Fase de Grupos</SectionTitle>
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
                                {p.profiles?.nombre ? p.profiles.nombre.split(' ')[0] : (p.profiles?.username ?? '?')}
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
              )}

              {/* ── Grupos — orden predicho por grupo ── */}
              {adminTab === 'grupos' && (
                <Card>
                  <SectionTitle>Orden de Grupos</SectionTitle>
                  {adminAllPicks.length === 0 ? (
                    <div style={{ fontSize: 12, color: MUTED, fontFamily: FONT_NORMAL, padding: '12px 0' }}>Cargando predicciones...</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
                        <thead>
                          <tr style={{ background: TEXT }}>
                            <th style={{ padding: '8px 10px', textAlign: 'left', color: '#fff', fontFamily: FONT_BLACK, fontSize: 10, position: 'sticky', left: 0, background: TEXT, whiteSpace: 'nowrap', minWidth: 60 }}>Pos</th>
                            <th style={{ padding: '8px 6px', textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontFamily: FONT_NORMAL, fontSize: 9, whiteSpace: 'nowrap' }}>Real</th>
                            {participants.map(p => (
                              <th key={p.user_id} style={{ padding: '8px 4px', textAlign: 'center', color: '#fff', fontFamily: FONT_BLACK, fontSize: 9, whiteSpace: 'nowrap', minWidth: 52 }}>
                                {p.profiles?.nombre ? p.profiles.nombre.split(' ')[0] : (p.profiles?.username ?? '?')}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {GROUPS.filter(g => groupMatches.some(m => m.group_name === g)).flatMap(g => {
                            const grpColor = GROUP_COLORS[g] ?? TEXT
                            const realPos = [1,2,3,4].map(rank => standings.find(s => s.group_name === g && s.rank === rank)?.team_name ?? null)
                            return [
                              <tr key={`grp-hdr-${g}`}>
                                <td colSpan={participants.length + 2} style={{ background: grpColor, color: '#fff', fontFamily: FONT_BLACK, fontSize: 10, padding: '5px 10px', letterSpacing: 0.5 }}>
                                  GRUPO {g}
                                </td>
                              </tr>,
                              ...[0,1,2,3].map(posIdx => {
                                const realTeam = realPos[posIdx]
                                const rowBg = posIdx % 2 === 0 ? '#fff' : '#f9f9f9'
                                const posColor = posIdx < 2 ? '#16a34a' : posIdx === 2 ? '#ca8a04' : MUTED
                                return (
                                  <tr key={`${g}-${posIdx}`} style={{ background: rowBg, borderBottom: `1px solid ${BORDER}` }}>
                                    <td style={{ padding: '6px 10px', fontFamily: FONT_BLACK, fontSize: 11, color: posColor, position: 'sticky', left: 0, background: rowBg, whiteSpace: 'nowrap' }}>
                                      {posIdx + 1}°
                                    </td>
                                    <td style={{ padding: '6px 6px', textAlign: 'center', fontFamily: FONT_NORMAL, fontSize: 10, color: realTeam ? TEXT : MUTED, whiteSpace: 'nowrap' }}>
                                      {realTeam ? abbrev(realTeam) : '—'}
                                    </td>
                                    {participants.map(p => {
                                      const userGrpStandings = adminGroupStandings.get(p.user_id)?.get(g)
                                      const predictedTeam = userGrpStandings?.[posIdx]?.name ?? null
                                      const hasGroupPicks = adminAllPicks.some(pk => pk.user_id === p.user_id && groupMatches.some(m => m.id === pk.match_id && m.group_name === g))
                                      const isOk = realTeam && predictedTeam ? realTeam === predictedTeam : null
                                      const color = isOk === true ? '#16a34a' : isOk === false ? RED : MUTED
                                      return (
                                        <td key={p.user_id} style={{ padding: '6px 4px', textAlign: 'center', fontFamily: FONT_NORMAL, fontSize: 10, color, whiteSpace: 'nowrap' }}>
                                          {!hasGroupPicks ? '—' : (predictedTeam ? abbrev(predictedTeam) : '?')}
                                        </td>
                                      )
                                    })}
                                  </tr>
                                )
                              }),
                            ]
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              )}

              {/* ── Clasificados — tabla por jugador, equipos en orden alfabético ── */}
              {adminTab === 'clasificados' && (
                <Card>
                  <SectionTitle>Clasificados por etapa</SectionTitle>
                  {/* Diagnóstico: grupos faltantes o usuarios sin picks KO */}
                  {(() => {
                    const groupsInDB = GROUPS.filter(g => groupMatches.some(m => m.group_name === g))
                    const missingGroups = GROUPS.filter(g => !groupsInDB.includes(g))
                    const koPicksByUser = new Map(participants.map(p => [
                      p.user_id,
                      adminAllPicks.filter(pk => pk.user_id === p.user_id && pk.match_id.startsWith('ko-')).length,
                    ]))
                    const usersWithoutKo = participants.filter(p => (koPicksByUser.get(p.user_id) ?? 0) === 0)
                    const warnings: string[] = []
                    if (missingGroups.length > 0) warnings.push(`Grupos sin partidos en DB: ${missingGroups.join(', ')} — hacé Sync para actualizar`)
                    if (usersWithoutKo.length > 0) warnings.push(`Sin picks KO: ${usersWithoutKo.map(p => p.profiles?.nombre?.split(' ')[0] ?? p.profiles?.username ?? '?').join(', ')}`)
                    if (warnings.length === 0) return null
                    return (
                      <div style={{ background: '#fef9c3', border: '1px solid #ca8a04', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
                        {warnings.map((w, i) => (
                          <div key={i} style={{ fontFamily: FONT_NORMAL, fontSize: 11, color: '#92400e' }}>⚠ {w}</div>
                        ))}
                      </div>
                    )
                  })()}
                  <div style={{ overflowX: 'auto' }}>
                    {([
                      {
                        key: 'r32', label: '16avos de final', count: 32,
                        realTeams: new Set([...realR32Set]),
                        getTeams: (uid: string): string[] => {
                          const c = perParticipantClassified.get(uid)
                          if (!c) return []
                          return [...new Set<string>([
                            ...(c.firsts.filter(Boolean) as string[]),
                            ...(c.seconds.filter(Boolean) as string[]),
                            ...(c.thirds.filter(Boolean) as string[]),
                          ])].sort()
                        },
                      },
                      {
                        key: 'r16', label: '8vos de final', count: 16,
                        realTeams: new Set([...realR16Set]),
                        getTeams: (uid: string): string[] =>
                          [...new Set<string>(Array.from({length:16}, (_,i) => perParticipantBracket.get(uid)?.get(`ko-r32-${i}`)).filter(Boolean) as string[])].sort(),
                      },
                      {
                        key: 'qf', label: 'Cuartos de final', count: 8,
                        realTeams: new Set([...realQfSet]),
                        getTeams: (uid: string): string[] =>
                          [...new Set<string>(Array.from({length:8}, (_,i) => perParticipantBracket.get(uid)?.get(`ko-r16-${i}`)).filter(Boolean) as string[])].sort(),
                      },
                      {
                        key: 'sf', label: 'Semifinales', count: 4,
                        realTeams: new Set([...realSfSet]),
                        getTeams: (uid: string): string[] =>
                          [...new Set<string>(Array.from({length:4}, (_,i) => perParticipantBracket.get(uid)?.get(`ko-qf-${i}`)).filter(Boolean) as string[])].sort(),
                      },
                    ] as Array<{ key: string; label: string; count: number; realTeams: Set<string>; getTeams: (uid: string) => string[] }>).map(({ key, label, count, realTeams, getTeams }) => {
                      const stageColor = STAGE_COLORS[key] ?? '#1e293b'
                      const hasReal = realTeams.size > 0
                      const perUser = new Map(participants.map(p => [p.user_id, getTeams(p.user_id)]))
                      return (
                        <div key={key} style={{ marginBottom: 16 }}>
                          <div style={{ background: stageColor, color: '#94a3b8', fontFamily: FONT_BLACK, fontSize: 9, padding: '6px 10px', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', justifyContent: 'space-between' }}>
                            <span>{label} · {count} equipos</span>
                            {!hasReal && <span style={{ color: GOLD }}>pendiente</span>}
                          </div>
                          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
                            <thead>
                              <tr style={{ background: '#f1f5f9' }}>
                                {participants.map(p => {
                                  const teams = perUser.get(p.user_id) ?? []
                                  const hits = hasReal ? teams.filter(t => realTeams.has(t)).length : null
                                  return (
                                    <th key={p.user_id} style={{ padding: '5px 8px', textAlign: 'center', fontFamily: FONT_BLACK, fontSize: 9, color: MUTED, whiteSpace: 'nowrap', minWidth: 80, borderRight: `1px solid ${BORDER}` }}>
                                      {p.profiles?.nombre ? p.profiles.nombre.split(' ')[0] : (p.profiles?.username ?? '?')}
                                      {hits !== null && <div style={{ color: TEXT, fontFamily: FONT_NORMAL, fontSize: 8 }}>{hits}/{count}</div>}
                                    </th>
                                  )
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              {Array.from({ length: count }, (_, i) => (
                                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: `1px solid ${BORDER}` }}>
                                  {participants.map(p => {
                                    const teams = perUser.get(p.user_id) ?? []
                                    const team = teams[i] ?? null
                                    const flag = team ? teamFlagMap.get(team) : null
                                    const isHit = hasReal && team ? realTeams.has(team) : null
                                    return (
                                      <td key={p.user_id} style={{
                                        padding: '3px 8px',
                                        borderRight: `1px solid ${BORDER}`,
                                        background: isHit === true ? '#dcfce7' : isHit === false ? '#fef2f2' : undefined,
                                        whiteSpace: 'nowrap',
                                      }}>
                                        {team ? (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            {flag && <img src={flag} alt="" style={{ width: 16, height: 11, borderRadius: 1, objectFit: 'cover', border: '1px solid #ddd', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />}
                                            <span style={{ fontFamily: FONT_NORMAL, fontSize: 10, color: TEXT }}>{team}</span>
                                          </div>
                                        ) : (
                                          <span style={{ color: '#ccc', fontFamily: FONT_NORMAL, fontSize: 10 }}>—</span>
                                        )}
                                      </td>
                                    )
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    })}

                    {/* Posiciones finales */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ background: '#C8950A', color: '#fff', fontFamily: FONT_BLACK, fontSize: 9, padding: '6px 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Posiciones finales
                      </div>
                      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9' }}>
                            <th style={{ padding: '5px 10px', textAlign: 'left', fontFamily: FONT_BLACK, fontSize: 9, color: MUTED, position: 'sticky', left: 0, background: '#f1f5f9', minWidth: 90, whiteSpace: 'nowrap', borderRight: `1px solid ${BORDER}` }}>Posición</th>
                            {participants.map(p => (
                              <th key={p.user_id} style={{ padding: '5px 8px', textAlign: 'center', fontFamily: FONT_BLACK, fontSize: 9, color: MUTED, whiteSpace: 'nowrap', minWidth: 80, borderRight: `1px solid ${BORDER}` }}>
                                {p.profiles?.nombre ? p.profiles.nombre.split(' ')[0] : (p.profiles?.username ?? '?')}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {([
                            { key: 'fourth'   as const, label: '4to Puesto',  realTeam: realFinals.fourth   },
                            { key: 'third'    as const, label: '3er Puesto',  realTeam: realFinals.third    },
                            { key: 'runnerUp' as const, label: 'Sub-Campeón', realTeam: realFinals.runnerUp },
                            { key: 'champion' as const, label: 'Campeón',     realTeam: realFinals.champion },
                          ]).map(({ key, label, realTeam }, i) => (
                            <tr key={key} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: `1px solid ${BORDER}` }}>
                              <td style={{ padding: '5px 10px', position: 'sticky', left: 0, background: i % 2 === 0 ? '#fff' : '#f9fafb', fontFamily: FONT_BLACK, fontSize: 10, color: TEXT, whiteSpace: 'nowrap', borderRight: `1px solid ${BORDER}` }}>
                                {label}
                                {realTeam && <span style={{ fontFamily: FONT_NORMAL, fontSize: 9, color: MUTED, marginLeft: 5 }}>({realTeam})</span>}
                              </td>
                              {participants.map(p => {
                                const predicted = perParticipantFinals.get(p.user_id)?.[key] ?? null
                                const isHit = !!realTeam && predicted === realTeam
                                const isMiss = !!realTeam && !!predicted && !isHit
                                const flag = predicted ? teamFlagMap.get(predicted) : null
                                return (
                                  <td key={p.user_id} style={{
                                    padding: '3px 8px',
                                    borderRight: `1px solid ${BORDER}`,
                                    background: isHit ? '#dcfce7' : isMiss ? '#fef2f2' : undefined,
                                    whiteSpace: 'nowrap',
                                  }}>
                                    {predicted ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        {flag && <img src={flag} alt="" style={{ width: 16, height: 11, borderRadius: 1, objectFit: 'cover', border: '1px solid #ddd', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />}
                                        <span style={{ fontFamily: FONT_NORMAL, fontSize: 10, color: TEXT }}>{predicted}</span>
                                      </div>
                                    ) : (
                                      <span style={{ color: '#ccc', fontFamily: FONT_NORMAL, fontSize: 10 }}>—</span>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Card>
              )}

              {/* ── Cruces KO — equipos que llegaron a cada fase ── */}
              {adminTab === 'cruces' && koMatches.length > 0 && (
                <Card>
                  <SectionTitle>Cruces — Equipos por fase</SectionTitle>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
                      <thead>
                        <tr style={{ background: TEXT }}>
                          <th style={{ padding: '8px 10px', textAlign: 'left', color: '#fff', fontFamily: FONT_BLACK, fontSize: 10, position: 'sticky', left: 0, background: TEXT, whiteSpace: 'nowrap', minWidth: 110 }}>Fase / Equipo</th>
                          {participants.map(p => (
                            <th key={p.user_id} style={{ padding: '8px 4px', textAlign: 'center', color: '#fff', fontFamily: FONT_BLACK, fontSize: 9, whiteSpace: 'nowrap', minWidth: 52 }}>
                              {p.profiles?.nombre ? p.profiles.nombre.split(' ')[0] : (p.profiles?.username ?? '?')}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {([
                          { stage: 'r32' as const, stageMs: r32Ms,   label: '16avos de final',    advancing: r16Ms },
                          { stage: 'r16' as const, stageMs: r16Ms,   label: '8vos de final',      advancing: qfMs  },
                          { stage: 'qf'  as const, stageMs: qfMs,    label: 'Cuartos de final',   advancing: sfMs  },
                          { stage: 'sf'  as const, stageMs: sfMs,    label: 'Semifinal',          advancing: finalMs },
                        ] as const).filter(({ stageMs }) => stageMs.length > 0).flatMap(({ stage, stageMs, label }) => {
                          const stageColor = STAGE_COLORS[stage] ?? '#1e293b'
                          return [
                            <tr key={`cruces-hdr-${stage}`}>
                              <td colSpan={participants.length + 1} style={{ background: stageColor, color: '#94a3b8', fontFamily: FONT_BLACK, fontSize: 9, padding: '5px 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                {label}
                              </td>
                            </tr>,
                            ...stageMs.map((m, i) => {
                              const realAdvanced = stage === 'r32'
                                ? r16Ms[Math.floor(i / 2)]
                                  ? (i % 2 === 0 ? r16Ms[Math.floor(i / 2)]?.home_team : r16Ms[Math.floor(i / 2)]?.away_team)
                                  : null
                                : null
                              const isRealTeam = realAdvanced && !realAdvanced.match(/winner|runner|gan\.|3rd/i)
                              const rowBg = i % 2 === 0 ? '#fff' : '#f9fafb'
                              return (
                                <tr key={`cruces-${stage}-${i}`} style={{ background: rowBg, borderBottom: `1px solid ${BORDER}` }}>
                                  <td style={{ padding: '5px 10px', fontFamily: FONT_NORMAL, color: MUTED, fontSize: 9, position: 'sticky', left: 0, background: rowBg, whiteSpace: 'nowrap' }}>
                                    {stage === 'r32'
                                      ? <><span style={{ color: MUTED }}>P{(matchNumById.get(m.id) ?? 0)}</span> {abbrev(m.home_team)} vs {abbrev(m.away_team)}</>
                                      : `${STAGE_LABEL[stage] ?? stage} ${i + 1}`
                                    }
                                    {isRealTeam && <span style={{ color: '#16a34a', marginLeft: 4, fontWeight: 700 }}>→ {abbrev(realAdvanced!)}</span>}
                                  </td>
                                  {participants.map(p => {
                                    const bracket = perParticipantBracket.get(p.user_id)
                                    const predicted = bracket?.get(m.id) ?? null
                                    const isOk = isRealTeam && predicted ? realAdvanced === predicted : null
                                    const color = isOk === true ? '#16a34a' : isOk === false ? RED : predicted ? TEXT : MUTED
                                    return (
                                      <td key={p.user_id} style={{ padding: '5px 4px', textAlign: 'center', fontFamily: FONT_NORMAL, fontSize: 10, color, whiteSpace: 'nowrap' }}>
                                        {predicted ? abbrev(predicted) : '—'}
                                      </td>
                                    )
                                  })}
                                </tr>
                              )
                            }),
                          ]
                        })}
                        {/* ── 3er/4to/Sub/Campeón ── */}
                        {finalMs.length > 0 && (() => {
                          const posRows: Array<{ label: string; getValue: (uid: string) => string | null; bgColor: string }> = [
                            { label: '3er Puesto',  getValue: uid => perParticipantFinals.get(uid)?.third   ?? null, bgColor: '#1e293b' },
                            { label: '4to Puesto',  getValue: uid => perParticipantFinals.get(uid)?.fourth  ?? null, bgColor: '#1e293b' },
                            { label: 'Sub-Campeón', getValue: uid => perParticipantFinals.get(uid)?.runnerUp ?? null, bgColor: '#0A0A0A' },
                            { label: 'Campeón 🏆',  getValue: uid => perParticipantFinals.get(uid)?.champion ?? null, bgColor: '#C8950A' },
                          ]
                          return posRows.map(({ label, getValue, bgColor }, idx) => [
                            <tr key={`cruces-pos-hdr-${idx}`}>
                              <td colSpan={participants.length + 1} style={{ background: bgColor, color: bgColor === '#C8950A' ? '#fff' : '#94a3b8', fontFamily: FONT_BLACK, fontSize: 9, padding: '5px 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                {label}
                              </td>
                            </tr>,
                            <tr key={`cruces-pos-${idx}`} style={{ background: '#fff', borderBottom: `1px solid ${BORDER}` }}>
                              <td style={{ padding: '6px 10px', fontFamily: FONT_NORMAL, color: MUTED, fontSize: 9, position: 'sticky', left: 0, background: '#fff', whiteSpace: 'nowrap' }}>
                                {label}
                              </td>
                              {participants.map(p => {
                                const team = getValue(p.user_id)
                                return (
                                  <td key={p.user_id} style={{ padding: '6px 4px', textAlign: 'center', fontFamily: FONT_BLACK, fontSize: 11, color: team ? (bgColor === '#C8950A' ? '#C8950A' : TEXT) : MUTED, whiteSpace: 'nowrap' }}>
                                    {team ? abbrev(team) : '—'}
                                  </td>
                                )
                              })}
                            </tr>,
                          ])
                        })()}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* ── KO ── */}
              {adminTab === 'ko' && koMatches.length > 0 && (
                <Card>
                  <SectionTitle>Fase Eliminatoria</SectionTitle>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
                      <thead>
                        <tr style={{ background: TEXT }}>
                          <th style={{ padding: '8px 10px', textAlign: 'left', color: '#fff', fontFamily: FONT_BLACK, fontSize: 10, position: 'sticky', left: 0, background: TEXT, whiteSpace: 'nowrap', minWidth: 140 }}>Partido</th>
                          <th style={{ padding: '8px 6px', textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontFamily: FONT_NORMAL, fontSize: 9, whiteSpace: 'nowrap' }}>Real</th>
                          {participants.map(p => (
                            <th key={p.user_id} style={{ padding: '8px 4px', textAlign: 'center', color: '#fff', fontFamily: FONT_BLACK, fontSize: 9, whiteSpace: 'nowrap', minWidth: 52 }}>
                              {p.profiles?.nombre ? p.profiles.nombre.split(' ')[0] : (p.profiles?.username ?? '?')}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {([
                          { stage: 'r32', ms: r32Ms },
                          { stage: 'r16', ms: r16Ms },
                          { stage: 'qf',  ms: qfMs  },
                          { stage: 'sf',  ms: sfMs  },
                          { stage: '3rd', ms: thirdMs },
                          { stage: 'final', ms: finalMs },
                        ] as const).filter(({ ms }) => ms.length > 0).flatMap(({ stage, ms }) => [
                          <tr key={`hdr-${stage}`}>
                            <td colSpan={participants.length + 2} style={{ background: '#1e293b', color: '#94a3b8', fontFamily: FONT_BLACK, fontSize: 9, padding: '4px 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              {STAGE_LABEL[stage] ?? stage}
                            </td>
                          </tr>,
                          ...ms.map((m, i) => {
                            const slotId = koSlotId(stage, i)
                            const num = matchNumById.get(m.id)
                            const hasResult = m.home_score !== null && m.away_score !== null
                            const bg = i % 2 === 0 ? '#fff' : '#f9fafb'
                            return (
                              <tr key={slotId} style={{ background: bg, borderBottom: `1px solid ${BORDER}` }}>
                                <td style={{ padding: '5px 10px', fontFamily: FONT_NORMAL, color: TEXT, fontWeight: 600, position: 'sticky', left: 0, background: bg, fontSize: 10, whiteSpace: 'nowrap' }}>
                                  {num && stage === 'r32'
                                    ? <><span style={{ color: MUTED, fontSize: 9, marginRight: 4 }}>P{num}</span>{abbrev(m.home_team)} vs {abbrev(m.away_team)}</>
                                    : <><span style={{ color: MUTED, fontSize: 9, marginRight: 4 }}>{STAGE_LABEL[stage]}</span>{resolveKo(m.home_team)} vs {resolveKo(m.away_team)}</>
                                  }
                                </td>
                                <td style={{ padding: '5px 6px', textAlign: 'center', fontFamily: FONT_BLACK, fontSize: 10, whiteSpace: 'nowrap', color: hasResult ? TEXT : MUTED }}>
                                  {hasResult ? `${m.home_score}-${m.away_score}` : '—'}
                                </td>
                                {participants.map(p => {
                                  const pk = adminAllPicks.find(pk => pk.user_id === p.user_id && pk.match_id === slotId)
                                  const bracket = perParticipantBracket.get(p.user_id)
                                  const winner = bracket?.get(slotId)
                                  const matchScore = pk && hasResult ? calcScore(pk, m) : null
                                  const color = matchScore !== null
                                    ? (matchScore >= 12 ? '#15803d' : matchScore >= 7 ? '#16a34a' : matchScore >= 5 ? '#ca8a04' : matchScore >= 2 ? '#f97316' : RED)
                                    : (winner ? TEXT : MUTED)
                                  return (
                                    <td key={p.user_id} style={{ padding: '5px 4px', textAlign: 'center', fontFamily: FONT_BLACK, fontSize: 11, color, whiteSpace: 'nowrap' }}>
                                      {!pk ? '—' : winner ? abbrev(winner) : `${pk.home_score}-${pk.away_score}`}
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          }),
                        ])}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* ── Premios (adicionales) ── */}
              {adminTab === 'premios' && (
                <Card>
                  <SectionTitle>Premios y adicionales</SectionTitle>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
                      <thead>
                        <tr style={{ background: TEXT }}>
                          <th style={{ padding: '8px 10px', textAlign: 'left', color: '#fff', fontFamily: FONT_BLACK, fontSize: 10, position: 'sticky', left: 0, background: TEXT, whiteSpace: 'nowrap', minWidth: 110 }}>Adicional</th>
                          {participants.map(p => (
                            <th key={p.user_id} style={{ padding: '8px 4px', textAlign: 'center', color: '#fff', fontFamily: FONT_BLACK, fontSize: 9, whiteSpace: 'nowrap', minWidth: 52 }}>
                              {p.profiles?.nombre ? p.profiles.nombre.split(' ')[0] : (p.profiles?.username ?? '?')}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {SPECIAL_LABELS.map((f, i) => {
                          const fromBracket = ['champion','runner_up','third_place','fourth_place'].includes(f.key)
                          const rowBg = i % 2 === 0 ? '#fff' : '#f9f9f9'
                          return (
                            <tr key={f.key} style={{ background: rowBg, borderBottom: `1px solid ${BORDER}` }}>
                              <td style={{ padding: '6px 10px', fontFamily: FONT_NORMAL, color: TEXT, fontWeight: 600, position: 'sticky', left: 0, background: rowBg, fontSize: 10, whiteSpace: 'nowrap' }}>
                                {f.label}
                                {fromBracket && <span style={{ fontSize: 8, color: MUTED, fontWeight: 400, marginLeft: 4 }}>(bracket)</span>}
                              </td>
                              {participants.map(p => {
                                let val = ''
                                if (fromBracket) {
                                  const finals = perParticipantFinals.get(p.user_id)
                                  const mapped: Record<string, string|null|undefined> = {
                                    champion:    finals?.champion,
                                    runner_up:   finals?.runnerUp,
                                    third_place: finals?.third,
                                    fourth_place: finals?.fourth,
                                  }
                                  val = mapped[f.key] ? abbrev(mapped[f.key]!) : ''
                                } else {
                                  const sp = adminSpecials.find(s => s.user_id === p.user_id)
                                  val = sp ? ((sp as any)[f.key] as string | null | undefined) ?? '' : ''
                                  if (f.key === 'goleada_match_id' && val) {
                                    const gm = matches.find(m => m.id === val)
                                    val = gm ? `${abbrev(gm.home_team)}-${abbrev(gm.away_team)}` : val
                                  }
                                }
                                return (
                                  <td key={p.user_id} style={{ padding: '6px 4px', textAlign: 'center', fontFamily: FONT_NORMAL, fontSize: 10, color: val ? TEXT : MUTED, whiteSpace: 'nowrap' }}>
                                    {val ? (val.length > 14 ? val.substring(0, 13) + '…' : val) : '—'}
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ── PREDICCIONES (pública) ── */}
          {tab === 'predicciones' && isParticipant && (
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
              {/* Sub-tab nav */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                {(['partidos', 'grupos'] as const).map(k => (
                  <button
                    key={k}
                    onClick={() => setPredTab(k)}
                    style={{
                      padding: '6px 16px', border: `1.5px solid ${predTab === k ? RED : BORDER}`,
                      background: predTab === k ? RED : '#fff', color: predTab === k ? '#fff' : TEXT,
                      borderRadius: 20, fontFamily: FONT_BLACK, fontSize: 11, cursor: 'pointer',
                    }}
                  >
                    {{ partidos: 'Partidos', grupos: 'Orden de grupos' }[k]}
                  </button>
                ))}
              </div>

              {/* ── Partidos — predicciones de todos por partido ── */}
              {predTab === 'partidos' && (
                <Card>
                  <SectionTitle>Partidos — Fase de Grupos</SectionTitle>
                  {predAllPicks.length === 0 ? (
                    <div style={{ fontSize: 12, color: MUTED, fontFamily: FONT_NORMAL, padding: '12px 0' }}>Cargando predicciones...</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
                        <thead>
                          <tr style={{ background: TEXT }}>
                            <th style={{ padding: '8px 6px', textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontFamily: FONT_NORMAL, fontSize: 9, whiteSpace: 'nowrap' }}>Grp</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', color: '#fff', fontFamily: FONT_BLACK, fontSize: 10, position: 'sticky', left: 0, background: TEXT, whiteSpace: 'nowrap', minWidth: 110 }}>Partido</th>
                            <th style={{ padding: '8px 6px', textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontFamily: FONT_NORMAL, fontSize: 9, whiteSpace: 'nowrap' }}>Fecha</th>
                            <th style={{ padding: '8px 6px', textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontFamily: FONT_NORMAL, fontSize: 9, whiteSpace: 'nowrap' }}>Real</th>
                            {orderedParticipants.map(p => (
                              <th key={p.user_id} style={{ padding: '8px 4px', textAlign: 'center', color: p.user_id === user?.id ? RED : '#fff', fontFamily: FONT_BLACK, fontSize: 9, whiteSpace: 'nowrap', minWidth: 52, textTransform: 'uppercase' }}>
                                {p.profiles?.nombre ? p.profiles.nombre.split(' ')[0] : (p.profiles?.username ?? '?')}
                                {p.user_id === user?.id ? ' ★' : ''}
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
                            const grpColor = GROUP_COLORS[m.group_name ?? ''] ?? TEXT
                            return (
                              <tr key={m.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9f9', borderBottom: `1px solid ${BORDER}` }}>
                                <td style={{ padding: '6px 6px', textAlign: 'center', fontFamily: FONT_BLACK, fontSize: 10, color: '#fff', background: grpColor, whiteSpace: 'nowrap' }}>
                                  {m.group_name ?? ''}
                                </td>
                                <td style={{ padding: '6px 10px', fontFamily: FONT_NORMAL, color: TEXT, fontWeight: 600, position: 'sticky', left: 0, background: i % 2 === 0 ? '#fff' : '#f9f9f9', whiteSpace: 'nowrap', fontSize: 10 }}>
                                  {abbrev(m.home_team)} vs {abbrev(m.away_team)}
                                </td>
                                <td style={{ padding: '6px 6px', textAlign: 'center', fontFamily: FONT_NORMAL, color: MUTED, fontSize: 9, whiteSpace: 'nowrap' }}>{matchDate}</td>
                                <td style={{ padding: '6px 6px', textAlign: 'center', fontFamily: FONT_BLACK, fontSize: 10, whiteSpace: 'nowrap', color: hasResult ? TEXT : MUTED }}>
                                  {hasResult ? `${m.home_score}-${m.away_score}` : '—'}
                                </td>
                                {orderedParticipants.map(p => {
                                  const pk = predAllPicks.find(pk => pk.user_id === p.user_id && pk.match_id === m.id)
                                  const score = pk && hasResult ? calcScore(pk, m) : null
                                  const color = score === null ? MUTED : score >= 12 ? '#15803d' : score >= 7 ? '#16a34a' : score >= 5 ? '#ca8a04' : score >= 2 ? '#f97316' : RED
                                  return (
                                    <td key={p.user_id} style={{ padding: '6px 4px', textAlign: 'center', fontFamily: FONT_NORMAL, fontSize: 10, color, whiteSpace: 'nowrap', fontWeight: p.user_id === user?.id ? 700 : 400 }}>
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
              )}

              {/* ── Grupos — orden predicho por jugador ── */}
              {predTab === 'grupos' && (
                <Card>
                  <SectionTitle>Orden de Grupos</SectionTitle>
                  {predAllPicks.length === 0 ? (
                    <div style={{ fontSize: 12, color: MUTED, fontFamily: FONT_NORMAL, padding: '12px 0' }}>Cargando predicciones...</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
                        <thead>
                          <tr style={{ background: TEXT }}>
                            <th style={{ padding: '8px 10px', textAlign: 'left', color: '#fff', fontFamily: FONT_BLACK, fontSize: 10, position: 'sticky', left: 0, background: TEXT, whiteSpace: 'nowrap', minWidth: 60 }}>Pos</th>
                            <th style={{ padding: '8px 6px', textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontFamily: FONT_NORMAL, fontSize: 9, whiteSpace: 'nowrap' }}>Real</th>
                            {orderedParticipants.map(p => (
                              <th key={p.user_id} style={{ padding: '8px 4px', textAlign: 'center', color: p.user_id === user?.id ? RED : '#fff', fontFamily: FONT_BLACK, fontSize: 9, whiteSpace: 'nowrap', minWidth: 52, textTransform: 'uppercase' }}>
                                {p.profiles?.nombre ? p.profiles.nombre.split(' ')[0] : (p.profiles?.username ?? '?')}
                                {p.user_id === user?.id ? ' ★' : ''}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {GROUPS.filter(g => groupMatches.some(m => m.group_name === g)).flatMap(g => {
                            const grpColor = GROUP_COLORS[g] ?? TEXT
                            const realPos = [1,2,3,4].map(rank => standings.find(s => s.group_name === g && s.rank === rank)?.team_name ?? null)
                            return [
                              <tr key={`pred-grp-hdr-${g}`}>
                                <td colSpan={participants.length + 2} style={{ background: grpColor, color: '#fff', fontFamily: FONT_BLACK, fontSize: 10, padding: '5px 10px', letterSpacing: 0.5 }}>
                                  GRUPO {g}
                                </td>
                              </tr>,
                              ...[0,1,2,3].map(posIdx => {
                                const realTeam = realPos[posIdx]
                                const rowBg = posIdx % 2 === 0 ? '#fff' : '#f9f9f9'
                                const posColor = posIdx < 2 ? '#16a34a' : posIdx === 2 ? '#ca8a04' : MUTED
                                return (
                                  <tr key={`pred-${g}-${posIdx}`} style={{ background: rowBg, borderBottom: `1px solid ${BORDER}` }}>
                                    <td style={{ padding: '6px 10px', fontFamily: FONT_BLACK, fontSize: 11, color: posColor, position: 'sticky', left: 0, background: rowBg, whiteSpace: 'nowrap' }}>
                                      {posIdx + 1}°
                                    </td>
                                    <td style={{ padding: '6px 6px', textAlign: 'center', fontFamily: FONT_NORMAL, fontSize: 10, color: realTeam ? TEXT : MUTED, whiteSpace: 'nowrap' }}>
                                      {realTeam ? abbrev(realTeam) : '—'}
                                    </td>
                                    {orderedParticipants.map(p => {
                                      const userGrpStandings = publicGroupStandings.get(p.user_id)?.get(g)
                                      const predictedTeam = userGrpStandings?.[posIdx]?.name ?? null
                                      const hasGroupPicks = predAllPicks.some(pk => pk.user_id === p.user_id && groupMatches.some(m => m.id === pk.match_id && m.group_name === g))
                                      const isOk = realTeam && predictedTeam ? realTeam === predictedTeam : null
                                      const color = isOk === true ? '#16a34a' : isOk === false ? RED : MUTED
                                      return (
                                        <td key={p.user_id} style={{ padding: '6px 4px', textAlign: 'center', fontFamily: FONT_NORMAL, fontSize: 10, color, whiteSpace: 'nowrap', fontWeight: p.user_id === user?.id ? 700 : 400 }}>
                                          {!hasGroupPicks ? '—' : (predictedTeam ? abbrev(predictedTeam) : '?')}
                                        </td>
                                      )
                                    })}
                                  </tr>
                                )
                              }),
                            ]
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  )
}
