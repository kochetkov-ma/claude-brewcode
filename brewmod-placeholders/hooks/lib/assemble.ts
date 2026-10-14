// Pure expansion (the exact string brewtools would put in additionalContext) and the exactly-once merge against brewtools' blocks.

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

export type Built = { text: string; tokens: string[] }

// Null = brewtools would answer `{}`. Mode is exact: only the string `plan` is plan mode. `tokens` = canonical prefix+name per emitted block.
export function assembleBlocks(c: Compiled, prompt: string, mode?: string): Built | null {
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
  const tokens: string[] = []
  for (const d of picked) {
    if (d.body === '') continue
    const head = renderHeader(d.header, c.prefix, d.name.toLowerCase())
    blocks.push(head === '' ? d.body : `${head}\n\n${d.body}`)
    tokens.push(c.prefix + d.name.toLowerCase())
  }
  return blocks.length === 0 ? null : { text: capText(blocks.join(JOINER)), tokens }
}

export function assemble(c: Compiled, prompt: string, mode?: string): string | null {
  return assembleBlocks(c, prompt, mode)?.text ?? null
}

// Recompile only when the defs array (registry identity) or the prefix changed.
export function memoCompile(prev: Compiled | null, defs: readonly Def[], prefix: string): Compiled {
  return prev !== null && prev.defs === defs && prev.prefix === prefix ? prev : compileDefs(defs, prefix)
}

// ---- Exactly-once against brewtools (D6): its blocks open with 'User typed `<token>` ' and share ONE entry, joined by JOINER.

export const BREWTOOLS_SPLIT = /\n\n---\n\n(?=User typed `(?:\+\+\+|\+\+m|\+\+a|\+\+rr|\+\+r)` )/
const BREWTOOLS_HEADER = /^User typed `([^`]+)` /

// Drops every brewtools block whose token the mod emitted; the mod text goes in once at the first drop. Other blocks and entries stay.
export function dedupe(entries: readonly string[], built: Built): { entries: string[]; inserted: boolean } {
  const mine = new Set(built.tokens)
  const out: string[] = []
  let inserted = false
  for (const entry of entries) {
    const kept: string[] = []
    for (const block of entry.split(BREWTOOLS_SPLIT)) {
      const token = BREWTOOLS_HEADER.exec(block)?.[1]
      if (token !== undefined && mine.has(token)) {
        if (!inserted) {
          inserted = true
          kept.push(built.text)
        }
      } else kept.push(block)
    }
    if (kept.length > 0) out.push(kept.join(JOINER))
  }
  return { entries: inserted ? out : [...entries], inserted }
}

// Final additionalContext: de-dup against brewtools; nothing dropped (brewtools absent, other prefix) -> append the mod text once.
export function injectOnce(entries: readonly string[] | undefined, built: Built): string[] {
  const base = entries ?? []
  const merged = dedupe(base, built)
  return merged.inserted ? merged.entries : [...base, built.text]
}
