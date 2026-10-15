// Run: node --test brewmod-plan-effort/tests/mode.test.mjs (plain Node; `claude plugin test` runs *.test.ts only)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'hooks', 'mode.mjs')

const run = (input, root) => {
  const r = spawnSync('node', [SCRIPT], { input, env: { ...process.env, CLAUDE_PLUGIN_ROOT: root }, encoding: 'utf8' })
  return { rc: r.status, out: r.stdout }
}
const fresh = () => mkdtempSync(join(tmpdir(), 'plan-effort-mode-'))
const state = (root) => join(root, '.state')

for (const event of ['UserPromptSubmit', 'PostToolBatch']) {
  test(`GIVEN a ${event} payload in plan mode WHEN mode.mjs runs THEN mode-<session>.json holds the mode and {} is printed`, () => {
    const root = fresh()
    const before = Date.now()
    const r = run(JSON.stringify({ hook_event_name: event, session_id: 'sess-1', permission_mode: 'plan' }), root)
    const written = JSON.parse(readFileSync(join(state(root), 'mode-sess-1.json'), 'utf8'))
    assert.deepEqual({ rc: r.rc, out: r.out, mode: written.mode, tsFresh: written.ts >= before && written.ts <= Date.now(), files: readdirSync(state(root)) },
      { rc: 0, out: '{}', mode: 'plan', tsFresh: true, files: ['mode-sess-1.json'] }, 'exact file, exact content, no temp leftovers')
  })
}

test('GIVEN plan then default payloads WHEN mode.mjs runs twice THEN the file holds default', () => {
  const root = fresh()
  run(JSON.stringify({ session_id: 's', permission_mode: 'plan' }), root)
  run(JSON.stringify({ session_id: 's', permission_mode: 'default' }), root)
  assert.equal(JSON.parse(readFileSync(join(state(root), 'mode-s.json'), 'utf8')).mode, 'default', 'last payload wins')
})

test('GIVEN a payload with agent_id WHEN mode.mjs runs THEN nothing is written', () => {
  const root = fresh()
  const r = run(JSON.stringify({ session_id: 's', permission_mode: 'plan', agent_id: 'a1' }), root)
  assert.deepEqual({ rc: r.rc, out: r.out, state: existsSync(state(root)) }, { rc: 0, out: '{}', state: false }, 'subagent payload skipped')
})

for (const [label, payload] of [
  ['non-string mode', { session_id: 's', permission_mode: 42 }],
  ['missing mode', { session_id: 's' }],
  ['path-traversal session id', { session_id: '../evil', permission_mode: 'plan' }],
  ['missing session id', { permission_mode: 'plan' }],
]) {
  test(`GIVEN ${label} WHEN mode.mjs runs THEN nothing is written and {} rc 0`, () => {
    const root = fresh()
    const r = run(JSON.stringify(payload), root)
    assert.deepEqual({ rc: r.rc, out: r.out, state: existsSync(state(root)) }, { rc: 0, out: '{}', state: false }, label)
  })
}

for (const [label, input] of [['corrupt stdin', '{not json'], ['empty stdin', ''], ['JSON null', 'null']]) {
  test(`GIVEN ${label} WHEN mode.mjs runs THEN {} rc 0 and nothing is written`, () => {
    const root = fresh()
    const r = run(input, root)
    assert.deepEqual({ rc: r.rc, out: r.out, state: existsSync(state(root)) }, { rc: 0, out: '{}', state: false }, label)
  })
}

test('GIVEN an unwritable root WHEN mode.mjs runs THEN {} rc 0 (fail open)', () => {
  const root = fresh()
  writeFileSync(join(root, '.state'), 'a file where the directory should be')
  const r = run(JSON.stringify({ session_id: 's', permission_mode: 'plan' }), root)
  assert.deepEqual({ rc: r.rc, out: r.out }, { rc: 0, out: '{}' }, 'write failure is swallowed')
})

test('GIVEN a 8-day-old and a fresh mode file WHEN mode.mjs runs THEN only the old one is pruned', () => {
  const root = fresh()
  mkdirSync(state(root))
  const old = join(state(root), 'mode-old.json')
  const other = join(state(root), 'mode-fresh.json')
  const foreign = join(state(root), 'notes.txt')
  for (const f of [old, other, foreign]) writeFileSync(f, '{}')
  const eight = (Date.now() - 8 * 24 * 3600 * 1000) / 1000
  utimesSync(old, eight, eight)
  utimesSync(foreign, eight, eight)
  run(JSON.stringify({ session_id: 'cur', permission_mode: 'plan' }), root)
  assert.deepEqual(readdirSync(state(root)).sort(), ['mode-cur.json', 'mode-fresh.json', 'notes.txt'], 'old mode file pruned, others kept')
})
