import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { SPECIAL_KEYS } from '@/lib/prode-specials'

function adminDB() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Real specials are global (real-world award winners), not per-tournament —
// this route is nested under a tournament id only to reuse the existing
// admin-of-this-tournament auth check.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: t } = await supabase.from('prode_tournaments').select('admin_id').eq('id', id).maybeSingle()
  if (!t || t.admin_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const row: Record<string, string | number | null> = { id: 1 }
  for (const key of SPECIAL_KEYS) {
    row[key] = typeof body[key] === 'string' && body[key].trim() ? body[key].trim() : null
  }

  const { error } = await adminDB().from('prode_real_specials').upsert(row)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
