// Pure placeholder matching: precompiled regexes, draft scan -> tokens. Zero I/O; bit-identical to brewtools for prefix `++`.

export const DEFAULT_PREFIX = '++'

export type PlaceholderToken = { text: string; name: string; isKnown: boolean; start: number; end: number }
// Same shape as types/index.d.ts PlaceholderView: escapedBy = the first escape marker, set with isEscaped.
export type PlaceholderView = { tokens: PlaceholderToken[]; isEscaped?: true; escapedBy?: string }
export type PrefixCheck = { prefix: string; warning: string | null }
export type NameKind = 'word' | 'symbol'

export type Matcher = { name: string; kind: NameKind; scan: RegExp }
export type Matchers = { prefix: string; byName: ReadonlyMap<string, Matcher>; unknown: RegExp; escape: RegExp }

const PREFIX_FIX = '/config -> Placeholder prefix'
const PREFIX_RE = /^[!-/:-@[-^`{-~]{2,8}$/
const WORD_NAME = /^[A-Za-z0-9_]{1,32}$/
const SYMBOL_NAME = /^[!-/:-@[-^`{-~]+$/

// Invalid prefix -> `++` plus a warning; a leading `/` is allowed but warned (slash-command clash).
export function validatePrefix(raw: unknown): PrefixCheck {
  if (raw === undefined) return { prefix: DEFAULT_PREFIX, warning: null }
  if (typeof raw !== 'string' || !PREFIX_RE.test(raw)) {
    return { prefix: DEFAULT_PREFIX, warning: `prefix must be 2-8 ASCII punctuation characters (not _), using ${DEFAULT_PREFIX} · change: ${PREFIX_FIX}` }
  }
  return { prefix: raw, warning: raw.startsWith('/') ? `prefix starting with / clashes with slash commands · change: ${PREFIX_FIX}` : null }
}

export function nameKind(name: string): NameKind | null {
  if (WORD_NAME.test(name)) return 'word'
  if (SYMBOL_NAME.test(name)) return 'symbol'
  return null
}

const escRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const escClass = (s: string): string => s.replace(/[\\\][^-]/g, '\\$&')
// Class of what glues to a symbol token or a marker: letters, digits, marks, `_` and `chars`.
const glue = (chars: string): string => `[\\p{L}\\p{N}\\p{M}_${escClass([...new Set(chars)].join(''))}]`

function build(prefix: string, name: string, kind: NameKind): Matcher {
  const token = escRe(prefix + name)
  if (kind === 'word') {
    const src = `(?<![\\w${escClass(prefix)}])${token}(?![\\w])`
    return { name, kind, scan: new RegExp(src, 'gi') }
  }
  const cls = glue(prefix + name)
  const src = `(?<!${cls})${token}(?!${cls})`
  return { name, kind, scan: new RegExp(src, 'gu') }
}

// Names are keyed lowercase; a name that is neither word nor symbol is skipped.
export function compileMatchers(prefix: string, names: Iterable<string>): Matchers {
  const byName = new Map<string, Matcher>()
  for (const raw of names) {
    const name = raw.toLowerCase()
    const kind = nameKind(name)
    if (kind === null || byName.has(name)) continue
    byName.set(name, build(prefix, name, kind))
  }
  const unknown = new RegExp(`(?<![\\w${escClass(prefix)}])${escRe(prefix)}(\\w+)`, 'g')
  return { prefix, byName, unknown, escape: escapeScan(prefix) }
}

// `P/` and `P\`: either one anywhere in a message sends it as typed, every placeholder off.
export const escapeMarkers = (prefix: string): [string, string] => [`${prefix}/`, `${prefix}\\`]

// A marker glued on its left to a letter, digit, mark, `_` or a prefix char is none (`c++/java`, `+++/`).
export const escapeScan = (prefix: string): RegExp => new RegExp(`(?<!${glue(prefix)})(?:${escapeMarkers(prefix).map(escRe).join('|')})`, 'gu')

// First escape marker in a text, null = not escaped; compiled matchers reuse their regex (`match`, never `exec`: it is `g`).
export function markerOf(src: Matchers | string, text: string): string | null {
  const prefix = typeof src === 'string' ? src : src.prefix
  if (!text.includes(prefix)) return null
  return text.match(typeof src === 'string' ? escapeScan(prefix) : src.escape)?.[0] ?? null
}

export const isEscaped = (src: Matchers | string, text: string): boolean => markerOf(src, text) !== null

// Draft -> known and unknown tokens sorted by start; unknown = standalone `P\w+` with an undefined name.
export function scanDraft(ms: Matchers, text: string): PlaceholderView {
  if (!text.includes(ms.prefix)) return { tokens: [] }
  const tokens: PlaceholderToken[] = []
  for (const m of ms.byName.values()) {
    for (const hit of text.matchAll(m.scan)) {
      const start = hit.index ?? 0
      tokens.push({ text: hit[0], name: m.name, isKnown: true, start, end: start + hit[0].length })
    }
  }
  for (const hit of text.matchAll(ms.unknown)) {
    const name = (hit[1] ?? '').toLowerCase()
    if (ms.byName.has(name)) continue
    const start = hit.index ?? 0
    tokens.push({ text: hit[0], name, isKnown: false, start, end: start + hit[0].length })
  }
  return { tokens: tokens.sort((a, b) => a.start - b.start) }
}
