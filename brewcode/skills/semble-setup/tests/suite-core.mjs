#!/usr/bin/env node
/**
 * suite-core.mjs (unit B) — lib/semble-common.sh, semble-mcp.sh,
 * semble-cache.sh, semble-state.sh.
 *
 * Self-contained: no shared harness module, no dependency on tests/run.sh, and
 * no dependency on another unit's fixtures — every repo, cache root, HOME and
 * ~/.claude.json fixture is generated inside one mkdtemp base. The real
 * ~/.claude, the real cache and the repo working tree are never touched.
 *
 * Assertion policy: unconditional exact-equality / exact-size / exact-type
 * checks with a description; no `if` gates which asserts run.
 */
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync,
  readdirSync, realpathSync, statSync, utimesSync,
} from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(HERE, '..', 'scripts');
const LIB = join(SCRIPTS, 'lib', 'semble-common.sh');
const MCP_SH = join(SCRIPTS, 'semble-mcp.sh');
const CACHE_SH = join(SCRIPTS, 'semble-cache.sh');
const STATE_SH = join(SCRIPTS, 'semble-state.sh');

const PIN = 'semble[mcp]==0.5.4';

// ── isolated base ───────────────────────────────────────────────────────────
const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'semble-b-')));
const HOME = join(BASE, 'home');
const PROJ = join(BASE, 'proj');
const REPO_A = join(BASE, 'repo-a');
const REPO_B = join(BASE, 'repo-b');
const REPO_C = join(BASE, 'repo-c');
const CODE_ROOT = join(BASE, 'cache', 'semble-code');
const DOCS_ROOT = join(BASE, 'cache', 'semble-docs');
const STUB = join(BASE, 'claude-stub');
const LOG = join(BASE, 'claude-calls.log');
for (const d of [HOME, PROJ, REPO_A, REPO_B, REPO_C, CODE_ROOT]) mkdirSync(d, { recursive: true });
writeFileSync(join(REPO_A, 'main.py'), 'def main():\n    return 1\n');
writeFileSync(join(REPO_B, 'app.ts'), 'export const app = 1;\n');
writeFileSync(join(REPO_C, 'x.py'), 'x = 1\n');

// Stub `claude`: records argv AND the state phase observed at call time, which
// is how "checkpoint is written before the add" is proven.
writeFileSync(STUB, `#!/usr/bin/env bash
p=$(node -e 'const fs=require("fs");let s={};try{s=JSON.parse(fs.readFileSync(process.env.SEMBLE_STATE_PROBE,"utf8"))}catch(e){};process.stdout.write(String(s.phase||"none"))')
printf '%s|phase=%s\\n' "$*" "$p" >> "$SEMBLE_STUB_LOG"
echo stub-ok
exit \${SEMBLE_STUB_RC:-0}
`);
spawnSync('chmod', ['+x', STUB]);

const STATE_FILE = join(PROJ, '.claude', 'semble', 'state.json');

function env(extra = {}) {
  const e = {
    ...process.env,
    HOME,
    SEMBLE_TEST_HOME: HOME,
    SEMBLE_PROJECT_ROOT: PROJ,
    SEMBLE_CACHE_ROOT_CODE: CODE_ROOT,
    SEMBLE_CACHE_ROOT_DOCS: DOCS_ROOT,
    SEMBLE_CLAUDE_BIN: STUB,
    SEMBLE_STUB_LOG: LOG,
    SEMBLE_STATE_PROBE: STATE_FILE,
    SEMBLE_NO_NETWORK: '1',
    ...extra,
  };
  for (const k of Object.keys(extra)) if (extra[k] === undefined) delete e[k];
  return e;
}

// ── harness ─────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

function check(name, actual, expected, message) {
  if (deepEqual(actual, expected)) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
  } else {
    failed++;
    results.push(
      `  FAIL  ${name}  (${message} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`,
    );
  }
}

function sh(code, extra = {}) {
  const r = spawnSync('bash', ['-c', `. "${LIB}"\n${code}`], {
    encoding: 'utf8', env: env(extra), timeout: 20000,
  });
  return { out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), status: r.status };
}

function run(script, args, extra = {}) {
  const r = spawnSync('bash', [script, ...args], {
    encoding: 'utf8', env: env(extra), timeout: 20000,
  });
  return { out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), status: r.status };
}

function json(res) {
  try { return JSON.parse(res.out); } catch (e) { return { __PARSE_ERROR__: String(e), raw: res.out }; }
}

function sha(file) {
  return existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : 'MISSING';
}

function tree(dir) {
  const out = [];
  const walk = (d, rel) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      const r = rel ? `${rel}/${n}` : n;
      if (statSync(p).isDirectory()) { out.push(`${r}/`); walk(p, r); } else { out.push(r); }
    }
  };
  if (existsSync(dir)) walk(dir, '');
  return out;
}

function pyHash(p) {
  const r = spawnSync('python3', ['-c',
    'import hashlib,sys,pathlib;print(hashlib.sha256(str(pathlib.Path(sys.argv[1]).expanduser().resolve()).encode()).hexdigest())',
    p], { encoding: 'utf8' });
  return (r.stdout || '').trim();
}

function writeClaudeJson(text) { writeFileSync(join(HOME, '.claude.json'), text); }
// "yes"/"no" — same rule semble-mcp.sh mcp_present() applies to the dump.
function mcpPresent() {
  const d = json(sh('sc_mcp_dump'));
  return (d.user || d.local || d.project) ? 'yes' : 'no';
}
function resetProject() { rmSync(join(PROJ, '.claude'), { recursive: true, force: true }); }
function resetLog() { rmSync(LOG, { force: true }); writeFileSync(LOG, ''); }

// ── 1. repo hash: byte-match against Python ────────────────────────────────
const hashA = sh(`sc_repo_hash "${REPO_A}"`);
const hashB = sh(`sc_repo_hash "${REPO_B}"`);
check('hash.python.repo-a', hashA.out, pyHash(REPO_A), 'sc_repo_hash == sha256(str(Path(p).expanduser().resolve()))');
check('hash.python.repo-b', hashB.out, pyHash(REPO_B), 'same equality for a second repo');
check('hash.distinct', hashA.out === hashB.out, false, 'two repos hash to two different directories');
check('hash.len.a', hashA.out.length, 64, 'hash is exactly 64 chars');
check('hash.len.b', hashB.out.length, 64, 'hash is exactly 64 chars');
check('hash.hex.a', /^[0-9a-f]{64}$/.test(hashA.out), true, 'hash is lowercase hex');
check('hash.hex.b', /^[0-9a-f]{64}$/.test(hashB.out), true, 'hash is lowercase hex');
check('hash.symlink-resolved', sh(`sc_repo_hash "${join(BASE, 'repo-a', '.')}"`).out, hashA.out, '"." component normalised like Path.resolve()');
check('hash.missing-path.exit', sh('sc_repo_hash /no/such/dir-xyz').status, 1, 'unresolvable path exits 1 instead of hashing a guess');

// ── 2. index dir contract (deviation fix) ──────────────────────────────────
check('indexdir.ok', sh(`sc_repo_index_dir "${REPO_A}"`).out, `${CODE_ROOT}/${hashA.out}/index`, 'index dir is <root>/<hash>/index');
check('indexdir.missing.exit', sh('sc_repo_index_dir /no/such/dir-xyz').status, 1, 'unresolvable repo -> exit 1 (not a bare "/index")');

// ── 3. cache roots ─────────────────────────────────────────────────────────
const defRoots = sh('printf "%s\\n%s\\n" "$(sc_cache_root_code)" "$(sc_cache_root_docs)"',
  { SEMBLE_CACHE_ROOT_CODE: undefined, SEMBLE_CACHE_ROOT_DOCS: undefined, XDG_CACHE_HOME: undefined });
const [defCode, defDocs] = defRoots.out.split('\n');
const expBase = process.platform === 'darwin' ? join(HOME, 'Library', 'Caches') : join(HOME, '.cache');
check('roots.default.code', defCode, join(expBase, 'semble-code'), 'default code root sits under the platform cache base');
check('roots.default.docs', defDocs, join(expBase, 'semble-docs'), 'default docs root sits under the platform cache base');
check('roots.leaf.code', basename(defCode), 'semble-code', 'code root leaf is exactly semble-code');
check('roots.leaf.docs', basename(defDocs), 'semble-docs', 'docs root leaf is exactly semble-docs');
check('roots.distinct', defCode === defDocs, false, 'the two roots are different paths');
check('roots.not-nested.a', defDocs.startsWith(`${defCode}/`), false, 'docs root is not inside the code root');
check('roots.not-nested.b', defCode.startsWith(`${defDocs}/`), false, 'code root is not inside the docs root');
check('roots.absolute', defCode.startsWith('/'), true, 'SEMBLE_CACHE_LOCATION must be absolute');

// ── 4. sc_mcp_state over the 7 config fixtures ─────────────────────────────
const CORRECT_CFG = {
  type: 'stdio', command: 'uvx',
  args: ['--from', PIN, 'semble', '--content', 'code', 'docs', 'config'],
  env: { SEMBLE_CACHE_LOCATION: CODE_ROOT },
  alwaysLoad: true,
};
// Same entry minus alwaysLoad. Without the key the semble tools stay deferred
// behind ToolSearch, so this is drift and must report stale_args.
const NO_ALWAYSLOAD_CFG = {
  type: 'stdio', command: 'uvx',
  args: ['--from', PIN, 'semble', '--content', 'code', 'docs', 'config'],
  env: { SEMBLE_CACHE_LOCATION: CODE_ROOT },
};
// The old two-bucket corpus: correct in every other respect, but it indexes
// zero markdown and evicts the CLI's index on every alternation.
const OLD_CONTENT_CFG = {
  type: 'stdio', command: 'uvx',
  args: ['--from', PIN, 'semble', '--content', 'code', 'config'],
  env: { SEMBLE_CACHE_LOCATION: CODE_ROOT },
  alwaysLoad: true,
};
const STALE_CFG = {
  type: 'stdio', command: 'uvx',
  args: ['--from', 'semble[mcp]', 'semble', '--content', 'code', 'config'],
  env: { SEMBLE_CACHE_LOCATION: join(HOME, 'Library', 'Caches', 'semble') },
};
const UPSTREAM_CFG = {
  type: 'stdio', command: 'uvx',
  args: ['--from', 'semble[mcp]', 'semble'], env: {},
};
const FIXTURES = {
  absent: JSON.stringify({ mcpServers: {} }),
  correct: JSON.stringify({ mcpServers: { semble_code: CORRECT_CFG } }),
  no_alwaysload: JSON.stringify({ mcpServers: { semble_code: NO_ALWAYSLOAD_CFG } }),
  alwaysload_false: JSON.stringify({ mcpServers: { semble_code: { ...NO_ALWAYSLOAD_CFG, alwaysLoad: false } } }),
  old_content: JSON.stringify({ mcpServers: { semble_code: OLD_CONTENT_CFG } }),
  stale: JSON.stringify({ mcpServers: { semble_code: STALE_CFG } }),
  wrongscope: JSON.stringify({ mcpServers: {}, projects: { [PROJ]: { mcpServers: { semble_code: CORRECT_CFG } } } }),
  // scope and args are both wrong: precedence (DESIGN 6.2) says wrong_scope wins
  wrongscope_stale: JSON.stringify({ mcpServers: {}, projects: { [PROJ]: { mcpServers: { semble_code: STALE_CFG } } } }),
  duplicate: JSON.stringify({ mcpServers: { semble_code: CORRECT_CFG }, projects: { [PROJ]: { mcpServers: { semble_code: CORRECT_CFG } } } }),
  upstream: JSON.stringify({ mcpServers: { semble: UPSTREAM_CFG } }),
  malformed: '{"mcpServers":{},}',
};
const EXPECTED_STATE = {
  absent: 'absent', correct: 'correct', stale: 'stale_args', wrongscope: 'wrong_scope',
  no_alwaysload: 'stale_args', alwaysload_false: 'stale_args', old_content: 'stale_args',
  wrongscope_stale: 'wrong_scope',
  duplicate: 'duplicate', upstream: 'upstream_unpinned', malformed: 'malformed',
};
for (const name of Object.keys(FIXTURES)) {
  writeClaudeJson(FIXTURES[name]);
  check(`mcpstate.${name}`, sh('sc_mcp_state').out, EXPECTED_STATE[name], `${name}.json -> ${EXPECTED_STATE[name]}`);
}

// ── 5. the exact registration command ──────────────────────────────────────
writeClaudeJson(FIXTURES.absent);
const EXPECTED_ADD = `${STUB} mcp add semble_code -s user -e SEMBLE_CACHE_LOCATION=${CODE_ROOT} -- uvx --from '${PIN}' semble --content code docs config`;
check('addcmd.exact', sh('sc_mcp_add_cmd').out, EXPECTED_ADD, 'whole-string equality with DESIGN 6.1, pin single-quoted');
check('addjson.payload', json(sh('sc_mcp_addjson_payload')), CORRECT_CFG, 'add-json payload deep-equals the approved config');

// ── 6. detect --json ───────────────────────────────────────────────────────
writeClaudeJson(FIXTURES.correct);
const detCorrect = json(run(MCP_SH, ['detect', '--json']));
check('detect.correct.state', detCorrect.state, 'correct', 'detect reports the matrix word');
check('detect.correct.diff', detCorrect.diff, [], 'no diff entries when the config matches');
check('detect.correct.expected', detCorrect.expected, { command: 'uvx', args: CORRECT_CFG.args, env: CORRECT_CFG.env, alwaysLoad: true }, 'expected block is the approved form');
check('detect.correct.conn', detCorrect.connectivity, 'connected', 'connectivity comes from `claude mcp get` exit status only');
check('detect.correct.schema', detCorrect.schema, 1, 'detect --json carries schema 1');

writeClaudeJson(FIXTURES.stale);
const detStale = json(run(MCP_SH, ['detect', '--json']));
check('detect.stale.state', detStale.state, 'stale_args', 'floating pin is detected as stale_args');
check('detect.stale.diff.fields', detStale.diff.map((d) => d.field), ['args', 'env.SEMBLE_CACHE_LOCATION', 'alwaysLoad'], 'diff names exactly the three wrong fields');
check('detect.stale.diff.expectedArgs', detStale.diff[0].expected, CORRECT_CFG.args.join(' '), 'diff carries the exact expected args');

// alwaysLoad drift: the ONLY wrong field, so it must be the only diff row.
writeClaudeJson(FIXTURES.no_alwaysload);
const detNoAlways = json(run(MCP_SH, ['detect', '--json']));
check('detect.noalways.state', detNoAlways.state, 'stale_args', 'a registration without alwaysLoad is drift, not correct');
check('detect.noalways.diff', detNoAlways.diff, [{ field: 'alwaysLoad', actual: '', expected: 'true' }], 'alwaysLoad is the single reported diff');
check('detect.noalways.human', run(MCP_SH, ['detect']).out.includes('alwaysLoad is not set'),
  true, 'human output names alwaysLoad explicitly');

// An explicit false is just as broken as an absent key.
writeClaudeJson(FIXTURES.alwaysload_false);
const detAlwaysFalse = json(run(MCP_SH, ['detect', '--json']));
check('detect.alwaysfalse.state', detAlwaysFalse.state, 'stale_args', 'alwaysLoad:false is drift');
check('detect.alwaysfalse.diff', detAlwaysFalse.diff, [{ field: 'alwaysLoad', actual: 'false', expected: 'true' }], 'the actual value is reported verbatim');

// Old two-bucket corpus: correct pin and alwaysLoad, wrong content set.
writeClaudeJson(FIXTURES.old_content);
const detOldContent = json(run(MCP_SH, ['detect', '--json']));
check('detect.oldcontent.state', detOldContent.state, 'stale_args', '`code config` is drift once the corpus includes docs');
check('detect.oldcontent.diff', detOldContent.diff,
  [{ field: 'args', actual: `--from ${PIN} semble --content code config`, expected: `--from ${PIN} semble --content code docs config` }],
  'the missing docs bucket surfaces as an args diff');

writeClaudeJson(FIXTURES.malformed);
check('detect.malformed.state', json(run(MCP_SH, ['detect', '--json'])).state, 'malformed', 'unparseable ~/.claude.json is reported, not repaired');

// ── 7. add: confirmation, checkpoint ordering, abort on malformed ──────────
writeClaudeJson(FIXTURES.malformed);
resetProject();
resetLog();
const addMalformed = run(MCP_SH, ['add', '--yes', '--json']);
check('add.malformed.exit', addMalformed.status, 1, 'malformed config -> ABORT exit 1');
check('add.malformed.abort', addMalformed.err.includes('ABORT'), true, 'ABORT message on stderr');
check('add.malformed.nostate', existsSync(STATE_FILE), false, 'nothing was written');
check('add.malformed.nocall', readFileSync(LOG, 'utf8'), '', 'claude was never invoked');

writeClaudeJson(FIXTURES.absent);
resetProject();
resetLog();
const addNoYes = run(MCP_SH, ['add', '--json']);
check('add.noyes.exit', addNoYes.status, 4, 'missing --yes -> exit 4');
check('add.noyes.status', json(addNoYes).status, 'needs_confirmation', 'reports needs_confirmation');
check('add.noyes.nocall', readFileSync(LOG, 'utf8'), '', 'nothing was registered');
check('add.noyes.nostate', existsSync(STATE_FILE), false, 'no state file was created');

resetLog();
const addOk = run(MCP_SH, ['add', '--yes', '--json']);
check('add.yes.exit', addOk.status, 0, 'add --yes exits 0');
check('add.yes.status', json(addOk).status, 'ok', 'reports ok');
// add-json is the primary form: it is the only one that can carry alwaysLoad.
check('add.yes.call', readFileSync(LOG, 'utf8'),
  `mcp add-json semble_code -s user ${JSON.stringify(CORRECT_CFG)}|phase=awaiting_reload\n`,
  'exact recorded argv AND phase=awaiting_reload observed at call time (checkpoint precedes the add)');
check('add.yes.call.alwaysload', JSON.parse(readFileSync(LOG, 'utf8').split('|')[0].split(' -s user ')[1]).alwaysLoad,
  true, 'the payload that reached claude carries alwaysLoad:true');
const stAfterAdd = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
check('add.state.phase', stAfterAdd.phase, 'awaiting_reload', 'phase parked at awaiting_reload');
check('add.state.completed', stAfterAdd.completed, ['mcp'], 'completed records exactly the mcp step');
check('add.state.scope', stAfterAdd.scope, 'user', 'scope recorded as user');
check('add.state.cacheRoot', stAfterAdd.cacheRoot, CODE_ROOT, 'cacheRoot recorded absolute');
check('add.state.schema', stAfterAdd.schema, 1, 'state schema is 1');
check('add.state.repoHash', stAfterAdd.repoHash, sh(`sc_repo_hash "${PROJ}"`).out, 'repoHash matches the project hash');

// add is a no-op when the server is already correct
writeClaudeJson(FIXTURES.correct);
resetLog();
const addAgain = run(MCP_SH, ['add', '--yes', '--json']);
check('add.correct.status', json(addAgain).status, 'unchanged', 'already-correct registration is left alone');
check('add.correct.exit', addAgain.status, 0, 'exit 0');
check('add.correct.nocall', readFileSync(LOG, 'utf8'), '', 'claude was not invoked');

// a differing registration is routed to repair, not silently overwritten
writeClaudeJson(FIXTURES.stale);
resetLog();
const addStale = run(MCP_SH, ['add', '--yes', '--json']);
check('add.stale.exit', addStale.status, 3, 'existing-but-different -> precondition exit 3');
check('add.stale.nocall', readFileSync(LOG, 'utf8'), '', 'nothing was mutated');

// degraded `claude mcp add` fallback when add-json fails
writeClaudeJson(FIXTURES.absent);
resetProject();
resetLog();
const addFail = run(MCP_SH, ['add', '--yes', '--json'], { SEMBLE_STUB_RC: '1' });
check('add.retry.exit', addFail.status, 1, 'both add-json and add failing -> exit 1');
check('add.retry.status', json(addFail).status, 'failed', 'reports failed');
check('add.retry.calls', readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => l.split(' ')[1]),
  ['add-json', 'add'], 'add-json runs first and is retried exactly once with the degraded add');
check('add.retry.rollback', JSON.parse(readFileSync(STATE_FILE, 'utf8')).phase, 'prereq_ready', 'phase rolled back to prereq_ready');

// dry run
writeClaudeJson(FIXTURES.absent);
resetProject();
resetLog();
const addDry = run(MCP_SH, ['add', '--yes', '--json'], { SEMBLE_DRY_RUN: '1' });
check('add.dry.exit', addDry.status, 0, 'dry run exits 0');
check('add.dry.nocall', readFileSync(LOG, 'utf8'), '', 'dry run never invokes claude');
check('add.dry.nostate', existsSync(STATE_FILE), false, 'dry run writes no state');

// ── 8. print-cmd mutates nothing ───────────────────────────────────────────
resetLog();
const pc = json(run(MCP_SH, ['print-cmd', '--json']));
check('printcmd.add', pc.add, EXPECTED_ADD, 'print-cmd emits the exact add command');
check('printcmd.payload', pc.payload, CORRECT_CFG, 'print-cmd emits the exact add-json payload');
check('printcmd.nocall', readFileSync(LOG, 'utf8'), '', 'print-cmd invokes nothing');

// ── 9. usage errors ────────────────────────────────────────────────────────
check('usage.mcp.bad-sub', run(MCP_SH, ['bogus']).status, 2, 'unknown subcommand -> exit 2');
check('usage.mcp.bad-flag', run(MCP_SH, ['detect', '--bogus']).status, 2, 'unknown flag -> exit 2');
check('usage.cache.bad-sub', run(CACHE_SH, ['bogus']).status, 2, 'unknown subcommand -> exit 2');
check('usage.state.no-key', run(STATE_SH, ['get']).status, 2, 'get without KEY -> exit 2');
check('usage.mcp.help', run(MCP_SH, ['--help']).status, 0, '--help exits 0');

// ── 10. state: malformed / unknown keys / transitions / idempotency ────────
resetProject();
mkdirSync(dirname(STATE_FILE), { recursive: true });
writeFileSync(STATE_FILE, '{,}');
const shaBefore = sha(STATE_FILE);
const badPatch = run(STATE_SH, ['patch', '{"phase":"ready"}']);
check('state.malformed.exit', badPatch.status, 1, 'unparseable state -> exit 1');
check('state.malformed.abort', badPatch.err.includes('ABORT'), true, 'ABORT is printed');
check('state.malformed.bytes', sha(STATE_FILE), shaBefore, 'the file is byte-identical after the abort');

resetProject();
mkdirSync(dirname(STATE_FILE), { recursive: true });
writeFileSync(STATE_FILE, JSON.stringify({ customKey: { a: 1 } }));
const okPatch = run(STATE_SH, ['patch', '{"phase":"prereq_ready"}', '--json']);
const afterPatch = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
check('state.unknownkey.exit', okPatch.status, 0, 'patch succeeds');
check('state.unknownkey.preserved', afterPatch.customKey, { a: 1 }, 'unknown top-level keys survive verbatim');
check('state.unknownkey.phase', afterPatch.phase, 'prereq_ready', 'the patched key is applied');
check('state.unknownkey.projectRoot', afterPatch.projectRoot, PROJ, 'projectRoot is rewritten from sc_project_root');
check('state.unknownkey.version', afterPatch.approvedVersion, '0.5.4', 'approvedVersion is the pin');

// `disabled` is not healable from absent: nothing was ever set up to disable.
resetProject();
const illegal = run(STATE_SH, ['phase', 'disabled']);
check('state.illegal.exit', illegal.status, 1, 'absent -> disabled is refused');
check('state.illegal.msg', illegal.out.includes('illegal phase transition absent -> disabled'), true, 'the refusal names the transition');
check('state.illegal.nofile', existsSync(STATE_FILE), false, 'no state file was created');

resetProject();
run(STATE_SH, ['init']);
run(STATE_SH, ['complete', 'warm']);
run(STATE_SH, ['complete', 'warm']);
const twice = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
check('state.complete.union', twice.completed, ['warm'], 'completed is union-merged: exactly one "warm"');
check('state.complete.count', twice.completed.length, 1, 'exactly one entry');
check('state.complete.badstep', run(STATE_SH, ['complete', 'bogus']).status, 2, 'unknown step -> exit 2');

const legal = run(STATE_SH, ['phase', 'awaiting_reload']);
check('state.legal.exit', legal.status, 0, 'prereq_ready -> awaiting_reload is legal');
check('state.legal.phase', run(STATE_SH, ['get', 'phase']).out, 'awaiting_reload', 'get returns the new phase');
check('state.reregister', run(STATE_SH, ['phase', 'verifying']).status, 0, 'awaiting_reload -> verifying is legal');
check('state.toready', run(STATE_SH, ['phase', 'ready']).status, 0, 'verifying -> ready is legal');
check('state.ready-to-awaiting', run(STATE_SH, ['phase', 'awaiting_reload']).status, 0, 'ready -> awaiting_reload (re-registration) is legal');
check('state.absent-not-settable', run(STATE_SH, ['phase', 'absent']).status, 2, 'phase absent is a usage error, not a write');

const showJson = json(run(STATE_SH, ['show', '--json']));
check('state.show.present', showJson.present, true, 'show reports the file exists');
check('state.show.phase', showJson.phase, 'awaiting_reload', 'show reports the phase');
check('state.show.completed', showJson.completed, ['warm'], 'show reports completed');

// schema guard
writeFileSync(STATE_FILE, JSON.stringify({ schema: 2, phase: 'ready' }));
const shaSchema = sha(STATE_FILE);
const mism = run(STATE_SH, ['patch', '{"enabled":false}']);
check('state.schema.exit', mism.status, 1, 'a foreign schema is refused');
check('state.schema.msg', mism.out.includes('state schema mismatch'), true, 'the message names the mismatch');
check('state.schema.bytes', sha(STATE_FILE), shaSchema, 'the file is byte-identical');

// clear
resetProject();
run(STATE_SH, ['init']);
check('state.clear.noyes', run(STATE_SH, ['clear']).status, 4, 'clear without --yes -> exit 4');
check('state.clear.kept', existsSync(STATE_FILE), true, 'the state file survives');
check('state.clear.yes', run(STATE_SH, ['clear', '--yes']).status, 0, 'clear --yes exits 0');
check('state.clear.gone', existsSync(join(PROJ, '.claude', 'semble')), false, '.claude/semble is removed');
check('state.clear.claude-kept', existsSync(join(PROJ, '.claude')), true, 'the surrounding .claude dir is untouched');

// ── 10b. the field defect: close-out on a genuinely absent state file ──────
// A project that inherits an already-correct USER-scope registration never gets
// a checkpoint (semble-mcp.sh add short-circuits with "unchanged"), so `resume`
// reaches Step 4.3 with phase=absent. `phase ready` must heal, not die.
resetProject();
const healed = run(STATE_SH, ['phase', 'ready', '--json']);
const healedJson = json(healed);
check('state.heal.exit', healed.status, 0, 'absent -> ready self-heals instead of failing the close-out');
check('state.heal.flag', healedJson.healed, true, 'the JSON marks the run as healed');
check('state.heal.from', healedJson.from, 'absent', 'from is reported as absent');
check('state.heal.to', healedJson.to, 'ready', 'to is the requested phase');
check('state.heal.walk', healedJson.walked,
  ['absent', 'prereq_ready', 'awaiting_reload', 'verifying', 'ready'],
  'the whole legal forward chain is walked - no pair of the machine is skipped');
const healedState = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
check('state.heal.phase', healedState.phase, 'ready', 'phase on disk is ready');
check('state.heal.schema', healedState.schema, 1, 'the healed file is a schema-1 document');
check('state.heal.completed', healedState.completed, [], 'healing marks no step complete on its own');
check('state.heal.enabled', healedState.enabled, true, 'the healed file carries the init defaults');
check('state.heal.resume', healedState.resumePrompt, '/brewcode:semble-setup resume', 'init defaults verbatim');
check('state.heal.root', healedState.projectRoot, PROJ, 'projectRoot is the resolved project root');

resetProject();
const healMid = json(run(STATE_SH, ['phase', 'verifying', '--json']));
check('state.heal.mid.walk', healMid.walked, ['absent', 'prereq_ready', 'awaiting_reload', 'verifying'],
  'the walk stops exactly at the requested phase');
check('state.heal.mid.phase', JSON.parse(readFileSync(STATE_FILE, 'utf8')).phase, 'verifying', 'phase on disk is verifying');
// Healing is confined to the absent case: a PRESENT file keeps the full table.
check('state.heal.nobypass', run(STATE_SH, ['phase', 'prereq_ready']).status, 1,
  'verifying -> prereq_ready is still refused after a heal');
check('state.heal.nobypass.phase', JSON.parse(readFileSync(STATE_FILE, 'utf8')).phase, 'verifying', 'the refusal left the phase alone');
resetProject();
const healErr = run(STATE_SH, ['phase', 'error', '--json']);
check('state.heal.error.exit', healErr.status, 0, 'absent -> error was legal before and still is');
check('state.heal.error.flag', json(healErr).healed, false, 'it is a plain transition, not a heal');

// ── 10c. `complete` takes a list ──────────────────────────────────────────
resetProject();
run(STATE_SH, ['init']);
const single = run(STATE_SH, ['complete', 'warm']);
check('state.complete.single.out', single.out, '✅ completed += warm -> ["warm"]', 'the single-step human line is unchanged');
const singleJson = json(run(STATE_SH, ['complete', 'warm', '--json']));
check('state.complete.single.step', singleJson.step, 'warm', '`step` still carries the single step verbatim');
check('state.complete.single.steps', singleJson.steps, ['warm'], '`steps` is the array form of the same call');

resetProject();
run(STATE_SH, ['init']);
const multiArgs = run(STATE_SH, ['complete', 'prereq', 'mcp', 'permissions', '--json']);
check('state.complete.multiargs.exit', multiArgs.status, 0, 'several arguments are accepted');
check('state.complete.multiargs.completed', json(multiArgs).completed, ['prereq', 'mcp', 'permissions'],
  'all three land in ONE patch');
const oneString = run(STATE_SH, ['complete', 'guidance agents warm smoke', '--json']);
check('state.complete.string.exit', oneString.status, 0, 'a single whitespace-separated string is accepted');
check('state.complete.string.completed', json(oneString).completed,
  ['prereq', 'mcp', 'permissions', 'guidance', 'agents', 'warm', 'smoke'],
  'the string form union-merges onto the existing set');
check('state.complete.disk', JSON.parse(readFileSync(STATE_FILE, 'utf8')).completed,
  ['prereq', 'mcp', 'permissions', 'guidance', 'agents', 'warm', 'smoke'],
  'the state file holds exactly the seven closed-set steps');

const shaBeforeBadList = sha(STATE_FILE);
const badList = run(STATE_SH, ['complete', 'prereq', 'bogus', 'mcp']);
check('state.complete.badlist.exit', badList.status, 2, 'an unknown token inside the list -> exit 2');
check('state.complete.badlist.msg', badList.out.includes('unknown step: bogus'), true, 'the message names the offending token');
check('state.complete.badlist.bytes', sha(STATE_FILE), shaBeforeBadList, 'nothing was written: the file is byte-identical');
const badString = run(STATE_SH, ['complete', 'warm bogus smoke']);
check('state.complete.badstring.exit', badString.status, 2, 'the string form validates every token too');
check('state.complete.badstring.bytes', sha(STATE_FILE), shaBeforeBadList, 'still byte-identical');
check('state.complete.dedupe', json(run(STATE_SH, ['complete', 'warm', 'warm', 'smoke', '--json'])).steps, ['warm', 'smoke'],
  'a repeated token is deduped inside one call');
check('state.complete.nosteps', run(STATE_SH, ['complete']).status, 2, 'complete without a STEP -> exit 2');
check('state.complete.blank', run(STATE_SH, ['complete', '   ']).status, 2, 'a whitespace-only argument -> exit 2');
check('usage.state.second-positional', run(STATE_SH, ['get', 'phase', 'extra']).status, 2,
  'every other subcommand still rejects a second positional');

// ── 10d. the full Step 4.3 close-out, from a genuinely absent state ────────
resetProject();
const closePhase = run(STATE_SH, ['phase', 'ready']);
const closeSteps = run(STATE_SH, ['complete', 'prereq mcp permissions guidance agents warm smoke']);
const closed = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
check('state.closeout.phase.exit', closePhase.status, 0, 'Step 4.3 `phase ready` exits 0 with no prior state file');
check('state.closeout.steps.exit', closeSteps.status, 0, 'Step 4.3 `complete <seven>` exits 0');
check('state.closeout.phase', closed.phase, 'ready', 'the close-out leaves phase=ready');
check('state.closeout.completed', closed.completed,
  ['prereq', 'mcp', 'permissions', 'guidance', 'agents', 'warm', 'smoke'],
  'all seven steps are recorded in the state file, not just claimed on stdout');
check('state.closeout.readback', run(STATE_SH, ['get', 'completed']).out,
  '["prereq","mcp","permissions","guidance","agents","warm","smoke"]',
  '`get completed` is what SKILL.md prints as `recorded:`');

// ── 10e. the phase machine vs the call sites that actually drive it ────────
// D1: `resume` used to run `phase ready` straight from `awaiting_reload`, a
// transition the machine refuses, so no install could ever reach `ready`. The
// targets below are READ OUT of SKILL.md and the sibling scripts instead of
// being restated here, so a call site added or renamed later is exercised
// automatically rather than silently escaping this matrix.
const SKILL_MD = readFileSync(join(HERE, '..', 'SKILL.md'), 'utf8');
const MCP_SRC = readFileSync(MCP_SH, 'utf8');
const PROJECT_SRC = readFileSync(join(SCRIPTS, 'semble-project.sh'), 'utf8');

// SKILL.md executes the script only from an EXECUTE bash block; the mode-routing
// table names it too, and that prose must not be mistaken for a call site.
const SKILL_HOPS = [...SKILL_MD.matchAll(/bash "\$SD\/scripts\/semble-state\.sh" phase ([a-z_]+)/g)]
  .map((m) => m[1]);
const SCRIPT_TARGETS = [
  ...[...MCP_SRC.matchAll(/"\$STATE_SH" phase ([a-z_]+)/g)].map((m) => m[1]),
  ...[...PROJECT_SRC.matchAll(/sp_set_phase ([a-z_]+)/g)].map((m) => m[1]),
];
const CALLSITE_TARGETS = [...new Set([...SKILL_HOPS, ...SCRIPT_TARGETS])].sort();

// Two hops in document order: the resume walk, and only that. The install-path
// checkpoint on the `correct` branch used to be an EXECUTE block here, which
// meant a project whose MCP an earlier project already registered kept no
// state.json at all whenever the model skipped the block; semble-mcp.sh writes
// it itself now (mcp_checkpoint / mcp_checkpoint_present), so the guarantee is
// asserted against the SCRIPT below rather than against prose.
const RESUME_HOPS = SKILL_HOPS;
check('phase.callsites.skill', SKILL_HOPS, ['verifying', 'ready'],
  'SKILL.md drives resume through verifying and only then to ready; the checkpoint is the script job');
check('phase.callsites.checkpoint', MCP_SRC.includes('"$STATE_SH" phase awaiting_reload'), true,
  'the awaiting_reload checkpoint is guaranteed by semble-mcp.sh, not by a SKILL.md block a model can skip');
check('phase.callsites.union', CALLSITE_TARGETS,
  ['awaiting_reload', 'disabled', 'error', 'prereq_ready', 'ready', 'verifying'],
  'the call sites between them name all six settable phases');

function seedPhase(phase, extra = {}) {
  resetProject();
  if (phase === 'absent') return;
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify({
    schema: 1,
    profile: 'code',
    phase,
    enabled: true,
    scope: 'user',
    projectRoot: PROJ,
    approvedVersion: '0.5.4',
    cacheRoot: CODE_ROOT,
    repoHash: '',
    completed: [],
    notes: [],
    resumePrompt: '/brewcode:semble-setup resume',
    ...extra,
  }, null, 2)}\n`);
}
function diskPhase() {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')).phase : 'absent';
}
function phaseVerdict(from, to) {
  seedPhase(from);
  const r = run(STATE_SH, ['phase', to]);
  return `${r.status === 0 ? 'ok' : 'refused'}:${diskPhase()}`;
}

const PHASE_SOURCES = ['absent', 'prereq_ready', 'awaiting_reload', 'verifying', 'ready', 'disabled', 'error'];
const callsiteMatrix = {};
for (const to of CALLSITE_TARGETS) {
  for (const from of PHASE_SOURCES) callsiteMatrix[`${from}->${to}`] = phaseVerdict(from, to);
}
check('phase.callsites.matrix.size', Object.keys(callsiteMatrix).length, 42,
  'every call-site target is probed from every source phase');
check('phase.callsites.matrix', callsiteMatrix, {
  // checkpoint (semble-mcp.sh, before EVERY add/repair): legal wherever a setup
  // exists, healed from absent - `install`/`upgrade` must be able to re-register
  // out of a crashed verify, a disabled project and a failed run alike.
  'absent->awaiting_reload': 'ok:awaiting_reload',
  'prereq_ready->awaiting_reload': 'ok:awaiting_reload',
  'awaiting_reload->awaiting_reload': 'ok:awaiting_reload',
  'verifying->awaiting_reload': 'ok:awaiting_reload',
  'ready->awaiting_reload': 'ok:awaiting_reload',
  'disabled->awaiting_reload': 'ok:awaiting_reload',
  'error->awaiting_reload': 'ok:awaiting_reload',
  // `disable` is offered in every mode table; only a setup that never happened
  // cannot be disabled.
  'absent->disabled': 'refused:absent',
  'prereq_ready->disabled': 'ok:disabled',
  'awaiting_reload->disabled': 'ok:disabled',
  'verifying->disabled': 'ok:disabled',
  'ready->disabled': 'ok:disabled',
  'disabled->disabled': 'ok:disabled',
  'error->disabled': 'ok:disabled',
  // `error` is a verification outcome; `ready` never degrades to it in place.
  'absent->error': 'ok:error',
  'prereq_ready->error': 'ok:error',
  'awaiting_reload->error': 'ok:error',
  'verifying->error': 'ok:error',
  'ready->error': 'refused:ready',
  'disabled->error': 'refused:disabled',
  'error->error': 'ok:error',
  // add-failed rollback (semble-mcp.sh:270) and the repair restart.
  'absent->prereq_ready': 'ok:prereq_ready',
  'prereq_ready->prereq_ready': 'ok:prereq_ready',
  'awaiting_reload->prereq_ready': 'ok:prereq_ready',
  'verifying->prereq_ready': 'refused:verifying',
  'ready->prereq_ready': 'refused:ready',
  'disabled->prereq_ready': 'refused:disabled',
  'error->prereq_ready': 'ok:prereq_ready',
  // THE D1 INVARIANT: `ready` has exactly one legal source, `verifying`.
  // awaiting_reload -> ready stays refused; the resume path buys `ready` by
  // going through the verify hop, not by widening the machine.
  'absent->ready': 'ok:ready',
  'prereq_ready->ready': 'refused:prereq_ready',
  'awaiting_reload->ready': 'refused:awaiting_reload',
  'verifying->ready': 'ok:ready',
  'ready->ready': 'ok:ready',
  'disabled->ready': 'refused:disabled',
  'error->ready': 'refused:error',
  // the verify hop itself: reachable from every state that has a registration.
  'absent->verifying': 'ok:verifying',
  'prereq_ready->verifying': 'refused:prereq_ready',
  'awaiting_reload->verifying': 'ok:verifying',
  'verifying->verifying': 'ok:verifying',
  'ready->verifying': 'ok:verifying',
  'disabled->verifying': 'ok:verifying',
  'error->verifying': 'ok:verifying',
}, 'every phase target named by a call site is legal exactly where the machine says it is');

// The resume walk, end to end, over a state file shaped like the two real
// installs that were stuck: awaiting_reload with mcp/warm/smoke already done.
seedPhase('awaiting_reload', { completed: ['mcp', 'warm', 'smoke'] });
const resumeExits = RESUME_HOPS.map((h) => run(STATE_SH, ['phase', h]).status);
const resumed = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
check('resume.walk.exits', resumeExits, [0, 0], 'both hops SKILL.md performs exit 0 from awaiting_reload');
check('resume.walk.phase', resumed.phase, 'ready', 'the walk lands on ready');
check('resume.walk.completed', resumed.completed, ['mcp', 'warm', 'smoke'],
  'the walk preserves the progress the interrupted install had recorded');

seedPhase('awaiting_reload', { completed: ['mcp', 'warm', 'smoke'] });
const shortcut = run(STATE_SH, ['phase', 'ready']);
check('resume.noshortcut.exit', shortcut.status, 1, 'the verifying hop cannot be skipped');
check('resume.noshortcut.msg',
  shortcut.out.includes('illegal phase transition awaiting_reload -> ready'), true,
  'the refusal names the transition');

// ── 10f. installer-owned fields are refreshed on EVERY run ────────────────
// D5: st_init_file wrote resumePrompt/cacheRoot/repoHash only when the file did
// not exist yet, so both real repos still advertised `/brewcode:semble resume` -
// a command that stopped existing when the skill was renamed to semble-setup.
const DEAD_PROMPT = '/brewcode:semble resume';
const LIVE_PROMPT = '/brewcode:semble-setup resume';
const PROJ_HASH = sh(`sc_repo_hash "${PROJ}"`).out;
const STALE_FIELDS = { resumePrompt: DEAD_PROMPT, cacheRoot: '/gone/semble-code', repoHash: 'deadbeef' };

check('refresh.prompt.source', SKILL_MD.includes(LIVE_PROMPT), true,
  'SKILL.md and the state file agree on the command the user actually types');
check('refresh.prompt.nodead', SKILL_MD.includes(DEAD_PROMPT), false,
  'the pre-rename command survives nowhere in SKILL.md');

for (const [label, args] of [
  ['phase', ['phase', 'verifying']],
  ['complete', ['complete', 'guidance']],
  ['init', ['init']],
  ['patch', ['patch', '{"notes":["x"]}']],
]) {
  seedPhase('awaiting_reload', { ...STALE_FIELDS, completed: ['mcp', 'warm', 'smoke'], enabled: true });
  const r = run(STATE_SH, args);
  const after = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  check(`refresh.${label}.exit`, r.status, 0, `\`${args[0]}\` over an existing state file exits 0`);
  check(`refresh.${label}.prompt`, after.resumePrompt, LIVE_PROMPT, 'resumePrompt is rewritten from the constant');
  check(`refresh.${label}.cacheRoot`, after.cacheRoot, CODE_ROOT, 'cacheRoot is recomputed from the environment');
  check(`refresh.${label}.repoHash`, after.repoHash, PROJ_HASH, 'repoHash is recomputed from the project root');
  check(`refresh.${label}.version`, after.approvedVersion, '0.5.4', 'approvedVersion stays the pin');
  check(`refresh.${label}.enabled`, after.enabled, true, 'enabled is NOT reset as a side effect');
  check(`refresh.${label}.completed`, after.completed,
    label === 'complete' ? ['mcp', 'warm', 'smoke', 'guidance'] : ['mcp', 'warm', 'smoke'],
    'completed only ever grows by what was asked for');
}
check('refresh.phase.applied', (() => {
  seedPhase('awaiting_reload', STALE_FIELDS);
  run(STATE_SH, ['phase', 'verifying']);
  return diskPhase();
})(), 'verifying', 'the refresh does not swallow the transition it rides along with');
check('refresh.init.phase', (() => {
  seedPhase('awaiting_reload', STALE_FIELDS);
  run(STATE_SH, ['init']);
  return diskPhase();
})(), 'awaiting_reload', '`init` over an existing file refreshes but never rewinds the phase');

// A refused transition still writes nothing at all - the refresh rides on the
// legal path only.
seedPhase('awaiting_reload', STALE_FIELDS);
const shaStale = sha(STATE_FILE);
check('refresh.refused.exit', run(STATE_SH, ['phase', 'ready']).status, 1, 'the illegal hop is still refused');
check('refresh.refused.bytes', sha(STATE_FILE), shaStale,
  'a refused transition leaves the file byte-identical, stale fields included');

// ── 10g. the SD fallback resolves both plugin-cache layouts ───────────────
// D6: the shipped fallback globbed only `skills/semble-setup`, but installed
// caches still carry the pre-rename `skills/semble` (brewcode/4.10.1 on this
// machine), so an unset CLAUDE_PLUGIN_ROOT resolved to nothing - silently in
// bash, and as a hard `no matches found` in zsh.
// D7: `${CLAUDE_SKILL_DIR}` is a text substitution on the skill prompt, not an
// env var - getPromptForCommand does replace(/\$\{CLAUDE_SKILL_DIR\}/g, dir),
// and that regex matches the BARE literal only. The old spelling
// `SD="${CLAUDE_SKILL_DIR:-$(find ...)}"` was therefore never substituted: the
// shell saw an unset name and the cache fallback won on every single run.
const SD_LINES = [...SKILL_MD.matchAll(
  /^SD="\$\{CLAUDE_SKILL_DIR\}"\n\[ -n "\$SD" \] \|\| SD="\$\(find [^\n]*\)"$/gm)].map((m) => m[0]);
// 20 since `upgrade` gained its second half (the Step 3.3b guidance+agents block): it is the only
// writer of the rule file whose frontmatter carries this install's version stamp, so without it
// `upgrade` could never clear a `stale` verdict.
check('sd.count', SD_LINES.length, 19, 'every EXECUTE block re-resolves the skill dir');
check('sd.identical', new Set(SD_LINES).size, 1, 'all of them are the same block, character for character');
// Prose may NAME the broken spelling (Step 0 explains why it is broken); no
// assignment may USE it.
check('sd.noBraceModifier', SKILL_MD.includes('="${CLAUDE_SKILL_DIR:-'), false,
  'no assignment uses the brace-modifier spelling - the substitution regex would not match it and the fallback would always win');
check('sd.noglob', SD_LINES[0].includes('ls -d'), false,
  'the fallback uses find, not a shell glob that zsh turns into a hard error');

function sdResolve(layouts) {
  const h = mkdtempSync(join(BASE, 'sdhome-'));
  for (const rel of layouts) mkdirSync(join(h, rel), { recursive: true });
  const r = spawnSync('bash', ['-c', `${SD_LINES[0]}\nprintf '%s' "$SD"`], {
    encoding: 'utf8',
    env: { ...process.env, HOME: h, CLAUDE_SKILL_DIR: '' },
    timeout: 20000,
  });
  return (r.stdout || '').replace(h, '<HOME>');
}
const CACHE = '.claude/plugins/cache/claude-brewcode/brewcode';
check('sd.layout.old', sdResolve([`${CACHE}/4.10.1/skills/semble`]),
  `<HOME>/${CACHE}/4.10.1/skills/semble`,
  'the pre-rename layout really present in this machine cache resolves');
check('sd.layout.new', sdResolve([`${CACHE}/4.11.0/skills/semble-setup`]),
  `<HOME>/${CACHE}/4.11.0/skills/semble-setup`,
  'the current layout resolves');
check('sd.layout.mixed', sdResolve([`${CACHE}/4.10.1/skills/semble`, `${CACHE}/4.11.0/skills/semble-setup`]),
  `<HOME>/${CACHE}/4.11.0/skills/semble-setup`,
  'with both installed the newest version wins, not the longest name');
check('sd.layout.same-version', sdResolve([`${CACHE}/4.11.0/skills/semble`, `${CACHE}/4.11.0/skills/semble-setup`]),
  `<HOME>/${CACHE}/4.11.0/skills/semble-setup`,
  'inside one version the current leaf wins over the legacy one');
check('sd.layout.version-order', sdResolve([`${CACHE}/4.9.0/skills/semble-setup`, `${CACHE}/4.10.1/skills/semble`]),
  `<HOME>/${CACHE}/4.10.1/skills/semble`,
  'sort -V orders 4.10.1 above 4.9.0 instead of sorting them as strings');
check('sd.layout.none', sdResolve([]), '', 'no cache at all yields an empty SD, which the Step 0 guard turns into ❌');
check('sd.layout.decoy', sdResolve([`${CACHE}/4.11.0/skills/superreview`, `${CACHE}/4.11.0/agents/semble`]),
  '', 'neither a same-named agents dir nor a sibling skill is mistaken for the skill dir');
// And the case the old spelling could never reach: the substitution DID happen,
// so line 1 already holds a literal path and the cache must not be consulted.
{
  const h = mkdtempSync(join(BASE, 'sdsubst-'));
  mkdirSync(join(h, `${CACHE}/9.9.9/skills/semble-setup`), { recursive: true });
  const substituted = SD_LINES[0].replace('${CLAUDE_SKILL_DIR}', '/checkout/brewcode/skills/semble-setup');
  const r = spawnSync('bash', ['-c', `${substituted}\nprintf '%s' "$SD"`], {
    encoding: 'utf8', env: { ...process.env, HOME: h, CLAUDE_SKILL_DIR: '' }, timeout: 20000,
  });
  check('sd.substituted', r.stdout, '/checkout/brewcode/skills/semble-setup',
    'once the literal is substituted the fallback is skipped, even with a newer version in the cache');
}

resetProject();

// ── 11. cache: resolve / info / staleness ──────────────────────────────────
const res = json(run(CACHE_SH, ['resolve', '--repo', REPO_A, '--json']));
check('cache.resolve.hash', res.hash, hashA.out, 'resolve prints the repo hash');
check('cache.resolve.dir', res.repoDir, join(CODE_ROOT, hashA.out), 'repoDir is <code root>/<hash>');
check('cache.resolve.index', res.indexDir, join(CODE_ROOT, hashA.out, 'index'), 'indexDir is <repo dir>/index');

function makeIndex(repo, { contentType = ['code', 'config'], version = 1, files = {}, complete = true } = {}) {
  const h = sh(`sc_repo_hash "${repo}"`).out;
  const idx = join(CODE_ROOT, h, 'index');
  rmSync(join(CODE_ROOT, h), { recursive: true, force: true });
  mkdirSync(join(idx, 'bm25_index'), { recursive: true });
  mkdirSync(join(idx, 'semantic_index'), { recursive: true });
  writeFileSync(join(idx, 'chunks.json'), '[]');
  const meta = {
    root_path: repo, time: Date.now() / 1000 + 60, model_path: 'm',
    content_type: contentType, chunk_size: 512, cache_version: version, files,
  };
  writeFileSync(join(idx, 'metadata.json'), JSON.stringify(meta));
  if (!complete) rmSync(join(idx, 'bm25_index'), { recursive: true, force: true });
  return h;
}

const infoAbsent = json(run(CACHE_SH, ['info', '--repo', REPO_C, '--json']));
check('cache.info.absent', infoAbsent.staleness, 'absent', 'no repo dir -> absent');
check('cache.info.present', infoAbsent.present, false, 'present=false');
check('cache.info.size', infoAbsent.sizeBytes, 0, 'sizeBytes is 0');
check('cache.info.codeRoot', infoAbsent.codeRoot, CODE_ROOT, 'codeRoot echoed');

makeIndex(REPO_C, { complete: false });
check('cache.info.incomplete', json(run(CACHE_SH, ['info', '--repo', REPO_C, '--json'])).staleness, 'incomplete', 'a missing persistence path -> incomplete');

makeIndex(REPO_C);
check('cache.info.nonet', json(run(CACHE_SH, ['info', '--repo', REPO_C, '--json'])).staleness, 'unknown', 'SEMBLE_NO_NETWORK=1 -> unknown');
check('cache.info.fresh', json(run(CACHE_SH, ['info', '--repo', REPO_C, '--json'], { SEMBLE_NO_NETWORK: undefined })).staleness, 'fresh', 'complete + matching metadata -> fresh');

makeIndex(REPO_C, { contentType: ['code'] });
check('cache.info.mismatch', json(run(CACHE_SH, ['info', '--repo', REPO_C, '--json'], { SEMBLE_NO_NETWORK: undefined })).staleness, 'mismatch', 'content_type != {code,config} -> mismatch');

makeIndex(REPO_C, { version: 2 });
check('cache.info.version', json(run(CACHE_SH, ['info', '--repo', REPO_C, '--json'], { SEMBLE_NO_NETWORK: undefined })).staleness, 'mismatch', 'cache_version != 1 -> mismatch');

makeIndex(REPO_C, { files: { 'x.py': { mtime_ns: 1, start: 0, count: 1 } } });
const future = new Date(Date.now() + 600000);
utimesSync(join(REPO_C, 'x.py'), future, future);
check('cache.info.stale', json(run(CACHE_SH, ['info', '--repo', REPO_C, '--json'], { SEMBLE_NO_NETWORK: undefined })).staleness, 'stale', 'a source file newer than metadata.time -> stale');

makeIndex(REPO_C, { files: { 'gone.py': { mtime_ns: 1, start: 0, count: 1 } } });
check('cache.info.missing-file', json(run(CACHE_SH, ['info', '--repo', REPO_C, '--json'], { SEMBLE_NO_NETWORK: undefined })).staleness, 'stale', 'an indexed file that vanished -> stale');

// otherRepos + list
const hC = makeIndex(REPO_C);
const hA = makeIndex(REPO_A);
const infoA = json(run(CACHE_SH, ['info', '--repo', REPO_A, '--json']));
check('cache.info.other.count', infoA.otherRepos.length, 1, 'exactly one other indexed repo is reported');
check('cache.info.other.hash', infoA.otherRepos[0].hash, hC, 'the other repo is identified by hash');
check('cache.info.other.root', infoA.otherRepos[0].rootPath, REPO_C, 'root_path comes from that entry metadata');
check('cache.info.entries', infoA.entries, 2, 'entries counts files only (chunks.json + metadata.json; the two empty index dirs hold none)');
const listed = json(run(CACHE_SH, ['list', '--json']));
check('cache.list.count', listed.count, 2, 'list reports both 64-hex entries');
check('cache.list.hashes', listed.entries.map((e) => e.hash).sort(), [hA, hC].sort(), 'list reports exactly the two hashes');

// ── 12. reserve-docs ───────────────────────────────────────────────────────
const marker = join(DOCS_ROOT, 'RESERVED-FOR-DOCS.txt');
const rd1 = json(run(CACHE_SH, ['reserve-docs', '--json']));
check('docs.reserve.created', rd1.created, true, 'the marker is created');
check('docs.reserve.exists', existsSync(marker), true, 'RESERVED-FOR-DOCS.txt exists');
const rd2 = json(run(CACHE_SH, ['reserve-docs', '--json']));
check('docs.reserve.idempotent', rd2.created, false, 'a second run creates nothing');
check('docs.reserve.info', json(run(CACHE_SH, ['info', '--repo', REPO_A, '--json'])).docsReserved, true, 'info reports docsReserved');
check('docs.reserve.no-index', tree(DOCS_ROOT), ['RESERVED-FOR-DOCS.txt'], 'the docs root holds the marker and nothing else');

// ── 13. purge guards ───────────────────────────────────────────────────────
mkdirSync(join(CODE_ROOT, 'notahash'), { recursive: true });
writeFileSync(join(CODE_ROOT, 'notahash', 'keep.txt'), 'keep');
const treeC = tree(join(CODE_ROOT, hC));
const badPurge = run(CACHE_SH, ['purge-repo', '--repo', join(BASE, 'no-such-repo'), '--yes', '--json']);
check('purge.guard.exit', badPurge.status, 1, 'an unresolvable repo -> exit 1');
check('purge.guard.msg', badPurge.out.includes('refusing to delete'), true, 'the guard says what it refused');
check('purge.guard.notahash', existsSync(join(CODE_ROOT, 'notahash', 'keep.txt')), true, 'the non-hex directory is untouched');

const noYes = run(CACHE_SH, ['purge-repo', '--repo', REPO_A, '--json']);
check('purge.noyes.exit', noYes.status, 4, 'purge-repo without --yes -> exit 4');
check('purge.noyes.kept', existsSync(join(CODE_ROOT, hA)), true, 'the cache dir survives');

const purged = run(CACHE_SH, ['purge-repo', '--repo', REPO_A, '--yes', '--json']);
check('purge.yes.exit', purged.status, 0, 'purge-repo --yes exits 0');
check('purge.yes.removed', existsSync(join(CODE_ROOT, hA)), false, 'exactly that hash dir is gone');
check('purge.yes.sibling', tree(join(CODE_ROOT, hC)), treeC, 'the sibling repo cache is byte-for-byte untouched');
check('purge.yes.notahash', existsSync(join(CODE_ROOT, 'notahash', 'keep.txt')), true, 'unrelated entries are untouched');

const dryPurge = run(CACHE_SH, ['purge-repo', '--repo', REPO_C, '--yes'], { SEMBLE_DRY_RUN: '1' });
check('purge.dry.exit', dryPurge.status, 0, 'dry run exits 0');
check('purge.dry.kept', tree(join(CODE_ROOT, hC)), treeC, 'dry run deletes nothing');
check('purge.dry.msg', dryPurge.out.includes('DRY rm -rf'), true, 'dry run prints the command it would run');

const badRoot = run(CACHE_SH, ['purge-root', '--which', 'code', '--yes'], { SEMBLE_CACHE_ROOT_CODE: join(BASE, 'cache') });
check('purge.root.guard', badRoot.status, 1, 'a root whose leaf is not semble-code is refused');
check('purge.root.kept', existsSync(join(BASE, 'cache')), true, 'nothing was deleted');
const okRoot = run(CACHE_SH, ['purge-root', '--which', 'docs', '--yes', '--json']);
check('purge.root.docs', okRoot.status, 0, 'the docs root can be purged');
check('purge.root.gone', existsSync(DOCS_ROOT), false, 'the docs root is gone');

// ── 14. remove / repair ────────────────────────────────────────────────────
writeClaudeJson(FIXTURES.absent);
resetLog();
const rmAbsent = run(MCP_SH, ['remove', '--yes', '--json']);
check('remove.absent.status', json(rmAbsent).status, 'unchanged', 'removing an unregistered server is a no-op');
check('remove.absent.nocall', readFileSync(LOG, 'utf8'), '', 'claude was not invoked');

writeClaudeJson(FIXTURES.correct);
resetLog();
const rmNoYes = run(MCP_SH, ['remove', '--json']);
check('remove.noyes.exit', rmNoYes.status, 4, 'remove without --yes -> exit 4');
check('remove.noyes.nocall', readFileSync(LOG, 'utf8'), '', 'nothing was removed');

writeClaudeJson(FIXTURES.correct);
resetLog();
const rmYes = run(MCP_SH, ['remove', '--yes', '--json']);
check('remove.yes.call', readFileSync(LOG, 'utf8').split('|')[0], 'mcp remove semble_code -s user', 'the exact removal command');
check('remove.yes.exit', rmYes.status, 1, 'the stub does not really remove it, so the post-check fails loudly');
const backups = readdirSync(HOME).filter((n) => n.startsWith('.claude.json.bak.'));
check('remove.backup', backups.length, 1, 'exactly one backup of ~/.claude.json was taken before the mutation');
for (const b of backups) rmSync(join(HOME, b));

writeClaudeJson(FIXTURES.stale);
resetProject();
resetLog();
const repairNoYes = run(MCP_SH, ['repair', '--json']);
check('repair.noyes.exit', repairNoYes.status, 4, 'repair without --yes -> exit 4');
check('repair.noyes.nocall', readFileSync(LOG, 'utf8'), '', 'nothing was touched');

resetLog();
const repairYes = run(MCP_SH, ['repair', '--yes', '--json']);
check('repair.calls', readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => l.split(' ').slice(0, 2).join(' ')),
  ['mcp remove', 'mcp add-json'], 'repair removes then re-registers with add-json');
check('repair.checkpoint', readFileSync(LOG, 'utf8').split('\n')[1].includes('phase=awaiting_reload'), true, 'the checkpoint precedes the re-registration');
check('repair.exit', repairYes.status, 1, 'the stub cannot change the file, so repair reports the failure instead of lying');

// An otherwise-perfect registration that predates alwaysLoad must still be
// repaired: `add-json` refuses to overwrite, so it is remove-then-re-add.
writeClaudeJson(FIXTURES.no_alwaysload);
resetProject();
resetLog();
const repairAlways = run(MCP_SH, ['repair', '--yes', '--json']);
const repairAlwaysLog = readFileSync(LOG, 'utf8').split('\n').filter(Boolean);
check('repair.alwaysload.calls', repairAlwaysLog.map((l) => l.split(' ').slice(0, 2).join(' ')),
  ['mcp remove', 'mcp add-json'], 'a missing alwaysLoad is repaired by remove + add-json');
check('repair.alwaysload.payload',
  JSON.parse(repairAlwaysLog[1].split('|')[0].split(' -s user ')[1]).alwaysLoad, true,
  'the re-registered payload carries alwaysLoad:true');
check('repair.alwaysload.exit', repairAlways.status, 1, 'the stub cannot change the file, so repair reports the failure');

writeClaudeJson(FIXTURES.correct);
resetLog();
const repairCorrect = run(MCP_SH, ['repair', '--yes', '--json']);
check('repair.correct.status', json(repairCorrect).status, 'unchanged', 'a correct registration is never rewritten');
check('repair.correct.nocall', readFileSync(LOG, 'utf8'), '', 'claude was not invoked');

writeClaudeJson(FIXTURES.absent);
check('repair.absent.exit', run(MCP_SH, ['repair', '--yes', '--json']).status, 3, 'nothing to repair -> precondition exit 3');

// ── 15. repair backs up <root>/.mcp.json before removing the project scope ──
// M1: the backup used to key off $SCOPE (always "user" for repair) while the
// scopes actually removed come from mcp_scopes.
const MCP_JSON = join(PROJ, '.mcp.json');
const UNRELATED_CFG = { type: 'stdio', command: 'other-server-bin', args: ['--serve'], env: { X: '1' } };
const MCP_JSON_BODY = `${JSON.stringify({ mcpServers: { semble_code: CORRECT_CFG, unrelated: UNRELATED_CFG } }, null, 2)}\n`;

function bakList(dir, prefix) { return readdirSync(dir).filter((n) => n.startsWith(prefix)).sort(); }
function dropBackups(dir, prefix) { for (const n of bakList(dir, prefix)) rmSync(join(dir, n)); }
function onlyBackupBody(dir, prefix) {
  const b = bakList(dir, prefix);
  return b.length === 1 ? readFileSync(join(dir, b[0]), 'utf8') : `NO-SINGLE-BACKUP(${b.length})`;
}

dropBackups(HOME, '.claude.json.bak.');
writeClaudeJson(FIXTURES.correct);
writeFileSync(MCP_JSON, MCP_JSON_BODY);
resetProject();
resetLog();
check('repair.mcpjson.state', sh('sc_mcp_state').out, 'duplicate',
  'semble_code in BOTH ~/.claude.json and <root>/.mcp.json -> duplicate');
const repairDup = run(MCP_SH, ['repair', '--yes', '--json']);
check('repair.mcpjson.scopes', readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => l.split('|')[0]),
  ['mcp remove semble_code -s user', 'mcp remove semble_code -s project',
    `mcp add-json semble_code -s user ${sh('sc_mcp_addjson_payload').out}`],
  'repair removes exactly the scopes mcp_scopes reported, then re-adds at user scope');
check('repair.mcpjson.backup.count', [bakList(HOME, ".claude.json.bak.").length, bakList(PROJ, ".mcp.json.bak.").length],
  [1, 1], 'exactly one backup of EACH file a removal can rewrite');
check('repair.mcpjson.backup.bytes', onlyBackupBody(PROJ, '.mcp.json.bak.'), MCP_JSON_BODY,
  'the .mcp.json backup is byte-identical to the file `claude mcp remove -s project` rewrites');
check('repair.mcpjson.unrelated-kept', JSON.parse(readFileSync(MCP_JSON, 'utf8')).mcpServers.unrelated, UNRELATED_CFG,
  'the unrelated server in .mcp.json is left untouched by the script itself');
check('repair.mcpjson.exit', repairDup.status, 1,
  'the stub cannot rewrite the files, so repair reports the failure instead of lying');
dropBackups(HOME, '.claude.json.bak.');
dropBackups(PROJ, '.mcp.json.bak.');
rmSync(MCP_JSON, { force: true });

// ── 16. repair refuses when only the unpinned upstream server exists ────────
// m11: sc_mcp_state says upstream_unpinned even with zero semble_code scopes.
writeClaudeJson(FIXTURES.upstream);
resetProject();
resetLog();
check('repair.upstream-absent.state', sh('sc_mcp_state').out, 'upstream_unpinned',
  'only the unpinned upstream `semble` server is registered');
check('repair.upstream-absent.present', mcpPresent(), 'no', 'no scope holds semble_code');
const repairUpstream = run(MCP_SH, ['repair', '--yes', '--json']);
check('repair.upstream-absent.exit', repairUpstream.status, 3, 'nothing to repair -> precondition exit 3');
check('repair.upstream-absent.status', json(repairUpstream).status, 'precondition', 'reports precondition, not "unchanged"');
check('repair.upstream-absent.state-word', json(repairUpstream).state, 'absent', 'the result names the real situation: absent');
check('repair.upstream-absent.nocall', readFileSync(LOG, 'utf8'), '', 'claude was never invoked');
check("repair.upstream-absent.nobackup", bakList(HOME, ".claude.json.bak.").length, 0, 'no backup because nothing was mutated');
// add still registers over an unpinned upstream (presence, not the state word)
resetLog();
const addUpstream = run(MCP_SH, ['add', '--yes', '--json']);
check('add.upstream-absent.exit', addUpstream.status, 0, 'add registers semble_code alongside the upstream server');
check('add.upstream-absent.call', readFileSync(LOG, 'utf8').split('|')[0],
  `mcp add-json semble_code -s user ${JSON.stringify(CORRECT_CFG)}`,
  'the exact approved argv');

// ── 17. purge-repo asserts the cache-root leaf ─────────────────────────────
// m5: without it, an overridden SEMBLE_CACHE_ROOT_CODE let purge-repo delete a
// 64-hex directory under ANY parent.
const EVIL_ROOT = join(BASE, 'not-semble-code');
const evilHash = sh(`sc_repo_hash "${REPO_B}"`).out;
mkdirSync(join(EVIL_ROOT, evilHash), { recursive: true });
writeFileSync(join(EVIL_ROOT, evilHash, 'keep.txt'), 'keep');
const evilPurge = run(CACHE_SH, ['purge-repo', '--repo', REPO_B, '--yes', '--json'], { SEMBLE_CACHE_ROOT_CODE: EVIL_ROOT });
check('purge.rootleaf.exit', evilPurge.status, 1, 'a code root whose leaf is not semble-code is refused');
check('purge.rootleaf.msg', evilPurge.out.includes("leaf must be 'semble-code'"), true, 'the guard names the leaf it required');
check('purge.rootleaf.kept',
  existsSync(join(EVIL_ROOT, evilHash, 'keep.txt')) ? readFileSync(join(EVIL_ROOT, evilHash, 'keep.txt'), 'utf8') : 'DELETED',
  'keep', 'the 64-hex directory under a foreign root is untouched');
check('purge.rootleaf.relative',
  run(CACHE_SH, ['purge-repo', '--repo', REPO_B, '--yes'], { SEMBLE_CACHE_ROOT_CODE: 'semble-code' }).status, 1,
  'a relative cache root is refused as well');

// ── 18. the two §6.2 deviations are documented, not silent ─────────────────
// m2: precedence (wrong_scope before stale_args) is the frozen contract.
const LIB_SRC = readFileSync(LIB, 'utf8');
check('deviation.notes.count', (LIB_SRC.match(/NOTE \(deviation from DESIGN §6\.2\)/g) || []).length, 2,
  'both §6.2 deviations carry a NOTE comment in the §3.2 style');
writeClaudeJson(FIXTURES.wrongscope_stale);
check('deviation.precedence', sh('sc_mcp_state').out, 'wrong_scope',
  'local scope + floating pin reports wrong_scope: precedence wins over the §6.2 definition');

// ── 19. sc_timeout: the bound is enforced with or without a timeout binary ──
// PATH cannot be trusted to lack `timeout` (every Linux has it) or to have it
// (stock macOS has neither), so the backend is pinned via SEMBLE_TIMEOUT_BIN.
const TBIN = join(BASE, 'tbin');
mkdirSync(TBIN, { recursive: true });
const TIMEOUT_STUB = join(TBIN, 'timeout');
const TIMEOUT_LOG = join(BASE, 'timeout-calls.log');
writeFileSync(TIMEOUT_STUB, `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${TIMEOUT_LOG}"
secs="$1"; shift
exec "$@"
`);
spawnSync('chmod', ['+x', TIMEOUT_STUB]);
writeFileSync(TIMEOUT_LOG, '');

check('timeout.backend.none', sh('sc_timeout_backend', { SEMBLE_TIMEOUT_BIN: 'none' }).out, 'none',
  'SEMBLE_TIMEOUT_BIN=none pins the pure-bash watchdog');
check('timeout.backend.stub', sh('sc_timeout_backend', { SEMBLE_TIMEOUT_BIN: TIMEOUT_STUB }).out, 'timeout',
  'an overridden binary is reported by its basename');
check('timeout.backend.missing', sh('sc_timeout_backend', { SEMBLE_TIMEOUT_BIN: '/no/such/gtimeout' }).out, 'none',
  'an override that is not executable falls back to the watchdog, never to an unbounded run');
check('timeout.path.none', sh('sc_timeout_path', { SEMBLE_TIMEOUT_BIN: 'none' }).out, '',
  'the watchdog has no backing binary path');
check('timeout.path.stub', sh('sc_timeout_path', { SEMBLE_TIMEOUT_BIN: TIMEOUT_STUB }).out, TIMEOUT_STUB,
  'the backing binary is reported by absolute path');

// Delegation to a real binary keeps every argument its own argv element.
const delegated = sh(`sc_timeout 42 printf '%s|%s\\n' 'semble[mcp]==0.5.4' two`,
  { SEMBLE_TIMEOUT_BIN: TIMEOUT_STUB });
check('timeout.delegate.stdout', delegated.out, 'semble[mcp]==0.5.4|two',
  'the wrapped command runs with its argv intact');
check('timeout.delegate.log', readFileSync(TIMEOUT_LOG, 'utf8'),
  "42 printf %s|%s\\n semble[mcp]==0.5.4 two\n",
  'the binary was invoked with the seconds first and the pin as one word');

// Elapsed IS the property under test here — "the watchdog waited out its bound"
// has no deterministic proxy — so the bound is asserted as a tolerance window,
// `Math.abs(elapsed - centre) <= tol`, never as a bare inequality.
//
// How the window is chosen, because a hand-picked one has been wrong here before
// (an earlier ceiling sat ~50 ms over the observed value and flaked):
//   floor — pinned to the CONTRACTED bound (1000 ms for `sc_timeout 1`), i.e.
//           tol is always centre minus the bound. A tol >= centre would admit
//           elapsed = 0 and turn the assertion into a wildcard, which is worse
//           than the inequality it replaced.
//   centre — the value the algorithm predicts, not a measurement. sc_timeout_watch
//           breaks on `SECONDS - t0 -gt secs`, and SECONDS counts WHOLE seconds
//           since shell start, so the kill lands one whole second past the bound,
//           plus the 0.1 s TERM->KILL grace: centre = (secs + 1) * 1000.
//   ceiling — centre + tol, ~1 s of headroom over the measured spread (12 runs:
//           `sc_timeout 1` 1963-2038 ms, `sc_timeout 2` 2790-3178 ms). Only a
//           load stall of nearly a second can trip it.
// The upper side is also pinned deterministically and independently of the clock:
// the watched command needs 600 s and drops a marker only if it runs to
// completion, so the marker's ABSENCE proves the watchdog cut it off at any
// machine speed, with no tolerance to tune.
{
  const marker = join(BASE, 'watch-ran-to-completion');
  const t0 = Date.now();
  const r = sh(`sc_timeout 1 sh -c 'sleep 600; : > ${marker}'`, { SEMBLE_TIMEOUT_BIN: 'none' });
  const elapsed = Date.now() - t0;
  check('timeout.watch.code', r.status, 124, 'the watchdog reports 124, the GNU timeout convention');
  check('timeout.watch.early', existsSync(marker), false,
    'the 600 s command never completed — the watchdog cut it off instead of waiting it out');
  check('timeout.watch.floor', Math.abs(elapsed - 2000) <= 1000, true,
    'it waited out its full 1 s bound before killing (1000-3000 ms): a watchdog that fires early is worse than none');
}
{
  // The bound is a parameter, not a constant: doubling it doubles the floor.
  const marker = join(BASE, 'watch-ran-to-completion-2');
  const t0 = Date.now();
  const r = sh(`sc_timeout 2 sh -c 'sleep 600; : > ${marker}'`, { SEMBLE_TIMEOUT_BIN: 'none' });
  const elapsed = Date.now() - t0;
  check('timeout.watch.scale.code', r.status, 124, 'a 2 s bound reports 124 the same way');
  check('timeout.watch.scale.early', existsSync(marker), false, 'and still cuts the command off');
  check('timeout.watch.scale.floor', Math.abs(elapsed - 3000) <= 1000, true,
    'a 2 s bound lands in 2000-4000 ms — the deadline tracks SECONDS, not a hardcoded interval');
}
{
  // Regression guard for the drift bug: the deadline is wall clock, not the sum
  // of the requested sleeps. Each poll forks /bin/sleep, so a slow fork used to
  // stretch a nominal bound without limit. A 1 s bound around a command that
  // sleeps 3 s must return well inside 3 s even though the poll backoff would
  // have accumulated only a fraction of that in "intended" sleep time.
  const t0 = Date.now();
  const r = sh("sc_timeout 1 sleep 3", { SEMBLE_TIMEOUT_BIN: 'none' });
  const elapsed = Date.now() - t0;
  check('timeout.watch.wallclock.code', r.status, 124, 'the 3 s sleep was cut short, not awaited');
  check('timeout.watch.wallclock.floor', Math.abs(elapsed - 2000) <= 1000, true,
    'and the full 1 s bound was honoured first, then cut short well inside the 3 s sleep (1000-3000 ms)');
}
{
  const t0 = Date.now();
  const r = sh('sc_timeout 30 printf ok', { SEMBLE_TIMEOUT_BIN: 'none' });
  const elapsed = Date.now() - t0;
  check('timeout.watch.fast.out', r.out, 'ok', 'stdout passes through the watchdog unchanged');
  check('timeout.watch.fast.code', r.status, 0, 'a command that finishes keeps its own exit code');
  check('timeout.watch.fast.elapsed', Math.abs(elapsed - 0) <= 1500, true,
    'a fast command is not slowed to anywhere near its 30 s bound');
}
check('timeout.watch.exitcode', sh('sc_timeout 30 sh -c "exit 7"', { SEMBLE_TIMEOUT_BIN: 'none' }).status, 7,
  'a non-zero exit is passed through, not rewritten to 124');
check('timeout.watch.stderr',
  sh('sc_timeout 30 sh -c "echo boom >&2" 2>&1', { SEMBLE_TIMEOUT_BIN: 'none' }).out, 'boom',
  'stderr passes through and job-control chatter never joins it');

// The whole process group dies: a grandchild that would outlive the child must
// never get to write its marker.
{
  const MARK = join(BASE, 'watchdog-grandchild.marker');
  const r = sh(`sc_timeout 1 bash -c '(sleep 3; touch "${MARK}") & sleep 5'; sleep 4`,
    { SEMBLE_TIMEOUT_BIN: 'none' });
  check('timeout.watch.group.code', r.status, 0, 'the trailing sleep makes the probe itself succeed');
  check('timeout.watch.group.marker', existsSync(MARK), false,
    'the grandchild died with the group instead of surviving the timeout');
}

// ── probe argv gate ────────────────────────────────────────────────────────
// `--version` reached semble's _CLI_DISPATCH_ARGS in 0.5.4. On an older pin it
// is unrecognised argv, which starts the blocking stdio server — so the argv is
// picked from the pin up front. A hang cannot be undone by a fallback, only by
// never issuing it. Exact strings on purpose: a wildcard here would accept the
// hanging argv on an old pin, which is the whole failure this gate prevents.
check('probearg.pin', sh('printf %s "$SEMBLE_PIN_VERSION"').out, '0.5.4',
  'the shipped pin is 0.5.4');
check('probearg.default', sh('sc_semble_probe_arg').out, '--version',
  'the shipped pin dispatches --version');
for (const [v, want] of [
  ['0.5.4', '--version'], ['0.5.5', '--version'], ['0.6.0', '--version'], ['1.0.0', '--version'],
  ['0.5.3', '--help'], ['0.5.2', '--help'], ['0.4.9', '--help'], ['0.5.10', '--version'],
  ['', '--help'], ['0.5', '--help'], ['garbage', '--help'], ['0.5.x', '--help'],
]) {
  check(`probearg.${v || 'empty'}`, sh(`sc_semble_probe_arg '${v}'`).out, want,
    `pin ${v || '(empty)'} probes with ${want}`);
}
check('probearg.override', sh('sc_semble_probe_arg', { SEMBLE_PIN_VERSION: '0.5.2' }).out, '--help',
  'a SEMBLE_PIN_VERSION override back to 0.5.2 must NOT issue the hanging --version');

// ── report ─────────────────────────────────────────────────────────────────
console.log('suite-core.mjs (unit B: lib + mcp + cache + state)');
for (const line of results) console.log(line);
console.log(`  ${passed} passed, ${failed} failed`);
rmSync(BASE, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
