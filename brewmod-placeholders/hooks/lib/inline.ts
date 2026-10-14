// Pure helpers: inline expansion of a submitted prompt and the unknown-token list for the toast. Zero I/O.

import type { Compiled } from './assemble'
import type { Def } from './defs'
import { scanDraft, type Matchers } from './match'

// Origins whose text is the person's own typed prompt; every other kind (notifications, peers, schedules) is left alone.
const INLINE_ORIGINS: ReadonlySet<string> = new Set(['composer', 'bridge', 'sdk'])

export type SubmitLike = { origin: { kind: string }; command?: unknown; isMeta?: unknown }

// prompt.submit has no mode: expansion needs a real person's prompt, no slash command, and no isMeta (a rewrite of those prompts is partial or absent).
export function isInlineSubmit(e: SubmitLike): boolean {
  return INLINE_ORIGINS.has(e.origin.kind) && e.command === undefined && e.isMeta === undefined
}

// Lowercase name -> body. Only `insert: inline` + `when: always` defs with a non-empty body; first wins per name.
// A name that also has a context def is excluded entirely, so one token can never be inserted twice (inline + context).
export function inlineBodies(defs: readonly Def[]): Map<string, string> {
  const contextNames = new Set<string>()
  for (const d of defs) if (d.insert === 'context') contextNames.add(d.name.toLowerCase())
  const out = new Map<string, string>()
  for (const d of defs) {
    const key = d.name.toLowerCase()
    if (d.insert !== 'inline' || d.when !== 'always' || d.body === '' || contextNames.has(key) || out.has(key)) continue
    out.set(key, d.body)
  }
  return out
}

// One pass over the original text (no body re-scan here); the classic pass later expands context tokens a body carries, as brewtools does. Null = nothing to change.
// Non-always inline defs and empty bodies stay verbatim; inline text has no block header.
export function expandInline(c: Compiled, text: string): string | null {
  if (!text.includes(c.prefix)) return null
  const bodies = inlineBodies(c.defs)
  if (bodies.size === 0) return null
  const known = scanDraft(c.matchers, text)
    .tokens.filter((t) => t.isKnown)
    .sort((a, b) => a.start - b.start || b.end - a.end)

  let out = ''
  let at = 0
  let changed = false
  for (const t of known) {
    if (t.start < at) continue
    const body = bodies.get(t.name)
    if (body === undefined) continue
    out += text.slice(at, t.start) + body
    at = t.end
    changed = true
  }
  return changed ? out + text.slice(at) : null
}

const MAX_NAMED = 5

// The toast is for text the person typed: `user` and `sdk`, or a payload that carries no source yet; loops, schedules and peers never.
export const isTypedSource = (source: unknown): boolean => source === undefined || source === 'user' || source === 'sdk'

const CODE_SPAN = /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g
const CODE_NEXT = /[;)[\]]/

// Unknown `prefix+word` tokens of a prompt: unique (case-insensitive), first-seen order, original spelling.
// Code is not a typo: tokens inside fences or backticks, or closed by `;` `)` `[` `]` (`++i)`, `a[++i]`), are left out.
export function unknownTokens(ms: Matchers, text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const plain = text.replace(CODE_SPAN, (m) => ' '.repeat(m.length))
  for (const t of scanDraft(ms, plain).tokens) {
    if (t.isKnown || seen.has(t.text.toLowerCase()) || CODE_NEXT.test(text.charAt(t.end))) continue
    seen.add(t.text.toLowerCase())
    out.push(t.text)
  }
  return out
}

export function unknownMessage(tokens: readonly string[]): string {
  const shown = tokens.slice(0, MAX_NAMED).join(', ')
  const more = tokens.length > MAX_NAMED ? ` and ${tokens.length - MAX_NAMED} more` : ''
  return `unknown ${shown}${more}`
}
