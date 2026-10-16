// Module state shared by the editor hooks and the registry: names for highlight and typeahead.
import { compileMatchers, type Matchers } from './match'
import type { EditorEntry } from './editor'

export const DEFAULT_ENTRIES: readonly EditorEntry[] = [
  { name: 'm', description: 'Manager mode: orchestrate and delegate, never code in the main context' },
  { name: 'a', description: 'Architecture-first: delegate the design to expert agents before implementing' },
  { name: 'r', description: 'Two-phase review: review every significant change, then double-check each finding' },
  { name: 'rr', description: 'Anti-regression review: regression, project standard and functional correctness axes' },
  { name: '+', description: 'Anti-drift cron for the current task; plan mode plans it as a step' },
]

let entries: readonly EditorEntry[] = DEFAULT_ENTRIES
let compiled: { entries: readonly EditorEntry[]; prefix: string; ms: Matchers } | null = null

// Registry hook (session.start): replace the names the editor knows; pass a NEW array each time.
export function setEditorEntries(next: readonly EditorEntry[]): void {
  entries = next
}

export function getEditorEntries(): readonly EditorEntry[] {
  return entries
}

// Matchers for the current entries; rebuilt only when the entries array or the prefix changes.
export function editorMatchers(prefix: string): Matchers {
  if (compiled === null || compiled.entries !== entries || compiled.prefix !== prefix) {
    compiled = { entries, prefix, ms: compileMatchers(prefix, entries.map((e) => e.name)) }
  }
  return compiled.ms
}
