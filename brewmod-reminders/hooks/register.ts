// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import {
  CLAIMS_DIR, HANDOFF_MARK, buildItem, claimJson, claimLive, claimName, classify, formatWhen, isItemName, isoZ, itemKey, itemName, matchId, parseClaim, parseConfig,
  parseItem, parseWhenNatural, patchHeader, rangeOf, relative, sessionStateJson, sessionStateName, slugify, systemTz, validSid, windowOf,
  type Claim, type Item, type State,
} from './lib/items.mjs'
import type { ReminderView } from '../types'

// The band reads this view; the atom is declared in this file only (the scan reads it).
const viewAtom = atom({ plugin: 'brewmod-reminders', key: 'view' } as const, { due: 0, rows: [] })

const TICK_MS = 60_000
const BAND_ROWS = 3
const DONE_SHOWN = 10
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
type Out = { text: string; isError?: true }

// override = REMIND_GLOBAL_DIR: the global folder itself (live tests; unset in normal use).
const dirsOf = (root: string | undefined, cfg: string | undefined, home: string | undefined, override?: string): Dirs => ({
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

const byDue = (a: Entry, b: Entry): number => (a.due ?? 0) - (b.due ?? 0) || a.id.localeCompare(b.id)
const tag = (i: Entry): string => `${i.id}${i.global ? ' (global)' : ''}`

// The band lists due items only: pending (upcoming) and running (claimed by a live session) never show.
function viewOf(items: Entry[], now: number): ReminderView {
  const due = items.filter((i) => i.state === 'due').sort(byDue)
  return { due: due.length, rows: due.map((i) => `${i.title === '' ? i.id : i.title}  ${relative(i.due ?? now, now)}${i.global ? ' (global)' : ''}`).slice(0, BAND_ROWS) }
}

type Query = { state: 'active' | 'all' | 'done'; scope?: 'project' | 'global'; from: number; to: number }
const STATES = ['active', 'all', 'done'] as const
const query = (state: Query['state'], rest: Partial<Query> = {}): Query => ({ state, from: -Infinity, to: Infinity, ...rest })

// `show` words after the verb: [active|all|done] [project|global] [window]; null when anything is left over (-> free text).
function parseShow(words: string[], now: number, tz: string): Query | null {
  const w = words.map((x) => x.toLowerCase())
  const state = STATES.find((s) => s === w[0])
  const at = state === undefined ? 0 : 1
  const scope = w[at] === 'project' || w[at] === 'global' ? w[at] : undefined
  const rest = w.slice(at + (scope === undefined ? 0 : 1)).join(' ')
  const win = rest === '' ? { from: -Infinity, to: Infinity } : windowOf(rest, now, tz)
  return win === null ? null : query(state ?? 'active', { scope: scope as Query['scope'], ...win })
}

function listText(all: Entry[], now: number, tz: string, dirs: Dirs, q: Query): string {
  const items = all.filter((i) => (q.scope === undefined || i.global === (q.scope === 'global')) && (!(q.from > -Infinity || q.to < Infinity) || (i.due !== null && i.due >= q.from && i.due < q.to)))
  const line = (i: Entry, tail: string): string => `${tag(i)} | ${i.due === null ? `bad due "${i.dueRaw}" (UTC with Z needed)` : formatWhen(i.due, tz, now)} | ${i.title}${tail}`
  const part = (label: string, rows: Entry[], tail: (i: Entry) => string = () => ''): string[] => (rows.length === 0 ? [] : [`${label} (${rows.length}):`, ...rows.map((i) => `- ${line(i, tail(i))}`)])
  const finished = (state: State): Entry[] =>
    items.filter((i) => i.state === state).sort((a, b) => (state === 'done' ? b.done : b.cancelled).localeCompare(state === 'done' ? a.done : a.cancelled)).slice(0, DONE_SHOWN)
  const running = (i: Entry): string => (i.state === 'running' ? ` | running in session ${i.claim?.session ?? '?'} since ${i.claim === null ? '?' : formatWhen(i.claim.at, tz, now)}` : '')
  const open = (...states: State[]): Entry[] => items.filter((i) => states.includes(i.state)).sort(byDue)
  const out =
    q.state === 'done'
      ? [...part(`Done (last ${DONE_SHOWN})`, finished('done'), (i) => ` | done ${i.done}${i.result === '' ? '' : ` | ${i.result}`}`), ...part(`Cancelled (last ${DONE_SHOWN})`, finished('cancelled'))]
      : q.state === 'active'
        ? part('Active', open('due'))
        : [...part('Open', open('due', 'running', 'pending'), running), ...part('Unreadable', open('unparseable'))]
  const where = `project ${dirs.project} | global ${dirs.global ?? 'unavailable'}`
  const none = q.state === 'active' ? 'No active reminders (none due); /remind show all lists the upcoming ones.' : `No ${q.state === 'done' ? 'finished' : 'open'} reminders.`
  return out.length === 0 ? `${none} ${where}` : [`Now: ${formatWhen(now, tz, now).replace(/, now$/, '')}`, ...out, where].join('\n')
}

const gitNote = (mode: string, i: { global: boolean; path: string }): string =>
  i.global || mode === 'off' ? '' : `\nGit: commit only ${i.path}${mode === 'commit-push' ? ' and push' : ' (no push)'} following the repo's conventions; stage nothing else.`

// One item by id/slug/prefix within the scope filter; a string is the refusal text.
function pick(items: Entry[], id: string, scope: string | undefined): Entry | string {
  const scopes = scope === 'project' ? [false] : scope === 'global' ? [true] : [false, true]
  const hits = scopes.map((g) => ({ g, m: matchId(items.filter((i) => i.global === g).map((i) => i.id), id) }))
  const found = hits.flatMap((h) => ('id' in h.m ? [{ g: h.g, id: h.m.id }] : []))
  const q = id.trim().toLowerCase().replace(/\.md$/, '')
  const exact = found.filter((f) => f.id.toLowerCase() === q || f.id.replace(/^[^_]*_/, '').toLowerCase() === q)
  const hit = found.length > 1 && exact.length === 1 ? exact : found
  if (hit.length > 1) return `"${id}" exists in project and global: pass scope`
  const [one] = hit
  if (one !== undefined) return items.find((i) => i.global === one.g && i.id === one.id) as Entry
  const bad = hits.flatMap((h) => ('candidates' in h.m ? h.m.candidates : []))
  return bad.length > 0 ? `"${id}" is ambiguous: ${bad.join(', ')}` : `no reminder matches "${id}"; /remind list shows the ids`
}

async function claimTo(io: Io, e: Entry, sid: string, now: number): Promise<Out | null> {
  const file = `${e.dir}/${CLAIMS_DIR}/${claimName(e.id)}`
  if (!(await io.exists(`${e.dir}/${CLAIMS_DIR}/.gitignore`).catch(() => false))) await io.write(`${e.dir}/${CLAIMS_DIR}/.gitignore`, '*\n')
  await io.write(file, claimJson(sid, now))
  const back = parseClaim(await io.read(file).catch(() => ''))
  return back !== null && back.session === sid ? null : fail(`${e.id} is running in session ${back?.session ?? '?'}; do not run it, tell the user`)
}

type Act = { id: string; action: string; until?: string; result?: string; scope?: string }

// start | done | snooze | cancel; the model is refused on a live foreign claim, the person (by: 'user') is not.
async function act(io: Io, dirs: Dirs, a: { req: Act; sid: string; now: number; tz: string; by: 'model' | 'user'; git: string }): Promise<Out> {
  const { req, sid, now, tz } = a
  if (!['start', 'done', 'snooze', 'cancel'].includes(req.action)) return fail(`unknown action "${req.action}": start, done, snooze or cancel`)
  if (req.scope !== undefined && req.scope !== 'project' && req.scope !== 'global') return fail('scope is project or global')
  const found = pick(await loadAll(io, dirs, now), req.id, req.scope)
  if (typeof found === 'string') return fail(found)
  const e = found
  if (e.state === 'done' || e.state === 'cancelled') return fail(`${e.id} is already ${e.state}`)
  if (e.state === 'ignored') return fail(`${e.id} has no status header; add \`status: pending\` and \`due:\` first`)
  const foreign = claimLive(e.claim, now) && e.claim !== null && e.claim.session !== sid
  if (foreign && a.by === 'model') return fail(`${e.id} is running in session ${e.claim?.session} since ${e.claim === null ? '?' : formatWhen(e.claim.at, tz, now)}; do not run it or change it, tell the user`)
  if (req.action === 'start') {
    if (e.state === 'unparseable') return fail(`${e.id} has an unreadable due line; fix the header first`)
    const lost = await claimTo(io, e, sid, now)
    return lost ?? { text: `started ${tag(e)}; carry out the text below, then update_reminder {id, action:"done", result}.\n${await io.read(e.path)}` }
  }
  const text = await io.read(e.path)
  let patch: Record<string, string>
  if (req.action === 'done') {
    const result = oneLine(req.result ?? '', 400)
    patch = { status: 'done', done: isoZ(now), ...(result === '' ? {} : { result }) }
  } else if (req.action === 'cancel') patch = { status: 'cancelled', cancelled: isoZ(now) }
  else {
    const w = parseWhenNatural(req.until ?? '', now, tz)
    if (!w.ok) return fail(w.error)
    patch = { due: w.iso, status: 'pending' }
  }
  await io.write(e.path, patchHeader(text, patch))
  if (e.claim !== null) await io.write(`${e.dir}/${CLAIMS_DIR}/${claimName(e.id)}`, '')
  const label = e.title === '' ? e.id : e.title
  const said =
    req.action === 'snooze' ? `snoozed: ${label} (${tag(e)}) until ${patch.due}` : `${req.action === 'done' ? 'done' : 'cancelled'}: ${label} (${tag(e)})`
  return { text: `${said}${gitNote(a.git, e)}` }
}

type Add = { scope?: string; when?: string; text?: string; slug?: string; tz?: string; confirm?: boolean }

async function add(io: Io, dirs: Dirs, a: Add, now: number, localTz: string, git: string): Promise<Out> {
  if (a.scope !== 'project' && a.scope !== 'global') return fail('scope is required: project or global')
  const dir = a.scope === 'project' ? dirs.project : dirs.global
  if (dir === null) return fail('the global reminders folder is unavailable (no home directory)')
  const text = (a.text ?? '').trim()
  if (text === '') return fail('text is required')
  if ((a.when ?? '').trim() === '') return fail(`when is required: nothing is saved without a trigger time. ${WHEN_RULE}`)
  const tz = a.tz !== undefined && a.tz !== '' ? a.tz : localTz
  if (!validTz(tz)) return fail(`unknown time zone "${tz}"`)
  const w = parseWhenNatural(a.when ?? '', now, tz)
  if (!w.ok) return fail(w.error)
  const slug = slugify(a.slug !== undefined && a.slug !== '' ? a.slug : text)
  let name = itemName(w.ms, slug)
  for (let n = 2; n <= 99 && (await io.exists(`${dir}/${name}`)); n++) name = itemName(w.ms, `${slug.slice(0, 40 - `-${n}`.length)}-${n}`)
  if (await io.exists(`${dir}/${name}`)) return fail(`no free file name for "${slug}" at that time; use another slug`)
  const id = name.replace(/\.md$/, '')
  const when = formatWhen(w.ms, tz, now)
  if (a.confirm !== true) {
    return {
      text: `Preview, nothing written: ${when} | ${a.scope} | ${id}\n${text}\nShow the user this time line, get their confirmation with ONE AskUserQuestion (add "Where to save?" with Project (Recommended) / Global when they gave no scope), then call add_reminder again with confirm:true and the final scope, time and text.`,
    }
  }
  const path = `${dir}/${name}`
  await io.write(path, buildItem({ dueMs: w.ms, text, now }))
  return { text: `saved ${id} (${a.scope}) | due ${when} | ${path}${gitNote(git, { global: a.scope === 'global', path })}` }
}

const WHEN_RULE =
  'If the request names no time, ask the user ONE AskUserQuestion "When should it fire?" with 2-4 options you derive from this reminder\'s own context (e.g. post-deploy prod check: tonight 23:00 / tomorrow 09:00 / in 1 week; renew a domain: in 2 weeks / in 1 month; check nightly-run logs: tonight / tomorrow morning), each label showing its concrete local time, the best fit marked "(Recommended)"; free text stays available through Other; no fixed list. A scope question may share that AskUserQuestion as a second question. An answer like "in 1 week" becomes a date-only when (YYYY-MM-DD, fires 00:00 local that day).'

const HELP = (dirs: Dirs, hasTools: boolean): string =>
  [
    '/remind                      = show active: the items that fired (due), no Claude turn',
    '/remind show active|all|done [project|global] [today|tomorrow|week|+Nd|until YYYY-MM-DD]   all = every open item by time; done = done and cancelled; the window filters by trigger time (week = until Sunday 23:59, local)',
    '/remind list                 = show all',
    '/remind done|cancel [project|global] <id>   mark an item (id = file name, slug or unique prefix; no Claude turn)',
    '/remind snooze [project|global] <id> <when>   +2h | +1d | tomorrow 9:00 | today 17:30 | 2026-10-22 09:00 (your local zone; no Claude turn)',
    '/remind <words>              add or ask in your words: /remind check prod tomorrow 9:00',
    '/remind project|global <words>   same with the folder fixed (default project; Claude asks when unsure)',
    `Items: ${dirs.project}/<YYYYMMDD-HHMM>_<slug>.md (project), ${dirs.global ?? '~/.claude/reminders'}/ (global); header due (UTC, Z), status, body = the task.`,
    'A due item is offered at your first prompt of a session; nothing runs unasked.',
    ...(hasTools ? [] : [NEEDS_TOOLS]),
  ].join('\n')

const handoff = (request: string, scope: string | null, now: number, tz: string): string =>
  [
    `${HANDOFF_MARK}${request}</request>`,
    `Now: ${formatWhen(now, tz, now).replace(/, now$/, '')}, time zone ${tz}, UTC ${isoZ(now)}. Times I give without a zone are in ${tz}.`,
    `Scope: ${scope ?? 'not given; ask "Where to save?" in the same dialog, Project (Recommended) / Global'}.`,
    `Use the ${TOOL}* tools. To add: add_reminder without confirm first (preview, writes nothing), show me its time line, ONE AskUserQuestion confirming the time (plus the scope when not given), then add_reminder with confirm:true. Every reminder needs a trigger time. ${WHEN_RULE} My pick of a time is the confirmation: then call add_reminder with confirm:true directly. To look or change: list_reminders (state active|all|done, from/to), update_reminder.`,
  ].join('\n')

const TOOLS = [
  {
    name: 'list_reminders',
    description:
      "List the user's durable reminders: files in this project's .claude/scheduled and the global ~/.claude/reminders, with ids and times in the user's zone. state: active = fired (due) only, all (default) = every open one by trigger time (due, running, pending), done = done and cancelled. from/to filter by trigger time, so 'reminders that fire this week in this project' = scope project, from 'week' (or from 'week' alone: now until Sunday 23:59). Call it before answering a question about reminders or when an id for update_reminder is unclear.",
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['project', 'global'], description: 'omit for both' },
        state: { type: 'string', enum: ['active', 'all', 'done'], description: 'default all' },
        from: { type: 'string', description: 'earliest trigger: ISO, "YYYY-MM-DD" (00:00 local) or today|tomorrow|week|+Nd|until YYYY-MM-DD (the window start)' },
        to: { type: 'string', description: 'latest trigger, exclusive: ISO, "YYYY-MM-DD" (through that day) or a window word (the window end)' },
      },
    },
  },
  {
    name: 'add_reminder',
    description:
      "Add a durable reminder: a file that survives sessions and is offered at the first prompt of a later session once due. Unlike CronCreate or /loop (session-only), use it for 'remind me tomorrow 9:00 to check prod'. Without confirm it only returns a preview and writes nothing. Every reminder MUST have a trigger time: when the request names none, do not call this tool yet. ${WHEN_RULE} For a plain-prompt request with no explicit scope (project, global, here, everywhere): preview with scope project, then ask ONE AskUserQuestion holding the scope (Project (Recommended) / Global) and the time confirmation from the preview line, then call again with confirm:true. text: what to do when due, in the user's words, self-contained. slug: 2-5 lowercase ASCII words. when: ISO with offset or Z, local 'YYYY-MM-DD HH:MM' in the user's zone (or tz), 'YYYY-MM-DD' (00:00 local), 'today|tomorrow HH:MM', or +<n>m|h|d|w; a past time is rejected. Take the date and zone from the Now line of the helper text or the current date.",
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['project', 'global'], description: 'required: project (this repo) or global (all projects)' },
        when: { type: 'string', description: 'ISO with offset/Z, "YYYY-MM-DD HH:MM" local, "YYYY-MM-DD" (00:00 local), "tomorrow 9:00", +2h or +1w; required: ask the user when they named none' },
        text: { type: 'string', description: 'what to do when it is due' },
        slug: { type: 'string', description: 'short ascii file name part' },
        tz: { type: 'string', description: 'IANA zone for a local time; default the user zone' },
        confirm: { type: 'boolean', description: 'true only after the user confirmed the preview' },
      },
      required: ['scope', 'text', 'slug'],
    },
  },
  {
    name: 'update_reminder',
    description:
      'Change a reminder by id (file name, slug or unique prefix). Never run a due reminder unasked: offer it, then act on the answer. start: claim it before running its text (refused while another live session runs it; returns the text). done: after running, result = one-line outcome. snooze: until = +2h, "tomorrow 9:00", "YYYY-MM-DD HH:MM" or ISO. cancel: drop it. scope only when the id exists in both project and global.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'reminder id from list_reminders or the offer' },
        action: { type: 'string', enum: ['start', 'done', 'snooze', 'cancel'] },
        until: { type: 'string', description: 'snooze only: the new time' },
        result: { type: 'string', description: 'done only: one-line outcome' },
        scope: { type: 'string', enum: ['project', 'global'], description: 'only when the id exists in both' },
      },
      required: ['id', 'action'],
    },
  },
] as const

// No guards around the mod's own logic: the engine skips a failing hook and the chain goes on; `$` is never passed on.
export const register: Register = (on) => {
  let hasTools = false
  let refresh: (() => Promise<void>) | null = null // the band/toast refresh of this session, set at session.start
  let shownKey = ''
  let seenDue: Set<string> | null = null
  let io: Io // set at session.start; `$` is never passed on, so the hooks share these closures
  let env: { cfg: string | undefined; home: string | undefined; override: string | undefined } // static env; the project root is read per call (/cd, worktree)
  let interactive = false
  let stateSid = ''

  on('session.start', async ($, e, next) => {
    const now = await $.clock.now()
    const sid = await $.session.id()
    // remind.mjs reads this file to tell a typed prompt from a headless one when the hook payload lacks `source`.
    interactive = e.isInteractive
    if (validSid(sid)) stateSid = sid
    if (validSid(sid)) await $.fs.write(`${$.plugin.root}/.state/${sessionStateName(sid)}`, sessionStateJson(e.isInteractive, now)).catch(() => undefined)
    await $.command
      .register({ name: 'remind', description: 'List durable reminders, mark them done, snooze or cancel, or say in any words what to remind you of', argumentHint: '[done|cancel <id> | snooze <id> <when> | help | any words]' })
      .catch(() => undefined)
    try {
      for (const t of TOOLS) await $.tool.register({ name: t.name, description: t.description, inputSchema: t.inputSchema, isDeferred: false })
      hasTools = true
    } catch {
      // older build: /remind still lists and edits, only the hand-off needs the tools
    }
    io = { exists: (p) => $.fs.exists(p), list: (p) => $.fs.list(p), read: (p) => $.fs.read(p), write: (p, t) => $.fs.write(p, t) }
    env = { cfg: await $.env.get('CLAUDE_CONFIG_DIR'), home: (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')), override: await $.env.get('REMIND_GLOBAL_DIR') }
    if (e.isInteractive) {
      refresh = async () => {
        const t = await $.clock.now()
        const dirs = dirsOf(await $.session.root().catch(() => undefined), env.cfg, env.home, env.override)
        const items = await loadAll(io, dirs, t)
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
          if (fresh.length > 0) $.ui.toast(fresh.length === 1 ? `reminder due: ${fresh[0]?.title || fresh[0]?.id} · /remind` : `${fresh.length} reminders due · /remind`, { timeoutMs: 8000 })
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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const view = await read($, viewAtom)
    if (e.props.hasSurvey || view.due === 0 || e.props.maxRows < 3) return next(e)
    const below = await next(e)
    const { Box, Text } = $.ui.resolve(e)
    const rows = view.rows.slice(0, Math.max(1, e.props.maxRows - 2))
    const more = view.due - rows.length
    const band = Box({
      key: 'band',
      flexDirection: 'column',
      children: [
        Text({ color: 'warning', bold: true, children: `reminders · ${view.due} due` }),
        ...rows.map((r) => Text({ color: 'warning', wrap: 'truncate-end', children: `  ${r}` })),
        Text({ dimColor: true, wrap: 'truncate-end', children: `${more > 0 ? `+${more} more · ` : ''}/remind  list · done · snooze` }),
      ],
    })
    return below.type === 'engine' ? band : Box({ flexDirection: 'column', children: [below, band] })
  })

  on('command.run', { command: 'remind' }, async ($, e) => {
    const now = await $.clock.now()
    const tz = tzOf(await $.env.get('TZ'))
    const dirs = dirsOf(await $.session.root().catch(() => undefined), env.cfg, env.home, env.override)
    const words = e.args.trim().split(/\s+/).filter((w) => w !== '')
    const [head = '', ...rest] = words
    const verb = head.toLowerCase()
    if (verb === 'help' && words.length === 1) return { text: HELP(dirs, hasTools) }
    const shown = words.length === 0 ? query('active') : verb === 'list' && words.length === 1 ? query('all') : verb === 'show' ? parseShow(rest, now, tz) : null
    if (shown !== null) return { text: listText(await loadAll(io, dirs, now), now, tz, dirs, shown) }
    let refused = ''
    if (verb === 'done' || verb === 'cancel' || verb === 'snooze') {
      const usage = { text: `usage: /remind ${verb} [project|global] <id>${verb === 'snooze' ? ' <when>' : ''}` }
      if (rest.length === 0) return usage
      const word = rest[0]?.toLowerCase()
      const scoped = (word === 'project' || word === 'global') && rest.length >= (verb === 'snooze' ? 3 : 2)
      const [id = '', ...tail] = scoped ? rest.slice(1) : rest
      const scope = scoped ? word : undefined
      // free text that merely starts with a verb ("cancel the ...") goes to the model unless the id resolves
      const found = verb !== 'snooze' && tail.length > 0 ? null : pick(await loadAll(io, dirs, now), id, scope)
      if (typeof found === 'string') {
        if (!found.startsWith('no reminder matches')) return { text: found }
        refused = found
      } else if (found !== null) {
        if (verb === 'snooze' && tail.length === 0) return usage
        const git = parseConfig(await io.read(dirs.config).catch(() => '')).git
        const out = await act(io, dirs, { req: { id, action: verb, until: tail.join(' '), scope }, sid: await $.session.id(), now, tz, by: 'user', git })
        await refresh?.().catch(() => undefined)
        return { text: out.text }
      }
    }
    const fixed = verb === 'global' ? 'global' : verb === 'project' || verb === 'default' ? 'project' : null
    const request = (fixed === null ? words : rest).join(' ')
    if (request === '') return { text: `usage: /remind ${verb} <what and when>` }
    if (!hasTools) return { text: refused === '' ? NEEDS_TOOLS : refused }
    const text = handoff(request, fixed, now, tz)
    // submit is refused inside command.run: hand off from a timer; fill is the fallback.
    $.clock.after(250, () => {
      void (async () => {
        try {
          await $.prompt.submit({ text, asUser: true })
        } catch {
          await $.prompt.fill({ text, mode: 'replace' }).catch(() => undefined)
        }
      })()
    })
    return { text: `Handing this to Claude: ${request}` }
  }).catch((_$, _e, next) => ({ text: `failed: ${next.error.message ?? next.error.kind}` }))

  // The model's tools: answered here, so no permission prompt for the file writes.
  on('tool.call', { tool: /^mcp__brewmod-reminders__/ }, async ($, e) => {
    const now = await $.clock.now()
    const dirs = dirsOf(await $.session.root().catch(() => undefined), env.cfg, env.home, env.override)
    const tz = tzOf(await $.env.get('TZ'))
    const git = parseConfig(await io.read(dirs.config).catch(() => '')).git
    const input = e as unknown as Record<string, unknown>
    let out: Out
    if (e.tool === `${TOOL}list_reminders`) {
      const scope = str(input.scope)
      const state = STATES.find((s) => s === (str(input.state) ?? 'all'))
      const range = rangeOf(str(input.from), str(input.to), now, tz)
      out = state === undefined ? fail('state is active, all or done') : !range.ok ? fail(range.error) : { text: listText(await loadAll(io, dirs, now), now, tz, dirs, query(state, { scope: scope === 'project' || scope === 'global' ? scope : undefined, from: range.from, to: range.to })) }
    } else if (e.tool === `${TOOL}add_reminder`) {
      out = await add(io, dirs, { scope: str(input.scope), when: str(input.when), text: str(input.text), slug: str(input.slug), tz: str(input.tz), confirm: input.confirm === true }, now, tz, git)
    } else if (e.tool === `${TOOL}update_reminder`) {
      out = await act(io, dirs, { req: { id: str(input.id) ?? '', action: str(input.action) ?? '', until: str(input.until), result: str(input.result), scope: str(input.scope) }, sid: await $.session.id(), now, tz, by: 'model', git })
    } else out = fail(`unknown tool ${e.tool}`)
    if (e.tool !== `${TOOL}list_reminders`) await refresh?.().catch(() => undefined)
    return { result: out.text, ...out }
  }).catch((_$, _e, next) => {
    const text = `failed: ${next.error.message ?? next.error.kind}`
    return { result: text, text, isError: true }
  })
}
