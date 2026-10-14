#!/usr/bin/env node
// Runs the REAL brewtools manager-prompt.mjs per vector -> golden.generated.ts. `--check` regenerates in memory, rc 1 on any diff.
// Custom prefix rule: mod prompt `@@x` == brewtools prompt `++x`; header tokens `++x` -> `@@x`, bodies untouched.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const modDir = resolve(here, '..', '..')
const repoDir = resolve(modDir, '..')
const pluginRoot = join(repoDir, 'brewtools')
const hook = join(pluginRoot, 'hooks', 'manager-prompt.mjs')
const refDir = join(pluginRoot, 'skills', 'manager-setup', 'references')

const args = process.argv.slice(2)
const check = args.includes('--check')
const gi = args.indexOf('--golden')
const goldenPath = gi >= 0 && args[gi + 1] ? resolve(args[gi + 1]) : join(here, 'golden.generated.ts')

const fail = (msg, rc = 2) => { process.stderr.write(`gen-golden: ${msg}\n`); process.exit(rc) }

// Length/sha vectors from the parity spec (02-codeword-parity-spec.md section 2), re-verified on every run.
const SPEC = [
  ['++m', 'default', 1790, 'ef8045792821'],
  ['++m', 'plan', 3515, '72ba858d91c9'],
  ['++a', 'default', 1019, 'b8bdf3ab00ae'],
  ['++r', 'default', 571, '53e00875c72b'],
  ['++rr', 'default', 895, '4a76c6b4176b'],
  ['+++', 'plan', 1395, 'd20cc630a056'],
  ['+++ ++m ++a ++rr', 'plan', 6845, '3e8ee98e12fe'],
  ['+++ ++m ++a ++r', 'default', 3394, 'e64f6487bee3'],
]

const ref = (name) => readFileSync(join(refDir, `${name}.md`), 'utf8')
const P = '@@'

// vector = { id, group, prompt, mode, prefix?, files?: [{ legacy, layer, raw }], cwdSub?, decoy?, note? }
const vectors = []
const add = (v) => vectors.push({ prefix: '++', files: [], ...v })

SPEC.forEach(([prompt, mode], i) => add({ id: `spec-${i + 1}`, group: 'spec', prompt, mode }))

const EDGES = [
  ['e01-nonascii-after', '++mé', 'default'], ['e02-dot-after', '++m.', 'default'], ['e03-parens', '(++m)', 'default'],
  ['e04-upper', '++M', 'default'], ['e05-double-letter', '++mm', 'default'], ['e06-word-before', 'x++m', 'default'],
  ['e07-plus-before-plan', '+++m', 'plan'], ['e08-underscore-after', '++m_', 'default'], ['e09-space-inside', '++ rr', 'default'],
  ['e10-letter-before-cron', 'é+++', 'plan'], ['e11-cjk-around-cron', '字+++字', 'plan'], ['e12-digit-after-cron', '+++5', 'plan'],
  ['e13-four-plus', '++++', 'plan'], ['e14-punct-after-cron', '+++!', 'plan'], ['e15-zwj-after-cron', '+++‍', 'plan'],
  ['e16-standalone-cron', 'x +++ y', 'plan'],
]
EDGES.forEach(([id, prompt, mode]) => add({ id, group: 'edge', prompt, mode }))

const EXTRA = [
  ['x01-r-then-rr', '++r ++rr', 'default'], ['x02-glued-r-rr', '++r++rr', 'default'], ['x03-upper-r', '++R', 'default'],
  ['x04-upper-rr', '++RR', 'default'], ['x05-upper-a', '++A', 'default'], ['x06-glued-a-m', '++a++m', 'default'],
  ['x07-cron-default', '+++', 'default'], ['x08-mode-PLAN-uppercase', '++m', 'PLAN'], ['x09-mode-absent', '++m', null],
  ['x10-mode-acceptEdits', '++m', 'acceptEdits'], ['x11-synthetic-task', '<task-notification>++m', 'default'],
  ['x12-synthetic-agent', '  \n<agent-message from=x> ++m', 'default'], ['x13-bare-agent-message', '<agent-message>++m', 'default'],
  ['x14-upper-task-notification', '<TASK-NOTIFICATION>++m', 'default'], ['x15-synthetic-not-leading', 'see <task-notification>++m', 'default'],
  ['x16-all-four-default', '++m ++a ++r ++rr', 'default'], ['x17-order-a-then-m', '++a ++m', 'default'],
  ['x18-cron-m-plan', '+++ ++m', 'plan'], ['x19-duplicate', '++m ++m', 'default'], ['x20-plain', 'hello world', 'default'],
  ['x21-all-plan', '++rr ++a ++m +++ ++r', 'plan'], ['x22-emoji-after', '++m😀', 'default'], ['x23-newline-separated', 'do this\n++a\nthen ++r', 'default'],
  ['c01-i-plusplus', 'i++', 'default'], ['c02-cpp', 'C++ code', 'default'], ['c03-dashes', '--flag', 'default'],
  ['c04-x-plusplus-y', 'x++y', 'default'], ['c05-cpp-cron', 'C+++', 'plan'], ['c06-i-plusplus-semi', 'for (i=0;i<n;i++) {}', 'plan'],
]
EXTRA.forEach(([id, prompt, mode]) => add({ id, group: 'extra', prompt, mode }))

const proj = (legacy, raw) => ({ legacy, layer: 'project', raw })
const glob = (legacy, raw) => ({ legacy, layer: 'global', raw })
const OV = [
  ['o01-empty-full', '++m', 'default', [proj('full', '')]],
  ['o02-empty-full-with-a', '++m ++a', 'default', [proj('full', '')]],
  ['o03-empty-planmode', '++m', 'plan', [proj('planmode', '')]],
  ['o04-empty-planmode-with-a', '++m ++a', 'plan', [proj('planmode', '')]],
  ['o05-empty-rr-beats-r', '++rr ++r', 'default', [proj('review-regression', '')]],
  ['o06-empty-r', '++r', 'default', [proj('review-double', '')]],
  ['o07-empty-cron', '+++ ++a', 'plan', [proj('cron-plan', '')]],
  ['o08-whitespace-only', '++a', 'default', [proj('architect', '  \n\n\t\n')]],
  ['o09-crlf-fenced', '++a', 'default', [proj('architect', '```text\r\nline1\r\nline2\r\n```\r\n')]],
  ['o10-crlf-unfenced', '++a', 'default', [proj('architect', 'line1\r\nline2\r\n')]],
  ['o11-bom-fenced', '++a', 'default', [proj('architect', '﻿```\nbom fenced\n```\n')]],
  ['o12-bom-unfenced', '++a', 'default', [proj('architect', '﻿bom unfenced\n')]],
  ['o13-four-backticks', '++a', 'default', [proj('architect', '````\nouter\n```\ninner\n```\n````\n')]],
  ['o14-tilde-closed-by-backtick', '++a', 'default', [proj('architect', '~~~\nfoo\n```\n')]],
  ['o15-inline-triple-backtick', '++a', 'default', [proj('architect', '```\nuse ```x``` inline\n```\n')]],
  ['o16-multi-fence-and-outside-text', '++a', 'default', [proj('architect', 'intro\n```\nA\n```\nmid\n~~~md\nB\n~~~\noutro')]],
  ['o17-unfenced-plain', '++a', 'default', [proj('architect', '\n\n  plain override text  \n\n')]],
  ['o18-global-only', '++a', 'default', [glob('architect', '```\nfrom global\n```\n')]],
  ['o19-project-over-global', '++a', 'default', [proj('architect', '```\nfrom project\n```\n')]],
  ['o20-empty-project-over-global', '++a', 'default', [proj('architect', '')]],
  ['o21-reference-full-raw', '++m', 'default', [proj('full', ref('full'))]],
  ['o22-reference-planmode-raw', '++m', 'plan', [proj('planmode', ref('planmode'))]],
  ['o23-reference-cron-raw', '+++', 'plan', [proj('cron-plan', ref('cron-plan'))]],
  ['o24-reference-review-regression-raw', '++rr', 'default', [proj('review-regression', ref('review-regression'))]],
  ['o31-trailing-blank-lines-in-block', '++a', 'default', [proj('architect', '```\nA\n\n\n```\n```\nB\n```')]],
  ['o25-two-overrides', '++a ++r', 'default', [proj('architect', 'A!'), proj('review-double', 'R!')]],
]
for (const [id, prompt, mode, files] of OV) add({ id, group: 'override', prompt, mode, files })
// o19/o20: a global file exists too but the project one wins (empty counts); the mod sees only the winner in `files`.
vectors.find((v) => v.id === 'o19-project-over-global').shadow = [glob('architect', '```\nfrom global\n```\n')]
vectors.find((v) => v.id === 'o20-empty-project-over-global').shadow = [glob('architect', '```\nfrom global\n```\n')]

// Cap vectors: header length is fixed per mode, so build texts that hit 8999/9000/9001 and a split surrogate pair.
const HEAD_M = 'User typed `++m` — Manager mode is active for this turn:'
const capText = (total, tail = '') => 'x'.repeat(total - HEAD_M.length - 2 - tail.length) + tail
add({ id: 'o26-cap-exactly-9000', group: 'cap', prompt: '++m', mode: 'default', files: [proj('full', capText(9000))] })
add({ id: 'o27-cap-9001', group: 'cap', prompt: '++m', mode: 'default', files: [proj('full', capText(9001))] })
add({ id: 'o28-cap-way-over', group: 'cap', prompt: '++m', mode: 'default', files: [proj('full', 'z'.repeat(10000))] })
add({
  id: 'o29-cap-splits-surrogate', group: 'cap', prompt: '++m', mode: 'default',
  files: [proj('full', 'y'.repeat(9000 - 1 - HEAD_M.length - 2) + '😀' + 'tail')],
})
add({ id: 'o30-cap-combined-plan', group: 'cap', prompt: '+++ ++m ++a ++rr', mode: 'plan', files: [proj('planmode', 'p'.repeat(6500))] })

add({ id: 'l01-launch-dir-override', group: 'launch-dir', prompt: '++a', mode: 'default', files: [proj('architect', '```\nroot override\n```\n')], cwdSub: true, note: 'CLAUDE_PROJECT_DIR=launch dir, hook cwd=sub' })
add({ id: 'l02-launch-dir-beats-sub-decoy', group: 'launch-dir', prompt: '++a', mode: 'default', files: [proj('architect', '```\nroot override\n```\n')], cwdSub: true, decoy: [proj('architect', '```\nsub decoy\n```\n')], note: 'a .claude/ under sub is ignored' })
add({ id: 'l03-launch-dir-defaults', group: 'launch-dir', prompt: '++m ++r', mode: 'default', cwdSub: true })

const CUSTOM = [
  ['p01-m', '@@m', 'default'], ['p02-m-plan', '@@m', 'plan'], ['p03-a-rr', '@@a @@rr', 'default'], ['p04-cron', '@@+', 'plan'],
  ['p05-r-rr', '@@r @@rr', 'default'], ['p06-all-plan', '@@+ @@m @@a @@rr', 'plan'], ['p07-word-before', 'x@@m', 'default'],
  ['p08-cron-default', '@@+', 'default'], ['p09-upper', '@@M @@R', 'default'], ['p10-synthetic', '<task-notification>@@m', 'default'],
]
for (const [id, prompt, mode] of CUSTOM) add({ id, group: 'custom-prefix', prompt, mode, prefix: P })
add({ id: 'p11-override-custom-prefix', group: 'custom-prefix', prompt: '@@a', mode: 'default', prefix: P, files: [proj('architect', 'A custom!')] })

// ---- run the real hook -------------------------------------------------------------------------
function runHook(v, base) {
  const root = join(base, 'proj'), cfg = join(base, 'cfg'), home = join(base, 'home')
  for (const d of [root, cfg, home]) mkdirSync(d, { recursive: true })
  const put = (files, dir, layer) => {
    for (const f of files.filter((x) => x.layer === layer)) {
      const p = join(dir, f.legacy + '.md')
      mkdirSync(dirname(p), { recursive: true })
      writeFileSync(p, f.raw, 'utf8')
    }
  }
  put([...v.files, ...(v.shadow ?? [])], join(root, '.claude', 'brewtools', 'manager', 'prompts'), 'project')
  put([...v.files, ...(v.shadow ?? [])], join(cfg, 'manager', 'prompts'), 'global')
  const cwd = v.cwdSub ? join(root, 'sub') : root
  mkdirSync(cwd, { recursive: true })
  if (v.decoy) put(v.decoy, join(cwd, '.claude', 'brewtools', 'manager', 'prompts'), 'project')
  const input = { hook_event_name: 'UserPromptSubmit', session_id: 'golden', transcript_path: join(base, 't.jsonl'), cwd, prompt: v.hookPrompt }
  if (v.mode !== null) input.permission_mode = v.mode
  const env = { PATH: process.env.PATH ?? '', HOME: home, CLAUDE_CONFIG_DIR: cfg, CLAUDE_PROJECT_DIR: root, CLAUDE_PLUGIN_ROOT: pluginRoot }
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify(input), env, encoding: 'utf8' })
  if (r.status !== 0) fail(`hook rc ${r.status} for ${v.id}: ${r.stderr}`)
  const lines = r.stdout.split('\n').filter((l) => l !== '')
  if (lines.length !== 1) fail(`hook stdout for ${v.id} is not one line: ${JSON.stringify(r.stdout)}`)
  const out = JSON.parse(lines[0])
  if (Object.keys(out).length === 0) return null
  const h = out.hookSpecificOutput
  if (!h || h.hookEventName !== 'UserPromptSubmit' || typeof h.additionalContext !== 'string' || Object.keys(out).length !== 1) {
    fail(`unexpected hook output shape for ${v.id}: ${lines[0].slice(0, 200)}`)
  }
  return h.additionalContext
}

// header tokens only: `User typed \`++x\`` at block starts -> the custom prefix
const HEADER_AT_BLOCK_START = /(^|\n\n---\n\n)User typed `\+\+(\+|m|a|rr|r)`/g
const rewriteHeaders = (s, prefix) => s.replace(HEADER_AT_BLOCK_START, (_, lead, n) => `${lead}User typed \`${prefix}${n}\``)

const base = mkdtempSync(join(tmpdir(), 'brewmod-golden-'))
const records = []
try {
  for (const v of vectors) {
    const hookPrompt = v.prefix === '++' ? v.prompt : v.prompt.split(v.prefix).join('++')
    const dir = join(base, v.id)
    mkdirSync(dir)
    const raw = runHook({ ...v, hookPrompt }, dir)
    const expected = raw === null || v.prefix === '++' ? raw : rewriteHeaders(raw, v.prefix)
    const rec = {
      id: v.id, group: v.group, prompt: v.prompt, hookPrompt, mode: v.mode, prefix: v.prefix,
      files: v.files, expected, length: expected === null ? null : expected.length,
      sha: expected === null ? null : createHash('sha256').update(expected, 'utf8').digest('hex'),
    }
    if (v.note) rec.note = v.note
    records.push(rec)
  }
} finally {
  rmSync(base, { recursive: true, force: true })
}

// spec table must reproduce on the real hook, else the parity spec itself is stale
SPEC.forEach(([prompt, mode, length, sha12], i) => {
  const r = records[i]
  const got = `${r.length}/${(r.sha ?? '').slice(0, 12)}`
  if (r.prompt !== prompt || r.mode !== mode || got !== `${length}/${sha12}`) {
    fail(`SPEC MISMATCH ${r.id}: hook gave ${got}, spec says ${length}/${sha12}`, 1)
  }
})

const files = Object.fromEntries(
  readdirSync(join(modDir, 'placeholders')).filter((f) => f.endsWith('.md')).sort()
    .map((f) => [f.replace(/\.md$/, ''), readFileSync(join(modDir, 'placeholders', f), 'utf8')]),
)

const body = `// Generated by tests/parity/gen-golden.mjs from the real brewtools hook; never edit by hand (--check gates it).
// expected = additionalContext of brewtools for hookPrompt (null = hook answered {}); prefix != ++ rewrites header tokens only.

export type GoldenFile = { legacy: string; layer: 'project' | 'global'; raw: string }
export type GoldenVector = {
  id: string
  group: string
  prompt: string
  hookPrompt: string
  mode: string | null
  prefix: string
  files: GoldenFile[]
  expected: string | null
  length: number | null
  sha: string | null
  note?: string
}

export const PLACEHOLDER_FILES: Record<string, string> = ${JSON.stringify(files, null, 2)}

export const VECTORS: GoldenVector[] = ${JSON.stringify(records, null, 2)}
`

if (check) {
  let current
  try {
    current = readFileSync(goldenPath, 'utf8')
  } catch (e) {
    fail(`cannot read ${goldenPath}: ${e.message}`, 1)
  }
  if (current !== body) {
    const a = current.split('\n'), b = body.split('\n')
    const i = a.findIndex((l, k) => l !== b[k])
    fail(`DIFF in ${goldenPath} at line ${i + 1}: file ${JSON.stringify((a[i] ?? '').slice(0, 120))} vs regenerated ${JSON.stringify((b[i] ?? '').slice(0, 120))}`, 1)
  }
  process.stdout.write(`gen-golden --check: OK ${records.length} vectors, golden identical (${goldenPath})\n`)
} else {
  writeFileSync(goldenPath, body, 'utf8')
  process.stdout.write(`gen-golden: wrote ${records.length} vectors -> ${goldenPath}\n`)
}
