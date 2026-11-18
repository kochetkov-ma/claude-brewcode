import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { assemble, loadDefs } from '../hooks/inject.mjs'
import { expandInline, previewContext, resolveRegistry, scanDraft, submitContext } from './bridge.mjs'
import { completionAt, insertCompletion, runEditor } from './editor.mjs'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const context = (text) => ({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text } })
const put = (root, file, text) => {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, text)
}
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
const definition = (body, metadata = '') => `---\n${metadata}---\n${body}`
const terminalStreams = (t) => {
  const input = Object.assign(new PassThrough(), { isTTY: true, setRawMode() {} })
  const output = Object.assign(new PassThrough(), { isTTY: true })
  t.after(() => input.end())
  return { input, output }
}

test('shared engine parity covers five shortcuts, modes, escaping, priority and cap', (t) => {
  // GIVEN an isolated registry backed by the shipped Markdown files.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-bridge-parity-')))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const options = { cwd: dir, env: { HOME: dir } }
  const registry = resolveRegistry(options)
  const defs = loadDefs({ pluginRoot, root: dir, configDir: path.join(dir, '.claude') })
  assert.deepEqual(registry.defs, defs, 'bridge loads the exact shared effective definitions')
  assert.deepEqual([...new Set(defs.map((def) => def.name))], ['+', 'a', 'm', 'r', 'rr'], 'all five default shortcuts exist')

  // WHEN each shortcut and the review conflict are submitted in each permission mode.
  const rows = ['default', 'plan'].flatMap((mode) => ['+++', '++m', '++a', '++r', '++rr', '++r ++rr', '+++ ++m ++a ++r ++rr'].map((prompt) => ({ mode, prompt })))
  const actual = rows.map(({ mode, prompt }) => submitContext({ hook_event_name: 'UserPromptSubmit', prompt, permission_mode: mode }, options))
  const expected = rows.map(({ mode, prompt }) => context(assemble(defs, '++', prompt, mode)))
  const escapes = ['++/ ++m', '++\\ ++rr'].map((prompt) => submitContext({ hook_event_name: 'UserPromptSubmit', prompt, permission_mode: 'plan' }, options))
  const preflight = ['ordinary prompt', '++/ ++m', '<task-notification> ++m'].map((prompt) => submitContext({ hook_event_name: 'UserPromptSubmit', cwd: path.join(dir, 'absent'), prompt }, { env: {} }))
  const capped = { ...registry, defs: [{ ...defs.find((def) => def.name === 'm'), header: '', body: 'x'.repeat(9001) }] }

  // THEN complete hook objects match, higher priority wins, and escapes/cap preserve shared behavior.
  assert.deepEqual({ actual, escapes, preflight, priority: previewContext(registry, '++r ++rr', 'default'), cap: previewContext(capped, '++m', 'default') }, {
    actual: expected, escapes: [{}, {}], preflight: [{}, {}, {}], priority: assemble(defs, '++', '++rr', 'default'), cap: 'x'.repeat(9000) + '\n...[truncated]',
  }, 'hook output preserves shared default/plan assembly, review winner, escapes and cap')
})

test('worktree layers reload live Markdown, expand inline once and reject project symlinks', (t) => {
  // GIVEN a real linked worktree, isolated global profile and minimal layered registry.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-bridge-layers-')))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const source = path.join(dir, 'source')
  const sibling = path.join(dir, 'worktree $(unexecuted)')
  const worktree = `${sibling} \n`
  const plugin = path.join(dir, 'plugin')
  const home = path.join(dir, 'home')
  const configDir = path.join(home, '.claude')
  fs.mkdirSync(source)
  git(source, 'init', '-q', '-b', 'main')
  put(source, 'tracked', 'fixture')
  git(source, 'add', 'tracked')
  git(source, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture')
  git(source, 'worktree', 'add', '-q', '--detach', worktree)
  put(worktree, 'nested/deeper/.keep', '')
  put(plugin, 'placeholders/m.md', definition('default', 'name: m\nlegacy: manager\nheader: "H {token}"\n'))
  put(plugin, 'placeholders/m.plan.md', definition('plan'))
  put(sibling, '.claude/placeholders/m.md', definition('wrong sibling'))
  const options = { cwd: path.join(worktree, 'nested/deeper'), pluginRoot: plugin, env: { HOME: home, CLAUDE_CONFIG_DIR: path.join(dir, 'ignored'), BREWMOD_PLACEHOLDERS_PREFIX: '!!' } }
  assert.deepEqual({ root: resolveRegistry(options).root, context: previewContext(resolveRegistry(options), '!!m', 'default') }, { root: worktree, context: 'H !!m\n\ndefault' }, 'nested cwd resolves linked worktree and default layer')

  // WHEN successively stronger layers appear and the project file changes without restarting.
  const rows = [
    [configDir, 'manager/prompts/manager.md', 'global legacy', 'global legacy'],
    [configDir, 'placeholders/m.md', definition('global native'), 'global native'],
    [worktree, '.claude/brewtools/manager/prompts/manager.md', 'project legacy', 'project legacy'],
    [worktree, '.claude/placeholders/m.md', definition('project native'), 'project native'],
    [worktree, '.claude/placeholders/m.md', definition('live edit'), 'live edit'],
  ]
  const layers = rows.map(([root, file, raw, body]) => {
    put(root, file, raw)
    const registry = resolveRegistry(options)
    return { actual: previewContext(registry, '!!m', 'plan'), expected: `H !!m\n\n${body}\n\nplan` }
  })
  put(worktree, '.claude/placeholders/x.md', definition('inline !!m', 'insert: inline\n'))
  put(worktree, '.env', 'PRIVATE')
  fs.symlinkSync(path.join(worktree, '.env'), path.join(worktree, '.claude/placeholders/leak.md'))
  const registry = resolveRegistry(options)
  const expanded = expandInline(registry, '!!x !!x')
  const snapshot = {
    root: registry.root, configDir: registry.configDir, prefix: registry.prefix,
    names: registry.defs.map((def) => def.name), expanded,
    context: previewContext(registry, expanded, 'plan'), escaped: expandInline(registry, '!!/ !!x'),
    scan: scanDraft(registry, '!!x !!leak'),
  }
  fs.renameSync(path.join(worktree, '.claude/placeholders'), path.join(worktree, 'moved'))
  fs.symlinkSync(path.join(worktree, 'moved'), path.join(worktree, '.claude/placeholders'))

  // THEN full layer outputs agree, inline bodies are not rescanned, and file/directory symlinks are ignored.
  assert.deepEqual({ layers: layers.map((row) => row.actual), snapshot, symlinkedDirectory: previewContext(resolveRegistry(options), '!!m', 'default') }, {
    layers: layers.map((row) => row.expected),
    snapshot: {
      root: worktree, configDir, prefix: '!!', names: ['m', 'm', 'x'], expanded: 'inline !!m inline !!m',
      context: 'H !!m\n\nlive edit\n\nplan', escaped: null,
      scan: { tokens: [{ text: '!!x', name: 'x', isKnown: true, start: 0, end: 3 }, { text: '!!leak', name: 'leak', isKnown: false, start: 4, end: 10 }] },
    },
    symlinkedDirectory: 'H !!m\n\nproject legacy',
  }, 'worktree precedence, live edits, inline rules, custom prefix and symlink safeguards stay exact')
})

test('completion uses shared language boundaries and preserves surrounding punctuation', () => {
  // GIVEN shared symbolic and word definitions and an astral letter.
  const registry = { prefix: '++', defs: ['+', '#?', 'r', 'rr'].map((name) => ({ name, insert: 'context', header: '', body: name })) }
  const astral = '\u{10400}'

  // WHEN completing tokens with punctuation, Unicode letters, or combining marks on either side.
  const rows = [
    ['+++.', 2, '+', '+++.', 3, ['#?', '+', 'r', 'rr']],
    ['+++.', 3, '+', '+++.', 3, ['+']],
    ['++#?,', 3, '#?', '++#?,', 4, ['#?']],
    ['++r!', 3, 'rr', '++rr!', 4, ['r', 'rr']],
    ['é++r', 4, 'rr', 'é++rr', 5, ['r', 'rr']],
    ['e\u0301++', 4, '+', 'e\u0301++', 4, ['r', 'rr']],
    [`${astral}++`, 4, '+', `${astral}++`, 4, ['r', 'rr']],
    [`+++${astral}`, 3, '+', `+++${astral}`, 3, []],
    ['++r!', 3, '+', '++r!', 3, ['r', 'rr']],
  ]
  const attempts = rows.map(([text, caret, name]) => ({
    candidates: completionAt(registry, text, caret)?.candidates ?? [], result: insertCompletion(registry, text, caret, name),
  }))
  const accepted = attempts[4].result.text

  // THEN only shared matches are offered and exact token spans agree with the assembler.
  assert.deepEqual(attempts, rows.map(([, , , text, caret, candidates]) => ({ candidates, result: { text, caret } })), 'shared boundaries and draft punctuation stay exact')
  assert.deepEqual({ view: scanDraft(registry, accepted), context: previewContext(registry, accepted, 'default') }, {
    view: { tokens: [{ text: '++rr', name: 'rr', isKnown: true, start: 1, end: 5 }] }, context: 'rr',
  }, 'the inserted token is scanned and assembled at the intended offset')
})

test('bracketed paste preserves controls as text and normalizes CRLF once', { timeout: 2000 }, async (t) => {
  // GIVEN an isolated draft and a terminal-like stream delivering split keystrokes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-editor-paste-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const draft = path.join(dir, 'draft.md')
  fs.writeFileSync(draft, 'Draft: ')
  fs.chmodSync(draft, 0o640)
  const { input, output } = terminalStreams(t)

  // WHEN a split paste carries CRLF, ANSI and editor control bytes before Ctrl+S.
  const edited = runEditor(draft, { cwd: dir, input, output, env: { HOME: dir } })
  input.write('\x1b[200~first\r')
  input.write('\n\x1b[31msecond\x1b[0m\x03\x13\x1b[201~\x13')

  // THEN it saves exact pasted controls, one newline, and the original file mode.
  assert.deepEqual({ result: await edited, text: fs.readFileSync(draft, 'utf8'), mode: fs.statSync(draft).mode & 0o777 }, {
    result: { saved: true }, text: 'Draft: first\n\x1b[31msecond\x1b[0m\x03\x13', mode: 0o640,
  }, 'pasted controls are literal and the original draft mode survives save')
})

test('a failed draft replacement followed by cancel preserves the original bytes', { timeout: 2000 }, async (t) => {
  // GIVEN an isolated draft and an injected rename failure after staging.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-editor-save-')))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const draft = path.join(dir, 'draft.md')
  const original = Buffer.from('Original\r\n')
  fs.writeFileSync(draft, original)
  const { input, output } = terminalStreams(t)
  const renames = []
  const renameDraft = (from, to) => {
    renames.push({ directory: path.dirname(from), target: to, before: fs.readFileSync(to), staged: fs.readFileSync(from, 'utf8') })
    throw new Error('injected rename failure')
  }

  // WHEN the draft is edited, Ctrl+S fails, and Ctrl+C cancels.
  const edited = runEditor(draft, { cwd: dir, input, output, env: { HOME: dir }, renameDraft })
  input.write('changed\x13\x03')

  // THEN the original is intact and the private staging file is gone.
  assert.deepEqual({ result: await edited, bytes: fs.readFileSync(draft), files: fs.readdirSync(dir), renames }, {
    result: { saved: false }, bytes: original, files: ['draft.md'],
    renames: [{ directory: dir, target: draft, before: original, staged: 'Original\r\nchanged' }],
  }, 'failed atomic replacement and cancel retain exact original draft bytes without staging leftovers')
})
