// /placeholders management: pure over an injected Io, never `$`, so the hook spells every `$.fs`/`$.process` call itself.
import { DEFAULT_PREFIX } from './match'
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

// Markdown-safe block: the first line stays plain (the engine glues "<plugin>: " in front of it, so a fence cannot open there), the rest sits in a fence longer than any backtick run inside.
export function block(head: string, lines: readonly string[]): string {
  const run = Math.max(0, ...[...lines.join('\n').matchAll(/`+/g)].map((m) => m[0].length))
  const fence = '`'.repeat(Math.max(3, run + 1))
  return [head, fence, ...lines, fence].join('\n')
}

export const USAGE = block('usage: /placeholders list | show | add | edit | rm', [
  'list                          every placeholder: name, layer, description',
  'show <name>                   effective text and source layer (plus <name>.plan)',
  'add <name> [--global] <text>  new own-layer file (project by default; --global or -g = the config dir)',
  'edit <name> [--global]        seed an own-layer override from the effective text, print its path',
  'rm <name> [--global]          remove an own-layer file (never defaults or legacy files)',
  'the flag must directly follow the name; any other word after it is the text (add) or refused (edit, rm)',
  'name: a-z 0-9 _ (1-32) or a run of ! # $ % & \' ( ) + , - ; = @ [ ] ^ ` { } ~, optional .plan suffix',
])

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
  scope === 'project' ? 'no project root for this session' : 'no config directory (CLAUDE_CONFIG_DIR and HOME are unset)'

const GLOBAL_FLAGS: readonly string[] = ['--global', '-g']

// `--global`/`-g` as the first word picks the global layer; any other word leaves project scope and the remainder untouched.
function takeScope(s: string): { scope: Scope; rest: string } {
  const [word, rest] = take(s)
  return GLOBAL_FLAGS.includes(word) ? { scope: 'global', rest } : { scope: 'project', rest: s }
}

type Target = { stem: string; scope: Scope; rest: string; dir: string | undefined }

// `<name> [--global] <rest>` -> stem, scope and the own-layer dir; a bad name, or text where none is allowed (edit, rm), gives the refusal.
function parseTarget(roots: Roots, args: string, hasText: boolean): Target | string {
  const [nameRaw, afterName] = take(args)
  const { scope, rest } = takeScope(afterName)
  const stem = normalizeName(nameRaw)
  if (stem === null) return `bad name '${nameRaw}'\n${USAGE}`
  if (!hasText && rest.trim() !== '') return `unexpected '${take(rest)[0]}' after the name; the global layer is --global (or -g)\n${USAGE}`
  return { stem, scope, rest, dir: ownDir(roots, scope) }
}

// The definition format cannot carry a fence marker or a leading front matter: refuse what would not read back.
function fileFor(text: string): string | null {
  const content = `${text.trim()}\n`
  const back = parseDefinition(content)
  return back.hasFrontMatter || back.issues.length > 0 || back.text !== text.trim() ? null : content
}

const CANNOT_CARRY = 'that text holds a ``` or ~~~ fence marker or opens with a --- line, which the definition format cannot carry; write the file by hand'

function shadowNote(reg: Registry, stem: string, scope: Scope): string {
  const layer = reg.sources.get(stem)
  return layer === undefined || layer === scope ? '' : `\nnote: the effective layer is ${layerLabel(layer)}, which wins over ${scope}`
}

function list(reg: Registry): string {
  const rows = rowsOf(reg)
  const w = Math.max(...rows.map((r) => r.stem.length), 4)
  const lines = rows.map((r) => `${r.stem.padEnd(w)}  ${layerLabel(r.layer).padEnd(14)}  ${r.def.description ?? '-'}`)
  const issues = reg.issues.length === 0 ? [] : ['', `issues (${reg.issues.length}):`, ...reg.issues.map((i) => `  ${i}`)]
  return block(`${rows.length} placeholders`, [...lines, ...issues])
}

const showRows = (reg: Registry, stem: string): Row[] => {
  const stems = stem.endsWith(PLAN) ? [stem] : [stem, stem + PLAN]
  return rowsOf(reg).filter((r) => stems.includes(r.stem))
}

// A name typed as a token (`++r`) means its stem; a defined stem spelled literally wins (`+++` is a symbol stem).
function showStem(reg: Registry, nameRaw: string, prefix: string): string | null {
  const stripped = nameRaw.startsWith(prefix) && nameRaw.length > prefix.length ? normalizeName(nameRaw.slice(prefix.length)) : null
  const options = [normalizeName(nameRaw), stripped].filter((c): c is string => c !== null)
  return options.find((c) => showRows(reg, c).length > 0) ?? options[0] ?? null
}

function show(reg: Registry, stem: string): string {
  const rows = showRows(reg, stem)
  if (rows.length === 0) return `unknown placeholder '${stem}'; /placeholders list shows the defined ones`
  return rows
    .map((r) => block(`${r.stem} (layer: ${layerLabel(r.layer)}, when: ${r.def.when}, insert: ${r.def.insert}, order: ${r.def.order})`, (r.def.body === '' ? '(empty)' : r.def.body).split('\n')))
    .join('\n\n')
}

async function add(io: CmdIo, roots: Roots, args: string): Promise<CmdResult> {
  const t = parseTarget(roots, args, true)
  if (typeof t === 'string') return say(t)
  const { stem, scope, rest, dir } = t
  if (rest.trim() === '') return say(`add needs text\n${USAGE}`)
  if (dir === undefined) return say(noDir(scope))
  const path = `${dir}/${stem}.md`
  if (await io.exists(path)) return say(`${path} already exists; /placeholders edit ${stem}${scope === 'global' ? ' --global' : ''} prints it`)
  const content = fileFor(rest)
  if (content === null) return say(CANNOT_CARRY)
  await io.write(path, content)
  const registry = await load(io, roots)
  return { text: `added ${stem} (${scope}): ${path}${shadowNote(registry, stem, scope)}`, registry }
}

async function edit(io: CmdIo, roots: Roots, args: string): Promise<CmdResult> {
  const t = parseTarget(roots, args, false)
  if (typeof t === 'string') return say(t)
  const { stem, scope, dir } = t
  if (dir === undefined) return say(noDir(scope))
  const path = `${dir}/${stem}.md`
  if (await io.exists(path)) return say(`exists (${scope}): ${path}\nedit it; changes apply from the next prompt`)
  const row = rowsOf(await load(io, roots)).find((r) => r.stem === stem)
  if (row === undefined) return say(`unknown placeholder '${stem}'; /placeholders add creates a new one`)
  const content = fileFor(row.def.body)
  if (content === null) return say(CANNOT_CARRY)
  await io.write(path, content)
  const registry = await load(io, roots)
  return { text: `created (${scope}) from ${layerLabel(row.layer)} text: ${path}\nedit it; changes apply from the next prompt${shadowNote(registry, stem, scope)}`, registry }
}

async function rm(io: CmdIo, roots: Roots, args: string): Promise<CmdResult> {
  const t = parseTarget(roots, args, false)
  if (typeof t === 'string') return say(t)
  const { stem, scope, dir } = t
  if (dir === undefined) return say(noDir(scope))
  const path = `${dir}/${stem}.md`
  if (!(await io.exists(path))) {
    const layer = rowsOf(await load(io, roots)).find((r) => r.stem === stem)?.layer
    if (layer === undefined) return say(`unknown placeholder '${stem}'`)
    if (layer === 'default') return say(`refused, ${stem} is a plugin default and has no ${scope} file; /placeholders edit ${stem} overrides it`)
    if (layer.endsWith('-legacy')) return say(`refused, ${stem} comes from a brewtools ${layer} file, which this command never removes`)
    return say(`no ${scope} file for ${stem}; it comes from the ${layer} layer`)
  }
  const dirStat = await io.stat(dir)
  const fileStat = await io.stat(path)
  const base = dirStat?.realPath?.replace(/\/+$/, '')
  const real = fileStat?.realPath
  const isInside = base !== undefined && base !== '' && real !== undefined && real.startsWith(`${base}/`)
  if (fileStat === undefined || fileStat.kind !== 'file' || fileStat.isLink || !isInside) {
    return say(`refused, ${path} is not a plain file inside ${dir}`)
  }
  const res = await io.remove(real)
  if (res.exitCode !== 0) return say(`rm failed (exit ${res.exitCode}): ${res.stderr.trim()}`)
  const registry = await load(io, roots)
  const now = registry.sources.get(stem)
  return { text: `removed (${scope}): ${path}\n${stem} is ${now === undefined ? 'no longer defined' : `now served by the ${layerLabel(now)} layer`}`, registry }
}

// Never throws: any failure becomes readable text. `registry` is set only after a mutation, for the editor entries.
export async function runCommand(io: CmdIo, roots: Roots, args: string, prefix = DEFAULT_PREFIX): Promise<CmdResult> {
  try {
    const [sub, rest] = take(args)
    switch (sub.toLowerCase()) {
      case 'list':
        return say(list(await load(io, roots)))
      case 'show': {
        const [nameRaw] = take(rest)
        const reg = await load(io, roots)
        const stem = showStem(reg, nameRaw, prefix)
        return say(stem === null ? `bad name '${nameRaw}'\n${USAGE}` : show(reg, stem))
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
        return say(`unknown subcommand '${sub}'\n${USAGE}`)
    }
  } catch (e) {
    return say(`failed: ${why(e)}`)
  }
}
