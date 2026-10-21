// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

// Pure reminder core for hooks/remind.mjs and register.ts: strings + `now` in, values out, no IO.

// Items: <dir>/<YYYYMMDD-HHMM>_<slug>.md, header until the first blank line, id = basename without .md.
// State: .state/session-<sid>.json {isInteractive,ts} (module writes), .state/offered-<sid>.json {offered:{key:ts}}.

const CLAIM_TTL_MS = 6 * 3600 * 1000
const LATE_MS = 24 * 3600 * 1000
export const STATE_TTL_MS = 7 * 24 * 3600 * 1000
export const CLAIMS_DIR = '.claims'
const SID_RE = /^[A-Za-z0-9_-]+$/
const BOM = '\uFEFF'
const MAX_MS = Date.UTC(9999, 11, 31, 23, 59, 59)
const GIT_MODES = ['off', 'commit', 'commit-push']
export const STATE_NAME_RE = /^(session|offered)-[A-Za-z0-9_-]+\.json(\.\d+\.tmp)?$/

export const validSid = (sid) => typeof sid === 'string' && SID_RE.test(sid)
export const sessionStateName = (sid) => `session-${sid}.json`
export const offeredStateName = (sid) => `offered-${sid}.json`
export const claimName = (id) => `${id}.json`
export const itemKey = (item) => `${item.global ? 'g' : 'p'}:${item.id}:${item.dueRaw}`
export const tagOf = (item) => `${item.id}${item.global ? ' (global)' : ''}`
export const slugOf = (id) => id.replace(/^[^_]*_/, '').toLowerCase()
export const isItemName = (name) => /\.md$/i.test(name) && !name.startsWith('.') && name.toLowerCase() !== 'readme.md'

const pad = (n, w = 2) => String(n).padStart(w, '0')
export const isoZ = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const parseJson = (text) => {
  try {
    const v = JSON.parse(text)
    return isObject(v) ? v : null
  } catch {
    return null
  }
}

// ---- state files

export const sessionStateJson = (isInteractive, now) => JSON.stringify({ isInteractive: isInteractive === true, ts: now })
export function parseSessionState(text) {
  const v = parseJson(text)
  return v && typeof v.isInteractive === 'boolean' ? { isInteractive: v.isInteractive } : null
}
export const offeredJson = (offered, last) => JSON.stringify({ offered, last })
export function parseOffered(text) {
  const o = parseJson(text)?.offered
  return isObject(o) ? o : {}
}
// ms of the last offer: `last`, else the newest mark of an older file, else null (never offered).
export function parseLastOffer(text) {
  const v = parseJson(text)
  if (typeof v?.last === 'number') return v.last
  const marks = Object.values(isObject(v?.offered) ? v.offered : {}).filter((x) => typeof x === 'number')
  return marks.length > 0 ? Math.max(...marks) : null
}
// Plugin option from a command hook's env (a number as text); unusable -> dflt. min = lowest accepted.
export function optNumber(raw, dflt, min = 0) {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
  return Number.isFinite(n) && n >= min ? n : dflt
}
// An offer goes out on the first prompt, when an item or unreadable file is new since the last offer, or when due items wait and the cooldown passed.
export function offerNow({ last, hasNew, hasDue, now, cooldownMs }) {
  return last === null ? hasDue || hasNew : hasNew || (hasDue && now - last >= cooldownMs)
}

// ---- header and item

function headerRange(lines) {
  const fenced = lines[0].replace(/^﻿/, '').trim() === '---'
  const start = fenced ? 1 : 0
  let end = start
  while (end < lines.length && lines[end].trim() !== '' && !(fenced && lines[end].trim() === '---')) end++
  return { start, end, close: fenced && lines[end]?.trim() === '---' }
}
// Lines (kept with the first EOL style) and header range of a file's text; the BOM is set aside.
function splitText(text) {
  const bom = text.startsWith(BOM) ? BOM : ''
  const parts = text.slice(bom.length).split(/(\r?\n)/)
  const lines = parts.filter((_, i) => i % 2 === 0)
  return { bom, parts, lines, eol: parts[1] ?? '\n', r: headerRange(lines) }
}
const KEY_RE = /^([A-Za-z][\w-]*):[ \t]*(.*?)[ \t]*$/

// Strict stored form: UTC with Z; a naive time is unparseable on purpose.
function parseDueZ(raw) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?Z$/.exec(raw ?? '')
  if (!m) return null
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))
  const d = new Date(ms)
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[4] < 24 && +m[5] < 60 && +(m[6] ?? 0) < 60 ? ms : null
}

// -> { id, name, due (ms|null), dueRaw, someday, kind ('action'|'note'), status, created, done, cancelled, result, title }; header keys only, first wins.
// `due: none` = someday (no date, never fires); `kind: note` = read-and-close, anything else = action.
export function parseItem(name, text) {
  const lines = String(text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/)
  const { start, end, close } = headerRange(lines)
  const h = {}
  for (let i = start; i < end; i++) {
    const m = KEY_RE.exec(lines[i])
    if (m && !(m[1].toLowerCase() in h)) h[m[1].toLowerCase()] = m[2]
  }
  const first = lines.slice(end + (close ? 1 : 0)).find((l) => l.trim() !== '') ?? ''
  return {
    id: name.replace(/\.md$/i, ''),
    name,
    due: parseDueZ(h.due),
    dueRaw: h.due ?? '',
    someday: (h.due ?? '').toLowerCase() === 'none',
    kind: (h.kind ?? '').toLowerCase() === 'note' ? 'note' : 'action',
    status: (h.status ?? '').toLowerCase(),
    created: h.created ?? '',
    done: h.done ?? '',
    cancelled: h.cancelled ?? '',
    result: h.result ?? '',
    title: first.replace(/^[#>*\-\s]+/, '').trim().slice(0, 80),
  }
}

// Rewrites header keys only (value null removes the key); a leading BOM and everything from the blank line on stay byte for byte.
export function patchHeader(text, patch) {
  const { bom, parts, lines, eol, r } = splitText(text)
  const head = lines.slice(0, r.end)
  for (const [key, value] of Object.entries(patch)) {
    const idx = head.findIndex((l, i) => i >= r.start && KEY_RE.exec(l)?.[1].toLowerCase() === key)
    if (value === null) {
      if (idx >= 0) head.splice(idx, 1)
    } else if (idx >= 0) head[idx] = `${key}: ${value}`
    else head.push(`${key}: ${value}`)
  }
  return bom + head.join(eol) + (head.length > 0 && r.end < lines.length ? eol : '') + parts.slice(2 * r.end).join('')
}

// dueMs null = someday (`due: none`); kind omitted = no `kind:` line (reads as action).
export function buildItem({ dueMs, text, now, kind }) {
  const k = kind === 'note' || kind === 'action' ? `kind: ${kind}\n` : ''
  return `due: ${dueMs === null || dueMs === undefined ? 'none' : isoZ(dueMs)}\nstatus: pending\n${k}created: ${isoZ(now)}\n\n${String(text).trim()}\n`
}

// The body text (after the header and its fence), trimmed.
export function bodyOf(text) {
  const lines = String(text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/)
  const r = headerRange(lines)
  return lines.slice(r.end + (r.close ? 1 : 0)).join('\n').trim()
}

// Replaces the body (everything after the header, fence included), header bytes and BOM untouched.
export function patchBody(text, body) {
  const { bom, lines, eol, r } = splitText(text)
  const head = lines.slice(0, r.end + (r.close ? 1 : 0))
  const b = String(body).trim()
  return bom + (head.length === 0 ? '' : head.join(eol) + eol + (r.close ? '' : eol)) + b + eol
}

// Edit one item file: text/kind/dueMs (number = date, null = someday, undefined = keep); a date or someday also sets status pending.
export function editText(text, { text: body, kind, dueMs }) {
  const patch = {}
  if (kind === 'note' || kind === 'action') patch.kind = kind
  if (dueMs !== undefined) Object.assign(patch, datePatch(dueMs))
  const withHead = Object.keys(patch).length > 0 ? patchHeader(text, patch) : text
  return body === undefined ? withHead : patchBody(withHead, body)
}

// Header patches: snooze/give a date (null = park as someday; a someday item becomes normal), bring a closed item back.
export const datePatch = (ms) => ({ due: ms === null ? 'none' : isoZ(ms), status: 'pending' })
export const reopenPatch = (ms) => ({ ...(ms === undefined || ms === null ? {} : { due: isoZ(ms) }), status: 'pending', done: null, cancelled: null, result: null })
export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'reminder'
}
// Someday names `someday_<slug>.md` never start with digits, so they cannot collide with dated names.
export function itemName(dueMs, slug) {
  if (dueMs === null || dueMs === undefined) return `someday_${slugify(slug)}.md`
  const d = new Date(dueMs)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}_${slugify(slug)}.md`
}

// ---- claims

export const claimJson = (session, now) => JSON.stringify({ session, at: now })
export function parseClaim(text) {
  const v = parseJson(text)
  return v && typeof v.session === 'string' && typeof v.at === 'number' ? { session: v.session, at: v.at } : null
}
export const claimLive = (claim, now) => claim !== null && claim !== undefined && now - claim.at < CLAIM_TTL_MS && claim.at <= now + 60000

// -> 'due' | 'pending' | 'running' | 'someday' | 'done' | 'cancelled' | 'unparseable' (pending, bad due) | 'ignored' (no/unknown status)
export function classify(item, claim, now) {
  if (item.status === 'done') return 'done'
  if (item.status === 'cancelled') return 'cancelled'
  if (item.status !== 'pending') return 'ignored'
  if (item.due === null) return item.someday ? 'someday' : 'unparseable'
  if (claimLive(claim, now)) return 'running'
  return item.due <= now ? 'due' : 'pending'
}

// ---- sections, history, cleanup

export const closedAt = (item) => {
  const ms = Date.parse(item.status === 'cancelled' ? item.cancelled : item.done)
  return Number.isNaN(ms) ? null : ms
}
// 'shown' (closed note) | 'done' | 'cancelled' | '' (not closed)
export const closedLabel = (item) => (item.status === 'cancelled' ? 'cancelled' : item.status === 'done' ? (item.kind === 'note' ? 'shown' : 'done') : '')

// rows [{ item, state }] -> { fired, running, waiting, someday, history }; fired/running/waiting by due, someday by created, history newest closed first.
export function sections(rows) {
  const out = { fired: [], running: [], waiting: [], someday: [], history: [] }
  const into = { due: 'fired', running: 'running', pending: 'waiting', someday: 'someday', done: 'history', cancelled: 'history' }
  for (const r of rows) if (into[r.state]) out[into[r.state]].push(r)
  const byId = (a, b) => (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0)
  for (const k of ['fired', 'running', 'waiting']) out[k].sort((a, b) => a.item.due - b.item.due || byId(a, b))
  out.someday.sort((a, b) => (a.item.created < b.item.created ? -1 : a.item.created > b.item.created ? 1 : byId(a, b)))
  out.history.sort((a, b) => (closedAt(b.item) ?? -Infinity) - (closedAt(a.item) ?? -Infinity) || byId(a, b))
  return out
}

// items -> ids of done/cancelled items closed more than keepDays ago (invalid keepDays -> 30); no readable close time = kept; never pending/someday.
export function expiredIds(items, now, keepDays) {
  const days = Number.isFinite(keepDays) && keepDays > 0 ? keepDays : 30
  return items.filter((i) => (i.status === 'done' || i.status === 'cancelled') && closedAt(i) !== null && now - closedAt(i) > days * 86400000).map((i) => i.id)
}

// -> { ok:true, ms } | { ok:false, error }; offset/Z ISO, local `YYYY-MM-DD[ HH:MM[:SS]]` in tz (date only = 00:00), or +<n>m|h|d|w; no past check.
function parseTime(input, now, tz) {
  const s = String(input ?? '').trim()
  let ms = null
  const rel = /^\+(\d+)([mhdw])$/.exec(s)
  if (rel) ms = now + +rel[1] * { m: 60000, h: 3600000, d: 86400000, w: 7 * 86400000 }[rel[2]]
  else {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/.exec(s)
    if (!m) return { ok: false, error: `unrecognised time "${s}": use ISO with offset/Z, "YYYY-MM-DD HH:MM", "YYYY-MM-DD" (00:00 local) or +<n>m|h|d|w` }
    const [y, mo, d, h, mi, sec] = [+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)]
    const naive = Date.UTC(y, mo - 1, d, h, mi, sec)
    const nd = new Date(naive)
    if (nd.getUTCMonth() !== mo - 1 || nd.getUTCDate() !== d || h > 23 || mi > 59 || sec > 59) return { ok: false, error: `invalid date/time "${s}"` }
    if (m[7] === 'Z') ms = naive
    else if (m[7]) {
      const o = /^([+-])(\d{2}):?(\d{2})?$/.exec(m[7])
      ms = naive - (o[1] === '-' ? -1 : 1) * (+o[2] * 60 + +(o[3] ?? 0)) * 60000
    } else {
      try {
        ms = zonedToUtc(naive, tz)
      } catch {
        return { ok: false, error: `unknown time zone "${tz}"` }
      }
      if (ms === null) return { ok: false, error: `"${s}" does not exist in ${tz} (DST gap)` }
    }
  }
  if (!(ms <= MAX_MS)) return { ok: false, error: `"${s}" is out of range` }
  return { ok: true, ms: Math.floor(ms / 1000) * 1000 }
}

// -> { ok:true, ms, iso } | { ok:false, error }; parseTime, a past time rejected.
export function parseWhen(input, now, tz) {
  const t = parseTime(input, now, tz)
  return !t.ok ? t : t.ms <= now ? { ok: false, error: `${isoZ(t.ms)} is in the past` } : { ok: true, ms: t.ms, iso: isoZ(t.ms) }
}

// Start of the local day `add` days from ms's day in tz (a DST-gap midnight reads as 01:00 minus 1 h).
function dayStart(ms, tz, add = 0) {
  const p = zoneParts(ms, tz, 'numeric')
  const naive = Date.UTC(+p.year, +p.month - 1, +p.day + add)
  return zonedToUtc(naive, tz) ?? zonedToUtc(naive + 3600000, tz) - 3600000
}
const DOW = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

// today|tomorrow|week|+Nd|+Nw|until YYYY-MM-DD -> { from, to } (to exclusive, local days in tz) | null when not a window word.
export function windowOf(input, now, tz) {
  const s = String(input ?? '').trim().toLowerCase()
  if (s === 'today') return { from: dayStart(now, tz), to: dayStart(now, tz, 1) }
  if (s === 'tomorrow') return { from: dayStart(now, tz, 1), to: dayStart(now, tz, 2) }
  if (s === 'week') return { from: now, to: dayStart(now, tz, 8 - DOW[zoneParts(now, tz).weekday]) }
  const n = /^\+(\d+)([dw])$/.exec(s)
  if (n) return { from: now, to: now + +n[1] * (n[2] === 'w' ? 7 : 1) * 86400000 }
  const u = /^until\s+(\d{4}-\d{2}-\d{2})$/.exec(s)
  const day = u ? parseTime(u[1], now, tz) : null
  return day?.ok ? { from: now, to: dayStart(day.ms, tz, 1) } : null
}

// list_reminders from/to (ISO, date, or a window word; a date-only `to` runs through that day) -> { ok:true, from, to } (-/+Infinity when absent) | { ok:false, error }.
export function rangeOf(from, to, now, tz) {
  const side = (v, key, dflt) => {
    if (v === undefined || String(v).trim() === '') return { ok: true, ms: dflt }
    const w = windowOf(v, now, tz)
    if (w) return { ok: true, ms: w[key] }
    const t = parseTime(v, now, tz)
    return !t.ok ? t : { ok: true, ms: key === 'to' && /^\d{4}-\d{2}-\d{2}$/.test(String(v).trim()) ? dayStart(t.ms, tz, 1) : t.ms }
  }
  const a = side(from, 'from', -Infinity)
  const lone = (to === undefined || String(to).trim() === '') && from !== undefined ? windowOf(from, now, tz) : null // a window word alone sets both ends
  const b = lone ? { ok: true, ms: lone.to } : side(to, 'to', Infinity)
  return !a.ok ? a : !b.ok ? b : { ok: true, from: a.ms, to: b.ms }
}

// parseWhen plus `today|tomorrow H[:MM]` as wall time in tz (date-only: 00:00 local).
export function parseWhenNatural(input, now, tz) {
  const s = String(input ?? '').trim()
  const m = /^(today|tomorrow)\s+(\d{1,2})(?::(\d{2}))?$/i.exec(s)
  if (!m) return parseWhen(s, now, tz)
  let p
  try {
    p = zoneParts(now, tz, 'numeric')
  } catch {
    return { ok: false, error: `unknown time zone "${tz}"` }
  }
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + (m[1].toLowerCase() === 'tomorrow' ? 1 : 0)))
  return parseWhen(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(+m[2])}:${m[3] ?? '00'}`, now, tz)
}

function zoneParts(ms, tz, month = 'short') {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', weekday: 'short', year: 'numeric', month, day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const p = {}
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value
  return p
}
function offsetMs(ms, tz) {
  const p = zoneParts(ms, tz, 'numeric')
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000
}
// wall-clock fields (as UTC ms) in tz -> real UTC ms; null when the wall time falls in a DST gap
function zonedToUtc(naive, tz) {
  let t = naive - offsetMs(naive, tz)
  t = naive - offsetMs(t, tz)
  return offsetMs(t, tz) + t === naive ? t : null
}

export const systemTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

function span(ms) {
  const a = Math.abs(ms)
  if (a < 3600000) return `${Math.max(1, Math.round(a / 60000))} min`
  if (a < 48 * 3600000) return `${Math.round(a / 3600000)} h`
  return `${Math.round(a / 86400000)} d`
}
// 'now' only for due (past or equal); an upcoming item under a minute away reads 'in <1 min'.
export const relative = (ms, now) =>
  ms > now ? (ms - now < 60000 ? 'in <1 min' : `in ${span(ms - now)}`) : now - ms < 60000 ? 'now' : `${span(now - ms)} ago`

// "Thu 22 Oct 09:00 Lisbon (08:00 UTC), in 18 h"; UTC date added when it differs from the local date.
export function formatWhen(ms, tz, now) {
  const p = zoneParts(ms, tz)
  const u = new Date(ms)
  const uHm = `${pad(u.getUTCHours())}:${pad(u.getUTCMinutes())}`
  const local = `${p.weekday} ${p.day} ${p.month} ${p.hour}:${p.minute}`
  const rel = relative(ms, now)
  if (tz === 'UTC' || tz === 'Etc/UTC') return `${local} UTC, ${rel}`
  const city = tz.split('/').pop().replace(/_/g, ' ')
  const mo = zoneParts(ms, 'UTC')
  const sameDay = mo.day === p.day && mo.month === p.month
  return `${local} ${city} (${sameDay ? '' : `${mo.day} ${mo.month} `}${uHm} UTC), ${rel}`
}

// ---- matching and gating

// exact id | exact slug | unique prefix of id or slug -> { id } | { error: 'none'|'ambiguous', candidates }
export function matchId(ids, query) {
  const q = String(query ?? '').trim().toLowerCase().replace(/\.md$/, '')
  const pick = (c) => (c.length === 1 ? { id: c[0] } : c.length === 0 ? { error: 'none', candidates: [] } : { error: 'ambiguous', candidates: c })
  if (q === '') return { error: 'none', candidates: [] }
  const exact = ids.filter((id) => id.toLowerCase() === q)
  if (exact.length === 1) return { id: exact[0] }
  const bySlug = ids.filter((id) => slugOf(id) === q)
  if (bySlug.length === 1) return { id: bySlug[0] }
  return pick(ids.filter((id) => id.toLowerCase().startsWith(q) || slugOf(id).startsWith(q)))
}

// First line of the /remind hand-off prompt (register.ts builds it); the offer skips that turn.
export const HANDOFF_MARK = 'Reminder helper. My request: <request>'
// First words of a `**N` expansion (register.ts runPrompt): that turn already carries the reminder.
export const RUN_MARK = 'Run reminder '

// Offer only on a real typed prompt: source user, or source absent and the module saw an interactive session.
export function shouldOffer(payload, sessionState) {
  if (!payload || !validSid(payload.session_id) || payload.agent_id !== undefined) return false
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trimStart() : null
  if (prompt !== null && (/^\/[^\s/]+(\s|$)/.test(prompt) || prompt.startsWith(HANDOFF_MARK) || prompt.startsWith(RUN_MARK))) return false
  if (payload.source === 'user') return true
  return payload.source === undefined && sessionState?.isInteractive === true
}

export function parseConfig(text) {
  const v = parseJson(text)
  return { git: v && GIT_MODES.includes(v.git) ? v.git : 'off' }
}

// ---- offer text

// args: { due:[{id,global,path,due,title,kind,body}], bad:[{id,global,path}], now, tz, git, legacy }
export function buildOffer({ due, bad, now, tz, git, legacy }) {
  const out = []
  const notes = due.filter((i) => i.kind === 'note')
  const actions = due.filter((i) => i.kind !== 'note')
  if (due.length > 0) {
    out.push(`Reminders are due (${due.length}), stored as files:`)
    for (const i of [...due].sort((a, b) => a.due - b.due)) {
      const late = now - i.due > LATE_MS ? ` | OVERDUE by ${span(now - i.due)}` : ''
      out.push(`- ${tagOf(i)} | due ${formatWhen(i.due, tz, now)}${late} | ${i.kind === 'note' ? '✎ note' : '▶ action'} | ${i.title} | ${i.path}`)
      if (i.kind === 'note') out.push(...String(i.body ?? '').split('\n').map((l) => `  | ${l}`))
    }
    out.push("Start your reply with ONE line, in the user's language, saying what fired, before anything else; then continue with the steps below and answer their prompt as usual.")
    if (actions.length > 0) {
      out.push('Actions: tell the user in one line, in their language, what fired and offer for each: run now, snooze, mark done, or cancel. Never run one unasked. Say plainly when one is more than 24 h late.')
    }
    if (notes.length > 0) {
      out.push('Notes (kind note, text above after "|"): show each note\'s full text to the user now, say it was just a reminder (nothing to execute), then call update_reminder {id, action:"done"} for it without asking, then answer their prompt as usual.')
    }
    out.push(
      'Run accepted: update_reminder {id, action:"start"}, read the file, carry out its body, then update_reminder {id, action:"done", result}. Snooze: {id, action:"snooze", until}; cancel: {id, action:"cancel"}.',
      'update_reminder unavailable -> edit the file header: `status: done` plus `done: <UTC now, YYYY-MM-DDTHH:MM:SSZ>` (cancel: `status: cancelled` plus `cancelled: <UTC>`); never touch the body.',
    )
    if (git !== 'off') {
      out.push(`Git: after changing an item file, commit only that file${git === 'commit-push' ? ' and push' : ' (no push)'} following the repo's conventions; never stage anything else.`)
    }
  }
  if (bad.length > 0) {
    out.push(`Unreadable reminder files (${bad.length}); the \`due:\` line must be UTC ending in Z (YYYY-MM-DDTHH:MM:SSZ). Tell the user and offer to fix:`)
    for (const i of bad) out.push(`- ${tagOf(i)} | ${i.path}`)
  }
  if (legacy) out.push('Legacy: .claude/settings.json still registers the old due-checks.sh hook; tell the user to remove it, brewmod-reminders replaces it.')
  return out.join('\n')
}
