import type { On } from 'claude-code'
import { PLACEHOLDER_FILES, type GoldenVector } from './parity/golden.generated'
import { loadRegistry, newRegistryCache, type Io, type IoEntry, type Roots } from '../hooks/lib/defs'
import type { CmdIo } from '../hooks/lib/command'

export const PLUG = '/PLUG'
export const ROOT = '/proj'
export const CFG = '/cfg'
export const SESSION = 'sess-1'
export const STATE_FILE = `${PLUG}/.state/mode-${SESSION}.json`
export const ROOTS: Roots = { pluginRoot: PLUG, root: ROOT, configDir: CFG }
export const TOOL = 'mcp__brewmod-placeholders__'

export type MemFile = { raw: string; mtimeMs?: number; kind?: 'file' | 'dir'; isLink?: boolean }
export type Tree = Record<string, string | MemFile>
export type Calls = { exists: string[]; list: string[]; read: string[] }

const meta = (v: string | MemFile): MemFile => (typeof v === 'string' ? { raw: v } : v)

// In-memory file system over an absolute-path tree; rebuilt per call so a test may mutate the tree between loads.
export function memFs(tree: Tree) {
  const files = (): Map<string, MemFile> => new Map(Object.entries(tree).map(([k, v]) => [k, meta(v)]))
  return {
    exists: (p: string): boolean => [...files().keys()].some((k) => k === p || k.startsWith(p + '/')),
    list: (dir: string): IoEntry[] => {
      const out = new Map<string, IoEntry>()
      for (const [k, f] of files()) {
        if (!k.startsWith(dir + '/')) continue
        const rest = k.slice(dir.length + 1)
        const slash = rest.indexOf('/')
        const own = slash === -1
        const name = own ? rest : rest.slice(0, slash)
        const kind = own ? (f.kind ?? 'file') : 'dir'
        const plain = kind === 'file' && f.isLink !== true
        out.set(name, { name, kind, size: kind === 'file' ? f.raw.length : 0, mtimeMs: plain ? (f.mtimeMs ?? 1000) : 0, isLink: f.isLink === true })
      }
      return [...out.values()]
    },
    read: (p: string): string => {
      const f = files().get(p)
      if (f === undefined) throw new Error(`ENOENT ${p}`)
      return f.raw
    },
  }
}

export function memIo(tree: Tree): { io: Io; calls: Calls } {
  const fs = memFs(tree)
  const calls: Calls = { exists: [], list: [], read: [] }
  const io: Io = {
    exists: async (p) => (calls.exists.push(p), fs.exists(p)),
    list: async (p) => (calls.list.push(p), fs.list(p)),
    read: async (p) => (calls.read.push(p), fs.read(p)),
  }
  return { io, calls }
}

export const defaultsTree = (): Record<string, string> =>
  Object.fromEntries(Object.entries(PLACEHOLDER_FILES).map(([k, raw]) => [`${PLUG}/placeholders/${k}.md`, raw]))

export const legacyPath = (layer: 'project' | 'global', legacy: string): string =>
  layer === 'project' ? `${ROOT}/.claude/brewtools/manager/prompts/${legacy}.md` : `${CFG}/manager/prompts/${legacy}.md`

export const vectorTree = (v: GoldenVector): Record<string, string> => ({
  ...defaultsTree(),
  ...Object.fromEntries(v.files.map((f) => [legacyPath(f.layer, f.legacy), f.raw])),
})

export type Wiring = { tree: Tree; env?: Record<string, string>; fail?: 'exists' | 'list' | 'read' | 'root' | 'env' }
export type Wired = { calls: Calls; toasts: string[] }

// Stubs beneath the mod: fs/env/session answer from memory (a missing file is denied like a real read); `fail` denies one call.
export function wire(on: On, w: Wiring): Wired {
  const fs = memFs(w.tree)
  const calls: Calls = { exists: [], list: [], read: [] }
  const toasts: string[] = []
  const vars = w.env ?? { HOME: '/home/u', CLAUDE_CONFIG_DIR: CFG }
  const fix = (p: string): string => p.replace(/^.*\/brewmod-placeholders\/(placeholders|\.state)/, `${PLUG}/$1`)
  on('fs.exists', (_$, e) => {
    calls.exists.push(fix(e.path))
    return (w.fail === 'exists' ? { deny: 'EACCES' } : { value: fs.exists(fix(e.path)) }) as never
  })
  on('fs.list', (_$, e) => {
    calls.list.push(fix(e.path ?? ''))
    return (w.fail === 'list' ? { deny: 'EACCES' } : { value: fs.list(fix(e.path ?? '')) }) as never
  })
  on('fs.read', (_$, e) => {
    calls.read.push(fix(e.path))
    const path = fix(e.path)
    return (w.fail === 'read' ? { deny: 'EACCES' } : fs.exists(path) ? { value: fs.read(path) } : { deny: 'ENOENT' }) as never
  })
  on('env.get', (_$, e) => (w.fail === 'env' ? { deny: 'EACCES' } : { value: vars[e.name] }) as never)
  on('session.root', () => (w.fail === 'root' ? { deny: 'EACCES' } : { value: ROOT }) as never)
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined } as never
  })
  on('session.id', () => ({ value: SESSION }) as never)
  return { calls, toasts }
}

// ---- command rigs: CmdIo for the tool functions, session bottoms for /placeholders and the tools

export type Rig = { io: CmdIo; tree: Tree; writes: [string, string][]; removed: string[] }
export type RigOpts = { real?: Record<string, string>; links?: string[]; rmExit?: number; rmErr?: string }

// In-memory CmdIo over a mutable tree: write adds a file, remove deletes it, stat answers file/dir/missing with optional realPath overrides.
export function cmdRig(tree: Tree, opts: RigOpts = {}): Rig {
  const fs = memFs(tree)
  const writes: [string, string][] = []
  const removed: string[] = []
  const io: CmdIo = {
    exists: async (p) => fs.exists(p),
    list: async (p) => fs.list(p),
    read: async (p) => fs.read(p),
    write: async (p, t) => {
      writes.push([p, t])
      tree[p] = t
    },
    stat: async (p) => {
      const real = opts.real?.[p] ?? p
      const isFile = p in tree
      const isDir = Object.keys(tree).some((k) => k.startsWith(`${p}/`))
      return isFile ? { kind: 'file', isLink: opts.links?.includes(p) === true, realPath: real } : isDir ? { kind: 'dir', isLink: false, realPath: real } : undefined
    },
    remove: async (p) => {
      removed.push(p)
      const exitCode = opts.rmExit ?? 0
      delete tree[exitCode === 0 ? p : '']
      return { exitCode, stderr: opts.rmErr ?? '' }
    },
  }
  return { io, tree, writes, removed }
}

export const regOf = (r: Rig) => loadRegistry(r.io, ROOTS, newRegistryCache())

export type Ops = {
  cmds: unknown[]
  tools: { name: string; description: string; inputSchema: any }[]
  writes: [string, string][]
  ran: string[][]
  submits: { text: string; origin: unknown }[]
  fills: unknown[]
  runs: unknown[]
}
export type WireOpts = { denyTools?: boolean; denySubmit?: boolean; fail?: 'exists' | 'env'; env?: Record<string, string> }

// wire() plus bottoms for the command, the tools, file writes, rm and prompt submit/fill; the tree is mutable.
export function wireAll(on: On, tree: Tree, opts: WireOpts = {}): Ops {
  const fs = memFs(tree)
  const ops: Ops = { cmds: [], tools: [], writes: [], ran: [], submits: [], fills: [], runs: [] }
  wire(on, { tree, ...(opts.fail === undefined ? {} : { fail: opts.fail }), ...(opts.env === undefined ? {} : { env: opts.env }) })
  on('session.start', () => ({ cwd: ROOT }))
  on('command.register', (_$, e) => (ops.cmds.push(e), { value: { command: e.name } }) as never)
  on('tool.register', (_$, e) => {
    ops.tools.push(e as never)
    return (opts.denyTools === true ? { deny: 'no tools' } : { value: { tool: `${TOOL}${e.name}` } }) as never
  })
  on('fs.write', (_$, e) => {
    ops.writes.push([e.path, e.text])
    tree[e.path] = e.text
    return { value: undefined } as never
  })
  on('fs.stat', (_$, e) => {
    const isFile = e.path in tree
    const value = isFile || fs.exists(e.path) ? { kind: isFile ? 'file' : 'dir', size: 0, mtimeMs: 0, isLink: false, realPath: e.path } : undefined
    return (value === undefined ? { deny: 'ENOENT' } : { value }) as never
  })
  on('process.run', (_$, e) => {
    ops.ran.push([...e.argv])
    delete tree[e.argv[2] ?? '']
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } as never
  })
  // No bottom answers prompt.submit: the engine's refusal inside the hand-off.
  const submitBottoms = opts.denySubmit === true ? [] : [(e: { text: string; origin: unknown }) => (ops.submits.push({ text: e.text, origin: e.origin }), { text: e.text })]
  submitBottoms.forEach((bottom) => on('prompt.submit', (_$, e) => bottom(e)))
  on('prompt.fill', (_$, e) => {
    ops.fills.push(e)
    return { isFilled: true } as never
  })
  on('command.run', (_$, e) => (ops.runs.push(e), { text: 'ENGINE' }) as never)
  return ops
}

export const boot = ($: any) => $.session.start({ cwd: ROOT, surface: null, isInteractive: false })
export const run = ($: any, args: string) => $.command.run({ command: 'placeholders', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as never)

// ---- editor: one edit, the engine's edit bottom, the view atom writes

// Replaces an empty draft in one edit: the caret lands at its end.
export const typed = ($: { prompt: unknown }, text: string) =>
  ($.prompt as any).edit({ origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: text })
export const core = (on: On) =>
  on('prompt.edit', (_$, e) => ({ text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end), cursor: e.start + e.inputText.length }))
// Passthrough spy on the view atom: the kit answers state beneath it, so the module's real writes are visible.
export const spyWrites = (on: On): unknown[] => {
  const writes: unknown[] = []
  on('state.set', { key: 'view' }, (_$, e, next) => {
    writes.push(e.value)
    return next(e)
  })
  return writes
}

// ---- band: a terminal session whose box mirrors every edit, the band mounted and read as Text rows

// What core's own drawing resolves to beneath every hook (2.1.301 types: `{ type: 'engine', ref }`).
export const ENGINE_NODE = { type: 'engine', ref: 0 } as const
export const BAND = { plugin: 'brewmod-placeholders', component: 'AbovePrompt' } as const
export const bandProps = (maxRows = 24, bodyColumns = 100) => ({ hasSurvey: false, isWorking: false, maxRows, bodyColumns, scroll: { bodyRows: maxRows - 1, offset: 0, total: 0 }, view: {} })
// The box the stubbed engine answers $.prompt.read with.
export const box = { text: '', cursor: 0 }

// extra hooks sit above the box bottoms; ui.render falls through to core's own drawing, as the live engine answers.
export async function bootBand($: any, on: On, w: Wiring, extra: (o: On) => void = () => {}): Promise<Wired> {
  const wired = wire(on, w)
  extra(on)
  on('prompt.read', () => ({ value: box }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
  on('prompt.edit', (_$, e) => {
    box.text = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)
    box.cursor = e.start + e.inputText.length
    return { text: box.text, cursor: box.cursor }
  })
  // Core echoes the box it already changed (PromptChangeResult).
  on('prompt.change', (_$, e) => ({ text: e.text }))
  on('ui.render', () => ENGINE_NODE as never)
  box.text = ''
  box.cursor = 0
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  return wired
}

export const mountBand = ($: any, maxRows = 24, surface: 'terminal' | 'desktop' = 'terminal', bodyColumns = 100) => $.ui.mount({ ...BAND, surface, props: bandProps(maxRows, bodyColumns) })
// One entry per outermost Text, its nested styled pieces joined: a row reads as drawn.
const shown = (n: any): string => (typeof n === 'string' ? n : n !== null && typeof n === 'object' ? (n.children ?? []).map(shown).join('') : '')
const outer = (n: any): string[] => (n === null || typeof n !== 'object' ? [] : n.type === 'Text' ? [shown(n)] : (n.children ?? []).flatMap(outer))
export const textsOf = async (ui: any): Promise<string[]> => outer(await ui.drawn())
// Each drawn run as [style, text]: tok/unk = token name, sent = text Claude receives, act = what to type or do, key = a key, dim = explanation; other props as JSON.
const STYLES: Record<string, string> = {
  '{"color":"suggestion","bold":true}': 'tok',
  '{"color":"warning","bold":true}': 'unk',
  '{"color":"text","bold":true,"wrap":"truncate-end"}': 'sent',
  '{"color":"text","underline":true}': 'act',
  '{"color":"text"}': 'key',
  '{"dimColor":true}': 'dim',
  '{"dimColor":true,"wrap":"truncate-end"}': 'dim',
}
const runs = (n: any): [string, string][] => {
  if (n === null || typeof n !== 'object') return []
  const kids: unknown[] = n.children ?? []
  if (n.type !== 'Text' || kids.some((k) => typeof k === 'object')) return kids.flatMap(runs)
  const key = JSON.stringify(n.props ?? {})
  return [[STYLES[key] ?? key, shown(n)]]
}
export const spansOf = async (ui: any): Promise<[string, string][]> => runs(await ui.drawn())
// The build's mod tools answer, so the `P<name>?` hand-off runs and the cut row names it.
export const withTools = (o: On) => o('tool.register', (_$, e) => ({ value: { tool: `${TOOL}${e.name}` } }) as never)
export async function bandTexts($: any, maxRows = 24, surface: 'terminal' | 'desktop' = 'terminal', bodyColumns = 100): Promise<string[]> {
  const ui = await mountBand($, maxRows, surface, bodyColumns)
  const texts = await textsOf(ui)
  await ui.unmount()
  return texts
}
