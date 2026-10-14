// Pure expansion: the exact string brewtools would put in additionalContext. De-dup against brewtools lands in T2.4.

import type { Def } from './defs'
import { DEFAULT_PREFIX, compileMatchers, matches, type Matchers } from './match'

export type Compiled = { prefix: string; defs: readonly Def[]; matchers: Matchers }

export const JOINER = '\n\n---\n\n'
export const MAX_CHARS = 9000

// UserPromptSubmit also fires for subagent deliveries; only the leading tag marks them. Ported 1:1 from brewtools.
export const SYNTHETIC_PROMPT = /^\s*<(?:task-notification>|agent-message\s+from=)/

// additionalContext cap is 10,000 chars: slice by UTF-16 units (may split a surrogate pair, as brewtools does).
export function capText(s: string, max = MAX_CHARS): string {
  return s.length > max ? s.slice(0, max) + '\n...[truncated]' : s
}

export function compileDefs(defs: readonly Def[], prefix = DEFAULT_PREFIX): Compiled {
  return { prefix, defs, matchers: compileMatchers(prefix, defs.map((d) => d.name)) }
}

// Header token is the canonical prefix + name; split/join so `$` in a header is never a replacement pattern.
export function renderHeader(header: string, prefix: string, name: string): string {
  return header.split('{token}').join(prefix + name)
}

const applies = (d: Def, plan: boolean): boolean => d.when === 'always' || (d.when === 'plan') === plan

// Same-name defs both applicable: `plan` beats `always`/`not-plan`; equal rank -> first wins.
const rank = (d: Def): number => (d.when === 'plan' ? 2 : 1)

// Null = brewtools would answer `{}`. Mode is exact: only the string `plan` is plan mode.
export function assemble(c: Compiled, prompt: string, mode?: string): string | null {
  if (SYNTHETIC_PROMPT.test(prompt) || !prompt.includes(c.prefix)) return null
  const plan = mode === 'plan'

  const winners = new Map<string, Def>()
  for (const d of c.defs) {
    if (d.insert !== 'context' || !applies(d, plan)) continue
    const key = d.name.toLowerCase()
    const cur = winners.get(key)
    if (cur === undefined || rank(d) > rank(cur)) winners.set(key, d)
  }

  const hit = [...winners.values()].filter((d) => matches(c.matchers, prompt, d.name))
  const best = new Map<string, Def>()
  for (const d of hit) {
    if (d.group === undefined) continue
    const cur = best.get(d.group)
    if (cur === undefined || d.priority > cur.priority) best.set(d.group, d)
  }
  const picked = hit
    .filter((d) => d.group === undefined || best.get(d.group) === d)
    .sort((a, b) => a.order - b.order)

  const blocks: string[] = []
  for (const d of picked) {
    if (d.body === '') continue
    const head = renderHeader(d.header, c.prefix, d.name.toLowerCase())
    blocks.push(head === '' ? d.body : `${head}\n\n${d.body}`)
  }
  return blocks.length === 0 ? null : capText(blocks.join(JOINER))
}
