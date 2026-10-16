// Command hook (UserPromptSubmit + PostToolBatch): injects placeholder context blocks and records permission_mode for register.ts.
// Plain Node, no deps: module `classic.*` hooks are bypassed on Team/Enterprise orgs, a command hook is not. Fail open: any error -> `{}`.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_PREFIX = '++'
const JOINER = '\n\n---\n\n'
const MAX_CHARS = 9000
const CUT_NOTE = '\n...[truncated]'
const WEEK_MS = 7 * 24 * 3600 * 1000
// Subagent deliveries arrive as prompts too; only the leading tag marks them.
const SYNTHETIC_PROMPT = /^\s*<(?:task-notification>|agent-message\s+from=)/

// ---- Matching (ported from hooks/lib/match.ts)

const PREFIX_RE = /^[!-/:-@[-^`{-~]{2,8}$/
const WORD_NAME = /^[A-Za-z0-9_]{1,32}$/
const SYMBOL_NAME = /^[!-/:-@[-^`{-~]+$/

export const validPrefix = (raw) => (typeof raw === 'string' && PREFIX_RE.test(raw) ? raw : DEFAULT_PREFIX)

export function nameKind(name) {
  if (WORD_NAME.test(name)) return 'word'
  if (SYMBOL_NAME.test(name)) return 'symbol'
  return null
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const escClass = (s) => s.replace(/[\\\][^-]/g, '\\$&')

function matcher(prefix, name, kind) {
  const token = escRe(prefix + name)
  if (kind === 'word') return new RegExp(`(?<![\\w${escClass(prefix)}])${token}(?![\\w])`, 'i')
  const cls = `[\\p{L}\\p{N}\\p{M}_${escClass([...new Set(prefix + name)].join(''))}]`
  return new RegExp(`(?<!${cls})${token}(?!${cls})`, 'u')
}

// `P/` or `P\` anywhere sends the prompt as typed: nothing injected. A marker glued on its left to a letter, digit, mark, `_` or a prefix char is none.
export const escapeMarkers = (prefix) => [`${prefix}/`, `${prefix}\\`]

export function isEscaped(prefix, text) {
  const cls = `[\\p{L}\\p{N}\\p{M}_${escClass([...new Set(prefix)].join(''))}]`
  return text.includes(prefix) && new RegExp(`(?<!${cls})(?:${escapeMarkers(prefix).map(escRe).join('|')})`, 'u').test(text)
}

// ---- Definitions (ported from hooks/lib/defs.ts)

export function extractFenced(raw) {
  const blocks = []
  const re = /(?:```|~~~)[^\n]*\n([\s\S]*?)\n?(?:```|~~~)/g
  let m
  while ((m = re.exec(raw)) !== null) blocks.push((m[1] ?? '').replace(/\n+$/, ''))
  if (blocks.length === 0) return raw.trim()
  return blocks.join('\n\n').trim()
}

const OPEN = /^(?:[ \t]*\r?\n)*---[ \t]*(?:\r?\n|$)/

// First non-blank `---` line (after an optional BOM) to the next `---` line; no opening -> null, never closed -> 'unclosed'.
function splitFrontMatter(raw) {
  const src = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  const open = OPEN.exec(src)
  if (!open) return null
  const start = open[0].length
  let pos = start
  while (pos <= src.length) {
    const nl = src.indexOf('\n', pos)
    const end = nl === -1 ? src.length : nl
    if (/^---[ \t]*$/.test(src.slice(pos, end).replace(/\r$/, ''))) return { fm: src.slice(start, pos), body: nl === -1 ? '' : src.slice(nl + 1) }
    if (nl === -1) break
    pos = nl + 1
  }
  return 'unclosed'
}

function scalar(value) {
  const dq = /^"((?:[^"\\]|\\.)*)"/.exec(value)
  if (dq) {
    try {
      return JSON.parse(dq[0])
    } catch {
      return dq[1] ?? ''
    }
  }
  const sq = /^'((?:[^']|'')*)'/.exec(value)
  if (sq) return (sq[1] ?? '').replace(/''/g, "'")
  return value.replace(/\s+#.*$/, '').trim()
}

const INT = /^-?\d+$/

// Tolerant `key: scalar` subset; a bad value is dropped (the mod reports it as an issue, the hook has no one to tell).
export function parseFrontMatter(fm) {
  const meta = {}
  for (const rawLine of fm.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const kv = /^([A-Za-z_][\w-]*)[ \t]*:[ \t]*(.*)$/.exec(line)
    if (!kv) continue
    const key = kv[1] ?? ''
    const value = scalar(kv[2] ?? '')
    switch (key) {
      case 'name':
      case 'description':
      case 'group':
      case 'header':
      case 'legacy':
      case 'when':
      case 'plan':
        meta[key] = value
        break
      case 'insert':
        if (value === 'context' || value === 'inline') meta.insert = value
        break
      case 'order':
      case 'priority':
        if (INT.test(value)) meta[key] = Number(value)
        break
      default:
    }
  }
  return meta
}

export function parseDefinition(raw) {
  const split = splitFrontMatter(raw)
  if (split === 'unclosed') return { meta: {}, text: '', skip: true }
  if (split === null) return { meta: {}, text: extractFenced(raw) }
  return { meta: parseFrontMatter(split.fm), text: extractFenced(split.body) }
}

// Brewtools override file: never front matter, the whole file is the fenced source.
export const parseLegacy = (raw) => ({ meta: {}, text: extractFenced(raw) })

// Per-field inheritance: parsed meta, then base, then built-ins. No name anywhere -> null.
// isPlan comes only from base (the `x.plan` stem or the lower layer's def of that key), never from meta.
export function toDef(parsed, base) {
  const m = parsed.meta
  const name = m.name ?? base?.name
  if (name === undefined || name === '') return null
  return {
    name,
    body: parsed.text,
    insert: m.insert ?? base?.insert ?? 'context',
    order: m.order ?? base?.order ?? 100,
    priority: m.priority ?? base?.priority ?? 0,
    header: m.header ?? base?.header ?? '',
    group: m.group ?? base?.group,
    legacy: m.legacy ?? base?.legacy,
    isPlan: base?.isPlan ?? false,
  }
}

const trimSep = (p) => (p.length > 1 ? p.replace(/[\\/]+$/, '') : p)

export function normalizeDir(p) {
  if (!p.startsWith('/')) return trimSep(p)
  const out = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return '/' + out.join('/')
}

// CLAUDE_CONFIG_DIR when non-empty, else <home>/.claude; no home -> undefined.
export function configDirOf(configEnv, home) {
  if (configEnv !== undefined && configEnv !== '') return normalizeDir(configEnv)
  if (home === undefined || home === '') return undefined
  return `${trimSep(home)}/.claude`
}

// Lowest to highest priority; a layer file replaces the one below it, field by field.
export function layerSpecs(r) {
  const specs = [{ id: 'default', kind: 'native', dir: `${trimSep(r.pluginRoot)}/placeholders` }]
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

// Base of a native file without a lower layer: `x.plan` -> name x, plan part.
const stemBase = (stem) => (stem.endsWith('.plan') && stem.length > 5 ? { name: stem.slice(0, -5), isPlan: true } : { name: stem })

// layers: [{kind, files: Map<stem, raw>}] low to high. Unusable files (unclosed front matter, no or bad name) are skipped, never injected raw.
// A plan part whose name has no normal def in any layer is sent in every mode.
export function resolveDefs(layers) {
  const cur = new Map()
  const legacyStem = new Map()
  const put = (key, parsed, base) => {
    const def = parsed.skip === true ? null : toDef(parsed, base)
    if (def === null || nameKind(def.name.toLowerCase()) === null) return
    cur.set(key, def)
    if (def.legacy !== undefined) legacyStem.set(def.legacy, key)
  }
  for (const layer of layers) {
    for (const [file, raw] of [...layer.files].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
      if (layer.kind === 'native') {
        const key = file.toLowerCase()
        put(key, parseDefinition(raw), cur.get(key) ?? stemBase(key))
        continue
      }
      const stem = legacyStem.get(file)
      if (stem !== undefined) put(stem, parseLegacy(raw), cur.get(stem))
    }
  }
  const normal = new Set([...cur.values()].filter((d) => !d.isPlan).map((d) => d.name.toLowerCase()))
  for (const [key, d] of cur) if (d.isPlan && !normal.has(d.name.toLowerCase())) cur.set(key, { ...d, isPlan: false })
  return [...cur.values()]
}

// *.md files of a layer dir (stem -> raw). Missing dir -> empty. Unreadable user layer or file -> skipped; an unreadable default throws.
function readLayer(spec, legacyNames) {
  const files = new Map()
  if (!fs.existsSync(spec.dir)) return files
  for (const en of fs.readdirSync(spec.dir, { withFileTypes: true })) {
    if (en.name.startsWith('.') || !en.name.endsWith('.md')) continue
    const stem = en.name.slice(0, -3)
    if (spec.kind === 'legacy' && !legacyNames.has(stem)) continue
    const file = path.join(spec.dir, en.name)
    try {
      if (fs.statSync(file).isDirectory()) continue
      files.set(stem, fs.readFileSync(file, 'utf8'))
    } catch (err) {
      if (spec.id === 'default') throw err
    }
  }
  return files
}

export function loadDefs(roots) {
  const layers = []
  let legacyNames = new Set()
  for (const spec of layerSpecs(roots)) {
    let files
    try {
      files = readLayer(spec, legacyNames)
    } catch (err) {
      if (spec.id === 'default') throw err
      files = new Map()
    }
    layers.push({ kind: spec.kind, files })
    if (spec.id === 'default') {
      legacyNames = new Set()
      for (const raw of files.values()) {
        const legacy = parseDefinition(raw).meta.legacy
        if (legacy !== undefined && legacy !== '') legacyNames.add(legacy)
      }
    }
  }
  return resolveDefs(layers)
}

// ---- Assembly (spec: tests/parity/golden.generated.ts, byte-identical to brewtools v6.7.0 but the surrogate-safe cap cut and the 6.9.5 overlay)

// Per name, context defs only: the first normal def and the first plan part (a part without a normal context def is never sent).
function parts(defs) {
  const normal = new Map()
  const plan = new Map()
  for (const d of defs) {
    if (d.insert !== 'context') continue
    const m = d.isPlan ? plan : normal
    if (!m.has(d.name.toLowerCase())) m.set(d.name.toLowerCase(), d)
  }
  return { normal, plan }
}

// Plan part on its normal def: plan header if any, normal body, '\n\n', addition. Empty normal body = silenced in both modes.
const withPart = (base, part) =>
  base.body === '' ? base : { ...base, header: part.header === '' ? base.header : part.header, body: part.body === '' ? base.body : `${base.body}\n\n${part.body}` }

// What each name sends in this mode: the normal def; in plan mode its plan part joined to it.
function winners(defs, plan) {
  const { normal, plan: part } = parts(defs)
  if (!plan) return normal
  return new Map([...normal].map(([key, d]) => [key, part.has(key) ? withPart(d, part.get(key)) : d]))
}

// '' = nothing to inject. Mode is exact: only the string `plan` is plan mode.
export function assemble(defs, prefix, prompt, mode) {
  const hit = [...winners(defs, mode === 'plan').values()].filter((d) => matcher(prefix, d.name.toLowerCase(), nameKind(d.name.toLowerCase())).test(prompt))
  const best = new Map()
  for (const d of hit) {
    if (d.group === undefined) continue
    const cur = best.get(d.group)
    if (cur === undefined || d.priority > cur.priority) best.set(d.group, d)
  }
  const picked = hit.filter((d) => d.group === undefined || best.get(d.group) === d).sort((a, b) => a.order - b.order)
  const blocks = []
  for (const d of picked) {
    if (d.body === '') continue
    const head = d.header.split('{token}').join(prefix + d.name.toLowerCase())
    blocks.push(head === '' ? d.body : `${head}\n\n${d.body}`)
  }
  const text = blocks.join(JOINER)
  return text.length > MAX_CHARS ? cutAt(text, MAX_CHARS) + CUT_NOTE : text
}

// First `at` chars, one fewer when the last would be a lone high surrogate (sent.ts cuts the same way).
function cutAt(text, at) {
  const c = text.charCodeAt(at - 1)
  return text.slice(0, c >= 0xd800 && c <= 0xdbff ? at - 1 : at)
}

// ---- State: <plugin root>/.state/mode-<session_id>.json = {mode, ts}, read by register.ts. Same convention as brewmod-plan-effort.

const SESSION_ID = /^[A-Za-z0-9_-]+$/
const STATE_FILE = /^mode-[A-Za-z0-9_-]+\.json(\.\d+\.tmp)?$/

function recordMode(e, root, prune) {
  if (e.agent_id !== undefined || typeof e.permission_mode !== 'string' || typeof e.session_id !== 'string' || !SESSION_ID.test(e.session_id)) return
  const dir = path.join(root, '.state')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `mode-${e.session_id}.json`)
  const tmp = `${file}.${process.pid}.tmp`
  try {
    fs.writeFileSync(tmp, JSON.stringify({ mode: e.permission_mode, ts: Date.now() }))
    fs.renameSync(tmp, file)
  } catch (err) {
    try {
      fs.unlinkSync(tmp)
    } catch {
      // no temp file to remove
    }
    throw err
  }
  if (prune) pruneState(dir)
}

// Old mode files and orphan temp files; regular files only (lstat, links never followed), one bad entry skips only itself.
function pruneState(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (!STATE_FILE.test(name)) continue
    try {
      const p = path.join(dir, name)
      const st = fs.lstatSync(p)
      if (st.isFile() && Date.now() - st.mtimeMs > WEEK_MS) fs.unlinkSync(p)
    } catch {
      // best effort per file
    }
  }
}

// Plugin options reach a command hook as CLAUDE_PLUGIN_OPTION_<KEY>; the project root is CLAUDE_PROJECT_DIR (the launch dir).
function run(e, env) {
  const root = env.CLAUDE_PLUGIN_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const ups = e.hook_event_name !== 'PostToolBatch'
  try {
    recordMode(e, root, ups)
  } catch {
    // state is best effort: the injection below does not depend on it
  }
  if (!ups || typeof e.prompt !== 'string') return {}
  const prefix = validPrefix(env.CLAUDE_PLUGIN_OPTION_PREFIX)
  if (SYNTHETIC_PROMPT.test(e.prompt) || !e.prompt.includes(prefix) || isEscaped(prefix, e.prompt)) return {}
  const projectDir = env.CLAUDE_PROJECT_DIR || e.cwd
  const text = assemble(
    loadDefs({
      pluginRoot: root,
      root: projectDir || undefined,
      configDir: configDirOf(env.CLAUDE_CONFIG_DIR, env.HOME ?? env.USERPROFILE),
    }),
    prefix,
    e.prompt,
    e.permission_mode,
  )
  return text === '' ? {} : { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text } }
}

// Runs only as the hook command; tests import the functions above.
if (path.basename(process.argv[1] ?? '') === 'inject.mjs') {
  let out = {}
  try {
    out = run(JSON.parse(fs.readFileSync(0, 'utf8')), process.env)
  } catch {
    out = {}
  }
  process.stdout.write(JSON.stringify(out))
}
