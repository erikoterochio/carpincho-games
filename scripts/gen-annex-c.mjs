import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

const csv = readFileSync(join(__dir, 'annex-c.csv'), 'utf8').trim().split('\n')
// headers: Opcion,1A,1B,1D,1E,1G,1I,1K,1L,Mejores8
// idx→col mapping: idx0→1E(col4), idx1→1I(col6), idx2→1A(col1), idx3→1L(col8),
//                  idx4→1D(col3), idx5→1G(col5), idx6→1B(col2), idx7→1K(col7)
const IDX_COL = [4, 6, 1, 8, 3, 5, 2, 7]  // col index for each idx 0..7

const entries = []
for (let r = 1; r < csv.length; r++) {
  const cols = csv[r].split(',')
  const key = cols[9].trim()   // Mejores8
  const slots = IDX_COL.map(c => cols[c].trim().slice(1))  // '3E' → 'E'
  entries.push(`  '${key}': ${JSON.stringify(slots)},`)
}

const output = `// Auto-generated from scripts/annex-c.csv — do not edit manually
// Key = 8 qualifying groups (sorted), Value = source group for each idx (0-7)
// idx 0→P74(vsE), 1→P77(vsI), 2→P79(vsA), 3→P80(vsL),
//     4→P81(vsD), 5→P82(vsG), 6→P85(vsB), 7→P87(vsK)
export const ANNEX_C: Record<string, string[]> = {
${entries.join('\n')}
}
`

const outPath = join(__dir, '..', 'lib', 'annex-c.ts')
writeFileSync(outPath, output, 'utf8')
console.log(`Written ${entries.length} combinations to lib/annex-c.ts`)
