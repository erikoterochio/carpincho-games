'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────

type CourseResult = {
  id: string; name: string; city: string | null
  par: number | null; total_holes: number
}

type HoleInput = { hole_number: number; par: 3 | 4 | 5; stroke_index: number }

type FormatKey =
  | 'stroke' | 'stableford' | 'match'
  | 'fourball_clasico' | 'fourball_americano' | 'laguneada' | '4_2_0'

type TeeColor = 'black' | 'blue' | 'white' | 'yellow' | 'red'

type PlayerInput = {
  tempId: string; display_name: string
  handicap_index: number; tee_color: TeeColor
}

type ContestInput = {
  type: 'long_drive' | 'best_approach'; hole: number; name: string
}

type UnitInput = {
  format_key: FormatKey; name: string; player_temp_ids: string[]
}

// ─────────────────────────────────────────────
// CONSTANTES DE DISEÑO
// ─────────────────────────────────────────────

const FONT = "'Ubuntu', sans-serif"
const C = {
  bg: '#01050F', card: '#0d0d1a', border: '#1e1736',
  borderActive: '#055074', primary: '#055074',
  text: '#c1c1c6', muted: '#706c7e',
  success: '#4ade80', error: '#f87171',
} as const

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: '#080812', border: `1px solid ${C.border}`,
  borderRadius: 9, color: C.text, fontSize: 14, fontFamily: FONT,
}

// ─────────────────────────────────────────────
// DEFINICIÓN DE MODALIDADES
// ─────────────────────────────────────────────

const FORMAT_DEFS: Record<FormatKey, {
  label: string; color: string
  scope: 'individual' | 'pair' | 'group'
  teamSize?: number; desc: string
}> = {
  stroke: {
    label: 'Medal', color: '#5b9bd5', scope: 'individual',
    desc: 'Juego por golpes. Gana quien tenga el menor score neto.',
  },
  stableford: {
    label: 'Stableford', color: '#4caf84', scope: 'individual',
    desc: 'Juego por puntos. Se reciben puntos en relación al par del hoyo: Eagle=4, Birdie=3, Par=2, Bogey=1.',
  },
  match: {
    label: 'Match Play', color: '#e07b4f', scope: 'pair', teamSize: 2,
    desc: 'Juego por hoyos. Cada hoyo vale 1 punto y gana quien se lleva más hoyos.',
  },
  fourball_clasico: {
    label: 'Fourball Clásico', color: '#9b72cf', scope: 'pair', teamSize: 2,
    desc: 'Juego por golpes en parejas. Se anota el mejor score gross por hoyo de la pareja y se usa como handicap 3/8 de la suma de los handicaps individuales.',
  },
  fourball_americano: {
    label: 'Fourball Americano', color: '#cf9e3a', scope: 'pair', teamSize: 2,
    desc: 'Juego por golpes en parejas. Se anota el mejor score neto por hoyo de la pareja descontando golpes por hoyo según el 85% del handicap de cada jugador.',
  },
  laguneada: {
    label: 'Laguneada', color: '#c15b8a', scope: 'group', teamSize: 4,
    desc: 'Juego por golpes en equipos de 4. Se anota el mejor score neto por hoyo del equipo descontando golpes por hoyo según el 85% del handicap de cada jugador.',
  },
  '4_2_0': {
    label: '4-2-0', color: '#38bdf8', scope: 'individual',
    desc: 'Juego por puntos (3 jugadores). En cada hoyo se reparten 6 puntos: el mejor score neto suma 4, el segundo 2 y el tercero 0. Empates: los dos mejores empatan→3-3-0, los dos peores→4-1-1, todos→2-2-2. Se usa el 85% del handicap.',
  },
}

const TEE_COLORS: { key: TeeColor; label: string; hex: string }[] = [
  { key: 'black',  label: 'Negra',    hex: '#222222' },
  { key: 'blue',   label: 'Azul',     hex: '#1d4ed8' },
  { key: 'white',  label: 'Blanca',   hex: '#d1d5db' },
  { key: 'yellow', label: 'Amarilla', hex: '#d97706' },
  { key: 'red',    label: 'Roja',     hex: '#dc2626' },
]

const HCP_OPTIONS = [
  { value: 0,   label: 'Sin HCP',  desc: 'Todos scratch' },
  { value: 50,  label: '50%',      desc: 'Mitad' },
  { value: 75,  label: '75%',      desc: 'Tres cuartos' },
  { value: 100, label: '100%',     desc: 'Completo' },
]

const HOLES_OPTIONS = [
  { value: '18',     label: '18 hoyos',       desc: 'Cancha completa' },
  { value: 'front9', label: 'Ida (1–9)',       desc: 'Primeros 9' },
  { value: 'back9',  label: 'Vuelta (10–18)',  desc: 'Segundos 9' },
]

const STEPS = ['Cancha', 'Config', 'Modalidades', 'Jugadores', 'Confirmar']

const DEFAULT_PARS: (3|4|5)[] = [4,4,3,4,4,5,3,4,4,4,3,4,5,4,4,3,4,5]
function makeDefaultHoles(): HoleInput[] {
  return Array.from({ length: 18 }, (_, i) => ({
    hole_number: i + 1, par: DEFAULT_PARS[i], stroke_index: i + 1,
  }))
}

const genId = () => Math.random().toString(36).slice(2, 10)

// ─────────────────────────────────────────────
// PÁGINA PRINCIPAL
// ─────────────────────────────────────────────

export default function NuevaPartidaPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [step,       setStep]       = useState(0)
  const [user,       setUser]       = useState<{ id: string } | null>(null)
  const [authLoading,setAuthLoading]= useState(true)
  const [creating,   startCreating] = useTransition()
  const [createError,setCreateError]= useState('')

  // Step 0: Cancha
  const [courseQuery,   setCourseQuery]   = useState('')
  const [courseResults, setCourseResults] = useState<CourseResult[]>([])
  const [selectedCourse,setSelectedCourse]= useState<CourseResult | null>(null)
  const [showNewCourse, setShowNewCourse] = useState(false)
  const [newCourse,     setNewCourse]     = useState({
    name: '', city: '', par: '', rating: '', slope: '', holes: makeDefaultHoles(),
  })

  // Step 1: Config
  const [matchName,    setMatchName]    = useState('')
  const [holesConfig,  setHolesConfig]  = useState<'18'|'front9'|'back9'>('18')
  const [hcpAllowance, setHcpAllowance] = useState(100)
  const [contests,     setContests]     = useState<ContestInput[]>([])

  // Step 2: Modalidades
  const [formats,      setFormats]      = useState<FormatKey[]>(['stableford'])
  // Config específica por formato
  const [formatConfig, setFormatConfig] = useState<Record<string, any>>({
    fourball_clasico: { max_hcp_diff: 5 },
  })

  // Step 3: Jugadores
  const [players,   setPlayers]   = useState<PlayerInput[]>([])
  const [addName,   setAddName]   = useState('')
  const [addHcp,    setAddHcp]    = useState('')
  const [addTee,    setAddTee]    = useState<TeeColor>('white')
  const [units,     setUnits]     = useState<UnitInput[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUser({ id: user.id })
      setAuthLoading(false)
    })
  }, [])

  useEffect(() => {
    if (courseQuery.length < 2) { setCourseResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('golf_courses')
        .select('id,name,city,par,total_holes')
        .ilike('name', `%${courseQuery}%`)
        .eq('is_public', true)
        .limit(8)
      setCourseResults(data ?? [])
    }, 300)
    return () => clearTimeout(t)
  }, [courseQuery])

  // Regenerar unidades cuando cambian formatos o jugadores
  useEffect(() => {
    const teamFmts = formats.filter(f => FORMAT_DEFS[f].scope !== 'individual')
    if (teamFmts.length === 0) { setUnits([]); return }
    setUnits(prev => {
      const next: UnitInput[] = []
      for (const fKey of teamFmts) {
        const size   = FORMAT_DEFS[fKey].teamSize ?? 2
        const nUnits = Math.max(1, Math.ceil(players.length / size))
        const existing = prev.filter(u => u.format_key === fKey)
        const label  = FORMAT_DEFS[fKey].scope === 'group' ? 'Grupo' : 'Pareja'
        for (let i = 0; i < nUnits; i++) {
          next.push(existing[i] ?? { format_key: fKey, name: `${label} ${i + 1}`, player_temp_ids: [] })
        }
      }
      return next
    })
  }, [formats, players.length]) // eslint-disable-line

  const canNext = (): boolean => {
    if (step === 0) return showNewCourse ? newCourse.name.trim().length >= 2 : selectedCourse !== null
    if (step === 1) return matchName.trim().length >= 2
    if (step === 2) return formats.length > 0
    if (step === 3) {
      if (players.length < 2) return false
      const teamFmts = formats.filter(f => FORMAT_DEFS[f].scope !== 'individual')
      for (const fKey of teamFmts) {
        const size    = FORMAT_DEFS[fKey].teamSize ?? 2
        const forFmt  = units.filter(u => u.format_key === fKey)
        if (forFmt.some(u => u.player_temp_ids.length < size)) return false
      }
      return true
    }
    return true
  }

  const handleCreate = () => {
    setCreateError('')
    startCreating(async () => {
      try {
        let courseId = selectedCourse?.id ?? null

        if (showNewCourse) {
          const { data: cData, error: cErr } = await supabase
            .from('golf_courses')
            .insert({
              name: newCourse.name.trim(), city: newCourse.city.trim() || null,
              par: newCourse.par ? parseInt(newCourse.par) : null,
              rating: newCourse.rating ? parseFloat(newCourse.rating) : null,
              slope: newCourse.slope ? parseInt(newCourse.slope) : 113,
              created_by: user?.id ?? null, is_public: true,
            })
            .select('id').single()
          if (cErr) throw cErr
          courseId = cData.id

          const holeCount = holesConfig === '18' ? 18 : 9
          const { error: hErr } = await supabase.from('golf_holes').insert(
            newCourse.holes.slice(0, holeCount).map(h => ({ ...h, course_id: courseId }))
          )
          if (hErr) throw hErr
        }

        const { data: t, error: tErr } = await supabase
          .from('golf_tournaments')
          .insert({
            name: matchName.trim(), course_id: courseId,
            created_by: user?.id ?? null, status: 'active',
            holes_config: holesConfig, handicap_allowance: hcpAllowance, num_rounds: 1,
          })
          .select('id,invite_code').single()
        if (tErr) throw tErr

        const { data: fmtData, error: fmtErr } = await supabase
          .from('golf_formats')
          .insert(formats.map((fKey, i) => ({
            tournament_id: t.id,
            format_type: fKey,
            display_name: FORMAT_DEFS[fKey].label,
            scoring_type: 'stroke',
            handicap_allowance: ['fourball_americano','laguneada','4_2_0'].includes(fKey) ? 85 : null,
            max_hcp_diff: fKey === 'fourball_clasico' ? (formatConfig.fourball_clasico?.max_hcp_diff ?? 5) : null,
            sort_order: i,
          })))
          .select('id,format_type')
        if (fmtErr) throw fmtErr

        const { data: pData, error: pErr } = await supabase
          .from('golf_players')
          .insert(players.map((p, i) => ({
            tournament_id: t.id, display_name: p.display_name,
            handicap_index: p.handicap_index, tee_color: p.tee_color,
            user_id: null, sort_order: i,
          })))
          .select('id')
        if (pErr) throw pErr

        const tempToDb: Record<string, string> = Object.fromEntries(players.map((p, i) => [p.tempId, pData[i].id]))

        for (const unit of units) {
          const fmt = fmtData?.find(f => f.format_type === unit.format_key)
          if (!fmt || unit.player_temp_ids.length === 0) continue
          const { data: uData, error: uErr } = await supabase
            .from('golf_competition_units')
            .insert({ format_id: fmt.id, tournament_id: t.id, name: unit.name, unit_type: FORMAT_DEFS[unit.format_key].scope })
            .select('id').single()
          if (uErr) throw uErr
          const { error: mErr } = await supabase
            .from('golf_competition_unit_members')
            .insert(unit.player_temp_ids.map(tid => ({ unit_id: uData.id, player_id: tempToDb[tid] })))
          if (mErr) throw mErr
        }

        await supabase.from('golf_rounds').insert({
          tournament_id: t.id, round_number: 1,
          date: new Date().toISOString().split('T')[0], status: 'active', holes_played: holesConfig,
        })

        if (contests.length > 0) {
          await supabase.from('golf_contests').insert(contests.map(c => ({
            tournament_id: t.id, contest_type: c.type, hole_number: c.hole, display_name: c.name,
          })))
        }

        router.push(`/golf/${t.id}`)
      } catch (err: any) {
        setCreateError(err?.message ?? 'Error al crear la partida. Intentá de nuevo.')
      }
    })
  }

  if (!authLoading && !user) {
    return (
      <>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');`}</style>
        <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 360, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⛳</div>
            <p style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 8, fontFamily: FONT }}>Necesitás una cuenta</p>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 24, fontFamily: FONT }}>Para crear y guardar partidas necesitás iniciar sesión.</p>
            <Link href="/login" style={{ display: 'inline-block', padding: '12px 28px', background: C.primary, color: C.text, borderRadius: 10, fontFamily: FONT, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              Iniciar sesión
            </Link>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input, select, button { font-family: 'Ubuntu', sans-serif; }
        input::placeholder { color: #4a4a55; }
        input:focus, select:focus { outline: none; }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.4; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #1e1736; border-radius: 3px; }
      `}</style>

      <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT, color: C.text }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          {/* Navbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: C.bg, zIndex: 10 }}>
            <button onClick={() => step > 0 ? setStep(s => s - 1) : router.push('/golf')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 0', color: C.muted, display: 'flex', alignItems: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke={C.muted} strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
            <span style={{ fontSize: 17, fontWeight: 700, color: C.text }}>Nueva partida</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: C.muted }}>{step + 1} / {STEPS.length}</span>
          </div>

          {/* Progress */}
          <div style={{ display: 'flex', gap: 4, padding: '10px 18px 0' }}>
            {STEPS.map((label, i) => (
              <div key={i} style={{ flex: 1 }}>
                <div style={{ height: 3, borderRadius: 2, background: i <= step ? C.primary : C.border, transition: 'background 0.3s' }} />
                <div style={{ fontSize: 9, fontWeight: i === step ? 700 : 400, color: i === step ? C.text : C.muted, marginTop: 4, textAlign: 'center', fontFamily: FONT }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: '22px 18px 120px' }}>
            {step === 0 && (
              <StepCancha
                query={courseQuery} onQuery={setCourseQuery}
                results={courseResults} selected={selectedCourse}
                onSelect={(c: CourseResult) => { setSelectedCourse(c); setShowNewCourse(false) }}
                showNew={showNewCourse}
                onToggleNew={() => { setShowNewCourse(v => !v); setSelectedCourse(null); setCourseQuery('') }}
                newCourse={newCourse} onNewCourse={setNewCourse}
              />
            )}
            {step === 1 && (
              <StepConfig
                name={matchName} onName={setMatchName}
                holesConfig={holesConfig} onHolesConfig={(v: '18'|'front9'|'back9') => setHolesConfig(v)}
                hcpAllowance={hcpAllowance} onHcpAllowance={setHcpAllowance}
                contests={contests} onContests={setContests}
                totalHoles={selectedCourse?.total_holes ?? 18}
              />
            )}
            {step === 2 && (
              <StepFormatos
                formats={formats} onFormats={setFormats}
                formatConfig={formatConfig} onFormatConfig={setFormatConfig}
              />
            )}
            {step === 3 && (
              <StepJugadores
                players={players} onPlayers={setPlayers}
                addName={addName} onAddName={setAddName}
                addHcp={addHcp} onAddHcp={setAddHcp}
                addTee={addTee} onAddTee={setAddTee}
                formats={formats} units={units} onUnits={setUnits}
              />
            )}
            {step === 4 && (
              <StepConfirmar
                courseName={showNewCourse ? newCourse.name : (selectedCourse?.name ?? '–')}
                courseCity={showNewCourse ? newCourse.city : (selectedCourse?.city ?? null)}
                matchName={matchName} holesConfig={holesConfig}
                hcpAllowance={hcpAllowance} formats={formats}
                players={players} contests={contests} units={units}
                formatConfig={formatConfig} error={createError}
              />
            )}
          </div>

          {/* Botón flotante */}
          <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, padding: '12px 18px 30px', background: 'linear-gradient(to top, #01050F 75%, transparent)' }}>
            {step < 4 ? (
              <button disabled={!canNext()} onClick={() => setStep(s => s + 1)}
                style={{ width: '100%', padding: '15px', background: canNext() ? C.primary : '#111124', color: canNext() ? C.text : C.muted, border: 'none', borderRadius: 12, fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: canNext() ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>
                {step === 3 ? 'Ver resumen →' : 'Continuar →'}
              </button>
            ) : (
              <button disabled={creating} onClick={handleCreate}
                style={{ width: '100%', padding: '15px', background: creating ? '#111124' : C.primary, color: creating ? C.muted : C.text, border: 'none', borderRadius: 12, fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: creating ? 'not-allowed' : 'pointer' }}>
                {creating ? 'Creando partida...' : '⛳ Crear partida'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────
// STEP 0 — CANCHA
// ─────────────────────────────────────────────

function StepCancha({ query, onQuery, results, selected, onSelect, showNew, onToggleNew, newCourse, onNewCourse }: any) {
  const updateHole = (i: number, field: 'par' | 'stroke_index', val: number) => {
    onNewCourse((p: any) => ({ ...p, holes: p.holes.map((h: HoleInput, idx: number) => idx === i ? { ...h, [field]: val } : h) }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 6 }}>¿En qué cancha jugás?</h2>
        <p style={{ fontSize: 13, color: C.muted }}>La cancha define el par y el stroke index de cada hoyo, necesarios para calcular el handicap.</p>
      </div>

      {!showNew && (
        <>
          {selected ? (
            <div style={{ background: '#0a1f0f', border: '1px solid #166534', borderRadius: 11, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20 }}>✓</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.success }}>{selected.name}</div>
                <div style={{ fontSize: 12, color: '#86efac' }}>{selected.city ?? ''}{selected.city ? ' · ' : ''}{selected.total_holes} hoyos · Par {selected.par ?? '–'}</div>
              </div>
              <button onClick={() => { onSelect(null); onQuery('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18, padding: '0 4px' }}>×</button>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke={C.muted} strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke={C.muted} strokeWidth="2" strokeLinecap="round"/></svg>
                <input style={{ flex: 1, background: 'none', border: 'none', fontFamily: FONT, fontSize: 14, color: C.text }}
                  placeholder="Buscar cancha existente..." value={query} onChange={e => onQuery(e.target.value)} autoFocus />
              </div>
              {results.length > 0 && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
                  {results.map((c: CourseResult, i: number) => (
                    <button key={c.id} onClick={() => onSelect(c)}
                      style={{ width: '100%', padding: '11px 14px', background: 'none', border: 'none', borderBottom: i < results.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: C.muted }}>{c.city ?? 'Sin ciudad'} · {c.total_holes} hoyos · Par {c.par ?? '–'}</div>
                      </div>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke={C.muted} strokeWidth="2" strokeLinecap="round"/></svg>
                    </button>
                  ))}
                </div>
              )}
              {query.length >= 2 && results.length === 0 && (
                <p style={{ fontSize: 12, color: C.muted, padding: '8px 2px' }}>Sin resultados para "{query}"</p>
              )}
            </div>
          )}
        </>
      )}

      {!selected && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 1, background: C.border }} />
          <span style={{ fontSize: 11, color: C.muted }}>o</span>
          <div style={{ flex: 1, height: 1, background: C.border }} />
        </div>
      )}

      {!selected && (
        <button onClick={onToggleNew}
          style={{ padding: '12px 14px', background: showNew ? C.primary + '18' : 'transparent', border: `1px solid ${showNew ? C.borderActive : C.border}`, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18, color: showNew ? C.text : C.muted }}>{showNew ? '✕' : '+'}</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: showNew ? C.text : C.muted }}>{showNew ? 'Cancelar' : 'Crear cancha nueva'}</div>
              {!showNew && <div style={{ fontSize: 11, color: C.muted }}>Se guarda y queda disponible para todos</div>}
            </div>
          </div>
        </button>
      )}

      {showNew && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 14px' }}>
          <Field label="Nombre *">
            <input style={inputStyle} placeholder="ej: Club de Golf Los Lagartos"
              value={newCourse.name} onChange={(e: any) => onNewCourse((p: any) => ({ ...p, name: e.target.value }))} autoFocus />
          </Field>
          <Field label="Ciudad">
            <input style={inputStyle} placeholder="ej: Buenos Aires"
              value={newCourse.city} onChange={(e: any) => onNewCourse((p: any) => ({ ...p, city: e.target.value }))} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Field label="Par total">
              <input style={inputStyle} type="number" placeholder="72" value={newCourse.par} onChange={(e: any) => onNewCourse((p: any) => ({ ...p, par: e.target.value }))} />
            </Field>
            <Field label="Rating">
              <input style={inputStyle} type="number" step="0.1" placeholder="71.3" value={newCourse.rating} onChange={(e: any) => onNewCourse((p: any) => ({ ...p, rating: e.target.value }))} />
            </Field>
            <Field label="Slope">
              <input style={inputStyle} type="number" placeholder="113" value={newCourse.slope} onChange={(e: any) => onNewCourse((p: any) => ({ ...p, slope: e.target.value }))} />
            </Field>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Hoyos — Par y SI</div>
            <p style={{ fontSize: 11, color: C.muted, marginBottom: 10, lineHeight: 1.5 }}>SI = dificultad del hoyo. SI 1 = más difícil. Debe ser único del 1 al 18.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {newCourse.holes.map((h: HoleInput, i: number) => (
                <div key={i} style={{ background: '#080812', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: C.muted, width: 22, flexShrink: 0, textAlign: 'right' }}>H{h.hole_number}</span>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {([3,4,5] as const).map(p => (
                      <button key={p} onClick={() => updateHole(i, 'par', p)}
                        style={{ width: 21, height: 21, borderRadius: 5, border: `1px solid ${h.par === p ? C.primary : C.border}`, background: h.par === p ? C.primary : 'transparent', color: h.par === p ? C.text : C.muted, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                        {p}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 'auto' }}>
                    <span style={{ fontSize: 9, color: C.muted }}>SI</span>
                    <input type="number" min={1} max={18} value={h.stroke_index}
                      onChange={e => updateHole(i, 'stroke_index', Math.min(18, Math.max(1, parseInt(e.target.value) || 1)))}
                      style={{ width: 32, padding: '2px 3px', background: '#01050F', border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, fontSize: 11, textAlign: 'center' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// STEP 1 — CONFIG
// ─────────────────────────────────────────────

function StepConfig({ name, onName, holesConfig, onHolesConfig, hcpAllowance, onHcpAllowance, contests, onContests, totalHoles }: any) {
  const holeNumbers = Array.from({ length: totalHoles }, (_, i) => i + 1)

  const toggleContest = (type: ContestInput['type']) => {
    onContests((prev: ContestInput[]) => {
      const exists = prev.find(c => c.type === type)
      if (exists) return prev.filter(c => c.type !== type)
      return [...prev, { type, hole: totalHoles >= 7 ? 7 : 1, name: type === 'long_drive' ? 'Long Drive' : 'Más cerca' }]
    })
  }

  const updateContest = (type: ContestInput['type'], field: keyof ContestInput, val: any) => {
    onContests((prev: ContestInput[]) => prev.map(c => c.type === type ? { ...c, [field]: val } : c))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 6 }}>Configuración</h2>
        <p style={{ fontSize: 13, color: C.muted }}>Nombre, hoyos y reglas de la partida.</p>
      </div>
      <Field label="Nombre de la partida *">
        <input style={inputStyle} placeholder="ej: Ranchada del sábado" value={name} onChange={(e: any) => onName(e.target.value)} autoFocus />
      </Field>
      <Field label="Hoyos a jugar">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {HOLES_OPTIONS.map(({ value, label, desc }) => {
            const active = holesConfig === value
            return (
              <button key={value} onClick={() => onHolesConfig(value)}
                style={{ padding: '10px 6px', borderRadius: 10, border: `1px solid ${active ? C.primary : C.border}`, background: active ? C.primary + '20' : 'transparent', cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: active ? C.text : C.muted }}>{label}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{desc}</div>
              </button>
            )
          })}
        </div>
      </Field>
      <Field label="Handicap allowance">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {HCP_OPTIONS.map(({ value, label, desc }) => {
            const active = hcpAllowance === value
            return (
              <button key={value} onClick={() => onHcpAllowance(value)}
                style={{ padding: '10px 6px', borderRadius: 10, border: `1px solid ${active ? C.primary : C.border}`, background: active ? C.primary + '20' : 'transparent', cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: active ? C.text : C.muted }}>{label}</div>
                <div style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>{desc}</div>
              </button>
            )
          })}
        </div>
      </Field>
      <Field label="Concursos especiales">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(['long_drive', 'best_approach'] as const).map(type => {
            const active = contests.find((c: ContestInput) => c.type === type)
            const isLD   = type === 'long_drive'
            return (
              <div key={type} style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${active ? C.borderActive : C.border}` }}>
                <button onClick={() => toggleContest(type)}
                  style={{ width: '100%', padding: '12px 14px', background: active ? C.primary + '14' : 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
                  <span style={{ fontSize: 20 }}>{isLD ? '🏌️' : '📍'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: active ? C.text : C.muted }}>{isLD ? 'Long Drive' : 'Best Approach (Más cerca)'}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{isLD ? 'Quién pegó más lejos dentro del fairway' : 'Quién quedó más cerca del hoyo'}</div>
                  </div>
                  <div style={{ width: 20, height: 20, borderRadius: 10, border: `2px solid ${active ? C.success : C.border}`, background: active ? C.success + '30' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {active && <span style={{ fontSize: 10, color: C.success }}>✓</span>}
                  </div>
                </button>
                {active && (
                  <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.border}`, background: C.card, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 5 }}>Hoyo</div>
                      <select value={active.hole} onChange={(e: any) => updateContest(type, 'hole', parseInt(e.target.value))}
                        style={{ ...inputStyle, padding: '8px 10px', width: '100%' }}>
                        {holeNumbers.map((h: number) => <option key={h} value={h} style={{ background: '#0d0d1a' }}>Hoyo {h}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 2 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 5 }}>Nombre</div>
                      <input style={{ ...inputStyle, padding: '8px 10px' }} value={active.name}
                        onChange={(e: any) => updateContest(type, 'name', e.target.value)}
                        placeholder={isLD ? 'Long Drive' : 'Más cerca'} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Field>
    </div>
  )
}

// ─────────────────────────────────────────────
// STEP 2 — MODALIDADES
// ─────────────────────────────────────────────

function StepFormatos({ formats, onFormats, formatConfig, onFormatConfig }: {
  formats: FormatKey[]; onFormats: (f: FormatKey[]) => void
  formatConfig: Record<string, any>; onFormatConfig: (fn: (p: Record<string, any>) => Record<string, any>) => void
}) {
  const toggle = (key: FormatKey) =>
    onFormats(formats.includes(key) ? formats.filter(f => f !== key) : [...formats, key])

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 6 }}>Modalidades</h2>
      <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
        Elegí una o varias. Los mismos jugadores compiten en todas simultáneamente.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {(Object.keys(FORMAT_DEFS) as FormatKey[]).map(key => {
          const def    = FORMAT_DEFS[key]
          const active = formats.includes(key)
          return (
            <div key={key} style={{ borderRadius: 12, border: `1px solid ${active ? def.color + '80' : C.border}`, background: active ? def.color + '10' : C.card, overflow: 'hidden', transition: 'all 0.15s' }}>
              <button onClick={() => toggle(key)}
                style={{ width: '100%', padding: '14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ marginTop: 2, width: 20, height: 20, borderRadius: 10, border: `2px solid ${active ? def.color : C.border}`, background: active ? def.color : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                  {active && <span style={{ fontSize: 11, color: '#fff', fontWeight: 900 }}>✓</span>}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: active ? def.color : C.text }}>{def.label}</span>
                    <span style={{ fontSize: 10, color: C.muted, background: '#1a1a2e', borderRadius: 5, padding: '2px 7px' }}>
                      {def.scope === 'individual' ? 'Individual' : def.scope === 'pair' ? 'Parejas' : 'Grupos de 4'}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: active ? C.text + 'cc' : C.muted, margin: 0, lineHeight: 1.5 }}>{def.desc}</p>
                </div>
              </button>

              {/* Config específica de fourball_clasico */}
              {key === 'fourball_clasico' && active && (
                <div style={{ padding: '0 14px 14px 46px', display: 'flex', alignItems: 'center', gap: 12, borderTop: `1px solid ${def.color}30` }}>
                  <span style={{ fontSize: 12, color: C.muted }}>Diferencia máxima de HCP entre los dos de la pareja:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button onClick={() => onFormatConfig(p => ({ ...p, fourball_clasico: { max_hcp_diff: Math.max(0, (p.fourball_clasico?.max_hcp_diff ?? 5) - 1) } }))}
                      style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.border}`, background: '#080812', color: C.text, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <span style={{ fontSize: 16, fontWeight: 700, color: def.color, minWidth: 28, textAlign: 'center' }}>
                      {formatConfig.fourball_clasico?.max_hcp_diff ?? 5}
                    </span>
                    <button onClick={() => onFormatConfig(p => ({ ...p, fourball_clasico: { max_hcp_diff: Math.min(36, (p.fourball_clasico?.max_hcp_diff ?? 5) + 1) } }))}
                      style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.border}`, background: '#080812', color: C.text, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// STEP 3 — JUGADORES
// ─────────────────────────────────────────────

function StepJugadores({ players, onPlayers, addName, onAddName, addHcp, onAddHcp, addTee, onAddTee, formats, units, onUnits }: any) {
  const teamFmts = formats.filter((f: FormatKey) => FORMAT_DEFS[f].scope !== 'individual')

  const addPlayer = () => {
    if (!addName.trim()) return
    const p: PlayerInput = {
      tempId: genId(), display_name: addName.trim(),
      handicap_index: parseFloat(addHcp) || 0, tee_color: addTee,
    }
    onPlayers((prev: PlayerInput[]) => [...prev, p])
    onAddName(''); onAddHcp('')
  }

  const removePlayer = (tempId: string) => {
    onPlayers((prev: PlayerInput[]) => prev.filter(p => p.tempId !== tempId))
    onUnits((prev: UnitInput[]) => prev.map(u => ({ ...u, player_temp_ids: u.player_temp_ids.filter(id => id !== tempId) })))
  }

  const assignPlayer = (globalUnitIdx: number, playerId: string) => {
    onUnits((prev: UnitInput[]) => {
      const fKey = prev[globalUnitIdx].format_key
      const size = FORMAT_DEFS[fKey].teamSize ?? 2
      const next = prev.map((u, i) =>
        u.format_key !== fKey ? u : { ...u, player_temp_ids: u.player_temp_ids.filter(id => id !== playerId) }
      )
      if (next[globalUnitIdx].player_temp_ids.length < size) {
        next[globalUnitIdx] = { ...next[globalUnitIdx], player_temp_ids: [...next[globalUnitIdx].player_temp_ids, playerId] }
      }
      return next
    })
  }

  const removeFromUnit = (globalUnitIdx: number, playerId: string) => {
    onUnits((prev: UnitInput[]) => prev.map((u, i) =>
      i === globalUnitIdx ? { ...u, player_temp_ids: u.player_temp_ids.filter(id => id !== playerId) } : u
    ))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 6 }}>Jugadores</h2>
        <p style={{ fontSize: 13, color: C.muted }}>Mínimo 2. El HCP index es el oficial WHS (ej: 14.2).</p>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 68px 42px', gap: 8, marginBottom: 10 }}>
          <Field label="Nombre">
            <input style={inputStyle} placeholder="García" value={addName}
              onChange={(e: any) => onAddName(e.target.value)}
              onKeyDown={(e: any) => e.key === 'Enter' && addPlayer()} />
          </Field>
          <Field label="HCP">
            <input style={{ ...inputStyle, textAlign: 'center' }} type="number" step="0.1" min="0" max="54" placeholder="14.2"
              value={addHcp} onChange={(e: any) => onAddHcp(e.target.value)} />
          </Field>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={addPlayer}
              style={{ width: '100%', height: 40, background: C.primary, color: C.text, border: 'none', borderRadius: 9, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: C.muted }}>Salida:</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {TEE_COLORS.map(t => (
              <button key={t.key} onClick={() => onAddTee(t.key)} title={t.label}
                style={{ width: 24, height: 24, borderRadius: 12, background: t.hex, border: `2px solid ${addTee === t.key ? '#fff' : 'transparent'}`, cursor: 'pointer' }} />
            ))}
          </div>
          <span style={{ fontSize: 11, color: C.muted }}>{TEE_COLORS.find(t => t.key === addTee)?.label}</span>
        </div>
      </div>

      {players.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Jugadores ({players.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {players.map((p: PlayerInput) => {
              const tee = TEE_COLORS.find(t => t.key === p.tee_color)
              return (
                <div key={p.tempId} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 6, background: tee?.hex ?? '#888', border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.text }}>{p.display_name}</span>
                  <span style={{ fontSize: 12, color: C.muted, background: '#111124', borderRadius: 6, padding: '2px 8px' }}>
                    {p.handicap_index === 0 ? 'Scratch' : `HCP ${p.handicap_index}`}
                  </span>
                  <button onClick={() => removePlayer(p.tempId)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18, padding: '0 2px', lineHeight: 1 }}>×</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {players.length < 2 && (
        <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', padding: '8px 0' }}>Agregá al menos 2 jugadores para continuar</p>
      )}

      {teamFmts.length > 0 && players.length >= 2 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>Armar equipos</div>
          {teamFmts.map((fKey: FormatKey) => {
            const def  = FORMAT_DEFS[fKey]
            const size = def.teamSize ?? 2
            const fmtUnits = units.map((u: UnitInput, absIdx: number) => ({ u, absIdx })).filter(({ u }: any) => u.format_key === fKey)
            const assignedIds = new Set(fmtUnits.flatMap(({ u }: any) => u.player_temp_ids))
            const unassigned  = players.filter((p: PlayerInput) => !assignedIds.has(p.tempId))

            return (
              <div key={fKey} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: def.color, marginBottom: 10 }}>
                  {def.label} — {def.scope === 'group' ? 'Grupos de 4' : 'Parejas de 2'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {fmtUnits.map(({ u: unit, absIdx }: any) => (
                    <div key={absIdx} style={{ background: C.card, border: `1px solid ${unit.player_temp_ids.length === size ? def.color + '60' : C.border}`, borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8 }}>{unit.name}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: unit.player_temp_ids.length < size ? 8 : 0 }}>
                        {unit.player_temp_ids.map((pid: string) => {
                          const pl  = players.find((p: PlayerInput) => p.tempId === pid)
                          const tee = TEE_COLORS.find(t => t.key === pl?.tee_color)
                          if (!pl) return null
                          return (
                            <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 6, background: def.color + '18', border: `1px solid ${def.color}50`, borderRadius: 7, padding: '5px 9px' }}>
                              <div style={{ width: 8, height: 8, borderRadius: 4, background: tee?.hex ?? '#888' }} />
                              <span style={{ fontSize: 12, color: C.text }}>{pl.display_name}</span>
                              <button onClick={() => removeFromUnit(absIdx, pid)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                            </div>
                          )
                        })}
                        {Array.from({ length: size - unit.player_temp_ids.length }).map((_, i) => (
                          <div key={`e-${i}`} style={{ display: 'flex', alignItems: 'center', border: `1px dashed ${C.border}`, borderRadius: 7, padding: '5px 12px' }}>
                            <span style={{ fontSize: 11, color: C.muted, fontStyle: 'italic' }}>vacío</span>
                          </div>
                        ))}
                      </div>
                      {unit.player_temp_ids.length < size && unassigned.length > 0 && (
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
                          {unassigned.map((p: PlayerInput) => (
                            <button key={p.tempId} onClick={() => assignPlayer(absIdx, p.tempId)}
                              style={{ fontSize: 11, color: C.text, background: '#111124', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 9px', cursor: 'pointer' }}>
                              + {p.display_name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// STEP 4 — CONFIRMAR
// ─────────────────────────────────────────────

function StepConfirmar({ courseName, courseCity, matchName, holesConfig, hcpAllowance, formats, players, contests, units, formatConfig, error }: any) {
  const holesLabel: Record<string, string> = { '18': '18 hoyos', front9: 'Primeros 9 (1–9)', back9: 'Vuelta (10–18)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 4 }}>Todo listo ⛳</h2>
        <p style={{ fontSize: 13, color: C.muted }}>Revisá el resumen y creá la partida.</p>
      </div>
      <SummaryCard label="Partida">
        <Row k="Nombre" v={matchName} />
        <Row k="Cancha" v={`${courseName}${courseCity ? ` · ${courseCity}` : ''}`} />
        <Row k="Hoyos" v={holesLabel[holesConfig] ?? holesConfig} />
        <Row k="Handicap" v={hcpAllowance === 0 ? 'Sin handicap' : `${hcpAllowance}%`} />
      </SummaryCard>

      <SummaryCard label="Modalidades">
        {formats.map((f: FormatKey) => (
          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: FORMAT_DEFS[f].color }} />
            <span style={{ fontSize: 13, color: C.text }}>{FORMAT_DEFS[f].label}</span>
            {f === 'fourball_clasico' && (
              <span style={{ fontSize: 11, color: C.muted, marginLeft: 'auto' }}>
                Máx diff HCP: {formatConfig.fourball_clasico?.max_hcp_diff ?? 5}
              </span>
            )}
          </div>
        ))}
      </SummaryCard>

      <SummaryCard label={`Jugadores (${players.length})`}>
        {players.map((p: PlayerInput) => {
          const tee = TEE_COLORS.find(t => t.key === p.tee_color)
          return (
            <div key={p.tempId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: tee?.hex ?? '#888' }} />
              <span style={{ fontSize: 13, color: C.text }}>{p.display_name}</span>
              <span style={{ fontSize: 11, color: C.muted, marginLeft: 'auto' }}>
                {p.handicap_index === 0 ? 'Scratch' : `HCP ${p.handicap_index}`}
              </span>
            </div>
          )
        })}
      </SummaryCard>

      {units.length > 0 && (
        <SummaryCard label="Equipos">
          {units.map((u: UnitInput, i: number) => {
            const def = FORMAT_DEFS[u.format_key]
            return (
              <div key={i} style={{ padding: '3px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 3, background: def.color }} />
                  <span style={{ fontSize: 11, color: C.muted }}>{def.label} · {u.name}</span>
                </div>
                <div style={{ paddingLeft: 14, fontSize: 12, color: C.text }}>
                  {u.player_temp_ids.map(id => players.find((p: PlayerInput) => p.tempId === id)?.display_name).filter(Boolean).join(' & ')}
                </div>
              </div>
            )
          })}
        </SummaryCard>
      )}

      {contests.length > 0 && (
        <SummaryCard label="Concursos">
          {contests.map((c: ContestInput) => (
            <div key={c.type} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
              <span style={{ fontSize: 14 }}>{c.type === 'long_drive' ? '🏌️' : '📍'}</span>
              <span style={{ fontSize: 13, color: C.text }}>{c.name}</span>
              <span style={{ fontSize: 11, color: C.muted, marginLeft: 'auto' }}>Hoyo {c.hole}</span>
            </div>
          ))}
        </SummaryCard>
      )}

      {error && (
        <div style={{ background: '#1a0505', border: '1px solid #7f1d1d', borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontSize: 13, color: C.error, margin: 0 }}>⚠️ {error}</p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// ÁTOMOS
// ─────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}

function SummaryCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '7px 14px', background: '#111124', borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0' }}>
      <span style={{ fontSize: 12, color: C.muted }}>{k}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{v}</span>
    </div>
  )
}