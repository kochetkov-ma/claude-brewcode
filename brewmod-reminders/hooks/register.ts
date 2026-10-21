// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import {
  CLAIMS_DIR, HANDOFF_MARK, buildItem, claimJson, claimLive, claimName, classify, formatWhen, isItemName, isoZ, itemKey, itemName, matchId, parseClaim, parseConfig,
  parseItem, parseWhenNatural, patchHeader, relative, sessionStateJson, sessionStateName, slugify, systemTz, validSid,
  type Claim, type Item, type State,
} from './lib/items.mjs'

// The band reads this view; the atom is declared in this file only (the scan reads it).
const viewAtom = atom({ plugin: 'brewmod-reminders', key: 'view' } as const, { due: 0, open: 0, rows: [], more: 0 })

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
type View = { due: number; open: number; rows: { text: string; isDue: boolean }[]; more: number }

// override = REMIND_GLOBAL_DIR: the global folder itself (live tests; unset in normal use).
const dirsOf = (root: string | undefined, cfg: string | undefined, home: string | undefined, override?: string): Dirs => ({
  project: `${root ?? '.'}/.claude/scheduled`,
  global: override !== undefined && override !== '' ? override : cfg !== undefined && cfg !== '' ? `${cfg}/reminders` : home !== undefined && home !== '' ? `${home}/.claude/reminders` : null,
  config: `${root ?? '.'}/.claude/reminders.json`,
})
const fail = (text: string): Out => ({ text, isError: true })
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const tzOf = (fromEnv: string | undefined): string => {
  const tz = fromEnv !== undefined && fromEnv !== '' ? fromEnv : systemTz()
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
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

function viewOf(items: Entry[], now: number): View {
  const open = items.filter((i) => i.state === 'due' || i.state === 'pending' || i.state === 'running').sort(byDue)
  const rows = open.slice(0, BAND_ROWS).map((i) => ({
    text: `${i.title === '' ? i.id : i.title}  ${relative(i.due ?? now, now)}${i.state === 'running' ? ' · running' : ''}${i.global ? ' (global)' : ''}`,
    isDue: i.state === 'due',
  }))
  return { due: open.filter((i) => i.state === 'due').length, open: open.length, rows, more: open.length - rows.length }
}

function listText(items: Entry[], now: number, tz: string, dirs: Dirs): string {
  const line = (i: Entry, tail: string): string => `${tag(i)} | ${i.due === null ? `bad due "${i.dueRaw}" (UTC with Z needed)` : formatWhen(i.due, tz, now)} | ${i.title}${tail}`
  const part = (state: State, label: string, tail: (i: Entry) => string = () => '', rows: Entry[] = items.filter((i) => i.state === state).sort(byDue)): string[] =>
    rows.length === 0 ? [] : [`${label} (${rows.length}):`, ...rows.map((i) => `- ${line(i, tail(i))}`)]
  const finished = (state: State): Entry[] =>
    items.filter((i) => i.state === state).sort((a, b) => (state === 'done' ? b.done : b.cancelled).localeCompare(state === 'done' ? a.done : a.cancelled)).slice(0, DONE_SHOWN)
  const out = [
    ...part('due', 'Due'),
    ...part('running', 'Running', (i) => ` | running in session ${i.claim?.session ?? '?'} since ${i.claim === null ? '?' : formatWhen(i.claim.at, tz, now)}`),
    ...part('pending', 'Pending'),
    ...part('unparseable', 'Unreadable'),
    ...part('done', `Done (last ${DONE_SHOWN})`, (i) => ` | done ${i.done}${i.result === '' ? '' : ` | ${i.result}`}`, finished('done')),
    ...part('cancelled', `Cancelled (last ${DONE_SHOWN})`, () => '', finished('cancelled')),
  ]
  const where = `project ${dirs.project} | global ${dirs.global ?? 'unavailable'}`
  return out.length === 0 ? `No reminders. ${where}` : [`Now: ${formatWhen(now, tz, now).replace(/, now$/, '')}`, ...out, where].join('\n')
}

const gitNote = (mode: string, i: { global: boolean; path: string }): string =>
  i.global || mode === 'off' ? '' : `\nGit: commit only ${i.path}${mode === 'commit-push' ? ' and push' : ' (no push)'} following the repo's conventions; stage nothing else.`

// Picks one item: a scope filter, id/slug/prefix match per scope; null error text means found.
function pick(items: Entry[], id: string, scope: string | undefined): Entry | string {
  const scopes = scope === 'project' ? [false] : scope === 'global' ? [true] : [false, true]
  const hits = scopes.map((g) => ({ g, m: matchId(items.filter((i) => i.global === g).map((i) => i.id), id) }))
  const found = hits.flatMap((h) => ('id' in h.m ? [{ g: h.g, id: h.m.id }] : []))
  if (found.length > 1) return `"${id}" exists in project and global: pass scope`
  const [one] = found
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
  const foreign = claimLive(e.claim, now) && e.claim !== null && e.claim.session !== sid
  if (foreign && a.by === 'model') return fail(`${e.id} is running in session ${e.claim?.session} since ${e.claim === null ? '?' : formatWhen(e.claim.at, tz, now)}; do not run it or change it, tell the user`)
  if (req.action === 'start') {
    if (e.state === 'unparseable') return fail(`${e.id} has an unreadable due line; fix the header first`)
    const lost = await claimTo(io, e, sid, now)
    return lost ?? { text: `started ${tag(e)}; carry out the text below, then update_reminder {id, action:"done", result}.\n${await io.read(e.path)}` }
  }
  const text = await io.read(e.path)
  let patch: Record<string, string | null>
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
  const tz = tzOf(a.tz ?? localTz)
  const w = parseWhenNatural(a.when ?? '', now, tz)
  if (!w.ok) return fail(w.error)
  const slug = slugify(a.slug !== undefined && a.slug !== '' ? a.slug : text)
  let name = itemName(w.ms, slug)
  for (let n = 2; n < 20 && (await io.exists(`${dir}/${name}`)); n++) name = itemName(w.ms, `${slug}-${n}`)
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

const HELP = (dirs: Dirs, hasTools: boolean): string =>
  [
    '/remind                      list: due, running, pending, last done (no Claude turn)',
    '/remind done|cancel <id>     mark an item (id = file name, slug or unique prefix; no Claude turn)',
    '/remind snooze <id> <when>   +2h | +1d | tomorrow 9:00 | today 17:30 | 2026-10-22 09:00 (your local zone; no Claude turn)',
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
    `Use the ${TOOL}* tools. To add: add_reminder without confirm first (preview, writes nothing), show me its time line, ONE AskUserQuestion confirming the time (plus the scope when not given), then add_reminder with confirm:true. To look or change: list_reminders, update_reminder.`,
  ].join('\n')

const TOOLS = [
  {
    name: 'list_reminders',
    description:
      "List the user's durable reminders: files in this project's .claude/scheduled and the global ~/.claude/reminders. Shows due, running, pending, unreadable and the last done/cancelled with ids and times in the user's zone. Call it before answering a question about reminders or when an id for update_reminder is unclear.",
    inputSchema: { type: 'object', properties: { scope: { type: 'string', enum: ['project', 'global'], description: 'omit for both' } } },
  },
  {
    name: 'add_reminder',
    description:
      "Add a durable reminder: a file that survives sessions and is offered at the first prompt of a later session once due. Unlike CronCreate or /loop (session-only), use it for 'remind me tomorrow 9:00 to check prod'. Without confirm it only returns a preview and writes nothing. For a plain-prompt request with no explicit scope (project, global, here, everywhere): preview with scope project, then ask ONE AskUserQuestion holding the scope (Project (Recommended) / Global) and the time confirmation from the preview line, then call again with confirm:true. text: what to do when due, in the user's words, self-contained. slug: 2-5 lowercase ASCII words. when: ISO with offset or Z, local 'YYYY-MM-DD HH:MM' in the user's zone (or tz), 'today|tomorrow HH:MM', or +<n>m|h|d; a past time is rejected. Take the date and zone from the Now line of the helper text or the current date.",
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['project', 'global'], description: 'required: project (this repo) or global (all projects)' },
        when: { type: 'string', description: 'ISO with offset/Z, "YYYY-MM-DD HH:MM" local, "tomorrow 9:00", or +2h' },
        text: { type: 'string', description: 'what to do when it is due' },
        slug: { type: 'string', description: 'short ascii file name part' },
        tz: { type: 'string', description: 'IANA zone for a local time; default the user zone' },
        confirm: { type: 'boolean', description: 'true only after the user confirmed the preview' },
      },
      required: ['scope', 'when', 'text', 'slug'],
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

  on('session.start', async ($, e, next) => {
    const now = await $.clock.now()
    const sid = await $.session.id()
    // remind.mjs reads this file to tell a typed prompt from a headless one when the hook payload lacks `source`.
    if (validSid(sid)) await $.fs.write(`${$.plugin.root}/.state/${sessionStateName(sid)}`, sessionStateJson(e.isInteractive, now)).catch(() => undefined)
    await $.command
      .register({ name: 'remind', description: 'List durable reminders, mark them done, snooze or cancel, or say in any words what to remind you of', argumentHint: '[done|cancel <id> | snooze <id> <when> | help | any words]' })
      .catch(() => undefined)
    try {
      for (const t of TOOLS) await $.tool.register({ name: t.name, description: t.description, inputSchema: t.inputSchema, isDeferred: false })
      hasTools = true
    } catch {
      hasTools = false
    }
    if (e.isInteractive) {
      const io: Io = { exists: (p) => $.fs.exists(p), list: (p) => $.fs.list(p), read: (p) => $.fs.read(p), write: (p, t) => $.fs.write(p, t) }
      const dirs = dirsOf(await $.session.root().catch(() => undefined), await $.env.get('CLAUDE_CONFIG_DIR'), (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')), await $.env.get('REMIND_GLOBAL_DIR'))
      refresh = async () => {
        const t = await $.clock.now()
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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const view = await read($, viewAtom)
    if (e.props.hasSurvey || view.open === 0 || e.props.maxRows < 3) return next(e)
    const below = await next(e)
    const { Box, Text } = $.ui.resolve(e)
    const rows = view.rows.slice(0, Math.max(1, e.props.maxRows - 2))
    const more = view.open - rows.length
    const band = Box({
      key: 'band',
      flexDirection: 'column',
      children: [
        Text({ color: view.due > 0 ? 'warning' : 'text', bold: true, children: `reminders · ${view.due} due · ${view.open - view.due} upcoming` }),
        ...rows.map((r) => Text({ color: r.isDue ? 'warning' : 'text', wrap: 'truncate-end', children: `  ${r.text}` })),
        Text({ dimColor: true, wrap: 'truncate-end', children: `${more > 0 ? `+${more} more · ` : ''}/remind  list · done · snooze · or say what to add` }),
      ],
    })
    return below.type === 'engine' ? band : Box({ flexDirection: 'column', children: [below, band] })
  })

  on('command.run', { command: 'remind' }, async ($, e) => {
    const io: Io = { exists: (p) => $.fs.exists(p), list: (p) => $.fs.list(p), read: (p) => $.fs.read(p), write: (p, t) => $.fs.write(p, t) }
    const dirs = dirsOf(await $.session.root().catch(() => undefined), await $.env.get('CLAUDE_CONFIG_DIR'), (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')), await $.env.get('REMIND_GLOBAL_DIR'))
    const now = await $.clock.now()
    const tz = tzOf(await $.env.get('TZ'))
    const words = e.args.trim().split(/\s+/).filter((w) => w !== '')
    const [head = '', ...rest] = words
    const verb = head.toLowerCase()
    if (verb === 'help') return { text: HELP(dirs, hasTools) }
    if (verb === '' || verb === 'list') return { text: listText(await loadAll(io, dirs, now), now, tz, dirs) }
    if (verb === 'done' || verb === 'cancel' || verb === 'snooze') {
      const [id = '', ...tail] = rest
      if (id === '' || (verb === 'snooze' && tail.length === 0)) return { text: `usage: /remind ${verb} <id>${verb === 'snooze' ? ' <when>' : ''}` }
      const git = parseConfig(await io.read(dirs.config).catch(() => '')).git
      const out = await act(io, dirs, { req: { id, action: verb, until: tail.join(' ') }, sid: await $.session.id(), now, tz, by: 'user', git })
      await refresh?.().catch(() => undefined)
      return { text: out.text }
    }
    const fixed = verb === 'global' ? 'global' : verb === 'project' || verb === 'default' ? 'project' : null
    const request = (fixed === null ? words : rest).join(' ')
    if (request === '') return { text: `usage: /remind ${verb} <what and when>` }
    if (!hasTools) return { text: NEEDS_TOOLS }
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
    const io: Io = { exists: (p) => $.fs.exists(p), list: (p) => $.fs.list(p), read: (p) => $.fs.read(p), write: (p, t) => $.fs.write(p, t) }
    const dirs = dirsOf(await $.session.root().catch(() => undefined), await $.env.get('CLAUDE_CONFIG_DIR'), (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')), await $.env.get('REMIND_GLOBAL_DIR'))
    const now = await $.clock.now()
    const tz = tzOf(await $.env.get('TZ'))
    const git = parseConfig(await io.read(dirs.config).catch(() => '')).git
    const input = e as unknown as Record<string, unknown>
    let out: Out
    if (e.tool === `${TOOL}list_reminders`) {
      const scope = str(input.scope)
      const all = await loadAll(io, dirs, now)
      out = { text: listText(scope === 'project' ? all.filter((i) => !i.global) : scope === 'global' ? all.filter((i) => i.global) : all, now, tz, dirs) }
    } else if (e.tool === `${TOOL}add_reminder`) {
      out = await add(io, dirs, { scope: str(input.scope), when: str(input.when), text: str(input.text), slug: str(input.slug), tz: str(input.tz), confirm: input.confirm === true }, now, tz, git)
    } else if (e.tool === `${TOOL}update_reminder`) {
      out = await act(io, dirs, { req: { id: str(input.id) ?? '', action: str(input.action) ?? '', until: str(input.until), result: str(input.result), scope: str(input.scope) }, sid: await $.session.id(), now, tz, by: 'model', git })
    } else out = fail(`unknown tool ${e.tool}`)
    if (e.tool !== `${TOOL}list_reminders`) await refresh?.().catch(() => undefined)
    return out.isError === true ? { result: out.text, text: out.text, isError: true } : { result: out.text, text: out.text }
  }).catch((_$, _e, next) => {
    const text = `failed: ${next.error.message ?? next.error.kind}`
    return { result: text, text, isError: true }
  })
}
