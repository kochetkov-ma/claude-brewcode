// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

// UserPromptSubmit / SessionStart(compact): offers due reminders once per session; plain Node, fails open.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CLAIMS_DIR, STATE_NAME_RE, STATE_TTL_MS, buildOffer, claimName, classify, isItemName, itemKey, offeredJson, offeredStateName,
  parseClaim, parseConfig, parseItem, parseOffered, parseSessionState, sessionStateName, shouldOffer, systemTz, validSid,
} from './lib/items.mjs'

const readText = (p) => {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

function loadDir(dir, global, now) {
  let names
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  const items = []
  for (const name of names.filter(isItemName)) {
    const text = readText(path.join(dir, name))
    if (text === null) continue
    const item = { ...parseItem(name, text), global, path: path.join(dir, name) }
    const claim = parseClaim(readText(path.join(dir, CLAIMS_DIR, claimName(item.id))) ?? '')
    items.push({ ...item, state: classify(item, claim, now) })
  }
  return items
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  try {
    fs.writeFileSync(tmp, text)
    fs.renameSync(tmp, file)
  } catch (err) {
    try { fs.unlinkSync(tmp) } catch { /* no tmp left to remove */ }
    throw err
  }
}

function prune(dir, now) {
  for (const name of fs.readdirSync(dir)) {
    if (!STATE_NAME_RE.test(name)) continue
    try {
      const p = path.join(dir, name)
      if (now - fs.statSync(p).mtimeMs > STATE_TTL_MS) fs.unlinkSync(p)
    } catch {
      // raced with another prune: skip this entry
    }
  }
}

function nowOf(env) {
  const raw = env.REMIND_NOW
  const ms = raw === undefined || raw === '' ? NaN : /^\d+$/.test(raw) ? Number(raw) : Date.parse(raw)
  return Number.isFinite(ms) ? ms : Date.now()
}

function run(e, env, now = nowOf(env)) {
  if (!e || !validSid(e.session_id)) return {}
  const root = env.CLAUDE_PLUGIN_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const state = path.join(root, '.state')
  if (e.hook_event_name === 'SessionStart') {
    if (e.source === 'compact') {
      try { fs.unlinkSync(path.join(state, offeredStateName(e.session_id))) } catch { /* no marks to clear */ }
    }
    return {}
  }
  const session = parseSessionState(readText(path.join(state, sessionStateName(e.session_id))) ?? '')
  if (!shouldOffer(e, session)) return {}
  const project = env.CLAUDE_PROJECT_DIR || e.cwd || process.cwd()
  const configDir = env.CLAUDE_CONFIG_DIR || path.join(env.HOME || env.USERPROFILE || os.homedir(), '.claude')
  const items = [
    ...loadDir(path.join(project, '.claude', 'scheduled'), false, now),
    ...loadDir(env.REMIND_GLOBAL_DIR || path.join(configDir, 'reminders'), true, now),
  ]
  const offeredFile = path.join(state, offeredStateName(e.session_id))
  const offered = parseOffered(readText(offeredFile) ?? '')
  const fresh = (i) => offered[itemKey(i)] === undefined
  const due = items.filter((i) => i.state === 'due' && fresh(i))
  const bad = items.filter((i) => i.state === 'unparseable' && fresh(i))
  if (due.length + bad.length === 0) return {}
  const git = parseConfig(readText(path.join(project, '.claude', 'reminders.json')) ?? '').git
  const legacy = ['settings.json', 'settings.local.json'].some((f) => (readText(path.join(project, '.claude', f)) ?? '').includes('due-checks.sh'))
  const text = buildOffer({ due, bad, now, tz: env.REMIND_TZ || systemTz(), git, legacy })
  try {
    for (const i of [...due, ...bad]) offered[itemKey(i)] = now
    writeAtomic(offeredFile, offeredJson(offered))
    prune(state, now)
  } catch {
    // marks are best effort: the offer still goes out
  }
  return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text } }
}

let out = {}
try {
  out = run(JSON.parse(fs.readFileSync(0, 'utf8')), process.env)
} catch {
  // fail open: no offer
}
process.stdout.write(JSON.stringify(out))
