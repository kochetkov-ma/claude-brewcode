// /placeholders management: pure over an injected Io, never `$`, so the hook spells every `$.fs`/`$.process` call itself.
import { layerSpecs, loadRegistry, newRegistryCache, parseDefinition, type Def, type Io, type Registry, type Roots } from './defs'

export type StatLite = { kind: 'file' | 'dir' | 'other'; isLink: boolean; realPath?: string }
export type CmdIo = Io & {
  write: (path: string, text: string) => Promise<void>
  stat: (path: string) => Promise<StatLite | undefined>
  remove: (path: string) => Promise<{ exitCode: number; stderr: string }>
}
export type CmdResult = { text: string; registry: Registry | null }
type Scope = 'project' | 'global'
type Row = { stem: string; layer: string; def: Def }

const say = (text: string): CmdResult => ({ text, registry: null })

export const USAGE = [
  'usage: /placeholders <subcommand>',
  '  list                         every placeholder: name, layer, description',
  '  show <name>                  effective text and source layer (plus <name>.plan)',
  '  add <name> [global] <text>   new own-layer file (project by default)',
  '  edit <name> [global]         seed an own-layer override from the effective text, print its path',
  '  rm <name> [global]           remove an own-layer file (never defaults or legacy files)',
  'name: a-z 0-9 _ (1-32) or a run of ! # $ % & \' ( ) + , - ; = @ [ ] ^ ` { } ~, optional .plan suffix',
].join('\n')

const WORD = /^[a-z0-9_]{1,32}$/
const SYMBOL = /^[!#$%&'()+,\-;=@[\]^`{}~]{1,32}$/
const PLAN = '.plan'

// File-safe stem: lowercase word or punctuation run (no path or shell characters), optional `.plan`; else null.
export function normalizeName(raw: string): string | null {
  const lower = raw.toLowerCase()
  const base = lower.endsWith(PLAN) ? lower.slice(0, -PLAN.length) : lower
  return WORD.test(base) || SYMBOL.test(base) ? lower : null
}

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const layerLabel = (id: string): string => (id === 'default' ? 'plugin' : id)

// First whitespace-delimited token and the text after it (inner whitespace and newlines kept).
function take(s: string): [string, string] {
  const m = /^\s*(\S+)\s*([\s\S]*)$/.exec(s)
  return m === null ? ['', ''] : [m[1] ?? '', m[2] ?? '']
}

// defs[i] pairs with the i-th source key: resolveDefs inserts into both maps together.
function rowsOf(reg: Registry): Row[] {
  const stems = [...reg.sources.keys()]
  return reg.defs
    .map((def, i): Row => {
      const stem = stems[i] ?? def.name
      return { stem, layer: reg.sources.get(stem) ?? 'default', def }
    })
    .sort((a, b) => (a.stem < b.stem ? -1 : a.stem > b.stem ? 1 : 0))
}

const load = (io: CmdIo, roots: Roots): Promise<Registry> => loadRegistry(io, roots, newRegistryCache())

function ownDir(roots: Roots, scope: Scope): string | undefined {
  return layerSpecs(roots).find((s) => s.id === scope)?.dir
}

const noDir = (scope: Scope): string =>
  scope === 'project' ? 'placeholders: no project root for this session' : 'placeholders: no config directory (CLAUDE_CONFIG_DIR and HOME are unset)'

// `[global]` flag and the remainder; anything else is project scope and the remainder untouched.
function takeScope(s: string): { scope: Scope; rest: string } {
  const [word, rest] = take(s)
  return word.toLowerCase() === 'global' ? { scope: 'global', rest } : { scope: 'project', rest: s }
}

type Target = { stem: string; scope: Scope; rest: string; dir: string | undefined }

// `<name> [global] <rest>` -> stem, scope and the own-layer dir; a bad name gives the refusal text.
function parseTarget(roots: Roots, args: string): Target | string {
  const [nameRaw, afterName] = take(args)
  const { scope, rest } = takeScope(afterName)
  const stem = normalizeName(nameRaw)
  return stem === null ? `placeholders: bad name '${nameRaw}'\n${USAGE}` : { stem, scope, rest, dir: ownDir(roots, scope) }
}

// The definition format cannot carry a fence marker or a leading front matter: refuse what would not read back.
function fileFor(text: string): string | null {
  const content = `${text.trim()}\n`
  const back = parseDefinition(content)
  return back.hasFrontMatter || back.issues.length > 0 || back.text !== text.trim() ? null : content
}

const CANNOT_CARRY = 'placeholders: that text holds a ``` or ~~~ fence marker or opens with a --- line, which the definition format cannot carry; write the file by hand'

function shadowNote(reg: Registry, stem: string, scope: Scope): string {
  const layer = reg.sources.get(stem)
  return layer === undefined || layer === scope ? '' : `\nnote: the effective layer is ${layerLabel(layer)}, which wins over ${scope}`
}

function list(reg: Registry): string {
  const rows = rowsOf(reg)
  const w = Math.max(...rows.map((r) => r.stem.length), 4)
  const lines = rows.map((r) => `${r.stem.padEnd(w)}  ${layerLabel(r.layer).padEnd(14)}  ${r.def.description ?? '-'}`)
  const issues = reg.issues.length === 0 ? [] : ['', `issues (${reg.issues.length}):`, ...reg.issues.map((i) => `  ${i}`)]
  return [`placeholders (${rows.length}):`, ...lines, ...issues].join('\n')
}

function show(reg: Registry, stem: string): string {
  const stems = stem.endsWith(PLAN) ? [stem] : [stem, stem + PLAN]
  const rows = rowsOf(reg).filter((r) => stems.includes(r.stem))
  if (rows.length === 0) return `placeholders: unknown placeholder '${stem}'; /placeholders list shows the defined ones`
  return rows
    .map((r) => `== ${r.stem} (layer: ${layerLabel(r.layer)}, when: ${r.def.when}, insert: ${r.def.insert}, order: ${r.def.order}) ==\n${r.def.body === '' ? '(empty)' : r.def.body}`)
    .join('\n\n')
}

async function add(io: CmdIo, roots: Roots, args: string): Promise<CmdResult> {
  const t = parseTarget(roots, args)
  if (typeof t === 'string') return say(t)
  const { stem, scope, rest, dir } = t
  if (rest.trim() === '') return say(`placeholders: add needs text\n${USAGE}`)
  if (dir === undefined) return say(noDir(scope))
  const path = `${dir}/${stem}.md`
  if (await io.exists(path)) return say(`placeholders: ${path} already exists; /placeholders edit ${stem}${scope === 'global' ? ' global' : ''} prints it`)
  const content = fileFor(rest)
  if (content === null) return say(CANNOT_CARRY)
  await io.write(path, content)
  const registry = await load(io, roots)
  return { text: `added ${stem} (${scope}): ${path}${shadowNote(registry, stem, scope)}`, registry }
}

async function edit(io: CmdIo, roots: Roots, args: string): Promise<CmdResult> {
  const t = parseTarget(roots, args)
  if (typeof t === 'string') return say(t)
  const { stem, scope, dir } = t
  if (dir === undefined) return say(noDir(scope))
  const path = `${dir}/${stem}.md`
  if (await io.exists(path)) return say(`exists (${scope}): ${path}\nedit it; changes apply from the next prompt`)
  const row = rowsOf(await load(io, roots)).find((r) => r.stem === stem)
  if (row === undefined) return say(`placeholders: unknown placeholder '${stem}'; /placeholders add creates a new one`)
  const content = fileFor(row.def.body)
  if (content === null) return say(CANNOT_CARRY)
  await io.write(path, content)
  const registry = await load(io, roots)
  return { text: `created (${scope}) from ${layerLabel(row.layer)} text: ${path}\nedit it; changes apply from the next prompt${shadowNote(registry, stem, scope)}`, registry }
}

async function rm(io: CmdIo, roots: Roots, args: string): Promise<CmdResult> {
  const t = parseTarget(roots, args)
  if (typeof t === 'string') return say(t)
  const { stem, scope, dir } = t
  if (dir === undefined) return say(noDir(scope))
  const path = `${dir}/${stem}.md`
  if (!(await io.exists(path))) {
    const layer = rowsOf(await load(io, roots)).find((r) => r.stem === stem)?.layer
    if (layer === undefined) return say(`placeholders: unknown placeholder '${stem}'`)
    if (layer === 'default') return say(`placeholders: refused, ${stem} is a plugin default and has no ${scope} file; /placeholders edit ${stem} overrides it`)
    if (layer.endsWith('-legacy')) return say(`placeholders: refused, ${stem} comes from a brewtools ${layer} file, which this command never removes`)
    return say(`placeholders: no ${scope} file for ${stem}; it comes from the ${layer} layer`)
  }
  const dirStat = await io.stat(dir)
  const fileStat = await io.stat(path)
  const base = dirStat?.realPath?.replace(/\/+$/, '')
  const real = fileStat?.realPath
  const isInside = base !== undefined && base !== '' && real !== undefined && real.startsWith(`${base}/`)
  if (fileStat === undefined || fileStat.kind !== 'file' || fileStat.isLink || !isInside) {
    return say(`placeholders: refused, ${path} is not a plain file inside ${dir}`)
  }
  const res = await io.remove(real)
  if (res.exitCode !== 0) return say(`placeholders: rm failed (exit ${res.exitCode}): ${res.stderr.trim()}`)
  const registry = await load(io, roots)
  const now = registry.sources.get(stem)
  return { text: `removed (${scope}): ${path}\n${stem} is ${now === undefined ? 'no longer defined' : `now served by the ${layerLabel(now)} layer`}`, registry }
}

// Never throws: any failure becomes readable text. `registry` is set only after a mutation, for the editor entries.
export async function runCommand(io: CmdIo, roots: Roots, args: string): Promise<CmdResult> {
  try {
    const [sub, rest] = take(args)
    switch (sub.toLowerCase()) {
      case 'list':
        return say(list(await load(io, roots)))
      case 'show': {
        const [nameRaw] = take(rest)
        const stem = normalizeName(nameRaw)
        return say(stem === null ? `placeholders: bad name '${nameRaw}'\n${USAGE}` : show(await load(io, roots), stem))
      }
      case 'add':
        return await add(io, roots, rest)
      case 'edit':
        return await edit(io, roots, rest)
      case 'rm':
        return await rm(io, roots, rest)
      case '':
      case 'help':
        return say(USAGE)
      default:
        return say(`placeholders: unknown subcommand '${sub}'\n${USAGE}`)
    }
  } catch (e) {
    return say(`placeholders: failed: ${why(e)}`)
  }
}
