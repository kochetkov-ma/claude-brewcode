import { BREAKS_6_9_5, PLACEHOLDER_FILES, VECTORS } from './parity/golden.generated'
import { parseDefinition, stemBase, toDef, type Def } from '../hooks/lib/defs'

// Body of a shipped placeholders/<stem>.md as the parser reads it.
export const bodyOf = (stem: string): string => toDef(parseDefinition(PLACEHOLDER_FILES[stem] ?? ''), stemBase(stem))?.body ?? `NO ${stem}`

// Shipped defaults parsed from the raw placeholders/*.md captured in the golden file; the stem gives a plan part its kind.
export const defaultDefs = (): Def[] =>
  Object.entries(PLACEHOLDER_FILES).map(([file, raw]) => {
    const def = toDef(parseDefinition(raw), stemBase(file))
    if (def === null) throw new Error(`placeholders/${file}.md has no name`)
    return def
  })

// Expected text of a golden vector with the reviewed 6.9.5 overlay applied (null = nothing injected).
export const golden = (id: string): string | null => {
  const b = BREAKS_6_9_5[id]
  if (b !== undefined) return b.expected
  const v = VECTORS.find((x) => x.id === id)
  return v === undefined ? `MISSING ${id}` : v.expected
}

export const def = (over: Partial<Def> & { name: string }): Def => ({
  body: 'B',
  insert: 'context',
  order: 100,
  priority: 0,
  header: '',
  isPlan: false,
  ...over,
})
