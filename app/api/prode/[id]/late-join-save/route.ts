import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function adminDB() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: part } = await supabase
    .from('prode_participants')
    .select('late_join')
    .eq('tournament_id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!part?.late_join) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const picks: any[] = body.picks ?? []
  if (!picks.length) return NextResponse.json({ saved: 0 })

  // For real match IDs (not KO slot IDs), verify the match hasn't kicked off yet
  const realIds = picks.map(p => p.match_id).filter(id => !id.startsWith('ko-'))
  if (realIds.length) {
    const { data: ms } = await supabase
      .from('prode_matches')
      .select('id, kickoff')
      .in('id', realIds)
    const now = new Date()
    for (const m of ms ?? []) {
      if (new Date(m.kickoff) <= now)
        return NextResponse.json({ error: `Partido ${m.id} ya comenzó` }, { status: 400 })
    }
  }

  const rows = picks.map(p => ({
    tournament_id: id,
    user_id: user.id,
    match_id: p.match_id,
    home_score: p.home_score,
    away_score: p.away_score,
    predicted_home: p.predicted_home ?? null,
    predicted_away: p.predicted_away ?? null,
    pen_winner: p.pen_winner ?? null,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await adminDB()
    .from('prode_stage1_picks')
    .upsert(rows, { onConflict: 'tournament_id,user_id,match_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ saved: rows.length })
}
