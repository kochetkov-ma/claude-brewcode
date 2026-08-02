#!/usr/bin/env node
// suite-project.mjs — brewcode:semble unit C.
// Covers semble-project.sh (audit/warm/smoke/enable/disable/reindex), semble-remove.sh
// (integration/mcp/cli/purge) and the §12.3 full-lifecycle integration test.
// Self-contained: inlines its own check()/run() helpers, builds every fixture in a temp
// base, and never touches the real HOME, the real cache or the repo working tree.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync,
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

const PIN_SPEC = 'semble[mcp]==0.5.2';
const SERVER = 'semble_code';

// GIVEN: a fresh isolated temp base. realpathSync mirrors the `cd && pwd -P`
// resolution every script does, so every expected path below is the resolved one.
// The cache roots keep their production leaf names — the rm guards require them.
const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'semble-c-')));
const HOME = join(BASE, 'home');
const CACHE_CODE = join(BASE, 'semble-code');
const CACHE_DOCS = join(BASE, 'semble-docs');
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
    SEMBLE_CACHE_ROOT_DOCS: CACHE_DOCS,
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

// A `claude` stub: logs the exact argv line and emulates mcp add/add-json/remove
// against the injected HOME, so no real registration ever happens.
function installClaudeStub() {
  mkdirSync(BIN, { recursive: true });
  const body = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${CLAUDE_LOG}"
CJ="${HOME}/.claude.json"
if [ "$1" = "--version" ]; then echo "2.1.220 (Claude Code)"; exit 0; fi
if [ "$1" = "mcp" ]; then
  case "$2" in
    add|add-json)
      CJ="$CJ" CACHE="${CACHE_CODE}" node -e '
const fs=require("fs");const f=process.env.CJ;
let j={};try{j=JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){j={}}
j.mcpServers=j.mcpServers||{};
j.mcpServers["${SERVER}"]={type:"stdio",command:"uvx",
  args:["--from","${PIN_SPEC}","semble","--content","code","config"],
  env:{SEMBLE_CACHE_LOCATION:process.env.CACHE}};
fs.writeFileSync(f,JSON.stringify(j,null,2)+"\\n");'
      echo "Added stdio MCP server ${SERVER} to user config"; exit 0 ;;
    remove)
      CJ="$CJ" node -e '
const fs=require("fs");const f=process.env.CJ;
let j={};try{j=JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){j={}}
if(j.mcpServers)delete j.mcpServers["${SERVER}"];
fs.writeFileSync(f,JSON.stringify(j,null,2)+"\\n");'
      echo "Removed MCP server ${SERVER}"; exit 0 ;;
    list) echo "${SERVER}: uvx --from ${PIN_SPEC} semble --content code config - connected"; exit 0 ;;
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
  'html/htm land in docs, never in this code corpus');
check('coverage.excluded', cov.excluded, { '.csv': 1, '.json': 1 },
  'json and csv are excluded from every content type');
check('coverage.totals', cov.totals,
  { code: 7, config: 2, docsOnly: 3, excluded: 2, indexable: 9, classified: 16, unclassified: 0 },
  'exact per-bucket totals for repo-cov');
check('coverage.skipped', cov.skipped, { tooLarge: 1, tinyBlank: 1, symlinks: 1, dirs: 2 },
  '>1MB skipped, <128B blank skipped, symlink not followed, node_modules + .git never walked');
check('coverage html not in code', Object.prototype.hasOwnProperty.call(cov.code, '.html'), false,
  '.html never appears in the code bucket');
check('coverage json not in config', Object.prototype.hasOwnProperty.call(cov.config, '.json'), false,
  '.json never appears in the config bucket');

const auditFull = safeParse(run(PROJECT_SH, ['audit', '--json'], { SEMBLE_PROJECT_ROOT: COV }).stdout);
check('audit disclosure', auditFull.disclosure.includes(
  'Not indexed by this corpus: .html/.htm (semble classifies HTML as docs)'), true,
  'audit --json carries the §7 disclosure verbatim');
check('audit is read-only', existsSync(join(COV, '.claude')), false,
  'audit wrote nothing into the project');

// ═══════════════════════════════════════════════════════════════════════════
// 2. warm / smoke honour SEMBLE_NO_NETWORK
// ═══════════════════════════════════════════════════════════════════════════
const warm = run(PROJECT_SH, ['warm', '--json'], { SEMBLE_PROJECT_ROOT: COV });
const warmJson = safeParse(warm.stdout);
check('warm exit', warm.status, 0, 'a deliberate skip is not a failure');
check('warm status', warmJson.status, 'skipped', 'SEMBLE_NO_NETWORK=1 -> skipped');
check('warm reason', warmJson.reason, 'SEMBLE_NO_NETWORK=1', 'the skip reason is explicit');
check('warm query', warmJson.query, 'entry point main function', 'default warm query');
check('warm command', warmJson.command,
  `SEMBLE_CACHE_LOCATION=${CACHE_CODE} uvx --from '${PIN_SPEC}' semble search `
  + `"entry point main function" "${COV}" --content code config -k 5 --max-snippet-lines 10`,
  'the exact §8.6 command line, pin shell-quoted');

const smoke = run(PROJECT_SH, ['smoke', '--query', 'auth handler', '--json'], { SEMBLE_PROJECT_ROOT: COV });
const smokeJson = safeParse(smoke.stdout);
check('smoke exit', smoke.status, 0, 'skipped smoke exits 0');
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
  + `bounded ok ${COV} --content code config -k 5 --max-snippet-lines 10\n`,
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
  write(join(d, 'index/chunks.json'), '[]\n');
  write(join(d, 'index/metadata.json'), JSON.stringify({ root_path: d, time: 1, content_type: ['code', 'config'], cache_version: 1, files: {} }));
  write(join(d, 'index/bm25_index/data'), 'bm25\n');
  write(join(d, 'index/semantic_index/data'), 'vec\n');
}
write(NOT_A_HASH_DIR + '/keep.txt', 'not a repo dir\n');
write(join(CACHE_CODE, 'savings.jsonl'), '{"tokens":1}\n');

const siblingBefore = snapshot(SIBLING_DIR);
const noYes = run(PROJECT_SH, ['reindex', '--json'], { SEMBLE_PROJECT_ROOT: RIDX });
check('reindex without --yes exit', noYes.status, 4, 'exit 4 = confirmation required');
check('reindex without --yes keeps the dir', existsSync(RIDX_DIR), true, 'nothing was deleted');
check('reindex without --yes plan', safeParse(noYes.stdout).wouldDelete, [RIDX_DIR],
  'it names the single directory it would delete');

const yes = run(PROJECT_SH, ['reindex', '--yes', '--json'], { SEMBLE_PROJECT_ROOT: RIDX });
const yesJson = safeParse(yes.stdout);
check('reindex --yes exit', yes.status, 0, 'rebuild path exits 0 when the warm is skipped');
check('reindex --yes removed the repo dir', existsSync(RIDX_DIR), false,
  'exactly <code root>/<64-hex> is gone');
check('reindex left the sibling repo dir', snapshot(SIBLING_DIR), siblingBefore,
  'a second repo index is byte-identical afterwards');
check('reindex left non-hash entries', snapshot(NOT_A_HASH_DIR), { 'keep.txt': sha(NOT_A_HASH_DIR + '/keep.txt') },
  'a non-64-hex directory under the code root is never touched');
check('reindex left savings.jsonl', existsSync(join(CACHE_CODE, 'savings.jsonl')), true,
  'the root-level savings file survives a per-repo rebuild');
check('reindex warm skipped', yesJson.warm.status, 'skipped', 'warm is skipped under SEMBLE_NO_NETWORK=1');

// ═══════════════════════════════════════════════════════════════════════════
// 4. disable — state only, nothing else moves
// ═══════════════════════════════════════════════════════════════════════════
const DIS = join(BASE, 'repo-disable');
write(join(DIS, 'src/main.py'), `def main():\n    return 1\n# ${PAD}\n`);
const RULE = write(join(DIS, '.claude/rules/semble-first.md'), '# semble-first\nrule body\n');
const HOOK = write(join(DIS, '.claude/hooks/semble-session.mjs'), 'process.stdout.write("{}");\n');
const SETTINGS = write(join(DIS, '.claude/settings.json'), JSON.stringify({ permissions: { allow: ['mcp__semble_code__search'] } }, null, 2) + '\n');
const DIS_CACHE = join(CACHE_CODE, repoHash(DIS));
write(join(DIS_CACHE, 'index/chunks.json'), '[]\n');

const disEnv = { SEMBLE_PROJECT_ROOT: DIS };
run(STATE_SH, ['init'], disEnv);
run(STATE_SH, ['phase', 'prereq_ready'], disEnv);
run(STATE_SH, ['phase', 'awaiting_reload'], disEnv);
run(STATE_SH, ['phase', 'verifying'], disEnv);
run(STATE_SH, ['phase', 'ready'], disEnv);
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
run(STATE_SH, ['init'], remEnv);
const REM_CACHE = join(CACHE_CODE, repoHash(REM));
write(join(REM_CACHE, 'index/chunks.json'), '[]\n');

// A registered MCP config that `remove integration` must not touch.
write(join(HOME, '.claude.json'), JSON.stringify({
  mcpServers: {
    [SERVER]: {
      type: 'stdio', command: 'uvx',
      args: ['--from', PIN_SPEC, 'semble', '--content', 'code', 'config'],
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
check('remove integration kept the cache', existsSync(join(REM_CACHE, 'index/chunks.json')), true,
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

// setup: checkpoint + claude mcp add + guidance
const add = run(MCP_SH, ['add', '--scope', 'user', '--yes', '--json'], lifeEnv);
check('setup: mcp add exit', add.status, 0, 'the stubbed registration succeeds');
check('setup: phase', stateOf(LIFE).phase, 'awaiting_reload',
  'the checkpoint is written before the add (§9.3)');
check('setup: recorded claude command line', claudeCalls()[0],
  `mcp add ${SERVER} -s user -e SEMBLE_CACHE_LOCATION=${CACHE_CODE} -- `
  + `uvx --from ${PIN_SPEC} semble --content code config`,
  'the exact §6.1 argv reached the claude binary');

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
check('resume: status --strict exit', strict.status, 0, 'the whole install verifies as ready');
check('resume: status verdict', safeParse(strict.stdout).verdict, 'ready', 'verdict is ready');

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
check('lifecycle: enable exit', lifeEn.status, 0, 'enable succeeds with a skipped warm');
check('lifecycle: enable phase', [stateOf(LIFE).phase, stateOf(LIFE).enabled], ['ready', true],
  'disabled -> verifying -> ready, enabled=true');
check('lifecycle: enable warm skipped', lifeEnJson.warm.status, 'skipped',
  'the warm inside enable is skipped offline');

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
write(join(DRY, 'index/chunks.json'), '[]\n');
const dryBefore = snapshot(DRY);
const dryRun = run(PROJECT_SH, ['reindex', '--yes'], { ...bareEnv, SEMBLE_DRY_RUN: '1' });
check('dry-run reindex exit', dryRun.status, 0, 'a dry run always succeeds');
check('dry-run reindex prints the rm', dryRun.stdout.includes(`DRY rm -rf ${DRY}`), true,
  'the exact command is printed, prefixed DRY');
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
    projectRoot: root, approvedVersion: '0.5.2', completed: [],
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
rmSync(join(PH_A, '.claude'), { recursive: true, force: true });
rmSync(join(PH_B, '.claude'), { recursive: true, force: true });

// ═══════════════════════════════════════════════════════════════════════════
// 7. purge really deletes — last, it wipes the temp cache roots
// ═══════════════════════════════════════════════════════════════════════════
mkdirSync(CACHE_DOCS, { recursive: true });
write(join(CACHE_DOCS, 'RESERVED-FOR-DOCS.txt'), 'reserved\n');
const purge = run(REMOVE_SH,
  ['purge', '--yes', '--confirm-text', 'purge semble code cache', '--json'], remEnv);
check('purge exit', purge.status, 0, 'purge succeeds with the exact typed confirmation');
check('purge deleted the code root', existsSync(CACHE_CODE), false, 'the code cache root is gone');
check('purge deleted the reserved docs root', existsSync(CACHE_DOCS), false,
  'the docs root held nothing but the RESERVED marker');
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
