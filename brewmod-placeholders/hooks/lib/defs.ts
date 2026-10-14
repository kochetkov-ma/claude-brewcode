// Definition parsing (pure) + layered registry (D7). File access only through an injected Io, never `$`.

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

// ---- Layers (D7): lowest to highest priority; a layer file replaces the one below it, field by field.

export type IoEntry = { name: string; kind: 'file' | 'dir' | 'other'; size: number; mtimeMs: number; isLink: boolean }
export type Io = {
  exists: (path: string) => Promise<boolean>
  list: (path: string) => Promise<readonly IoEntry[]>
  read: (path: string) => Promise<string>
}

export type LayerKind = 'native' | 'legacy'
export type LayerSpec = { id: string; kind: LayerKind; dir: string }
export type LayerFiles = { id: string; kind: LayerKind; files: ReadonlyMap<string, string> }
export type Roots = { pluginRoot: string; root?: string; configDir?: string }
export type Resolved = { defs: Def[]; issues: string[]; sources: Map<string, string> }
export type Registry = { defs: readonly Def[]; issues: readonly string[]; sources: ReadonlyMap<string, string> }

const trimSep = (p: string): string => (p.length > 1 ? p.replace(/[\\/]+$/, '') : p)

// Absolute POSIX paths get `.`/`..`/double-slash folding (path.resolve); anything else only loses trailing separators.
export function normalizeDir(p: string): string {
  if (!p.startsWith('/')) return trimSep(p)
  const out: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return '/' + out.join('/')
}

// Port of brewtools configDir(): CLAUDE_CONFIG_DIR when non-empty, else <home>/.claude; no home -> undefined.
export function configDirOf(configEnv: string | undefined, home: string | undefined): string | undefined {
  if (configEnv !== undefined && configEnv !== '') return normalizeDir(configEnv)
  if (home === undefined || home === '') return undefined
  return `${trimSep(home)}/.claude`
}

// Plugin defaults, then per scope the brewtools legacy dir under the mod's own dir (global below project).
export function layerSpecs(r: Roots): LayerSpec[] {
  const specs: LayerSpec[] = [{ id: 'default', kind: 'native', dir: `${trimSep(r.pluginRoot)}/placeholders` }]
  if (r.configDir !== undefined) {
    const cfg = trimSep(r.configDir)
    specs.push({ id: 'global-legacy', kind: 'legacy', dir: `${cfg}/manager/prompts` })
    specs.push({ id: 'global', kind: 'native', dir: `${cfg}/placeholders` })
  }
  if (r.root !== undefined) {
    const root = trimSep(r.root)
    specs.push({ id: 'project-legacy', kind: 'legacy', dir: `${root}/.claude/brewtools/manager/prompts` })
    specs.push({ id: 'project', kind: 'native', dir: `${root}/.claude/placeholders` })
  }
  return specs
}

// A native file without front matter and without a lower layer: `x.plan` -> name x, plan variant.
function stemBase(stem: string): Partial<Def> {
  return stem.endsWith('.plan') && stem.length > 5 ? { name: stem.slice(0, -5), when: 'plan' } : { name: stem }
}

// Layers low to high; a stem is a file name without `.md`. Legacy files map to the stem whose def carries that `legacy`.
export function resolveDefs(layers: readonly LayerFiles[]): Resolved {
  const cur = new Map<string, Def>()
  const sources = new Map<string, string>()
  const issues: string[] = []
  const legacyStem = new Map<string, string>()
  const put = (id: string, stem: string, parsed: Parsed, base: Partial<Def> | undefined): void => {
    for (const i of parsed.issues) issues.push(`${id}/${stem}.md: ${i}`)
    const def = toDef(parsed, base)
    if (def === null) {
      issues.push(`${id}/${stem}.md: no name`)
      return
    }
    cur.set(stem, def)
    sources.set(stem, id)
    if (def.legacy !== undefined) legacyStem.set(def.legacy, stem)
  }
  for (const layer of layers) {
    for (const [file, raw] of [...layer.files].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
      if (layer.kind === 'native') {
        put(layer.id, file, parseDefinition(raw), cur.get(file) ?? stemBase(file))
        continue
      }
      const stem = legacyStem.get(file)
      if (stem !== undefined) put(layer.id, stem, parseLegacy(raw), cur.get(stem))
    }
  }
  return { defs: [...cur.values()], issues, sources }
}

// ---- mtime cache: a layer is re-read only when its listing (name, size, mtime) changed.

type Cached = { sig: string; raw: string }
export type RegistryCache = {
  files: Map<string, Map<string, Cached>>
  layerSig: Map<string, string>
  legacyNames: ReadonlySet<string>
  registry: Registry | null
}

export const newRegistryCache = (): RegistryCache => ({ files: new Map(), layerSig: new Map(), legacyNames: new Set(), registry: null })

const listSig = (es: readonly IoEntry[]): string =>
  es.map((en) => `${en.name}:${en.size}:${en.mtimeMs}:${en.isLink ? 'L' : 'F'}`).sort().join('|')

// Any Io failure rejects and leaves the cache untouched; the caller fails open.
export async function loadRegistry(io: Io, roots: Roots, cache: RegistryCache): Promise<Registry> {
  const layers: LayerFiles[] = []
  const nextFiles = new Map<string, Map<string, Cached>>()
  const nextSig = new Map<string, string>()
  let legacyNames = cache.legacyNames
  let changed = cache.registry === null

  for (const spec of layerSpecs(roots)) {
    const listing = (await io.exists(spec.dir)) ? await io.list(spec.dir) : []
    const entries = listing.filter((en) => {
      if (en.kind === 'dir' || en.name.startsWith('.') || !en.name.endsWith('.md')) return false
      return spec.kind === 'native' || legacyNames.has(en.name.slice(0, -3))
    })
    const sig = listSig(entries)
    const prev = cache.files.get(spec.id)
    const kept = new Map<string, Cached>()
    if (cache.layerSig.get(spec.id) !== sig) changed = true
    for (const en of entries) {
      const stem = en.name.slice(0, -3)
      const fsig = `${en.size}:${en.mtimeMs}`
      const hit = prev?.get(stem)
      if (hit !== undefined && hit.sig === fsig && !en.isLink) {
        kept.set(stem, hit)
        continue
      }
      const raw = await io.read(`${spec.dir}/${en.name}`)
      if (hit?.raw !== raw) changed = true
      kept.set(stem, { sig: fsig, raw })
    }
    nextFiles.set(spec.id, kept)
    nextSig.set(spec.id, sig)
    layers.push({ id: spec.id, kind: spec.kind, files: new Map([...kept].map(([k, v]) => [k, v.raw])) })
    if (spec.id === 'default' && changed) {
      const names = new Set<string>()
      for (const raw of kept.values()) {
        const legacy = parseDefinition(raw.raw).meta.legacy
        if (legacy !== undefined && legacy !== '') names.add(legacy)
      }
      legacyNames = names
    }
  }

  if (!changed && cache.registry !== null) return cache.registry
  const out = resolveDefs(layers)
  const registry: Registry = { defs: out.defs, issues: out.issues, sources: out.sources }
  cache.files = nextFiles
  cache.layerSig = nextSig
  cache.legacyNames = legacyNames
  cache.registry = registry
  return registry
}

// Editor/band names: one entry per name (first def wins, so the plain `m` beats `m.plan`); body + planOnly feed the T2.7 band.
export function toEditorEntries(defs: readonly Def[]): { name: string; description?: string; body: string; planOnly: boolean }[] {
  const seen = new Set<string>()
  const out: { name: string; description?: string; body: string; planOnly: boolean }[] = []
  for (const d of defs) {
    const key = d.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const base = { name: d.name, body: d.body, planOnly: d.when === 'plan' }
    out.push(d.description === undefined ? base : { ...base, description: d.description })
  }
  return out
}
