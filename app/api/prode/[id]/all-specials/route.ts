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

  const admin = adminDB()

  // Fetch by participant user IDs (tournament_id may be null in legacy rows)
  const [{ data: tournament }, { data: parts }] = await Promise.all([
    admin.from('prode_tournaments').select('admin_id').eq('id', id).maybeSingle(),
    admin.from('prode_participants').select('user_id').eq('tournament_id', id),
  ])

  const userIds = ((parts ?? []) as any[]).map(p => p.user_id)
  const isParticipant = userIds.includes(user.id)

  if (!tournament || (!isParticipant && tournament.admin_id !== user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (userIds.length === 0) return NextResponse.json([])

  const { data, error } = await admin
    .from('prode_stage1_specials')
    .select('*')
    .in('user_id', userIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
