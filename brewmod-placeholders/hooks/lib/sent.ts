// What a prompt sends, per token: TS port of `assemble` in hooks/inject.mjs plus a reason for every token not sent. Zero I/O.
import type { Def } from './defs'
import { compileDefs, type Compiled } from './compiled'
import { expandInline, inlineBodies } from './inline'
import { DEFAULT_PREFIX, markerOf, scanDraft } from './match'

export const MAX_CHARS = 9000
const JOINER = '\n\n---\n\n'
const CUT_NOTE = '\n...[truncated]'
// First `at` chars, one fewer when the last would be a lone high surrogate (inject.mjs cuts the same way).
const cutAt = (text: string, at: number): string => {
  const c = text.charCodeAt(at - 1)
  return text.slice(0, c >= 0xd800 && c <= 0xdbff ? at - 1 : at)
}
// Subagent deliveries arrive as prompts too; only the leading tag marks them (inject.mjs skips them).
const SYNTHETIC_PROMPT = /^\s*<(?:task-notification>|agent-message\s+from=)/

export const REASON = {
  planOnly: 'plan only',
  notInPlan: 'not in plan mode',
  empty: 'not sent: empty',
  staysAsTyped: 'stays as typed',
  overCap: `not sent: over ${MAX_CHARS} chars`,
  cut: `cut at ${MAX_CHARS} chars`,
  delivery: 'not sent: delivery tag',
  unknown: 'unknown placeholder',
} as const
// Plan-mode part labels and tags of the band and `/placeholders show`.
export const PLAN_LABEL = { adds: 'plan mode adds:', instead: 'plan mode sends instead:', onlyPart: 'plan mode only:', only: REASON.planOnly, plus: 'plan +' } as const
const winsReason = (token: string): string => `not sent: ${token} wins`
export const escapedReason = (marker: string): string => `not sent: ${marker} in this message`

// text = exact text the token adds ('' = nothing; a mode mismatch carries the other mode's text).
export type Sent = { token: string; name: string; kind: 'context' | 'inline' | 'none'; text: string; isSent: boolean; reason: string | null }
// prompt = the text after inline expansion; context = the hook's additionalContext ('' = none); tokens = one per known draft name, draft order.
export type Draft = { prompt: string; context: string; tokens: Sent[] }

const unsent = (reason: string): Pick<Sent, 'text' | 'isSent' | 'reason'> => ({ text: '', isSent: false, reason })
// The hook sends nothing for a delivery tag or a prompt without the prefix.
const isSkipped = (prompt: string, prefix: string): boolean => SYNTHETIC_PROMPT.test(prompt) || !prompt.includes(prefix)

const applies = (d: Def, plan: boolean): boolean => d.when === 'always' || (d.when === 'plan') === plan
// Same name, both applicable: `plan` beats `always`/`not-plan`; equal rank -> first wins.
const rank = (d: Def): number => (d.when === 'plan' ? 2 : 1)

function blockOf(d: Def, prefix: string): { text: string } {
  const head = d.header.split('{token}').join(prefix + d.name.toLowerCase())
  return { text: head === '' ? d.body : `${head}\n\n${d.body}` }
}

function modeWinners(defs: readonly Def[], plan: boolean): Map<string, Def> {
  const out = new Map<string, Def>()
  for (const d of defs) {
    if (d.insert !== 'context' || !applies(d, plan)) continue
    const key = d.name.toLowerCase()
    const cur = out.get(key)
    if (cur === undefined || rank(d) > rank(cur)) out.set(key, d)
  }
  return out
}

const isAdd = (p: Def, base: Def | undefined): base is Def => p.when === 'plan' && p.plan === 'add' && base?.when === 'always'

// `plan: add` part on its `always` def: plan header if any, normal body, '\n\n', addition. Empty normal body = silenced in both modes.
const withPart = (base: Def, part: Def): Def =>
  base.body === '' ? base : { ...base, header: part.header === '' ? base.header : part.header, body: part.body === '' ? base.body : `${base.body}\n\n${part.body}` }

// What each name sends in this mode: in plan mode an `add` winner is joined to the normal def, else the mode winner as is.
function winners(defs: readonly Def[], plan: boolean): Map<string, Def> {
  const out = modeWinners(defs, plan)
  if (!plan) return out
  const normal = modeWinners(defs, false)
  for (const [key, d] of out) {
    const base = normal.get(key)
    if (isAdd(d, base)) out.set(key, withPart(base, d))
  }
  return out
}

// The caller's compiled defs (register.ts memoises them); a bare defs array is compiled per call.
export type DefsLike = Compiled | readonly Def[]
const isCompiled = (src: DefsLike): src is Compiled => !Array.isArray(src)
const compiledOf = (src: DefsLike, prefix: string): Compiled => (isCompiled(src) ? (src.prefix === prefix ? src : compileDefs(src.defs, prefix)) : compileDefs(src, prefix))

// inject.mjs order: mode winners that hit the prompt, then the top priority per group, then `order`. lost = group loser name -> its winner.
function pick(c: Compiled, prompt: string, plan: boolean): { picked: Def[]; lost: Map<string, Def> } {
  const hit = [...winners(c.defs, plan).values()].filter((d) => {
    const m = c.matchers.byName.get(d.name.toLowerCase())
    return m !== undefined && prompt.search(m.scan) >= 0
  })
  const best = new Map<string, Def>()
  for (const d of hit) {
    if (d.group === undefined) continue
    const cur = best.get(d.group)
    if (cur === undefined || d.priority > cur.priority) best.set(d.group, d)
  }
  const lost = new Map<string, Def>()
  for (const d of hit) {
    const top = d.group === undefined ? d : best.get(d.group)
    if (top !== undefined && top !== d) lost.set(d.name.toLowerCase(), top)
  }
  return { picked: hit.filter((d) => !lost.has(d.name.toLowerCase())).sort((a, b) => a.order - b.order), lost }
}

// Joined blocks capped like inject.mjs; cuts = name -> its block text past the cap ('' = dropped), whole blocks absent.
function join(picked: readonly Def[], prefix: string): { context: string; cuts: Map<string, string> } {
  const blocks = picked.filter((d) => d.body !== '').map((d) => ({ name: d.name.toLowerCase(), text: blockOf(d, prefix).text }))
  const cuts = new Map<string, string>()
  let at = 0
  for (const b of blocks) {
    const room = MAX_CHARS - at
    if (room < b.text.length) cuts.set(b.name, room > 0 ? cutAt(b.text, room) + CUT_NOTE : '')
    at += b.text.length + JOINER.length
  }
  const joined = blocks.map((b) => b.text).join(JOINER)
  return { context: joined.length > MAX_CHARS ? cutAt(joined, MAX_CHARS) + CUT_NOTE : joined, cuts }
}

// The hook's whole answer, port of inject.mjs `run` + `assemble`: '' = nothing; only the mode string `plan` is plan mode.
export function injectedContext(src: DefsLike, prefix: string, prompt: string, mode: unknown): string {
  const c = compiledOf(src, prefix)
  if (isSkipped(prompt, prefix) || markerOf(c.matchers, prompt) !== null) return ''
  return join(pick(c, prompt, mode === 'plan').picked, prefix).context
}

// A name's plan-mode text: add (`plan: add` on an `always` def; plan = the addition body), replace (plan = the plan block), only (no normal def) or none.
export type PlanParts = { normal: string; plan: string; kind: 'add' | 'replace' | 'only' | 'none' }
export function planParts(defs: readonly Def[], name: string, prefix: string = DEFAULT_PREFIX): PlanParts {
  const key = name.toLowerCase()
  const ctx = defs.filter((d) => d.insert === 'context' && d.name.toLowerCase() === key)
  const p = modeWinners(ctx, true).get(key)
  const b = modeWinners(ctx, false).get(key)
  const normal = b === undefined || b.body === '' ? '' : blockOf(b, prefix).text
  if (p === undefined || p === b) return { normal, plan: '', kind: 'none' }
  // An add part over an empty normal body sends nothing in plan mode either.
  if (isAdd(p, b)) return b.body === '' ? { normal, plan: '', kind: 'none' } : { normal, plan: p.body, kind: 'add' }
  return { normal, plan: blockOf(p, prefix).text, kind: b === undefined ? 'only' : 'replace' }
}

// Known names of a draft, first occurrence order.
function knownNames(c: Compiled, text: string): string[] {
  const names: string[] = []
  for (const t of scanDraft(c.matchers, text).tokens) if (t.isKnown && !names.includes(t.name)) names.push(t.name)
  return names
}

const strip = (token: string, prefix: string): string => (token.startsWith(prefix) && token.length > prefix.length ? token.slice(prefix.length) : token).toLowerCase()

// One token alone in a prompt (`r` or `++r`): its context block or inline text in this mode, else why not.
export function sentText(token: string, defs: readonly Def[], prefix: string, isPlan: boolean): Sent {
  const name = strip(token, prefix)
  const base = { token: prefix + name, name }
  const ctx = defs.filter((d) => d.insert === 'context' && d.name.toLowerCase() === name)
  if (ctx.length > 0) {
    const now = winners(ctx, isPlan).get(name)
    if (now !== undefined) return now.body === '' ? { ...base, kind: 'context', ...unsent(REASON.empty) } : { ...base, kind: 'context', ...blockOf(now, prefix), isSent: true, reason: null }
    const other = winners(ctx, !isPlan).get(name)
    const block = other === undefined || other.body === '' ? { text: '' } : blockOf(other, prefix)
    return { ...base, kind: 'context', ...block, isSent: false, reason: isPlan ? REASON.notInPlan : REASON.planOnly }
  }
  const body = inlineBodies(defs).get(name)
  if (body !== undefined) return { ...base, kind: 'inline', text: body, isSent: true, reason: null }
  const inl = defs.filter((d) => d.insert === 'inline' && d.name.toLowerCase() === name)
  if (inl.length === 0) return { ...base, kind: 'none', ...unsent(REASON.unknown) }
  return { ...base, kind: 'inline', ...unsent(inl.some((d) => d.when === 'always' && d.body === '') ? REASON.empty : REASON.staysAsTyped) }
}

// A typed draft as the person sends it: inline expansion (module), then the context blocks (command hook) with group and cap reasons.
// Escaped (`P/`): sent verbatim, nothing expanded or injected. A marker an inline body brings in: no context, inline text stays expanded.
export function assembleDraft(text: string, src: DefsLike, prefix: string, isPlan: boolean): Draft {
  const c = compiledOf(src, prefix)
  const marker = markerOf(c.matchers, text)
  if (marker !== null) return { prompt: text, context: '', tokens: knownNames(c, text).map((name) => ({ ...sentText(name, c.defs, prefix, isPlan), ...unsent(escapedReason(marker)) })) }
  const prompt = expandInline(c, text) ?? text
  const late = markerOf(c.matchers, prompt)
  const skipped = isSkipped(prompt, prefix)
  const { picked, lost } = skipped || late !== null ? { picked: [], lost: new Map<string, Def>() } : pick(c, prompt, isPlan)
  const { context, cuts } = join(picked, prefix)
  const tokens = knownNames(c, text).map((name): Sent => {
    const s = sentText(name, c.defs, prefix, isPlan)
    if (s.kind !== 'context') return s
    if (late !== null) return { ...s, ...unsent(escapedReason(late)) }
    if (!s.isSent) return s
    if (skipped) return { ...s, ...unsent(REASON.delivery) }
    const top = lost.get(name)
    if (top !== undefined) return { ...s, ...unsent(winsReason(prefix + top.name.toLowerCase())) }
    const cut = cuts.get(name)
    if (cut === undefined) return s
    return cut === '' ? { ...s, ...unsent(REASON.overCap) } : { ...s, text: cut, reason: REASON.cut }
  })
  return { prompt, context, tokens }
}
