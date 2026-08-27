#!/usr/bin/env node
// suite-project.mjs — brewcode:semble-setup unit C.
// Covers semble-project.sh (audit/warm/smoke/enable/disable/reindex), semble-remove.sh
// (integration/mcp/cli/purge) and the §12.3 full-lifecycle integration test.
// Self-contained: inlines its own check()/run() helpers, builds every fixture in a temp
// base, and never touches the real HOME, the real cache or the repo working tree.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(HERE, '..', 'scripts');
const PROJECT_SH = join(SCRIPTS, 'semble-project.sh');
const REMOVE_SH = join(SCRIPTS, 'semble-remove.sh');
const STATE_SH = join(SCRIPTS, 'semble-state.sh');
const MCP_SH = join(SCRIPTS, 'semble-mcp.sh');
const GUIDANCE_SH = join(SCRIPTS, 'semble-guidance.sh');
const STATUS_SH = join(SCRIPTS, 'semble-status.sh');

const PIN_SPEC = 'semble[mcp]==0.5.5';
const SERVER = 'semble_code';

// GIVEN: a fresh isolated temp base. realpathSync mirrors the `cd && pwd -P`
// resolution every script does, so every expected path below is the resolved one.
// The cache roots keep their production leaf names — the rm guards require them.
const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'semble-c-')));
const HOME = join(BASE, 'home');
const CACHE_CODE = join(BASE, 'semble-code');
const CACHE_BASE = process.platform === 'darwin' ? join(HOME, 'Library', 'Caches') : join(HOME, '.cache');
const LEGACY_DOCS_ROOT = join(CACHE_BASE, 'semble-docs');
const BIN = join(BASE, 'bin');
const CLAUDE_LOG = join(BASE, 'claude-calls.log');
const CLAUDE_STUB = join(BIN, 'claude');

let passed = 0;
let failed = 0;
const results = [];

// ── deep-equal primitive (utility, not test-body branching) ──────────────────
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
  const ok = deepEqual(actual, expected);
  if (ok) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
  } else {
    failed++;
    results.push(
      `  FAIL  ${name}  (${message} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`,
    );
  }
}

// ── process runner ───────────────────────────────────────────────────────────
function run(script, args, env) {
  const r = spawnSync(script, args, {
    encoding: 'utf8',
    env: { ...process.env, ...baseEnv(), ...env },
    timeout: 60000,
  });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

function baseEnv() {
  return {
    SEMBLE_TEST_HOME: HOME,
    SEMBLE_CACHE_ROOT_CODE: CACHE_CODE,
    SEMBLE_CLAUDE_BIN: CLAUDE_STUB,
    SEMBLE_NO_NETWORK: '1',
    PATH: `${BIN}:${process.env.PATH}`,
  };
}

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return { __PARSE_ERROR__: String(e), raw: str };
  }
}

// ── fixture helpers ──────────────────────────────────────────────────────────
function write(p, body) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
  return p;
}

function sha(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

function shaStr(s) {
  return createHash('sha256').update(s).digest('hex');
}

// Byte total of every regular file under root — mirrors sp_dir_size.
function dirSize(root) {
  let n = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) n += statSync(p).size;
    }
  };
  walk(root);
  return n;
}

// { "<relative path>": "<sha256>" } for every regular file under root, sorted.
function snapshot(root) {
  const out = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) out[relative(root, p)] = sha(p);
    }
  };
  walk(root);
  return out;
}

function repoHash(p) {
  const r = spawnSync('bash', ['-c', `cd "${p}" && pwd -P`], { encoding: 'utf8' });
  return createHash('sha256').update(r.stdout.trim()).digest('hex');
}

function stateOf(projectRoot) {
  const f = join(projectRoot, '.claude', 'semble', 'state.json');
  return existsSync(f) ? safeParse(readFileSync(f, 'utf8')) : { __ABSENT__: true };
}

// The §12.3 phase ladder every project fixture climbs: create the state file and
// walk it to `upto` through the only legal chain. Each rung is returned so a
// caller can still assert on the exact step it cares about. Same contract as
// suite-integration.mjs's seedState, whose ladder starts from a real MCP
// registration instead - move both to a shared test helper when one exists.
function seedState(env, upto = 'ready') {
  const rungs = { init: run(STATE_SH, ['init'], env) };
  if (upto === 'init') return rungs;
  rungs.prereq_ready = run(STATE_SH, ['phase', 'prereq_ready'], env);
  if (upto === 'prereq_ready') return rungs;
  rungs.awaiting_reload = run(STATE_SH, ['phase', 'awaiting_reload'], env);
  if (upto === 'awaiting_reload') return rungs;
  rungs.verifying = run(STATE_SH, ['phase', 'verifying'], env);
  if (upto === 'verifying') return rungs;
  rungs.ready = run(STATE_SH, ['phase', 'ready'], env);
  return rungs;
}

// A `claude` stub: logs the exact argv line and emulates mcp add/add-json/remove
// against the injected HOME, so no real registration ever happens.
function installClaudeStub() {
  mkdirSync(BIN, { recursive: true });
  const body = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${CLAUDE_LOG}"
CJ="${HOME}/.claude.json"
if [ "$1" = "--version" ]; then echo "2.1.223 (Claude Code)"; exit 0; fi
if [ "$1" = "mcp" ]; then
  case "$2" in
    add|add-json)
      CJ="$CJ" CACHE="${CACHE_CODE}" node -e '
const fs=require("fs");const f=process.env.CJ;
let j={};try{j=JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){j={}}
j.mcpServers=j.mcpServers||{};
j.mcpServers["${SERVER}"]={type:"stdio",command:"uvx",
  args:["--from","${PIN_SPEC}","semble","--content","code","docs","config"],
  env:{SEMBLE_CACHE_LOCATION:process.env.CACHE},alwaysLoad:true};
fs.writeFileSync(f,JSON.stringify(j,null,2)+"\\n");'
      echo "Added stdio MCP server ${SERVER} to user config"; exit 0 ;;
    remove)
      CJ="$CJ" node -e '
const fs=require("fs");const f=process.env.CJ;
let j={};try{j=JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){j={}}
if(j.mcpServers)delete j.mcpServers["${SERVER}"];
fs.writeFileSync(f,JSON.stringify(j,null,2)+"\\n");'
      echo "Removed MCP server ${SERVER}"; exit 0 ;;
    list) echo "${SERVER}: uvx --from ${PIN_SPEC} semble --content code docs config - connected"; exit 0 ;;
    get) echo "${SERVER}: connected"; exit 0 ;;
  esac
fi
exit 0
`;
  writeFileSync(CLAUDE_STUB, body);
  chmodSync(CLAUDE_STUB, 0o755);
}

function claudeCalls() {
  return existsSync(CLAUDE_LOG)
    ? readFileSync(CLAUDE_LOG, 'utf8').split('\n').filter((s) => s.length > 0)
    : [];
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Coverage classification (§7)
// ═══════════════════════════════════════════════════════════════════════════
const COV = join(BASE, 'repo-cov');
const PAD = 'x'.repeat(200); // keeps every fixture file over the 128-byte floor

write(join(COV, 'src/a.py'), `def main():\n    return 1\n# ${PAD}\n`);
write(join(COV, 'src/b.ts'), `export const x = 1;\n// ${PAD}\n`);
write(join(COV, 'build.gradle'), `plugins { id "java" }\n// ${PAD}\n`);
write(join(COV, 'settings.gradle.kts'), `rootProject.name = "x"\n// ${PAD}\n`);
write(join(COV, 'ci.groovy'), `pipeline { }\n// ${PAD}\n`);
write(join(COV, 'nginx.conf'), `server { listen 80; }\n# ${PAD}\n`);
write(join(COV, 'app.properties'), `key=value\n# ${PAD}\n`);
write(join(COV, 'ci.yaml'), `on: push\n# ${PAD}\n`);
write(join(COV, 'index.html'), `<html><body>${PAD}</body></html>\n`);
write(join(COV, 'legacy.htm'), `<html><body>${PAD}</body></html>\n`);
write(join(COV, 'README.md'), `# readme\n${PAD}\n`);
write(join(COV, 'package.json'), `{"name":"x","description":"${PAD}"}\n`);
write(join(COV, 'data.csv'), `a,b\n${PAD},${PAD}\n`);
write(join(COV, 'Dockerfile'), `FROM alpine\n# ${PAD}\n`);
write(join(COV, 'tiny.py'), 'x=1\n');
write(join(COV, 'blank.py'), '   \n\n');
write(join(COV, 'huge.py'), `# ${'y'.repeat(1000001)}\n`);
write(join(COV, 'node_modules/skip.py'), `import os\n# ${PAD}\n`);
write(join(COV, '.git/skip.py'), `import os\n# ${PAD}\n`);
symlinkSync(join(COV, 'src/a.py'), join(COV, 'link.py'));

const cov = safeParse(run(PROJECT_SH, ['audit', '--json'], { SEMBLE_PROJECT_ROOT: COV }).stdout).coverage;

check('coverage.code', cov.code,
  { '.conf': 1, '.gradle': 1, '.groovy': 1, '.kts': 1, '.py': 2, '.ts': 1 },
  'gradle/groovy/kts/conf are code (FACTS #3); tiny.py counted, blank.py and huge.py skipped');
check('coverage.config', cov.config, { '.properties': 1, '.yaml': 1 },
  'properties + yaml are the config bucket');
check('coverage.docsOnly', cov.docsOnly, { '.htm': 1, '.html': 1, '.md': 1 },
  'html/htm/md land in the docs bucket, which IS part of the code docs config corpus');
check('coverage.excluded', cov.excluded, { '.csv': 1, '.json': 1 },
  'json and csv are excluded from every content type');
check('coverage.totals', cov.totals,
  { code: 7, config: 2, docsOnly: 3, excluded: 2, indexable: 12, classified: 16, unclassified: 0 },
  'exact per-bucket totals for repo-cov');
check('coverage.skipped', cov.skipped, { tooLarge: 1, tinyBlank: 1, symlinks: 1, dirs: 2 },
  '>1MB skipped, <128B blank skipped, symlink not followed, node_modules + .git never walked');
check('coverage html not in code', Object.prototype.hasOwnProperty.call(cov.code, '.html'), false,
  '.html never appears in the code bucket');
check('coverage json not in config', Object.prototype.hasOwnProperty.call(cov.config, '.json'), false,
  '.json never appears in the config bucket');

const auditFull = safeParse(run(PROJECT_SH, ['audit', '--json'], { SEMBLE_PROJECT_ROOT: COV }).stdout);
check('audit disclosure', auditFull.disclosure.includes(
  'This corpus is code+docs+config, so .md/.markdown, .rst, .adoc and .html/.htm ARE'), true,
  'audit --json carries the corrected corpus disclosure verbatim');
check('audit disclosure mdx', auditFull.disclosure.includes('.mdx'), true,
  'the disclosure names .mdx as unreachable — it is absent from semble\'s extension table');
check('audit is read-only', existsSync(join(COV, '.claude')), false,
  'audit wrote nothing into the project');

// ═══════════════════════════════════════════════════════════════════════════
// 1b. candidates — measured per-repo .sembleignore proposals
//
// The shipped template's per-repo section is empty because the two things that
// actually waste result slots are layout-specific. This mode measures them.
// Every assertion here is about what it must NOT propose as much as what it
// must: a wrong exclusion fails silently, and silence is the worse error.
// ═══════════════════════════════════════════════════════════════════════════
const CAND = join(BASE, 'repo-cand');
for (let i = 0; i < 10; i++) {
  const body = `export function f${i}() {\n  return ${i};\n}\n${PAD}\n`;
  write(join(CAND, 'src', `m${i}.ts`), body);
  write(join(CAND, '.mirror', `m${i}.ts`), body);        // byte-identical mirror
  write(join(CAND, 'lib', `u${i}.ts`), `${body}// unique ${i}\n`);
}
write(join(CAND, 'CHANGELOG.md'), '- one release note line\n'.repeat(6000));
write(join(CAND, 'notes', 'a.md'), `# a\n${PAD}\n`);

const candR = run(PROJECT_SH, ['candidates', '--json'], { SEMBLE_PROJECT_ROOT: CAND });
const cand = safeParse(candR.stdout);
const byPath = Object.fromEntries((cand.candidates || []).map((c) => [c.path, c]));
check('candidates.exit', candR.status, 0, 'the scan exits 0');
check('candidates.source', cand.source, 'filesystem',
  'with no index on disk the scan says outright that it is standing on byte share');
check('candidates.mirror', (byPath['/.mirror/'] || {}).kind, 'duplicate-tree',
  'a tree whose every file is a byte-identical copy of a file elsewhere is proposed');
check('candidates.mirrorCount', [(byPath['/.mirror/'] || {}).files, (byPath['/.mirror/'] || {}).duplicates],
  [10, 10], 'the proposal carries the count it is based on, not an adjective');
check('candidates.notSrc', Object.prototype.hasOwnProperty.call(byPath, '/src/'), false,
  'the ORIGINAL of the mirrored pair is never proposed - excluding it would delete the repo from the corpus');
check('candidates.notLib', Object.prototype.hasOwnProperty.call(byPath, '/lib/'), false,
  'a tree of near-but-not-byte-identical files is not a duplicate tree and is left alone');
check('candidates.changelog', (byPath['/CHANGELOG.md'] || {}).kind, 'heavy-file',
  'one prose file carrying a large share of the corpus is proposed on its own');
check('candidates.noCode', (cand.candidates || []).filter((c) => c.kind === 'heavy-dir' && c.path === '/lib/'), [],
  'a SOURCE directory is never proposed as a corpus hog - a big source tree is the repo, not noise');
check('candidates.evidence', (cand.candidates || []).every((c) => typeof c.reason === 'string' && /\d/.test(c.reason)), true,
  'every proposal states its measurement so the user can judge it');
check('candidates.shares',
  (cand.candidates || []).filter((c) => !(c.share > 0 && c.share <= 1)).map((c) => [c.path, c.share]), [],
  'every share is a real fraction of the corpus - any out-of-range one is named, not just counted');
check('candidates.readOnly', existsSync(join(CAND, '.sembleignore')), false,
  'the scan proposes and writes nothing - install owns the file');

// A repo with no mirror and no hog must come back empty, or the block install
// writes becomes noise and stops being read.
const PLAIN = join(BASE, 'repo-plain');
for (let i = 0; i < 6; i++) write(join(PLAIN, 'src', `p${i}.ts`), `export const p${i} = ${i};\n${PAD}\n`);
const plain = safeParse(run(PROJECT_SH, ['candidates', '--json'], { SEMBLE_PROJECT_ROOT: PLAIN }).stdout);
check('candidates.plainEmpty', plain.candidates, [],
  'an ordinary repo yields no proposals at all');
check('candidates.plainScanned', plain.scanned, 6, 'and the scan still reports what it looked at');

const candHuman = run(PROJECT_SH, ['candidates'], { SEMBLE_PROJECT_ROOT: PLAIN });
check('candidates.humanExit', candHuman.status, 0, 'the human form exits 0 too');
check('candidates.humanEmpty', candHuman.stdout.includes('none - nothing in this repo'), true,
  'and says so in words rather than printing an empty list');

// ═══════════════════════════════════════════════════════════════════════════
// 2. warm / smoke honour SEMBLE_NO_NETWORK
// ═══════════════════════════════════════════════════════════════════════════
const warm = run(PROJECT_SH, ['warm', '--json'], { SEMBLE_PROJECT_ROOT: COV });
const warmJson = safeParse(warm.stdout);
check('warm exit', warm.status, 3,
  'a skipped warm proves nothing was indexed: exit 3 = precondition unmet, never 0');
check('warm status', warmJson.status, 'skipped', 'SEMBLE_NO_NETWORK=1 -> skipped');
check('warm reason', warmJson.reason, 'SEMBLE_NO_NETWORK=1', 'the skip reason is explicit');
check('warm query', warmJson.query, 'entry point main function', 'default warm query');
check('warm command', warmJson.command,
  `SEMBLE_CACHE_LOCATION=${CACHE_CODE} uvx --from '${PIN_SPEC}' semble search `
  + `"entry point main function" "${COV}" --content code docs config -k 5 --max-snippet-lines 10`,
  'the exact §8.6 command line, pin shell-quoted');

const smoke = run(PROJECT_SH, ['smoke', '--query', 'auth handler', '--json'], { SEMBLE_PROJECT_ROOT: COV });
const smokeJson = safeParse(smoke.stdout);
check('smoke exit', smoke.status, 3, 'a skipped smoke is not a verification: exit 3, same predicate as warm');
check('smoke status', smokeJson.status, 'skipped', 'SEMBLE_NO_NETWORK=1 -> skipped');
check('smoke shape', Object.keys(smokeJson).sort(),
  ['command', 'durationMs', 'exit', 'firstResult', 'query', 'reason', 'resultCount', 'schema', 'status'],
  'smoke --json carries the §9.6 keys');
check('smoke query override', smokeJson.query, 'auth handler', '--query is honoured');

// ═══════════════════════════════════════════════════════════════════════════
// 2b. the real search path is bounded by sc_timeout, with or without a
// timeout binary. uvx is stubbed in a dedicated bin dir prepended to PATH so
// the rest of the suite still runs with no uvx at all; SP_SEARCH_TIMEOUT is
// dialled down from its production 600 s and the backend is pinned, because
// PATH cannot be trusted to have (macOS) or lack (Linux) `timeout`.
// ═══════════════════════════════════════════════════════════════════════════
const UVX_BIN = join(BASE, 'uvxbin');
const UVX_STUB = join(UVX_BIN, 'uvx');
const UVX_ENV_LOG = join(BASE, 'uvx-env.log');
const HANG_MARKER = join(BASE, 'uvx-outlived-the-bound.marker');
const TIMEOUT_STUB = join(UVX_BIN, 'timeout-stub');
const TIMEOUT_LOG = join(BASE, 'search-timeout-calls.log');

function writeExec(p, body) {
  write(p, body);
  chmodSync(p, 0o755);
  return p;
}

// A uvx that records the injected cache location, then either answers or hangs.
writeExec(UVX_STUB, `#!/usr/bin/env bash
printf '%s\\n' "\${SEMBLE_CACHE_LOCATION:-<unset>}" >> "${UVX_ENV_LOG}"
if [ "\${UVX_STUB_MODE}" = "hang" ]; then
  sleep 30
  : > "${HANG_MARKER}"
  exit 0
fi
printf '%s' '{"results":[{"file_path":"src/main.py","start_line":3,"end_line":9,"score":0.75,"content":"x"}]}'
`);
writeExec(TIMEOUT_STUB, `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${TIMEOUT_LOG}"
secs="$1"; shift
exec "$@"
`);
writeFileSync(UVX_ENV_LOG, '');
writeFileSync(TIMEOUT_LOG, '');

const SEARCH_ENV = {
  SEMBLE_PROJECT_ROOT: COV,
  SEMBLE_NO_NETWORK: '',
  PATH: `${UVX_BIN}:${BIN}:${process.env.PATH}`,
};

// WHEN: the stubbed uvx answers — the wrapper must not disturb the happy path.
const okRun = run(PROJECT_SH, ['smoke', '--query', 'bounded ok', '--json'],
  { ...SEARCH_ENV, SEMBLE_TIMEOUT_BIN: 'none', SP_SEARCH_TIMEOUT: '30' });
const okJson = safeParse(okRun.stdout);
check('search.ok.exit', okRun.status, 0, 'a search that answers exits 0');
check('search.ok.status', okJson.status, 'ok', 'the stubbed results parse as ok');
check('search.ok.count', okJson.resultCount, 1, 'the single stubbed result is counted');
check('search.ok.first', okJson.firstResult,
  { file_path: 'src/main.py', start_line: 3, end_line: 9, score: 0.75 },
  'the first result survives the sc_timeout wrapper intact');
check('search.ok.cache-env', readFileSync(UVX_ENV_LOG, 'utf8'), `${CACHE_CODE}\n`,
  'SEMBLE_CACHE_LOCATION reaches the child even though sc_timeout is a shell function');

// WHEN: a real timeout binary backs sc_timeout — same shape, one argv element per arg.
writeFileSync(UVX_ENV_LOG, '');
const okBin = run(PROJECT_SH, ['smoke', '--query', 'bounded ok', '--json'],
  { ...SEARCH_ENV, SEMBLE_TIMEOUT_BIN: TIMEOUT_STUB, SP_SEARCH_TIMEOUT: '30' });
check('search.bin.status', safeParse(okBin.stdout).status, 'ok',
  'the binary backend runs the same search');
check('search.bin.log', readFileSync(TIMEOUT_LOG, 'utf8'),
  `30 env SEMBLE_CACHE_LOCATION=${CACHE_CODE} uvx --from ${PIN_SPEC} semble search `
  + `bounded ok ${COV} --content code docs config -k 5 --max-snippet-lines 10\n`,
  'the bound goes first and the env prefix is passed as argv, not as a shell string');
check('search.bin.cache-env', readFileSync(UVX_ENV_LOG, 'utf8'), `${CACHE_CODE}\n`,
  'the binary backend injects the cache location too');

// WHEN: uvx wedges and NO timeout binary exists — the bound must still fire.
{
  const t0 = Date.now();
  const hung = run(PROJECT_SH, ['warm', '--json'],
    { ...SEARCH_ENV, SEMBLE_TIMEOUT_BIN: 'none', SP_SEARCH_TIMEOUT: '2', UVX_STUB_MODE: 'hang' });
  const elapsed = Date.now() - t0;
  const hungJson = safeParse(hung.stdout);
  check('search.hang.exit', hung.status, 3, 'warm reports 3 when the search does not succeed');
  check('search.hang.code', hungJson.exit, 124, 'the watchdog 124 is carried into the report');
  check('search.hang.status', hungJson.status, 'failed', 'a timed-out search is a failure, not a skip');
  check('search.hang.reason', hungJson.reason, 'semble search exited 124',
    'the exit code is named in the reason');
  // 2 s bound + bash/node startup + the 100 ms TERM->KILL grace.
  check('search.hang.elapsed', Math.abs(elapsed - 2600) <= 1400, true,
    'it returns at ~2.6 s (+/-1.4), not after the stub 30 s sleep');
  check('search.hang.marker', existsSync(HANG_MARKER), false,
    'the wedged uvx was killed instead of outliving its bound');
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. reindex — guards, --yes, blast radius
// ═══════════════════════════════════════════════════════════════════════════
const RIDX = join(BASE, 'repo-reindex');
write(join(RIDX, 'src/main.py'), `def main():\n    return 1\n# ${PAD}\n`);
const RIDX_HASH = repoHash(RIDX);
const RIDX_DIR = join(CACHE_CODE, RIDX_HASH);
const SIBLING_HASH = 'b'.repeat(64);
const SIBLING_DIR = join(CACHE_CODE, SIBLING_HASH);
const NOT_A_HASH_DIR = join(CACHE_CODE, 'not-a-hash');

for (const d of [RIDX_DIR, SIBLING_DIR]) {
  write(join(d, 'index-code-config-docs/chunks.json'), '[]\n');
  write(join(d, 'index-code-config-docs/metadata.json'), JSON.stringify({ root_path: d, time: 1, content_type: ['code', 'docs', 'config'], cache_version: 1, files: {} }));
  write(join(d, 'index-code-config-docs/bm25_index/data'), 'bm25\n');
  write(join(d, 'index-code-config-docs/semantic_index/data'), 'vec\n');
}
write(NOT_A_HASH_DIR + '/keep.txt', 'not a repo dir\n');
write(join(CACHE_CODE, 'savings.jsonl'), '{"tokens":1}\n');

const siblingBefore = snapshot(SIBLING_DIR);
const noYes = run(PROJECT_SH, ['reindex', '--json'], { SEMBLE_PROJECT_ROOT: RIDX });
check('reindex without --yes exit', noYes.status, 4, 'exit 4 = confirmation required');
check('reindex without --yes keeps the dir', existsSync(RIDX_DIR), true, 'nothing was deleted');
const RIDX_INDEX = join(RIDX_DIR, 'index-code-config-docs');
check('reindex without --yes plan', safeParse(noYes.stdout).wouldDelete, [RIDX_INDEX],
  'it names only the selected content variant it would replace');

check('reindex without --yes command order', safeParse(noYes.stdout).commands.length, 2,
  'the plan is two commands: the staged rebuild, then the delete');
check('reindex without --yes rebuilds before deleting',
  safeParse(noYes.stdout).commands[1], `replace ${RIDX_INDEX}`,
  'the variant replacement is the SECOND command — the staged rebuild runs first');

// SS03: the live index survives a reindex whose warm cannot run. Before the
// fix this deleted the index, printed `ok`, and left phase=ready.
const ridxBefore = snapshot(RIDX_DIR);
const ridxBytes = dirSize(RIDX_DIR);
const yes = run(PROJECT_SH, ['reindex', '--yes', '--json'], { SEMBLE_PROJECT_ROOT: RIDX });
const yesJson = safeParse(yes.stdout);
check('reindex --yes exit', yes.status, 3,
  'a rebuild that never rebuilt is exit 3, not 0');
check('reindex --yes status', yesJson.status, 'skipped',
  'the report says skipped, never ok');
check('reindex --yes kept the repo dir', snapshot(RIDX_DIR), ridxBefore,
  'the live <code root>/<64-hex> index is byte-identical — nothing was deleted');
check('reindex --yes changed nothing', yesJson.changed, [],
  'no change is claimed');
check('reindex --yes says why the index was kept', yesJson.unchanged, [
  `cache: ${RIDX_INDEX} kept (${ridxBytes} bytes) — the staged rebuild never answered, so nothing was replaced`,
  'state: phase and completed steps unchanged',
], 'both the kept index and the untouched state are reported in words');
check('reindex left the sibling repo dir', snapshot(SIBLING_DIR), siblingBefore,
  'a second repo index is byte-identical afterwards');
check('reindex left non-hash entries', snapshot(NOT_A_HASH_DIR), { 'keep.txt': sha(NOT_A_HASH_DIR + '/keep.txt') },
  'a non-64-hex directory under the code root is never touched');
check('reindex left savings.jsonl', existsSync(join(CACHE_CODE, 'savings.jsonl')), true,
  'the root-level savings file survives a per-repo rebuild');
check('reindex warm skipped', yesJson.warm.status, 'skipped', 'warm is skipped under SEMBLE_NO_NETWORK=1');
check('reindex left no staging dir',
  readdirSync(CACHE_CODE).filter((n) => n.startsWith('.staging')), [],
  'the staging cache root is removed on the way out');

// ── 3b. the staged rebuild really replaces the index ────────────────────────
// A uvx that builds a cache under $SEMBLE_CACHE_LOCATION exactly as semble
// does — repo dir named sha256(project root) — and then answers the query.
const BUILD_BIN = join(BASE, 'buildbin');
writeExec(join(BUILD_BIN, 'uvx'), `#!/usr/bin/env bash
root="$6"
h=$(printf '%s' "$root" | shasum -a 256 | cut -d' ' -f1)
d="\${SEMBLE_CACHE_LOCATION}/$h/index-code-config-docs"
mkdir -p "$d/bm25_index" "$d/semantic_index"
printf '[]\\n' > "$d/chunks.json"
printf '{"cache_version":1}\\n' > "$d/metadata.json"
printf 'rebuilt\\n' > "$d/bm25_index/data"
printf 'rebuilt\\n' > "$d/semantic_index/data"
printf '%s' '{"results":[{"file_path":"src/main.py","start_line":1,"end_line":2,"score":0.9,"content":"x"}]}'
`);

const RIDX2 = join(BASE, 'repo-reindex-ok');
write(join(RIDX2, 'src/main.py'), `def main():\n    return 1\n# ${PAD}\n`);
const RIDX2_DIR = join(CACHE_CODE, repoHash(RIDX2));
write(join(RIDX2_DIR, 'index-code-config-docs/chunks.json'), '[]\n');
write(join(RIDX2_DIR, 'index-code-config-docs/stale-marker'), 'the variant that must be replaced\n');
write(join(RIDX2_DIR, 'index/chunks.json'), '[]\n');
write(join(RIDX2_DIR, 'index/metadata.json'), JSON.stringify({ content_type: ['code'] }));
write(join(RIDX2_DIR, 'index/code-only-marker'), 'keep this sibling\n');
const ridx2CodeBefore = snapshot(join(RIDX2_DIR, 'index'));
const ridx2Env = { SEMBLE_PROJECT_ROOT: RIDX2 };
seedState(ridx2Env);

const built = run(PROJECT_SH, ['reindex', '--yes', '--json'], {
  ...ridx2Env,
  SEMBLE_NO_NETWORK: '',
  SEMBLE_TIMEOUT_BIN: 'none',
  SP_SEARCH_TIMEOUT: '30',
  PATH: `${BUILD_BIN}:${BIN}:${process.env.PATH}`,
});
const builtJson = safeParse(built.stdout);
check('reindex.built.exit', built.status, 0, 'a proven rebuild exits 0');
check('reindex.built.status', builtJson.status, 'ok', 'and reports ok');
check('reindex.built.warm', builtJson.warm.status, 'ok', 'because the staged warm answered');
check('reindex.built.index', snapshot(RIDX2_DIR), {
  'index-code-config-docs/bm25_index/data': shaStr('rebuilt\n'),
  'index-code-config-docs/chunks.json': shaStr('[]\n'),
  'index-code-config-docs/metadata.json': shaStr('{"cache_version":1}\n'),
  'index-code-config-docs/semantic_index/data': shaStr('rebuilt\n'),
  'index/chunks.json': shaStr('[]\n'),
  'index/code-only-marker': shaStr('keep this sibling\n'),
  'index/metadata.json': shaStr(JSON.stringify({ content_type: ['code'] })),
}, 'the current variant is swapped while the code-only sibling remains byte-identical');
check('reindex.built.sibling-preserved', snapshot(join(RIDX2_DIR, 'index')), ridx2CodeBefore,
  'reindex never evicts a distinct code-only variant');
check('reindex.built.phase', [builtJson.phase, stateOf(RIDX2).phase], ['ready', 'ready'],
  'phase reaches ready only on a rebuild that happened');
check('reindex.built.no staging residue',
  readdirSync(CACHE_CODE).filter((n) => n.startsWith('.staging')), [],
  'the staging root is gone once the swap is done');
check('reindex.built.completed', stateOf(RIDX2).completed, ['warm'],
  'only a real rebuild records the warm step');

// A pre-0.5.5 combined corpus occupied bare `index`. Its metadata is the only
// authority for migration: rebuild the exact 0.5.5 variant first, then remove
// that verified legacy directory.
const RIDX_LEGACY = join(BASE, 'repo-reindex-legacy');
write(join(RIDX_LEGACY, 'src/main.py'), `def main():\n    return 1\n# ${PAD}\n`);
const RIDX_LEGACY_DIR = join(CACHE_CODE, repoHash(RIDX_LEGACY));
write(join(RIDX_LEGACY_DIR, 'index/chunks.json'), '[]\n');
write(join(RIDX_LEGACY_DIR, 'index/metadata.json'), JSON.stringify({
  content_type: ['code', 'docs', 'config'],
}));
write(join(RIDX_LEGACY_DIR, 'index/legacy-marker'), 'remove only after swap\n');
const legacyEnv = { SEMBLE_PROJECT_ROOT: RIDX_LEGACY };
seedState(legacyEnv);
const legacyPlan = safeParse(run(PROJECT_SH, ['reindex', '--json'], legacyEnv).stdout);
check('reindex.legacy.plan', [legacyPlan.indexDir, legacyPlan.wouldDelete, legacyPlan.legacyCombined], [
  join(RIDX_LEGACY_DIR, 'index-code-config-docs'),
  [join(RIDX_LEGACY_DIR, 'index-code-config-docs'), join(RIDX_LEGACY_DIR, 'index')], true,
], 'the plan distinguishes the replacement variant from the verified legacy combined index');
const legacyBuilt = run(PROJECT_SH, ['reindex', '--yes', '--json'], {
  ...legacyEnv,
  SEMBLE_NO_NETWORK: '',
  SEMBLE_TIMEOUT_BIN: 'none',
  SP_SEARCH_TIMEOUT: '30',
  PATH: `${BUILD_BIN}:${BIN}:${process.env.PATH}`,
});
check('reindex.legacy.exit', legacyBuilt.status, 0,
  'a verified staged rebuild can complete the legacy migration');
check('reindex.legacy.removed', existsSync(join(RIDX_LEGACY_DIR, 'index')), false,
  'the combined bare index is removed only after the replacement is live');
check('reindex.legacy.current', existsSync(join(RIDX_LEGACY_DIR, 'index-code-config-docs', 'chunks.json')), true,
  'the content-addressed 0.5.5 variant remains after migration');

// WHEN: the search answers but writes no index (a stubbed/degraded semble) —
// the live index is still not deleted.
const RIDX3 = join(BASE, 'repo-reindex-noindex');
write(join(RIDX3, 'src/main.py'), `def main():\n    return 1\n# ${PAD}\n`);
const RIDX3_DIR = join(CACHE_CODE, repoHash(RIDX3));
write(join(RIDX3_DIR, 'index-code-config-docs/chunks.json'), '[]\n');
const ridx3Before = snapshot(RIDX3_DIR);
const noIdx = run(PROJECT_SH, ['reindex', '--yes', '--json'], {
  SEMBLE_PROJECT_ROOT: RIDX3,
  SEMBLE_NO_NETWORK: '',
  SEMBLE_TIMEOUT_BIN: 'none',
  SP_SEARCH_TIMEOUT: '30',
  PATH: `${UVX_BIN}:${BIN}:${process.env.PATH}`,
});
const noIdxJson = safeParse(noIdx.stdout);
check('reindex.noindex.exit', noIdx.status, 3, 'an answer without an index on disk is a failure');
check('reindex.noindex.status', noIdxJson.status, 'failed', 'and is reported as failed');
check('reindex.noindex.kept', snapshot(RIDX3_DIR), ridx3Before,
  'the live index is byte-identical — an unproven staged build never earns a delete');
check('reindex.noindex.no staging residue',
  readdirSync(CACHE_CODE).filter((n) => n.startsWith('.staging')), [],
  'the empty staging root is cleaned up too');

// ═══════════════════════════════════════════════════════════════════════════
// 4. disable — state only, nothing else moves
// ═══════════════════════════════════════════════════════════════════════════
const DIS = join(BASE, 'repo-disable');
write(join(DIS, 'src/main.py'), `def main():\n    return 1\n# ${PAD}\n`);
const RULE = write(join(DIS, '.claude/rules/semble-first.md'), '# semble-first\nrule body\n');
const HOOK = write(join(DIS, '.claude/hooks/semble-session.mjs'), 'process.stdout.write("{}");\n');
const SETTINGS = write(join(DIS, '.claude/settings.json'), JSON.stringify({ permissions: { allow: ['mcp__semble_code__search'] } }, null, 2) + '\n');
const DIS_CACHE = join(CACHE_CODE, repoHash(DIS));
write(join(DIS_CACHE, 'index-code-config-docs/chunks.json'), '[]\n');

const disEnv = { SEMBLE_PROJECT_ROOT: DIS };
seedState(disEnv);
const disGuidanceBefore = { rule: sha(RULE), hook: sha(HOOK), settings: sha(SETTINGS) };
const disCacheBefore = snapshot(DIS_CACHE);

const dis = run(PROJECT_SH, ['disable', '--json'], disEnv);
const disJson = safeParse(dis.stdout);
check('disable exit', dis.status, 0, 'disable succeeds');
check('disable phase', disJson.phase, 'disabled', 'phase -> disabled');
check('disable enabled flag', disJson.enabled, false, 'state.enabled === false');
check('disable state file', [stateOf(DIS).phase, stateOf(DIS).enabled], ['disabled', false],
  'the state file on disk agrees');
check('disable kept guidance bytes', { rule: sha(RULE), hook: sha(HOOK), settings: sha(SETTINGS) },
  disGuidanceBefore, 'rule, hook and settings files are byte-identical');
check('disable kept the cache', snapshot(DIS_CACHE), disCacheBefore, 'the index is untouched');

// ═══════════════════════════════════════════════════════════════════════════
// 5. remove integration + purge guards
// ═══════════════════════════════════════════════════════════════════════════
installClaudeStub();

const REM = join(BASE, 'repo-remove');
write(join(REM, 'src/main.py'), `def main():\n    return 1\n# ${PAD}\n`);
const REM_RULE = write(join(REM, '.claude/rules/semble-first.md'), '# semble-first\nrule body\n');
const REM_HOOK1 = write(join(REM, '.claude/hooks/semble-session.mjs'), 'process.stdout.write("{}");\n');
const REM_HOOK2 = write(join(REM, '.claude/hooks/semble-reminder.mjs'), 'process.stdout.write("{}");\n');
write(join(REM, 'CLAUDE.md'), '# CLAUDE.md\n\nproject notes\n\n<!-- BEGIN brewcode:semble -->\n## Code Search\nblock\n<!-- END brewcode:semble -->\n');
const remEnv = { SEMBLE_PROJECT_ROOT: REM };
seedState(remEnv, 'init');
const REM_CACHE = join(CACHE_CODE, repoHash(REM));
write(join(REM_CACHE, 'index-code-config-docs/chunks.json'), '[]\n');

// A registered MCP config that `remove integration` must not touch.
write(join(HOME, '.claude.json'), JSON.stringify({
  mcpServers: {
    [SERVER]: {
      type: 'stdio', command: 'uvx',
      args: ['--from', PIN_SPEC, 'semble', '--content', 'code', 'docs', 'config'],
      env: { SEMBLE_CACHE_LOCATION: CACHE_CODE },
    },
  },
}, null, 2) + '\n');
const claudeJsonBefore = sha(join(HOME, '.claude.json'));

const remNoYes = run(REMOVE_SH, ['integration', '--json'], remEnv);
check('remove integration without --yes exit', remNoYes.status, 4, 'exit 4 = confirmation required');
check('remove integration without --yes keeps the rule', existsSync(REM_RULE), true, 'nothing deleted');
check('remove integration plan lists the state dir',
  safeParse(remNoYes.stdout).wouldDelete.includes(join(REM, '.claude/semble/')), true,
  'the plan names .claude/semble/');

const rem = run(REMOVE_SH, ['integration', '--yes', '--json'], remEnv);
check('remove integration exit', rem.status, 0, 'removal succeeds');
check('remove integration deleted the rule', existsSync(REM_RULE), false, 'rule file gone');
check('remove integration deleted the hooks', [existsSync(REM_HOOK1), existsSync(REM_HOOK2)], [false, false],
  'both hook files gone');
check('remove integration deleted the state dir', existsSync(join(REM, '.claude/semble')), false,
  '.claude/semble/ gone');
check('remove integration stripped CLAUDE.md',
  readFileSync(join(REM, 'CLAUDE.md'), 'utf8').includes('BEGIN brewcode:semble'), false,
  'the marker block is gone');
check('remove integration kept CLAUDE.md prose',
  readFileSync(join(REM, 'CLAUDE.md'), 'utf8').includes('project notes'), true,
  'the rest of CLAUDE.md survives');
check('remove integration kept the MCP config', sha(join(HOME, '.claude.json')), claudeJsonBefore,
  '~/.claude.json is byte-identical — integration never touches the registration');
check('remove integration kept the cache', existsSync(join(REM_CACHE, 'index-code-config-docs/chunks.json')), true,
  'the index survives an integration removal');

const cacheBeforePurge = snapshot(CACHE_CODE);
const badText = run(REMOVE_SH, ['purge', '--yes', '--confirm-text', 'purge the cache', '--json'], remEnv);
check('purge with the wrong confirm text exit', badText.status, 4, 'exit 4 = confirmation required');
check('purge with the wrong confirm text deletes nothing', snapshot(CACHE_CODE), cacheBeforePurge,
  'the whole code cache root is byte-identical');
check('purge plan names the code root',
  safeParse(badText.stdout).wouldDelete.some((s) => s.startsWith(CACHE_CODE)), true,
  'the plan names the exact directories');

const noText = run(REMOVE_SH, ['purge', '--yes', '--json'], remEnv);
check('purge without --confirm-text exit', noText.status, 4, 'exit 4 = confirmation required');
check('purge without --confirm-text deletes nothing', snapshot(CACHE_CODE), cacheBeforePurge,
  'still byte-identical');

const badFlavour = run(REMOVE_SH, ['everything', '--yes'], remEnv);
check('remove with an unknown flavour', badFlavour.status, 2, 'exit 2 = bad usage');

// ═══════════════════════════════════════════════════════════════════════════
// 6. §12.3 full lifecycle: setup -> resume -> disable -> enable -> remove
// ═══════════════════════════════════════════════════════════════════════════
const LIFE = join(BASE, 'repo-life');
write(join(LIFE, 'src/main.py'), `def main():\n    return 1\n# ${PAD}\n`);
write(join(LIFE, 'CLAUDE.md'), '# CLAUDE.md\n\nlifecycle project\n');
write(join(HOME, '.claude.json'), JSON.stringify({ mcpServers: {} }, null, 2) + '\n');
const lifeEnv = { SEMBLE_PROJECT_ROOT: LIFE };

// setup: checkpoint + claude mcp add + guidance. Rungs stay inline here - the
// assertions sit between them, which is exactly what seedState cannot express.
const add = run(MCP_SH, ['add', '--scope', 'user', '--yes', '--json'], lifeEnv);
check('setup: mcp add exit', add.status, 0, 'the stubbed registration succeeds');
check('setup: phase', stateOf(LIFE).phase, 'awaiting_reload',
  'the checkpoint is written before the add (§9.3)');
check('setup: recorded claude command line', claudeCalls()[0],
  `mcp add-json ${SERVER} -s user ${JSON.stringify({
    type: 'stdio',
    command: 'uvx',
    args: ['--from', PIN_SPEC, 'semble', '--content', 'code', 'docs', 'config'],
    env: { SEMBLE_CACHE_LOCATION: CACHE_CODE },
    alwaysLoad: true,
  })}`,
  'the exact approved argv reached the claude binary, via add-json so alwaysLoad survives');

const guid = run(GUIDANCE_SH, ['install', '--part', 'all', '--json'], lifeEnv);
check('setup: guidance install exit', guid.status, 0, 'rule + CLAUDE.md + hooks + permissions wired');
check('setup: rule file', existsSync(join(LIFE, '.claude/rules/semble-first.md')), true,
  'the rule landed');

// resume: a new session observes the live server, verifies, and goes ready
run(STATE_SH, ['phase', 'verifying'], lifeEnv);
const resumeSmoke = run(PROJECT_SH, ['smoke', '--json'], lifeEnv);
check('resume: smoke status', safeParse(resumeSmoke.stdout).status, 'skipped',
  'warm/smoke are skipped offline (§12.3)');
const toReady = run(STATE_SH, ['phase', 'ready'], lifeEnv);
check('resume: phase', [toReady.status, stateOf(LIFE).phase], [0, 'ready'], 'verifying -> ready');

const strict = run(STATUS_SH, ['--json', '--strict'], lifeEnv);
// `ready` is every required check, not phase alone: offline the warm/smoke pair
// is never recorded, so the install stays unverified and strict fails.
check('resume: status --strict exit', strict.status, 1,
  'strict exits 1 on any verdict that is not ready');
check('resume: status verdict',
  [safeParse(strict.stdout).verdict, safeParse(strict.stdout).nextStep],
  ['partial', 'Run /brewcode:semble-setup install'],
  'phase=ready with the install steps and the warm/smoke pair unrecorded => partial');

// disable
const lifeDis = run(PROJECT_SH, ['disable', '--json'], lifeEnv);
check('lifecycle: disable exit', lifeDis.status, 0, 'disable succeeds');
check('lifecycle: disabled phase', [stateOf(LIFE).phase, stateOf(LIFE).enabled], ['disabled', false],
  'phase=disabled, enabled=false');
check('lifecycle: disable kept the rule', existsSync(join(LIFE, '.claude/rules/semble-first.md')), true,
  'disable deletes nothing');

// enable
const lifeEn = run(PROJECT_SH, ['enable', '--yes', '--json'], lifeEnv);
const lifeEnJson = safeParse(lifeEn.stdout);
check('lifecycle: enable exit', lifeEn.status, 3,
  'a skipped warm cannot prove readiness: exit 3, not 0');
check('lifecycle: enable status', lifeEnJson.status, 'skipped', 'the report says skipped, never ok');
check('lifecycle: enable phase', [stateOf(LIFE).phase, stateOf(LIFE).enabled], ['verifying', true],
  'disabled -> verifying and it STOPS there; enabled=true, phase never reaches ready unverified');
check('lifecycle: enable warm skipped', lifeEnJson.warm.status, 'skipped',
  'the warm inside enable is skipped offline');
check('lifecycle: enable names the stalled phase', lifeEnJson.skipped, [
  `guidance: gitignore: no ${LIFE}/.gitignore and ${LIFE} is not a git repo - .claude/semble/ not registered`,
  'warm: SEMBLE_NO_NETWORK=1',
  'state: phase left at verifying — no successful warm, so readiness is unproven',
], 'the skip list relays guidance verbatim, then carries the warm cause and its consequence');

// remove integration
const claudeJsonLifeBefore = sha(join(HOME, '.claude.json'));
const lifeRem = run(REMOVE_SH, ['integration', '--yes', '--json'], lifeEnv);
check('lifecycle: remove exit', lifeRem.status, 0, 'integration removal succeeds');
check('lifecycle: state gone', existsSync(join(LIFE, '.claude/semble')), false, '.claude/semble/ deleted');
check('lifecycle: rule gone', existsSync(join(LIFE, '.claude/rules/semble-first.md')), false, 'rule deleted');
check('lifecycle: MCP config untouched', sha(join(HOME, '.claude.json')), claudeJsonLifeBefore,
  '~/.claude.json is byte-identical after the integration removal');
check('lifecycle: no claude mcp remove was called',
  claudeCalls().filter((l) => l.startsWith('mcp remove')).length, 0,
  'integration never runs `claude mcp remove`');

// ═══════════════════════════════════════════════════════════════════════════
// 6a. enable relays what guidance reported (SS08 half two)
// The conflict scan preserves a conditional fallback line and reports it for
// review. enable used to run guidance with >/dev/null 2>&1, so that report —
// and every CLAUDE.md line guidance did cut — never reached the user.
// ═══════════════════════════════════════════════════════════════════════════
const REL = join(BASE, 'repo-relay');
write(join(REL, 'src/main.py'), `def main():\n    return 1\n# ${PAD}\n`);
write(join(REL, 'CLAUDE.md'),
  '# CLAUDE.md\n\n## Search\n\n'
  + 'When the semble MCP is offline or the index is cold, use rg for all code search.\n'
  + 'Use grep for all code search.\n');
const relEnv = { SEMBLE_PROJECT_ROOT: REL };
seedState(relEnv, 'verifying');
const rel = safeParse(run(PROJECT_SH, ['enable', '--yes', '--json'], relEnv).stdout);
check('relay: the preserved conflict is named', rel.skipped.filter((l) => l.startsWith('guidance: CLAUDE.md: L5')),
  ['guidance: CLAUDE.md: L5 mentions a search tool but is not an unambiguous contradiction'
   + ' - left untouched, review by hand: When the semble MCP is offline or the index is cold,'
   + ' use rg for all code search.'],
  'the conditional fallback guidance kept is reported through enable, verbatim and by line number');
check('relay: the cut line is named', rel.changed.filter((l) => /^guidance: CLAUDE\.md: removed L6/.test(l)),
  ['guidance: CLAUDE.md: removed L6: Use grep for all code search.'],
  'and so is every line guidance actually removed');
check('relay: the CLAUDE.md prose', readFileSync(join(REL, 'CLAUDE.md'), 'utf8')
  .includes('When the semble MCP is offline or the index is cold'), true,
  'the preserved line is still in the file — enable relays, it does not re-decide');

// ═══════════════════════════════════════════════════════════════════════════
// 6b. preconditions, dry run, cli flavour
// ═══════════════════════════════════════════════════════════════════════════
const BARE = join(BASE, 'repo-bare');
write(join(BARE, 'src/main.py'), `def main():\n    return 1\n# ${PAD}\n`);
const bareEnv = { SEMBLE_PROJECT_ROOT: BARE };
check('enable without a state file', run(PROJECT_SH, ['enable', '--yes', '--json'], bareEnv).status, 3,
  'exit 3 = precondition unmet, run setup first');
check('disable without a state file', run(PROJECT_SH, ['disable', '--json'], bareEnv).status, 3,
  'exit 3 = precondition unmet');
check('enable/disable wrote nothing', existsSync(join(BARE, '.claude')), false,
  'a precondition failure never creates state');

const DRY = join(CACHE_CODE, repoHash(BARE));
write(join(DRY, 'index-code-config-docs/chunks.json'), '[]\n');
const dryBefore = snapshot(DRY);
const dryRun = run(PROJECT_SH, ['reindex', '--yes'], { ...bareEnv, SEMBLE_DRY_RUN: '1' });
check('dry-run reindex exit', dryRun.status, 0, 'a dry run always succeeds');
check('dry-run reindex prints the swap',
  dryRun.stdout.includes(`DRY replace ${join(DRY, 'index-code-config-docs')} from staged index-code-config-docs`), true,
  'the exact variant swap is printed, prefixed DRY');
check('dry-run reindex changed nothing', snapshot(DRY), dryBefore, 'the index is byte-identical');

const cli = run(REMOVE_SH, ['cli', '--yes', '--json'], bareEnv);
const cliJson = safeParse(cli.stdout);
check('remove cli exit', cli.status, 0, 'no uv-tool install is not an error');
check('remove cli is a no-op in uvx-ephemeral mode', cliJson.changed, [],
  'nothing is uninstalled when `uv tool list` has no semble');
check('remove cli kept everything else', cliJson.unchanged, [
  'cli: no uv-tool install of semble (uvx-ephemeral mode)',
  'rule, hooks, MCP registration, cache and state retained',
], 'the cli flavour keeps rule, hooks, MCP, cache and state');

// ═══════════════════════════════════════════════════════════════════════════
// 6c. the §4.2 phase machine has exactly ONE implementation
// semble-project.sh used to carry its own copy of the transition table and it
// had drifted (it allowed ready -> error, which semble-state.sh refuses).
// ═══════════════════════════════════════════════════════════════════════════
const PH_A = join(BASE, 'repo-phase-a');
const PH_B = join(BASE, 'repo-phase-b');
write(join(PH_A, 'src/main.py'), `def main():\n    return 1\n# ${PAD}\n`);
write(join(PH_B, 'src/main.py'), `def main():\n    return 1\n# ${PAD}\n`);

function forcePhase(root, phase) {
  const dir = join(root, '.claude/semble');
  rmSync(dir, { recursive: true, force: true });
  if (phase === 'absent') return;
  write(join(dir, 'state.json'), `${JSON.stringify({
    schema: 1, profile: 'code', phase, enabled: true, scope: 'user',
    projectRoot: root, approvedVersion: '0.5.5', completed: [],
  }, null, 2)}\n`);
}

// [verdict, phase on disk afterwards] for semble-project.sh's sp_set_phase.
// Sourced with `--help` so its main() returns 0 and only the function is used.
function projectVerdict(from, to) {
  forcePhase(PH_A, from);
  const r = spawnSync('bash', ['-c', `. "${PROJECT_SH}" --help >/dev/null 2>&1; sp_set_phase "${to}"`], {
    encoding: 'utf8',
    env: { ...process.env, ...baseEnv(), SEMBLE_PROJECT_ROOT: PH_A },
    timeout: 30000,
  });
  return [r.status === 0 ? 'ok' : 'refused', stateOf(PH_A).phase || 'absent'];
}

// The same pair for the authoritative implementation.
function stateVerdict(from, to) {
  forcePhase(PH_B, from);
  const r = run(STATE_SH, ['phase', to], { SEMBLE_PROJECT_ROOT: PH_B });
  return [r.status === 0 ? 'ok' : 'refused', stateOf(PH_B).phase || 'absent'];
}

const PHASES_FROM = ['absent', 'prereq_ready', 'awaiting_reload', 'verifying', 'ready', 'disabled', 'error'];
const PHASES_TO = ['prereq_ready', 'awaiting_reload', 'verifying', 'ready', 'disabled', 'error'];
const projMatrix = {};
const stateMatrix = {};
for (const from of PHASES_FROM) {
  for (const to of PHASES_TO) {
    projMatrix[`${from}->${to}`] = projectVerdict(from, to);
    stateMatrix[`${from}->${to}`] = stateVerdict(from, to);
  }
}
check('phase machine: 42 transitions probed', Object.keys(projMatrix).length, 42,
  'every from/to pair of the §4.2 machine is exercised');
check('phase machine: one implementation', projMatrix, stateMatrix,
  'sp_set_phase and `semble-state.sh phase` return the same verdict AND leave the same phase on disk for all 42 transitions');
check('phase machine: the drifted pair', [projMatrix['ready->error'], stateMatrix['ready->error']],
  [['refused', 'ready'], ['refused', 'ready']],
  'ready -> error is refused by both and leaves phase=ready (§4.2)');
check('phase machine: no private copy of the table',
  readFileSync(PROJECT_SH, 'utf8').includes('sp_phase_legal'), false,
  'semble-project.sh holds no second copy of the §4.2 transition table');
// §4.2 self-heal: an absent file is initialised and walked forward, and both
// implementations do it identically (they are the same implementation).
check('phase machine: absent self-heals forward', [
  projMatrix['absent->awaiting_reload'], projMatrix['absent->verifying'], projMatrix['absent->ready'],
], [['ok', 'awaiting_reload'], ['ok', 'verifying'], ['ok', 'ready']],
'absent -> awaiting_reload|verifying|ready creates the file and lands on the requested phase');
check('phase machine: absent -> disabled stays illegal',
  [projMatrix['absent->disabled'], stateMatrix['absent->disabled']],
  [['refused', 'absent'], ['refused', 'absent']],
  'a setup that never happened cannot be disabled, and no file is created');
rmSync(join(PH_A, '.claude'), { recursive: true, force: true });
rmSync(join(PH_B, '.claude'), { recursive: true, force: true });

// ═══════════════════════════════════════════════════════════════════════════
// 7. legacy docs cleanup negatives + final purge
// ═══════════════════════════════════════════════════════════════════════════
function legacyRoot(testHome) {
  return join(process.platform === 'darwin' ? join(testHome, 'Library', 'Caches') : join(testHome, '.cache'),
    'semble-docs');
}
function runLegacyCleanup(testHome) {
  return spawnSync('bash', ['-c', `. "${REMOVE_SH}" --help >/dev/null; sr_cleanup_legacy_docs_root`], {
    encoding: 'utf8', timeout: 30000,
    env: { ...process.env, ...baseEnv(), SEMBLE_TEST_HOME: testHome },
  });
}

const EMPTY_HOME = join(BASE, 'legacy-empty-home');
mkdirSync(legacyRoot(EMPTY_HOME), { recursive: true });
check('legacy docs empty cleanup exit', runLegacyCleanup(EMPTY_HOME).status, 0,
  'inspection of an empty legacy-shaped directory succeeds without claiming ownership');
check('legacy docs empty preserved', existsSync(legacyRoot(EMPTY_HOME)), true,
  'an empty directory is preserved because no marker proves it belongs to Semble');

const REPURPOSED_HOME = join(BASE, 'legacy-repurposed-home');
write(join(legacyRoot(REPURPOSED_HOME), 'RESERVED-FOR-DOCS.txt'), 'reserved\n');
write(join(legacyRoot(REPURPOSED_HOME), 'user-content.txt'), 'keep\n');
check('legacy docs repurposed cleanup exit', runLegacyCleanup(REPURPOSED_HOME).status, 0,
  'inspection of a repurposed directory is a safe no-op');
check('legacy docs repurposed preserved', snapshot(legacyRoot(REPURPOSED_HOME)), {
  'RESERVED-FOR-DOCS.txt': shaStr('reserved\n'), 'user-content.txt': shaStr('keep\n'),
}, 'the marker never authorizes deletion when any second entry exists');

const LINK_HOME = join(BASE, 'legacy-symlink-home');
const LINK_TARGET = join(BASE, 'legacy-symlink-target');
write(join(LINK_TARGET, 'RESERVED-FOR-DOCS.txt'), 'reserved\n');
mkdirSync(dirname(legacyRoot(LINK_HOME)), { recursive: true });
symlinkSync(LINK_TARGET, legacyRoot(LINK_HOME));
check('legacy docs symlink cleanup exit', runLegacyCleanup(LINK_HOME).status, 0,
  'a symlink-shaped legacy path is inspected without following it for deletion');
check('legacy docs symlink preserved', [existsSync(legacyRoot(LINK_HOME)), snapshot(LINK_TARGET)], [true, {
  'RESERVED-FOR-DOCS.txt': shaStr('reserved\n'),
}], 'both the symlink and marker-only target survive because the legacy root itself is not a directory owned by Semble');

// Final marker-only positive: full purge removes the shared current cache and
// the one legacy root whose marker is its sole entry.
mkdirSync(LEGACY_DOCS_ROOT, { recursive: true });
write(join(LEGACY_DOCS_ROOT, 'RESERVED-FOR-DOCS.txt'), 'reserved\n');
const purge = run(REMOVE_SH,
  ['purge', '--yes', '--confirm-text', 'purge semble code cache', '--json'], remEnv);
check('purge exit', purge.status, 0, 'purge succeeds with the exact typed confirmation');
check('purge deleted the code root', existsSync(CACHE_CODE), false, 'the code cache root is gone');
check('purge deleted the legacy marker-only root', existsSync(LEGACY_DOCS_ROOT), false,
  'the pre-0.5.5 docs root was under the test home cache base and held only its ownership marker');
check('purge removed the MCP registration',
  Object.keys(safeParse(readFileSync(join(HOME, '.claude.json'), 'utf8')).mcpServers), [],
  'purge does run `claude mcp remove`');

// ── usage / flag handling ────────────────────────────────────────────────────
check('project: unknown subcommand', run(PROJECT_SH, ['frobnicate'], { SEMBLE_PROJECT_ROOT: COV }).status, 2,
  'exit 2 = bad usage');
check('project: unknown flag', run(PROJECT_SH, ['audit', '--wat'], { SEMBLE_PROJECT_ROOT: COV }).status, 2,
  'exit 2 = bad usage');
check('project: --help', run(PROJECT_SH, ['--help'], { SEMBLE_PROJECT_ROOT: COV }).status, 0, 'help exits 0');
check('remove: --help', run(REMOVE_SH, ['--help'], { SEMBLE_PROJECT_ROOT: COV }).status, 0, 'help exits 0');

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\nsuite-project.mjs (unit C)  base=${BASE}`);
for (const line of results) console.log(line);
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
