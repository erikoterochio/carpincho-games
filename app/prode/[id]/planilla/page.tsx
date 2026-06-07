import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import PrintButton from './PrintButton'

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: 'short',
  })
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export default async function PlanillaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: tournament }, { data: rawMatches }] = await Promise.all([
    supabase.from('prode_tournaments').select('name,code').eq('id', id).maybeSingle(),
    supabase.from('prode_matches').select('*').eq('stage', 'group').order('sort_order'),
  ])

  if (!tournament) {
    return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>Torneo no encontrado.</div>
  }

  const matches = rawMatches ?? []

  // Get teams per group for the standings table
  const teamsByGroup: Record<string, string[]> = {}
  for (const g of GROUPS) {
    const gms = matches.filter(m => m.group_name === g)
    const teams = Array.from(new Set(gms.flatMap(m => [m.home_team, m.away_team])))
    if (teams.length) teamsByGroup[g] = teams
  }

  const activeGroups = GROUPS.filter(g => teamsByGroup[g]?.length > 0)

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; background: #fff; }
        .no-print { }
        @media print {
          .no-print { display: none !important; }
          body { font-size: 10px; }
          .page-break { page-break-before: always; }
        }
        h1 { font-size: 17px; font-weight: 900; margin-bottom: 2px; }
        h2 { font-size: 11px; font-weight: normal; color: #555; margin-bottom: 18px; }
        .group-block { margin-bottom: 22px; break-inside: avoid; }
        .group-title {
          background: #002B7F;
          color: #fff;
          font-weight: 900;
          font-size: 11px;
          letter-spacing: 1.5px;
          padding: 5px 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .group-row {
          display: grid;
          grid-template-columns: 1fr 280px;
          gap: 0;
          border: 1px solid #ccc;
          border-top: none;
        }
        table { width: 100%; border-collapse: collapse; }
        th {
          background: #f0f0f0;
          font-size: 9px;
          font-weight: 700;
          padding: 4px 6px;
          text-align: left;
          border-bottom: 1px solid #ccc;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          color: #555;
        }
        td { padding: 5px 6px; border-bottom: 1px solid #eee; vertical-align: middle; }
        tr:last-child td { border-bottom: none; }
        .score-cell {
          text-align: center;
          font-size: 13px;
          font-weight: 900;
          color: #ccc;
          letter-spacing: 3px;
          white-space: nowrap;
        }
        .team-home { text-align: right; font-weight: 600; }
        .team-away { text-align: left; font-weight: 600; }
        .date-col { color: #555; white-space: nowrap; font-size: 10px; }
        .standings-table { border-left: 1px solid #ccc; }
        .standings-table td { text-align: center; font-size: 10px; }
        .standings-table td:first-child { text-align: left; font-weight: 600; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .standings-table th:first-child { text-align: left; }
        .footer-note { font-size: 9px; color: #aaa; margin-top: 6px; text-align: center; }
        .header-bar {
          display: flex; align-items: flex-start; justify-content: space-between;
          margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #002B7F;
        }
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px 24px;
        }
        @media print {
          .grid-2 { grid-template-columns: 1fr 1fr; }
        }
        .points-key { font-size: 9px; color: #555; line-height: 1.8; }
        .points-key b { color: #002B7F; }
      `}</style>

      {/* No-print toolbar */}
      <div className="no-print" style={{ background: '#002B7F', padding: '10px 20px', display: 'flex', gap: 12, alignItems: 'center' }}>
        <Link href={`/prode/${id}`} style={{ color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>← Volver</Link>
        <span style={{ color: 'rgba(255,255,255,0.4)' }}>|</span>
        <PrintButton />
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Ctrl+P para imprimir</span>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 20px 40px' }}>

        {/* Header */}
        <div className="header-bar">
          <div>
            <h1>{tournament.name}</h1>
            <h2>Planilla de predicciones — Fase de grupos · Copa Mundial 2026</h2>
          </div>
          <div className="points-key">
            <div><b>Resultado exacto:</b> 7 pts</div>
            <div><b>Ganador + diferencia:</b> 5 pts</div>
            <div><b>Solo ganador:</b> 3 pts</div>
            <div><b>Empate correcto:</b> 5 pts</div>
            <div><b>Empate equivocado:</b> 2 pts</div>
          </div>
        </div>

        {activeGroups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
            Los partidos aún no fueron sincronizados.<br />
            El administrador debe hacer Sync API primero.
          </div>
        ) : (
          <div className="grid-2">
            {activeGroups.map(g => {
              const gms = matches
                .filter(m => m.group_name === g)
                .sort((a: any, b: any) => a.sort_order - b.sort_order)
              const teams = teamsByGroup[g] ?? []

              return (
                <div key={g} className="group-block">
                  <div className="group-title">
                    <span>GRUPO {g}</span>
                    <span style={{ fontSize: 9, fontWeight: 400, letterSpacing: 0.5, opacity: 0.8 }}>{gms.length} partidos</span>
                  </div>

                  <div className="group-row">
                    {/* Matches */}
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 38 }}>Fecha</th>
                          <th style={{ width: 30 }}>Hora</th>
                          <th>Local</th>
                          <th style={{ width: 44, textAlign: 'center' }}>Result.</th>
                          <th>Visitante</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gms.map((m: any, i: number) => (
                          <tr key={m.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td className="date-col">{m.kickoff ? fmtDate(m.kickoff) : '—'}</td>
                            <td className="date-col">{m.kickoff ? fmtTime(m.kickoff) : '—'}</td>
                            <td className="team-home">{m.home_team}</td>
                            <td className="score-cell">__-__</td>
                            <td className="team-away">{m.away_team}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Standings */}
                    <table className="standings-table">
                      <thead>
                        <tr>
                          <th>Equipo</th>
                          <th style={{ width: 16 }}>J</th>
                          <th style={{ width: 16 }}>G</th>
                          <th style={{ width: 16 }}>E</th>
                          <th style={{ width: 16 }}>P</th>
                          <th style={{ width: 20 }}>DG</th>
                          <th style={{ width: 22 }}>Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teams.map((t: string) => (
                          <tr key={t}>
                            <td>{t}</td>
                            <td></td><td></td><td></td><td></td><td></td><td></td>
                          </tr>
                        ))}
                        {/* Fill rows if less than 4 teams found */}
                        {Array.from({ length: Math.max(0, 4 - teams.length) }).map((_, i) => (
                          <tr key={`empty-${i}`}>
                            <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="footer-note" style={{ marginTop: 28 }}>
          carpinchogames.com.ar · {tournament.name} · {new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </div>
      </div>

    </>
  )
}
