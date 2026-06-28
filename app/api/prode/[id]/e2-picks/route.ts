import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function adminDB() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Returns all users' E2 picks for the tournament (same authz pattern as all-picks)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = adminDB()
  const { data, error } = await admin
    .from('prode_stage2_picks')
    .select('user_id,match_id,home_score,away_score,pen_winner')
    .eq('tournament_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const picks = body?.picks as { match_id: string; home_score: number; away_score: number; pen_winner: string | null }[] | undefined
  if (!Array.isArray(picks) || picks.length === 0) {
    return NextResponse.json({ error: 'No picks provided' }, { status: 400 })
  }

  // Omit pen_winner when null — avoids PostgREST schema cache errors if column doesn't exist yet
  const rows = picks.map(p => {
    const row: Record<string, unknown> = {
      tournament_id: id,
      user_id: user.id,
      match_id: p.match_id,
      home_score: p.home_score,
      away_score: p.away_score,
    }
    if (p.pen_winner != null) row.pen_winner = p.pen_winner
    return row
  })

  const admin = adminDB()
  const { error } = await admin
    .from('prode_stage2_picks')
    .upsert(rows, { onConflict: 'tournament_id,user_id,match_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
