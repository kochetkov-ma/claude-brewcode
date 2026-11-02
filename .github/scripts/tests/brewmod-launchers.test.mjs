import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const INPUT = '{"prompt":"preserve stdin ☃"}\n\nsecond line\n'
const LAUNCH_TIMEOUT_MS = 15_000
const DAY = '2031-02-03'
const hook = (module, timeout) => ({ type: 'command', command: '/bin/sh', args: ['${CLAUDE_PLUGIN_ROOT}/hooks/run-node.sh', `\${CLAUDE_PLUGIN_ROOT}/hooks/${module}`], timeout })
const brewmodHooks = (module, second, options = {}) => ({ modules: ['./register.ts'], hooks: { UserPromptSubmit: [{ hooks: [hook(module, 5)] }], [second]: [{ ...options, hooks: [hook(module, 5)] }] } })
const HOOKS = {
  brewcode: { hooks: { SessionStart: [{ hooks: [hook('session-start.mjs', 3)] }, { matcher: 'compact', hooks: [hook('compact-recall.mjs', 2)] }] } },
  brewtools: { hooks: { SessionStart: [{ hooks: [hook('session-start.mjs', 2)] }] } },
  'brewmod-placeholders': brewmodHooks('inject.mjs', 'PostToolBatch'),
  'brewmod-plan-effort': brewmodHooks('mode.mjs', 'PostToolBatch'),
  'brewmod-reminders': brewmodHooks('remind.mjs', 'SessionStart', { matcher: 'compact' }),
}
const MODS = Object.keys(HOOKS)
const put = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text) }
const script = (path, text) => { put(path, text); chmodSync(path, 0o755) }

function launch(command, args, { env, cwd, input = INPUT, killAfterMs }) {
  return new Promise((done) => {
    const started = Date.now()
    const child = spawn(command, args, { env, cwd, timeout: LAUNCH_TIMEOUT_MS })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { err += chunk })
    child.stdin.on('error', () => {})
    child.stdin.end(input)
    if (killAfterMs !== undefined) setTimeout(() => child.kill('SIGKILL'), killAfterMs)
    child.on('close', (rc, signal) => done({ result: { rc, signal, out, err }, elapsed: Date.now() - started }))
  })
}

function fixture(t, mod = 'brewmod-reminders') {
  // The space in the temp root proves paths stay quoted whatever TMPDIR is.
  const parent = mkdtempSync(join(tmpdir(), 'brewmod-launcher-'))
  t.after(() => rmSync(parent, { recursive: true, force: true }))
  const dir = join(parent, 'dir with space')
  const home = join(dir, 'home with spaces')
  const tools = join(dir, 'tools')
  mkdirSync(home, { recursive: true })
  mkdirSync(tools)
  let source = readFileSync(join(ROOT, mod, 'hooks/run-node.sh'), 'utf8')
  // Fixture copy relocates system paths and pins the day; production has no test switches.
  for (const [path, target] of [['/opt/homebrew', join(dir, 'opt/homebrew')], ['/usr/local', join(dir, 'usr/local')], ['/bin/date', join(dir, 'fake-date')], ['/bin/sleep', join(dir, 'fake-sleep')]]) {
    assert.equal(source.includes(path), true, `${mod}: ${path} exists before fixture relocation`)
    source = source.replaceAll(path, `'${target}'`)
  }
  const launcher = join(dir, 'run-node.sh')
  put(launcher, source)
  script(join(dir, 'fake-date'), `#!/bin/sh\ncase "$*" in '-u +%Y-%m-%d') printf '%s\\n' ${DAY} ;; *) printf '%s\\n' 1999-09-09 ;; esac\n`)
  symlinkSync('/bin/sleep', join(dir, 'fake-sleep'))
  const paths = {
    path: join(tools, 'node'), nvm: join(home, '.nvm/versions/node/v20.9.0/bin/node'),
    volta: join(home, '.volta/bin/node'), fnm: join(home, '.local/share/fnm/aliases/default/bin/node'),
    homebrew: join(dir, 'opt/homebrew/bin/node'), homebrewKeg: join(dir, 'opt/homebrew/opt/node@22/bin/node'),
    system: join(dir, 'usr/local/bin/node'), systemKeg: join(dir, 'usr/local/opt/node@22/bin/node'), local: join(home, '.local/bin/node'),
  }
  const env = { HOME: home, PATH: tools, TMPDIR: dir, LC_ALL: 'C' }
  const args = [join(dir, mod, '6.12.7/hooks', 'module.mjs'), 'argument with spaces', '', '*literal*']
  const runtime = (path, label, version = 'v20.9.0', rc = 0, tail = '') => script(path,
    `#!/bin/sh\ncase "$1" in --version) IFS= read -r swallowed && exit 9; printf '%s\\n' '${version}'; printf 'ignored probe stderr\\n' >&2; exit ${rc};; esac\nprintf 'runtime=%s\\n' '${label}'\nfor arg do printf '<%s>\\n' "$arg"; done\n/bin/cat\n${tail}\n`)
  const hungRuntime = (path, hang) => script(path, `#!/bin/sh\n${hang} '${join(dir, 'fake-sleep')}' 2\nprintf 'v20.9.0\\n'\n`)
  const nvmAt = (version, label = version, probeVersion = `v${version}`, rc = 0) => runtime(join(home, `.nvm/versions/node/v${version}/bin/node`), label, probeVersion, rc)
  const processes = () => spawnSync('ps', ['-A', '-ww', '-o', 'command'], { encoding: 'utf8' }).stdout.split('\n').filter((line) => line.includes(dir))
  const run = (options = {}) => launch('/bin/sh', [launcher, ...args], { env, cwd: dir, ...options })
  return { dir, home, tools, paths, env, args, runtime, hungRuntime, nvmAt, processes, run }
}

const SOURCES = ['path', 'nvm', 'volta', 'fnm', 'homebrew', 'homebrewKeg', 'system', 'systemKeg', 'local']
const fnmRoots = {
  'FNM_DIR': (f) => { f.env.FNM_DIR = join(f.dir, 'custom fnm'); return f.env.FNM_DIR },
  'macOS fnm data': (f) => join(f.home, 'Library/Application Support/fnm'),
  'XDG fnm data': (f) => { f.env.XDG_DATA_HOME = join(f.dir, 'xdg data'); return join(f.env.XDG_DATA_HOME, 'fnm') },
  'legacy fnm data': (f) => join(f.home, '.fnm'),
}
const fnmOrder = Object.keys(fnmRoots)
const pathDirs = (f, ...dirs) => { f.env.PATH = dirs.join(':') }
const version = (label, reported, winner) => [`PATH reporting ${label}`, (f) => { f.runtime(f.paths.path, 'path', reported); f.runtime(f.paths.local, 'local') }, winner]

const resolution = [
  ...SOURCES.map((winner, index, order) => [`${winner} above every later source`, (f) => { for (const source of order.slice(index)) f.runtime(f.paths[source], source) }, winner]),
  ['VOLTA_HOME above ~/.volta', (f) => { f.env.VOLTA_HOME = join(f.dir, 'custom volta'); f.runtime(join(f.env.VOLTA_HOME, 'bin/node'), 'custom'); f.runtime(f.paths.volta, 'volta') }, 'custom'],
  ['stale VOLTA_HOME and ~/.volta', (f) => { f.env.VOLTA_HOME = join(f.dir, 'stale'); f.runtime(f.paths.volta, 'volta') }, 'volta'],
  ['failed PATH probe', (f) => { f.runtime(f.paths.path, 'broken', 'v20.9.0', 1); f.runtime(f.paths.local, 'local') }, 'local'],
  version('the minimum v14.13.1', 'v14.13.1', 'path'),
  version('below the minimum v14.13.0', 'v14.13.0', 'local'),
  version('newer minor v14.14.0', 'v14.14.0', 'path'),
  version('newer major v15.0.0', 'v15.0.0', 'path'),
  version('pre-release v24.0.0-rc.1', 'v24.0.0-rc.1', 'path'),
  version('nightly v22.0.0-nightly20240101abc', 'v22.0.0-nightly20240101abc', 'path'),
  version('a suffix on an old core v14.13.0-rc.1', 'v14.13.0-rc.1', 'local'),
  version('four numeric parts v20.9.0.1', 'v20.9.0.1', 'local'),
  version('two numeric parts v20.9', 'v20.9', 'local'),
  version('two numeric parts with suffix v20.9-rc.1', 'v20.9-rc.1', 'local'),
  version('an empty part v20..1', 'v20..1', 'local'),
  version('a non-numeric core v20.x.0-rc', 'v20.x.0-rc', 'local'),
  version('an empty suffix v20.9.0-', 'v20.9.0-', 'local'),
  version('a space v20.9.0 x', 'v20.9.0 x', 'local'),
  version('nothing', '', 'local'),
  ['a second PATH entry behind an old node', (f) => {
    const second = join(f.dir, 'second')
    pathDirs(f, f.tools, second); f.runtime(f.paths.path, 'old', 'v14.13.0'); f.runtime(join(second, 'node'), 'second')
  }, 'second'],
  ['a second PATH entry behind a non-executable node', (f) => {
    const second = join(f.dir, 'second')
    pathDirs(f, f.tools, second); f.runtime(f.paths.path, 'blocked'); chmodSync(f.paths.path, 0o644); f.runtime(join(second, 'node'), 'second')
  }, 'second'],
  ['relative and empty PATH entries with a node in cwd', (f) => {
    pathDirs(f, '', '.', 'rel', f.tools); f.runtime(join(f.dir, 'node'), 'cwd'); f.runtime(join(f.dir, 'rel/node'), 'relative'); f.runtime(f.paths.path, 'path')
  }, 'path'],
  ['NVM default alias over newest', (f) => { f.runtime(f.paths.nvm, 'default'); f.nvmAt('24.9.0', 'newest'); put(join(f.home, '.nvm/alias/default'), '20\n') }, 'default'],
  ['NVM nested LTS alias', (f) => {
    f.runtime(f.paths.nvm, 'lts'); f.nvmAt('24.9.0', 'newest')
    put(join(f.home, '.nvm/alias/default'), 'lts/*\n'); put(join(f.home, '.nvm/alias/lts/*'), 'lts/iron\n'); put(join(f.home, '.nvm/alias/lts/iron'), 'v20.9.0\n')
  }, 'lts'],
  ['NVM alias of a pre-release', (f) => { f.nvmAt('24.0.0-rc.1', 'rc'); f.nvmAt('24.9.0', 'newest'); put(join(f.home, '.nvm/alias/default'), 'v24.0.0-rc.1\n') }, 'rc'],
  ['NVM alias of an uninstalled version', (f) => { f.nvmAt('24.1.0', 'newest'); put(join(f.home, '.nvm/alias/default'), '18\n') }, 'newest'],
  ['NVM alias prefix of another major', (f) => { f.nvmAt('18.0.0', 'eighteen'); f.nvmAt('24.1.0', 'newest'); put(join(f.home, '.nvm/alias/default'), '1\n') }, 'newest'],
  ['NVM alias escaping its directory', (f) => { f.nvmAt('18.0.0', 'outside'); f.nvmAt('24.1.0', 'newest'); put(join(f.home, '.nvm/alias/default'), '../../outside\n'); put(join(f.home, 'outside'), '18\n') }, 'newest'],
  ['NVM cyclic aliases', (f) => { f.runtime(f.paths.nvm, 'newest'); put(join(f.home, '.nvm/alias/default'), 'cycle\n'); put(join(f.home, '.nvm/alias/cycle'), 'default\n') }, 'newest'],
  ['NVM versions needing numeric order and probes', (f) => {
    for (const [v, label, rc] of [['9.9.9', 'old', 0], ['20.9.0', 'older', 0], ['20.10.0', 'newest', 0], ['24.1.0', 'broken', 1]]) f.nvmAt(v, label, `v${v}`, rc)
  }, 'newest'],
  ['NVM versions differing in the patch', (f) => { f.nvmAt('20.9.1', 'nine'); f.nvmAt('20.9.10', 'ten') }, 'ten'],
  ['NVM stable and a newer nightly', (f) => { f.nvmAt('99.0.0-nightly', 'nightly'); f.nvmAt('24.1.0', 'stable') }, 'stable'],
  ['NVM only a pre-release', (f) => f.nvmAt('24.0.0-rc.1', 'rc'), 'rc'],
  ['NVM non-version directories', (f) => { f.nvmAt('99.x.0', 'junk', 'v99.0.0'); f.nvmAt('24.1.0', 'stable') }, 'stable'],
  ['custom NVM_DIR over ~/.nvm', (f) => { f.env.NVM_DIR = join(f.dir, 'custom nvm'); f.runtime(join(f.env.NVM_DIR, 'versions/node/v22.1.0/bin/node'), 'custom', 'v22.1.0'); f.runtime(f.paths.nvm, 'home') }, 'custom'],
  ['stale NVM_DIR over a real ~/.nvm', (f) => { f.env.NVM_DIR = join(f.dir, 'stale'); f.runtime(f.paths.nvm, 'home') }, 'home'],
  ...fnmOrder.map((label, index, order) => [`${label} default alias above later fnm roots`, (f) => {
    for (const later of order.slice(index).reverse()) f.runtime(join(fnmRoots[later](f), 'aliases/default/bin/node'), later)
  }, label]),
  ['fnm node-versions without an alias', (f) => {
    for (const v of ['v20.9.0', 'v20.10.0']) f.runtime(join(f.home, `.fnm/node-versions/${v}/installation/bin/node`), v, v)
  }, 'v20.10.0'],
  ['fnm alias over its newest node-version', (f) => {
    f.runtime(join(f.home, '.fnm/node-versions/v24.1.0/installation/bin/node'), 'newest', 'v24.1.0'); f.runtime(join(f.home, '.fnm/aliases/default/bin/node'), 'alias')
  }, 'alias'],
  ['two Homebrew kegs', (f) => { f.runtime(f.paths.homebrewKeg, 'keg22'); f.runtime(join(f.dir, 'opt/homebrew/opt/node@20/bin/node'), 'keg20') }, 'keg22'],
  ['a broken newest Homebrew keg', (f) => { f.runtime(f.paths.homebrewKeg, 'keg22', 'v22.0.0', 1); f.runtime(join(f.dir, 'opt/homebrew/opt/node@20/bin/node'), 'keg20') }, 'keg20'],
]

test('GIVEN each launcher plugin WHEN its assets are read THEN hooks, launcher mode and bytes are exact', () => {
  const asset = (mod) => ({
    hooks: JSON.parse(readFileSync(join(ROOT, mod, 'hooks/hooks.json'), 'utf8')),
    executable: statSync(join(ROOT, mod, 'hooks/run-node.sh')).mode & 0o111,
    launcher: readFileSync(join(ROOT, mod, 'hooks/run-node.sh'), 'utf8'),
  })
  const launcher = readFileSync(join(ROOT, MODS[0], 'hooks/run-node.sh'), 'utf8')
  assert.deepEqual(Object.fromEntries(MODS.map((mod) => [mod, asset(mod)])), Object.fromEntries(MODS.map((mod) => [mod, { hooks: HOOKS[mod], executable: 0o111, launcher }])),
    'every hook goes through one byte-identical executable launcher')
})

test('GIVEN isolated runtimes WHEN the launcher resolves Node THEN the winner gets the exact payload', { concurrency: 4 }, async (t) => {
  await Promise.all(resolution.map(([label, setup, winner]) => t.test(`GIVEN ${label} WHEN the launcher resolves Node THEN ${winner} runs`, async (t) => {
    const f = fixture(t)
    setup(f)
    const { result } = await f.run()
    assert.deepEqual(result, { rc: 0, signal: null, out: `runtime=${winner}\n${f.args.map((a) => `<${a}>\n`).join('')}${INPUT}`, err: '' }, label)
  })))
})

test('GIVEN a candidate exiting before the watchdog sleep starts WHEN probed THEN the hook is not delayed', async (t) => {
  const f = fixture(t)
  script(f.paths.path, '#!/no/such/interpreter\n')
  f.runtime(f.paths.local, 'local')
  const { result, elapsed } = await f.run()
  const fast = elapsed < 900
  assert.deepEqual({ result, fast }, { result: { rc: 0, signal: null, out: `runtime=local\n${f.args.map((a) => `<${a}>\n`).join('')}${INPUT}`, err: '' }, fast: true }, `took ${elapsed} ms`)
})

test('GIVEN a hook that writes stderr and fails WHEN the launcher runs it THEN rc and stderr pass through', async (t) => {
  const f = fixture(t)
  f.runtime(f.paths.path, 'path', 'v20.9.0', 0, "printf 'hook stderr\\n' >&2\nexit 3")
  const { result } = await f.run()
  assert.deepEqual(result, { rc: 3, signal: null, out: `runtime=path\n${f.args.map((a) => `<${a}>\n`).join('')}${INPUT}`, err: 'hook stderr\n' }, 'runtime rc and stderr reach the hook host')
})

test('GIVEN a hung node on PATH WHEN the launcher probes it THEN the 1 s bound falls through and leaves nothing running', { concurrency: 4 }, async (t) => {
  const expected = (f) => ({ rc: 0, signal: null, out: `runtime=local\n${f.args.map((a) => `<${a}>\n`).join('')}${INPUT}`, err: '' })
  const bounded = (hang) => async (t) => {
    const f = fixture(t)
    f.hungRuntime(f.paths.path, hang)
    f.runtime(f.paths.local, 'local')
    const { result, elapsed } = await f.run()
    const fast = elapsed < 1900
    assert.deepEqual({ result, fast }, { result: expected(f), fast: true }, `fell through inside the 2 s fake hang, took ${elapsed} ms`)
    return f
  }
  await Promise.all([
    t.test('GIVEN a node hanging in place WHEN probed THEN it is killed and later sources run', async (t) => {
      const f = await bounded('exec')(t)
      assert.deepEqual(f.processes(), [], 'no runtime or watchdog process survives the launcher')
    }),
    t.test('GIVEN a wrapper whose child keeps the pipe WHEN probed THEN later sources still run', async (t) => { await bounded('')(t) }),
    t.test('GIVEN a healthy node WHEN the launcher execs it THEN no watchdog is left', async (t) => {
      const f = fixture(t)
      // Probe lasts like a real node --version, so the watchdog's sleep has started when it is stopped.
      script(f.paths.path, `#!/bin/sh\ncase "$1" in --version) /bin/sleep 0.1; printf 'v20.9.0\\n'; exit 0;; esac\nprintf 'runtime=path\\n'\nfor arg do printf '<%s>\\n' "$arg"; done\n/bin/cat\n/bin/ps -A -ww -o command | /usr/bin/grep -F '${f.dir}/fake-sleep' | /usr/bin/grep -v grep\n`)
      const { result } = await f.run()
      assert.deepEqual(result, { rc: 1, signal: null, out: `runtime=path\n${f.args.map((a) => `<${a}>\n`).join('')}${INPUT}`, err: '' }, 'the runtime sees no watchdog sleep (grep rc 1)')
    }),
    t.test('GIVEN a host killing the launcher mid-probe WHEN the bound expires THEN the hung node is gone', async (t) => {
      const f = fixture(t)
      f.hungRuntime(f.paths.path, 'exec')
      const { result } = await f.run({ killAfterMs: 200 })
      assert.deepEqual(result, { rc: null, signal: 'SIGKILL', out: '', err: '' }, 'host pipes close at the kill: no child keeps them')
      let left = f.processes()
      for (let i = 0; i < 30 && left.length > 0; i += 1) { await delay(100); left = f.processes() }
      assert.deepEqual(left, [], 'watchdog kills the hung node after the launcher died')
    }),
  ])
})

const logLine = (mod) => `${DAY} ${mod}: Node.js >=14.13.1 unavailable; command hook skipped. Install a supported Node.js release, e.g. nvm install --lts && nvm alias default node.\n`

test('GIVEN no usable Node WHEN launchers repeat THEN they stay silent with one exact diagnostic per plugin', { concurrency: 4 }, async (t) => {
  const defaultConfig = (home) => join(home, '.claude')
  await Promise.all([
    ['nothing installed', () => {}, defaultConfig],
    ['an obsolete node', (f) => f.runtime(f.paths.path, 'old', 'v14.13.0'), defaultConfig],
    ['a failing probe', (f) => f.runtime(f.paths.path, 'failed', 'v20.9.0', 1), defaultConfig],
    ['a non-executable node', (f) => { f.runtime(f.paths.path, 'blocked'); chmodSync(f.paths.path, 0o644) }, defaultConfig],
    ['a CLAUDE_CONFIG_DIR profile', (f, config) => { f.env.CLAUDE_CONFIG_DIR = config }, (home) => join(home, 'profile dir')],
    ['an uninstalled checkout layout', (f, _config, mod) => { f.args[0] = join(f.dir, mod, 'hooks/module.mjs') }, defaultConfig],
  ].map(([label, setup, configDir]) => t.test(`GIVEN ${label} WHEN every plugin runs twice THEN one diagnostic per plugin survives`, async (t) => {
    const fixtures = MODS.map((mod) => fixture(t, mod))
    const home = fixtures[0].home
    const logs = join(configDir(home), 'logs')
    fixtures.forEach((f, index) => { f.env.HOME = home; setup(f, configDir(home), MODS[index]) })
    for (const mod of MODS) mkdirSync(join(logs, `.${mod}-node-missing-2000-01-01`), { recursive: true })
    const results = []
    for (const f of fixtures) for (let i = 0; i < 2; i += 1) results.push((await f.run()).result)
    assert.deepEqual({ results, log: readFileSync(join(logs, 'brewmod-node.log'), 'utf8'), markers: readdirSync(logs).filter((name) => name.startsWith('.')).sort() }, {
      results: Array.from({ length: MODS.length * 2 }, () => ({ rc: 0, signal: null, out: '', err: '' })),
      log: MODS.map(logLine).join(''),
      markers: MODS.map((mod) => `.${mod}-node-missing-${DAY}`).sort(),
    }, 'silent successes, exact log text, UTC-day marker only')
  })))
})

test('GIVEN diagnostics that cannot be written WHEN Node is missing THEN the launcher still exits silently', { concurrency: 4 }, async (t) => {
  await Promise.all([
    ['a config dir that is a file', (f) => { put(join(f.dir, 'config file'), 'x'); f.env.CLAUDE_CONFIG_DIR = join(f.dir, 'config file') }],
    ['a log path that is a directory', (f) => mkdirSync(join(f.home, '.claude/logs/brewmod-node.log'), { recursive: true })],
    ['a stale marker that cannot be removed', (f) => put(join(f.home, '.claude/logs/.brewmod-reminders-node-missing-2000-01-01/keep'), 'x')],
    ['neither HOME nor CLAUDE_CONFIG_DIR', (f) => { delete f.env.HOME }],
  ].map(([label, setup]) => t.test(`GIVEN ${label} WHEN Node is missing THEN rc 0 with no output`, async (t) => {
    const f = fixture(t)
    setup(f)
    const { result } = await f.run()
    assert.deepEqual(result, { rc: 0, signal: null, out: '', err: '' }, label)
  })))
})

const E2E_OUTPUT = (cwd) => ({
  'brewcode session-start.mjs': { out: `${JSON.stringify({ systemMessage: `brewcode: ${cwd} | session: s1 | perm: default\ncheck brewcode updates: https://github.com/kochetkov-ma/claude-brewcode/releases/latest` })}\n`, err: '[session-start] Started: s1 (compact, default)\n' },
  'brewcode compact-recall.mjs': { out: `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: '[INTENT] Re-read the user ORIGINAL task and intent from the compact summary and keep executing THAT.\nDo not continue from the most recently remembered fragment, and do not re-scope the work.' } })}\n`, err: '[compact-recall] branch=intent tasks=false\n' },
  'brewtools session-start.mjs': { out: '{}\n', err: '' },
  'brewmod-placeholders inject.mjs': { out: '{}', err: '' },
  'brewmod-plan-effort mode.mjs': { out: '{}', err: '' },
  'brewmod-reminders remind.mjs': { out: '{}', err: '' },
})

test('GIVEN real Node WHEN each shipped hooks.json command runs THEN the real module answers exactly', { concurrency: 4 }, async (t) => {
  const commands = MODS.flatMap((mod) => {
    const config = JSON.parse(readFileSync(join(ROOT, mod, 'hooks/hooks.json'), 'utf8'))
    return Object.values(config.hooks).flat().flatMap((group) => group.hooks).map((h) => [mod, h])
  })
  const seen = [...new Set(commands.map(([mod, h]) => `${mod} ${h.args[1].split('/').pop()}`))].sort()
  assert.deepEqual(seen, Object.keys(E2E_OUTPUT('')).sort(), 'every shipped hook module has an exact expectation')
  await Promise.all(commands.map(([mod, h]) => {
    const name = `${mod} ${h.args[1].split('/').pop()}`
    return t.test(`GIVEN ${name} WHEN launched without node on the default PATH THEN its output is exact`, async (t) => {
      const parent = mkdtempSync(join(tmpdir(), 'brewmod-e2e-'))
      t.after(() => rmSync(parent, { recursive: true, force: true }))
      const tools = join(parent, 'tools')
      mkdirSync(tools)
      symlinkSync(realpathSync(process.execPath), join(tools, 'node'))
      const args = h.args.map((a) => a.replace('${CLAUDE_PLUGIN_ROOT}', join(ROOT, mod)))
      const input = JSON.stringify({ session_id: 's1', cwd: parent, source: 'compact', prompt: 'hello', permission_mode: 'default' })
      const { result } = await launch(h.command, args, { env: { HOME: parent, PATH: tools, CLAUDE_PLUGIN_ROOT: parent, LC_ALL: 'C' }, cwd: parent, input })
      assert.deepEqual(result, { rc: 0, signal: null, ...E2E_OUTPUT(parent)[name] }, name)
    })
  }))
})

test('GIVEN plugin trees WHEN hook targets are checked THEN a missing or escaping target fails', async (t) => {
  const checker = join(ROOT, '.github/scripts/check-hook-targets.mjs')
  const check = (root) => {
    const r = spawnSync(process.execPath, root === undefined ? [checker] : [checker, root], { encoding: 'utf8', timeout: LAUNCH_TIMEOUT_MS })
    return { rc: r.status, out: r.stdout, err: r.stderr }
  }
  const real = check()
  assert.deepEqual({ rc: real.rc, err: real.err }, { rc: 0, err: '' }, `the shipped tree is complete: ${real.out}`)
  const error = (target) => `::error file=one/hooks/hooks.json::one: hook target missing: ${target}\n`
  for (const [label, target, files, expected] of [
    ['present targets', 'hooks/run-node.sh', ['hooks/run-node.sh', 'hooks/m.mjs', 'hooks/register.ts'], { rc: 0, out: 'hook targets exist: 3\n', err: '' }],
    ['a deleted launcher', 'hooks/run-node.sh', ['hooks/m.mjs', 'hooks/register.ts'], { rc: 1, out: '', err: error('hooks/run-node.sh') }],
    ['a deleted module entry', 'hooks/run-node.sh', ['hooks/run-node.sh', 'hooks/m.mjs'], { rc: 1, out: '', err: error('hooks/register.ts') }],
    ['a target leaving the plugin', '../outside.sh', ['hooks/run-node.sh', 'hooks/m.mjs', 'hooks/register.ts', '../outside.sh'], { rc: 1, out: '', err: error('../outside.sh') }],
  ]) await t.test(`GIVEN ${label} WHEN checked THEN the result is exact`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'hook-targets-'))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    put(join(dir, '.claude-plugin/marketplace.json'), JSON.stringify({ plugins: [{ name: 'one', source: './one' }, { name: 'bare', source: './bare' }] }))
    put(join(dir, 'one/hooks/hooks.json'), JSON.stringify({ modules: ['./register.ts'], hooks: { SessionStart: [{ hooks: [hook('m.mjs', 1), { type: 'command', command: '/bin/sh', args: [`\${CLAUDE_PLUGIN_ROOT}/${target}`] }] }] } }))
    for (const file of files) put(join(dir, 'one', file), '')
    assert.deepEqual(check(dir), expected, label)
  })
})

test('GIVEN release gates WHEN read THEN the fast suite and target check gate a release and shards notice removal', async (t) => {
  const gate = readFileSync(join(ROOT, '.github/scripts/validate-release.sh'), 'utf8').split('\n')
  const lines = ['node .github/scripts/check-hook-targets.mjs', 'node --test .github/scripts/tests/brewmod-launchers.test.mjs']
  assert.deepEqual(lines.map((line) => gate.includes(line)), [true, true], 'validate-release.sh runs both gates')
  const wf = readFileSync(join(ROOT, '.github/workflows/tests.yml'), 'utf8')
  for (const [label, text, rc, out] of [
    ['the full workflow', wf, 0, () => 'all suites are sharded\n'],
    ['the launcher suite removed', wf.split('\n').filter((line) => !line.includes('brewmod-launchers.test.mjs')).join('\n'), 1,
      (file) => `::error file=${file}::not in any shard: .github/scripts/tests/brewmod-launchers.test.mjs\n`],
  ]) await t.test(`GIVEN ${label} WHEN shards are checked THEN the result is exact`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'check-shards-'))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    const file = join(dir, 'tests.yml')
    writeFileSync(file, text)
    const r = spawnSync('bash', [join(ROOT, '.github/scripts/check-shards.sh'), file], { encoding: 'utf8', timeout: LAUNCH_TIMEOUT_MS })
    assert.deepEqual({ rc: r.status, out: r.stdout }, { rc, out: out(file) }, label)
  })
})
