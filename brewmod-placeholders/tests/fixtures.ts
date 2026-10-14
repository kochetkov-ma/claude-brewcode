import { PLACEHOLDER_FILES, type GoldenFile } from './parity/golden.generated'
import { parseDefinition, parseLegacy, toDef, type Def } from '../hooks/lib/defs'

// Shipped defaults parsed from the raw placeholders/*.md captured in the golden file.
export const defaultDefs = (): Def[] =>
  Object.entries(PLACEHOLDER_FILES).map(([file, raw]) => {
    const def = toDef(parseDefinition(raw))
    if (def === null) throw new Error(`placeholders/${file}.md has no name`)
    return def
  })

// A brewtools-style override replaces the body of the def whose `legacy` matches; metadata is inherited.
export const applyOverrides = (defs: Def[], files: readonly GoldenFile[]): Def[] => {
  const out = defs.slice()
  for (const f of files) {
    const at = out.findIndex((d) => d.legacy === f.legacy)
    const base = out[at]
    if (at < 0 || base === undefined) throw new Error(`no default def for legacy ${f.legacy}`)
    const next = toDef(parseLegacy(f.raw), base)
    if (next === null) throw new Error(`override for ${f.legacy} lost its name`)
    out[at] = next
  }
  return out
}

export const def = (over: Partial<Def> & { name: string }): Def => ({
  body: 'B',
  insert: 'context',
  when: 'always',
  order: 100,
  priority: 0,
  header: '',
  ...over,
})
