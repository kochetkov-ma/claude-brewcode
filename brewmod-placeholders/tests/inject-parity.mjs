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
const { files: GOLDEN_FILES, vectors: VECTORS } = readGolden();
const vec = (id) => VECTORS.find((v) => v.id === id)?.expected ?? `MISSING ${id}`;

let fails = 0;
let passes = 0;
const report = (name, fn) => (err) => {
  if (err === undefined) passes++;
  else {
    fails++;
    console.error(`FAIL ${name}: ${err.message.split('\n').slice(0, 6).join(' | ')}`);
  }
  return fn;
};

// One hook run: `{ out, rc, raw }`; env is minimal so nothing leaks in from the developer's profile.
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
const job = (name, fn) => jobs.push(fn().then(() => report(name)(undefined), (e) => report(name)(e)));

job('golden: group counts', async () => {
  const counts = {};
  for (const v of VECTORS) counts[v.group] = (counts[v.group] ?? 0) + 1;
  assert.deepEqual(counts, { spec: 8, edge: 16, extra: 29, override: 26, cap: 5, 'launch-dir': 3, 'custom-prefix': 11 }, 'vectors per group');
});

// ---- 1. Golden vectors (98): defaults from the real placeholders/, overrides from the vector

for (const v of VECTORS) {
  job(`golden ${v.id}`, async () => {
    const d = sandbox();
    for (const f of v.files) {
      const rel = f.layer === 'project' ? `proj/.claude/brewtools/manager/prompts/${f.legacy}.md` : `cfg/manager/prompts/${f.legacy}.md`;
      put(d, { [rel]: f.raw });
    }
    // The launch-dir vectors hook-cwd is a subdir holding a decoy override that must be ignored.
    put(d, { 'proj/sub/.claude/brewtools/manager/prompts/architect.md': '```\nDECOY\n```\n' });
    const input = { hook_event_name: 'UserPromptSubmit', cwd: path.join(d, 'proj', 'sub'), prompt: v.prompt, ...(v.mode === null ? {} : { permission_mode: v.mode }) };
    const env = { CLAUDE_PROJECT_DIR: path.join(d, 'proj'), CLAUDE_CONFIG_DIR: path.join(d, 'cfg'), CLAUDE_PLUGIN_OPTION_PREFIX: v.prefix };
    const r = await run({ input, env });
    assert.equal(r.rc, 0, `${v.id}: rc`);
    assert.equal(r.stdout, v.expected === null ? '{}' : ctx(v.expected), `${v.id}: stdout`);
    if (v.expected !== null) assert.equal(v.expected.length, v.length, `${v.id}: golden length`);
  });
}

// ---- 2. Layer, mode and option fixtures: expected text, null = `{}`

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
  ['dot file and directory named *.md are ignored', { [`proj/${P}/.hid.md`]: 'HID', [`proj/${P}/dir.md`]: null }, '++hid ++dir', 'default', null],
  ['uppercase stem and uppercase token', { [`proj/${P}/Foo.md`]: 'UP' }, '++FOO', 'default', 'UP'],
  ['front matter name differs from the stem', { [`proj/${P}/zzz.md`]: fm('name: "qq"', 'QQ') }, '++qq ++zzz', 'default', 'QQ'],
  ['symbol name', { [`proj/${P}/!!.md`]: 'BANG' }, 'say ++!! now', 'default', 'BANG'],
  ['word before the prefix is no token', { [`proj/${P}/foo.md`]: 'F' }, 'x++foo', 'default', null],
  ['synthetic delivery', {}, '<task-notification>++m', 'default', null],
  ['no prefix at all', {}, 'hello', 'default', null],
  ['invalid prefix option falls back to ++', {}, '++r', 'default', vec('spec-4'), { CLAUDE_PLUGIN_OPTION_PREFIX: 'ab' }],
  ['custom prefix ignores ++ tokens', {}, '++r', 'default', null, { CLAUDE_PLUGIN_OPTION_PREFIX: '@@' }],
  ['custom prefix header token', { [`proj/${P}/h.md`]: fm('header: "T {token}:"', 'HB') }, '@@H', 'default', 'T @@h:\n\nHB', { CLAUDE_PLUGIN_OPTION_PREFIX: '@@' }],
  ['launch dir comes from cwd without CLAUDE_PROJECT_DIR', { [`proj/${P}/foo.md`]: 'CWD' }, '++foo', 'default', 'CWD', { CLAUDE_PROJECT_DIR: '', CWD: 'proj' }],
  ['config dir falls back to HOME/.claude', { [`home/.claude/placeholders/foo.md`]: 'HOMEFOO' }, '++foo', 'default', 'HOMEFOO', { CLAUDE_CONFIG_DIR: '', HOME: 'home' }],
];

for (const [name, tree, prompt, mode, want, over = {}] of CASES) {
  job(`layer: ${name}`, async () => {
    const d = sandbox();
    put(d, tree);
    const env = { CLAUDE_PROJECT_DIR: path.join(d, 'proj'), CLAUDE_CONFIG_DIR: path.join(d, 'cfg') };
    for (const [k, v] of Object.entries(over)) if (k !== 'CWD') env[k] = k === 'HOME' ? path.join(d, v) : v;
    const cwd = path.join(d, over.CWD ?? 'proj/sub');
    const r = await run({ input: { hook_event_name: 'UserPromptSubmit', cwd, prompt, permission_mode: mode }, env });
    assert.equal(r.rc, 0, 'rc');
    assert.equal(r.stdout, want === null ? '{}' : ctx(want), 'stdout');
  });
}

// ---- 3. Fail open

job('fail open: garbage and empty stdin', async () => {
  const out = [await run({ raw: 'not json', env: {} }), await run({ raw: '', env: {} })].map((r) => [r.rc, r.stdout]);
  assert.deepEqual(out, [[0, '{}'], [0, '{}']], 'rc and stdout');
});

job('fail open: unreadable default layer', async () => {
  const root = fs.mkdtempSync(path.join(TMP, 'noroot-'));
  fs.mkdirSync(path.join(root, 'hooks'));
  fs.copyFileSync(INJECT, path.join(root, 'hooks', 'inject.mjs'));
  fs.mkdirSync(path.join(root, 'placeholders', 'dir.md'), { recursive: true });
  fs.writeFileSync(path.join(root, 'placeholders', 'm.md'), 'M');
  fs.chmodSync(path.join(root, 'placeholders', 'm.md'), 0o000);
  const r = await run({ root, input: { hook_event_name: 'UserPromptSubmit', prompt: '++m', permission_mode: 'default' }, env: {} });
  fs.chmodSync(path.join(root, 'placeholders', 'm.md'), 0o644);
  assert.deepEqual([r.rc, r.stdout], process.getuid?.() === 0 ? [0, ctx('M')] : [0, '{}'], 'rc and stdout');
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
    const before = Date.now();
    const r = await run({ root, input: { hook_event_name: event, session_id: SID, permission_mode: 'plan', ...(event === 'UserPromptSubmit' ? { prompt: 'plain' } : { tool_calls: [] }) }, env: {} });
    const s = readState(root, SID);
    assert.deepEqual([r.rc, r.stdout, Object.keys(s), s.mode, s.ts >= before && s.ts <= Date.now()], [0, '{}', ['mode', 'ts'], 'plan', true], 'rc, stdout, state shape');
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
  assert.deepEqual([r.stdout.startsWith('{"hookSpecificOutput"'), mode], [true, 'plan'], 'injected and recorded');
});

// ---- 5. Differential: the TS lib (band, command, typeahead) and inject.mjs must resolve the same definitions

register(`data:text/javascript,${encodeURIComponent("export async function resolve(s, c, n) { if (/^\\.\\.?\\/[^.]*$/.test(s)) { try { return await n(s + '.ts', c); } catch {} } return n(s, c); }")}`);
const inject = await import(pathToFileURL(INJECT).href);
const ts = await import(pathToFileURL(path.join(MOD, 'hooks', 'lib', 'defs.ts')).href);
const tsMatch = await import(pathToFileURL(path.join(MOD, 'hooks', 'lib', 'match.ts')).href);

const strip = (defs) => JSON.parse(JSON.stringify(defs.map(({ description: _d, ...d }) => d)));
const RAWS = [
  '', '   \n', '```\nfenced\n```', '~~~\ntilde\n~~~\n', 'plain text\n', '\ufeff```\nbom\n```', '```\r\ncrlf\r\n```\r\n', 'a\n```x\nin\n```\nmid\n~~~\nin2\n~~~\nz',
  '---\n---\nempty fm', '---\nname: "q"\n---\nQ', '---\nname: q\nBODY no close', '---', '---\n', '\n\n---\nname: n\n---\nN', '\ufeff---\r\nname: bom\r\n---\r\nB',
  '---\nname: \'single\'\ndescription: "d" # c\norder: 7\npriority: -2\n---\nS', '---\nname: x\norder: seven\nwhen: sometimes\ninsert: nope\nwat: 1\n---\nBAD',
  '---\n# comment\n\nname: c\nheader: "H \\"{token}\\""\ngroup: g\nlegacy: l\nwhen: not-plan\ninsert: inline\n---\nC', '---\nname: "bad name"\n---\nN', '---\nname: "++"\n---\nSYM', '---\nname: ""\n---\nE',
];
const stems = ['m', 'm.plan', 'x', 'Mixed', '.plan', 'a.plan', '!!', 'bad name'];
for (let i = 0; i < RAWS.length; i++) {
  job(`differential: raw #${i} as default, native override and legacy`, async () => {
    const mk = (kind, files) => ({ id: 'l', kind, files: new Map(files) });
    for (const stem of stems) {
      const base = mk('native', [['m', '---\nname: "m"\nlegacy: full\norder: 5\nheader: "HD"\n---\nBASE'], ['m.plan', '---\nname: "m"\nwhen: plan\n---\nBASEPLAN']]);
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
  const io = {
    exists: async (p) => fs.existsSync(p),
    list: async (p) => fs.readdirSync(p, { withFileTypes: true }).map((e) => ({ name: e.name, kind: e.isDirectory() ? 'dir' : 'file', size: 0, mtimeMs: 0, isLink: false })),
    read: async (p) => fs.readFileSync(p, 'utf8'),
  };
  const reg = await ts.loadRegistry(io, roots, ts.newRegistryCache());
  assert.deepEqual(strip(inject.loadDefs(roots)), strip([...reg.defs]), 'loadDefs vs loadRegistry on disk');
});

await Promise.all(jobs);
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`inject-parity: ${passes} passed, ${fails} failed (${VECTORS.length} golden vectors, ${CASES.length} layer fixtures, files ${Object.keys(GOLDEN_FILES).join(',')})`);
process.exit(fails === 0 ? 0 : 1);
