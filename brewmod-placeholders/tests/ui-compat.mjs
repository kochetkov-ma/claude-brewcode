import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const MOD = dirname(dirname(fileURLToPath(import.meta.url)))
const CASE_FILE = 'tests/band.test.ts'
const CASE = 'GIVEN the state read fails WHEN the band mounts THEN it fails open to the engine tree'
const DONE = 'UI_COMPAT_BODY_COMPLETED'
const BODY_ERROR = 'CORE_FALLBACK_BODY_FAILED:'
const ERROR = 'brewmod-placeholders: HooksError: brewmod-placeholders: $.state.get: state down'
const SKIPPED = `brewmod-placeholders's ui.render hook was skipped: ${ERROR}`
const POLICY = [ERROR, "in brewmod-placeholders's ui.render hook", 'the engine reported:', SKIPPED].join('\n')
const COMPLETION = [`Error: ${DONE}`, 'the engine reported:', SKIPPED].join('\n')
const EXPECTED = { '2.1.310': { status: 0, pass: 454, fail: 0 }, '2.1.327': { status: 1, pass: 453, fail: 1 } }
const fail = (message) => { throw new Error(`UI compatibility gate: ${message}`) }
const requireThat = (condition, message) => { if (!condition) fail(message) }
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')

function parse(output) {
  const summary = output.match(/\n\s+(\d+) pass\n\s+(\d+) fail\nRan (\d+) tests? across (\d+) files?\. \[[^\n]+\]\s*$/)
  requireThat(summary !== null, 'native summary is absent or malformed')
  const rows = []
  const files = new Set()
  let file
  for (const match of output.matchAll(/^(tests\/[^:\n]+):$|^\((pass|fail)\) (.+) \[[\d.]+ms\]\n/gm)) {
    if (match[1] !== undefined) {
      file = match[1]
      files.add(file)
      continue
    }
    requireThat(file !== undefined, 'native case has no test file section')
    const following = output.slice(match.index + match[0].length)
    const end = following.search(/^(?:\((?:pass|fail)\)|tests\/|\s+\d+ pass$)/m)
    const body = match[2] === 'fail' ? (end === -1 ? following : following.slice(0, end)).split('\n').map((line) => line.trim()).filter(Boolean).join('\n') : ''
    rows.push({ file, status: match[2], name: match[3], body })
  }
  const failures = rows.filter((row) => row.status === 'fail')
  const result = { pass: Number(summary[1]), fail: Number(summary[2]), tests: Number(summary[3]), files: Number(summary[4]), rows, failures }
  requireThat(result.pass + result.fail === result.tests && result.rows.length === result.tests && result.failures.length === result.fail && files.size === result.files, 'native counts disagree')
  return result
}

function validate(version, native, completion) {
  const expected = EXPECTED[version]
  requireThat(expected !== undefined, 'unqualified native version')
  requireThat(native.signal === null && completion.signal === null && !native.error && !completion.error, 'native process did not finish normally')
  const full = parse(native.output)
  requireThat(native.status === expected.status && full.pass === expected.pass && full.fail === expected.fail && full.tests === 454 && full.files === 17, 'full suite exit or counts changed')
  requireThat(!native.output.includes(BODY_ERROR) && !native.output.includes(DONE), 'full fallback body did not complete normally')
  const qualified = full.rows.filter((row) => row.name === CASE)
  requireThat(qualified.length === 1 && qualified[0].file === CASE_FILE && qualified[0].status === (expected.fail === 0 ? 'pass' : 'fail'), 'exact qualified full-suite case is absent or misplaced')
  requireThat(full.failures.every((failure) => failure.file === CASE_FILE && failure.name === CASE && failure.body === POLICY), 'unexpected failing test or teardown')
  const proof = parse(completion.output)
  requireThat(completion.status === 1 && proof.pass === 0 && proof.fail === 1 && proof.tests === 1 && proof.files === 1, 'completion probe exit or counts changed')
  requireThat(!completion.output.includes(BODY_ERROR) && proof.failures[0].file === CASE_FILE && proof.failures[0].name === CASE && proof.failures[0].body === COMPLETION, 'exact fallback body completion is unproven')
  return { version, native: { status: native.status, pass: full.pass, fail: full.fail }, completion: { status: completion.status, marker: DONE } }
}

const fixture = (pass, failure, body = '') => {
  const files = pass === 0 ? 1 : 17
  const rest = pass - (failure ? 0 : 1)
  const row = (name) => `(pass) ${name} [1.00ms]\n`
  const qualified = `(${failure ? 'fail' : 'pass'}) ${CASE} [1.00ms]\n${failure ? `${body}\n` : ''}`
  const first = `\n${CASE_FILE}:\n${qualified}${Array.from({ length: rest - (files - 1) }, (_, i) => row(`ordinary ${i}`)).join('')}`
  const others = Array.from({ length: files - 1 }, (_, i) => `\ntests/other-${i}.test.ts:\n${row(`other ${i}`)}`).join('')
  return { status: failure ? 1 : 0, signal: null, output: `${first}${others}\n ${pass} pass\n ${failure} fail\nRan ${pass + failure} ${pass + failure === 1 ? 'test' : 'tests'} across ${files} ${files === 1 ? 'file' : 'files'}. [0.01s]\n` }
}

function selfTest() {
  const full = fixture(453, 1, POLICY)
  const proof = fixture(0, 1, COMPLETION)
  const pinned = fixture(454, 0)
  assert.deepEqual(validate('2.1.310', pinned, proof).native, { status: 0, pass: 454, fail: 0 }, 'old native era accepts only the complete passing suite')
  assert.deepEqual(validate('2.1.327', full, proof).native, { status: 1, pass: 453, fail: 1 }, 'new native era retains its one expected policy failure')
  const cases = [
    ['body assertion failure', '2.1.327', { ...full, output: full.output.replace(POLICY, `${BODY_ERROR} AssertionError`) }, proof],
    ['another test failure', '2.1.327', { ...full, output: full.output.replace(CASE, 'another test') }, proof],
    ['changed counts', '2.1.327', fixture(452, 1, POLICY), proof],
    ['unexpected teardown', '2.1.327', fixture(453, 1, `${POLICY}\nnew diagnostic`), proof],
    ['unknown native era', '2.1.328', full, proof],
    ['missing completion', '2.1.327', full, fixture(0, 1, POLICY)],
    ['completion body failure', '2.1.327', full, fixture(0, 1, `${BODY_ERROR} ${DONE}`)],
    ['wrong completion exit', '2.1.327', full, { ...proof, status: 0 }],
    ['wrong suite exit', '2.1.327', { ...full, status: 0 }, proof],
    ['abandoned process', '2.1.327', { ...full, signal: 'SIGTERM' }, proof],
    ['wrong full-suite file', '2.1.327', { ...full, output: full.output.replace(`${CASE_FILE}:`, 'tests/wrong.test.ts:') }, proof],
    ['wrong completion file', '2.1.327', full, { ...proof, output: proof.output.replace(`${CASE_FILE}:`, 'tests/wrong.test.ts:') }],
    ['missing pinned qualified pass', '2.1.310', { ...pinned, output: pinned.output.replace(CASE, 'unrelated pass') }, proof],
    ['wrong pinned qualified file', '2.1.310', { ...pinned, output: pinned.output.replace(`${CASE_FILE}:`, 'tests/wrong.test.ts:') }, proof],
    ['duplicated pinned qualified pass', '2.1.310', { ...pinned, output: pinned.output.replace('(pass) ordinary 0 ', `(pass) ${CASE} `) }, proof],
  ]
  for (const [name, version, raw, completed] of cases) assert.throws(() => validate(version, raw, completed), /UI compatibility gate:/, name)
  return { accepted: 2, rejected: cases.length }
}

function sourceFiles(directory, root = directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    const name = relative(root, path)
    if (entry.name === 'codex' || entry.name === '.state' || name.startsWith('.claude-plugin/types')) return []
    return entry.isDirectory() ? sourceFiles(path, root) : [{ path: name, mode: statSync(path).mode & 0o777, sha256: hash(readFileSync(path)) }]
  }).sort((a, b) => a.path.localeCompare(b.path))
}

function completedProbe(source) {
  const start = source.indexOf(`test('${CASE}',`)
  requireThat(start !== -1 && source.indexOf(`test('${CASE}',`, start + 1) === -1, 'negative case is not unique')
  const end = source.indexOf('\ntest(', start + 1)
  const prelude = source.indexOf('for (const surface of SURFACES) {')
  requireThat(end !== -1 && prelude !== -1 && prelude < start, 'negative fixture boundaries changed')
  const body = source.slice(start, end).trimEnd()
  const close = body.lastIndexOf('\n})')
  requireThat(close !== -1 && body.slice(close) === '\n})' && body.includes(BODY_ERROR) && !body.includes(DONE), 'negative completion guard changed')
  return `${source.slice(0, prelude)}\n${body.slice(0, close)}\n  throw new Error('${DONE}')${body.slice(close)}\n`
}

function main() {
  const controls = selfTest()
  if (process.argv.length === 3 && process.argv[2] === '--self-test') {
    process.stdout.write(`${JSON.stringify({ controls })}\n`)
    return
  }
  const args = process.argv.slice(2)
  requireThat(args.length === 4 && args[0] === '--claude' && args[2] === '--evidence-dir' && isAbsolute(args[1]) && isAbsolute(args[3]), 'use --claude ABSOLUTE_PATH --evidence-dir NEW_ABSOLUTE_DIRECTORY')
  const cli = args[1]
  const evidence = args[3]
  requireThat(relative(MOD, evidence).startsWith('..'), 'evidence must stay outside the mod')
  mkdirSync(evidence)
  const scratch = mkdtempSync(join(tmpdir(), 'brewpage-placeholder-native-'))
  try {
    const config = join(scratch, 'config')
    mkdirSync(config)
    const env = { PATH: process.env.PATH, LANG: 'C.UTF-8', CLAUDE_CONFIG_DIR: config, DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }
    const versionRun = spawnSync(cli, ['--version'], { env, encoding: 'utf8', timeout: 30_000 })
    const version = versionRun.stdout?.match(/^2\.1\.(310|327) \(Claude Code\)\r?\n$/)?.[0].split(' ')[0]
    requireThat(versionRun.status === 0 && EXPECTED[version] !== undefined, 'binary version is not exactly qualified')
    const before = sourceFiles(MOD)
    const run = (path, label) => {
      const result = spawnSync(cli, ['plugin', 'test', path], { env, cwd: MOD, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 })
      writeFileSync(join(evidence, `${label}.stdout.log`), result.stdout ?? '')
      writeFileSync(join(evidence, `${label}.stderr.log`), result.stderr ?? '')
      return { status: result.status, signal: result.signal, error: result.error?.message, output: (result.stdout ?? '') + (result.stderr ?? '') }
    }
    const native = run(MOD, 'native')
    const probe = join(scratch, 'brewmod-placeholders')
    cpSync(MOD, probe, { recursive: true, filter: (path) => {
      const name = relative(MOD, path)
      return !name.startsWith('codex') && !name.startsWith('.state') && !name.startsWith('.claude-plugin/types') && (!/\.test\.tsx?$/.test(name) || name === 'tests/band.test.ts')
    } })
    const original = readFileSync(join(MOD, 'tests/band.test.ts'), 'utf8')
    const childSource = completedProbe(original)
    writeFileSync(join(probe, 'tests/band.test.ts'), childSource)
    writeFileSync(join(evidence, 'completion-source.ts'), childSource)
    const completion = run(probe, 'completion')
    requireThat(JSON.stringify(before) === JSON.stringify(sourceFiles(MOD)), 'working source changed during native runs')
    const result = { ...validate(version, native, completion), controls, sourceManifestSha256: hash(JSON.stringify(before)), source: before, completionSourceSha256: hash(childSource) }
    writeFileSync(join(evidence, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
    process.stdout.write(`${JSON.stringify({ ...result, source: undefined, evidence })}\n`)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

main()
