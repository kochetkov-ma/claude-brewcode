// Pure definition parsing: front-matter subset + brewtools extractFenced port. Zero I/O; layers/legacy/root live elsewhere.

export type When = 'always' | 'plan' | 'not-plan'
export type Insert = 'context' | 'inline'

export type DefMeta = {
  name?: string
  description?: string
  insert?: Insert
  when?: When
  order?: number
  group?: string
  priority?: number
  header?: string
  legacy?: string
}

export type Parsed = { meta: DefMeta; text: string; hasFrontMatter: boolean; issues: string[] }

export type Def = {
  name: string
  body: string
  insert: Insert
  when: When
  order: number
  group?: string
  priority: number
  header: string
  legacy?: string
  description?: string
}

// Text inside all ``` or ~~~ fences, blank-line joined; no fence -> whole raw trimmed. 1:1 port of brewtools.
export function extractFenced(raw: string): string {
  const blocks: string[] = []
  const re = /(?:```|~~~)[^\n]*\n([\s\S]*?)\n?(?:```|~~~)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    blocks.push((m[1] ?? '').replace(/\n+$/, ''))
  }
  if (blocks.length === 0) return raw.trim()
  return blocks.join('\n\n').trim()
}

type Split = { fm: string; body: string }

// Front matter = first line `---` (after an optional BOM) up to the next `---` line; unterminated -> none.
function splitFrontMatter(raw: string): Split | null {
  const src = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  const open = /^---[ \t]*\r?\n/.exec(src)
  if (!open) return null
  const start = open[0].length
  let pos = start
  while (pos <= src.length) {
    const nl = src.indexOf('\n', pos)
    const end = nl === -1 ? src.length : nl
    if (/^---[ \t]*$/.test(src.slice(pos, end).replace(/\r$/, ''))) {
      return { fm: src.slice(start, pos), body: nl === -1 ? '' : src.slice(nl + 1) }
    }
    if (nl === -1) break
    pos = nl + 1
  }
  return null
}

function scalar(value: string): string {
  const dq = /^"((?:[^"\\]|\\.)*)"/.exec(value)
  if (dq) {
    try {
      return JSON.parse(dq[0]) as string
    } catch {
      return dq[1] ?? ''
    }
  }
  const sq = /^'((?:[^']|'')*)'/.exec(value)
  if (sq) return (sq[1] ?? '').replace(/''/g, "'")
  return value.replace(/\s+#.*$/, '').trim()
}

const INT = /^-?\d+$/

// Tolerant subset: `key: scalar` lines, "double"/'single'/bare scalars; unknown keys and bad values -> issues, never throws.
export function parseFrontMatter(fm: string): { meta: DefMeta; issues: string[] } {
  const meta: DefMeta = {}
  const issues: string[] = []
  fm.split('\n').forEach((rawLine, i) => {
    const line = rawLine.replace(/\r$/, '')
    if (line.trim() === '' || line.trimStart().startsWith('#')) return
    const kv = /^([A-Za-z_][\w-]*)[ \t]*:[ \t]*(.*)$/.exec(line)
    if (!kv) {
      issues.push(`line ${i + 1}: not a key: value pair`)
      return
    }
    const key = kv[1] ?? ''
    const value = scalar(kv[2] ?? '')
    switch (key) {
      case 'name':
      case 'description':
      case 'group':
      case 'header':
      case 'legacy':
        meta[key] = value
        break
      case 'insert':
        if (value === 'context' || value === 'inline') meta.insert = value
        else issues.push(`insert: '${value}' is not context|inline`)
        break
      case 'when':
        if (value === 'always' || value === 'plan' || value === 'not-plan') meta.when = value
        else issues.push(`when: '${value}' is not always|plan|not-plan`)
        break
      case 'order':
      case 'priority':
        if (INT.test(value)) meta[key] = Number(value)
        else issues.push(`${key}: '${value}' is not an integer`)
        break
      default:
        issues.push(`unknown key '${key}'`)
    }
  })
  return { meta, issues }
}

// Mod-native definition file: optional front matter, body through extractFenced (no front matter -> whole file).
export function parseDefinition(raw: string): Parsed {
  const split = splitFrontMatter(raw)
  if (!split) return { meta: {}, text: extractFenced(raw), hasFrontMatter: false, issues: [] }
  const { meta, issues } = parseFrontMatter(split.fm)
  return { meta, text: extractFenced(split.body), hasFrontMatter: true, issues }
}

// Brewtools override file: never front matter, the whole file is the fenced source.
export function parseLegacy(raw: string): Parsed {
  return { meta: {}, text: extractFenced(raw), hasFrontMatter: false, issues: [] }
}

// Per-field inheritance: parsed meta wins, then base, then built-ins. No name anywhere -> null.
export function toDef(parsed: Parsed, base?: Partial<Def>): Def | null {
  const m = parsed.meta
  const name = m.name ?? base?.name
  if (name === undefined || name === '') return null
  const group = m.group ?? base?.group
  const legacy = m.legacy ?? base?.legacy
  const description = m.description ?? base?.description
  return {
    name,
    body: parsed.text,
    insert: m.insert ?? base?.insert ?? 'context',
    when: m.when ?? base?.when ?? 'always',
    order: m.order ?? base?.order ?? 100,
    priority: m.priority ?? base?.priority ?? 0,
    header: m.header ?? base?.header ?? '',
    ...(group === undefined ? {} : { group }),
    ...(legacy === undefined ? {} : { legacy }),
    ...(description === undefined ? {} : { description }),
  }
}
