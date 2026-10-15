import type { On } from 'claude-code'
import { PLACEHOLDER_FILES, type GoldenVector } from './parity/golden.generated'
import type { Io, IoEntry } from '../hooks/lib/defs'

export const PLUG = '/PLUG'
export const ROOT = '/proj'
export const CFG = '/cfg'
export const SESSION = 'sess-1'
export const STATE_FILE = `${PLUG}/.state/mode-${SESSION}.json`

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
