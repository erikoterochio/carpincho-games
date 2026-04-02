'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────

type Course = {
  id: string; name: string; city: string | null
  par: number | null; total_holes: number
  rating: number | null; slope: number | null
  created_by: string | null; is_public: boolean
  created_at: string
}

type Hole = {
  hole_number: number; par: number; stroke_index: number
  distance_black: number | null; distance_blue: number | null
  distance_white: number | null; distance_yellow: number | null; distance_red: number | null
}

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────

const FONT = "'Ubuntu', sans-serif"
const C = {
  bg: '#01050F', card: '#0d0d1a', border: '#1e1736',
  primary: '#055074', text: '#c1c1c6', muted: '#706c7e',
  success: '#4ade80',
} as const

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: '#080812', border: `1px solid #1e1736`,
  borderRadius: 9, color: '#c1c1c6', fontSize: 14, fontFamily: FONT,
}

const DEFAULT_PARS: (3|4|5)[] = [4,4,3,4,4,5,3,4,4, 4,3,4,5,4,4,3,4,5]
type HoleInput = { hole_number: number; par: 3|4|5; stroke_index: number }
function makeDefaultHoles(): HoleInput[] {
  return Array.from({ length: 18 }, (_, i) => ({
    hole_number: i + 1, par: DEFAULT_PARS[i], stroke_index: i + 1,
  }))
}

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────

export default function CanchasPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [loading,    setLoading]    = useState(true)
  const [courses,    setCourses]    = useState<Course[]>([])
  const [userId,     setUserId]     = useState<string | null>(null)
  const [query,      setQuery]      = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [selected,   setSelected]   = useState<string | null>(null)  // course.id para ver detalle
  const [courseHoles, setCourseHoles] = useState<Record<string, Hole[]>>({})
  const [saving,     setSaving]     = useState(false)

  // Formulario de nueva cancha
  const [form, setForm] = useState({
    name: '', city: '', par: '', rating: '', slope: '',
    holes: makeDefaultHoles(),
  })

  // ── Carga inicial
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)

      const { data } = await supabase
        .from('golf_courses')
        .select('id,name,city,par,total_holes,rating,slope,created_by,is_public,created_at')
        .eq('is_public', true)
        .order('name')
      setCourses(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  // ── Cargar hoyos de una cancha al expandir
  const loadHoles = async (courseId: string) => {
    if (courseHoles[courseId]) return   // ya cargados
    const { data } = await supabase
      .from('golf_holes')
      .select('hole_number,par,stroke_index,distance_black,distance_blue,distance_white,distance_yellow,distance_red')
      .eq('course_id', courseId)
      .order('hole_number')
    setCourseHoles(prev => ({ ...prev, [courseId]: data ?? [] }))
  }

  // ── Toggle detalle
  const toggleDetail = (courseId: string) => {
    if (selected === courseId) { setSelected(null); return }
    setSelected(courseId)
    loadHoles(courseId)
  }

  // ── Guardar cancha nueva
  const handleCreate = async () => {
    if (!form.name.trim() || !userId) return
    setSaving(true)
    try {
      const { data: c, error: cErr } = await supabase
        .from('golf_courses')
        .insert({
          name: form.name.trim(),
          city: form.city.trim() || null,
          par:  form.par  ? parseInt(form.par)   : null,
          rating: form.rating ? parseFloat(form.rating) : null,
          slope:  form.slope  ? parseInt(form.slope)   : 113,
          created_by: userId,
          is_public: true,
        })
        .select('id,name,city,par,total_holes,rating,slope,created_by,is_public,created_at')
        .single()
      if (cErr) throw cErr

      await supabase.from('golf_holes').insert(
        form.holes.map(h => ({ ...h, course_id: c.id }))
      )

      setCourses(prev => [c, ...prev])
      setShowCreate(false)
      setForm({ name: '', city: '', par: '', rating: '', slope: '', holes: makeDefaultHoles() })
    } catch {}
    setSaving(false)
  }

  const updateHole = (i: number, field: 'par' | 'stroke_index', val: number) => {
    setForm(p => ({ ...p, holes: p.holes.map((h, idx) => idx === i ? { ...h, [field]: val } : h) }))
  }

  // ── Filtro de búsqueda
  const filtered = courses.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    (c.city?.toLowerCase().includes(query.toLowerCase()) ?? false)
  )

  // ─── RENDER ──────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input, select { font-family: 'Ubuntu', sans-serif; }
        input::placeholder { color: #4a4a55; }
        input:focus, select:focus { outline: none; }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.4; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #1e1736; border-radius: 3px; }
      `}</style>

      <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT, color: C.text, paddingBottom: 40 }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          {/* Navbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: C.bg, zIndex: 10 }}>
            <Link href="/golf" style={{ color: C.muted, display: 'flex', alignItems: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke={C.muted} strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </Link>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.text, flex: 1 }}>Canchas</span>
            {userId && (
              <button onClick={() => setShowCreate(!showCreate)}
                style={{ padding: '7px 14px', background: showCreate ? '#111124' : C.primary, border: `1px solid ${showCreate ? C.border : 'transparent'}`, borderRadius: 9, fontFamily: FONT, fontSize: 13, fontWeight: 700, color: showCreate ? C.muted : C.text, cursor: 'pointer' }}>
                {showCreate ? 'Cancelar' : '+ Nueva'}
              </button>
            )}
          </div>

          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Formulario nueva cancha */}
            {showCreate && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Nueva cancha</div>

                <Field label="Nombre *">
                  <input style={inputStyle} placeholder="Club de Golf..." value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus />
                </Field>

                <Field label="Ciudad">
                  <input style={inputStyle} placeholder="Buenos Aires" value={form.city}
                    onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
                </Field>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <Field label="Par total">
                    <input style={inputStyle} type="number" placeholder="72" value={form.par}
                      onChange={e => setForm(p => ({ ...p, par: e.target.value }))} />
                  </Field>
                  <Field label="Rating">
                    <input style={inputStyle} type="number" step="0.1" placeholder="71.3" value={form.rating}
                      onChange={e => setForm(p => ({ ...p, rating: e.target.value }))} />
                  </Field>
                  <Field label="Slope">
                    <input style={inputStyle} type="number" placeholder="113" value={form.slope}
                      onChange={e => setForm(p => ({ ...p, slope: e.target.value }))} />
                  </Field>
                </div>

                {/* Hoyos */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                    Hoyos — Par y SI (stroke index)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                    {form.holes.map((h, i) => (
                      <div key={i} style={{ background: '#080812', border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 9px', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 9, color: C.muted, width: 20, textAlign: 'right', flexShrink: 0 }}>H{h.hole_number}</span>
                        {([3,4,5] as const).map(p => (
                          <button key={p} onClick={() => updateHole(i, 'par', p)}
                            style={{ width: 20, height: 20, borderRadius: 4, border: `1px solid ${h.par === p ? C.primary : C.border}`, background: h.par === p ? C.primary : 'transparent', color: h.par === p ? C.text : C.muted, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                            {p}
                          </button>
                        ))}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 'auto' }}>
                          <span style={{ fontSize: 9, color: C.muted }}>SI</span>
                          <input type="number" min={1} max={18} value={h.stroke_index}
                            onChange={e => updateHole(i, 'stroke_index', Math.min(18, Math.max(1, parseInt(e.target.value) || 1)))}
                            style={{ width: 30, padding: '1px 2px', background: '#01050F', border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontSize: 10, textAlign: 'center' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <button onClick={handleCreate} disabled={saving || !form.name.trim()}
                  style={{ padding: '13px', background: saving || !form.name.trim() ? '#111124' : C.primary, border: 'none', borderRadius: 10, fontFamily: FONT, fontSize: 14, fontWeight: 700, color: saving || !form.name.trim() ? C.muted : C.text, cursor: saving || !form.name.trim() ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Guardando...' : 'Guardar cancha'}
                </button>
              </div>
            )}

            {/* Buscador */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="8" stroke={C.muted} strokeWidth="2"/>
                <path d="M21 21l-4.35-4.35" stroke={C.muted} strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input style={{ flex: 1, background: 'none', border: 'none', fontFamily: FONT, fontSize: 14, color: C.text }}
                placeholder="Buscar cancha..." value={query} onChange={e => setQuery(e.target.value)} />
              {query && <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18, padding: 0 }}>×</button>}
            </div>

            {/* Lista de canchas */}
            {loading ? (
              <p style={{ textAlign: 'center', color: C.muted, padding: '30px 0', fontSize: 13 }}>Cargando...</p>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>⛳</div>
                <p style={{ fontSize: 14 }}>{query ? `Sin resultados para "${query}"` : 'No hay canchas cargadas aún'}</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filtered.map(c => (
                  <CourseCard
                    key={c.id}
                    course={c}
                    holes={courseHoles[c.id] ?? null}
                    expanded={selected === c.id}
                    onToggle={() => toggleDetail(c.id)}
                    isOwner={c.created_by === userId}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────
// CARD DE CANCHA
// ─────────────────────────────────────────────

function CourseCard({ course, holes, expanded, onToggle, isOwner }: {
  course: Course; holes: Hole[] | null
  expanded: boolean; onToggle: () => void; isOwner: boolean
}) {
  return (
    <div style={{ background: '#0d0d1a', border: `1px solid ${expanded ? '#055074' : '#1e1736'}`, borderRadius: 14, overflow: 'hidden', transition: 'border-color 0.15s' }}>
      {/* Header clickeable */}
      <button onClick={onToggle}
        style={{ width: '100%', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#c1c1c6', marginBottom: 3 }}>{course.name}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {course.city && <span style={{ fontSize: 11, color: '#706c7e' }}>{course.city}</span>}
            <span style={{ fontSize: 11, color: '#706c7e' }}>{course.total_holes} hoyos</span>
            {course.par && <span style={{ fontSize: 11, color: '#706c7e' }}>Par {course.par}</span>}
            {course.rating && <span style={{ fontSize: 11, color: '#706c7e' }}>Rating {course.rating}</span>}
            {course.slope && course.slope !== 113 && <span style={{ fontSize: 11, color: '#706c7e' }}>Slope {course.slope}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {isOwner && <span style={{ fontSize: 9, fontWeight: 700, color: '#055074', letterSpacing: 0.8 }}>TUYA</span>}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
            <path d="M6 9l6 6 6-6" stroke="#706c7e" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
      </button>

      {/* Detalle de hoyos */}
      {expanded && (
        <div style={{ borderTop: '1px solid #1e1736', padding: '12px 16px', overflowX: 'auto' }}>
          {holes === null ? (
            <p style={{ fontSize: 12, color: '#706c7e', textAlign: 'center', padding: '10px 0' }}>Cargando hoyos...</p>
          ) : holes.length === 0 ? (
            <p style={{ fontSize: 12, color: '#706c7e', textAlign: 'center', padding: '10px 0' }}>Sin hoyos cargados</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: FONT, minWidth: 380 }}>
              <thead>
                <tr>
                  {['H', 'Par', 'SI', '⬛', '🔵', '⬜', '🟡', '🔴'].map(h => (
                    <th key={h} style={{ padding: '4px 6px', color: '#706c7e', fontWeight: 700, textAlign: 'center', borderBottom: '1px solid #1e1736', fontSize: 10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holes.map(h => (
                  <tr key={h.hole_number}>
                    <td style={{ padding: '5px 6px', textAlign: 'center', color: '#706c7e', fontWeight: 700 }}>{h.hole_number}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'center', color: '#c1c1c6', fontWeight: 700 }}>{h.par}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'center', color: '#706c7e' }}>{h.stroke_index}</td>
                    {['distance_black','distance_blue','distance_white','distance_yellow','distance_red'].map(key => (
                      <td key={key} style={{ padding: '5px 6px', textAlign: 'center', color: '#4a4a55' }}>
                        {(h as any)[key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                {/* Totales */}
                <tr style={{ borderTop: '1px solid #1e1736' }}>
                  <td style={{ padding: '5px 6px', textAlign: 'center', color: '#706c7e', fontWeight: 700 }}>Σ</td>
                  <td style={{ padding: '5px 6px', textAlign: 'center', color: '#c1c1c6', fontWeight: 700 }}>
                    {holes.reduce((s, h) => s + h.par, 0)}
                  </td>
                  <td colSpan={6} />
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// ATOM
// ─────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#706c7e', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}