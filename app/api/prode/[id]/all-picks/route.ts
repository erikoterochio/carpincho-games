import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function adminDB() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: tournament } = await supabase
    .from('prode_tournaments')
    .select('admin_id')
    .eq('id', id)
    .maybeSingle()

  // Allow any tournament participant (not just admin) — picks are public within the tournament
  const { data: participant } = await supabase
    .from('prode_participants')
    .select('user_id')
    .eq('tournament_id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!tournament || (!participant && tournament.admin_id !== user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = adminDB()

  // PostgREST max_rows cap is 1000 — paginate to get all picks
  const allPicks: Record<string, unknown>[] = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await admin
      .from('prode_stage1_picks')
      .select('user_id, match_id, home_score, away_score, predicted_home, predicted_away, pen_winner')
      .eq('tournament_id', id)
      .range(from, from + pageSize - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    allPicks.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  return NextResponse.json(allPicks)
}
