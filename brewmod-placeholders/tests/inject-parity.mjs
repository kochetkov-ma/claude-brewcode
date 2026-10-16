#!/usr/bin/env node
// Parity gate for hooks/inject.mjs: all frozen golden vectors, layer fixtures, state file, fail-open, and a differential check vs the TS lib. rc 0 ok, 1 fail.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readGolden } from './golden-read.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOD = path.join(HERE, '..');
const INJECT = path.join(MOD, 'hooks', 'inject.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-parity-'));
const JOINER = '\n\n---\n\n';
const CUT_NOTE = '\n...[truncated]';
const { files: GOLDEN_FILES, vectors: VECTORS } = readGolden();
const vec = (id) => VECTORS.find((v) => v.id === id)?.expected ?? `MISSING ${id}`;
// Sole deliberate break from v6.7.0 (6.9.2): the 9000 cap never splits a surrogate pair; the frozen vector keeps the old lone high surrogate.
const SURROGATE_CUT = 'o29-cap-splits-surrogate';
const expectedOf = (v) => (v.id === SURROGATE_CUT ? v.expected.slice(0, 8999) + CUT_NOTE : v.expected);

let fails = 0;
let passes = 0;
const report = (name, err) => {
  if (err === undefined) passes++;
  else {
    fails++;
    console.error(`FAIL ${name}: ${err.message.split('\n').slice(0, 6).join(' | ')}`);
  }
};

// One hook run: `{ rc, stdout, stderr }`; env is minimal so nothing leaks in from the developer's profile.
function run({ input, env, root = MOD, raw }) {
  const stdin = raw ?? JSON.stringify(input);
  return new Promise((resolve) => {
    const child = execFile('node', [path.join(root, 'hooks', 'inject.mjs')], { env: { PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: root, ...env }, encoding: 'utf8' }, (err, stdout, stderr) => {
      resolve({ rc: err ? err.code : 0, stdout, stderr });
    });
    child.stdin.end(stdin);
  });
}

const ctx = (text) => JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text } });

// Writes a tree {relative path: text | null for a directory} under dir.
function put(dir, tree) {
  for (const [rel, text] of Object.entries(tree)) {
    const p = path.join(dir, rel);
    if (text === null) fs.mkdirSync(p, { recursive: true });
    else {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, text);
    }
  }
}

function sandbox() {
  const d = fs.mkdtempSync(path.join(TMP, 's-'));
  for (const sub of ['proj/sub', 'cfg', 'home']) fs.mkdirSync(path.join(d, sub), { recursive: true });
  return d;
}

const jobs = [];
const job = (name, fn) => jobs.push(fn().then(() => report(name), (e) => report(name, e)));

job('golden: group counts', async () => {
  const counts = {};
  for (const v of VECTORS) counts[v.group] = (counts[v.group] ?? 0) + 1;
  assert.deepEqual(counts, { spec: 8, edge: 16, extra: 29, override: 26, cap: 5, 'launch-dir': 3, 'custom-prefix': 11 }, 'vectors per group');
});

// ---- 1. Golden vectors (98): defaults from the real placeholders/, overrides from the vector

// A vector's override files as legacy files in the sandbox, as brewtools v6.7.0 read them.
const putGolden = (d, v) => {
  for (const f of v.files) put(d, { [f.layer === 'project' ? `proj/.claude/brewtools/manager/prompts/${f.legacy}.md` : `cfg/manager/prompts/${f.legacy}.md`]: f.raw });
};

async function runGolden(v) {
  const d = sandbox();
  putGolden(d, v);
  // The launch-dir vectors hook-cwd is a subdir holding a decoy override that must be ignored.
  put(d, { 'proj/sub/.claude/brewtools/manager/prompts/architect.md': '```\nDECOY\n```\n' });
  const input = { hook_event_name: 'UserPromptSubmit', cwd: path.join(d, 'proj', 'sub'), prompt: v.prompt, permission_mode: v.mode ?? undefined };
  const env = { CLAUDE_PROJECT_DIR: path.join(d, 'proj'), CLAUDE_CONFIG_DIR: path.join(d, 'cfg'), CLAUDE_PLUGIN_OPTION_PREFIX: v.prefix };
  return run({ input, env });
}

for (const v of VECTORS.filter((x) => x.expected === null)) {
  job(`golden ${v.id} (no injection)`, async () => {
    const r = await runGolden(v);
    assert.deepEqual([r.rc, r.stdout], [0, '{}'], `${v.id}: rc and stdout`);
  });
}

for (const v of VECTORS.filter((x) => x.expected !== null)) {
  job(`golden ${v.id}`, async () => {
    const r = await runGolden(v);
    assert.deepEqual([r.rc, r.stdout, v.expected.length], [0, ctx(expectedOf(v)), v.length], `${v.id}: rc, stdout, golden length`);
  });
}

job('golden: the surrogate deviation drops only the lone high surrogate before the cut note', async () => {
  const v = VECTORS.find((x) => x.id === SURROGATE_CUT);
  const got = expectedOf(v);
  assert.deepEqual(
    [v.expected.slice(0, 8999), v.expected.charCodeAt(8999).toString(16), v.expected.slice(9000), got, got.isWellFormed()],
    [got.slice(0, 8999), 'd83d', CUT_NOTE, v.expected.slice(0, 8999) + CUT_NOTE, true],
    'frozen head kept, frozen lone surrogate at 8999, frozen note, deviation text, well-formed',
  );
});

// ---- 2. Layer, mode and option fixtures: expected text, null = `{}`; last item builds env/cwd overrides from the sandbox

const A_HEAD = 'User typed `++a` — Architecture-first discipline is active for this turn:';
const P = '.claude/placeholders';
const fm = (kv, body) => `---\n${kv}\n---\n${body}`;
const CASES = [
  ['project native user-added def', { [`proj/${P}/foo.md`]: fm('description: "Foo"', 'FOO TEXT') }, '++foo now', 'default', 'FOO TEXT'],
  ['global native user-added def', { [`cfg/placeholders/foo.md`]: 'G FOO' }, 'x ++foo', 'default', 'G FOO'],
  ['project native over global native', { [`cfg/placeholders/foo.md`]: 'G', [`proj/${P}/foo.md`]: 'P' }, '++foo', 'default', 'P'],
  ['project file inherits the global header per field', { [`cfg/placeholders/foo.md`]: fm('header: "H {token}"', 'GB'), [`proj/${P}/foo.md`]: 'PB' }, '++foo', 'default', 'H ++foo\n\nPB'],
  ['empty project native file wins over the default', { [`proj/${P}/a.md`]: '' }, '++a', 'default', null],
  ['native project over project legacy', { [`proj/.claude/brewtools/manager/prompts/architect.md`]: 'LEG', [`proj/${P}/a.md`]: 'NAT' }, '++a', 'default', `${A_HEAD}\n\nNAT`],
  ['project legacy over global native', { [`cfg/placeholders/a.md`]: 'GN', [`proj/.claude/brewtools/manager/prompts/architect.md`]: 'PL' }, '++a', 'default', `${A_HEAD}\n\nPL`],
  ['global native over global legacy', { [`cfg/manager/prompts/architect.md`]: 'GL', [`cfg/placeholders/a.md`]: 'GN' }, '++a', 'default', `${A_HEAD}\n\nGN`],
  ['legacy file with an unknown name is not a def', { [`proj/.claude/brewtools/manager/prompts/other.md`]: 'X' }, '++other', 'default', null],
  ['x.plan stem is the plan variant (plan)', { [`proj/${P}/x.md`]: 'X ALL', [`proj/${P}/x.plan.md`]: 'X PLAN' }, '++x', 'plan', 'X PLAN'],
  ['x.plan stem is the plan variant (default)', { [`proj/${P}/x.md`]: 'X ALL', [`proj/${P}/x.plan.md`]: 'X PLAN' }, '++x', 'default', 'X ALL'],
  ['name defined inline and as context injects the context', { [`proj/${P}/dual.md`]: fm('name: "dual"\ninsert: inline', 'DUAL INLINE'), [`proj/${P}/dual.ctx.md`]: fm('name: "dual"\ninsert: context', 'DUAL CONTEXT') }, '++dual', 'default', 'DUAL CONTEXT'],
  ['context token left in text by an inline expansion', { [`proj/${P}/cc.md`]: fm('insert: context', 'CC CONTEXT') }, 'use JX also ++cc now', 'default', 'CC CONTEXT'],
  ['inline def injects nothing', { [`proj/${P}/foo.md`]: fm('insert: inline', 'INL') }, '++foo', 'default', null],
  ['not-plan def in plan mode', { [`proj/${P}/np.md`]: fm('when: not-plan', 'NP') }, '++np', 'plan', null],
  ['not-plan def in default mode', { [`proj/${P}/np.md`]: fm('when: not-plan', 'NP') }, '++np', 'default', 'NP'],
  ['mode auto is not plan', { [`proj/${P}/np.md`]: fm('when: not-plan', 'NP') }, '++np', 'auto', 'NP'],
  ['group keeps the highest priority', { [`proj/${P}/g1.md`]: fm('group: g\npriority: 1', 'G1'), [`proj/${P}/g2.md`]: fm('group: g\npriority: 5', 'G2') }, '++g1 ++g2', 'default', 'G2'],
  ['order sorts the blocks', { [`proj/${P}/o1.md`]: fm('order: 20', 'ONE'), [`proj/${P}/o2.md`]: fm('order: 10', 'TWO') }, '++o1 ++o2', 'default', `TWO${JOINER}ONE`],
  ['unclosed front matter is skipped, default stays', { [`proj/${P}/a.md`]: '---\nname: a\nBODY' }, '++a', 'default', vec('spec-3')],
  ['bad placeholder name is skipped', { [`proj/${P}/my-thing.md`]: 'X' }, '++my-thing', 'default', null],
  ['CRLF and BOM native file with front matter', { [`proj/${P}/bar.md`]: '\ufeff---\r\nheader: "H"\r\n---\r\nBODY\r\n' }, '++bar', 'default', 'H\n\nBODY'],
  ['a file where the project placeholders dir should be: defaults still inject', { [`proj/${P}`]: 'a file, not a dir' }, '++r', 'default', vec('spec-4')],
  ['dot file and directory named *.md are ignored', { [`proj/${P}/.hid.md`]: 'HID', [`proj/${P}/dir.md`]: null }, '++hid ++dir', 'default', null],
  ['uppercase stem and uppercase token', { [`proj/${P}/Foo.md`]: 'UP' }, '++FOO', 'default', 'UP'],
  ['front matter name differs from the stem', { [`proj/${P}/zzz.md`]: fm('name: "qq"', 'QQ') }, '++qq ++zzz', 'default', 'QQ'],
  ['symbol name', { [`proj/${P}/!!.md`]: 'BANG' }, 'say ++!! now', 'default', 'BANG'],
  ['word before the prefix is no token', { [`proj/${P}/foo.md`]: 'F' }, 'x++foo', 'default', null],
  ['synthetic delivery', {}, '<task-notification>++m', 'default', null],
  ['no prefix at all', {}, 'hello', 'default', null],
  ['invalid prefix option falls back to ++', {}, '++r', 'default', vec('spec-4'), () => ({ env: { CLAUDE_PLUGIN_OPTION_PREFIX: 'ab' } })],
  ['custom prefix ignores ++ tokens', {}, '++r', 'default', null, () => ({ env: { CLAUDE_PLUGIN_OPTION_PREFIX: '@@' } })],
  ['custom prefix header token', { [`proj/${P}/h.md`]: fm('header: "T {token}:"', 'HB') }, '@@H', 'default', 'T @@h:\n\nHB', () => ({ env: { CLAUDE_PLUGIN_OPTION_PREFIX: '@@' } })],
  ['launch dir comes from cwd without CLAUDE_PROJECT_DIR', { [`proj/${P}/foo.md`]: 'CWD' }, '++foo', 'default', 'CWD', () => ({ env: { CLAUDE_PROJECT_DIR: '' }, cwd: 'proj' })],
  ['config dir falls back to HOME/.claude', { [`home/.claude/placeholders/foo.md`]: 'HOMEFOO' }, '++foo', 'default', 'HOMEFOO', (d) => ({ env: { CLAUDE_CONFIG_DIR: '', HOME: path.join(d, 'home') } })],
];

async function runLayer([, tree, prompt, mode, , over = () => ({})]) {
  const d = sandbox();
  put(d, tree);
  const o = over(d);
  const env = { CLAUDE_PROJECT_DIR: path.join(d, 'proj'), CLAUDE_CONFIG_DIR: path.join(d, 'cfg'), ...o.env };
  const cwd = path.join(d, o.cwd ?? 'proj/sub');
  return run({ input: { hook_event_name: 'UserPromptSubmit', cwd, prompt, permission_mode: mode }, env });
}

for (const c of CASES.filter((x) => x[4] === null)) {
  job(`layer: ${c[0]} (no injection)`, async () => {
    const r = await runLayer(c);
    assert.deepEqual([r.rc, r.stdout], [0, '{}'], 'rc and stdout');
  });
}

for (const c of CASES.filter((x) => x[4] !== null)) {
  job(`layer: ${c[0]}`, async () => {
    const r = await runLayer(c);
    assert.deepEqual([r.rc, r.stdout], [0, ctx(c[4])], 'rc and stdout');
  });
}

job('layer: an unreadable global placeholders dir -> defaults still inject', async () => {
  assert.notEqual(process.getuid(), 0, 'precondition: chmod 000 is enforced for a non-root user');
  const d = sandbox();
  put(d, { 'cfg/placeholders/foo.md': 'G' });
  fs.chmodSync(path.join(d, 'cfg', 'placeholders'), 0o000);
  const r = await run({ input: { hook_event_name: 'UserPromptSubmit', cwd: path.join(d, 'proj'), prompt: '++r', permission_mode: 'default' }, env: { CLAUDE_PROJECT_DIR: path.join(d, 'proj'), CLAUDE_CONFIG_DIR: path.join(d, 'cfg') } });
  fs.chmodSync(path.join(d, 'cfg', 'placeholders'), 0o755);
  assert.deepEqual([r.rc, r.stdout], [0, ctx(vec('spec-4'))], 'rc and stdout');
});

// ---- 3. Fail open

job('fail open: garbage and empty stdin', async () => {
  const out = [await run({ raw: 'not json', env: {} }), await run({ raw: '', env: {} })].map((r) => [r.rc, r.stdout]);
  assert.deepEqual(out, [[0, '{}'], [0, '{}']], 'rc and stdout');
});

job('fail open: unreadable default layer', async () => {
  assert.notEqual(process.getuid(), 0, 'precondition: chmod 000 is enforced for a non-root user');
  const root = fs.mkdtempSync(path.join(TMP, 'noroot-'));
  fs.mkdirSync(path.join(root, 'hooks'));
  fs.copyFileSync(INJECT, path.join(root, 'hooks', 'inject.mjs'));
  fs.mkdirSync(path.join(root, 'placeholders', 'dir.md'), { recursive: true });
  fs.writeFileSync(path.join(root, 'placeholders', 'm.md'), 'M');
  fs.chmodSync(path.join(root, 'placeholders', 'm.md'), 0o000);
  const r = await run({ root, input: { hook_event_name: 'UserPromptSubmit', prompt: '++m', permission_mode: 'default' }, env: {} });
  fs.chmodSync(path.join(root, 'placeholders', 'm.md'), 0o644);
  assert.deepEqual([r.rc, r.stdout], [0, '{}'], 'rc and stdout');
});

// ---- 4. State file

const stateRoot = () => {
  const root = fs.mkdtempSync(path.join(TMP, 'state-'));
  fs.mkdirSync(path.join(root, 'hooks'));
  fs.copyFileSync(INJECT, path.join(root, 'hooks', 'inject.mjs'));
  return root;
};
const SID = '0f3a2b1c-aaaa-bbbb-cccc-1234567890ab';
const readState = (root, sid) => JSON.parse(fs.readFileSync(path.join(root, '.state', `mode-${sid}.json`), 'utf8'));

for (const event of ['UserPromptSubmit', 'PostToolBatch']) {
  job(`state: ${event} records the mode`, async () => {
    const root = stateRoot();
    const r = await run({ root, input: { hook_event_name: event, session_id: SID, permission_mode: 'plan', ...(event === 'UserPromptSubmit' ? { prompt: 'plain' } : { tool_calls: [] }) }, env: {} });
    const s = readState(root, SID);
    assert.deepEqual([r.rc, r.stdout, Object.keys(s), s.mode, Number.isInteger(s.ts)], [0, '{}', ['mode', 'ts'], 'plan', true], 'rc, stdout, state shape (ts is an integer)');
    assert.deepEqual(fs.readdirSync(path.join(root, '.state')), [`mode-${SID}.json`], 'no temp file left');
  });
}

job('state: subagent payload, bad session id and non-string mode write nothing', async () => {
  const root = stateRoot();
  for (const extra of [{ agent_id: 'a1', session_id: SID, permission_mode: 'plan' }, { session_id: '../x', permission_mode: 'plan' }, { session_id: SID, permission_mode: 5 }, { permission_mode: 'plan' }]) {
    await run({ root, input: { hook_event_name: 'PostToolBatch', ...extra }, env: {} });
  }
  assert.equal(fs.existsSync(path.join(root, '.state')), false, 'no .state dir');
});

job('state: a later mode replaces the earlier one', async () => {
  const root = stateRoot();
  await run({ root, input: { hook_event_name: 'PostToolBatch', session_id: SID, permission_mode: 'plan' }, env: {} });
  await run({ root, input: { hook_event_name: 'PostToolBatch', session_id: SID, permission_mode: 'default' }, env: {} });
  assert.equal(readState(root, SID).mode, 'default', 'last mode');
});

job('state: a prompt prunes week-old mode files only', async () => {
  const root = stateRoot();
  const dir = path.join(root, '.state');
  fs.mkdirSync(dir);
  const old = new Date(Date.now() - 8 * 24 * 3600 * 1000);
  for (const [name, date] of [['mode-old.json', old], ['mode-fresh.json', new Date()], ['notes.txt', old]]) {
    fs.writeFileSync(path.join(dir, name), '{}');
    fs.utimesSync(path.join(dir, name), date, date);
  }
  await run({ root, input: { hook_event_name: 'PostToolBatch', session_id: SID, permission_mode: 'plan' }, env: {} });
  const afterBatch = fs.readdirSync(dir).sort();
  await run({ root, input: { hook_event_name: 'UserPromptSubmit', session_id: SID, permission_mode: 'plan', prompt: 'x' }, env: {} });
  assert.deepEqual([afterBatch, fs.readdirSync(dir).sort()], [[`mode-${SID}.json`, 'mode-fresh.json', 'mode-old.json', 'notes.txt'], [`mode-${SID}.json`, 'mode-fresh.json', 'notes.txt']], 'files after batch and after prompt');
});

const OLD = new Date(Date.now() - 8 * 24 * 3600 * 1000);
const prompt = (root) => run({ root, input: { hook_event_name: 'UserPromptSubmit', session_id: SID, permission_mode: 'plan', prompt: 'x' }, env: {} });

job('state: an orphan old temp file is pruned, a fresh one kept', async () => {
  const root = stateRoot();
  const dir = path.join(root, '.state');
  fs.mkdirSync(dir);
  for (const [name, date] of [['mode-gone.json.4242.tmp', OLD], ['mode-live.json.4343.tmp', new Date()], ['mode-x.json.tmp', OLD]]) {
    fs.writeFileSync(path.join(dir, name), '{}');
    fs.utimesSync(path.join(dir, name), date, date);
  }
  await prompt(root);
  assert.deepEqual(fs.readdirSync(dir).sort(), [`mode-${SID}.json`, 'mode-live.json.4343.tmp', 'mode-x.json.tmp'], 'old numbered tmp gone; fresh tmp and non-matching name kept');
});

job('state: a directory named mode-dir.json does not stop pruning of old files', async () => {
  const root = stateRoot();
  const dir = path.join(root, '.state');
  fs.mkdirSync(path.join(dir, 'mode-dir.json'), { recursive: true });
  fs.utimesSync(path.join(dir, 'mode-dir.json'), OLD, OLD);
  for (const name of ['mode-zold.json', 'mode-aold.json']) {
    fs.writeFileSync(path.join(dir, name), '{}');
    fs.utimesSync(path.join(dir, name), OLD, OLD);
  }
  await prompt(root);
  assert.deepEqual(fs.readdirSync(dir).sort(), [`mode-${SID}.json`, 'mode-dir.json'], 'both old files pruned, the directory untouched');
});

job('state: an old symlink is not followed out of .state', async () => {
  const root = stateRoot();
  const dir = path.join(root, '.state');
  const outside = path.join(root, 'outside.json');
  fs.mkdirSync(dir);
  fs.writeFileSync(outside, 'keep');
  fs.utimesSync(outside, OLD, OLD);
  fs.symlinkSync(outside, path.join(dir, 'mode-link.json'));
  await prompt(root);
  assert.deepEqual([fs.readFileSync(outside, 'utf8'), fs.readdirSync(dir).sort()], ['keep', [`mode-${SID}.json`, 'mode-link.json']], 'target intact, link left alone');
});

job('state: a failing state write does not stop the injection', async () => {
  const root = fs.mkdtempSync(path.join(TMP, 'statefail-'));
  fs.mkdirSync(path.join(root, 'hooks'));
  fs.copyFileSync(INJECT, path.join(root, 'hooks', 'inject.mjs'));
  fs.mkdirSync(path.join(root, 'placeholders'));
  fs.writeFileSync(path.join(root, 'placeholders', 'm.md'), 'M');
  fs.writeFileSync(path.join(root, '.state'), 'a file where the dir should be');
  const d = sandbox();
  const r = await run({ root, input: { hook_event_name: 'UserPromptSubmit', session_id: SID, prompt: '++m', permission_mode: 'plan' }, env: { CLAUDE_PROJECT_DIR: path.join(d, 'proj'), CLAUDE_CONFIG_DIR: path.join(d, 'cfg') } });
  assert.deepEqual([r.rc, r.stdout], [0, ctx('M')], 'rc and stdout');
});

job('state: the prompt injection writes the state too', async () => {
  const d = sandbox();
  const root = stateRoot();
  fs.cpSync(path.join(MOD, 'placeholders'), path.join(root, 'placeholders'), { recursive: true });
  const sid = `parity-${process.pid}`;
  const r = await run({ root, input: { hook_event_name: 'UserPromptSubmit', session_id: sid, prompt: '++r', permission_mode: 'plan' }, env: { CLAUDE_PROJECT_DIR: path.join(d, 'proj'), CLAUDE_CONFIG_DIR: path.join(d, 'cfg') } });
  const mode = readState(root, sid).mode;
  assert.deepEqual([r.stdout, mode], [ctx(vec('spec-4')), 'plan'], 'injected and recorded');
});

// ---- 5. Differential: the TS lib (band, command, typeahead) and inject.mjs must resolve the same definitions

register(`data:text/javascript,${encodeURIComponent("export async function resolve(s, c, n) { if (/^\\.\\.?\\/[^.]*$/.test(s)) { try { return await n(s + '.ts', c); } catch {} } return n(s, c); }")}`);
const inject = await import(pathToFileURL(INJECT).href);
const ts = await import(pathToFileURL(path.join(MOD, 'hooks', 'lib', 'defs.ts')).href);
const tsMatch = await import(pathToFileURL(path.join(MOD, 'hooks', 'lib', 'match.ts')).href);
const diskIo = {
  exists: async (p) => fs.existsSync(p),
  list: async (p) => fs.readdirSync(p, { withFileTypes: true }).map((e) => ({ name: e.name, kind: e.isDirectory() ? 'dir' : 'file', size: 0, mtimeMs: 0, isLink: false })),
  read: async (p) => fs.readFileSync(p, 'utf8'),
};

const strip = (defs) => JSON.parse(JSON.stringify(defs.map(({ description: _d, ...d }) => d)));
const RAWS = [
  '', '   \n', '```\nfenced\n```', '~~~\ntilde\n~~~\n', 'plain text\n', '\ufeff```\nbom\n```', '```\r\ncrlf\r\n```\r\n', 'a\n```x\nin\n```\nmid\n~~~\nin2\n~~~\nz',
  '---\n---\nempty fm', '---\nname: "q"\n---\nQ', '---\nname: q\nBODY no close', '---', '---\n', '\n\n---\nname: n\n---\nN', '\ufeff---\r\nname: bom\r\n---\r\nB',
  '---\nname: \'single\'\ndescription: "d" # c\norder: 7\npriority: -2\n---\nS', '---\nname: x\norder: seven\nwhen: sometimes\ninsert: nope\nwat: 1\n---\nBAD',
  '---\n# comment\n\nname: c\nheader: "H \\"{token}\\""\ngroup: g\nlegacy: l\nwhen: not-plan\ninsert: inline\n---\nC', '---\nname: "bad name"\n---\nN', '---\nname: "++"\n---\nSYM', '---\nname: ""\n---\nE',
  '---\nplan: add\n---\nADD', '---\nname: "m"\nwhen: plan\nplan: replace\n---\nR', '---\nwhen: plan\nplan: nope\n---\nN',
];
const stems = ['m', 'm.plan', 'x', 'Mixed', '.plan', 'a.plan', '!!', 'bad name'];
for (let i = 0; i < RAWS.length; i++) {
  job(`differential: raw #${i} as default, native override and legacy`, async () => {
    const mk = (kind, files) => ({ id: 'l', kind, files: new Map(files) });
    for (const stem of stems) {
      const base = mk('native', [['m', '---\nname: "m"\nlegacy: full\norder: 5\nheader: "HD"\n---\nBASE'], ['m.plan', '---\nname: "m"\nwhen: plan\nplan: add\n---\nBASEPLAN']]);
      const layers = [base, mk('legacy', [['full', RAWS[i]]]), mk('native', [[stem, RAWS[i]]]), mk('native', [['Other', RAWS[(i + 1) % RAWS.length]]])];
      const want = strip(ts.resolveDefs(layers.map((l) => ({ ...l }))).defs);
      const got = strip(inject.resolveDefs(layers));
      assert.deepEqual(got, want, `raw #${i} stem ${JSON.stringify(stem)}`);
    }
    assert.deepEqual(inject.extractFenced(RAWS[i]), ts.extractFenced(RAWS[i]), `extractFenced raw #${i}`);
  });
}

job('differential: prefix validation and name kinds', async () => {
  const prefixes = [undefined, '', '++', '@@', 'ab', '_+', '+', '+++++++++', '/+', '$$', '\\\\', '[[', '^^', 'é+'];
  assert.deepEqual(prefixes.map((p) => inject.validPrefix(p)), prefixes.map((p) => tsMatch.validatePrefix(p).prefix), 'validPrefix');
  const names = ['m', 'M', 'a_1', '+', '++', '!!', '@#', 'x'.repeat(32), 'x'.repeat(33), '', 'a b', 'é', 'a.b', '_'];
  assert.deepEqual(names.map((n) => inject.nameKind(n)), names.map((n) => tsMatch.nameKind(n)), 'nameKind');
  assert.deepEqual(['/cfg/', '/a/../b//c/.', 'rel/', '/', ''].map((p) => inject.normalizeDir(p)), ['/cfg/', '/a/../b//c/.', 'rel/', '/', ''].map((p) => ts.normalizeDir(p)), 'normalizeDir');
  const cases = [[undefined, undefined], ['', '/h'], ['/c//d/', '/h'], [undefined, '/h/'], [undefined, '']];
  assert.deepEqual(cases.map(([c, h]) => inject.configDirOf(c, h)), cases.map(([c, h]) => ts.configDirOf(c, h)), 'configDirOf');
  const dir = sandbox();
  put(dir, { 'proj/.claude/placeholders/foo.md': 'F', 'cfg/placeholders/bar.md': fm('order: 3', 'B'), 'cfg/manager/prompts/full.md': 'FULLO' });
  const roots = { pluginRoot: MOD, root: path.join(dir, 'proj'), configDir: path.join(dir, 'cfg') };
  const reg = await ts.loadRegistry(diskIo, roots, ts.newRegistryCache());
  assert.deepEqual(strip(inject.loadDefs(roots)), strip([...reg.defs]), 'loadDefs vs loadRegistry on disk');
});

// ---- 6. hooks/lib/sent.ts (band, show) against every golden vector: same defs as the hook would load, same prompt, prefix and mode

const sent = await import(pathToFileURL(path.join(MOD, 'hooks', 'lib', 'sent.ts')).href);
for (const v of VECTORS) {
  job(`sent.ts golden ${v.id}`, async () => {
    const d = sandbox();
    putGolden(d, v);
    const reg = await ts.loadRegistry(diskIo, { pluginRoot: MOD, root: path.join(d, 'proj'), configDir: path.join(d, 'cfg') }, ts.newRegistryCache());
    const prefix = tsMatch.validatePrefix(v.prefix).prefix;
    const draft = sent.assembleDraft(v.prompt, reg.defs, prefix, v.mode === 'plan');
    const want = v.expected === null ? '' : expectedOf(v);
    assert.deepEqual([sent.injectedContext(reg.defs, prefix, v.prompt, v.mode), draft.context], [want, want], `${v.id}: injectedContext and assembleDraft context`);
  });
}

// ---- 7. Escape (`P/`, `P\`): TS and mjs `isEscaped` agree; the hook injects nothing, still records the mode; `assemble` alone would inject
// [prefix, text, mode, escaped, hook context vector id | null, unguarded `assemble` vector id | null]
const ESCAPES = [
  ['++', '++/ ++m go', 'default', true, null, 'spec-1'],
  ['++', 'go ++m ++\\', 'default', true, null, 'spec-1'],
  ['++', 'fix `++/` later ++r', 'default', true, null, 'spec-4'],
  ['++', '++/', 'default', true, null, null],
  ['++', '++/ ++m go', 'plan', true, null, 'spec-2'],
  ['++', 'c++/java ++m', 'default', false, 'spec-1', 'spec-1'],
  ['++', '+++/ go', 'plan', false, 'spec-6', 'spec-6'],
  ['++', '++ / ++m', 'default', false, 'spec-1', 'spec-1'],
  ['++', 'please check ++r?', 'default', false, 'spec-4', 'spec-4'],
  ['++', 'С++/CLI ++m', 'default', false, 'spec-1', 'spec-1'],
  ['@@', '@@/ @@m', 'default', true, null, 'p01-m'],
  ['@@', '++/ @@m', 'default', false, 'p01-m', 'p01-m'],
];
for (const [prefix, text, mode, escaped, hookId, bareId] of ESCAPES) {
  job(`escape ${prefix} ${JSON.stringify(text)} ${mode}`, async () => {
    const d = sandbox();
    const root = stateRoot();
    fs.cpSync(path.join(MOD, 'placeholders'), path.join(root, 'placeholders'), { recursive: true });
    const env = { CLAUDE_PROJECT_DIR: path.join(d, 'proj'), CLAUDE_CONFIG_DIR: path.join(d, 'cfg'), CLAUDE_PLUGIN_OPTION_PREFIX: prefix };
    const r = await run({ root, input: { hook_event_name: 'UserPromptSubmit', session_id: SID, prompt: text, permission_mode: mode }, env });
    const bare = inject.assemble(inject.loadDefs({ pluginRoot: root, root: env.CLAUDE_PROJECT_DIR, configDir: env.CLAUDE_CONFIG_DIR }), prefix, text, mode);
    assert.deepEqual(
      [tsMatch.isEscaped(prefix, text), inject.isEscaped(prefix, text), r.rc, r.stdout, readState(root, SID).mode, bare],
      [escaped, escaped, 0, hookId === null ? '{}' : ctx(vec(hookId)), mode, bareId === null ? '' : vec(bareId)],
      'TS isEscaped, mjs isEscaped, rc, stdout, recorded mode, unguarded assemble',
    );
  });
}

job('escape: TS and mjs isEscaped agree on every prefix and text', async () => {
  const prefixes = ['++', '@@', '--', '$$', '[[', ']]', '^^', '\\\\', '/+', '+/', '..', '**'];
  const texts = ['', 'x', 'P/', 'P\\', ' P/', 'aP/', '_P\\', '1P/', 'éP/', 'áP/', '(P/)', 'P//', 'P /', '`P\\`', 'line\nP/', 'PP/', 'P+/', 'c++/java', '+++/', 'С++/'];
  const got = [];
  const want = [];
  for (const p of prefixes) {
    for (const raw of texts) {
      const t = raw.split('P').join(p);
      got.push([p, t, inject.isEscaped(p, t)]);
      want.push([p, t, tsMatch.isEscaped(p, t)]);
    }
  }
  assert.deepEqual(got, want, 'isEscaped per prefix and text');
  assert.deepEqual([inject.escapeMarkers('++'), tsMatch.escapeMarkers('@@')], [['++/', '++\\'], ['@@/', '@@\\']], 'markers');
});

// ---- 8. Plan-mode parts (`plan: add`): hook and TS lib send the same text; planParts kind; texts built from the frozen spec-1/spec-2
const M_HEAD = 'User typed `++m` — Manager mode is active for this turn:';
const MP_HEAD = 'User typed `++m` — Manager + Plan Mode is active for this turn:';
const M_BODY = vec('spec-1').slice(M_HEAD.length + 2);
const ADDITION = vec('spec-2').slice(MP_HEAD.length + 2 + M_BODY.length + 2);
const LEG = '.claude/brewtools/manager/prompts';

job('plan parts: frozen spec-2 = plan header + spec-1 body + blank line + the addition', async () => {
  assert.deepEqual([vec('spec-2'), ADDITION.slice(0, 20)], [`${MP_HEAD}\n\n${M_BODY}\n\n${ADDITION}`, '[ADDON: PLAN MODE]\n\n'], 'spec-2 split');
});

// [name, tree, prompt, plan-mode text, default-mode text, planParts(name).kind] (null = nothing injected)
const PLAN_CASES = [
  ['shipped m: plan mode is the frozen v6.7.0 text', {}, '++m', vec('spec-2'), vec('spec-1'), 'add'],
  ['project m.md override flows into plan mode with the shipped addition', { [`proj/${P}/m.md`]: 'MY M' }, '++m', `${MP_HEAD}\n\nMY M\n\n${ADDITION}`, `${M_HEAD}\n\nMY M`, 'add'],
  ['global m.md with its own header: plan mode keeps the plan header', { 'cfg/placeholders/m.md': fm('header: "G {token}"', 'GM') }, '++m', `${MP_HEAD}\n\nGM\n\n${ADDITION}`, 'G ++m\n\nGM', 'add'],
  ['legacy planmode.md replaces the whole plan-mode text', { [`proj/${LEG}/planmode.md`]: '```\nPM OLD\n```\n' }, '++m', `${MP_HEAD}\n\nPM OLD`, vec('spec-1'), 'replace'],
  ['legacy planmode.md replaces even over a native m.md override', { [`proj/${P}/m.md`]: 'MY M', 'cfg/manager/prompts/planmode.md': 'PM' }, '++m', `${MP_HEAD}\n\nPM`, `${M_HEAD}\n\nMY M`, 'replace'],
  ['legacy full.md flows into plan mode with the shipped addition', { 'cfg/manager/prompts/full.md': 'FULL OLD' }, '++m', `${MP_HEAD}\n\nFULL OLD\n\n${ADDITION}`, `${M_HEAD}\n\nFULL OLD`, 'add'],
  ['old full-text m.plan.md without front matter replaces', { [`proj/${P}/m.plan.md`]: 'OLD FULL PLAN' }, '++m', `${MP_HEAD}\n\nOLD FULL PLAN`, vec('spec-1'), 'replace'],
  ['old m.plan.md with front matter and no plan key replaces', { 'cfg/placeholders/m.plan.md': fm('name: "m"\nwhen: plan\nheader: "OLD {token}"', 'OLDP') }, '++m', 'OLD ++m\n\nOLDP', vec('spec-1'), 'replace'],
  ['user m.plan.md with plan: add changes only the addition', { [`proj/${P}/m.plan.md`]: fm('plan: add', 'MY ADD') }, '++m', `${MP_HEAD}\n\n${M_BODY}\n\nMY ADD`, vec('spec-1'), 'add'],
  ['explicit plan: replace replaces', { [`proj/${P}/m.plan.md`]: fm('plan: replace', 'R') }, '++m', `${MP_HEAD}\n\nR`, vec('spec-1'), 'replace'],
  ['empty m.md silences ++m in plan mode too', { [`proj/${P}/m.md`]: '' }, '++m', null, null, 'none'],
  ['empty legacy full.md silences ++m in plan mode too', { 'cfg/manager/prompts/full.md': '' }, '++m', null, null, 'none'],
  ['an add part over an empty normal body with headers sends nothing', { [`proj/${P}/db.md`]: fm('header: "N {token}"', ''), [`proj/${P}/db.plan.md`]: fm('plan: add\nheader: "P {token}"', 'ADD') }, '++db', null, null, 'none'],
  ['user db.md + db.plan.md plan: add, no headers', { [`proj/${P}/db.md`]: 'DB', [`proj/${P}/db.plan.md`]: fm('plan: add', 'DB ADD') }, '++db', 'DB\n\nDB ADD', 'DB', 'add'],
  ['plan part without a header takes the normal header', { [`proj/${P}/db.md`]: fm('header: "N {token}"', 'DB'), [`proj/${P}/db.plan.md`]: fm('plan: add', 'ADD') }, 'x ++db', 'N ++db\n\nDB\n\nADD', 'N ++db\n\nDB', 'add'],
  ['global normal + project plan part join across layers', { 'cfg/placeholders/db.md': 'GDB', [`proj/${P}/db.plan.md`]: fm('plan: add', 'PADD') }, '++db', 'GDB\n\nPADD', 'GDB', 'add'],
  ['plan: add without a normal def is plan only', { [`proj/${P}/db.plan.md`]: fm('plan: add', 'ONLY') }, '++db', 'ONLY', null, 'only'],
  ['plan: add over a not-plan normal def is not joined', { [`proj/${P}/db.md`]: fm('when: not-plan', 'NP'), [`proj/${P}/db.plan.md`]: fm('plan: add', 'ADD') }, '++db', 'ADD', 'NP', 'replace'],
  ['plan: add on an always def is a normal def', { [`proj/${P}/db.md`]: fm('plan: add', 'DB') }, '++db', 'DB', 'DB', 'none'],
  ['++r ++rr: group priority unchanged in plan mode', {}, '++r ++rr', vec('spec-5'), vec('spec-5'), 'none'],
  ['an add part keeps the normal order among other tokens', { [`proj/${P}/m.md`]: 'MY M' }, '+++ ++a ++m', `${vec('spec-6')}${JOINER}${MP_HEAD}\n\nMY M\n\n${ADDITION}${JOINER}${vec('spec-3')}`, `${M_HEAD}\n\nMY M${JOINER}${vec('spec-3')}`, 'add'],
  [
    'an add part keeps the normal order, group and priority; an empty addition adds nothing',
    { [`proj/${P}/db.md`]: fm('order: 5\ngroup: g\npriority: 2', 'DB'), [`proj/${P}/db.plan.md`]: fm('plan: add\norder: 99', 'ADD'), [`proj/${P}/y.md`]: fm('order: 1\ngroup: g\npriority: 1', 'Y'), [`proj/${P}/w.md`]: fm('order: 7', 'W'), [`proj/${P}/w.plan.md`]: fm('plan: add', '') },
    '++w ++y ++db',
    `DB\n\nADD${JOINER}W`,
    `DB${JOINER}W`,
    'add',
  ],
  ['an empty addition sends the normal text alone in plan mode', { [`proj/${P}/w.md`]: 'W', [`proj/${P}/w.plan.md`]: fm('plan: add', '') }, '++w', 'W', 'W', 'add'],
];
for (const [name, tree, text, planText, defaultText, kind] of PLAN_CASES) {
  job(`plan parts: ${name}`, async () => {
    const d = sandbox();
    put(d, tree);
    const env = { CLAUDE_PROJECT_DIR: path.join(d, 'proj'), CLAUDE_CONFIG_DIR: path.join(d, 'cfg') };
    const reg = await ts.loadRegistry(diskIo, { pluginRoot: MOD, root: env.CLAUDE_PROJECT_DIR, configDir: env.CLAUDE_CONFIG_DIR }, ts.newRegistryCache());
    const got = [];
    for (const mode of ['plan', 'default']) {
      const r = await run({ input: { hook_event_name: 'UserPromptSubmit', cwd: path.join(d, 'proj'), prompt: text, permission_mode: mode }, env });
      got.push([r.rc, r.stdout, sent.injectedContext(reg.defs, '++', text, mode), sent.assembleDraft(text, reg.defs, '++', mode === 'plan').context]);
    }
    const last = /\+\+(\w+)\s*$/.exec(text)?.[1] ?? '';
    const want = [planText, defaultText].map((t) => [0, t === null ? '{}' : ctx(t), t ?? '', t ?? '']);
    assert.deepEqual([...got, sent.planParts(reg.defs, last, '++').kind], [...want, kind], 'hook rc+stdout, TS injectedContext, TS draft context (plan, default), planParts kind');
  });
}

// ---- 9. Cap: the 9000 cut never splits a surrogate pair; hook, TS context and the `++big` token text agree
const GREEN = '\u{1F7E2}';
const X2 = 'x'.repeat(9000 - 10 - JOINER.length - 1);
// [name, tree, prompt, context, `++big` token text]
const CAP_CASES = [
  ['a pair straddling the cut is dropped whole', { [`proj/${P}/big.md`]: `${'x'.repeat(8999)}${GREEN} tail` }, '++big', `${'x'.repeat(8999)}${CUT_NOTE}`, `${'x'.repeat(8999)}${CUT_NOTE}`],
  ['a pair ending at the cut is kept', { [`proj/${P}/big.md`]: `${'x'.repeat(8998)}${GREEN} tail` }, '++big', `${'x'.repeat(8998)}${GREEN}${CUT_NOTE}`, `${'x'.repeat(8998)}${GREEN}${CUT_NOTE}`],
  ['a pair straddling the cut in the second block', { [`proj/${P}/a1.md`]: fm('order: 1', 'A'.repeat(10)), [`proj/${P}/big.md`]: fm('order: 2', `${X2}${GREEN} tail`) }, '++big ++a1', `${'A'.repeat(10)}${JOINER}${X2}${CUT_NOTE}`, `${X2}${CUT_NOTE}`],
];
for (const [name, tree, text, context, bigText] of CAP_CASES) {
  job(`cap: ${name}`, async () => {
    const d = sandbox();
    put(d, tree);
    const env = { CLAUDE_PROJECT_DIR: path.join(d, 'proj'), CLAUDE_CONFIG_DIR: path.join(d, 'cfg') };
    const reg = await ts.loadRegistry(diskIo, { pluginRoot: MOD, root: env.CLAUDE_PROJECT_DIR, configDir: env.CLAUDE_CONFIG_DIR }, ts.newRegistryCache());
    const r = await run({ input: { hook_event_name: 'UserPromptSubmit', cwd: path.join(d, 'proj'), prompt: text, permission_mode: 'default' }, env });
    const draft = sent.assembleDraft(text, reg.defs, '++', false);
    assert.deepEqual(
      [r.rc, r.stdout, sent.injectedContext(reg.defs, '++', text, 'default'), draft.context, draft.tokens.find((t) => t.name === 'big'), context.isWellFormed()],
      [0, ctx(context), context, context, { token: '++big', name: 'big', kind: 'context', text: bigText, isSent: true, reason: 'cut at 9000 chars' }, true],
      'hook rc+stdout, TS injectedContext, TS draft context, ++big token, well-formed',
    );
  });
}

// ---- 10. An inline body that brings an escape marker: the hook gets the expanded prompt and injects nothing; the draft says so
job('escape brought in by an inline body: draft, hook on the expanded prompt and TS context agree', async () => {
  const d = sandbox();
  put(d, { [`proj/${P}/skip.md`]: fm('insert: inline', 'please ++/ ignore') });
  const env = { CLAUDE_PROJECT_DIR: path.join(d, 'proj'), CLAUDE_CONFIG_DIR: path.join(d, 'cfg') };
  const reg = await ts.loadRegistry(diskIo, { pluginRoot: MOD, root: env.CLAUDE_PROJECT_DIR, configDir: env.CLAUDE_CONFIG_DIR }, ts.newRegistryCache());
  const draft = sent.assembleDraft('++skip ++r', reg.defs, '++', false);
  const r = await run({ input: { hook_event_name: 'UserPromptSubmit', cwd: path.join(d, 'proj'), prompt: draft.prompt, permission_mode: 'default' }, env });
  assert.deepEqual(
    [draft, r.rc, r.stdout, sent.injectedContext(reg.defs, '++', draft.prompt, 'default')],
    [
      {
        prompt: 'please ++/ ignore ++r',
        context: '',
        tokens: [
          { token: '++skip', name: 'skip', kind: 'inline', text: 'please ++/ ignore', isSent: true, reason: null },
          { token: '++r', name: 'r', kind: 'context', text: '', isSent: false, reason: 'not sent: ++/ in this message' },
        ],
      },
      0,
      '{}',
      '',
    ],
    'draft, hook rc+stdout on the expanded prompt, TS injectedContext',
  );
});

await Promise.all(jobs);
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`inject-parity: ${passes} passed, ${fails} failed (${VECTORS.length} golden vectors, hook and sent.ts; ${ESCAPES.length} escape, ${PLAN_CASES.length} plan-part, ${CAP_CASES.length} cap, ${CASES.length} layer fixtures; files ${Object.keys(GOLDEN_FILES).join(',')})`);
process.exit(fails === 0 ? 0 : 1);
