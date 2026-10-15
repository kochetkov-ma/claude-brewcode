// Live harness driver: real claude in tmux (screen cases) and claude -p (received-context cases); usage in README.md.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { CASES, SESSIONS, INLINE, GLOBAL_FIXTURES } from './cases.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../..')
const MOD_SRC = path.join(REPO, 'brewmod-placeholders')
const BASE = '/Users/maximus/Archives/claude-brewcode-reports/20261015-193500_scope-preview/live'
const LAUNCH = path.join(HERE, 'launch.sh')
const SOCK = 'lp'
const DISABLE = { 'brewmod-placeholders@claude-brewcode': false }
// The parent session's identity vars; a child that inherits them can attach to it.
const SCRUB = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN', 'CLAUDE_CODE_EXECPATH', 'CLAUDE_PID', 'CLAUDE_MODEL', 'CLAUDE_EFFORT', 'CLAUDE_CODE_SSE_PORT']
const BORDER = /^─{20,}\s*$/
const BAND_MARK = /send as typed:|move the caret off|names: \/placeholders list|placeholders off:|to turn them back on/
const POLL_MS = 120
const STABLE_MS = 350
const CHECK_MS = 8000
const FIRST_CHECK_MS = 15000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// The copy reads its global layer root from this var (CLAUDE_CONFIG_DIR stays the real profile for login); isolated sessions get a scratch dir.
const ISO_ENV = 'LP_PLACEHOLDERS_CFG'
// A turn in progress: the spinner row (`Concocting… (6s · ↓ 531 tokens)`).
const BUSY = /esc to interrupt|…\s*\(\d+s/i

const USAGE = `usage: bash run.sh [--cp 1-5] [--only id,id] [--size WxH] [--out dir] [--installed] [--no-e2e | --e2e-only] [--model m] [--fingerprint hex]
  --cp N       checkpoint: runs cases tagged cp <= N (4 and 5 = all); output <base>/cpN (default 4)
  --only ids   exactly these case ids, any checkpoint
  --size WxH   only tmux cases of that terminal size
  --installed  CP5: the installed plugin of CLAUDE_CONFIG_DIR, no --plugin-dir
  --no-e2e / --e2e-only   skip / only the claude -p cases
  --fingerprint hex       stop (rc 2) unless sha256 of the copy's "<sha256>  hooks/<file>" list equals hex
rc: 0 all selected pass, 1 a case failed, 2 harness error`

function fail2(msg) {
  process.stderr.write(`${msg}\n${USAGE}\n`)
  process.exit(2)
}

function parseArgs(argv) {
  const o = { cp: 4, only: null, size: null, out: null, installed: false, e2e: true, tmux: true, model: 'haiku', fingerprint: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const val = () => (i + 1 < argv.length ? argv[++i] : fail2(`${a} needs a value`))
    if (a === '--cp') o.cp = Number(val())
    else if (a === '--only') o.only = val().split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--size') o.size = val()
    else if (a === '--out') o.out = path.resolve(val())
    else if (a === '--model') o.model = val()
    else if (a === '--installed') o.installed = true
    else if (a === '--fingerprint') o.fingerprint = val().toLowerCase()
    else if (a === '--no-e2e') o.e2e = false
    else if (a === '--e2e-only') o.tmux = false
    else if (a === '-h' || a === '--help') fail2('help')
    else fail2(`unknown argument ${a}`)
  }
  if (![1, 2, 3, 4, 5].includes(o.cp)) fail2('--cp must be 1-5')
  if (o.size !== null && !/^\d+x\d+$/.test(o.size)) fail2('--size must be WxH')
  return o
}

function select(o) {
  if (o.only !== null) {
    const bad = o.only.filter((id) => !CASES.some((x) => x.id === id))
    if (bad.length > 0) fail2(`unknown case ids: ${bad.join(', ')}`)
  }
  return CASES.filter((x) => {
    const isPrint = x.kind === 'print'
    // An isolated (writing) case needs the patched copy: never under --installed, which would write the real global dir.
    if (o.installed && (SESSIONS[x.session]?.isolate === true || x.globalFiles !== undefined)) {
      if (o.only?.includes(x.id)) fail2(`${x.id} writes the global layer and cannot run under --installed`)
      return false
    }
    if (o.only !== null) return o.only.includes(x.id)
    if (x.cp > o.cp) return false
    if (isPrint ? !o.e2e : !o.tmux) return false
    return o.size === null || (!isPrint && sizeOf(x) === o.size)
  })
}

const sizeOf = (x) => x.size ?? SESSIONS[x.session]?.size
// Tree fingerprint (path + mtime + size of every mod source file); equal 3 s apart = no peer mid-edit, else wait (60 s max).
const fingerprint = () => walkFiles(path.join(MOD_SRC, 'hooks')).concat(walkFiles(path.join(MOD_SRC, 'placeholders'))).sort().map((f) => { const s = fs.statSync(f); return `${f}:${s.mtimeMs}:${s.size}` }).join('\n')
async function settled() {
  let prev = fingerprint()
  for (let i = 0; i < 20; i++) {
    await sleep(3000)
    const now = fingerprint()
    if (now === prev) return
    process.stderr.write('mod tree still changing, waiting\n')
    prev = now
  }
  fail2('mod tree kept changing for 60 s')
}
const listDir = (d) => (fs.existsSync(d) ? fs.readdirSync(d).sort() : [])
const walkFiles = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkFiles(path.join(d, e.name)) : [path.join(d, e.name)])) : [])
// In a string expectation: `{PCFG}` = the session's global layer root, `{GDIR}` = its placeholders dir as the mod shows it (`~` for HOME).
const tilde = (p) => (p.startsWith(`${os.homedir()}/`) ? `~${p.slice(os.homedir().length)}` : p)
const subst = (item, pcfg) => {
  const one = (p) => (typeof p === 'string' ? p.split('{PCFG}').join(pcfg).split('{GDIR}').join(`${tilde(pcfg)}/placeholders`) : p)
  return Array.isArray(item) ? [item[0], one(item[1])] : one(item)
}
// The coordinator's tree fingerprint: sha256 over "<sha256>  <path>" lines of every hooks/**/*.{ts,tsx,mjs}, sorted by path.
function treeFingerprint(root) {
  const files = walkFiles(path.join(root, 'hooks')).filter((f) => /\.(ts|tsx|mjs)$/.test(f)).map((f) => path.relative(root, f)).sort()
  const list = files.map((f) => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex')}  ${f}\n`).join('')
  return crypto.createHash('sha256').update(list).digest('hex')
}
const modeOf = (x) => x.mode ?? SESSIONS[x.session]?.mode ?? 'default'
const tuiOf = (x) => x.tui ?? SESSIONS[x.session]?.tui ?? 'default'

const tmux = (...args) => execFileSync('tmux', ['-L', SOCK, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
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
    await sleep(90)
  }
}

// band = rows above the prompt box (transcript included), prompt = the box, below = footer (+ typeahead in the default TUI).
// menu = where the typeahead draws: below the box in the default TUI, above it in fullscreen.
function regions(screen, tui = 'default') {
  const r = boxRegions(screen)
  return { ...r, menu: tui === 'fullscreen' ? r.band : r.below }
}
function boxRegions(screen) {
  const lines = screen.split('\n')
  let top = -1
  for (let i = lines.length - 2; i >= 0; i--) {
    if (BORDER.test(lines[i]) && lines[i + 1].startsWith('❯')) {
      top = i
      break
    }
  }
  if (top < 0) return { band: screen, prompt: '', below: '' }
  let bot = lines.findIndex((l, i) => i > top && BORDER.test(l))
  if (bot < 0) bot = lines.length
  return { band: lines.slice(0, top).join('\n'), prompt: lines.slice(top + 1, bot).join('\n'), below: lines.slice(bot + 1).join('\n') }
}

const has = (text, pat) => (pat instanceof RegExp ? pat.test(text) : text.includes(pat))
const show = (pat) => (pat instanceof RegExp ? String(pat) : JSON.stringify(pat))
const promptEmpty = (screen) => /^❯\s*$/.test(regions(screen).prompt.split('\n')[0] ?? '')

function debugSince(file, since) {
  if (!fs.existsSync(file)) return ''
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => (l.slice(0, 24) >= since))
    .join('\n')
}

// One screen + optional history/ansi -> missing expectations and present forbidden strings.
function evaluate(snap, chk, debugText, tui) {
  const r = regions(snap.screen, tui)
  const pick = (item) => {
    const [where, pat] = Array.isArray(item) ? item : ['screen', item]
    const text = where === 'hist' ? snap.hist : where === 'ansi' ? snap.ansi : where === 'screen' ? snap.screen : r[where]
    return { where, pat, text: text ?? '' }
  }
  const problems = []
  for (const item of chk.expect) {
    const p = pick(item)
    if (!has(p.text, p.pat)) problems.push(`missing ${p.where}:${show(p.pat)}`)
  }
  for (const item of chk.forbid) {
    const p = pick(item)
    if (has(p.text, p.pat)) problems.push(`forbidden ${p.where}:${show(p.pat)}`)
  }
  for (const re of chk.debugExpect ?? []) if (!re.test(debugText)) problems.push(`debug missing ${re}`)
  for (const re of chk.debugForbid ?? []) if (re.test(debugText)) problems.push(`debug has ${re}`)
  // order: items whose first occurrences must appear in this order (a confirm question before the write it confirms).
  let at = -1
  for (const item of chk.order ?? []) {
    const p = pick(item)
    const i = p.pat instanceof RegExp ? p.text.search(p.pat) : p.text.indexOf(p.pat)
    if (i < 0) problems.push(`order: missing ${p.where}:${show(p.pat)}`)
    else if (i < at) problems.push(`order: ${p.where}:${show(p.pat)} came too early`)
    at = Math.max(at, i)
  }
  return problems
}

function wants(chk, where) {
  return [...chk.expect, ...chk.forbid, ...(chk.order ?? [])].some((i) => Array.isArray(i) && i[0] === where)
}

async function runCheck(s, chk, timeoutMs, since) {
  const needHist = wants(chk, 'hist')
  const needAnsi = wants(chk, 'ansi')
  const t0 = Date.now()
  let prev = null
  let stableAt = Date.now()
  let snap = null
  let problems = []
  for (;;) {
    snap = { screen: grab(s.name), hist: needHist ? grab(s.name, { hist: true }) : '', ansi: needAnsi ? grab(s.name, { ansi: true }) : '' }
    problems = evaluate(snap, chk, debugSince(s.debug, since), s.spec.tui)
    const now = Date.now()
    if (snap.screen !== prev) {
      prev = snap.screen
      stableAt = now
    } else if (problems.length === 0 && now - stableAt >= STABLE_MS) break
    if (now - t0 > timeoutMs || isDead(s.name)) break
    await sleep(POLL_MS)
  }
  return { problems, snap }
}

function save(out, stem, snap, name) {
  const file = path.join(out, `${stem}.txt`)
  fs.writeFileSync(file, snap.screen)
  fs.writeFileSync(path.join(out, `${stem}.ansi.txt`), snap.ansi !== '' ? snap.ansi : grab(name, { ansi: true }))
  if (snap.hist !== '') fs.writeFileSync(path.join(out, `${stem}.hist.txt`), snap.hist)
  return file
}

async function waitFor(name, test, ms) {
  const t0 = Date.now()
  for (;;) {
    const screen = grab(name)
    if (test(screen)) return screen
    if (Date.now() - t0 > ms || isDead(name)) return null
    await sleep(POLL_MS)
  }
}

async function clearDraft(name) {
  for (let i = 0; i < 3; i++) {
    if (i === 2) await press(name, 'Escape')
    await press(name, 'End')
    await press(name, 'C-u')
    const ok = await waitFor(name, (scr) => promptEmpty(scr) && !BAND_MARK.test(regions(scr).band), 3000)
    if (ok !== null) return true
  }
  return false
}

// Enter; a typeahead that took the first Enter leaves the text in the box, so one more.
async function submit(name) {
  await press(name, 'Enter')
  if ((await waitFor(name, promptEmpty, 2500)) === null) await press(name, 'Enter')
}

// One model turn; a plan-mode question or approval dialog is dismissed with Esc.
async function modelTurn(name, prompt, token) {
  await typeText(name, prompt)
  await press(name, 'Enter')
  const t0 = Date.now()
  let dismissed = 0
  while (Date.now() - t0 < 150000) {
    const scr = grab(name)
    if (/Enter to (select|confirm)/.test(scr) && /Esc to cancel/.test(scr) && dismissed < 3) {
      dismissed++
      await press(name, 'Escape')
    } else if (scr.split(token).length - 1 >= 2 && !BUSY.test(scr) && promptEmpty(scr)) return true
    if (isDead(name)) return false
    await sleep(400)
  }
  return false
}

class Run {
  constructor(o) {
    this.o = o
    this.id = `lp-${Date.now().toString(36)}`
    this.cfg = process.env.CLAUDE_CONFIG_DIR || '/Users/maximus/.claude-d'
    this.out = o.out ?? path.join(BASE, o.installed ? `cp${o.cp}-${path.basename(this.cfg)}` : `cp${o.cp}`)
    this.sessions = []
    this.rows = []
    this.n = 0
  }

  async setup() {
    if (!this.o.installed) await settled()
    if (fs.existsSync(this.out) && fs.readdirSync(this.out).length > 0) fs.renameSync(this.out, `${this.out}.prev-${new Date().toISOString().replace(/[:.]/g, '-')}`)
    fs.mkdirSync(path.join(this.out, 'sessions'), { recursive: true })
    // /tmp keeps paths short, so tool results with paths wrap less.
    this.scratch = fs.realpathSync(fs.mkdtempSync(path.join(fs.existsSync('/tmp') ? '/tmp' : os.tmpdir(), 'lp-')))
    this.proj = path.join(this.scratch, 'proj')
    fs.mkdirSync(path.join(this.proj, '.claude', 'placeholders'), { recursive: true })
    fs.writeFileSync(path.join(this.proj, '.claude', 'placeholders', INLINE.file), `---\ndescription: "${INLINE.description}"\ninsert: inline\n---\n${INLINE.body}\n`)
    this.mod = '-'
    if (!this.o.installed) {
      this.mod = path.join(this.scratch, 'mod', 'brewmod-placeholders')
      fs.mkdirSync(this.mod, { recursive: true })
      const r = spawnSync('rsync', ['-a', '--exclude', '.state', '--exclude', 'node_modules', '--exclude', '.claude-plugin/types', '--exclude', 'tsconfig.json', '--exclude', 'tests', `${MOD_SRC}/`, `${this.mod}/`], { encoding: 'utf8' })
      if (r.status !== 0) fail2(`rsync failed: ${r.stderr}`)
    }
    this.env = { ...process.env, CLAUDE_CONFIG_DIR: this.cfg, [ISO_ENV]: this.cfg }
    for (const k of SCRUB) delete this.env[k]
    // Isolated global root under HOME (~/Library/Caches), so saved paths show the `~` form the mod prints for real profiles.
    const caches = path.join(os.homedir(), 'Library', 'Caches')
    this.pcfgRoot = fs.realpathSync(fs.mkdtempSync(path.join(fs.existsSync(caches) ? caches : this.scratch, 'lp-')))
    this.pcfg = path.join(this.pcfgRoot, 'cfg')
    fs.mkdirSync(path.join(this.pcfg, 'placeholders'), { recursive: true })
    for (const [file, text] of Object.entries(GLOBAL_FIXTURES)) fs.writeFileSync(path.join(this.pcfg, 'placeholders', file), text)
    this.realGlobal = path.join(this.cfg, 'placeholders')
    this.realBefore = listDir(this.realGlobal)
    this.snapshot()
    if (this.mod !== '-') {
      this.patchCopy()
      this.preflight()
    }
  }

  // A copy taken mid-edit does not load and fails every case: validate it first (rc 0 or the run stops with rc 2).
  preflight() {
    const v = spawnSync('claude', ['plugin', 'validate', this.mod], { env: this.env, encoding: 'utf8', input: '' })
    fs.writeFileSync(path.join(this.out, 'preflight-validate.txt'), `rc ${v.status}\n${v.stdout ?? ''}${v.stderr ?? ''}`)
    if (v.status !== 0) fail2(`the mod copy does not validate (rc ${v.status}), see ${path.join(this.out, 'preflight-validate.txt')}`)
  }

  // Global layer root -> ISO_ENV in every env read of the copy; a read left unpatched would let a case write the real dir.
  patchCopy() {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|tsx|mjs)$/.test(e.name) ? [path.join(d, e.name)] : []))
    const hits = []
    for (const f of walk(path.join(this.mod, 'hooks'))) {
      const src = fs.readFileSync(f, 'utf8')
      const out = src.split("$.env.get('CLAUDE_CONFIG_DIR')").join(`$.env.get('${ISO_ENV}')`).split('env.CLAUDE_CONFIG_DIR').join(`env.${ISO_ENV}`)
      if (out !== src) {
        fs.writeFileSync(f, out)
        hits.push(`${path.relative(this.mod, f)} ${src.split('CLAUDE_CONFIG_DIR').length - out.split('CLAUDE_CONFIG_DIR').length}`)
      }
      if (/get\('CLAUDE_CONFIG_DIR'\)|env\.CLAUDE_CONFIG_DIR/.test(out)) fail2(`patch left a CLAUDE_CONFIG_DIR read in ${f}`)
    }
    if (!hits.some((h) => h.startsWith('hooks/register.ts')) || !hits.some((h) => h.endsWith('.mjs') || h.includes('.mjs '))) fail2(`config-dir patch did not hit register.ts and inject.mjs: ${hits.join(', ')}`)
    fs.appendFileSync(path.join(this.out, 'snapshot.txt'), `patched (hashes above are before it): ${ISO_ENV} in ${hits.join(', ')}\nisolated global root ${this.pcfg}\n`)
  }

  // Real global dir unchanged by the run; the scratch global dir is listed, then deleted.
  guard() {
    const after = listDir(this.realGlobal)
    const added = after.filter((f) => !this.realBefore.includes(f))
    const scratch = walkFiles(this.pcfg).map((f) => `--- ${f}\n${fs.readFileSync(f, 'utf8')}`)
    fs.writeFileSync(path.join(this.out, 'scope-files.txt'), `${scratch.join('\n') || '(no files)'}\n`)
    fs.rmSync(this.pcfgRoot, { recursive: true, force: true })
    if (added.length > 0) this.record({ id: 'guard-real-global', title: `${this.realGlobal} unchanged by the run`, cp: 1, kind: 'print' }, [`NEW FILES IN THE REAL GLOBAL DIR: ${added.join(', ')}`], this.realGlobal)
  }

  // Which bytes were tested: per-file sha256 of the copied mod, CLI version, git head.
  snapshot() {
    const lines = [`run ${this.id} ${new Date().toISOString()}`, `args ${process.argv.slice(2).join(' ')}`, `config ${this.cfg}`, `scratch ${this.scratch}`, `mod ${this.mod === '-' ? 'installed (no --plugin-dir)' : this.mod}`]
    const v = spawnSync('claude', ['--version'], { env: this.env, encoding: 'utf8', input: '' })
    lines.push(`claude ${(v.stdout ?? '').trim()}`)
    const g = spawnSync('git', ['-C', REPO, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' })
    lines.push(`git ${(g.stdout ?? '').trim()} ${(spawnSync('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout ?? '').trim()}`)
    lines.push(`trust entry added for project ${this.proj}`)
    if (this.mod !== '-') {
      this.fingerprint = treeFingerprint(this.mod)
      lines.push(`fingerprint ${this.fingerprint} (sha256 of "<sha256>  hooks/<file>" lines, pre-patch)`)
      process.stdout.write(`fingerprint ${this.fingerprint}${this.o.fingerprint === null ? '' : ` expected ${this.o.fingerprint}`}\n`)
      const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
      for (const f of walk(this.mod).sort()) lines.push(`${crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16)}  ${path.relative(this.mod, f)}`)
    }
    fs.writeFileSync(path.join(this.out, 'snapshot.txt'), `${lines.join('\n')}\n`)
    if (this.o.fingerprint !== null && this.fingerprint !== this.o.fingerprint) fail2(`fingerprint mismatch: copy ${this.fingerprint}, expected ${this.o.fingerprint}`)
  }

  record(x, problems, file) {
    const ok = problems.length === 0
    this.rows.push({ id: x.id, title: x.title, ok, file: file ?? '', cp: x.cp, size: x.kind === 'print' ? '-' : sizeOf(x), mode: `${modeOf(x)}${x.kind === 'print' ? '' : `/${tuiOf(x)}`}`, detail: problems.join(' | ') })
    process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${x.id}${ok ? '' : `  ${problems.join(' | ')}`}\n`)
  }

  async openSession(spec) {
    const name = `${this.id}-${++this.n}`
    const debug = path.join(this.out, 'sessions', `${name}.debug.log`)
    const [w, h] = spec.size.split('x')
    const s = { name, debug, spec, cases: [], why: null }
    this.sessions.push(s)
    s.pcfg = spec.isolate === true ? this.pcfg : this.cfg
    // tui pinned per session (the profile's own value would leak in otherwise); the installed copy is off when testing a --plugin-dir copy.
    const settings = JSON.stringify({ ...(this.mod === '-' ? {} : { enabledPlugins: DISABLE }), tui: spec.tui ?? 'default' })
    tmux('new-session', '-d', '-s', name, '-x', w, '-y', h, '-c', this.proj, 'bash', LAUNCH, this.cfg, this.mod, spec.mode, debug, this.o.model, this.mod === '-' ? '' : s.pcfg, settings)
    tmux('set-option', '-t', name, 'remain-on-exit', 'on')
    const t0 = Date.now()
    let keyAt = 0
    let yesAt = 0
    let ready = null
    while (Date.now() - t0 < 60000 && !isDead(name)) {
      const scr = grab(name)
      // Trust dialog (default row `❯ No, exit`): a key sent while it mounts is dropped, so retry Down each 800 ms;
      // Enter only once `❯ Yes, I trust this folder` has held for 300 ms. No ~/.claude.json edit.
      if (scr.includes('Yes, I trust this folder')) {
        const now = Date.now()
        const onYes = scr.includes('❯ Yes, I trust this folder')
        yesAt = onYes ? yesAt || now : 0
        if (now - keyAt >= 800 && (!onYes || now - yesAt >= 300)) {
          await press(name, onYes ? 'Enter' : 'Down')
          keyAt = Date.now()
        }
      } else if (promptEmpty(scr) && /mode on/.test(scr)) {
        ready = scr
        break
      }
      await sleep(200)
    }
    if (ready === null) return this.broken(s, 'claude did not reach an empty prompt in 60 s')
    // Mod warm-up: our typeahead row for the bare prefix proves the module answered (fullscreen shows only the first rows).
    await typeText(name, '++')
    if ((await waitFor(name, (x) => /\+\+a\s+Architecture-first/.test(regions(x, spec.tui).menu), 30000)) === null) return this.broken(s, 'mod typeahead for ++ never showed (module not loaded?)')
    if (!(await clearDraft(name))) return this.broken(s, 'could not clear the warm-up draft')
    if (spec.warm === true && !(await modelTurn(name, 'Reply with exactly LPWARMOK and nothing else. Do not use any tools.', 'LPWARMOK'))) return this.broken(s, 'warm-up model turn did not finish')
    return s
  }

  broken(s, why) {
    s.why = why
    fs.writeFileSync(path.join(this.out, 'sessions', `${s.name}.boot.txt`), isDead(s.name) ? '(pane dead)\n' + grab(s.name, { hist: true }) : grab(s.name, { hist: true }))
    return s
  }

  // Steps in order; the first failing check ends the case. since/until bound its debug-log window.
  async runCase(s, x) {
    const since = new Date().toISOString()
    let k = 0
    const checks = x.steps.filter((st) => st.check !== undefined).length
    for (const st of x.steps) {
      if (st.text !== undefined) await typeText(s.name, st.text)
      else if (st.key !== undefined) await press(s.name, st.key, st.n)
      else if (st.submit === true) await submit(s.name)
      else if (st.turn !== undefined) {
        if (!(await modelTurn(s.name, st.turn, st.token))) return { problems: ['model turn did not finish'], file: save(this.out, x.id, { screen: grab(s.name), hist: '', ansi: '' }, s.name), since }
      } else if (st.check !== undefined) {
        k++
        const isLast = k === checks
        const chk = { ...st.check, expect: st.check.expect.map((i) => subst(i, s.pcfg)), forbid: st.check.forbid.map((i) => subst(i, s.pcfg)), order: (st.check.order ?? []).map((i) => subst(i, s.pcfg)) }
        const { problems, snap } = await runCheck(s, chk, st.check.timeout ?? (s.cases.length === 0 && k === 1 ? FIRST_CHECK_MS : CHECK_MS), since)
        const file = save(this.out, isLast ? x.id : `${x.id}.${k}`, snap, s.name)
        if (problems.length > 0) return { problems: isLast ? problems : [`check ${k}: ${problems.join(' | ')}`], file, since }
        if (isLast) return { problems: [], file, since }
      }
    }
    return { problems: ['case has no check'], file: '', since }
  }

  // Debug-log verdicts per session: module load, refused band trees and skipped hooks inside each case's time window.
  audit(s, results) {
    const text = fs.existsSync(s.debug) ? fs.readFileSync(s.debug, 'utf8') : ''
    const who = this.o.installed ? 'brewmod-placeholders@claude-brewcode' : 'brewmod-placeholders@inline'
    const global = []
    if (!text.includes(`hooks module ${who} loaded`)) global.push(`debug: no "hooks module ${who} loaded"`)
    if (/hooks module did not load|hooks module brewmod-placeholders\S* failed to load/.test(text)) global.push('debug: module did not load')
    const bad = text.split('\n').filter((l) => /ui\.render \(\w+\): a hook returned a tree that does not validate|hook failed: brewmod-placeholders|brewmod-placeholders: .*(skipped|refused)/.test(l))
    for (const r of results) {
      const own = bad.filter((l) => r.since !== undefined && l.slice(0, 24) >= r.since && (r.until === undefined || l.slice(0, 24) <= r.until))
      r.problems.push(...global, ...own.slice(0, 3).map((l) => `debug: ${l.slice(24, 220).trim()}`))
    }
  }

  async runTmux(list) {
    const groups = new Map()
    for (const x of list) {
      const key = x.session ?? `fresh:${x.id}`
      if (!groups.has(key)) groups.set(key, { spec: x.session ? SESSIONS[x.session] : { size: x.size, mode: x.mode ?? 'default', tui: x.tui ?? 'default' }, cases: [] })
      groups.get(key).cases.push(x)
    }
    for (const g of groups.values()) {
      let s = await this.openSession(g.spec)
      const results = []
      for (const x of g.cases) {
        if (s.why === null && s.cases.length > 0 && !(await clearDraft(s.name))) {
          this.kill(s)
          s = await this.openSession(g.spec)
        }
        if (s.why !== null) {
          results.push({ x, problems: [`session: ${s.why}`], file: path.join(this.out, 'sessions', `${s.name}.boot.txt`) })
          continue
        }
        const r = await this.runCase(s, x)
        r.until = new Date().toISOString()
        s.cases.push(x.id)
        results.push({ x, ...r })
      }
      this.kill(s)
      this.audit(s, results.filter((r) => r.since !== undefined))
      for (const r of results) this.record(r.x, r.problems, r.file)
    }
  }

  runPrint(x) {
    const debug = path.join(this.out, `${x.id}.debug.log`)
    const args = ['-p', x.prompt, '--output-format', 'json', '--model', this.o.model, '--permission-mode', x.mode ?? 'default', '--debug-file', debug]
    if (this.mod !== '-') args.push('--plugin-dir', this.mod, '--settings', JSON.stringify({ enabledPlugins: DISABLE }))
    // globalFiles: this case alone reads a fresh scratch global dir holding them (patched copy only).
    let env = this.env
    if (x.globalFiles !== undefined && this.mod !== '-') {
      const own = path.join(this.pcfgRoot, x.id, 'cfg')
      fs.mkdirSync(path.join(own, 'placeholders'), { recursive: true })
      for (const [file, text] of Object.entries(x.globalFiles)) fs.writeFileSync(path.join(own, 'placeholders', file), text)
      env = { ...this.env, [ISO_ENV]: own }
    }
    const r = spawnSync('claude', args, { cwd: this.proj, env, input: '', encoding: 'utf8', timeout: 240000 })
    const file = path.join(this.out, `${x.id}.json`)
    fs.writeFileSync(file, r.stdout ?? '')
    fs.writeFileSync(path.join(this.out, `${x.id}.stderr.txt`), r.stderr ?? '')
    const problems = []
    let result = ''
    try {
      const j = JSON.parse(r.stdout)
      result = String(j.result ?? '')
      if (j.is_error === true) problems.push(`is_error: ${result.slice(0, 120)}`)
    } catch {
      problems.push(`no JSON on stdout (rc ${r.status}, signal ${r.signal})`)
    }
    fs.writeFileSync(path.join(this.out, `${x.id}.result.txt`), `${result}\n`)
    for (const p of x.expect) if (!has(result, p)) problems.push(`missing ${show(p)}`)
    for (const p of x.forbid) if (has(result, p)) problems.push(`forbidden ${show(p)}`)
    const dbg = fs.existsSync(debug) ? fs.readFileSync(debug, 'utf8') : ''
    for (const re of x.debugExpect ?? []) if (!re.test(dbg)) problems.push(`debug missing ${re}`)
    for (const re of x.debugForbid ?? []) if (re.test(dbg)) problems.push(`debug has ${re}`)
    if (/hooks module did not load/.test(`${r.stderr}\n${dbg}`)) problems.push('module did not load')
    const who = this.o.installed ? 'brewmod-placeholders@claude-brewcode' : 'brewmod-placeholders@inline'
    if (!dbg.includes(`hooks module ${who} loaded`)) problems.push(`debug: no "hooks module ${who} loaded"`)
    this.record(x, problems, path.join(this.out, `${x.id}.result.txt`))
  }

  kill(s) {
    try {
      tmux('kill-session', '-t', s.name)
    } catch {
      // already gone
    }
  }

  summary() {
    const head = ['id', 'expectation', 'result', 'file', 'cp', 'size', 'mode', 'detail']
    const clean = (v) => String(v).replace(/[\t\n]/g, ' ')
    const body = this.rows.map((r) => [r.id, r.title, r.ok ? 'PASS' : 'FAIL', r.file, r.cp, r.size, r.mode, r.detail].map(clean).join('\t'))
    fs.writeFileSync(path.join(this.out, 'summary.tsv'), `${[head.join('\t'), ...body].join('\n')}\n`)
    const failed = this.rows.filter((r) => !r.ok)
    process.stdout.write(`\n${this.rows.length - failed.length} PASS, ${failed.length} FAIL${failed.length ? `: ${failed.map((r) => r.id).join(', ')}` : ''}\nsummary: ${path.join(this.out, 'summary.tsv')}\n`)
    return failed.length === 0 ? 0 : 1
  }
}

async function main() {
  const o = parseArgs(process.argv.slice(2))
  const list = select(o)
  if (list.length === 0) fail2('no case selected')
  const run = new Run(o)
  await run.setup()
  const stop = () => {
    for (const s of run.sessions) run.kill(s)
    if (run.pcfgRoot !== undefined) fs.rmSync(run.pcfgRoot, { recursive: true, force: true })
    process.exit(2)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  try {
    await run.runTmux(list.filter((x) => x.kind !== 'print'))
    for (const x of list.filter((y) => y.kind === 'print')) run.runPrint(x)
    run.guard()
  } finally {
    for (const s of run.sessions) run.kill(s)
  }
  process.exit(run.summary())
}

main().catch((e) => {
  process.stderr.write(`harness error: ${e?.stack ?? e}\n`)
  process.exit(2)
})
