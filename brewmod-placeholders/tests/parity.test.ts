import { test, expect } from 'claude-code/testing'
import { VECTORS, PLACEHOLDER_FILES } from './parity/golden.generated'
import { compileDefs } from '../hooks/lib/assemble'
import { applyOverrides, assemble, defaultDefs } from './fixtures'

// The kit cannot read placeholders/*.md: the frozen golden embeds them as the spec; edits to the files are not tied to it.
const SPEC_LENGTHS: Record<string, number> = {
  'spec-1': 1790, 'spec-2': 3515, 'spec-3': 1019, 'spec-4': 571,
  'spec-5': 895, 'spec-6': 1395, 'spec-7': 6845, 'spec-8': 3394,
}

for (const v of VECTORS) {
  test(`GIVEN vector ${v.id} (${v.group}, mode ${v.mode}, prefix ${v.prefix}) WHEN the mod assembles it THEN the output is byte-identical to brewtools`, async () => {
    const out = assemble(compileDefs(applyOverrides(defaultDefs(), v.files), v.prefix), v.prompt, v.mode ?? undefined)

    expect(out, `${v.id}: assembled string`).toBe(v.expected)
    expect(out?.length ?? null, `${v.id}: length`).toBe(v.length)
  })
}

for (const [id, length] of Object.entries(SPEC_LENGTHS)) {
  test(`GIVEN parity spec vector ${id} WHEN its golden is read THEN the length is the spec length ${length}`, async () => {
    const v = VECTORS.find((x) => x.id === id)

    expect(v?.length, `${id}: golden length`).toBe(length)
  })
}

test('GIVEN the golden file WHEN its groups are counted THEN 8 spec, 16 edge and the custom-prefix vectors exist', async () => {
  const counts: Record<string, number> = {}
  for (const v of VECTORS) counts[v.group] = (counts[v.group] ?? 0) + 1

  expect(counts, 'vectors per group').toEqual({
    spec: 8, edge: 16, extra: 29, override: 26, cap: 5, 'launch-dir': 3, 'custom-prefix': 11,
  })
})

test('GIVEN the shipped defaults WHEN the golden file is built THEN the six placeholder files are embedded', async () => {
  expect(Object.keys(PLACEHOLDER_FILES), 'embedded definition files').toEqual(['+', 'a', 'm', 'm.plan', 'r', 'rr'])
})

test('GIVEN the surrogate-split cap vector WHEN brewtools truncated it THEN a lone high surrogate precedes the marker', async () => {
  const v = VECTORS.find((x) => x.id === 'o29-cap-splits-surrogate')

  expect(v?.expected?.slice(8999), 'tail after unit 8999').toBe('\ud83d\n...[truncated]')
})

test('GIVEN a custom-prefix run WHEN the prompt uses the default prefix THEN nothing is expanded', async () => {
  const out = assemble(compileDefs(defaultDefs(), '@@'), '++m ++a', 'default')

  expect(out, 'default-prefix tokens under @@').toBe(null)
})
