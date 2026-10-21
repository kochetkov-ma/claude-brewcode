// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

// Pure reminder core for hooks/remind.mjs and register.ts: strings + `now` in, values out, no IO.
// API: parseItem classify parseWhen formatWhen relative patchHeader buildItem itemName matchId claim* shouldOffer buildOffer.

// Items: <dir>/<YYYYMMDD-HHMM>_<slug>.md, header until the first blank line, id = basename without .md.
// State: .state/session-<sid>.json {isInteractive,ts} (module writes), .state/offered-<sid>.json {offered:{key:ts}}.

export const CLAIM_TTL_MS = 6 * 3600 * 1000
export const LATE_MS = 24 * 3600 * 1000
export const STATE_TTL_MS = 7 * 24 * 3600 * 1000
export const CLAIMS_DIR = '.claims'
export const SID_RE = /^[A-Za-z0-9_-]+$/
export const GIT_MODES = ['off', 'commit', 'commit-push']
export const STATE_NAME_RE = /^(session|offered)-[A-Za-z0-9_-]+\.json(\.\d+\.tmp)?$/

export const validSid = (sid) => typeof sid === 'string' && SID_RE.test(sid)
export const sessionStateName = (sid) => `session-${sid}.json`
export const offeredStateName = (sid) => `offered-${sid}.json`
export const claimName = (id) => `${id}.json`
export const itemKey = (item) => `${item.global ? 'g' : 'p'}:${item.id}`
export const isItemName = (name) => /\.md$/i.test(name) && !name.startsWith('.') && name.toLowerCase() !== 'readme.md'

const pad = (n, w = 2) => String(n).padStart(w, '0')
const isoZ = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
const parseJson = (text) => {
  try {
    const v = JSON.parse(text)
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null
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
export const offeredJson = (offered) => JSON.stringify({ offered })
export function parseOffered(text) {
  const v = parseJson(text)
  const o = v && parseJsonObject(v.offered)
  return o ?? {}
}
const parseJsonObject = (o) => (o !== null && typeof o === 'object' && !Array.isArray(o) ? o : null)

// ---- header and item

function headerRange(lines) {
  const fenced = lines[0].replace(/^﻿/, '').trim() === '---'
  const start = fenced ? 1 : 0
  let end = start
  while (end < lines.length && lines[end].trim() !== '' && !(fenced && lines[end].trim() === '---')) end++
  return { start, end, fenced }
}
const KEY_RE = /^([A-Za-z][\w-]*):[ \t]*(.*?)[ \t]*$/

// Strict stored form: UTC with Z; a naive time is unparseable on purpose.
export function parseDueZ(raw) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?Z$/.exec(raw ?? '')
  if (!m) return null
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))
  const d = new Date(ms)
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[4] < 24 && +m[5] < 60 && +(m[6] ?? 0) < 60 ? ms : null
}

// -> { id, name, due (ms|null), dueRaw, status, created, done, cancelled, result, title }; header keys only, first wins.
export function parseItem(name, text) {
  const lines = String(text ?? '').split(/\r?\n/)
  const { start, end, fenced } = headerRange(lines)
  const h = {}
  for (let i = start; i < end; i++) {
    const m = KEY_RE.exec(lines[i])
    if (m && !(m[1].toLowerCase() in h)) h[m[1].toLowerCase()] = m[2]
  }
  const body = lines.slice(fenced && lines[end]?.trim() === '---' ? end + 1 : end)
  const first = body.find((l) => l.trim() !== '') ?? ''
  return {
    id: name.replace(/\.md$/i, ''),
    name,
    due: parseDueZ(h.due),
    dueRaw: h.due ?? '',
    status: (h.status ?? '').toLowerCase(),
    created: h.created ?? '',
    done: h.done ?? '',
    cancelled: h.cancelled ?? '',
    result: h.result ?? '',
    title: first.replace(/^[#>*\-\s]+/, '').trim().slice(0, 80),
  }
}

// Rewrites header keys (value null removes); body bytes and EOL style untouched.
export function patchHeader(text, patch) {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const r = headerRange(lines)
  let end = r.end
  for (const [key, value] of Object.entries(patch)) {
    const idx = lines.findIndex((l, i) => i >= r.start && i < end && KEY_RE.exec(l)?.[1].toLowerCase() === key)
    if (idx >= 0 && value === null) {
      lines.splice(idx, 1)
      end--
    } else if (idx >= 0) lines[idx] = `${key}: ${value}`
    else if (value !== null) {
      lines.splice(end, 0, `${key}: ${value}`)
      end++
    }
  }
  return lines.join(eol)
}

export function buildItem({ dueMs, text, now }) {
  return `due: ${isoZ(dueMs)}\nstatus: pending\ncreated: ${isoZ(now)}\n\n${String(text).trim()}\n`
}
export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'reminder'
}
export function itemName(dueMs, slug) {
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

// -> 'due' | 'pending' | 'running' | 'done' | 'cancelled' | 'unparseable' (pending, bad due) | 'ignored' (no/unknown status)
export function classify(item, claim, now) {
  if (item.status === 'done') return 'done'
  if (item.status === 'cancelled') return 'cancelled'
  if (item.status !== 'pending') return 'ignored'
  if (item.due === null) return 'unparseable'
  if (claimLive(claim, now)) return 'running'
  return item.due <= now ? 'due' : 'pending'
}

// -> { ok:true, ms, iso } | { ok:false, error }; offset/Z ISO, local `YYYY-MM-DD HH:MM[:SS]` in tz, or +<n>m|h|d; past rejected.
export function parseWhen(input, now, tz) {
  const s = String(input ?? '').trim()
  let ms = null
  let rel = /^\+(\d+)([mhd])$/.exec(s)
  if (rel) ms = now + +rel[1] * { m: 60000, h: 3600000, d: 86400000 }[rel[2]]
  else {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(s)
    if (!m) return { ok: false, error: `unrecognised time "${s}": use ISO with offset/Z, "YYYY-MM-DD HH:MM" or +<n>m|h|d` }
    const [y, mo, d, h, mi, sec] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0)]
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
  ms = Math.floor(ms / 1000) * 1000
  return ms <= now ? { ok: false, error: `${isoZ(ms)} is in the past` } : { ok: true, ms, iso: isoZ(ms) }
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

export function span(ms) {
  const a = Math.abs(ms)
  if (a < 3600000) return `${Math.max(1, Math.round(a / 60000))} min`
  if (a < 48 * 3600000) return `${Math.round(a / 3600000)} h`
  return `${Math.round(a / 86400000)} d`
}
export const relative = (ms, now) => (Math.abs(ms - now) < 60000 ? 'now' : ms > now ? `in ${span(ms - now)}` : `${span(now - ms)} ago`)

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
  const slug = (id) => id.replace(/^[^_]*_/, '').toLowerCase()
  const pick = (c) => (c.length === 1 ? { id: c[0] } : c.length === 0 ? { error: 'none', candidates: [] } : { error: 'ambiguous', candidates: c })
  if (q === '') return { error: 'none', candidates: [] }
  const exact = ids.filter((id) => id.toLowerCase() === q)
  if (exact.length === 1) return { id: exact[0] }
  const bySlug = ids.filter((id) => slug(id) === q)
  if (bySlug.length === 1) return { id: bySlug[0] }
  return pick(ids.filter((id) => id.toLowerCase().startsWith(q) || slug(id).startsWith(q)))
}

// Offer only on a real typed prompt: source user, or source absent and the module saw an interactive session.
export function shouldOffer(payload, sessionState) {
  if (!payload || !validSid(payload.session_id) || payload.agent_id !== undefined) return false
  if (typeof payload.prompt === 'string' && payload.prompt.trim().startsWith('/')) return false
  if (payload.source === 'user') return true
  return payload.source === undefined && sessionState?.isInteractive === true
}

export function parseConfig(text) {
  const v = parseJson(text)
  return { git: v && GIT_MODES.includes(v.git) ? v.git : 'off' }
}

// ---- offer text

// args: { due:[{id,global,path,due,title}], bad:[{id,global,path}], now, tz, git, legacy }
export function buildOffer({ due, bad, now, tz, git, legacy }) {
  const out = []
  const tag = (i) => `${i.id}${i.global ? ' (global)' : ''}`
  if (due.length > 0) {
    out.push(`Reminders are due (${due.length}), stored as files:`)
    for (const i of [...due].sort((a, b) => a.due - b.due)) {
      const late = now - i.due > LATE_MS ? ` | OVERDUE by ${span(now - i.due)}` : ''
      out.push(`- ${tag(i)} | due ${formatWhen(i.due, tz, now)}${late} | ${i.title} | ${i.path}`)
    }
    out.push(
      'Before anything else tell the user (in their language) these are due; for each offer: run now, snooze, mark done, or cancel. Never run one unasked. Say plainly when one is more than 24 h late.',
      'Run accepted: update_reminder {id, action:"start"}, read the file, carry out its body, then update_reminder {id, action:"done", result}. Snooze: {id, action:"snooze", until}; cancel: {id, action:"cancel"}.',
      'update_reminder unavailable -> edit the file header: `status: done` plus `done: <UTC now, YYYY-MM-DDTHH:MM:SSZ>` (cancel: `status: cancelled` plus `cancelled: <UTC>`); never touch the body.',
    )
    if (git !== 'off') {
      out.push(`Git: after changing an item file, commit only that file${git === 'commit-push' ? ' and push' : ' (no push)'} following the repo's conventions; never stage anything else.`)
    }
  }
  if (bad.length > 0) {
    out.push(`Unreadable reminder files (${bad.length}); the \`due:\` line must be UTC ending in Z (YYYY-MM-DDTHH:MM:SSZ). Tell the user and offer to fix:`)
    for (const i of bad) out.push(`- ${tag(i)} | ${i.path}`)
  }
  if (legacy) out.push('Legacy: .claude/settings.json still registers the old due-checks.sh hook; tell the user to remove it, brewmod-reminders replaces it.')
  return out.join('\n')
}
