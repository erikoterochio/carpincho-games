// Deletes all KO picks for the Violines 2026 tournament.
// Run ONCE before deploying the Annex C fix.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(join(__dir, '..', '.env.local'), 'utf8')
const get = (key) => env.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim()

const TOURNAMENT_ID = '556ecf70-41c7-4d29-a0a9-9fe416d20b8e'

const supabase = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'))

const { data, error } = await supabase
  .from('prode_stage1_picks')
  .delete()
  .eq('tournament_id', TOURNAMENT_ID)
  .like('match_id', 'ko-%')
  .select('match_id')

if (error) {
  console.error('Error:', error.message)
  process.exit(1)
}

console.log(`Deleted ${data?.length ?? 0} KO picks from tournament ${TOURNAMENT_ID}`)
