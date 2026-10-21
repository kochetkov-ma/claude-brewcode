// Live e2e of the brewcode update flow: plugin-update -> /reload-plugins -> setup-status upgrade -> report; usage in README.md.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { SAMPLE, ROWS, A_ROWS, B_ROWS, OWNED, COMMON, SETUP_ROW, ANSWERS } from './fixture.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../..')
const E2E = path.join(REPO, '.claude', 'reports', '20261016-1800_update-flow', 'e2e')
const LAUNCH = path.join(HERE, 'launch.sh')
const SOCK = 'luf'
const SCRUB = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN', 'CLAUDE_CODE_EXECPATH', 'CLAUDE_PID', 'CLAUDE_MODEL', 'CLAUDE_EFFORT', 'CLAUDE_CODE_SSE_PORT', 'CLAUDE_ENV_FILE']
const PLUGINS = ['brewcode', 'brewdoc', 'brewtools', 'brewui', 'brewmod-placeholders', 'brewmod-plan-effort', 'brewmod-reminders']
const MARKET = 'claude-brewcode'
// L1 = the GIF size; L2 taller so a long permission dialog keeps its header on screen.
const SIZES = { l1: { w: '88', h: '30' }, l2: { w: '88', h: '60' } }
const BORDER = /^(?:─{20,}|─{3} \S.* ─{10,})\s*$/
// A turn in progress, or a background subagent the turn waits for (`Waiting for 1 background agent`, its timer row).
const BUSY = /esc to interrupt|…\s*\(\d+s|Waiting for \d+ background agents?|^\s*◯ \S/im
const FIXTURE_RECIPE = 3
// LUF_ROWS=11,7: build the fixture from these roster rows only (dev runs; its own cache key).
const PICK = process.env.LUF_ROWS ? process.env.LUF_ROWS.split(',').map(Number) : null
const FX_ROWS = PICK ? ROWS.filter((r) => PICK.includes(r.row)) : ROWS
// LUF_TARGET=6.10.0: lane marketplace stays at the 6.10.0 stage (GIF recorder, --prepare-only only); default 6.10.1 = L3 self-update.
const TARGET = process.env.LUF_TARGET || '6.10.1'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = () => new Date().toISOString()
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const exists = (p) => fs.existsSync(p)

const USAGE = `usage: bash run.sh [--lanes l1,l2] [--l1-mode M] [--l2-mode M] [--old vX.Y.Z] [--out dir] [--fixture-cache dir] [--rebuild-fixture] [--parallel] [--prepare-only] [--fixture-only] [--keep] [--effort e] [--judge-transcript f]
  --lanes        which flows run (default l1,l2); l1 = plugin-update + reload + setup-status upgrade + report, l2 = the same in default mode
  --l1-mode M    permission mode of lane l1 (default bypassPermissions); --l2-mode M for l2 (default default)
  --old vX.Y.Z   tag whose plugins install the old setups (default v6.7.1)
  --fixture-cache dir   reuse/store the built fixture there (default <e2e>/fixture-cache); --rebuild-fixture ignores a cached one
  --parallel     run the lanes at the same time
  --fixture-only build (or find) the fixture tarball, then stop
  --prepare-only build everything up to the first typed command, print the launch line, keep the git server until Ctrl-C (GIF recorder)
  --keep         keep the scratch dir even when every check passes
  --effort e     effort of every child session (default medium)
  --judge-transcript f   offline: judge the setup-upgrader spawns of one transcript.jsonl (su.spawn-contract), no run; rc 0 PASS, 1 FAIL
env: CLAUDE_CONFIG_DIR unset (= ~/.claude) or ~/.claude-d only; LUF_OUT = output root (default <e2e>/run-<UTC>); LUF_SCRATCH_ROOT = parent of the luf-* scratch dir (default /tmp); LUF_TARGET = lane target stage (default 6.10.1; 6.10.0 with --prepare-only only)
rc: 0 every check PASS, 1 a check failed, 2 harness error`

function fail2(msg) {
  process.stderr.write(`${msg}\n${USAGE}\n`)
  process.exit(2)
}

function parseArgs(argv) {
  const o = { lanes: ['l1', 'l2'], modes: { l1: 'bypassPermissions', l2: 'default' }, old: 'v6.7.1', out: null, cache: path.join(E2E, 'fixture-cache'), rebuild: false, parallel: false, prepareOnly: false, fixtureOnly: false, keep: false, effort: 'medium', judge: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const val = () => (i + 1 < argv.length ? argv[++i] : fail2(`${a} needs a value`))
    if (a === '--lanes') o.lanes = val().split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--l1-mode') o.modes.l1 = val()
    else if (a === '--l2-mode') o.modes.l2 = val()
    else if (a === '--old') o.old = val()
    else if (a === '--out') o.out = path.resolve(val())
    else if (a === '--fixture-cache') o.cache = path.resolve(val())
    else if (a === '--rebuild-fixture') o.rebuild = true
    else if (a === '--parallel') o.parallel = true
    else if (a === '--prepare-only') o.prepareOnly = true
    else if (a === '--fixture-only') o.fixtureOnly = true
    else if (a === '--keep') o.keep = true
    else if (a === '--effort') o.effort = val()
    else if (a === '--judge-transcript') o.judge = path.resolve(val())
    else if (a === '-h' || a === '--help') fail2('help')
    else fail2(`unknown argument ${a}`)
  }
  if (o.lanes.length === 0 || o.lanes.some((l) => !['l1', 'l2'].includes(l))) fail2('--lanes takes l1 and/or l2')
  if (!/^v\d+\.\d+\.\d+$/.test(o.old)) fail2('--old must be vX.Y.Z')
  if (!['6.10.0', '6.10.1'].includes(TARGET)) fail2(`LUF_TARGET=${TARGET}: 6.10.0 or 6.10.1`)
  if (TARGET !== '6.10.1' && !o.prepareOnly && !o.judge) fail2('LUF_TARGET=6.10.0 is for --prepare-only: the checks expect the L3 self-update to 6.10.1')
  return o
}

// ---- tmux screen primitives (patterns of .claude/scripts/live-placeholders/drive.mjs) ----
// Parent-session leaks (its settings env, launch-alias vars): scrubbed from every child, tmux server included.
const LEAKS = ['CLAUDE_CODE_AUTO_COMPACT_WINDOW', 'CLAUDE_AUTOCOMPACT_PCT_OVERRIDE', 'CLAUDE_CODE_DISABLE_1M_CONTEXT']
let CHILD_ENV = process.env
const tmux = (...args) => execFileSync('tmux', ['-L', SOCK, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: CHILD_ENV })
const grab = (name, opts = {}) => tmux('capture-pane', '-p', ...(opts.ansi ? ['-e'] : []), ...(opts.hist ? ['-S', '-'] : []), '-t', name)
const isDead = (name) => {
  try {
    return tmux('display-message', '-p', '-t', name, '#{pane_dead}').trim() === '1'
  } catch {
    return true
  }
}
async function typeText(name, text) {
  const chars = [...text]
  for (let i = 0; i < chars.length; i += 4) {
    tmux('send-keys', '-t', name, '-l', chars.slice(i, i + 4).join(''))
    await sleep(25)
  }
}
async function press(name, key, n = 1) {
  for (let i = 0; i < n; i++) {
    tmux('send-keys', '-t', name, key)
    await sleep(150)
  }
}
function promptBox(screen) {
  const lines = screen.split('\n')
  for (let i = lines.length - 2; i >= 0; i--) if (BORDER.test(lines[i]) && lines[i + 1].startsWith('❯')) return lines[i + 1]
  return null
}
// Empty box; a fresh session shows a dim example (`Try "..."`), which capture-pane cannot tell from typed text.
const promptEmpty = (screen) => /^❯\s*(Try ".*"\s*)?$/.test(promptBox(screen) ?? 'x')
async function waitFor(name, test, ms) {
  const t0 = Date.now()
  for (;;) {
    const s = grab(name)
    if (test(s)) return s
    if (Date.now() - t0 > ms || isDead(name)) return null
    await sleep(200)
  }
}

// ---- dialogs on screen ----
const QUESTION_UI = /Enter to select · .*to navigate · Esc to cancel/
const OPTION = /^\s*(❯)?\s*(\d+)\.\s+(?:\[(.)\]\s+)?(.+?)\s*$/
function parseOptions(lines) {
  return lines.map((l, i) => ({ l, i, m: l.match(OPTION) })).filter((x) => x.m).map((x) => ({ n: Number(x.m[2]), cur: x.m[1] === '❯', box: x.m[3] ?? null, label: x.m[4].trim(), line: x.i }))
}
function questionOf(screen) {
  if (/Ready to submit your answers\?/.test(screen) && /Submit answers/.test(screen)) return { review: true }
  const lines = screen.split('\n')
  const foot = lines.findLastIndex((l) => QUESTION_UI.test(l))
  if (foot < 0) return null
  // Header: the tab bar (several questions) or a `☐ <header>` line (one); numbered transcript lines above it are not options.
  let head = foot
  while (head >= 0 && !/^\s*←.*→\s*$/.test(lines[head]) && !/^\s*[☐☒✔]\s+\S/.test(lines[head])) head--
  if (head < 0) return null
  const region = lines.slice(head, foot)
  const opts = parseOptions(region.slice(1)).filter((o) => o.label !== 'Chat about this')
  const firstOpt = opts.length ? 1 + opts[0].line : region.length
  const text = region.slice(0, firstOpt).join(' ').replace(/│/g, ' ').replace(/\s+/g, ' ').trim()
  return { review: false, text, opts, multi: opts.some((o) => o.box !== null) }
}
function permissionOf(screen) {
  const lines = screen.split('\n')
  const ask = lines.findIndex((l) => /^\s*Do you want to .*\?\s*$/.test(l))
  if (ask < 0 || !/❯ 1\. Yes/.test(screen)) return null
  let top = ask
  while (top > 0 && !BORDER.test(lines[top])) top--
  const block = lines.slice(top + 1).join('\n').replace(/\n{2,}/g, '\n').trim()
  // Kind = the dialog header (`Bash command · from <agent>`, `Create file`, `Read file`, ...); a dialog taller than the pane lost it.
  const head = (lines.slice(top + 1).find((l) => l.trim()) ?? '').trim()
  const kind = /^(Bash command|Create file|Edit file|Read file|Write|Fetch|MCP|Agent|Tool use)\b/i.test(head) ? head : '(header off screen)'
  return { block, kind, question: lines[ask].trim(), protectedPath: /sensitive file|requested permissions to edit/i.test(block), claudeDir: /(^|[\s/"'])\.claude\//m.test(block) }
}

// ---- files ----
function walk(root, skip = new Set(['.git'])) {
  const out = []
  const rec = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (skip.has(e.name)) continue
      const p = path.join(d, e.name)
      if (e.isDirectory()) rec(p)
      else if (e.isFile() || e.isSymbolicLink()) out.push(p)
    }
  }
  if (exists(root)) rec(root)
  return out
}
function treeHash(root) {
  const m = {}
  for (const f of walk(root)) {
    try {
      m[path.relative(root, f)] = sha(fs.readFileSync(f))
    } catch {
      m[path.relative(root, f)] = 'unreadable'
    }
  }
  return m
}
function treeDiff(a, b) {
  const out = []
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!(k in a)) out.push({ path: k, change: 'added' })
    else if (!(k in b)) out.push({ path: k, change: 'deleted' })
    else if (a[k] !== b[k]) out.push({ path: k, change: 'modified' })
  }
  return out.sort((x, y) => x.path.localeCompare(y.path))
}
const isText = (buf) => !buf.subarray(0, 8192).includes(0)
const slug = (p) => p.replace(/[^A-Za-z0-9]/g, '-')
function readJsonl(file) {
  if (!exists(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => {
    try {
      return JSON.parse(l)
    } catch {
      return null
    }
  }).filter(Boolean)
}

// ---- transcript readers ----
const blocks = (e) => (Array.isArray(e?.message?.content) ? e.message.content : typeof e?.message?.content === 'string' ? [{ type: 'text', text: e.message.content }] : [])
const textOf = (e) => blocks(e).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
const resultText = (b) => (typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? b.content.map((c) => c.text ?? '').join('\n') : '')
function between(entries, t0, t1) {
  return entries.filter((e) => typeof e.timestamp === 'string' && e.timestamp >= t0 && (t1 === undefined || e.timestamp <= t1))
}
// Cells split on unescaped pipes only: a `\|` inside a cell (e.g. a probe line) stays in that cell.
const cells = (l) => l.split(/(?<!\\)\|/).map((c) => c.trim())
function mdTable(text, firstHeader) {
  const lines = text.split('\n')
  const h = lines.findIndex((l) => l.trim().startsWith('|') && cells(l)[1] === firstHeader)
  if (h < 0) return null
  const head = cells(lines[h]).slice(1, -1)
  const rows = []
  for (const l of lines.slice(h + 2)) {
    if (!l.trim().startsWith('|')) break
    rows.push(cells(l).slice(1, -1))
  }
  return { head, rows }
}
const plain = (s) => s.replace(/[*`]/g, '').trim()

// ---- upgrader spawns: the setup-status contract (upgrade-runner.md 2b-2c), judged on transcript order ----
const SCOPE_CHECK = /scope-guard\.sh[\s\S]*(?<![\w-])check\s+["']?(?:\$PWD|\$\{PWD\}|\/)/
const spawnOf = (b, step) => ({ id: b.id, step, desc: b.input?.description ?? '', type: b.input?.subagent_type ?? '', model: b.input?.model ?? '', rib: 'run_in_background' in (b.input ?? {}) ? b.input.run_in_background : 'absent' })
// Async launch = its marker or a later task-notification; si/ci = entry index of the spawn / of its completion (-1 = none).
function spawnWindows(tr, spawns) {
  const use = new Map()
  const res = new Map()
  tr.forEach((e, i) => {
    if (e.type === 'assistant') for (const b of blocks(e)) if (b.type === 'tool_use') use.set(b.id, i)
    if (e.type === 'user') for (const b of blocks(e)) if (b.type === 'tool_result') res.set(b.tool_use_id, { i, text: resultText(b) })
  })
  const notes = tr.flatMap((e, i) => (e.type === 'user' && /<task-notification>/.test(textOf(e)) ? [i] : []))
  return spawns.map((s) => {
    const si = use.get(s.id) ?? -1
    const r = res.get(s.id)
    const agent = (r?.text ?? '').match(/agentId: (\w+)/)?.[1]
    const ni = agent ? notes.find((i) => i > si && textOf(tr[i]).includes(`<task-id>${agent}</task-id>`)) : undefined
    const background = /Async agent launched/.test(r?.text ?? '') || ni !== undefined
    const ci = background ? (ni ?? -1) : (r?.i ?? -1)
    const endAt = ni !== undefined ? tr[ni].timestamp : r ? tr[r.i].timestamp : undefined
    const result = ni !== undefined ? (textOf(tr[ni]).match(/^RESULT .*$/m) ?? [''])[0] : ((r?.text ?? '').match(/^RESULT .*$/m) ?? [''])[0]
    return { ...s, background, si, ci, start: tr[si]?.timestamp, end: endAt, result: result.replace(/&gt;/g, '>') }
  })
}
// The Agent tool schema in force at entry `at`: the latest main-thread api-request names its api-request-shape.
function agentSchema(tr, at, key) {
  const reqs = tr.slice(0, at + 1).filter((e) => e.type === 'api-request')
  const req = reqs.findLast((e) => e.querySource === 'repl_main_thread') ?? reqs.at(-1)
  const shape = tr.find((e) => e.type === 'api-request-shape' && e.shapeHash === req?.shapeHash)
  const tool = (shape?.shape?.tools ?? []).find((t) => t.name === 'Agent' || t.name === 'Task')
  if (tool) {
    const props = Object.keys(tool.input_schema?.properties ?? {})
    return { has: props.includes(key), props, src: `api-request-shape ${shape.shapeHash.slice(0, 8)}` }
  }
  const passed = tr.some((e) => e.type === 'assistant' && blocks(e).some((b) => b.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Task') && key in (b.input ?? {})))
  return passed ? { has: true, props: null, src: 'an Agent call that passed it' } : { has: null, props: null, src: 'no api-request-shape and no Agent call passing it' }
}
// Key in the Agent schema -> pass false; else (fork mode) no other main tool call until the completion; a scope check before the next spawn.
function judgeSpawns(tr, wins, endIdx) {
  const sorted = wins.filter((w) => w.si >= 0).sort((a, b) => a.si - b.si)
  const rows = sorted.map((w, k) => {
    const sch = agentSchema(tr, w.si, 'run_in_background')
    const why = []
    if (sch.has === null) why.push(`Agent schema not in the transcript (${sch.src})`)
    if (sch.has === true && w.rib === 'absent') why.push('the schema lists run_in_background, the spawn omitted it')
    if (w.rib !== 'absent' && w.rib !== false) why.push(`passed run_in_background: ${JSON.stringify(w.rib)}`)
    if (sch.has === true && w.rib === false && w.background) why.push('passed run_in_background: false but the result was an async launch')
    const other = []
    if (w.ci < 0) why.push(w.background ? 'async launch never got its task-notification' : 'no tool_result')
    else for (let i = w.si + 1; i < w.ci; i++) if (tr[i].type === 'assistant' && tr[i].isSidechain !== true) for (const b of blocks(tr[i])) if (b.type === 'tool_use') other.push(`${b.name}@${i}`)
    if (other.length) why.push(`other tool call(s) before the spawn completed: ${other.join(', ')}`)
    const next = sorted[k + 1]?.si ?? endIdx
    const sc = w.ci < 0 ? -1 : tr.findIndex((e, i) => i > w.ci && i < next && e.type === 'assistant' && blocks(e).some((b) => b.type === 'tool_use' && b.name === 'Bash' && SCOPE_CHECK.test(b.input?.command ?? '')))
    if (w.ci >= 0 && sc < 0) why.push(sorted[k + 1] ? 'the next spawn came before this row\'s scope check' : 'no scope check after the last row')
    const mode = `${w.background ? 'background launch' : 'foreground return'} (${sch.has === true ? 'key in schema' : sch.has === false ? 'no key' : 'schema unknown'})`
    return { w, sch, why, other, sc, mode }
  })
  const ok = rows.length > 0 && rows.every((r) => r.why.length === 0)
  const sch = rows[0]?.sch
  const detail = rows.length === 0 ? 'no upgrader spawn to judge' : ok
    ? `${rows.length} spawn(s), Agent schema run_in_background=${sch.has ? 'present' : 'absent'} (${sch.src}${sch.props ? `; keys ${sch.props.join(',')}` : ''}): ${[...new Set(rows.map((r) => r.mode))].join('; ')}${sch.has ? '; false passed on every spawn' : ''}; no other main tool call until each completed, a scope check before every next spawn`
    : rows.filter((r) => r.why.length).map((r) => `${r.w.desc}: ${r.why.join('; ')}`).join(' | ')
  return { ok, detail, rows }
}
// Offline: node drive.mjs --judge-transcript <transcript.jsonl>; judges every setup-upgrader spawn, no tmux, no model turn.
function judgeFile(file) {
  const tr = readJsonl(file)
  const spawns = tr.flatMap((e) => (e.type === 'assistant' ? blocks(e).filter((b) => b.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Task') && b.input?.subagent_type === 'brewcode:setup-upgrader').map((b) => spawnOf(b, 'su')) : []))
  const v = judgeSpawns(tr, spawnWindows(tr, spawns), tr.length)
  process.stdout.write(`${v.ok ? 'PASS' : 'FAIL'}  su.spawn-contract  ${v.detail}\n`)
  for (const r of v.rows) process.stdout.write(`  ${r.why.length ? 'FAIL' : 'PASS'}  ${r.w.desc}: spawn@${r.w.si} done@${r.w.ci} scope-check@${r.sc} passed=${JSON.stringify(r.w.rib)} ${r.mode}${r.why.length ? ` -> ${r.why.join('; ')}` : ''}\n`)
  return v.ok ? 0 : 1
}

class Run {
  constructor(o) {
    this.o = o
    this.stamp = now().replace(/[:.]/g, '-')
    this.out = o.out ?? (process.env.LUF_OUT ? path.resolve(process.env.LUF_OUT) : path.join(E2E, `run-${this.stamp}`))
    this.cfg = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
    this.cfgSet = Boolean(process.env.CLAUDE_CONFIG_DIR)
    this.rows = []
    this.leaks = []
    this.sessions = []
    this.server = null
    this.facts = { lanes: {} }
  }

  log(msg) {
    const line = `${now()} ${msg}`
    process.stderr.write(`${line}\n`)
    fs.appendFileSync(path.join(this.out, 'run.log'), `${line}\n`)
  }

  record(id, ok, detail = '', file = '') {
    this.rows.push({ id, ok, detail, file })
    process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? `  ${detail}` : ''}\n`)
  }

  env(extra = {}) {
    const e = { ...process.env, ...extra }
    for (const k of [...SCRUB, ...this.leaks]) delete e[k]
    if (!('CLAUDE_CONFIG_DIR' in extra)) {
      if (this.cfgSet) e.CLAUDE_CONFIG_DIR = this.cfg
      else delete e.CLAUDE_CONFIG_DIR
    }
    return e
  }

  // ---- P0 preflight + real-profile guard ----
  preflight() {
    fs.mkdirSync(this.out, { recursive: true })
    const allowed = [path.join(os.homedir(), '.claude'), path.join(os.homedir(), '.claude-d')]
    if (!allowed.includes(path.resolve(this.cfg))) fail2(`CLAUDE_CONFIG_DIR=${this.cfg}: model turns only on ~/.claude (unset) or ~/.claude-d`)
    // LUF_SCRATCH_ROOT = parent of the luf-* scratch dir (default /tmp); its path shows in the TUI and in Bash rows.
    this.scratchRoot = process.env.LUF_SCRATCH_ROOT ? path.resolve(process.env.LUF_SCRATCH_ROOT) : exists('/tmp') ? '/tmp' : os.tmpdir()
    if (!exists(this.scratchRoot) || !fs.statSync(this.scratchRoot).isDirectory()) fail2(`LUF_SCRATCH_ROOT=${this.scratchRoot}: not a directory`)
    const v = spawnSync('claude', ['--version'], { env: this.env(), encoding: 'utf8', input: '' })
    const cc = (v.stdout ?? '').match(/\d+\.\d+\.\d+/)?.[0] ?? '0.0.0'
    const [a, b, c] = cc.split('.').map(Number)
    if (a < 2 || (a === 2 && (b < 1 || (b === 1 && c < 301)))) fail2(`claude ${cc}: needs 2.1.301+ (mods)`)
    this.cc = cc
    this.uv = spawnSync('uv', ['--version'], { encoding: 'utf8' }).status === 0
    this.guardBefore = this.guardState()
    const envKeys = (d) => {
      try {
        return Object.keys(JSON.parse(fs.readFileSync(path.join(d, 'settings.json'), 'utf8')).env ?? {})
      } catch {
        return []
      }
    }
    this.leaks = [...new Set([...LEAKS, ...allowed.flatMap(envKeys)])]
    CHILD_ENV = this.env()
    CHILD_ENV.LUF_UNSET = this.leaks.join(' ')
    this.log(`profile ${this.cfg}${this.cfgSet ? '' : ' (CLAUDE_CONFIG_DIR unset)'}; claude ${cc}; uv ${this.uv ? 'yes' : 'no'}; out ${this.out}`)
  }

  // Every real-profile file this run must leave byte-identical (runtime state dirs excluded).
  guardState() {
    const files = ['settings.json', 'agent-return.json', 'agent-deadline.json', 'plugins/installed_plugins.json', 'plugins/known_marketplaces.json']
    const st = {}
    for (const f of files) {
      const p = path.join(this.cfg, f)
      st[f] = exists(p) ? sha(fs.readFileSync(p)) : 'absent'
    }
    const hooks = path.join(this.cfg, 'hooks')
    for (const f of walk(hooks)) st[`hooks/${path.relative(hooks, f)}`] = sha(fs.readFileSync(f))
    const ph = path.join(this.cfg, 'placeholders')
    st['placeholders/'] = exists(ph) ? fs.readdirSync(ph).sort().join(',') : 'absent'
    return st
  }

  // ---- P1 candidate snapshot + marketplace repo ----
  async snapshot() {
    this.scratch = fs.realpathSync(fs.mkdtempSync(path.join(this.scratchRoot, 'luf-')))
    this.log(`scratch ${this.scratch}`)
    const listFiles = () => execFileSync('git', ['-C', REPO, 'ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\0').filter((f) => f && exists(path.join(REPO, f)) && !fs.lstatSync(path.join(REPO, f)).isDirectory())
    const watched = (f) => PLUGINS.some((p) => f.startsWith(`${p}/`)) || f.startsWith('.claude-plugin/') || f.startsWith('.codex/') || f === 'RELEASE-NOTES.md' || f === '.claude/scripts/bump-version.sh'
    const fp = () => listFiles().filter(watched).sort().map((f) => { const s = fs.statSync(path.join(REPO, f)); return `${f}:${s.mtimeMs}:${s.size}` }).join('\n')
    let prev = fp()
    for (let i = 0; ; i++) {
      await sleep(3000)
      const cur = fp()
      if (cur === prev) break
      if (i >= 20) fail2('working tree kept changing for 60 s')
      this.log('working tree still changing, waiting')
      prev = cur
    }
    const files = listFiles()
    const list = path.join(this.scratch, 'snapshot.list')
    fs.writeFileSync(list, `${files.join('\0')}\0`)
    const logDir = path.join(this.out, 'snapshot')
    fs.mkdirSync(logDir, { recursive: true })
    const r = spawnSync('bash', [path.join(HERE, 'snapshot.sh'), REPO, this.scratch, this.o.old, list, logDir, '6.10.0', '6.10.1'], { encoding: 'utf8', env: this.env() })
    fs.writeFileSync(path.join(logDir, 'snapshot.txt'), `rc ${r.status}\n${r.stdout}${r.stderr}`)
    if (r.status !== 0) fail2(`snapshot.sh failed (rc ${r.status}), see ${logDir}/snapshot.txt`)
    const head = execFileSync('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
    const dirty = execFileSync('git', ['-C', REPO, 'status', '--porcelain'], { encoding: 'utf8' }).split('\n').filter(Boolean).length
    for (const m of r.stdout.matchAll(/^BUMP-CODEX-ONLY (\S+)$/gm)) this.record(`snapshot.bump-${m[1]}`, false, `bump-version.sh ${m[1]} rc 1, only .codex/scripts/validate-compat.mjs failed (Codex mirror); Claude Code plugin bytes bumped, run continues`, path.join(logDir, `snapshot-bump-${m[1]}.log`))
    this.facts.snapshot = { repoHead: head, dirtyEntries: dirty, files: files.length, old: this.o.old, refs: Object.fromEntries((r.stdout.match(/^M_\w+=\w+$/gm) ?? []).map((l) => l.split('='))) }
    for (const p of PLUGINS) {
      const v = spawnSync('claude', ['plugin', 'validate', path.join(this.scratch, 'cand', p)], { env: this.env(), encoding: 'utf8', input: '' })
      fs.appendFileSync(path.join(logDir, 'validate.txt'), `== ${p} rc ${v.status}\n${v.stdout}${v.stderr}\n`)
      if (v.status !== 0) fail2(`candidate ${p} does not validate, see ${logDir}/validate.txt`)
    }
    this.log(`snapshot of ${head} (+${dirty} dirty entries) -> ${this.o.old} / 6.10.0 / 6.10.1 marketplace refs`)
  }

  // ---- P2 git server (one per run; lanes get their own bare repos under the same root) ----
  async startServer() {
    const portFile = path.join(this.scratch, 'port')
    this.server = spawn('node', [path.join(HERE, 'githttp.mjs'), this.scratch, portFile], { stdio: ['ignore', 'ignore', fs.openSync(path.join(this.out, 'githttp.err'), 'a')] })
    for (let i = 0; i < 100 && !(exists(portFile) && fs.readFileSync(portFile, 'utf8').trim()); i++) await sleep(100)
    if (!exists(portFile)) fail2('git server did not start')
    this.port = fs.readFileSync(portFile, 'utf8').trim()
    this.log(`git server http://127.0.0.1:${this.port}/`)
  }

  // ---- lane plumbing ----
  lane(name) {
    const root = path.join(this.scratch, name)
    const L = { name, root, proj: path.join(root, 'proj'), global: path.join(root, 'global'), plugins: path.join(root, 'plugins'), market: path.join(root, 'market.git'), semble: path.join(root, 'semble-cache'), out: path.join(this.out, name) }
    L.url = `http://127.0.0.1:${this.port}/${name}/market.git`
    L.envFile = path.join(root, 'env.sh')
    // Session flag layer = the lane CLI's user settings file: both see one marketplace and one enabledPlugins set.
    L.settings = path.join(L.global, 'settings.json')
    for (const d of [root, L.global, L.plugins, L.out, L.semble]) fs.mkdirSync(d, { recursive: true })
    execFileSync('git', ['clone', '-q', '--bare', path.join(this.scratch, 'market.git'), L.market])
    this.setStage(L, 'stage-old')
    // Bash-only: the CLI writes its user-scope settings into the lane, never the real profile; semble's index cache too.
    fs.writeFileSync(L.envFile, `export CLAUDE_CONFIG_DIR='${L.global}'\nexport SEMBLE_CACHE_ROOT_CODE='${L.semble}'\n`)
    fs.writeFileSync(L.settings, `${JSON.stringify({ skipDangerousModePermissionPrompt: true, promptSuggestionEnabled: false, tui: 'default' }, null, 2)}\n`)
    return L
  }

  setStage(L, ref) {
    execFileSync('git', ['-C', L.market, 'update-ref', 'refs/heads/main', `refs/heads/${ref}`])
    L.stage = ref
  }

  cli(L, args, stem, cwd = L.root) {
    const r = spawnSync('claude', args, { cwd, env: this.env({ CLAUDE_CONFIG_DIR: L.global, CLAUDE_CODE_PLUGIN_CACHE_DIR: L.plugins }), encoding: 'utf8', input: '', timeout: 300000 })
    fs.appendFileSync(path.join(L.out, 'cli.log'), `${now()} $ claude ${args.join(' ')}  (rc ${r.status})\n${r.stdout ?? ''}${r.stderr ?? ''}\n`)
    if (stem !== null && r.status !== 0) throw new Error(`claude ${args.join(' ')} failed rc ${r.status}: ${(r.stderr || r.stdout || '').slice(0, 300)}`)
    return r
  }

  listPlugins(L) {
    const r = this.cli(L, ['plugin', 'list', '--json'], 'list')
    try {
      return JSON.parse(r.stdout)
    } catch {
      return []
    }
  }

  versions(L) {
    return Object.fromEntries(this.listPlugins(L).filter((x) => x.id.endsWith(`@${MARKET}`)).map((x) => [x.id.split('@')[0], x.version]))
  }

  // Old plugins at user scope; pre = brewtools alone moved to 6.10.0 (so the new plugin-update skill runs, and itself updates to 6.10.1: L3).
  preparePlugins(L, pre) {
    this.cli(L, ['plugin', 'marketplace', 'add', L.url], 'add')
    for (const p of ['brewcode', 'brewtools', 'brewdoc']) this.cli(L, ['plugin', 'install', `${p}@${MARKET}`, '--scope', 'user'], 'install')
    if (pre) {
      this.setStage(L, 'stage-6.10.0')
      this.cli(L, ['plugin', 'marketplace', 'update', MARKET], 'mupdate')
      this.cli(L, ['plugin', 'update', `brewtools@${MARKET}`, '--scope', 'user'], 'update')
    }
    const st = JSON.parse(fs.readFileSync(L.settings, 'utf8'))
    if (st.extraKnownMarketplaces?.[MARKET]) st.extraKnownMarketplaces[MARKET].autoUpdate = false
    fs.writeFileSync(L.settings, `${JSON.stringify(st, null, 2)}\n`)
    const v = this.versions(L)
    const want = { brewcode: this.o.old.slice(1), brewdoc: this.o.old.slice(1), brewtools: pre ? '6.10.0' : this.o.old.slice(1) }
    for (const [p, ver] of Object.entries(want)) if (v[p] !== ver) throw new Error(`${L.name}: ${p} is ${v[p]}, want ${ver}`)
    return v
  }

  // ---- P3 fixture: old setups installed for real by headless sessions of the old plugins ----
  fixtureKey() {
    return sha(JSON.stringify({ r: FIXTURE_RECIPE, old: this.o.old, rows: FX_ROWS.filter((r) => r.needs !== 'uv' || this.uv), sample: SAMPLE })).slice(0, 16)
  }

  async fixture() {
    const key = this.fixtureKey()
    const tgz = path.join(this.o.cache, `${this.o.old}-${key}.tgz`)
    const meta = path.join(this.o.cache, `${this.o.old}-${key}.json`)
    if (!this.o.rebuild && exists(tgz) && exists(meta)) {
      this.fx = JSON.parse(fs.readFileSync(meta, 'utf8'))
      this.fx.tgz = tgz
      this.fx.cached = true
      this.log(`fixture cache hit ${tgz}`)
      this.recordFixture(meta)
      return
    }
    const F = this.lane('fx')
    this.preparePlugins(F, false)
    fs.mkdirSync(F.proj, { recursive: true })
    for (const [f, t] of Object.entries(SAMPLE)) {
      fs.mkdirSync(path.dirname(path.join(F.proj, f)), { recursive: true })
      fs.writeFileSync(path.join(F.proj, f), t)
    }
    const G = ['-c', 'user.name=luf', '-c', 'user.email=luf@localhost', '-c', 'commit.gpgsign=false']
    execFileSync('git', ['-C', F.proj, 'init', '-q', '-b', 'main'])
    // Typical user repo: no global ignore of .claude/ (the host's), project .gitignore honoured, so runtime output stays untracked.
    execFileSync('git', ['-C', F.proj, 'config', 'core.excludesFile', '/dev/null'])
    execFileSync('git', ['-C', F.proj, ...G, 'add', '-A'])
    execFileSync('git', ['-C', F.proj, ...G, 'commit', '-qm', 'init: sample project'])
    const results = []
    for (const r of FX_ROWS) {
      if (r.needs === 'uv' && !this.uv) {
        results.push({ row: r.row, skill: r.skill, status: 'skipped', note: 'uv absent' })
        continue
      }
      const head0 = execFileSync('git', ['-C', F.proj, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      const t0 = Date.now()
      this.log(`fixture row ${r.row} ${r.skill}: ${r.args}`)
      const h = this.headless(F, r.prompt, r.min, `fixture-row${r.row}`)
      // A setup that stops at a reload checkpoint gets the follow-up session its user would run (semble: resume).
      const h2 = r.thenPrompt ? this.headless(F, r.thenPrompt, r.min, `fixture-row${r.row}-then`) : null
      const head1 = execFileSync('git', ['-C', F.proj, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      const anchor = r.anchor ? exists(path.join(F.proj, r.anchor)) : walk(path.join(F.proj, r.anchorGlob[0])).some((f) => f.endsWith(r.anchorGlob[1]))
      // ready = [json file, key, value]: the follow-up session must have reached that state too.
      let ready = true
      if (r.ready) {
        try {
          ready = JSON.parse(fs.readFileSync(path.join(F.proj, r.ready[0]), 'utf8'))[r.ready[1]] === r.ready[2]
        } catch {
          ready = false
        }
      }
      let disarm = ''
      if (r.disarm && anchor) {
        const d = spawnSync('node', [path.join(F.proj, '.claude/brewtools/manager/manager-state.mjs'), 'set', 'hard=false', '--cwd', F.proj], { encoding: 'utf8' })
        disarm = `disarm rc ${d.status} ${(d.stdout + d.stderr).trim().slice(0, 120)}`
      }
      results.push({ row: r.row, skill: r.skill, cls: r.cls, status: anchor && ready ? 'installed' : 'FAILED', rc: h.rc, isError: h.isError, minutes: ((Date.now() - t0) / 60000).toFixed(1), committed: head0 !== head1, costUsd: h.cost + (h2?.cost ?? 0), disarm, result: h.result.slice(0, 400), ...(h2 ? { then: { rc: h2.rc, isError: h2.isError, costUsd: h2.cost, result: h2.result.slice(0, 400) } } : {}) })
      if (head0 !== head1) this.log(`fixture row ${r.row}: the child moved HEAD (${head0.slice(0, 8)} -> ${head1.slice(0, 8)})`)
    }
    execFileSync('git', ['-C', F.proj, ...G, 'add', '-A'])
    spawnSync('git', ['-C', F.proj, ...G, 'commit', '-qm', `fixture: setups installed with ${this.o.old}`])
    const trackedIgnored = execFileSync('git', ['-C', F.proj, 'ls-files', '-ci', '--exclude-standard'], { encoding: 'utf8' }).trim()
    if (trackedIgnored) throw new Error(`fixture tracks gitignored files: ${trackedIgnored.split('\n').slice(0, 5).join(', ')}`)
    // A row whose anchor never appeared: the tarball serves this run only, never the cache (a rerun rebuilds).
    const bad = results.some((x) => x.status === 'FAILED')
    const out = bad ? path.join(F.root, 'fixture-failed.tgz') : tgz
    fs.mkdirSync(this.o.cache, { recursive: true })
    execFileSync('tar', ['-czf', out, '-C', F.root, 'proj', 'semble-cache'])
    // semble MCP registration of the fixture profile, re-added in each lane's scratch profile.
    let mcp = null
    try {
      mcp = JSON.parse(fs.readFileSync(path.join(F.global, '.claude.json'), 'utf8')).mcpServers?.semble_code ?? null
    } catch {
      mcp = null
    }
    this.fx = { root: F.root, built: now(), old: this.o.old, cc: this.cc, results, mcp, tgz: out }
    if (!bad) fs.writeFileSync(meta, `${JSON.stringify(this.fx, null, 2)}\n`)
    fs.writeFileSync(path.join(this.out, 'fixture.json'), `${JSON.stringify(this.fx, null, 2)}\n`)
    this.copyTranscripts(F.proj, path.join(this.out, 'fixture-transcripts'))
    this.log(`fixture built${bad ? ' (not cached: a row FAILED)' : ''}: ${results.map((x) => `${x.row}:${x.status}`).join(' ')}`)
    this.recordFixture()
  }

  // One FAIL per fixture row whose setup never installed: its rows below test nothing.
  recordFixture(meta = null) {
    for (const x of this.fx.results ?? []) if (x.status === 'FAILED') this.record(`fixture.row-${x.row}`, false, `${x.skill}: anchor absent (or its ready state unmet) after the install session; ${String(x.result ?? '').replace(/\s+/g, ' ').slice(0, 200)}`, meta ?? path.join(this.out, 'fx', `fixture-row${x.row}.json`))
  }

  headless(L, prompt, minutes, stem) {
    const debug = path.join(L.out, `${stem}.debug.log`)
    const r = spawnSync('bash', [LAUNCH, this.cfgSet ? this.cfg : '-', 'bypassPermissions', debug, L.plugins, L.envFile, L.settings, this.o.effort, '-p', prompt, '--output-format', 'json'], { cwd: L.proj, env: this.env(), encoding: 'utf8', input: '', timeout: minutes * 60000, maxBuffer: 64 << 20 })
    fs.writeFileSync(path.join(L.out, `${stem}.json`), r.stdout ?? '')
    fs.writeFileSync(path.join(L.out, `${stem}.stderr.txt`), `${r.stderr ?? ''}${r.signal ? `\nsignal ${r.signal}` : ''}`)
    let j = {}
    try {
      j = JSON.parse(r.stdout)
    } catch {
      j = {}
    }
    return { rc: r.status, isError: j.is_error === true || r.status !== 0, result: String(j.result ?? r.stderr ?? ''), cost: j.total_cost_usd ?? null }
  }

  // Lane project = the fixture tarball re-rooted: absolute fixture paths in text files become the lane's.
  restoreFixture(L) {
    execFileSync('tar', ['-xzf', this.fx.tgz, '-C', L.root])
    const from = this.fx.root
    const forms = [from, from.replace(/^\/private\/tmp\//, '/tmp/')]
    let hits = 0
    for (const f of walk(L.proj).concat(walk(L.semble))) {
      const buf = fs.readFileSync(f)
      if (!isText(buf)) continue
      let t = buf.toString('utf8')
      const before = t
      for (const fm of forms) t = t.split(fm).join(L.root)
      if (t !== before) {
        fs.writeFileSync(f, t)
        hits++
      }
    }
    const G = ['-c', 'user.name=luf', '-c', 'user.email=luf@localhost', '-c', 'commit.gpgsign=false']
    execFileSync('git', ['-C', L.proj, ...G, 'add', '-A'])
    spawnSync('git', ['-C', L.proj, ...G, 'commit', '-qm', 'fixture: re-rooted to this lane'])
    if (this.fx.mcp) this.cli(L, ['mcp', 'add-json', '--scope', 'user', 'semble_code', JSON.stringify(this.fx.mcp).split(from).join(L.root)], null, L.proj)
    this.log(`${L.name}: fixture restored, ${hits} files re-rooted`)
  }

  // ---- P4 lane run in tmux ----
  async openSession(L) {
    const name = `luf-${L.name}`
    L.session = name
    L.debug = path.join(L.out, 'session.debug.log')
    const size = SIZES[L.name] ?? SIZES.l1
    tmux('new-session', '-d', '-s', name, '-x', size.w, '-y', size.h, '-c', L.proj, 'bash', LAUNCH, this.cfgSet ? this.cfg : '-', L.mode, L.debug, L.plugins, L.envFile, L.settings, this.o.effort)
    tmux('set-option', '-t', name, 'remain-on-exit', 'on')
    tmux('set-option', '-t', name, 'history-limit', '200000')
    this.sessions.push(name)
    const t0 = Date.now()
    let keyAt = 0
    let yesAt = 0
    while (Date.now() - t0 < 90000 && !isDead(name)) {
      const scr = grab(name)
      if (scr.includes('Yes, I trust this folder')) {
        const t = Date.now()
        const onYes = scr.includes('❯ Yes, I trust this folder')
        yesAt = onYes ? yesAt || t : 0
        if (t - keyAt >= 800 && (!onYes || t - yesAt >= 300)) {
          await press(name, onYes ? 'Enter' : 'Down')
          keyAt = Date.now()
        }
      } else if (/Yes, I accept/.test(scr) && /Bypass Permissions/i.test(scr)) {
        await press(name, scr.includes('❯ 1. No') || scr.includes('❯ No') ? 'Down' : 'Enter')
        await sleep(500)
      } else if (/New MCP servers? found in this project/.test(scr)) {
        // Default mode asks once for a project .mcp.json (semble may register there): approve this one, as its user would.
        L.mcpApproved = true
        await press(name, /❯ Use this MCP server/.test(scr) ? 'Enter' : 'Up')
        await sleep(500)
      } else if (promptEmpty(scr) && /mode on|permissions on/.test(scr)) return true
      await sleep(250)
    }
    fs.writeFileSync(path.join(L.out, 'boot.txt'), isDead(name) ? `(pane dead)\n${grab(name, { hist: true })}` : grab(name, { hist: true }))
    return false
  }

  save(L, stem) {
    fs.writeFileSync(path.join(L.out, `${stem}.screen.txt`), grab(L.session))
    fs.writeFileSync(path.join(L.out, `${stem}.screen.ansi.txt`), grab(L.session, { ansi: true }))
    fs.writeFileSync(path.join(L.out, `${stem}.hist.txt`), grab(L.session, { hist: true }))
  }

  transcriptFile(proj) {
    const dir = path.join(this.cfg, 'projects', slug(proj))
    if (!exists(dir)) return null
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(dir, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    return files[0] ?? null
  }

  async answer(L, step, q) {
    const name = L.session
    if (q.review) {
      await press(name, 'Enter')
      L.questions.push({ at: now(), step: step.id, review: 'submitted' })
      return
    }
    const pol = ANSWERS.find((a) => a.q.test(q.text))
    if (!pol) {
      L.questions.push({ at: now(), step: step.id, text: q.text, options: q.opts.map((o) => o.label), picked: 'UNEXPECTED: Escape' })
      await press(name, 'Escape')
      return
    }
    const free = (l) => /^(Skip|Type something\.?|Chat about this)$/.test(l)
    const want = pol.pick === '*' ? q.opts.filter((o) => !free(o.label) && !/^(Next|Submit)$/.test(o.label)).map((o) => o.label) : pol.pick
    const go = async (label) => {
      for (let i = 0; i < 12; i++) {
        const cur = questionOf(grab(name))
        if (!cur || cur.review) return false
        const t = cur.opts.find((o) => o.label === label || o.label.startsWith(`${label} `))
        const c = cur.opts.find((o) => o.cur)
        if (!t) return false
        if (c && c.n === t.n) return true
        await press(name, !c || c.n < t.n ? 'Down' : 'Up')
      }
      return false
    }
    const picked = []
    for (const label of want) {
      if (!(await go(label))) continue
      const cur = questionOf(grab(name))
      const t = cur?.opts?.find((o) => o.label === label || o.label.startsWith(`${label} `))
      if (q.multi && t?.box && t.box !== ' ') continue
      await press(name, 'Enter')
      picked.push(label)
      await sleep(300)
      if (!q.multi) break
    }
    if (q.multi) await press(name, 'Tab')
    L.questions.push({ at: now(), step: step.id, text: q.text, options: q.opts.map((o) => o.label), multi: q.multi, picked })
    await sleep(400)
  }

  async serve(L, step) {
    const name = L.session
    const t0 = Date.now()
    let idleAt = 0
    let lastDialog = ''
    for (;;) {
      if (isDead(name)) return 'pane died'
      const scr = grab(name)
      const q = questionOf(scr)
      const d = q ? null : permissionOf(scr)
      if (q) {
        await this.answer(L, step, q)
        idleAt = 0
      } else if (d) {
        if (d.block !== lastDialog) {
          L.prompts.push({ at: now(), step: step.id, kind: d.kind, claudeDir: d.claudeDir, protectedPath: d.protectedPath, question: d.question, block: d.block })
          lastDialog = d.block
        }
        await press(name, 'Enter')
        await waitFor(name, (s) => permissionOf(s)?.block !== d.block, 10000)
        idleAt = 0
      } else {
        lastDialog = ''
        const idle = !BUSY.test(scr) && promptEmpty(scr)
        const t = Date.now()
        if (!idle) idleAt = 0
        else if (!idleAt) idleAt = t
        // Idle long enough and the step's answer is in the transcript (or idle past the cap: the answer never came).
        if (idle && t - idleAt >= step.idleMs && t - t0 >= 6000 && (!step.done || step.done() || t - idleAt >= (step.idleCapMs ?? 180000))) return null
      }
      step.tick?.()
      if (Date.now() - t0 > step.minutes * 60000) return `timeout after ${step.minutes} min`
      await sleep(400)
    }
  }

  async submit(L, text) {
    await typeText(L.session, text)
    await sleep(300)
    await press(L.session, 'Enter')
    // A slash typeahead may take the first Enter.
    if ((await waitFor(L.session, (s) => promptEmpty(s) || BUSY.test(s), 4000)) === null) await press(L.session, 'Enter')
  }

  async runLane(L) {
    L.prompts = []
    L.questions = []
    L.steps = {}
    L.l3 = []
    const ok = await this.openSession(L)
    this.record(`${L.name}.boot`, ok, ok ? `${L.mode}, ${(SIZES[L.name] ?? SIZES.l1).w}x${(SIZES[L.name] ?? SIZES.l1).h}` : 'claude did not reach an empty prompt', ok ? '' : path.join(L.out, 'boot.txt'))
    if (!ok) {
      this.kill(L.session)
      return
    }
    L.before = { tree: treeHash(L.proj), head: this.git(L, 'rev-parse', 'HEAD'), stash: this.git(L, 'stash', 'list'), status: this.git(L, 'status', '--porcelain', '--ignored'), versions: this.versions(L) }
    const btOld = path.join(L.plugins, 'cache', MARKET, 'brewtools', '6.10.0')
    const ipj = path.join(L.plugins, 'installed_plugins.json')
    let lastL3 = ''
    const l3tick = () => {
      let v = '?'
      try {
        v = (JSON.parse(fs.readFileSync(ipj, 'utf8')).plugins?.[`brewtools@${MARKET}`] ?? []).map((x) => x.version).join(',')
      } catch {
        v = 'unreadable'
      }
      const s = `oldDir=${exists(btOld) ? 'present' : 'GONE'} installed=${v}`
      if (s !== lastL3) {
        L.l3.push({ at: now(), state: s })
        lastL3 = s
      }
    }
    // The startup sync installs every plugin some settings.json enables (the real profile enables the mods, even
    // under --setting-sources): remove them so plugin-update offers them, as for a user without mods.
    L.modsRemoved = Object.entries(L.before.versions).filter(([p]) => p.startsWith('brewmod-'))
    for (const [p] of L.modsRemoved) this.cli(L, ['plugin', 'uninstall', `${p}@${MARKET}`, '--scope', 'user'], 'uninstall')
    L.before.versions = this.versions(L)
    const answered = (re) => () => {
      const tf = this.transcriptFile(L.proj)
      return tf !== null && re.test(between(readJsonl(tf), L.stepStart).filter((e) => e.type === 'assistant').map(textOf).join('\n'))
    }
    const steps = [
      { id: 'pu', text: '/brewtools:plugin-update', minutes: 30, idleMs: 8000, before: () => this.setStage(L, `stage-${TARGET}`), tick: l3tick, done: answered(/^## .*brewcode(:| updated| is current| check)/m) },
      { id: 'reload', text: '/reload-plugins', minutes: 3, idleMs: 4000 },
      { id: 'su', text: '/brewcode:setup-status upgrade', minutes: 240, idleMs: 12000, done: answered(/^## .*Setups( upgraded|: nothing)/m), idleCapMs: 300000 },
      { id: 'rep', text: '/brewcode:setup-status', minutes: 30, idleMs: 10000, done: answered(/\| *Setup *\| *State *\|/) },
    ]
    for (const st of steps) {
      st.before?.()
      const t0 = now()
      L.stepStart = t0
      this.log(`${L.name}: ${st.text}`)
      await this.submit(L, st.text)
      const err = await this.serve(L, st)
      L.steps[st.id] = { start: t0, end: now(), err }
      this.save(L, st.id)
      if (err) {
        this.log(`${L.name}: ${st.id} ${err}`)
        break
      }
    }
    L.after = { tree: treeHash(L.proj), head: this.git(L, 'rev-parse', 'HEAD'), stash: this.git(L, 'stash', 'list'), status: this.git(L, 'status', '--porcelain', '--ignored'), versions: this.versions(L), oldDir: exists(btOld) }
    this.kill(L.session)
    const tf = this.transcriptFile(L.proj)
    if (tf) fs.copyFileSync(tf, path.join(L.out, 'transcript.jsonl'))
    const sub = tf ? path.join(path.dirname(tf), path.basename(tf, '.jsonl'), 'subagents') : null
    if (sub && exists(sub)) fs.cpSync(sub, path.join(L.out, 'subagents'), { recursive: true })
    this.checkLane(L, tf ? readJsonl(tf) : [])
  }

  git(L, ...args) {
    const r = spawnSync('git', ['-C', L.proj, ...args], { encoding: 'utf8' })
    return (r.stdout ?? '').trim()
  }

  // ---- P5 verdicts ----
  checkLane(L, tr) {
    const n = L.name
    const step = (id) => L.steps[id] ?? {}
    const inStep = (id) => (step(id).start ? between(tr, step(id).start, step(id).end) : [])
    const texts = (id) => inStep(id).filter((e) => e.type === 'assistant').map(textOf).join('\n')
    const results = (id) => inStep(id).filter((e) => e.type === 'user').flatMap((e) => blocks(e).filter((b) => b.type === 'tool_result').map(resultText)).join('\n')
    const tools = (id) => inStep(id).filter((e) => e.type === 'assistant').flatMap((e) => blocks(e).filter((b) => b.type === 'tool_use'))
    const file = (stem) => path.join(L.out, `${stem}.hist.txt`)
    for (const id of Object.keys(L.steps)) if (L.steps[id].err) this.record(`${n}.${id}.finished`, false, L.steps[id].err, file(id))

    // plugin-update
    const pu = texts('pu')
    const puRes = results('pu')
    const planIn = (id, re) => (re.test(texts(id)) ? 'assistant text' : re.test(results(id)) ? 'tool output only (collapsed in the TUI)' : '')
    const puPlan = planIn('pu', /PLAN — brewtools:plugin-update/)
    this.record(`${n}.pu.plan`, puPlan !== '', puPlan ? `PLAN block printed: ${puPlan}` : 'no PLAN block', file('pu'))
    const asks = tools('pu').filter((b) => b.name === 'AskUserQuestion')
    const qs = asks.flatMap((b) => (b.input?.questions ?? []).map((q) => q.question))
    this.record(`${n}.pu.one-question`, asks.length === 1 && qs[0] === 'Install the missing mods?', `${asks.length} AskUserQuestion call(s): ${JSON.stringify(qs)}`, file('pu'))
    const title = (pu.match(/^## .*brewcode.*$/m) ?? [''])[0]
    this.record(`${n}.pu.report-title`, /^## 🟢 brewcode updated: \d+ of \d+ components$/.test(title), title || 'no report title', file('pu'))
    const t = mdTable(pu, 'Component')
    const cell = (name) => t?.rows.find((r) => plain(r[0]).split(' ')[0] === name)
    const want = { brewcode: [this.o.old.slice(1), '6.10.1', '🟢 updated'], brewdoc: [this.o.old.slice(1), '6.10.1', '🟢 updated'], brewtools: ['6.10.0', '6.10.1', '🟢 updated'], 'brewmod-placeholders': ['—', '6.10.1', '🟢 installed'], 'brewmod-plan-effort': ['—', '6.10.1', '🟢 installed'], brewui: ['—', '—', '⚪ not installed'] }
    const bad = Object.entries(want).filter(([k, w]) => { const r = cell(k); return !r || plain(r[1]) !== w[0] || plain(r[2]) !== w[1] || r[3] !== w[2] }).map(([k]) => `${k}=${JSON.stringify(cell(k) ?? null)}`)
    this.record(`${n}.pu.report-table`, t !== null && bad.length === 0, bad.join('; ') || 'before -> after rows as expected', file('pu'))
    const v = L.after.versions
    const vBad = ['brewcode', 'brewdoc', 'brewtools', 'brewmod-placeholders', 'brewmod-plan-effort'].filter((p) => v[p] !== '6.10.1')
    this.record(`${n}.pu.installed`, vBad.length === 0, `claude plugin list: ${JSON.stringify(v)}`)
    this.record(`${n}.pu.next-steps`, /### Next steps[\s\S]*1\. 🔵 \*\*`\/reload-plugins`\*\*[\s\S]*2\. 🔵 \*\*`\/brewcode:setup-status upgrade`\*\*/.test(pu), 'Next steps: 1 /reload-plugins, 2 /brewcode:setup-status upgrade', file('pu'))
    const failedCmds = (puRes.match(/^❌ .*$/gm) ?? [])
    this.record(`${n}.pu.no-failed-fence`, failedCmds.length === 0, failedCmds.join(' | ') || 'no ❌ fence line', file('pu'))

    // Temp leftovers: plugin-update's SCRATCH dir and the runner's LOCK dir (recorded, then removed: they are this run's).
    const scratchDir = (puRes.match(/^SCRATCH (\S+)$/m) ?? [])[1]
    const scratchLeft = scratchDir !== undefined && exists(scratchDir)
    this.record(`${n}.pu.scratch-removed`, scratchDir !== undefined && !scratchLeft, scratchDir === undefined ? 'no SCRATCH line' : `${scratchDir} ${scratchLeft ? `left behind: ${fs.readdirSync(scratchDir).join(', ')}` : 'gone'}`)
    if (scratchLeft && /\/plugin-update\.[A-Za-z0-9]+$/.test(scratchDir)) fs.rmSync(scratchDir, { recursive: true, force: true })

    // L3: the old brewtools cache dir while its skill still runs, and Phases 5-6 after the self-update.
    const gone = L.l3.find((x) => x.state.startsWith('oldDir=GONE'))
    this.record(`L3.${n}.old-cache-dir`, !gone && L.after.oldDir, `${L.l3.map((x) => `${x.at.slice(11, 19)} ${x.state}`).join(' | ')}; at end oldDir=${L.after.oldDir ? 'present' : 'GONE'}`)
    const p5 = /✅ list OK/.test(puRes.split(/✅ update brewtools(?:@claude-brewcode)? OK/)[1] ?? '')
    const p6 = /✅ report OK/.test(puRes)
    this.record(`L3.${n}.phase5-6-after-self-update`, p5 && p6, `Phase 5 after-list ${p5 ? 'OK' : 'missing'}, Phase 6 report ${p6 ? 'OK' : 'missing/degraded'}`, file('pu'))

    // reload
    const dbg = exists(L.debug) ? fs.readFileSync(L.debug, 'utf8') : ''
    const reloaded = dbg.split('\n').filter((l) => step('reload').start && l.slice(0, 24) >= step('reload').start).some((l) => l.includes(`cache/${MARKET}/brewcode/6.10.1/hooks/hooks.json`))
    this.record(`${n}.reload`, reloaded, reloaded ? 'brewcode 6.10.1 hooks.json read after /reload-plugins' : 'debug log never read brewcode 6.10.1 after the reload', path.join(L.out, 'reload.screen.txt'))

    // setup-status upgrade (Phase 7) and the second report
    const su = texts('su')
    const suRes = results('su')
    const rn = suRes.match(/^RELOAD-NEEDED loaded=\S+ cached=\S+$/m)
    this.record(`${n}.su.reload-guard`, rn === null, rn ? `Phase 0 printed ${rn[0]}` : 'no RELOAD-NEEDED line', file('su'))
    const suPlan = planIn('su', /PLAN — brewcode:setup-status/)
    this.record(`${n}.su.plan`, suPlan !== '', suPlan ? `PLAN block printed: ${suPlan}` : 'no PLAN block', file('su'))
    const p7title = (su.match(/^## .*Setups.*$/m) ?? [''])[0]
    this.record(`${n}.su.phase7`, /^## (🟢|🔵|🔴) Setups upgraded: \d+ of \d+ done/.test(p7title), p7title || 'no Phase 7 title', file('su'))
    const p7 = mdTable(su, '#')
    L.phase7 = p7 ? p7.rows.map((r) => ({ setup: plain(r[1]), before: plain(r[2]), after: plain(r[3]), result: r[4] })) : []
    const all = Object.keys(L.steps).flatMap((id) => tools(id).map((b) => ({ ...b, step: id })))
    const spawns = all.filter((b) => b.name === 'Agent' || b.name === 'Task')
    L.spawns = spawns.map((b) => spawnOf(b, b.step))
    L.windows = spawnWindows(tr, L.spawns)
    const upWins = L.windows.filter((w) => w.type === 'brewcode:setup-upgrader').sort((a, b) => a.si - b.si)
    const upIdx = upWins.length ? inStep(upWins.at(-1).step).map((e) => tr.indexOf(e)) : []
    const contract = judgeSpawns(tr, upWins, upIdx.length ? Math.max(...upIdx) + 1 : tr.length)
    this.record(`${n}.su.spawn-contract`, contract.ok, contract.detail)
    const suSpawns = L.spawns.filter((s) => s.step === 'su')
    this.record(`${n}.su.spawns`, suSpawns.length > 0 && suSpawns.every((s) => s.type === 'brewcode:setup-upgrader'), `${suSpawns.length} spawn(s): ${suSpawns.map((s) => `${s.desc} [${s.type}/${s.model || 'inherit'}]`).join('; ')}`)
    const lock = (suRes.match(/^LOCK (\S+)$/m) ?? [])[1]
    const lockLeft = lock !== undefined && exists(lock)
    this.record(`${n}.su.unlocked`, lock !== undefined && !lockLeft, lock === undefined ? 'no LOCK line' : `${lock} ${lockLeft ? 'still held at the end' : 'released'}`)
    if (lockLeft && /brewcode-setup-upgrade-\d+$/.test(lock)) fs.rmdirSync(lock)
    const outside = (suRes.match(/^OUTSIDE .*$/gm) ?? [])
    this.record(`${n}.su.scope-guard`, outside.length === 0 && /✅ scope/.test(suRes), outside.join(' | ') || (/✅ scope/.test(suRes) ? 'no OUTSIDE, ✅ scope' : 'scope check never printed ✅ scope'), file('su'))
    this.record(`${n}.git`, L.before.head === L.after.head && L.before.stash === L.after.stash, `HEAD ${L.before.head.slice(0, 10)} -> ${L.after.head.slice(0, 10)}; stash ${L.before.stash.split('\n').filter(Boolean).length} -> ${L.after.stash.split('\n').filter(Boolean).length}`)

    const rep = texts('rep')
    const st = mdTable(rep, 'Setup')
    L.report = st ? st.rows.map((r) => ({ setup: plain(r[0]), state: plain(r[1]), installed: plain(r[2]), plugin: plain(r[3]), found: r[4], command: r[5] })) : []
    const rowOf = (s) => SETUP_ROW[(s.match(/:([a-z-]+-setup)/) ?? [])[1]]
    const aBad = []
    const aSeen = []
    for (const row of A_ROWS) {
      if ((row === 2 && !this.uv) || !FX_ROWS.some((r) => r.row === row)) continue
      const r = L.report.find((x) => rowOf(x.setup) === row)
      const okState = r && (r.state === 'current' || (row === 8 && r.state === 'disabled' && !/upgrade/.test(r.command)))
      aSeen.push(row)
      if (!okState) aBad.push(`row ${row}: ${r ? `${r.state} (${r.installed} vs ${r.plugin})` : 'not in the report'}`)
    }
    this.record(`${n}.A-rows-current`, st !== null && aBad.length === 0, st === null ? 'second report has no setups table' : aBad.join('; ') || `rows ${aSeen.join(',')} current`, file('rep'))
    const bState = B_ROWS.filter((row) => FX_ROWS.some((r) => r.row === row)).map((row) => { const r = L.report.find((x) => rowOf(x.setup) === row); return `${row}:${r ? r.state : '?'}` })
    this.record(`${n}.B-rows-after`, true, bState.join(' '), file('rep'))

    // Independent scope check: every changed project path inside a ran row's owned prefixes or the common ones.
    const ran = new Set(L.phase7.map((r) => rowOf(r.setup.includes(':') ? r.setup : `x:${r.setup.split(' ')[0]}`)).filter(Boolean))
    const allow = [...COMMON, ...[...ran].flatMap((r) => OWNED[r] ?? [])]
    const diff = treeDiff(L.before.tree, L.after.tree)
    L.diff = diff
    const stray = diff.filter((d) => !allow.some((p) => d.path === p || d.path.startsWith(p)))
    this.record(`${n}.scope.harness`, stray.length === 0, stray.length ? `outside owned prefixes: ${stray.map((d) => `${d.change} ${d.path}`).join(', ')}` : `${diff.length} changed paths, all inside rows ${[...ran].sort((a, b) => a - b).join(',')} + common prefixes`)
    // Product scope guard vs reality: added files under an ignored .claude/ the guard could not see.
    const ignoredAdds = diff.filter((d) => d.change === 'added' && L.after.status.split('\n').some((l) => l.startsWith('!! ') && d.path.startsWith(l.slice(3).replace(/\/$/, ''))))
    L.ignoredAdds = ignoredAdds
    if (L.mode === 'default') this.record(`L2.${n}.prompts`, L.prompts.length > 0, `${L.prompts.length} permission prompts, ${L.prompts.filter((p) => p.claudeDir).length} on .claude/ paths`)
    fs.writeFileSync(path.join(L.out, 'lane.json'), `${JSON.stringify({ name: n, mode: L.mode, steps: L.steps, before: { ...L.before, tree: undefined }, after: { ...L.after, tree: undefined }, l3: L.l3, questions: L.questions, prompts: L.prompts, modsRemoved: L.modsRemoved, mcpApproved: Boolean(L.mcpApproved), spawns: L.windows, phase7: L.phase7, report: L.report, diff, ignoredAdds }, null, 2)}\n`)
  }

  // Prompt counts per upgrader window (Agent tool_use -> tool_result), rest = main session or plugin-update.
  promptTable(L) {
    const rows = new Map()
    const key = (p) => {
      const w = (L.windows ?? []).find((x) => x.start && p.at >= x.start && (!x.end || p.at <= x.end))
      return w ? `${w.desc} (${w.step})` : `${p.step} (main)`
    }
    for (const p of L.prompts) {
      const k = key(p)
      const r = rows.get(k) ?? { where: k, total: 0, claudeDir: 0, protectedPath: 0, bash: 0, edit: 0, read: 0, other: 0 }
      r.total++
      if (p.claudeDir) r.claudeDir++
      if (p.protectedPath) r.protectedPath++
      if (/^Bash/i.test(p.kind)) r.bash++
      else if (/^(Create|Edit|Write)/i.test(p.kind)) r.edit++
      else if (/^Read/i.test(p.kind)) r.read++
      else r.other++
      rows.set(k, r)
    }
    return [...rows.values()]
  }

  copyTranscripts(proj, dest) {
    const dir = path.join(this.cfg, 'projects', slug(proj))
    if (exists(dir)) fs.cpSync(dir, dest, { recursive: true })
  }

  kill(name) {
    try {
      tmux('kill-session', '-t', name)
    } catch {
      // already gone
    }
  }

  finish() {
    const after = this.guardState()
    const changed = Object.keys({ ...this.guardBefore, ...after }).filter((k) => this.guardBefore[k] !== after[k])
    this.record('profile.untouched', changed.length === 0, changed.length ? `CHANGED in ${this.cfg}: ${changed.join(', ')}` : `${Object.keys(after).length} guarded entries byte-identical (settings.json ${after['settings.json'].slice(0, 12)})`)
    fs.writeFileSync(path.join(this.out, 'profile-guard.json'), `${JSON.stringify({ cfg: this.cfg, before: this.guardBefore, after }, null, 2)}\n`)
    let left = ''
    try {
      left = tmux('list-sessions')
    } catch {
      left = ''
    }
    this.record('cleanup.tmux', left.trim() === '', left.trim() || `no session left on socket ${SOCK}`)
  }

  // Human-readable digest of this run beside summary.tsv: verdicts, per-lane questions, prompts, upgrader rows, report rows.
  autoReport(lanes) {
    const md = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
    const out = [`# live-update-flow run ${this.stamp}`, '', `claude ${this.cc}; profile ${this.cfg}; old ${this.o.old}; snapshot ${JSON.stringify(this.facts.snapshot ?? {})}`, '', '| Check | Result | Detail |', '|---|---|---|']
    for (const r of this.rows) out.push(`| ${r.id} | ${r.ok ? 'PASS' : 'FAIL'} | ${md(r.detail)} |`)
    for (const [k, L] of Object.entries(lanes)) {
      out.push('', `## Lane ${k} (${L.mode})`, '', '### Questions', '', '| Step | Question | Picked |', '|---|---|---|')
      for (const q of L.questions ?? []) if (!q.review) out.push(`| ${q.step} | ${md(q.text).slice(0, 160)} | ${md(Array.isArray(q.picked) ? q.picked.join(', ') : q.picked)} |`)
      out.push('', '### Upgrader spawns', '', '| Spawn | Model | Background | Start | End | RESULT |', '|---|---|---|---|---|---|')
      for (const w of L.spawns ?? []) out.push(`| ${md(w.desc)} | ${md(w.model || 'inherit')} | ${w.background ? 'yes' : 'no'} | ${(w.start ?? '').slice(11, 19)} | ${(w.end ?? '').slice(11, 19)} | ${md(w.result)} |`)
      out.push('', '### Permission prompts', '', '| Where | Total | Mention .claude/ | Protected-path warning | Bash | Edit/Write | Read | Header off screen |', '|---|---|---|---|---|---|---|---|')
      for (const p of L.prompts ?? []) out.push(`| ${md(p.where)} | ${p.total} | ${p.claudeDir} | ${p.protectedPath} | ${p.bash} | ${p.edit} | ${p.read} | ${p.other} |`)
      out.push('', '### Phase 7', '', '| Setup | Before | After | Result |', '|---|---|---|---|')
      for (const r of L.phase7 ?? []) out.push(`| ${md(r.setup)} | ${md(r.before)} | ${md(r.after)} | ${md(r.result)} |`)
      out.push('', '### Second report', '', '| Setup | State | Installed | Plugin | Command |', '|---|---|---|---|---|')
      for (const r of L.report ?? []) out.push(`| ${md(r.setup)} | ${md(r.state)} | ${md(r.installed)} | ${md(r.plugin)} | ${md(r.command)} |`)
      out.push('', `L3 timeline: ${(L.l3 ?? []).map((x) => `${x.at.slice(11, 19)} ${x.state}`).join(' -> ')}`)
      out.push('', `Changed project paths (${(L.diff ?? []).length}): ${(L.diff ?? []).map((d) => `${d.change} ${d.path}`).join(', ')}`)
      out.push('', `Added under an ignored path (invisible to git status): ${(L.ignoredAdds ?? []).map((d) => d.path).join(', ') || 'none'}`)
    }
    fs.writeFileSync(path.join(this.out, 'report-auto.md'), `${out.join('\n')}\n`)
  }

  summary() {
    const body = this.rows.map((r) => [r.id, r.ok ? 'PASS' : 'FAIL', r.detail, r.file].map((x) => String(x).replace(/[\t\n]/g, ' ')).join('\t'))
    fs.writeFileSync(path.join(this.out, 'summary.tsv'), `${['id\tresult\tdetail\tfile', ...body].join('\n')}\n`)
    const lanes = Object.fromEntries(Object.entries(this.facts.lanes).map(([k, L]) => [k, { mode: L.mode, prompts: this.promptTable(L), questions: L.questions, phase7: L.phase7, report: L.report, l3: L.l3, spawns: L.windows, ignoredAdds: L.ignoredAdds, diff: L.diff }]))
    fs.writeFileSync(path.join(this.out, 'facts.json'), `${JSON.stringify({ ...this.facts, lanes, fixture: this.fx, scratch: this.scratch, cc: this.cc }, null, 2)}\n`)
    this.autoReport(lanes)
    const failed = this.rows.filter((r) => !r.ok)
    process.stdout.write(`\n${this.rows.length - failed.length} PASS, ${failed.length} FAIL${failed.length ? `: ${failed.map((r) => r.id).join(', ')}` : ''}\nout: ${this.out}\n`)
    return failed.length === 0 ? 0 : 1
  }

  stopServer() {
    if (this.server && this.server.exitCode === null) this.server.kill()
  }

  // Transcript dirs this run made in the real profile: copied above, then removed (they hold only scratch sessions).
  dropTranscriptDirs() {
    for (const p of [path.join(this.scratch, 'fx', 'proj'), ...this.o.lanes.map((l) => path.join(this.scratch, l, 'proj'))]) {
      const d = path.join(this.cfg, 'projects', slug(p))
      if (exists(d) && d.includes('-luf-')) fs.rmSync(d, { recursive: true, force: true })
    }
  }
}

async function main() {
  const o = parseArgs(process.argv.slice(2))
  if (o.judge) {
    process.exitCode = judgeFile(o.judge)
    return
  }
  const run = new Run(o)
  run.preflight()
  const stop = () => {
    for (const s of run.sessions) run.kill(s)
    run.stopServer()
    process.exit(2)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  let rc = 2
  try {
    await run.snapshot()
    await run.startServer()
    await run.fixture()
    if (o.fixtureOnly) {
      process.stdout.write(`fixture ${run.fx.cached ? 'cached' : 'built'}: ${run.fx.tgz}\n${(run.fx.results ?? []).map((x) => `  row ${x.row} ${x.skill}: ${x.status}${x.minutes ? ` (${x.minutes} min${x.committed ? ', child moved HEAD' : ''})` : ''}`).join('\n')}\n`)
      run.stopServer()
      run.dropTranscriptDirs()
      fs.rmSync(run.scratch, { recursive: true, force: true })
      process.exit((run.fx.results ?? []).some((x) => x.status === 'FAILED') ? 1 : 0)
    }
    const lanes = o.lanes.map((name) => {
      const L = run.lane(name)
      L.mode = o.modes[name]
      run.restoreFixture(L)
      L.pre = run.preparePlugins(L, true)
      run.facts.lanes[name] = L
      return L
    })
    if (o.prepareOnly) {
      for (const L of lanes) {
        process.stdout.write(`\nlane ${L.name}: project ${L.proj}\n  launch: (cd ${L.proj} && bash ${LAUNCH} ${run.cfgSet ? run.cfg : '-'} ${L.mode} ${path.join(L.out, 'session.debug.log')} ${L.plugins} ${L.envFile} ${L.settings} ${o.effort})\n  before typing /brewtools:plugin-update: git -C ${L.market} update-ref refs/heads/main refs/heads/stage-${TARGET}\n  then: /reload-plugins, /brewcode:setup-status upgrade, /brewcode:setup-status\n`)
      }
      process.stdout.write(`\ngit server pid ${run.server.pid} on port ${run.port}; Ctrl-C stops it (scratch ${run.scratch} stays)\n`)
      await new Promise(() => {})
    }
    if (o.parallel) await Promise.all(lanes.map((L) => run.runLane(L)))
    else for (const L of lanes) await run.runLane(L)
    run.finish()
    rc = run.summary()
  } finally {
    for (const s of run.sessions) run.kill(s)
    run.stopServer()
  }
  if (rc === 0 && !o.keep) {
    run.dropTranscriptDirs()
    fs.rmSync(run.scratch, { recursive: true, force: true })
    process.stdout.write(`scratch removed: ${run.scratch}\n`)
  } else process.stdout.write(`scratch kept: ${run.scratch}\n`)
  process.exit(rc)
}

main().catch((e) => {
  process.stderr.write(`harness error: ${e?.stack ?? e}\n`)
  process.exit(2)
})
