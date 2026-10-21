// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import {
  CLAIMS_DIR, HANDOFF_MARK, RUN_MARK, bodyOf, buildItem, calendar, claimJson, claimLive, claimName, classify, closedAt, closedLabel, datePatch, editText, formatWhen, isItemName, isoZ, itemKey, itemName, matchId,
  parseClaim, parseConfig, parseItem, parseWhenNatural, patchHeader, rangeOf, relative, reopenPatch, sections, sessionStateJson, sessionStateName, slugOf, slugify, systemTz, tagOf, validSid, windowOf,
  type Claim, type Item, type State,
} from './lib/items.mjs'
import type { ReminderView } from '../types'

// The band reads this view; the atom is declared in this file only (the scan reads it).
const viewAtom = atom({ plugin: 'brewmod-reminders', key: 'view' } as const, { due: 0, rows: [] })

const DEFAULT_PREFIX = '**'
const PREFIX_RE = /^[!-/:-@[-^`{-~]{2,8}$/
const PREFIX_FIX = '/config -> Reminder picker prefix'
// Local copy of brewmod-placeholders validatePrefix (hooks/lib/match.ts); here a `/`-leading prefix is refused, not only warned.
const validatePrefix = (raw: unknown): { prefix: string; warning: string | null } =>
  raw === undefined
    ? { prefix: DEFAULT_PREFIX, warning: null }
    : typeof raw !== 'string' || !PREFIX_RE.test(raw)
      ? { prefix: DEFAULT_PREFIX, warning: `reminder prefix must be 2-8 ASCII punctuation characters (not _), using ${DEFAULT_PREFIX} · change: ${PREFIX_FIX}` }
      : raw.startsWith('/')
        ? { prefix: DEFAULT_PREFIX, warning: `reminder prefix starting with / clashes with slash commands, using ${DEFAULT_PREFIX} · change: ${PREFIX_FIX}` }
        : { prefix: raw, warning: null }
const escRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
type Tok = { start: number; end: number; name: string }
// Standalone `<prefix><name>` tokens; `**1 thing**` is bold: skipped when the next prefix on its line follows a non-space (a closer).
// An opener (` **x`) or no further prefix keeps it, so `**1 and **bold** x` expands **1.
function tokensOf(text: string, prefix: string): Tok[] {
  const re = new RegExp(`(^|\\s)${escRe(prefix)}((?:project:|global:)?[\\w-]+)(?=\\s|$)`, 'g')
  return [...text.matchAll(re)].flatMap((m) => {
    const start = (m.index ?? 0) + (m[1] ?? '').length
    const end = start + prefix.length + (m[2] ?? '').length
    const eol = text.indexOf('\n', end)
    const at = text.slice(end, eol === -1 ? undefined : eol).indexOf(prefix)
    return at !== -1 && !/\s/.test(text.charAt(end + at - 1)) ? [] : [{ start, end, name: m[2] ?? '' }]
  })
}
// Origins whose text is the person's own typed prompt (same rule as brewmod-placeholders).
const TYPED_ORIGINS: ReadonlySet<string> = new Set(['composer', 'bridge', 'sdk'])
const TICK_MS = 60_000
const BAND_ROWS = 3
const HISTORY_SHOWN = 20
const HISTORY_PICK = 10
const TOOL = 'mcp__brewmod-reminders__'
const NEEDS_TOOLS = 'Claude tools for reminders are unavailable on this build; edit the files in .claude/scheduled by hand (see /remind help).'

type Entry = Item & { global: boolean; dir: string; path: string; claim: Claim | null; state: State }
type Io = {
  exists: (p: string) => Promise<boolean>
  list: (p: string) => Promise<{ name: string; kind: string }[]>
  read: (p: string) => Promise<string>
  write: (p: string, t: string) => Promise<void>
}
type Dirs = { project: string; global: string | null; config: string }
type Env = { cfg: string | undefined; home: string | undefined; override: string | undefined }
type Out = { text: string; isError?: true }

// override = REMIND_GLOBAL_DIR: the global folder itself (live tests; unset in normal use).
const dirsOf = (root: string | undefined, { cfg, home, override }: Env): Dirs => ({
  project: `${root ?? '.'}/.claude/scheduled`,
  global: override !== undefined && override !== '' ? override : cfg !== undefined && cfg !== '' ? `${cfg}/reminders` : home !== undefined && home !== '' ? `${home}/.claude/reminders` : null,
  config: `${root ?? '.'}/.claude/reminders.json`,
})
const fail = (text: string): Out => ({ text, isError: true })
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const validTz = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return tz !== ''
  } catch {
    return false
  }
}
// env TZ may be POSIX-style (":Europe/Lisbon"); an unusable value falls back to the system zone, then UTC.
const tzOf = (fromEnv: string | undefined): string => {
  const tz = (fromEnv ?? '').replace(/^:/, '')
  return validTz(tz) ? tz : validTz(systemTz()) ? systemTz() : 'UTC'
}
const oneLine = (s: string, max: number): string => s.replace(/\s+/g, ' ').trim().slice(0, max)

async function loadDir(io: Io, dir: string, global: boolean, now: number): Promise<Entry[]> {
  if (!(await io.exists(dir).catch(() => false))) return []
  const files = (await io.list(dir).catch(() => [])).filter((f) => f.kind === 'file' && isItemName(f.name))
  const rows = await Promise.all(
    files.map(async (f): Promise<Entry | null> => {
      const path = `${dir}/${f.name}`
      const text = await io.read(path).catch(() => null)
      if (text === null) return null
      const item = parseItem(f.name, text)
      const claim = parseClaim(await io.read(`${dir}/${CLAIMS_DIR}/${claimName(item.id)}`).catch(() => ''))
      return { ...item, global, dir, path, claim, state: classify(item, claim, now) }
    }),
  )
  return rows.filter((r): r is Entry => r !== null)
}

const loadAll = async (io: Io, dirs: Dirs, now: number): Promise<Entry[]> => [
  ...(await loadDir(io, dirs.project, false, now)),
  ...(dirs.global === null ? [] : await loadDir(io, dirs.global, true, now)),
]

const byDue = (a: Entry, b: Entry): number => (a.due ?? 0) - (b.due ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
const isNum = (s: string): boolean => /^\d+$/.test(s)
const nameOf = (i: Item): string => (i.title === '' ? i.id : i.title)
// A live claim of another session, else null.
const foreignClaim = (e: Entry, sid: string, now: number): Claim | null => (e.claim !== null && claimLive(e.claim, now) && e.claim.session !== sid ? e.claim : null)
const claimFile = (e: Entry): string => `${e.dir}/${CLAIMS_DIR}/${claimName(e.id)}`
const whenLine = (i: Item, tz: string, now: number, bad: string = i.dueRaw): string => (i.due !== null ? formatWhen(i.due, tz, now) : i.someday ? 'no date (someday)' : bad)
const MARK = { action: '▶', note: '✎' } as const
const mark = (i: Item): string => MARK[i.kind]
// N in /remind run 1 and **1 = position in this list, the same order as the band.
const firedList = (items: Entry[]): Entry[] => items.filter((i) => i.state === 'due').sort(byDue)

// The band lists due items only: pending (upcoming) and running (claimed by a live session) never show.
function viewOf(items: Entry[], now: number): ReminderView {
  const due = firedList(items)
  return {
    due: due.length,
    rows: due.map((i) => `${mark(i)} ${nameOf(i)}  ${relative(i.due ?? now, now)}${i.global ? ' (global)' : ''}`).slice(0, BAND_ROWS),
  }
}

// every = all plus the newest HISTORY_PICK closed (Enter on a bare `<prefix>?`); no command word for it.
type QState = 'active' | 'all' | 'someday' | 'history' | 'every'
type Query = { state: QState; scope?: 'project' | 'global'; from: number; to: number }
const STATE_WORDS = new Map<string, QState>([['active', 'active'], ['all', 'all'], ['someday', 'someday'], ['history', 'history'], ['done', 'history']])
const query = (state: QState, rest: Partial<Query> = {}): Query => ({ state, from: -Infinity, to: Infinity, ...rest })

// `show` words after the verb: [active|all|someday|history|done] [project|global] [window]; null when anything is left over (-> free text).
function parseShow(words: string[], now: number, tz: string): Query | null {
  const w = words.map((x) => x.toLowerCase())
  const state = STATE_WORDS.get(w[0] ?? '')
  const at = state === undefined ? 0 : 1
  const scope = w[at] === 'project' || w[at] === 'global' ? w[at] : undefined
  const rest = w.slice(at + (scope === undefined ? 0 : 1)).join(' ')
  const win = rest === '' ? { from: -Infinity, to: Infinity } : windowOf(rest, now, tz)
  return win === null ? null : query(state ?? 'active', { scope: scope as Query['scope'], ...win })
}

function listText(all: Entry[], now: number, tz: string, dirs: Dirs, q: Query): string {
  const windowed = q.from > -Infinity || q.to < Infinity
  const inScope = (i: Entry): boolean => q.scope === undefined || i.global === (q.scope === 'global')
  const items = all.filter((i) => {
    const t = q.state === 'history' ? closedAt(i) : i.due
    const firedAlways = i.state === 'due' && (q.state === 'all' || q.state === 'active')
    return inScope(i) && (!windowed || firedAlways || (t !== null && t >= q.from && t < q.to))
  })
  const num = new Map(firedList(all).map((i, k) => [i.path, k + 1]))
  const whenOf = (i: Entry): string => whenLine(i, tz, now, `bad due "${i.dueRaw}" (UTC with Z needed)`)
  const running = (i: Entry): string => (i.state === 'running' ? ` | running in session ${i.claim?.session ?? '?'} since ${i.claim === null ? '?' : formatWhen(i.claim.at, tz, now)}` : '')
  const row = (i: Entry): string => `- ${num.has(i.path) ? `${num.get(i.path)} ` : ''}${mark(i)} ${tagOf(i)} | ${whenOf(i)} | ${i.title}${running(i)}`
  const histRow = (i: Entry): string => {
    const ms = closedAt(i)
    return `- ${i.status === 'cancelled' ? '✗' : '✓'} ${mark(i)} ${tagOf(i)} | ${closedLabel(i)} ${ms === null ? '?' : formatWhen(ms, tz, now)} | ${i.title}${i.result === '' ? '' : ` | ${i.result}`}`
  }
  const part = (label: string, rows: Entry[], f: (i: Entry) => string = row, n = rows.length): string[] => (rows.length === 0 ? [] : [`${label} (${n}):`, ...rows.map(f)])
  const s = sections(items.map((item) => ({ item, state: item.state })))
  const fired = s.fired.map((r) => r.item)
  const waiting = [...s.running, ...s.waiting].map((r) => r.item).sort(byDue)
  const someday = s.someday.map((r) => r.item)
  const closed = s.history.map((r) => r.item)
  const history = closed.slice(0, HISTORY_SHOWN)
  const bad = items.filter((i) => i.state === 'unparseable').sort(byDue)
  const sd = all.filter((i) => i.state === 'someday' && inScope(i)).length
  const open = [...part('Fired', fired), ...part('Waiting', waiting), ...part('Someday', someday), ...part('Unreadable', bad)]
  const more = closed.length - HISTORY_PICK
  const out =
    q.state === 'history'
      ? part(`History (last ${HISTORY_SHOWN})`, history, histRow)
      : q.state === 'someday'
        ? part('Someday', someday)
        : q.state === 'active'
          ? [...part('Fired', fired), ...(fired.length > 0 && sd > 0 ? [`${sd} someday · /remind all`] : [])]
          : q.state === 'every'
            ? [...open, ...part('History', closed.slice(0, HISTORY_PICK), histRow, closed.length), ...(more > 0 ? [`+${more} more · /remind history`] : [])]
            : open
  const where = `project ${dirs.project} | global ${dirs.global ?? 'unavailable'}`
  const none =
    q.state === 'active'
      ? `No fired reminders${sd > 0 ? ` (${sd} someday)` : ''}; /remind all lists the waiting ones.`
      : q.state === 'history'
        ? 'No closed reminders yet.'
        : q.state === 'someday'
          ? 'No someday reminders.'
          : q.state === 'every'
            ? 'No open or closed reminders.'
            : 'No open reminders.'
  return out.length === 0 ? `${none} ${where}` : [`Now: ${formatWhen(now, tz, now).replace(/, now$/, '')}`, ...out, where].join('\n')
}

const gitNote = (mode: string, i: { global: boolean; path: string }): string =>
  i.global || mode === 'off' ? '' : `\nGit: commit only ${i.path}${mode === 'commit-push' ? ' and push' : ' (no push)'} following the repo's conventions; stage nothing else.`

const isClosed = (e: Entry): boolean => e.state === 'done' || e.state === 'cancelled'
// One item by id/slug/prefix within the scope filter; a string is the refusal text.
// Same id in both folders (e.g. after a scope move): the one open copy wins (wantClosed: the one closed copy).
function pick(items: Entry[], id: string, scope: string | undefined, wantClosed = false): Entry | string {
  const scopes = scope === 'project' ? [false] : scope === 'global' ? [true] : [false, true]
  const hits = scopes.map((g) => ({ g, m: matchId(items.filter((i) => i.global === g).map((i) => i.id), id) }))
  const found = hits.flatMap((h) => ('id' in h.m ? [{ g: h.g, id: h.m.id }] : []))
  const q = id.trim().toLowerCase().replace(/\.md$/, '')
  const exact = found.filter((f) => f.id.toLowerCase() === q || slugOf(f.id) === q)
  const hit = (found.length > 1 && exact.length === 1 ? exact : found).map((h) => items.find((i) => i.global === h.g && i.id === h.id) as Entry)
  const fit = hit.length > 1 ? hit.filter((x) => isClosed(x) === wantClosed) : hit
  if (hit.length > 1 && fit.length !== 1) return `"${id}" exists in project and global: pass scope`
  const [one] = fit
  if (one !== undefined) return one
  const bad = hits.flatMap((h) => ('candidates' in h.m ? h.m.candidates : []))
  return bad.length > 0 ? `"${id}" is ambiguous: ${bad.join(', ')}` : `no reminder matches "${id}"; /remind all lists the ids`
}

// A number = position in the fired list (same as the band); anything else = pick by id.
function resolve(items: Entry[], token: string, scope: string | undefined): Entry | string {
  if (!isNum(token)) return pick(items, token, scope)
  return firedList(items)[Number(token) - 1] ?? `no fired reminder ${token}; /remind shows the numbered list`
}
const RUNNABLE: ReadonlySet<string> = new Set(['due', 'pending', 'running', 'someday'])
// A `<prefix>[project:|global:]<name>` token's reminder via the /remind run resolver; closed, unreadable, ambiguous or unknown -> null (left as text).
// A scoped number (`global:1`) stays text: N counts the fired list of both folders, the picker never writes one.
const runnable = (items: Entry[], name: string): Entry | null => {
  const [, scope, id = name] = /^(project|global):(.+)$/.exec(name) ?? []
  if (scope !== undefined && isNum(id)) return null
  const e = resolve(items, id, scope)
  return typeof e === 'string' || !RUNNABLE.has(e.state) ? null : e
}

async function claimTo(io: Io, e: Entry, sid: string, now: number): Promise<Out | null> {
  const file = claimFile(e)
  if (!(await io.exists(`${e.dir}/${CLAIMS_DIR}/.gitignore`).catch(() => false))) await io.write(`${e.dir}/${CLAIMS_DIR}/.gitignore`, '*\n')
  await io.write(file, claimJson(sid, now))
  const back = parseClaim(await io.read(file).catch(() => ''))
  return back !== null && back.session === sid ? null : fail(`${e.id} is running in session ${back?.session ?? '?'}; do not run it, tell the user`)
}

type Act = { id: string; action: string; until?: string; result?: string; scope?: string; fromScope?: string; text?: string; kind?: string; when?: string }
type Ctx = { sid: string; now: number; tz: string; by: 'model' | 'user'; git: string }
const ACTIONS = ['start', 'done', 'snooze', 'cancel', 'edit', 'reopen']
const SOMEDAY_RE = /^(none|someday)$/i

// edit: text/kind/when/scope in one write; a scope move writes the new file, then cancels the old one (a cancelled same-name file at the target is overwritten).
// Returns old and new lines, a one-line undo call and the old file.
async function edit(io: Io, dirs: Dirs, e: Entry, req: Act, c: Ctx): Promise<Out> {
  const { now, tz } = c
  if (req.kind !== undefined && req.kind !== 'action' && req.kind !== 'note') return fail('kind is action or note')
  const when = (req.when ?? '').trim()
  let dueMs: number | null | undefined
  if (when !== '') {
    const w = SOMEDAY_RE.test(when) ? null : parseWhenNatural(when, now, tz)
    if (w !== null && !w.ok) return fail(w.error)
    dueMs = w === null ? null : w.ms
  }
  const body = req.text?.trim()
  if (body === '') return fail('text must not be empty')
  const here = e.global ? 'global' : 'project'
  const moveTo = req.scope !== undefined && req.scope !== here ? req.scope : undefined
  if (req.kind === undefined && dueMs === undefined && body === undefined && moveTo === undefined) return fail('nothing to change: pass text, kind, when or scope')
  const old = await io.read(e.path)
  const next = editText(old, { text: body, kind: req.kind, dueMs })
  if (moveTo === undefined) await io.write(e.path, next)
  else {
    const dir = moveTo === 'global' ? dirs.global : dirs.project
    if (dir === null) return fail('the global reminders folder is unavailable (no home directory)')
    const dest = `${dir}/${e.name}`
    const there = (await io.exists(dest)) ? parseItem(e.name, await io.read(dest)) : null
    if (there !== null && there.status !== 'cancelled') return fail(`${e.name} already exists in ${moveTo}; edit it there`)
    await io.write(dest, next)
    await io.write(e.path, patchHeader(old, { status: 'cancelled', cancelled: isoZ(now) }))
    if (e.claim !== null) await io.write(claimFile(e), '')
  }
  const after = parseItem(e.name, next)
  const change = (a: string, b: string): string => (a === b ? a : `${a} → ${b}`)
  const head = `Reminder updated ${change(`${mark(e)} ${e.kind}`, `${mark(after)} ${after.kind}`)} · ${change(here, moveTo ?? here)} · ${e.id}`
  // The project-side file this edit wrote: the moved-in copy, the cancelled source, or the edited file.
  const projectFile = moveTo === 'project' ? `${dirs.project}/${e.name}` : e.path
  const git = gitNote(c.git, { global: moveTo === undefined && e.global, path: projectFile })
  const oldWhen = e.someday ? 'someday' : e.due !== null && e.due > now ? isoZ(e.due) : null
  const undo = {
    id: e.id,
    action: 'edit',
    ...(body !== undefined && body !== bodyOf(old) ? { text: bodyOf(old) } : {}),
    ...(req.kind !== undefined && req.kind !== e.kind ? { kind: e.kind } : {}),
    ...(dueMs !== undefined && oldWhen !== null ? { when: oldWhen } : {}),
    ...(moveTo === undefined ? {} : { scope: here }),
    from_scope: moveTo ?? here,
  }
  const lost = dueMs !== undefined && oldWhen === null ? ` (the old time ${e.dueRaw} has passed or is unreadable: ask for a new one)` : ''
  const undoLine = Object.keys(undo).length > 3 || lost !== '' ? `Undo, when the user asks: update_reminder ${JSON.stringify(undo)}${lost}` : 'Undo: nothing changed'
  return {
    text: `${head}\n- ${mark(e)} ${here} | ${whenLine(e, tz, now)}  ${e.title}\n+ ${mark(after)} ${moveTo ?? here} | ${whenLine(after, tz, now)}  ${after.title}${git}\n${undoLine}\nOld file (${e.path}):\n${old.trimEnd()}`,
  }
}

// start | done | snooze | cancel | edit | reopen; the model is refused on a live foreign claim, the person (by: 'user') is not.
async function act(io: Io, dirs: Dirs, a: { req: Act } & Ctx): Promise<Out> {
  const { req, sid, now, tz } = a
  if (!ACTIONS.includes(req.action)) return fail(`unknown action "${req.action}": start, done, snooze, cancel, edit or reopen`)
  if ([req.scope, req.fromScope].some((s) => s !== undefined && s !== 'project' && s !== 'global')) return fail('scope is project or global')
  const e = pick(await loadAll(io, dirs, now), req.id, req.action === 'edit' ? req.fromScope : (req.fromScope ?? req.scope), req.action === 'reopen')
  if (typeof e === 'string') return fail(e)
  const closed = isClosed(e)
  if (req.action === 'reopen' ? !closed : closed) return fail(req.action === 'reopen' ? `${e.id} is not closed` : `${e.id} is already ${e.state}`)
  if (e.state === 'ignored') return fail(`${e.id} has no status header; add \`status: pending\` and \`due:\` first`)
  const foreign = foreignClaim(e, sid, now)
  if (foreign !== null && a.by === 'model') return fail(`${e.id} is running in session ${foreign.session} since ${formatWhen(foreign.at, tz, now)}; do not run it or change it, tell the user`)
  if (req.action === 'start') {
    if (e.state === 'unparseable') return fail(`${e.id} has an unreadable due line; fix the header first`)
    const lost = await claimTo(io, e, sid, now)
    return lost ?? { text: `started ${tagOf(e)}; carry out the text below, then update_reminder {id, action:"done", result}.\n${await io.read(e.path)}` }
  }
  if (req.action === 'edit') return edit(io, dirs, e, req, a)
  const text = await io.read(e.path)
  let patch: Record<string, string | null>
  if (req.action === 'done') {
    const result = oneLine(req.result ?? '', 400)
    patch = { status: 'done', done: isoZ(now), ...(result === '' ? {} : { result }) }
  } else if (req.action === 'cancel') patch = { status: 'cancelled', cancelled: isoZ(now) }
  else {
    const blank = (req.until ?? '').trim() === ''
    if (req.action === 'reopen' && blank) patch = reopenPatch()
    else {
      const w = parseWhenNatural(req.until ?? '', now, tz)
      if (!w.ok) return fail(w.error)
      patch = req.action === 'reopen' ? reopenPatch(w.ms) : datePatch(w.ms)
    }
  }
  await io.write(e.path, patchHeader(text, patch))
  if (e.claim !== null) await io.write(claimFile(e), '')
  const label = nameOf(e)
  const dueTxt = (patch.due ?? e.dueRaw) === 'none' ? 'someday (no date)' : `due ${patch.due ?? e.dueRaw}`
  const said =
    req.action === 'snooze' ? `snoozed: ${label} (${tagOf(e)}) until ${patch.due}` : req.action === 'reopen' ? `reopened: ${label} (${tagOf(e)}) ${dueTxt}` : `${req.action === 'done' ? 'done' : 'cancelled'}: ${label} (${tagOf(e)})`
  return { text: `${said}${gitNote(a.git, e)}` }
}

type Add = { scope?: string; when?: string; text?: string; slug?: string; tz?: string; kind?: string }

// Saves at once: no preview, no confirm. when `someday`/`none` = no date (never fires).
async function add(io: Io, dirs: Dirs, a: Add, now: number, localTz: string, git: string): Promise<Out> {
  if (a.scope !== 'project' && a.scope !== 'global') return fail('scope is required: project or global')
  const dir = a.scope === 'project' ? dirs.project : dirs.global
  if (dir === null) return fail('the global reminders folder is unavailable (no home directory)')
  const text = (a.text ?? '').trim()
  if (text === '') return fail('text is required')
  const raw = (a.when ?? '').trim()
  const kind = a.kind === 'action' || a.kind === 'note' ? a.kind : null
  if (raw === '' || kind === null) return fail([...(raw === '' ? [`when is required: nothing is saved without a trigger time. ${calendar(now, localTz)} ${WHEN_RULE}`] : []), ...(kind === null ? [KIND_RULE] : [])].join(' '))
  const tz = a.tz !== undefined && a.tz !== '' ? a.tz : localTz
  if (!validTz(tz)) return fail(`unknown time zone "${tz}"`)
  const w = SOMEDAY_RE.test(raw) ? null : parseWhenNatural(raw, now, tz)
  if (w !== null && !w.ok) return fail(w.error)
  const dueMs = w === null ? null : w.ms
  const slug = slugify(a.slug !== undefined && a.slug !== '' ? a.slug : text)
  let name = itemName(dueMs, slug)
  for (let n = 2; n <= 99 && (await io.exists(`${dir}/${name}`)); n++) name = itemName(dueMs, `${slug.slice(0, 40 - `-${n}`.length)}-${n}`)
  if (await io.exists(`${dir}/${name}`)) return fail(`no free file name for "${slug}" at that time; use another slug`)
  const id = name.replace(/\.md$/, '')
  const path = `${dir}/${name}`
  await io.write(path, buildItem({ dueMs, text, now, kind }))
  const due = dueMs === null ? 'someday (no date)' : `due ${formatWhen(dueMs, tz, now)}`
  return { text: `saved ${id} (${a.scope}) | ${MARK[kind]} ${kind} | ${due} | ${path}\nchange it by saying so · /remind cancel ${id}${gitNote(git, { global: a.scope === 'global', path })}` }
}

const WHEN_RULE =
  'If the request names no time, ask ONE AskUserQuestion "When should it fire?" with 2-3 options you derive from this reminder\'s own context (e.g. post-deploy prod check: tonight 23:00 / tomorrow 09:00 / in 1 week; renew a domain: in 2 weeks / in 1 month; check nightly-run logs: tonight / tomorrow morning), each label showing its concrete local time, the best fit marked "(Recommended)", plus a last option "No date (someday)" (answer -> when:"someday": it never fires and shows only when the user asks); free text stays available through Other; no fixed list. A kind (action or note) or scope (project or global) that is still unclear joins that same AskUserQuestion as extra questions; ask nothing else. Every option is a concrete local time: a day-level answer like "in 1 week" or "next Monday" is saved at the time its label showed (default 09:00 local), e.g. when:"2026-10-28 09:00" or "mon 09:00"; never a bare date.'
const KIND_RULE =
  'kind is required: action (Claude does the work when the user runs it, e.g. "check the prod logs") or note (only tells the user, closes once shown, e.g. "reply to Ana"). Infer it from the request; ask only when it is unclear, as an extra question in the same single AskUserQuestion as the time.'

const HELP = (dirs: Dirs, hasTools: boolean, alert: string, p: string): string =>
  [
    '/remind                      = the fired reminders, numbered like the band (no Claude turn)',
    `${p} / ${p}?  typeahead: fired + someday / every reminder by state, project and global; ${p}N or ${p}<id> + Enter runs one; a bare ${p} + Enter prints /remind all, ${p}? also the 10 newest closed (no Claude turn)`,
    '/remind all [project|global] [today|tomorrow|week|+Nd|+Nw|until YYYY-MM-DD]   Fired, Waiting and Someday; the window filters by trigger time (week = until Sunday 23:59, local)',
    '/remind history [filters]    = closed: done, shown notes, cancelled   |   /remind someday = only the undated ones   (show active|all|done and list still work)',
    '/remind run <N|id> [words]   Claude runs it (action) or shows it and closes it (note); N = number in /remind',
    '/remind done|cancel [project|global] <N|id>   close without running (id = file name, slug or unique prefix; no Claude turn)',
    '/remind snooze [project|global] <N|id> <when>   +2h | +1d | tomorrow 9:00 | today 17:30 | fri 14:00 (next Friday) | 2026-10-22 09:00 (your local zone; a day without a time = 09:00; gives a someday item a date; no Claude turn)',
    '/remind reopen <id> [when]   bring a closed one back, with a new time if given   |   /remind edit <N|id> <change>   Claude changes text, kind, time or scope and shows old and new',
    '/remind <words>              add or ask in your words: /remind check prod tomorrow 9:00',
    '/remind project|global <words>   same with the folder fixed (default project)',
    `Items: ${dirs.project}/\`<YYYYMMDD-HHMM>_<slug>.md\` or \`someday_<slug>.md\` (project), ${dirs.global ?? '~/.claude/reminders'}/ (global); header due (UTC, Z, or none), status, kind (action|note), body = the task.`,
    'A fired item is offered at your first prompt of a session, then at most once per cooldown (a newly fired one at once); nothing runs unasked.',
    `Desktop alert: ${alert}`,
    ...(hasTools ? [] : [NEEDS_TOOLS]),
  ].join('\n')

const stamp = (now: number, tz: string): string => `Now: ${formatWhen(now, tz, now).replace(/, now$/, '')}, time zone ${tz}, UTC ${isoZ(now)}. Times I give without a zone are in ${tz}.`

const handoff = (request: string, scope: string | null, now: number, tz: string): string =>
  [
    `${HANDOFF_MARK}${request}</request>`,
    stamp(now, tz),
    calendar(now, tz),
    `Scope: ${scope ?? 'not given: project unless I say global, everywhere or in every project; ask only when unclear, in the same single dialog'}.`,
    `Use the ${TOOL}* tools. To add: add_reminder saves at once (no preview, no confirm) when time, kind and scope are clear; then show me its confirmation line. Every reminder needs a trigger time and a kind (action or note; infer it from my words). ${WHEN_RULE} To look: list_reminders (state active|all|someday|done, from/to); to change: update_reminder (start|done|snooze|cancel|edit|reopen).`,
  ].join('\n')

// The text a run sends to Claude (/remind run, **N): action -> start, do, done; note -> show, say it was just a reminder, done.
const runPrompt = (e: Entry, body: string, extra: string): string =>
  [
    `${RUN_MARK}${e.id} (${e.title}, ${e.kind}): ${body}`,
    e.kind === 'note'
      ? `This is a note: show me its full text above, say it was just a reminder (nothing to execute), then call update_reminder {id:"${e.id}", action:"done"}.`
      : `This is an action: call update_reminder {id:"${e.id}", action:"start"}, carry out its text above, then update_reminder {id:"${e.id}", action:"done", result:<one line>}.`,
    ...(e.global ? ['It is global: pass scope:"global" in every update_reminder call.'] : []),
    ...(extra === '' ? [] : [`My extra words: ${extra}`]),
  ].join('\n')

const editHandoff = (e: Entry, change: string, now: number, tz: string): string =>
  [
    `${HANDOFF_MARK}edit ${e.id}: ${change}</request>`,
    stamp(now, tz),
    `Edit reminder ${e.id} (${e.title}, ${e.kind}, ${e.global ? 'global' : 'project'}): ${change}`,
    `Call ${TOOL}update_reminder {id:"${e.id}", action:"edit"} with only what changes: text, kind (action|note), when (a time, or "someday" for no date), scope (the folder to move it to; from_scope:"${e.global ? 'global' : 'project'}" is where it is now). Show me the old and new lines it returns.`,
  ].join('\n')

const TOOLS = [
  {
    name: 'list_reminders',
    description:
      "List the user's durable reminders: files in this project's .claude/scheduled and the global ~/.claude/reminders, with ids and times in the user's zone. Fired ones are numbered like the band. state: active = fired (due) only, with an 'N someday' count line; all (default) = Fired, Waiting and Someday sections by trigger time; someday = the undated ones only (never fire); done = closed: done, shown notes and cancelled. For 'anything to remind me?', 'what's pending?', 'any reminders?', 'есть ли чем мне напомнить?' call state active and show the fired ones, then mention the someday count and offer them. from/to filter by trigger time, so 'reminders that fire this week in this project' = scope project, from 'week' (or from 'week' alone: now until Sunday 23:59). Call it before answering a question about reminders or when an id for update_reminder is unclear.",
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['project', 'global'], description: 'omit for both' },
        state: { type: 'string', enum: ['active', 'all', 'someday', 'done'], description: 'default all' },
        from: { type: 'string', description: 'earliest trigger: ISO, "YYYY-MM-DD" (00:00 local) or today|tomorrow|week|+Nd|+Nw|until YYYY-MM-DD (the window start)' },
        to: { type: 'string', description: 'latest trigger, exclusive: ISO, "YYYY-MM-DD" (through that day) or a window word (the window end)' },
      },
    },
  },
  {
    name: 'add_reminder',
    description: `Add a durable reminder: a file that survives sessions and is offered at the first prompt of a later session once due. Unlike CronCreate or /loop (session-only, lost when the session ends), use it for EVERY 'remind me ...' request, short ones too ('in 2 minutes', 'tomorrow 9:00 check prod'); CronCreate only for repeating in-session polling. It saves at once (no preview, no confirm) and returns a confirmation line with the id; show it to the user. Every reminder MUST have a trigger time (or the explicit 'someday' = no date, never fires) and a kind. When the request names no time, FIRST call this tool without when: it saves nothing and returns today's date with the weekdays of the next days and the ask rule; then ask. ${WHEN_RULE} kind: action = Claude does the work when the user runs it (check the logs, run a migration dry run); note = only tells the user, closes once shown (build the CSV export, reply to Ana); infer it from context and ask only when unclear, in the same single AskUserQuestion as the time. scope: project (this repo) unless the user says global, everywhere or in every project; ask only when unclear, in that same question. text: what to do when due, in the user's words, self-contained. slug: 2-5 lowercase ASCII words. when: ISO with offset or Z, local 'YYYY-MM-DD HH:MM' in the user's zone (or tz), 'YYYY-MM-DD' (09:00 local), 'today|tomorrow [HH:MM]' (default 09:00), a weekday 'fri 14:00' (next such day, default 09:00), +<n>m|h|d|w, or 'someday'; a past time is rejected. Take the date and zone from the Now line of the helper text or the current date.`,
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['project', 'global'], description: 'project (this repo, default) or global (all projects)' },
        kind: { type: 'string', enum: ['action', 'note'], description: 'action = Claude does it when run; note = just a reminder, closes once shown' },
        when: { type: 'string', description: 'ISO with offset/Z, "YYYY-MM-DD HH:MM" local, "YYYY-MM-DD" (09:00 local), "tomorrow 9:00", "fri 14:00" (next Friday), +2h, +1w or "someday" (no date); needed to save: when the user named none, call without it first to get the calendar, then ask' },
        text: { type: 'string', description: 'what to do when it is due' },
        slug: { type: 'string', description: 'short ascii file name part' },
        tz: { type: 'string', description: 'IANA zone for a local time; default the user zone' },
      },
      required: ['scope', 'kind', 'text', 'slug'],
    },
  },
  {
    name: 'update_reminder',
    description:
      'Change a reminder by id (file name, slug or unique prefix). Never run a due reminder unasked: offer it, then act on the answer. start: claim it before running its text (refused while another live session runs it; returns the text). done: after running (or after showing a note), result = one-line outcome. snooze: until = +2h, "tomorrow 9:00", a weekday "fri 14:00" (next such day, default 09:00), "YYYY-MM-DD HH:MM" or ISO; gives a someday item a date. cancel: drop it. reopen: bring a closed one back, until = optional new time. edit: change any of text, kind (action|note), when (a time in the snooze forms, or "someday" for no date), scope (the folder to MOVE it to; from_scope names where it is now); returns the old and new lines, show them, plus an Undo call and the old file: when the user says undo, make that call. scope (other actions) or from_scope only when the id exists in both project and global.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'reminder id from list_reminders or the offer' },
        action: { type: 'string', enum: ['start', 'done', 'snooze', 'cancel', 'edit', 'reopen'] },
        until: { type: 'string', description: 'snooze: the new time (+2h, "tomorrow 9:00", "fri 14:00", "YYYY-MM-DD HH:MM", ISO); reopen: optional new time' },
        result: { type: 'string', description: 'done only: one-line outcome' },
        text: { type: 'string', description: 'edit only: the new body' },
        kind: { type: 'string', enum: ['action', 'note'], description: 'edit only' },
        when: { type: 'string', description: 'edit only: a time (+2h, "tomorrow 9:00", "fri 14:00", "YYYY-MM-DD HH:MM", ISO), or "someday" for no date' },
        scope: { type: 'string', enum: ['project', 'global'], description: 'edit: the folder to move it to; other actions: only when the id exists in both' },
        from_scope: { type: 'string', enum: ['project', 'global'], description: 'only when the id exists in both (edit: where it is now)' },
      },
      required: ['id', 'action'],
    },
  },
] as const

// No guards around the mod's own logic: the engine skips a failing hook and the chain goes on; `$` is never passed on.
export const register: Register = (on, options) => {
  const check = validatePrefix(options.prefix)
  const prefix = check.prefix
  const notifyOn = options.notify !== false // userConfig `notify`, default on
  let lastNotify = '' // the last $.ui.notify result, one line for /remind help
  let hintTail = ''
  let known: Entry[] = [] // items of the last load: the highlight resolves against them (prompt.edit does no I/O)
  let hasTools = false
  // Settles with hasTools once session.start's registration ends: a /remind typed right after launch waits for it.
  let toolsSettled: (v: boolean) => void = () => undefined
  const toolsReady = new Promise<boolean>((resolve) => (toolsSettled = resolve))
  // The band/toast refresh of this session, set at session.start; `loaded` = items a hook just read (one numbering source).
  let refresh: ((loaded?: { items: Entry[]; t: number }) => Promise<void>) | null = null
  let shownKey = ''
  let seenDue: Set<string> | null = null
  let io: Io // set at session.start; `$` is never passed on, so the hooks share these closures
  let env: Env // static env; the project root is read per call (/cd, worktree)
  let interactive = false
  let stateSid = ''

  on('session.start', async ($, e, next) => {
    io = { exists: (p) => $.fs.exists(p), list: (p) => $.fs.list(p), read: (p) => $.fs.read(p), write: (p, t) => $.fs.write(p, t) }
    env = { cfg: await $.env.get('CLAUDE_CONFIG_DIR'), home: (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')), override: await $.env.get('REMIND_GLOBAL_DIR') }
    if (check.warning !== null) $.ui.toast(check.warning)
    const now = await $.clock.now()
    const sid = await $.session.id()
    // remind.mjs reads this file to tell a typed prompt from a headless one when the hook payload lacks `source`.
    interactive = e.isInteractive
    if (validSid(sid)) {
      stateSid = sid
      await $.fs.write(`${$.plugin.root}/.state/${sessionStateName(sid)}`, sessionStateJson(e.isInteractive, now)).catch(() => undefined)
    }
    await $.command
      .register({ name: 'remind', description: 'Show fired reminders, run, snooze, close or edit them, or say in any words what to remind you of', argumentHint: '[all | history | run|done|cancel|snooze|reopen|edit <N|id> | help | any words]' })
      .catch(() => undefined)
    try {
      for (const t of TOOLS) await $.tool.register({ name: t.name, description: t.description, inputSchema: t.inputSchema, isDeferred: false })
      hasTools = true
    } catch {
      // older build: /remind still lists and edits, only the hand-off needs the tools
    }
    toolsSettled(hasTools)
    if (e.isInteractive) {
      refresh = async (loaded) => {
        const t = loaded?.t ?? (await $.clock.now())
        const items = loaded?.items ?? (await loadAll(io, dirsOf(await $.session.root().catch(() => undefined), env), t))
        known = items
        const view = viewOf(items, t)
        const key = JSON.stringify(view)
        if (key !== shownKey) {
          shownKey = key
          await update($, viewAtom, () => view)
        }
        const due = items.filter((i) => i.state === 'due')
        if (seenDue === null) seenDue = new Set(due.map(itemKey))
        else {
          const fresh = due.filter((i) => !seenDue?.has(itemKey(i)))
          for (const i of fresh) seenDue.add(itemKey(i))
          if (fresh.length > 0) {
            const what = fresh.length === 1 ? `reminder fired: ${fresh[0]?.title || fresh[0]?.id}` : `${fresh.length} reminders fired`
            $.ui.toast(`${what} · ${prefix} to pick`, { timeoutMs: 8000 })
            if (notifyOn) {
              const r = await $.ui.notify(what, { title: 'Reminders' })
              lastNotify = r.isSent ? `sent via ${r.channel}${r.channel === 'terminal_bell' ? ' (bell only, no text)' : ''}` : `not sent (${r.reason})`
            }
          }
        }
      }
      await refresh().catch(() => undefined)
      $.clock.every(TICK_MS, () => {
        void refresh?.().catch(() => undefined)
      })
    }
    return next(e)
  })

  // /clear fires no session.start: refresh the state file under the new session id for remind.mjs.
  on('turn.complete', async ($, e, next) => {
    const sid = await $.session.id()
    if (validSid(sid) && sid !== stateSid) {
      stateSid = sid
      await $.fs.write(`${$.plugin.root}/.state/${sessionStateName(sid)}`, sessionStateJson(interactive, await $.clock.now())).catch(() => undefined)
    }
    return next(e)
  })

  // Picker: only a standalone `<prefix>` / `<prefix>?` / `<prefix><digits|name>` token (line start or after whitespace).
  // `<prefix>`: fired, someday, then the `<prefix>?` hint; `<prefix>?`: every reminder by state; non-runnable rows insert the token itself.
  on('prompt.autocomplete', { token: /^[^\w\s]{2}/ }, async ($, e, next) => {
    const r = await next(e)
    const want = e.token.startsWith(prefix) ? e.token.slice(prefix.length) : null
    const every = want === '?'
    if (want === null || !(every || /^[\w-]*$/.test(want)) || !(e.start === 0 || /\s/.test(e.text.charAt(e.start - 1)))) return r
    const now = await $.clock.now()
    const dirs = dirsOf(await $.session.root().catch(() => undefined), env)
    const all = await loadAll(io, dirs, now)
    known = all
    await refresh?.({ items: all, t: now }).catch(() => undefined)
    const hit = (i: Entry, n?: number): boolean => (isNum(want) ? n !== undefined && String(n).startsWith(want) : want === '' || every || `${i.id} ${i.title}`.toLowerCase().includes(want.toLowerCase()))
    const s = sections(all.map((item) => ({ item, state: item.state })))
    const where = (i: Entry): string => (i.global ? 'global' : 'project')
    // Same id open in both folders: the row token names its folder so the submit resolver picks that copy.
    const twin = (i: Entry): boolean => all.some((o) => o.id === i.id && o.global !== i.global && !isClosed(o))
    const fired = s.fired.flatMap((x, k) => (hit(x.item, k + 1) ? [{ i: x.item, n: k + 1 }] : []))
    const someday = isNum(want) ? [] : s.someday.map((x) => x.item).filter((i) => hit(i))
    const firedRows = fired.map(({ i, n }) => ({ text: `${prefix}${n}`, label: `${prefix}${n}  ${mark(i)} ${nameOf(i)}`, description: `${relative(i.due ?? now, now)} · ${where(i)}` }))
    const openRow = (i: Entry, when: string) => ({ text: `${prefix}${twin(i) ? `${where(i)}:` : ''}${i.id}`, label: `${mark(i)} ${nameOf(i)}`, description: `${when} · ${where(i)}` })
    const somedayRows = someday.map((i) => openRow(i, 'someday'))
    const none = { text: e.token, label: 'no reminders · ask Claude "remind me ..."' }
    const ignored = all.filter((i) => i.state === 'ignored').length
    if (every) {
      const div = (name: string, n: number) => ({ text: e.token, label: `── ${name} (${n}) ──` })
      const part = <T,>(name: string, rows: T[], n = rows.length): (T | { text: string; label: string })[] => (rows.length === 0 ? [] : [div(name, n), ...rows])
      const history = s.history.map((x) => x.item)
      const histRows = history.slice(0, HISTORY_PICK).map((i) => {
        const ms = closedAt(i)
        return { text: e.token, label: `${i.status === 'cancelled' ? '✗' : '✓'} ${mark(i)} ${nameOf(i)}`, description: `${closedLabel(i)} ${ms === null ? '?' : relative(ms, now)} · ${where(i)}` }
      })
      const more = history.length - histRows.length
      const bad = all.filter((i) => i.state === 'unparseable').sort(byDue)
      const rows = [
        ...part('fired', firedRows),
        ...part('running', s.running.map((x) => openRow(x.item, `running · ${relative(x.item.due ?? now, now)}`))),
        ...part('waiting', s.waiting.map((x) => openRow(x.item, relative(x.item.due ?? now, now)))),
        ...part('someday', somedayRows),
        ...part('unreadable', bad.map((i) => ({ text: e.token, label: `${mark(i)} ${nameOf(i)}`, description: `bad due "${i.dueRaw}" · ${where(i)}` }))),
        ...part('history', [...histRows, ...(more > 0 ? [{ text: e.token, label: `+${more} more · /remind history` }] : [])], history.length),
      ]
      const blank = ignored === 0 ? none : { text: e.token, label: `no open or closed reminders · ${ignored} file${ignored === 1 ? '' : 's'} with no known status` }
      return { suggestions: [...r.suggestions, ...(rows.length === 0 ? [blank] : rows)] }
    }
    const rows = [...firedRows, ...(fired.length > 0 && someday.length > 0 ? [{ text: e.token, label: '── someday ──' }] : []), ...somedayRows]
    if (want !== '') return rows.length === 0 ? r : { suggestions: [...r.suggestions, ...rows] }
    const nothing = all.length === ignored
    return { suggestions: [...r.suggestions, ...rows, ...(nothing ? [none] : []), { text: `${prefix}?`, label: `${prefix}?  all reminders · project + global` }] }
  })

  // Highlight tokens that would expand: the submit resolver over the last loaded items; no I/O. `**bold**`, `**2**` never match.
  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    const deco = tokensOf(r.text, prefix).flatMap(({ start, end, name }) => (runnable(known, name) === null ? [] : [{ start, end, bold: true, color: 'warning' as const }]))
    hintTail = deco.length > 0 ? `${prefix}N expands on Enter to "Run reminder ..."` : ''
    return deco.length === 0 ? r : { ...r, decorations: [...(r.decorations ?? []), ...deco] }
  })

  on('ui.render', { component: 'PromptHint' }, ($, e, next) => (hintTail === '' ? next(e) : next({ ...e, props: { ...e.props, tail: hintTail } })))

  // `<prefix>N` / `<prefix><id|slug|prefix>` tokens -> runPrompt blocks (the /remind run text, one per reminder), other words follow as extra words.
  on('prompt.submit', async ($, e, next) => {
    if (!TYPED_ORIGINS.has(e.origin.kind) || e.command !== undefined || e.isMeta !== undefined || !e.text.includes(prefix)) return next(e)
    // Terminal only: a bare `<prefix>` prints /remind all, `<prefix>?` also the newest closed (the picker's content); no turn.
    const bare = e.text.trim()
    if (e.origin.kind === 'composer' && (bare === prefix || bare === `${prefix}?`)) {
      const t = await $.clock.now()
      const dirs = dirsOf(await $.session.root().catch(() => undefined), env)
      // One log call per line: the terminal draws a newline inside one as a box glyph.
      for (const line of listText(await loadAll(io, dirs, t), t, tzOf(await $.env.get('TZ')), dirs, query(bare === prefix ? 'all' : 'every')).split('\n')) $.ui.log(line)
      // The engine puts a dropped prompt back in the box, before keys typed since or (live, 2.1.306) on a new line after them: strip only it.
      $.clock.after(50, () => {
        void (async () => {
          const box = (await $.prompt.read()).text
          const rest = box.startsWith(e.text) ? box.slice(e.text.length) : box.endsWith(`\n${e.text}`) ? box.slice(0, -(e.text.length + 1)) : null
          if (rest !== null) await $.prompt.fill({ text: rest, mode: 'replace' })
        })().catch(() => undefined)
      })
      return { drop: 'reminders listed above · no Claude turn' }
    }
    const tokens = tokensOf(e.text, prefix)
    if (tokens.length === 0) return next(e)
    const now = await $.clock.now()
    const sid = await $.session.id()
    const tz = tzOf(await $.env.get('TZ'))
    const all = await loadAll(io, dirsOf(await $.session.root().catch(() => undefined), env), now)
    known = all
    await refresh?.({ items: all, t: now }).catch(() => undefined)
    const blocks: string[] = []
    const seen = new Set<string>()
    const cut: Tok[] = []
    for (const t of tokens) {
      const hit = runnable(all, t.name)
      if (hit === null) continue
      const foreign = foreignClaim(hit, sid, now)
      if (foreign !== null) {
        $.ui.toast(`${hit.id} is already running in another session since ${formatWhen(foreign.at, tz, now)}`, { timeoutMs: 8000 })
        continue
      }
      cut.push(t)
      const key = `${hit.global ? 'global' : 'project'}:${hit.id}`
      if (seen.has(key)) continue
      seen.add(key)
      blocks.push(runPrompt(hit, bodyOf(await io.read(hit.path)), ''))
    }
    if (blocks.length === 0) return next(e)
    const extra = cut
      .reduceRight((s, t) => `${s.slice(0, t.start)}${s.slice(t.end)}`, e.text)
      .replace(/\s+/g, ' ')
      .trim()
    return next({ ...e, text: `${blocks.join('\n\n')}${extra === '' ? '' : `\nMy extra words: ${extra}`}` })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const view = await read($, viewAtom)
    if (e.props.hasSurvey || view.due === 0 || e.props.maxRows < 3) return next(e)
    const below = await next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const rows = view.rows.slice(0, Math.max(1, e.props.maxRows - 2))
    const more = view.due - rows.length
    const band = Box({
      key: 'band',
      flexDirection: 'column',
      children: [
        Text({ color: 'warning', bold: true, children: `reminders · ${view.due} fired` }),
        ...rows.map((r, k) =>
          Button({
            key: `r${k + 1}`,
            hotkey: String(k + 1),
            plain: true,
            onPress: () => {
              void $.prompt.fill({ text: `${prefix}${k + 1}`, mode: 'replace' }).catch(() => undefined)
            },
            label: r,
          }),
        ),
        Text({ dimColor: true, wrap: 'truncate-end', children: `press ${rows.length > 1 ? `1-${rows.length}` : '1'} then Enter to run · ${more > 0 ? `+${more} more · ` : ''}${prefix} to pick · ${prefix}? all · /remind snooze · done` }),
      ],
    })
    return below.type === 'engine' ? band : Box({ flexDirection: 'column', children: [below, band] })
  })

  on('command.run', { command: 'remind' }, async ($, e) => {
    const now = await $.clock.now()
    const tz = tzOf(await $.env.get('TZ'))
    const dirs = dirsOf(await $.session.root().catch(() => undefined), env)
    const tools = hasTools || (await Promise.race([toolsReady, new Promise<boolean>((resolve) => $.clock.after(3000, () => resolve(false)))]))
    const words = e.args.trim().split(/\s+/).filter((w) => w !== '')
    const [head = '', ...rest] = words
    const verb = head.toLowerCase()
    if (verb === 'help' && words.length === 1) return { text: HELP(dirs, tools, notifyOn ? `on, last ${lastNotify === '' ? 'none sent yet' : lastNotify}` : 'off (/config -> Reminder desktop alert)', prefix) }
    const shown =
      words.length === 0
        ? query('active')
        : verb === 'list' && words.length === 1
          ? query('all')
          : verb === 'show'
            ? parseShow(rest, now, tz)
            : verb === 'all' || verb === 'history' || verb === 'someday'
              ? parseShow(words, now, tz)
              : null
    if (shown !== null) return { text: listText(await loadAll(io, dirs, now), now, tz, dirs, shown) }
    let refused = ''
    let outbound: { text: string; ack: string } | null = null
    if (['run', 'done', 'cancel', 'snooze', 'reopen', 'edit'].includes(verb)) {
      const need = verb === 'snooze' || verb === 'edit' ? 1 : 0
      const usage = { text: `usage: /remind ${verb} [project|global] <${verb === 'reopen' ? 'id' : 'N|id'}>${verb === 'snooze' ? ' <when>' : verb === 'edit' ? ' <change>' : verb === 'reopen' ? ' [when]' : verb === 'run' ? ' [words]' : ''}` }
      if (rest.length === 0) return usage
      const word = rest[0]?.toLowerCase()
      const scoped = (word === 'project' || word === 'global') && rest.length >= 2 + need
      const [id = '', ...tail] = scoped ? rest.slice(1) : rest
      const scope = scoped ? word : undefined
      if (verb === 'reopen' && isNum(id)) return { text: 'reopen takes a name: /remind history lists the closed ones' }
      // free text that merely starts with a verb ("cancel the ...") goes to the model unless the id resolves
      const all = await loadAll(io, dirs, now)
      const found = (verb === 'done' || verb === 'cancel') && tail.length > 0 ? null : resolve(all, id, scope)
      if (typeof found === 'string') {
        if (!found.startsWith('no reminder matches')) return { text: found }
        refused = found
      } else if (found !== null) {
        if (need === 1 && tail.length === 0) return usage
        const sid = await $.session.id()
        const where = found.global ? 'global' : 'project'
        if (verb === 'run' || verb === 'edit') {
          if (!tools) return { text: NEEDS_TOOLS }
          if (found.state === 'done' || found.state === 'cancelled') return { text: `${found.id} is already ${found.state}; /remind reopen ${found.id} brings it back` }
          if (verb === 'run' && (found.state === 'unparseable' || found.state === 'ignored')) return { text: `${found.id} has an unreadable header; fix the file first` }
          const foreign = verb === 'run' ? foreignClaim(found, sid, now) : null
          if (foreign !== null) return { text: `${found.id} is already running in another session since ${formatWhen(foreign.at, tz, now)}` }
          outbound =
            verb === 'edit'
              ? { text: editHandoff(found, tail.join(' '), now, tz), ack: `Handing this edit to Claude: ${found.id}` }
              : { text: `${HANDOFF_MARK}run ${found.id}</request>\n${runPrompt(found, bodyOf(await io.read(found.path)), tail.join(' '))}`, ack: `Running ${nameOf(found)} (${found.kind}): handing it to Claude` }
        } else {
          const git = parseConfig(await io.read(dirs.config).catch(() => '')).git
          const out = await act(io, dirs, { req: { id: found.id, action: verb, until: tail.join(' '), scope: where }, sid, now, tz, by: 'user', git })
          await refresh?.().catch(() => undefined)
          return { text: out.text }
        }
      }
    }
    if (outbound === null) {
      const fixed = verb === 'global' ? 'global' : verb === 'project' || verb === 'default' ? 'project' : null
      const request = (fixed === null ? words : rest).join(' ')
      if (request === '') return { text: `usage: /remind ${verb} <what and when>` }
      if (!tools) return { text: refused === '' ? NEEDS_TOOLS : refused }
      outbound = { text: handoff(request, fixed, now, tz), ack: `Handing this to Claude: ${request}` }
    }
    const send = outbound.text
    // submit is refused inside command.run: hand off from a timer; fill is the fallback.
    $.clock.after(250, () => {
      void (async () => {
        try {
          await $.prompt.submit({ text: send, asUser: true })
        } catch {
          await $.prompt.fill({ text: send, mode: 'replace' }).catch(() => undefined)
        }
      })()
    })
    return { text: outbound.ack }
  }).catch((_$, _e, next) => ({ text: `failed: ${next.error.message ?? next.error.kind}` }))

  // The model's tools: answered here, so no permission prompt for the file writes.
  on('tool.call', { tool: /^mcp__brewmod-reminders__/ }, async ($, e) => {
    const now = await $.clock.now()
    const dirs = dirsOf(await $.session.root().catch(() => undefined), env)
    const tz = tzOf(await $.env.get('TZ'))
    const git = parseConfig(await io.read(dirs.config).catch(() => '')).git
    const input = e as unknown as Record<string, unknown>
    let out: Out
    if (e.tool === `${TOOL}list_reminders`) {
      const scope = str(input.scope)
      const state = STATE_WORDS.get(str(input.state) ?? 'all')
      const range = rangeOf(str(input.from), str(input.to), now, tz)
      out =
        state === undefined
          ? fail('state is active, all, someday or done')
          : !range.ok
            ? fail(range.error)
            : { text: listText(await loadAll(io, dirs, now), now, tz, dirs, query(state, { scope: scope === 'project' || scope === 'global' ? scope : undefined, from: range.from, to: range.to })) }
    } else if (e.tool === `${TOOL}add_reminder`) {
      out = await add(io, dirs, { scope: str(input.scope), when: str(input.when), text: str(input.text), slug: str(input.slug), tz: str(input.tz), kind: str(input.kind) }, now, tz, git)
    } else if (e.tool === `${TOOL}update_reminder`) {
      const req = { id: str(input.id) ?? '', action: str(input.action) ?? '', until: str(input.until), result: str(input.result), scope: str(input.scope), fromScope: str(input.from_scope), text: str(input.text), kind: str(input.kind), when: str(input.when) }
      out = await act(io, dirs, { req, sid: await $.session.id(), now, tz, by: 'model', git })
    } else out = fail(`unknown tool ${e.tool}`)
    if (e.tool !== `${TOOL}list_reminders`) await refresh?.().catch(() => undefined)
    return { result: out.text, ...out }
  }).catch((_$, _e, next) => {
    const text = `failed: ${next.error.message ?? next.error.kind}`
    return { result: text, text, isError: true }
  })
}
