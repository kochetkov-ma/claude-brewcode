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

const PIN = 'semble[mcp]==0.5.2';

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
  args: ['--from', PIN, 'semble', '--content', 'code', 'config'],
  env: { SEMBLE_CACHE_LOCATION: CODE_ROOT },
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
  wrongscope_stale: 'wrong_scope',
  duplicate: 'duplicate', upstream: 'upstream_unpinned', malformed: 'malformed',
};
for (const name of Object.keys(FIXTURES)) {
  writeClaudeJson(FIXTURES[name]);
  check(`mcpstate.${name}`, sh('sc_mcp_state').out, EXPECTED_STATE[name], `${name}.json -> ${EXPECTED_STATE[name]}`);
}

// ── 5. the exact registration command ──────────────────────────────────────
writeClaudeJson(FIXTURES.absent);
const EXPECTED_ADD = `${STUB} mcp add semble_code -s user -e SEMBLE_CACHE_LOCATION=${CODE_ROOT} -- uvx --from '${PIN}' semble --content code config`;
check('addcmd.exact', sh('sc_mcp_add_cmd').out, EXPECTED_ADD, 'whole-string equality with DESIGN 6.1, pin single-quoted');
check('addjson.payload', json(sh('sc_mcp_addjson_payload')), CORRECT_CFG, 'add-json payload deep-equals the approved config');

// ── 6. detect --json ───────────────────────────────────────────────────────
writeClaudeJson(FIXTURES.correct);
const detCorrect = json(run(MCP_SH, ['detect', '--json']));
check('detect.correct.state', detCorrect.state, 'correct', 'detect reports the matrix word');
check('detect.correct.diff', detCorrect.diff, [], 'no diff entries when the config matches');
check('detect.correct.expected', detCorrect.expected, { command: 'uvx', args: CORRECT_CFG.args, env: CORRECT_CFG.env }, 'expected block is the approved form');
check('detect.correct.conn', detCorrect.connectivity, 'connected', 'connectivity comes from `claude mcp get` exit status only');
check('detect.correct.schema', detCorrect.schema, 1, 'detect --json carries schema 1');

writeClaudeJson(FIXTURES.stale);
const detStale = json(run(MCP_SH, ['detect', '--json']));
check('detect.stale.state', detStale.state, 'stale_args', 'floating pin is detected as stale_args');
check('detect.stale.diff.fields', detStale.diff.map((d) => d.field), ['args', 'env.SEMBLE_CACHE_LOCATION'], 'diff names exactly the two wrong fields');
check('detect.stale.diff.expectedArgs', detStale.diff[0].expected, CORRECT_CFG.args.join(' '), 'diff carries the exact expected args');

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
check('add.yes.call', readFileSync(LOG, 'utf8'),
  `mcp add semble_code -s user -e SEMBLE_CACHE_LOCATION=${CODE_ROOT} -- uvx --from ${PIN} semble --content code config|phase=awaiting_reload\n`,
  'exact recorded argv AND phase=awaiting_reload observed at call time (checkpoint precedes the add)');
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

// add-json fallback when `claude mcp add` fails
writeClaudeJson(FIXTURES.absent);
resetProject();
resetLog();
const addFail = run(MCP_SH, ['add', '--yes', '--json'], { SEMBLE_STUB_RC: '1' });
check('add.retry.exit', addFail.status, 1, 'both add and add-json failing -> exit 1');
check('add.retry.status', json(addFail).status, 'failed', 'reports failed');
check('add.retry.calls', readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => l.split(' ')[1]),
  ['add', 'add-json'], 'add is retried exactly once with add-json');
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
check('state.unknownkey.version', afterPatch.approvedVersion, '0.5.2', 'approvedVersion is the pin');

resetProject();
const illegal = run(STATE_SH, ['phase', 'ready']);
check('state.illegal.exit', illegal.status, 1, 'absent -> ready is refused');
check('state.illegal.msg', illegal.out.includes('illegal phase transition'), true, 'the refusal names the transition');
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
  `mcp add semble_code -s user -e SEMBLE_CACHE_LOCATION=${CODE_ROOT} -- uvx --from ${PIN} semble --content code config`,
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
const delegated = sh(`sc_timeout 42 printf '%s|%s\\n' 'semble[mcp]==0.5.2' two`,
  { SEMBLE_TIMEOUT_BIN: TIMEOUT_STUB });
check('timeout.delegate.stdout', delegated.out, 'semble[mcp]==0.5.2|two',
  'the wrapped command runs with its argv intact');
check('timeout.delegate.log', readFileSync(TIMEOUT_LOG, 'utf8'),
  "42 printf %s|%s\\n semble[mcp]==0.5.2 two\n",
  'the binary was invoked with the seconds first and the pin as one word');

{
  const t0 = Date.now();
  const r = sh('sc_timeout 1 sleep 5', { SEMBLE_TIMEOUT_BIN: 'none' });
  const elapsed = Date.now() - t0;
  check('timeout.watch.code', r.status, 124, 'the watchdog reports 124, the GNU timeout convention');
  // Bash startup + a 100 ms TERM->KILL grace sit on top of the 1 s bound.
  check('timeout.watch.elapsed', Math.abs(elapsed - 1350) <= 700, true,
    'it returns at ~1.35 s (+/-0.7), not after the full 5 s sleep');
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

// ── report ─────────────────────────────────────────────────────────────────
console.log('suite-core.mjs (unit B: lib + mcp + cache + state)');
for (const line of results) console.log(line);
console.log(`  ${passed} passed, ${failed} failed`);
rmSync(BASE, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
