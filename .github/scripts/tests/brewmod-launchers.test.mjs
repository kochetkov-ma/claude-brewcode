import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const MODS = ['brewmod-placeholders', 'brewmod-plan-effort', 'brewmod-reminders']
const INPUT = '{"prompt":"preserve stdin ☃"}\nsecond line\n'
const MODULES = { 'brewmod-placeholders': 'inject.mjs', 'brewmod-plan-effort': 'mode.mjs', 'brewmod-reminders': 'remind.mjs' }
const EVENTS = {
  'brewmod-placeholders': [['UserPromptSubmit', {}], ['PostToolBatch', {}]],
  'brewmod-plan-effort': [['UserPromptSubmit', {}], ['PostToolBatch', {}]],
  'brewmod-reminders': [['UserPromptSubmit', {}], ['SessionStart', { matcher: 'compact' }]],
}
const put = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text) }

function fixture(t, mod) {
  const dir = mkdtempSync(join(tmpdir(), 'brewmod-launcher-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const home = join(dir, 'home with spaces')
  const tools = join(dir, 'tools')
  mkdirSync(home)
  mkdirSync(tools)
  let source = readFileSync(join(ROOT, mod, 'hooks/run-node.sh'), 'utf8')
  // Redirect only system fallback locations in a fixture copy; production has no test switches.
  for (const path of ['/opt/homebrew/bin/node', '/usr/local/bin/node']) {
    assert.equal(source.includes(path), true, `${mod}: system fallback ${path} exists before fixture relocation`)
    source = source.replaceAll(path, join(dir, path))
  }
  const script = join(dir, 'run-node.sh')
  put(script, source)
  const paths = {
    path: join(tools, 'node'), nvm: join(home, '.nvm/versions/node/v20.9.0/bin/node'),
    volta: join(home, '.volta/bin/node'), fnm: join(home, '.local/share/fnm/aliases/default/bin/node'),
    homebrew: join(dir, '/opt/homebrew/bin/node'), system: join(dir, '/usr/local/bin/node'), local: join(home, '.local/bin/node'),
  }
  const env = { HOME: home, PATH: tools, TMPDIR: dir, LC_ALL: 'C' }
  const args = [join(dir, 'plugin with spaces/hooks', MODULES[mod]), 'argument with spaces', '', '*literal*']
  const runtime = (path, label, version = 'v20.9.0', rc = 0) => {
    put(path, `#!/bin/sh\ncase "$1" in --version) IFS= read -r swallowed && exit 9; printf '%s\\n' '${version}'; printf 'ignored probe stderr\\n' >&2; exit ${rc};; esac\nprintf 'runtime=%s\\n' '${label}'\nfor arg do printf '<%s>\\n' "$arg"; done\n/bin/cat\n`)
    chmodSync(path, 0o755)
  }
  const run = () => {
    const r = spawnSync('/bin/sh', [script, ...args], { env, input: INPUT, encoding: 'utf8' })
    return { rc: r.status, signal: r.signal, out: r.stdout, err: r.stderr }
  }
  return { dir, home, paths, env, args, runtime, run }
}

const resolution = [
  ...['path', 'nvm', 'volta', 'fnm', 'homebrew', 'system', 'local'].map((winner, index, order) => [
    `${winner} has priority over every later source`,
    (f) => { for (const source of order.slice(index)) f.runtime(f.paths[source], source) }, winner,
  ]),
  ['old PATH falls through', (f) => { f.runtime(f.paths.path, 'old', 'v14.13.0'); f.runtime(f.paths.volta, 'volta') }, 'volta'],
  ['failed PATH probe falls through', (f) => { f.runtime(f.paths.path, 'broken', 'v20.9.0', 1); f.runtime(f.paths.local, 'local') }, 'local'],
  ['malformed PATH version falls through', (f) => { f.runtime(f.paths.path, 'bad', 'v20.9.0-garbage'); f.runtime(f.paths.local, 'local') }, 'local'],
  ['minimum compatible Node is accepted', (f) => f.runtime(f.paths.path, 'minimum', 'v14.13.1'), 'minimum'],
  ['NVM default alias wins over newest', (f) => {
    f.runtime(f.paths.nvm, 'default'); f.runtime(join(f.home, '.nvm/versions/node/v24.9.0/bin/node'), 'newest')
    put(join(f.home, '.nvm/alias/default'), '20\n')
  }, 'default'],
  ['NVM nested LTS alias resolves', (f) => {
    f.runtime(f.paths.nvm, 'lts'); f.runtime(join(f.home, '.nvm/versions/node/v24.9.0/bin/node'), 'newest')
    put(join(f.home, '.nvm/alias/default'), 'lts/*\n'); put(join(f.home, '.nvm/alias/lts/*'), 'lts/iron\n'); put(join(f.home, '.nvm/alias/lts/iron'), 'v20.9.0\n')
  }, 'lts'],
  ['NVM newest is numeric and skips incompatible runtimes', (f) => {
    for (const [version, label, rc] of [['v9.9.9', 'old', 0], ['v20.9.0', 'older', 0], ['v20.10.0', 'newest', 0], ['v24.1.0', 'broken', 1]])
      f.runtime(join(f.home, `.nvm/versions/node/${version}/bin/node`), label, version, rc)
  }, 'newest'],
  ['custom NVM_DIR is honored', (f) => { f.env.NVM_DIR = join(f.dir, 'custom nvm'); f.runtime(join(f.env.NVM_DIR, 'versions/node/v22.1.0/bin/node'), 'custom') }, 'custom'],
  ['cyclic NVM aliases fall through to newest', (f) => {
    f.runtime(f.paths.nvm, 'newest'); put(join(f.home, '.nvm/alias/default'), 'cycle\n'); put(join(f.home, '.nvm/alias/cycle'), 'default\n')
  }, 'newest'],
  ...[
    ['FNM_DIR', (f) => { f.env.FNM_DIR = join(f.dir, 'custom fnm'); return f.env.FNM_DIR }],
    ['macOS fnm data', (f) => join(f.home, 'Library/Application Support/fnm')],
    ['XDG fnm data', (f) => { f.env.XDG_DATA_HOME = join(f.dir, 'xdg data'); return join(f.env.XDG_DATA_HOME, 'fnm') }],
    ['legacy fnm data', (f) => join(f.home, '.fnm')],
  ].map(([label, root]) => [`${label} resolves its default alias`, (f) => f.runtime(join(root(f), 'aliases/default/bin/node'), 'fnm'), 'fnm']),
]

test('GIVEN isolated runtime installations WHEN each launcher resolves Node THEN priority, arguments and stdin are exact', async (t) => {
  // GIVEN each runtime combination, without any host Node in the child PATH.
  for (const mod of MODS) {
    const command = { type: 'command', command: '/bin/sh', args: ['${CLAUDE_PLUGIN_ROOT}/hooks/run-node.sh', `\${CLAUDE_PLUGIN_ROOT}/hooks/${MODULES[mod]}`], timeout: 5 }
    assert.deepEqual(JSON.parse(readFileSync(join(ROOT, mod, 'hooks/hooks.json'), 'utf8')),
      { modules: ['./register.ts'], hooks: Object.fromEntries(EVENTS[mod].map(([event, options]) => [event, [{ ...options, hooks: [command] }]])) },
      `${mod}: every original event and matcher invokes its script through the launcher`)
    assert.equal(statSync(join(ROOT, mod, 'hooks/run-node.sh')).mode & 0o111, 0o111, `${mod}: launcher ships executable`)
    assert.equal(readFileSync(join(ROOT, mod, 'hooks/run-node.sh'), 'utf8'), readFileSync(join(ROOT, MODS[0], 'hooks/run-node.sh'), 'utf8'), `${mod}: launcher copies stay byte-identical`)
  }
  for (const mod of MODS) for (const [label, setup, winner] of resolution) await t.test(`${mod}: ${label}`, (t) => {
    const f = fixture(t, mod)
    setup(f)
    assert.equal(existsSync(f.home), true, 'fixture HOME exists before launch')
    // WHEN the production launcher copy receives arbitrary arguments and stdin.
    const result = f.run()
    // THEN the selected fake runtime receives the complete unchanged payload.
    assert.deepEqual(result, { rc: 0, signal: null, out: `runtime=${winner}\n${f.args.map((a) => `<${a}>\n`).join('')}${INPUT}`, err: '' }, label)
  })
})

test('GIVEN missing or unusable Node WHEN launchers repeat THEN they stay silent with one diagnostic per plugin', async (t) => {
  for (const [label, setup, configDir] of [
    ['missing', () => {}, (home) => join(home, '.claude')],
    ['obsolete', (f) => f.runtime(f.paths.path, 'old', 'v14.13.0'), (home) => join(home, '.claude')],
    ['failed probe', (f) => f.runtime(f.paths.path, 'failed', 'v20.9.0', 1), (home) => join(home, '.claude')],
    ['nonexecutable', (f) => { f.runtime(f.paths.path, 'blocked'); chmodSync(f.paths.path, 0o644) }, (home) => join(home, '.claude')],
    ['CLAUDE_CONFIG_DIR profile', (f, config) => { f.env.CLAUDE_CONFIG_DIR = config }, (home) => join(home, 'profile dir')],
  ]) await t.test(label, (t) => {
    // GIVEN no real Node candidate, a shared isolated HOME and yesterday-or-older markers.
    const fixtures = MODS.map((mod) => fixture(t, mod))
    const home = fixtures[0].home
    const logs = join(configDir(home), 'logs')
    for (const f of fixtures) { f.env.HOME = home; setup(f, configDir(home)) }
    for (const mod of MODS) mkdirSync(join(logs, `.${mod}-node-missing-2000-01-01`), { recursive: true })
    assert.equal(existsSync(join(logs, 'brewmod-node.log')), false, 'diagnostic log does not exist before launch')
    // WHEN every plugin runs twice with no usable runtime.
    const results = fixtures.flatMap((f) => [f.run(), f.run()])
    // THEN failure stays open without hook output, with one durable diagnostic.
    assert.deepEqual(results, Array.from({ length: 6 }, () => ({ rc: 0, signal: null, out: '', err: '' })), 'all missing-runtime launches are silent successes')
    const log = readFileSync(join(logs, 'brewmod-node.log'), 'utf8')
    assert.equal(log.trim().split('\n').length, 3, 'each plugin emits exactly one diagnostic line per day')
    assert.match(log, /[Nn]ode/, 'diagnostic identifies the missing runtime')
    assert.match(log, /nvm install --lts/, 'diagnostic gives an actionable installation command')
    assert.deepEqual(readdirSync(logs).filter((name) => name.startsWith('.brewmod-')).sort(),
      MODS.map((mod) => `.${mod}-node-missing-${new Date().toISOString().slice(0, 10)}`).sort(), 'only today\'s marker per plugin survives; older ones are pruned')
  })
})
