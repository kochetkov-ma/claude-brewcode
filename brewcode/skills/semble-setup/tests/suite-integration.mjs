#!/usr/bin/env node
// suite-integration.mjs - cross-unit integration for brewcode:semble-setup.
//
// Every other suite stubs its siblings. This one runs the REAL scripts against
// each other: semble-status.sh composes semble-mcp.sh / semble-cache.sh /
// semble-guidance.sh / semble-agents.sh / semble-project.sh, and the DESIGN
// §12.3 lifecycle is driven end to end. The only stub is the `claude` binary -
// nothing may ever register an MCP server or touch the real machine.
//
// Isolation: one mkdtemp base. `world/` holds home, projects, cache and the
// stub bin and is the read-only snapshot scope; stub logs and TMPDIR live in
// the base OUTSIDE `world/`, so logging can never mask a write. PATH is
// narrowed to `world/bin:/usr/bin:/bin`, which makes uv, uvx, semble and brew
// provably absent (asserted below) - the prerequisite-missing path is the live
// case here, exactly as on the target machine.
//
// Assertion policy: unconditional exact-equality / exact-size checks with a
// description. Every cross-unit number is checked against BOTH the sibling's
// own authoritative value and an independently computed expectation, so a
// re-derivation drifting from its source fails here.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, realpathSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = join(HERE, '..');
const SCRIPTS = join(SKILL, 'scripts');
const STATUS_SH = join(SCRIPTS, 'semble-status.sh');
const MCP_SH = join(SCRIPTS, 'semble-mcp.sh');
const CACHE_SH = join(SCRIPTS, 'semble-cache.sh');
const GUIDANCE_SH = join(SCRIPTS, 'semble-guidance.sh');
const AGENTS_SH = join(SCRIPTS, 'semble-agents.sh');
const PROJECT_SH = join(SCRIPTS, 'semble-project.sh');
const REMOVE_SH = join(SCRIPTS, 'semble-remove.sh');
const STATE_SH = join(SCRIPTS, 'semble-state.sh');

// The rule template is the single source of the stamps status reports back.
const RULE_TEMPLATE = readFileSync(join(SKILL, 'assets', 'semble-first.md.template'), 'utf8');
const TPL_CONTENT_VERSION = (/^content_version: "([^"]+)"$/m.exec(RULE_TEMPLATE) || [])[1];
const TPL_VERSION = (/^version: "([^"]+)"$/m.exec(RULE_TEMPLATE) || [])[1];

const SERVER = 'semble_code';
const PIN_SPEC = 'semble[mcp]==0.5.4';
const TOOL_SEARCH = 'mcp__semble_code__search';
const TOOL_RELATED = 'mcp__semble_code__find_related';

let passed = 0;
let failed = 0;
const results = [];

// ── assertion primitives ────────────────────────────────────────────────────
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

function trunc(s) {
  const str = String(s);
  return str.length > 700 ? `${str.slice(0, 700)}...` : str;
}

function check(name, actual, expected, message) {
  if (deepEqual(actual, expected)) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
    return;
  }
  failed++;
  results.push(`  FAIL  ${name}  (${message} | actual=${trunc(JSON.stringify(actual))}`
    + ` expected=${trunc(JSON.stringify(expected))})`);
}

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return { __PARSE_ERROR__: String(e && e.message), raw: String(str).slice(0, 400) };
  }
}

const keysOf = (o) => (o !== null && typeof o === 'object' ? Object.keys(o).sort() : ['__NOT_AN_OBJECT__']);
const hasError = (o) => Object.prototype.hasOwnProperty.call(o || {}, 'error');

// ── temp world ──────────────────────────────────────────────────────────────
// realpath: every script resolves its roots with `cd && pwd -P`, and on macOS
// /var is a symlink to /private/var - expectations must use the resolved form.
const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'semble-int-')));
const WORLD = join(BASE, 'world');          // the snapshotted tree
const LOGS = join(BASE, 'logs');            // stub logs - deliberately outside
const BIN = join(WORLD, 'bin');
const HOME_DIR = join(WORLD, 'home');       // the installed world
const HOME_BARE = join(WORLD, 'home-bare'); // a home where nothing was ever registered
const HOME_LIFE = join(WORLD, 'home-life'); // §12.3 demands a fresh HOME for the lifecycle
const CACHE_CODE = join(WORLD, 'cache', 'semble-code');
const CACHE_DOCS = join(WORLD, 'cache', 'semble-docs');
const CLAUDE_LOG = join(LOGS, 'claude-calls.log');
const CLAUDE_STUB = join(BIN, 'claude');

for (const d of [LOGS, BIN, HOME_DIR, join(HOME_DIR, '.claude'), HOME_BARE, HOME_LIFE,
  CACHE_CODE, CACHE_DOCS]) {
  mkdirSync(d, { recursive: true });
}
writeFileSync(CLAUDE_LOG, '');
symlinkSync(process.execPath, join(BIN, 'node'));

// The one and only stub: `claude`. It logs its exact argv, records the state
// phase observed at `mcp add` time (proof that the checkpoint precedes the add)
// and emulates add/add-json/remove against the injected HOME.
writeFileSync(CLAUDE_STUB, `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${CLAUDE_LOG}"
if [ "\${1:-}" = "--version" ]; then echo "2.1.223 (Claude Code)"; exit 0; fi
if [ "\${1:-}" = "mcp" ]; then
  case "\${2:-}" in
    add|add-json)
      ST="\${SEMBLE_PROJECT_ROOT}/.claude/semble/state.json" node -e '
const fs=require("fs");let p="absent";
try{p=JSON.parse(fs.readFileSync(process.env.ST,"utf8")).phase||"absent"}catch(e){}
fs.appendFileSync(process.env.LOGF,"phase-at-add="+p+"\\n");'
      CJ="\${SEMBLE_TEST_HOME}/.claude.json" CACHE="${CACHE_CODE}" node -e '
const fs=require("fs");const f=process.env.CJ;
let j={};try{j=JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){j={}}
j.mcpServers=j.mcpServers||{};
j.mcpServers["${SERVER}"]={type:"stdio",command:"uvx",
  args:["--from","${PIN_SPEC}","semble","--content","code","docs","config"],
  env:{SEMBLE_CACHE_LOCATION:process.env.CACHE},alwaysLoad:true};
fs.writeFileSync(f,JSON.stringify(j,null,2)+"\\n");'
      echo "Added stdio MCP server ${SERVER} to user config"; exit 0 ;;
    remove)
      CJ="\${SEMBLE_TEST_HOME}/.claude.json" node -e '
const fs=require("fs");const f=process.env.CJ;
let j={};try{j=JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){j={}}
if(j.mcpServers)delete j.mcpServers["${SERVER}"];
fs.writeFileSync(f,JSON.stringify(j,null,2)+"\\n");'
      echo "Removed MCP server ${SERVER}"; exit 0 ;;
    list) echo "${SERVER}: uvx --from ${PIN_SPEC} semble --content code docs config - connected"; exit 0 ;;
    get)  echo "${SERVER}: connected"; exit 0 ;;
  esac
fi
exit 0
`);
chmodSync(CLAUDE_STUB, 0o755);

const ENV = {
  PATH: `${BIN}:/usr/bin:/bin`,
  HOME: HOME_DIR,
  TMPDIR: BASE,                 // outside WORLD: a stray temp file cannot mask a write
  LANG: 'C',
  LOGF: CLAUDE_LOG,
  SEMBLE_TEST_HOME: HOME_DIR,
  SEMBLE_CACHE_ROOT_CODE: CACHE_CODE,
  SEMBLE_CACHE_ROOT_DOCS: CACHE_DOCS,
  SEMBLE_CLAUDE_BIN: CLAUDE_STUB,
  SEMBLE_NO_NETWORK: '1',
};

function run(script, args, extraEnv = {}) {
  const r = spawnSync('bash', [script, ...args], {
    encoding: 'utf8', env: { ...ENV, ...extraEnv }, timeout: 120000,
  });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

function write(p, body) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
  return p;
}

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

function readJson(p) {
  return existsSync(p) ? safeParse(readFileSync(p, 'utf8')) : { __ABSENT__: true };
}

const stateOf = (root) => readJson(join(root, '.claude', 'semble', 'state.json'));

const claudeCalls = () => readFileSync(CLAUDE_LOG, 'utf8').split('\n').filter((s) => s.length > 0);

// ── byte-level snapshot: path | kind | size | mtime, directories included ────
function walkSnap(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    let st;
    try {
      st = lstatSync(p);
    } catch {
      continue;
    }
    const kind = e.isDirectory() ? 'd' : (e.isSymbolicLink() ? 'l' : 'f');
    acc.push(`${p}|${kind}|${kind === 'd' ? 0 : st.size}|${Math.round(st.mtimeMs)}`);
    if (e.isDirectory()) walkSnap(p, acc);
  }
}

function snapshot(root = WORLD) {
  const acc = [`${root}|root|0|${Math.round(lstatSync(root).mtimeMs)}`];
  walkSnap(root, acc);
  acc.sort();
  return acc;
}

// Every semble-status.sh invocation is wrapped: the whole world tree must be
// byte-identical afterwards (§9.1 "never writes anything").
let roRuns = 0;
let roViolations = 0;
function runStatus(args, extraEnv = {}) {
  const before = snapshot();
  const r = run(STATUS_SH, args, extraEnv);
  const after = snapshot();
  roRuns += 1;
  const same = deepEqual(after, before);
  if (!same) roViolations += 1;
  check(`readonly-${roRuns}`, after, before,
    `semble-status.sh ${args.join(' ')} must not create, modify or delete one byte of the temp tree`);
  return r;
}

// The §12.3 setup ladder every project fixture climbs: register the server,
// install guidance, then walk the phases with the real state machine. Each rung
// is returned so a caller still asserts on the exact step it cares about, and
// `upto` stops the climb where a caller needs to do its own work in between.
// suite-project.mjs repeats the same ladder four more times - move this to a
// shared test helper when that file is next touched.
function seedState(env, upto = 'ready') {
  const rungs = { add: run(MCP_SH, ['add', '--scope', 'user', '--yes', '--json'], env) };
  if (upto === 'add') return rungs;
  rungs.guid = run(GUIDANCE_SH, ['install', '--part', 'all', '--json'], env);
  if (upto === 'guidance') return rungs;
  rungs.verifying = run(STATE_SH, ['phase', 'verifying'], env);
  if (upto === 'verifying') return rungs;
  rungs.ready = run(STATE_SH, ['phase', 'ready'], env);
  return rungs;
}

// ═══════════════════════════════════════════════════════════════════════════
// 0. Isolation proofs - the tools the skill installs must be absent
// ═══════════════════════════════════════════════════════════════════════════
function whichUnderEnv(tool) {
  const r = spawnSync('bash', ['-c', `command -v ${tool} || true`], { encoding: 'utf8', env: ENV });
  return { out: (r.stdout || '').trim(), status: r.status };
}

check('isolation: uv absent', whichUnderEnv('uv'), { out: '', status: 0 },
  'the narrowed PATH resolves no uv - the prerequisite-missing path is the live case');
check('isolation: uvx absent', whichUnderEnv('uvx'), { out: '', status: 0 },
  'no uvx on PATH: nothing can resolve or launch the semble package');
check('isolation: semble absent', whichUnderEnv('semble'), { out: '', status: 0 },
  'no semble binary: a bare `semble` blocking MCP server can never be started');
check('isolation: brew absent', whichUnderEnv('brew'), { out: '', status: 0 },
  'no brew on PATH: `brew install uv` cannot run even by accident');
check('isolation: node resolves to the stub bin', whichUnderEnv('node'),
  { out: join(BIN, 'node'), status: 0 }, 'node stays reachable for every `node -e` helper');
check('isolation: claude resolves to the stub', whichUnderEnv('claude'),
  { out: CLAUDE_STUB, status: 0 }, 'the only reachable `claude` is the logging stub');

// External-world guards: captured now, asserted at the end.
const EXT = {
  realCacheCode: join(homedir(), 'Library', 'Caches', 'semble-code'),
  realCacheDocs: join(homedir(), 'Library', 'Caches', 'semble-docs'),
  repoSettings: join(SKILL, '..', '..', '.claude', 'settings.json'),
  repoAgents: join(SKILL, '..', '..', '.claude', 'agents'),
  userSettings: join(homedir(), '.claude', 'settings.json'),
  userClaudeJson: join(homedir(), '.claude.json'),
};
const extProbe = () => ({
  realCacheCode: existsSync(EXT.realCacheCode),
  realCacheDocs: existsSync(EXT.realCacheDocs),
  repoSettings: existsSync(EXT.repoSettings) ? sha(EXT.repoSettings) : 'ABSENT',
  repoAgents: existsSync(EXT.repoAgents) ? readdirSync(EXT.repoAgents).sort().join(',') : 'ABSENT',
  userSettings: existsSync(EXT.userSettings) ? sha(EXT.userSettings) : 'ABSENT',
  userMcpServers: Object.keys(readJson(EXT.userClaudeJson).mcpServers || {}).sort(),
});
const EXT_BEFORE = extProbe();

// ═══════════════════════════════════════════════════════════════════════════
// 1. A fully installed project: every status section from a real sibling
// ═══════════════════════════════════════════════════════════════════════════
const PAD = 'x'.repeat(200);
const P1 = join(WORLD, 'p-wired');
const p1Env = { SEMBLE_PROJECT_ROOT: P1 };

write(join(P1, 'src/app.py'), `def main():\n    return 1\n# ${PAD}\n`);
write(join(P1, 'src/util.ts'), `export const x = 1;\n// ${PAD}\n`);
write(join(P1, 'conf/app.yaml'), `on: push\n# ${PAD}\n`);
write(join(P1, 'conf/app.properties'), `key=value\n# ${PAD}\n`);
write(join(P1, 'docs/guide.html'), `<html><body>${PAD}</body></html>\n`);
write(join(P1, 'data/rows.csv'), `a,b\n${PAD},${PAD}\n`);
write(join(P1, 'CLAUDE.md'), `# CLAUDE.md\n\nwired project\n`);
// README.md + CLAUDE.md are the two .md docs-only files below.
write(join(P1, 'README.md'), `# readme\n${PAD}\n`);

// Agent fixtures - one per outcome, ground truth known by construction.
write(join(P1, '.claude/agents/a-inherit.md'),
  '---\nname: a-inherit\ndescription: inherits every tool\n---\n\nbody\n');
write(join(P1, '.claude/agents/b-present.md'),
  `---\nname: b-present\ndescription: already carries both tools\ntools: Read, ${TOOL_SEARCH}, ${TOOL_RELATED}\n---\n\nbody\n`);
write(join(P1, '.claude/agents/c-needs.md'),
  '---\nname: c-needs\ndescription: needs the two tools\ntools: Read, Bash\n---\n\nbody\n');
write(join(P1, '.claude/agents/d-conflict.md'),
  `---\nname: d-conflict\ndescription: blocked by disallowedTools\ntools: Read\ndisallowedTools: ${TOOL_SEARCH}\n---\n\nbody\n`);
write(join(P1, '.claude/agents/e-nofm.md'), 'no frontmatter at all\n');

// A complete cache index with byte-exact sizes.
const CHUNKS = '[]\n';
const BM25 = 'bm25\n';
const SEMANTIC = 'semantic\n';
const P1_HASH = createHash('sha256').update(P1).digest('hex');
const P1_CACHE = join(CACHE_CODE, P1_HASH);
const META = {
  cache_version: 1,
  content_type: ['code', 'config'],
  time: 1754150000,
  root_path: P1,
  files: {},
};
const META_TEXT = `${JSON.stringify(META)}\n`;
write(join(P1_CACHE, 'index/chunks.json'), CHUNKS);
write(join(P1_CACHE, 'index/metadata.json'), META_TEXT);
write(join(P1_CACHE, 'index/bm25_index'), BM25);
write(join(P1_CACHE, 'index/semantic_index'), SEMANTIC);
const P1_CACHE_BYTES = Buffer.byteLength(CHUNKS) + Buffer.byteLength(META_TEXT)
  + Buffer.byteLength(BM25) + Buffer.byteLength(SEMANTIC);

write(join(HOME_DIR, '.claude.json'), `${JSON.stringify({ mcpServers: {} }, null, 2)}\n`);

// Real registration path: checkpoint -> stubbed `claude mcp add` -> detect.
const p1 = seedState(p1Env);
check('wired: mcp add exit', p1.add.status, 0, 'the stubbed registration succeeds');
check('wired: repo hash matches the cache dir name', P1_HASH.length, 64,
  'sha256 of the resolved project root is the cache leaf (64 hex chars)');
check('wired: guidance install exit', p1.guid.status, 0, 'rule + CLAUDE.md + hooks + permissions land');
check('wired: phase ready', [p1.ready.status, stateOf(P1).phase], [0, 'ready'],
  'verifying -> ready via the real state machine');

// The siblings, run directly - the independent truth every transform is checked against.
const rawMcp = safeParse(run(MCP_SH, ['detect', '--json'], p1Env).stdout);
const rawCache = safeParse(run(CACHE_SH, ['info', '--json'], p1Env).stdout);
const rawGuid = safeParse(run(GUIDANCE_SH, ['status', '--json'], p1Env).stdout);
const rawAgents = safeParse(run(AGENTS_SH, ['audit', '--json'], p1Env).stdout);
const rawProject = safeParse(run(PROJECT_SH, ['audit', '--json'], p1Env).stdout);

const st = runStatus(['--section', 'all', '--json'], p1Env);
check('wired: status exit', st.status, 0, 'a report was produced (§9 exit 0)');
const R = safeParse(st.stdout);

check('wired: report top-level keys', keysOf(R),
  ['agents', 'cache', 'coverage', 'generatedAt', 'guidance', 'mcp', 'nextStep', 'pin',
    'platform', 'prereq', 'projectRoot', 'schema', 'state', 'verdict'],
  'every §9.1 section is present in --section all');
check('wired: schema + platform + projectRoot', [R.schema, R.platform, R.projectRoot],
  [1, 'darwin', P1], 'header fields carry the resolved project root');
check('wired: pin', R.pin, { approved: '0.5.4', spec: PIN_SPEC }, 'the approved pin is reported verbatim');

// §SCOPE 1 - not a single section may be an {"error": ...} placeholder.
const SECTIONS = ['prereq', 'mcp', 'cache', 'guidance', 'agents', 'coverage', 'state'];
check('wired: no section degraded to an error placeholder',
  SECTIONS.filter((k) => hasError(R[k])), [],
  'every section came from a real sibling, none from the {"error":...} fallback');
check('wired: every section is a JSON object',
  SECTIONS.map((k) => (R[k] !== null && typeof R[k] === 'object' && !Array.isArray(R[k]))),
  [true, true, true, true, true, true, true], 'sections are objects, never null or scalars');

// prereq: uv/uvx/semble genuinely missing, and that degrades cleanly.
check('wired: prereq keys', keysOf(R.prereq), ['brew', 'claude', 'node', 'semble', 'uv', 'uvx'],
  'the §9.1 prereq shape');
check('wired: prereq missing tools', [R.prereq.uv.present, R.prereq.uvx.present, R.prereq.brew.present],
  [false, false, false], 'uv, uvx and brew are absent and reported as absent, not crashed on');
check('wired: prereq semble', R.prereq.semble,
  { present: false, version: '', source: 'uvx-ephemeral', resolvable: false },
  'without uvx the pin is unresolvable and the source stays uvx-ephemeral');
check('wired: prereq claude', [R.prereq.claude.present, R.prereq.claude.version, R.prereq.claude.path],
  [true, '2.1.223', CLAUDE_STUB], 'the stubbed claude is the only binary detected');

// mcp: transform of semble-mcp.sh detect
check('wired: mcp keys', keysOf(R.mcp),
  ['connectivity', 'malformed', 'permissions', 'projectEnabled', 'scopes', 'state', 'tools', 'upstream'],
  'the §9.1 mcp shape');
check('wired: mcp state equals the sibling verdict', [R.mcp.state, rawMcp.state], ['correct', 'correct'],
  'status re-publishes semble-mcp.sh detect state without reinterpreting it');
check('wired: mcp scopes come from the sibling dump',
  [R.mcp.scopes.user, R.mcp.scopes.local, R.mcp.scopes.project],
  [rawMcp.dump.user, null, null], 'scopes.user is dump.user verbatim; local/project stay null');
check('wired: mcp registered command', R.mcp.scopes.user,
  {
    type: 'stdio',
    command: 'uvx',
    args: ['--from', PIN_SPEC, 'semble', '--content', 'code', 'docs', 'config'],
    env: { SEMBLE_CACHE_LOCATION: CACHE_CODE },
    alwaysLoad: true,
  }, 'the exact approved server config reached ~/.claude.json through the stub');
check('wired: mcp upstream + malformed + projectEnabled',
  [R.mcp.upstream.user, R.mcp.upstream.local, R.mcp.malformed, R.mcp.projectEnabled],
  [null, null, [], null], 'no unpinned upstream server, no malformed file');
check('wired: mcp tools', R.mcp.tools, [TOOL_SEARCH, TOOL_RELATED], 'the two tool names, in order');
check('wired: mcp connectivity equals the sibling probe',
  [R.mcp.connectivity, rawMcp.connectivity], ['connected', 'connected'],
  'connectivity is `claude mcp get` exit status only');
check('wired: mcp permissions', R.mcp.permissions,
  { project: [TOOL_SEARCH, TOOL_RELATED], user: [] },
  'guidance wired both tools into the project settings allow list, none at user scope');

// cache: pass-through of semble-cache.sh info
check('wired: cache keys', keysOf(R.cache),
  ['codeRoot', 'docsReserved', 'docsRoot', 'entries', 'metadata', 'otherRepos', 'present',
    'repoDir', 'repoHash', 'sizeBytes', 'staleness'],
  'the §9.1 cache shape plus the §9.4 otherRepos field');
check('wired: cache is the sibling object verbatim', R.cache, rawCache,
  'semble-cache.sh info --json is passed through unmodified');
check('wired: cache index accounting',
  [R.cache.present, R.cache.entries, R.cache.sizeBytes, R.cache.repoHash, R.cache.repoDir],
  [true, 4, P1_CACHE_BYTES, P1_HASH, P1_CACHE],
  'exactly the 4 index files created above, with their exact byte total');
check('wired: cache metadata is the file content', R.cache.metadata, META,
  'index/metadata.json is surfaced unmodified');
check('wired: cache staleness offline', R.cache.staleness, 'unknown',
  'SEMBLE_NO_NETWORK=1 makes a complete index report staleness=unknown');
check('wired: cache roots + docs reservation',
  [R.cache.codeRoot, R.cache.docsRoot, R.cache.docsReserved, R.cache.otherRepos],
  [CACHE_CODE, CACHE_DOCS, false, []], 'injected roots, no docs marker, no other repo indexed yet');

// state
check('wired: state keys', keysOf(R.state), ['completed', 'enabled', 'last_updated', 'phase', 'present'],
  'the §9.1 state shape');
check('wired: state phase', [R.state.present, R.state.phase], [true, 'ready'],
  'the real state file drives the state section');
check('wired: state completed', R.state.completed, ['mcp'],
  'only `claude mcp add` recorded a step here: no install ran prereq/permissions/guidance/agents '
  + 'and no warm/smoke was possible offline - this is what keeps the verdict below at partial');

// verdict: `ready` is every required check, not the phase alone. This project
// is wired and phase=ready, yet its state records one step out of seven, so the
// verdict downgrades and names the gap.
check('wired: verdict', [R.verdict, R.nextStep], ['partial', 'Run /brewcode:semble-setup install'],
  'mcp=correct + phase=ready with unrecorded install steps => partial, and because more than the '
  + 'warm/smoke pair is missing the prescription is a full install, not resume');
const strict = runStatus(['--json', '--strict'], p1Env);
check('wired: --strict exit', strict.status, 1, '--strict exits 1 on any verdict that is not ready');

// ═══════════════════════════════════════════════════════════════════════════
// 2. Unit A transforms vs what units C/D/E actually emit
// ═══════════════════════════════════════════════════════════════════════════

// ── 2a. guidance ────────────────────────────────────────────────────────────
check('guidance: keys', keysOf(R.guidance),
  ['claudeMd', 'content_version', 'hooks', 'ignore', 'permissionsWired', 'pluginVersion',
    'retired', 'rule', 'settingsFile', 'staleEntries', 'templateContentVersion', 'version',
    'wantCount', 'wiredCount'],
  'the §9.1 guidance shape plus the derived wiredCount/wantCount, the migration list, and the '
  + 'installed-vs-plugin stamp pair that carries the stale-artifacts signal');
// The stale-artifacts verdict is driven by content_version, with `version`
// riding along informational-only. Both stamps are pinned to the shipped
// template, so neither half of the pair can silently drop out of the report.
check('guidance: stamp pair matches the shipped template',
  [R.guidance.content_version, R.guidance.templateContentVersion,
    R.guidance.version, R.guidance.pluginVersion],
  [TPL_CONTENT_VERSION, TPL_CONTENT_VERSION, TPL_VERSION, TPL_VERSION],
  'a fresh install copies assets/semble-first.md.template byte for byte, so installed and plugin '
  + 'stamps are equal and both are the template frontmatter values');
check('guidance: stamp pair is the sibling value verbatim',
  [R.guidance.content_version, R.guidance.templateContentVersion,
    R.guidance.version, R.guidance.pluginVersion],
  [rawGuid.rule.content_version, rawGuid.rule.templateContentVersion,
    rawGuid.rule.version, rawGuid.rule.templateVersion],
  'status re-publishes the four semble-guidance.sh rule stamps without reinterpreting them');
check('guidance: hooks sub-keys', keysOf(R.guidance.hooks),
  ['prefetch', 'reminder', 'session', 'stats', 'subagent'],
  'hooks collapses to five file-presence strings, one per LIVE hook');
check('guidance: flattened states',
  [R.guidance.rule, R.guidance.claudeMd, R.guidance.hooks.session, R.guidance.hooks.prefetch,
    R.guidance.hooks.stats, R.guidance.hooks.reminder, R.guidance.hooks.subagent],
  [rawGuid.rule.state, rawGuid.claudeMd.state,
    rawGuid.hooks.session.file, rawGuid.hooks.prefetch.file, rawGuid.hooks.stats.file,
    rawGuid.hooks.reminder.file, rawGuid.hooks.subagent.file],
  'each flattened field equals the sibling sub-object it was taken from');
check('guidance: installed states', [R.guidance.rule, R.guidance.claudeMd,
  R.guidance.hooks.session, R.guidance.hooks.prefetch, R.guidance.hooks.stats,
  R.guidance.hooks.reminder, R.guidance.hooks.subagent],
['managed', 'present', 'present', 'present', 'present', 'present', 'present'],
'after a real install: managed rule, marker block in CLAUDE.md, all five hook files copied');
check('guidance: nothing retired left over', [R.guidance.retired, rawGuid.hooks.retired], [[], []],
  'a fresh install has no v1 hook file to migrate away');
check('guidance: settingsFile + staleEntries + permissionsWired',
  [R.guidance.settingsFile, R.guidance.staleEntries, R.guidance.permissionsWired],
  [join(P1, '.claude/settings.json'), 0, true],
  'project settings path, no stale entries, both tool permissions wired');
check('guidance: wiredCount fully wired',
  [R.guidance.wiredCount, R.guidance.wantCount, rawGuid.hooks.wiredCount, rawGuid.hooks.wantCount],
  [6, 6, 6, 6],
  'all six entries (SessionStart + UserPromptSubmit/prefetch + PostToolUse/stats'
  + ' + PostToolUseFailure/stats + PreToolUse/reminder + SubagentStart/subagent) are registered');

// Partial wiring: strip the UserPromptSubmit entry only. Independent truth is
// 5 of 6 registered entries, which is also what semble-guidance.sh reports.
const P2 = join(WORLD, 'p-partial');
const p2Env = { SEMBLE_PROJECT_ROOT: P2 };
write(join(P2, 'src/app.py'), `def main():\n    return 1\n# ${PAD}\n`);
write(join(P2, 'CLAUDE.md'), '# CLAUDE.md\n\npartial project\n');
check('partial: guidance install exit',
  run(GUIDANCE_SH, ['install', '--part', 'all', '--json'], p2Env).status, 0, 'guidance installed');

const P2_SETTINGS = join(P2, '.claude/settings.json');
const p2Settings = readJson(P2_SETTINGS);
const p2Ups = p2Settings.hooks.UserPromptSubmit;
delete p2Settings.hooks.UserPromptSubmit;
writeFileSync(P2_SETTINGS, `${JSON.stringify(p2Settings, null, 2)}\n`);
check('partial: exactly one prefetch entry existed to remove',
  [p2Ups.length, p2Settings.hooks.UserPromptSubmit], [1, undefined],
  'the prefetch hook is registered once, unmatched, and that single row is now gone');

const rawGuid2 = safeParse(run(GUIDANCE_SH, ['status', '--json'], p2Env).stdout);
const R2 = safeParse(runStatus(['--section', 'guidance', '--json'], p2Env).stdout);
check('partial: sibling counts 5 of 6 entries',
  [rawGuid2.hooks.session.wired, rawGuid2.hooks.prefetch.wired,
    rawGuid2.hooks.stats.wired, rawGuid2.hooks.reminder.wired, rawGuid2.hooks.subagent.wired,
    rawGuid2.hooks.wiredCount, rawGuid2.hooks.wantCount],
  [true, false, true, true, true, 5, 6],
  'semble-guidance.sh counts registered entries: SessionStart + both stats rows + reminder'
  + ' + subagent = 5, prefetch not wired');
check('partial: guidance.wiredCount agrees with the sibling',
  [R2.guidance.wiredCount, rawGuid2.hooks.wiredCount, R2.guidance.wantCount], [5, 5, 6],
  'status reads guidance.hooks.wiredCount instead of re-deriving it, so a missing prefetch'
  + ' row reports 5/6 on both sides');
check('partial: section filter emits guidance only', keysOf(R2),
  ['generatedAt', 'guidance', 'nextStep', 'pin', 'platform', 'projectRoot', 'schema', 'verdict'],
  '--section guidance adds exactly one section to the header + verdict');
check('partial: guidance section is not an error placeholder', hasError(R2.guidance), false,
  'the real semble-guidance.sh answered');

// No guidance at all: both counts are 0. This project also carries the coverage
// ground truth - it has no .claude/ tree, so every counted file is one written here.
const P3 = join(WORLD, 'p-bare');
const p3Env = { SEMBLE_PROJECT_ROOT: P3, SEMBLE_TEST_HOME: HOME_BARE };
write(join(HOME_BARE, '.claude.json'), `${JSON.stringify({ mcpServers: {} }, null, 2)}\n`);
write(join(P3, 'src/app.py'), `def main():\n    return 1\n# ${PAD}\n`);
write(join(P3, 'src/util.ts'), `export const x = 1;\n// ${PAD}\n`);
write(join(P3, 'conf/app.yaml'), `on: push\n# ${PAD}\n`);
write(join(P3, 'conf/app.properties'), `key=value\n# ${PAD}\n`);
write(join(P3, 'docs/guide.html'), `<html><body>${PAD}</body></html>\n`);
write(join(P3, 'data/rows.csv'), `a,b\n${PAD},${PAD}\n`);
write(join(P3, 'README.md'), `# readme\n${PAD}\n`);
write(join(P3, 'CLAUDE.md'), `# CLAUDE.md\n\n${PAD}\n`);
const rawGuid3 = safeParse(run(GUIDANCE_SH, ['status', '--json'], p3Env).stdout);
const R3 = safeParse(runStatus(['--section', 'all', '--json'], p3Env).stdout);
check('bare: wiredCount zero both sides', [R3.guidance.wiredCount, rawGuid3.hooks.wiredCount], [0, 0],
  'nothing installed => 0/6 on both sides');
check('bare: guidance states', [R3.guidance.rule, R3.guidance.claudeMd,
  R3.guidance.hooks.session, R3.guidance.hooks.prefetch, R3.guidance.hooks.stats,
  R3.guidance.hooks.reminder, R3.guidance.hooks.subagent,
  R3.guidance.permissionsWired],
['absent', 'absent', 'missing', 'missing', 'missing', 'missing', 'missing', false],
'an untouched project reports everything absent');
check('bare: no section degraded to an error placeholder',
  SECTIONS.filter((k) => hasError(R3[k])), [],
  'even with nothing installed every section is produced by its real sibling');
check('bare: agents on a project with no .claude/agents',
  [R3.agents.total, R3.agents.files, R3.agents.inherit, R3.agents.needsPatch],
  [0, [], 0, 0], 'an absent agents dir degrades to zeros, never to an error');
check('bare: verdict', [R3.verdict, R3.nextStep], ['not_installed', 'Run /brewcode:semble-setup install'],
  'mcp absent + phase absent => not_installed');
const bareStrict = runStatus(['--strict'], p3Env);
check('bare: --strict exit', bareStrict.status, 1, '--strict exits 1 for any verdict other than ready');

// ── 2b. agents ──────────────────────────────────────────────────────────────
check('agents: keys', keysOf(R.agents),
  ['conflict', 'files', 'inherit', 'needsPatch', 'patched', 'skipped', 'total'],
  'the §9.1 agents shape');
check('agents: sibling summary from the five fixtures', rawAgents.summary,
  { changed: 1, unchanged: 2, conflict: 1, skipped: 1, failed: 0 },
  'semble-agents.sh sees: 1 needs the tools, 2 need nothing, 1 conflict, 1 unparseable');
check('agents: per-file outcomes',
  rawAgents.files.map((f) => [f.path, f.action, f.reason, f.toolsStyle]),
  [
    ['.claude/agents/a-inherit.md', 'unchanged', 'inherits', 'absent'],
    ['.claude/agents/b-present.md', 'unchanged', 'already-present', 'csv'],
    ['.claude/agents/c-needs.md', 'changed', 'added', 'csv'],
    ['.claude/agents/d-conflict.md', 'conflict', 'disallowed-tools', 'csv'],
    ['.claude/agents/e-nofm.md', 'skipped', 'no-frontmatter', 'absent'],
  ], 'ground truth by construction: one fixture per §11.4 outcome');
check('agents: files array is the sibling array verbatim', R.agents.files, rawAgents.files,
  'status forwards the per-file records untouched');
check('agents: total', [R.agents.total, rawAgents.total], [5, 5], 'five agent files were walked');
check('agents: needsPatch equals the sibling changed count',
  [R.agents.needsPatch, rawAgents.summary.changed], [1, 1],
  'exactly c-needs.md would be patched');
check('agents: patched', R.agents.patched, 1,
  'exactly b-present.md already carries both tools (unchanged with a tools: value)');
check('agents: conflict + skipped come from the summary',
  [R.agents.conflict, R.agents.skipped], [1, 1], 'd-conflict.md and e-nofm.md');

// Independently computed: only a-inherit.md has no tools: key AND was parsed.
const expectedInherit = rawAgents.files
  .filter((f) => f.toolsStyle === 'absent' && f.action === 'unchanged' && f.reason === 'inherits').length;
check('agents: independent inherit expectation', expectedInherit, 1,
  'exactly one fixture genuinely inherits the tool list');
check('agents: inherit equals the independent expectation', [R.agents.inherit, expectedInherit], [1, 1],
  'status buckets on action/reason, so e-nofm.md (skipped, toolsStyle "absent") is no longer'
  + ' counted as inherit as well as skipped');
check('agents: buckets partition total',
  [R.agents.inherit + R.agents.patched + R.agents.needsPatch + R.agents.conflict + R.agents.skipped,
    R.agents.total], [5, 5],
  'the five §9.1 buckets sum to total exactly - every file lands in one and only one');
check('agents: buckets partition total on the sibling summary too',
  [R.agents.inherit + R.agents.patched, rawAgents.summary.unchanged,
    R.agents.needsPatch + R.agents.conflict + R.agents.skipped,
    rawAgents.summary.changed + rawAgents.summary.conflict + rawAgents.summary.skipped,
    rawAgents.summary.failed],
  [2, 2, 3, 3, 0],
  'inherit+patched split the sibling unchanged count; the other three are its counts verbatim');

// The second shape that carries toolsStyle "absent" without inheriting: a
// conflict on a file that has no `tools:` key at all (semble-agents.sh checks
// disallowedTools before the absent-style branch). No fixture above covers it.
const P4 = join(WORLD, 'p-conflict-absent');
const p4Env = { SEMBLE_PROJECT_ROOT: P4 };
write(join(P4, 'src/app.py'), `def main():\n    return 1\n# ${PAD}\n`);
write(join(P4, '.claude/agents/f-conflict-notools.md'),
  `---\nname: f-conflict-notools\ndescription: blocked, no tools key\ndisallowedTools: ${TOOL_SEARCH}\n---\n\nbody\n`);
const rawAgents4 = safeParse(run(AGENTS_SH, ['audit', '--json'], p4Env).stdout);
const R4 = safeParse(runStatus(['--section', 'agents', '--json'], p4Env).stdout);
check('conflict-absent: sibling outcome',
  rawAgents4.files.map((f) => [f.path, f.action, f.reason, f.toolsStyle]),
  [['.claude/agents/f-conflict-notools.md', 'conflict', 'disallowed-tools', 'absent']],
  'a conflict with no tools: key also gets toolsStyle "absent"');
check('conflict-absent: counters',
  [R4.agents.total, R4.agents.inherit, R4.agents.patched, R4.agents.needsPatch,
    R4.agents.conflict, R4.agents.skipped],
  [1, 0, 0, 0, 1, 0],
  'the file counts as conflict only - toolsStyle "absent" no longer leaks it into inherit');
check('conflict-absent: buckets partition total',
  [R4.agents.inherit + R4.agents.patched + R4.agents.needsPatch + R4.agents.conflict
    + R4.agents.skipped, R4.agents.total], [1, 1],
  'the partition holds for the conflict shape too');

// ── 2c. coverage ────────────────────────────────────────────────────────────
check('coverage: keys are a superset of §9.1', keysOf(R.coverage),
  ['code', 'config', 'docsOnly', 'excluded', 'skipped', 'totals'],
  'semble-project.sh audit adds totals + skipped on top of the four §9.1 buckets');
check('coverage: equals the sibling coverage object verbatim', R.coverage, rawProject.coverage,
  'status forwards project.coverage without reshaping it');
check('coverage: totals key set', keysOf(R.coverage.totals),
  ['classified', 'code', 'config', 'docsOnly', 'excluded', 'indexable', 'unclassified'],
  'the totals block carried through the superset');
check('coverage: skipped key set', keysOf(R.coverage.skipped),
  ['dirs', 'symlinks', 'tinyBlank', 'tooLarge'], 'the skipped block carried through the superset');

// Ground truth: p-bare has no .claude/ tree, so every file below was written here.
const sumOf = (o) => Object.keys(o).reduce((n, k) => n + o[k], 0);
check('coverage: buckets (independently known fixture set)',
  [R3.coverage.code, R3.coverage.config, R3.coverage.docsOnly, R3.coverage.excluded],
  [{ '.py': 1, '.ts': 1 }, { '.properties': 1, '.yaml': 1 },
    { '.html': 1, '.md': 2 }, { '.csv': 1 }],
  'py+ts are code, yaml+properties config, html and both .md in the docs bucket, csv excluded');
check('coverage: totals', R3.coverage.totals,
  {
    code: 2, config: 2, docsOnly: 3, excluded: 1, indexable: 7, classified: 8, unclassified: 0,
  }, 'exact per-bucket totals for the eight p-bare files');
check('coverage: totals agree with the buckets they summarise',
  [sumOf(R3.coverage.code), sumOf(R3.coverage.config), sumOf(R3.coverage.docsOnly),
    sumOf(R3.coverage.excluded),
    sumOf(R3.coverage.code) + sumOf(R3.coverage.config) + sumOf(R3.coverage.docsOnly),
    sumOf(R3.coverage.code) + sumOf(R3.coverage.config) + sumOf(R3.coverage.docsOnly)
      + sumOf(R3.coverage.excluded)],
  [R3.coverage.totals.code, R3.coverage.totals.config, R3.coverage.totals.docsOnly,
    R3.coverage.totals.excluded, R3.coverage.totals.indexable, R3.coverage.totals.classified],
  'each total recomputed from the bucket maps status forwarded');
check('coverage: skipped', R3.coverage.skipped,
  { tooLarge: 0, tinyBlank: 0, symlinks: 0, dirs: 0 },
  'nothing too large, blank, symlinked or in a never-walked directory');

// ── 2d. per-section runs: each sibling answers on its own ───────────────────
for (const [sec, extra] of [['mcp', []], ['cache', []], ['guidance', []], ['agents', []], ['coverage', []]]) {
  const one = safeParse(runStatus(['--section', sec, '--json', ...extra], p1Env).stdout);
  check(`section ${sec}: keys`, keysOf(one),
    ['generatedAt', 'nextStep', 'pin', 'platform', 'projectRoot', 'schema', sec, 'verdict'].sort(),
    `--section ${sec} emits the header, that one section and the verdict`);
  check(`section ${sec}: not an error placeholder`, hasError(one[sec]), false,
    `the real sibling behind ${sec} answered when asked alone`);
  check(`section ${sec}: equals the --section all value`, one[sec], R[sec],
    `${sec} is identical whether requested alone or as part of all`);
}

// ── 2d-bis. the one state that verifies as ready ────────────────────────────
// Runs LAST against p-wired, because it mutates it: agent frontmatter is
// patched and the remaining install/verify steps are recorded. Without this the
// suite would never exercise `ready`/`none` or a strict exit 0 at all.
const p1Apply = run(AGENTS_SH, ['apply', '--scope', 'project', '--yes', '--json'], p1Env);
check('ready: agents apply exit', p1Apply.status, 3,
  'exit 3 is the conflict code, not a failure: c-needs is patched while d-conflict keeps its '
  + 'disallowedTools and is handed back for a user decision');
const p1Complete = safeParse(run(STATE_SH,
  ['complete', 'prereq', 'mcp', 'permissions', 'guidance', 'agents', 'warm', 'smoke', '--json'],
  p1Env).stdout);
check('ready: completed steps', p1Complete.completed,
  ['mcp', 'prereq', 'permissions', 'guidance', 'agents', 'warm', 'smoke'],
  'the recorded set is the pre-existing `mcp` plus the six steps added here, in write order');
const readyRep = safeParse(runStatus(['--json'], p1Env).stdout);
check('ready: agents needsPatch cleared',
  [readyRep.agents.needsPatch, readyRep.agents.conflict, readyRep.cache.present],
  [0, 1, true],
  'd-conflict stays a conflict (never a needsPatch) and the index is still on disk');
check('ready: verdict', [readyRep.verdict, readyRep.nextStep], ['ready', 'none'],
  'every required check satisfied - mcp correct, phase ready, all steps recorded, rule and '
  + 'permissions wired, index present, agents reconciled, stamps level');
check('ready: --strict exit', runStatus(['--json', '--strict'], p1Env).status, 0,
  '--strict exits 0 exactly when the verdict is ready');

// ── 2e. negative control: without the siblings the sections DO degrade ──────
// Proves the "no error placeholder" assertions above are not vacuous.
const LONELY = join(WORLD, 'lonely');
mkdirSync(join(LONELY, 'lib'), { recursive: true });
writeFileSync(join(LONELY, 'semble-status.sh'), readFileSync(STATUS_SH));
writeFileSync(join(LONELY, 'lib/semble-common.sh'), readFileSync(join(SCRIPTS, 'lib/semble-common.sh')));
const lonelyBefore = snapshot();
const lonely = run(join(LONELY, 'semble-status.sh'), ['--section', 'all', '--json'], p3Env);
const RL = safeParse(lonely.stdout);
check('negative control: exit code', lonely.status, 0,
  'a broken section must not hide the rest - the run still exits 0 (§9.1)');
check('negative control: read-only', snapshot(), lonelyBefore,
  'even the degraded run writes nothing');
check('negative control: sections degrade to error placeholders',
  [RL.mcp, RL.cache, RL.guidance, RL.agents, RL.coverage],
  [{ error: 'semble-mcp.sh not found - that unit is not installed' },
    { error: 'semble-cache.sh not found - that unit is not installed' },
    { error: 'semble-guidance.sh not found - that unit is not installed' },
    { error: 'semble-agents.sh not found - that unit is not installed' },
    { error: 'semble-project.sh not found - that unit is not installed' }],
  'with the siblings removed every composed section is exactly the {"error":...} fallback');
check('negative control: local sections survive',
  [hasError(RL.prereq), hasError(RL.state), RL.verdict], [false, false, 'partial'],
  'prereq and state are computed in-process, so they still answer');

// ═══════════════════════════════════════════════════════════════════════════
// 3. DESIGN §12.3 lifecycle, real siblings end to end
// ═══════════════════════════════════════════════════════════════════════════
const LIFE = join(WORLD, 'p-life');
const lifeEnv = { SEMBLE_PROJECT_ROOT: LIFE, SEMBLE_TEST_HOME: HOME_LIFE };
const LIFE_CJ = join(HOME_LIFE, '.claude.json');
write(LIFE_CJ, `${JSON.stringify({ mcpServers: {} }, null, 2)}\n`);
write(join(LIFE, 'src/main.py'), `def main():\n    return 1\n# ${PAD}\n`);
write(join(LIFE, 'CLAUDE.md'), '# CLAUDE.md\n\nlifecycle project\n');

const callsBefore = claudeCalls().length;
const life = seedState(lifeEnv, 'guidance');
check('lifecycle: mcp add exit', life.add.status, 0, 'the stubbed registration succeeds');
check('lifecycle: phase after add', stateOf(LIFE).phase, 'awaiting_reload',
  'the checkpoint moved the project to awaiting_reload');
const lifeCalls = claudeCalls().slice(callsBefore);
check('lifecycle: checkpoint was written BEFORE claude mcp add ran',
  lifeCalls.filter((l) => l.startsWith('phase-at-add=')), ['phase-at-add=awaiting_reload'],
  'the stub read state.json at invocation time: the §9.3 checkpoint already existed');
check('lifecycle: recorded claude command line',
  lifeCalls.filter((l) => l.startsWith('mcp add')),
  [`mcp add-json ${SERVER} -s user ${JSON.stringify({
    type: 'stdio',
    command: 'uvx',
    args: ['--from', PIN_SPEC, 'semble', '--content', 'code', 'docs', 'config'],
    env: { SEMBLE_CACHE_LOCATION: CACHE_CODE },
    alwaysLoad: true,
  })}`],
  'the exact approved argv reached the claude binary exactly once, via add-json');

check('lifecycle: guidance install exit', life.guid.status, 0, 'guidance installed after the add');
check('lifecycle: guidance artefacts on disk',
  [existsSync(join(LIFE, '.claude/rules/semble-first.md')),
    existsSync(join(LIFE, '.claude/hooks/semble-session.mjs')),
    existsSync(join(LIFE, '.claude/hooks/semble-prefetch.mjs')),
    existsSync(join(LIFE, '.claude/hooks/semble-stats.mjs')),
    existsSync(join(LIFE, '.claude/hooks/semble-reminder.mjs')),
    existsSync(join(LIFE, '.claude/hooks/semble-subagent.mjs'))],
  [true, true, true, true, true, true], 'rule + all five hook assets landed in the project');
check('lifecycle: hooks dir holds exactly the five current assets',
  readdirSync(join(LIFE, '.claude/hooks')).sort(),
  ['semble-prefetch.mjs', 'semble-reminder.mjs', 'semble-session.mjs',
    'semble-stats.mjs', 'semble-subagent.mjs'],
  'install --part all writes the whole want-table file set and leaves no retired v1 hook behind');
check('lifecycle: install wired the full want table',
  (() => { const h = safeParse(run(GUIDANCE_SH, ['status', '--json'], lifeEnv).stdout).hooks;
    return [h.wiredCount, h.wantCount]; })(),
  [6, 6], 'six settings entries over five files: stats spans PostToolUse + PostToolUseFailure');

// resume: a new session observes the live server, verifies, goes ready
run(STATE_SH, ['phase', 'verifying'], lifeEnv);
const lifeSmoke = run(PROJECT_SH, ['smoke', '--json'], lifeEnv);
check('lifecycle: smoke is skipped offline', safeParse(lifeSmoke.stdout).status, 'skipped',
  'SEMBLE_NO_NETWORK=1 => warm/smoke skipped, never a real uvx call (§12.3)');
const lifeReady = run(STATE_SH, ['phase', 'ready'], lifeEnv);
check('lifecycle: verifying -> ready', [lifeReady.status, stateOf(LIFE).phase], [0, 'ready'],
  'the real state machine allows the transition');

const lifeStrict = runStatus(['--json', '--strict'], lifeEnv);
const lifeReport = safeParse(lifeStrict.stdout);
check('lifecycle: status --strict exit', lifeStrict.status, 1,
  'the install is wired but unverified, so strict fails');
check('lifecycle: status completed', lifeReport.state.completed, ['mcp'],
  'the offline lifecycle recorded only the MCP step: warm/smoke were skipped and the remaining '
  + 'install steps are never recorded by the individual scripts');
check('lifecycle: status verdict', [lifeReport.verdict, lifeReport.nextStep],
  ['partial', 'Run /brewcode:semble-setup install'],
  'phase=ready alone no longer buys `ready`: with four install steps and the warm/smoke pair '
  + 'unrecorded the prescription is a full install');
check('lifecycle: no status section degraded',
  SECTIONS.filter((k) => hasError(lifeReport[k])), [],
  'the ready-state report is composed entirely from real siblings');
check('lifecycle: status agrees with the state file',
  [lifeReport.state.phase, lifeReport.state.present, lifeReport.mcp.state],
  ['ready', true, 'correct'], 'state and mcp sections match what the lifecycle wrote');

// disable -> enable
const lifeDis = run(PROJECT_SH, ['disable', '--json'], lifeEnv);
check('lifecycle: disable exit', lifeDis.status, 0, 'disable succeeds');
check('lifecycle: disabled state', [stateOf(LIFE).phase, stateOf(LIFE).enabled], ['disabled', false],
  'phase=disabled, enabled=false');
const disReport = safeParse(runStatus(['--json'], lifeEnv).stdout);
check('lifecycle: disabled verdict', [disReport.verdict, disReport.nextStep],
  ['disabled', 'Run /brewcode:semble-setup enable'], 'status reflects the disabled project immediately');
check('lifecycle: disable deleted nothing', existsSync(join(LIFE, '.claude/rules/semble-first.md')),
  true, 'the rule file survives a disable');

const lifeEn = run(PROJECT_SH, ['enable', '--yes', '--json'], lifeEnv);
const lifeEnJson = safeParse(lifeEn.stdout);
// Exit 3 is the SKIP code, not a failure: offline the warm proves nothing, so
// readiness stays unproven and the phase is deliberately parked at `verifying`.
check('lifecycle: enable exit', [lifeEn.status, lifeEn.stderr.slice(0, 300)], [3, ''],
  'enable skips (exit 3) on a warm that could not run, and still prints nothing on stderr');
check('lifecycle: enabled state', [stateOf(LIFE).phase, stateOf(LIFE).enabled], ['verifying', true],
  'disabled -> verifying, enabled=true; only a successful warm would carry it on to ready');
check('lifecycle: enable warm skipped', (lifeEnJson.warm || {}).status, 'skipped',
  'the warm inside enable never touches the network');
check('lifecycle: enable skip payload',
  [lifeEnJson.mode, lifeEnJson.status, lifeEnJson.phase, lifeEnJson.enabled, lifeEnJson.failed,
    lifeEnJson.warm.reason],
  ['enable', 'skipped', 'verifying', true, [], 'SEMBLE_NO_NETWORK=1'],
  'the skip is reported as skipped/verifying with an empty failed list and the exact warm reason');
check('lifecycle: enable skipped reasons', lifeEnJson.skipped,
  [`guidance: gitignore: no ${join(LIFE, '.gitignore')} and ${LIFE} is not a git repo`
    + ' - .claude/semble/ not registered',
  'warm: SEMBLE_NO_NETWORK=1',
  'state: phase left at verifying — no successful warm, so readiness is unproven'],
  'the guidance report is folded in verbatim under a `guidance: ` prefix, then enable adds its '
  + 'own warm skip and the phase-parked explanation');
check('lifecycle: enable folded the guidance report in',
  [lifeEnJson.changed.filter((l) => l.startsWith('guidance: ')).length,
    lifeEnJson.unchanged.filter((l) => l.startsWith('guidance: ')).length,
    lifeEnJson.skipped.filter((l) => l.startsWith('guidance: ')).length],
  [2, 9, 1],
  'sp_report_lines routes every guidance bucket into the matching enable bucket: 2 changed '
  + '(ignore re-sync + the install summary), 9 unchanged, 1 skipped');

// remove integration
const claudeJsonBefore = sha(LIFE_CJ);
const lifeRem = run(REMOVE_SH, ['integration', '--yes', '--json'], lifeEnv);
check('lifecycle: remove integration exit', lifeRem.status, 0, 'integration removal succeeds');
check('lifecycle: guidance + state removed',
  [existsSync(join(LIFE, '.claude/semble')),
    existsSync(join(LIFE, '.claude/rules/semble-first.md')),
    existsSync(join(LIFE, '.claude/hooks/semble-session.mjs')),
    existsSync(join(LIFE, '.claude/hooks/semble-prefetch.mjs')),
    existsSync(join(LIFE, '.claude/hooks/semble-stats.mjs')),
    existsSync(join(LIFE, '.claude/hooks/semble-reminder.mjs')),
    existsSync(join(LIFE, '.claude/hooks/semble-subagent.mjs'))],
  [false, false, false, false, false, false, false],
  'state dir, rule and all five hooks are gone');
check('lifecycle: no semble hook file survives the removal',
  readdirSync(join(LIFE, '.claude/hooks')).filter((f) => f.startsWith('semble-')).sort(), [],
  'remove integration sweeps the hooks dir by name, not by the three-file v1 list');
check('lifecycle: ~/.claude.json byte-identical', sha(LIFE_CJ), claudeJsonBefore,
  'remove integration leaves the MCP registration untouched');
check('lifecycle: claude mcp remove was never called',
  claudeCalls().filter((l) => l.startsWith('mcp remove')).length, 0,
  '`integration` must never deregister the server');
const afterRem = safeParse(runStatus(['--json'], lifeEnv).stdout);
check('lifecycle: post-removal verdict', [afterRem.verdict, afterRem.state.phase, afterRem.mcp.state],
  ['partial', 'absent', 'correct'],
  'the server is still registered while the project state is gone => partial');

// ═══════════════════════════════════════════════════════════════════════════
// 4. Read-only + external-world guarantees
// ═══════════════════════════════════════════════════════════════════════════
check('read-only: wrapped status runs', roRuns, 16,
  'every semble-status.sh invocation in this suite was snapshot-wrapped');
check('read-only: violations', roViolations, 0,
  'not one semble-status.sh run created, modified or deleted anything under the temp tree');
check('external: nothing outside the temp tree changed', extProbe(), EXT_BEFORE,
  'real ~/Library/Caches/semble*, ~/.claude/settings.json, ~/.claude.json mcpServers,'
  + ' repo .claude/settings.json and repo .claude/agents are all as they were');
// A hardcoded [false,false] asserts the developer machine has never installed
// semble, so it goes red forever after the first real run. The claim under test
// is that THIS suite created nothing - compare against the pre-suite probe.
check('external: no real semble cache was created',
  [existsSync(EXT.realCacheCode), existsSync(EXT.realCacheDocs)],
  [EXT_BEFORE.realCacheCode, EXT_BEFORE.realCacheDocs],
  'the injected cache roots were honoured; the production cache paths are as they were');
check('external: the stub absorbed every claude call',
  claudeCalls().filter((l) => l.startsWith('mcp ') || l === '--version').length,
  claudeCalls().filter((l) => !l.startsWith('phase-at-add=')).length,
  'every recorded claude invocation is an mcp subcommand or --version, all against the stub');

// ── report ──────────────────────────────────────────────────────────────────
for (const line of results) console.log(line);
console.log('');
console.log('| suite-integration | Value |');
console.log('|-------------------|-------|');
console.log(`| assertions | ${passed + failed} |`);
console.log(`| passed | ${passed} |`);
console.log(`| failed | ${failed} |`);
console.log(`| temp base | ${BASE} |`);
console.log(failed === 0 ? '✅ suite-integration passed' : `❌ suite-integration failed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
