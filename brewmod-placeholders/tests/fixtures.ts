import { PLACEHOLDER_FILES } from './parity/golden.generated'
import { parseDefinition, toDef, type Def } from '../hooks/lib/defs'

// Body of a shipped placeholders/<stem>.md as the parser reads it.
export const bodyOf = (stem: string): string => toDef(parseDefinition(PLACEHOLDER_FILES[stem] ?? ''))?.body ?? `NO ${stem}`

// Shipped defaults parsed from the raw placeholders/*.md captured in the golden file.
export const defaultDefs = (): Def[] =>
  Object.entries(PLACEHOLDER_FILES).map(([file, raw]) => {
    const def = toDef(parseDefinition(raw))
    if (def === null) throw new Error(`placeholders/${file}.md has no name`)
    return def
  })

export const def = (over: Partial<Def> & { name: string }): Def => ({
  body: 'B',
  insert: 'context',
  when: 'always',
  order: 100,
  priority: 0,
  header: '',
  ...over,
})
