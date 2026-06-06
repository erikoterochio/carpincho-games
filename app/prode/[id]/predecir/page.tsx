'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

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
  champion: string; runner_up: string; third_place: string; fourth_place: string
  balon_oro: string; guante_oro: string; botin_oro: string
  fair_play: string; revelacion: string; goleada_match_id: string
}
const EMPTY_SPECIALS: Specials = {
  champion: '', runner_up: '', third_place: '', fourth_place: '',
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

  const picksRef = useRef<Picks>({})
  const specialsRef = useRef<Specials>(EMPTY_SPECIALS)
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
      const [{ data: ms }, { data: myPicks }, { data: mySpecials }] = await Promise.all([
        supabase.from('prode_matches').select('id,home_team,away_team,home_flag,away_flag,kickoff,group_name,sort_order,stage').order('sort_order'),
        supabase.from('prode_stage1_picks').select('match_id,home_score,away_score').eq('tournament_id', id).eq('user_id', user.id),
        supabase.from('prode_stage1_specials').select('*').eq('tournament_id', id).eq('user_id', user.id).maybeSingle(),
      ])
      setMatches((ms ?? []) as Match[])
      const pm: Picks = {}
      for (const p of (myPicks ?? [])) pm[p.match_id] = { h: String(p.home_score), a: String(p.away_score) }
      setPicks(pm); picksRef.current = pm
      if (mySpecials) {
        const sp: Specials = {
          champion: mySpecials.champion ?? '', runner_up: mySpecials.runner_up ?? '',
          third_place: mySpecials.third_place ?? '', fourth_place: mySpecials.fourth_place ?? '',
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
    const { error } = await supabase.from('prode_stage1_picks').upsert(
      { tournament_id: id, user_id: userRef.current?.id, match_id: matchId, home_score: h, away_score: a, updated_at: new Date().toISOString() },
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
    if (isDeadlinePast) return
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

  const MatchCard = ({ m }: { m: Match }) => {
    const pick = picks[m.id] ?? { h: '', a: '' }
    const filled = pick.h !== '' && pick.a !== ''
    return (
      <div style={{
        background: '#fff', border: `1.5px solid ${filled ? RED + '40' : BORDER}`,
        borderRadius: 14, padding: '12px 14px', transition: 'border-color 0.15s',
      }}>
        <div style={{ fontSize: 10, color: MUTED, textAlign: 'center', marginBottom: 8, fontFamily: FONT_NORMAL, letterSpacing: 0.5 }}>
          {m.group_name ? `GRUPO ${m.group_name} · ` : ''}{fmtTime(m.kickoff)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Home */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 0 }}>
            <img src={m.home_flag} alt={m.home_team} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${BORDER}` }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <span style={{ fontSize: 12, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, letterSpacing: 0.5 }}>{abbrev(m.home_team)}</span>
          </div>
          {/* Scores */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <input
              type="text" inputMode="numeric"
              className="score-inp"
              value={pick.h}
              onChange={e => handlePickChange(m.id, 'h', e.target.value)}
              disabled={isDeadlinePast}
              placeholder="—"
              style={{ borderColor: filled ? RED : BORDER, color: filled ? RED : TEXT }}
            />
            <span style={{ color: BORDER, fontWeight: 700, fontSize: 14, fontFamily: FONT_BLACK }}>:</span>
            <input
              type="text" inputMode="numeric"
              className="score-inp"
              value={pick.a}
              onChange={e => handlePickChange(m.id, 'a', e.target.value)}
              disabled={isDeadlinePast}
              placeholder="—"
              style={{ borderColor: filled ? RED : BORDER, color: filled ? RED : TEXT }}
            />
          </div>
          {/* Away */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 0 }}>
            <img src={m.away_flag} alt={m.away_team} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${BORDER}` }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <span style={{ fontSize: 12, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, letterSpacing: 0.5 }}>{abbrev(m.away_team)}</span>
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

          {/* Group stage — by date */}
          {activeStage === 'group' && (
            <>
              {groupMatches.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: MUTED, fontSize: 13, fontFamily: FONT_NORMAL }}>
                  No hay partidos cargados todavía. El admin debe sincronizar desde la API.
                </div>
              ) : groupMatchesByDate(groupMatches).map(([date, ms]) => (
                <div key={date}>
                  <div className="date-header">📅 {date}</div>
                  <div className="matches-grid">
                    {ms.map(m => <MatchCard key={m.id} m={m} />)}
                  </div>
                </div>
              ))}
            </>
          )}

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
                <div style={{ fontSize: 14, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, marginBottom: 16 }}>🏆 Posiciones finales</div>
                <TeamSelect field="champion" label="Campeón (40 pts)" />
                <TeamSelect field="runner_up" label="Sub-campeón (35 pts)" />
                <TeamSelect field="third_place" label="3er puesto (30 pts)" />
                <TeamSelect field="fourth_place" label="4to puesto (25 pts)" />
              </div>

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
