#!/usr/bin/env node
/**
 * Suite E — project agent migration (scripts/semble-agents.sh).
 * Contract: DESIGN §9.9 + §11. Runs entirely inside an isolated temp base;
 * never touches the real ~/.claude, the repo tree or any cache.
 * Assertion policy: unconditional exact-equality checks with a description.
 */
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync,
  symlinkSync, rmSync, realpathSync, chmodSync, existsSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');
const SCRIPT = join(HERE, '..', 'scripts', 'semble-agents.sh');

// realpath: macOS /var is a symlink to /private/var and the script resolves it
const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'semble-agents-')));
let passed = 0;
let failed = 0;
const results = [];

// ── deep-equal primitive (utility, not test-body branching) ─────────────────
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

function run(args, env) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, SEMBLE_DRY_RUN: '', ...env },
    timeout: 20000,
  });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return { __PARSE_ERROR__: String(e), raw: str };
  }
}

// ── fixture helpers ─────────────────────────────────────────────────────────
function writeAgent(root, relPath, body) {
  const p = join(root, '.claude', 'agents', relPath);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
  return p;
}

function snapshotMd(root) {
  const dir = join(root, '.claude', 'agents');
  const out = {};
  const walk = (d, pre) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const rel = pre ? `${pre}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { walk(join(d, e.name), rel); continue; }
      if (!/\.md$/.test(e.name)) continue;
      out[rel] = readFileSync(join(d, e.name), 'utf8');
    }
  };
  walk(dir, '');
  return out;
}

// Every entry under .claude/agents, backups included — residue detector.
function listEntries(root) {
  const out = [];
  const walk = (d, pre) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const rel = pre ? `${pre}/${e.name}` : e.name;
      if (e.isDirectory() && !e.isSymbolicLink()) { walk(join(d, e.name), rel); continue; }
      out.push(rel);
    }
  };
  walk(join(root, '.claude', 'agents'), '');
  return out.sort();
}

const byPath = (files) => {
  const m = {};
  for (const f of files) m[f.path] = f;
  return m;
};

// Ownership record written by `apply`: state.json -> agentsPreExisting[scope][relpath]
const statePath = (root) => join(root, '.claude', 'semble', 'state.json');
const ledgerOf = (root) => safeParse(readFileSync(statePath(root), 'utf8')).agentsPreExisting;

const SEARCH = 'mcp__semble_code__search';
const RELATED = 'mcp__semble_code__find_related';
const ADD2 = [SEARCH, RELATED];
const crlf = (s) => s.replace(/\n/g, '\r\n');
const nCR = (s) => s.split('\r').length - 1;

// ────────────────────────────────────────────────────────────────────────────
// MAIN project: one fixture per `tools:` form. No conflicts here, so a full
// `apply --yes` must exit 0.
// ────────────────────────────────────────────────────────────────────────────
const P = join(BASE, 'main');
const ENV = { SEMBLE_PROJECT_ROOT: P, SEMBLE_TEST_HOME: join(BASE, 'home') };
mkdirSync(join(BASE, 'home'), { recursive: true });

const CASES = [
  {
    file: 'a-absent.md',
    before: '---\nname: a\ndescription: no tools key\n---\n\nBody text.\n',
    after: '---\nname: a\ndescription: no tools key\n---\n\nBody text.\n',
    action: 'unchanged', reason: 'inherits', style: 'absent', added: [],
  },
  {
    file: 'b-flow.md',
    before: '---\nname: b\ntools: [Read, Bash]\nmodel: sonnet\n---\nBody\n',
    after: `---\nname: b\ntools: [Read, Bash, ${SEARCH}, ${RELATED}]\nmodel: sonnet\n---\nBody\n`,
    action: 'changed', reason: 'added', style: 'flow', added: ADD2,
  },
  {
    file: 'c-block.md',
    before: '---\nname: c\ntools:\n    - Read\n    - Bash\nmodel: opus\n---\nBody\n',
    after: `---\nname: c\ntools:\n    - Read\n    - Bash\n    - ${SEARCH}\n    - ${RELATED}\nmodel: opus\n---\nBody\n`,
    action: 'changed', reason: 'added', style: 'block', added: ADD2,
  },
  {
    file: 'd-csv.md',
    before: '---\nname: d\ntools: Read, Write, Edit\n---\nBody\n',
    after: `---\nname: d\ntools: Read, Write, Edit, ${SEARCH}, ${RELATED}\n---\nBody\n`,
    action: 'changed', reason: 'added', style: 'csv', added: ADD2,
  },
  {
    file: 'e-csv-quoted-comment.md',
    before: '---\nname: e\ntools: "Read, Bash"   # keep this comment\n---\nBody\n',
    after: `---\nname: e\ntools: "Read, Bash, ${SEARCH}, ${RELATED}"   # keep this comment\n---\nBody\n`,
    action: 'changed', reason: 'added', style: 'csv', added: ADD2,
  },
  {
    file: 'f-empty-bare.md',
    before: '---\nname: f\ntools:\n---\nBody\n',
    after: `---\nname: f\ntools:\n  - ${SEARCH}\n  - ${RELATED}\n---\nBody\n`,
    action: 'changed', reason: 'added', style: 'empty', added: ADD2,
  },
  {
    file: 'g-empty-flow.md',
    before: '---\nname: g\ntools: []\n---\nBody\n',
    after: `---\nname: g\ntools: [${SEARCH}, ${RELATED}]\n---\nBody\n`,
    action: 'changed', reason: 'added', style: 'empty', added: ADD2,
  },
  {
    file: 'h-wildcard.md',
    before: '---\nname: h\ntools: "*"\n---\nBody\n',
    after: '---\nname: h\ntools: "*"\n---\nBody\n',
    action: 'unchanged', reason: 'already-allowed', style: 'wildcard', added: [],
  },
  {
    file: 'h2-wildcard-mcp.md',
    before: '---\nname: h2\ntools: [Read, mcp__semble_code__*]\n---\nBody\n',
    after: '---\nname: h2\ntools: [Read, mcp__semble_code__*]\n---\nBody\n',
    action: 'unchanged', reason: 'already-allowed', style: 'wildcard', added: [],
  },
  {
    file: 'i-partial.md',
    before: `---\nname: i\ntools: [Read, ${SEARCH}]\n---\nBody\n`,
    after: `---\nname: i\ntools: [Read, ${SEARCH}, ${RELATED}]\n---\nBody\n`,
    action: 'changed', reason: 'added', style: 'flow', added: [RELATED],
  },
  {
    file: 'i2-already.md',
    before: `---\nname: i2\ntools: [Read, ${SEARCH}, ${RELATED}]\n---\nBody\n`,
    after: `---\nname: i2\ntools: [Read, ${SEARCH}, ${RELATED}]\n---\nBody\n`,
    action: 'unchanged', reason: 'already-present', style: 'flow', added: [],
  },
  {
    file: 'j-crlf-flow.md',
    before: crlf('---\nname: j\ntools: [Read, Bash]\nmodel: haiku\n---\nBody\n'),
    after: crlf(`---\nname: j\ntools: [Read, Bash, ${SEARCH}, ${RELATED}]\nmodel: haiku\n---\nBody\n`),
    action: 'changed', reason: 'added', style: 'flow', added: ADD2,
  },
  {
    file: 'k-crlf-block.md',
    before: crlf('---\nname: k\ntools:\n  - Read\n  - Bash\n---\nBody\n'),
    after: crlf(`---\nname: k\ntools:\n  - Read\n  - Bash\n  - ${SEARCH}\n  - ${RELATED}\n---\nBody\n`),
    action: 'changed', reason: 'added', style: 'block', added: ADD2,
  },
  {
    file: 'l-mcpservers.md',
    before:
      '---\n# leading comment\nname: l\nmcpServers:\n  - semble_code\n\ntools: [Read]\ncolor: blue\n---\n\n## Prompt\n\nkeep me.\n',
    after:
      `---\n# leading comment\nname: l\nmcpServers:\n  - semble_code\n\ntools: [Read, ${SEARCH}, ${RELATED}]\ncolor: blue\n---\n\n## Prompt\n\nkeep me.\n`,
    action: 'changed', reason: 'added', style: 'flow', added: ADD2,
  },
  {
    file: 'm-dup-tools.md',
    before: '---\nname: m\ntools: [Read]\nmodel: sonnet\ntools: [Bash]\n---\nBody\n',
    after: '---\nname: m\ntools: [Read]\nmodel: sonnet\ntools: [Bash]\n---\nBody\n',
    action: 'skipped', reason: 'duplicate-tools-key', style: 'absent', added: [],
  },
  {
    file: 'n-no-frontmatter.md',
    before: '# Just markdown\n\ntools: [Read]\n',
    after: '# Just markdown\n\ntools: [Read]\n',
    action: 'skipped', reason: 'no-frontmatter', style: 'absent', added: [],
  },
  {
    file: 'o-unterminated.md',
    before: '---\nname: o\ntools: [Read]\nBody without a closing fence\n',
    after: '---\nname: o\ntools: [Read]\nBody without a closing fence\n',
    action: 'skipped', reason: 'unterminated-frontmatter', style: 'absent', added: [],
  },
  {
    file: 'p-bom.md',
    before: '﻿---\nname: p\ntools: [Read]\n---\nBody\n',
    after: `﻿---\nname: p\ntools: [Read, ${SEARCH}, ${RELATED}]\n---\nBody\n`,
    action: 'changed', reason: 'added', style: 'flow', added: ADD2,
  },
  {
    file: 'sub/q-nested.md',
    before: '---\nname: q\ntools: [Read]\n---\nBody\n',
    after: `---\nname: q\ntools: [Read, ${SEARCH}, ${RELATED}]\n---\nBody\n`,
    action: 'changed', reason: 'added', style: 'flow', added: ADD2,
  },
  {
    file: 't-disallowed-unrelated.md',
    before: '---\nname: t\ntools: [Read]\ndisallowedTools: [WebFetch, WebSearch]\n---\nBody\n',
    after: `---\nname: t\ntools: [Read, ${SEARCH}, ${RELATED}]\ndisallowedTools: [WebFetch, WebSearch]\n---\nBody\n`,
    action: 'changed', reason: 'added', style: 'flow', added: ADD2,
  },
  {
    file: 'u-no-final-newline.md',
    before: '---\nname: u\ntools: [Read]\n---\nBody without trailing newline',
    after: `---\nname: u\ntools: [Read, ${SEARCH}, ${RELATED}]\n---\nBody without trailing newline`,
    action: 'changed', reason: 'added', style: 'flow', added: ADD2,
  },
];

for (const c of CASES) writeAgent(P, c.file, c.before);
writeAgent(P, 's-too-large.md', `---\nname: s\ntools: [Read]\n---\n${'x'.repeat(600 * 1024)}\n`);
symlinkSync(join(P, '.claude', 'agents', 'b-flow.md'), join(P, '.claude', 'agents', 'r-symlink.md'));

const beforeTree = snapshotMd(P);
const beforeEntries = listEntries(P);

// ── audit: read-only, exact per-file predictions ────────────────────────────
const auditRes = run(['audit', '--json'], ENV);
const audit = safeParse(auditRes.stdout);
check('audit.exit', auditRes.status, 0, 'audit always exits 0');
check('audit.schema', audit.schema, 1, 'schema version is exactly 1');
check('audit.scope', audit.scope, 'project', 'default scope is project');
check('audit.root', audit.root, P, 'root is the resolved project root');
check(
  'audit.keys',
  Object.keys(audit).sort(),
  ['files', 'root', 'schema', 'scope', 'summary', 'total'],
  'top-level keys are exactly the §9.9 set',
);
check('audit.total', audit.total, CASES.length + 2, 'total = fixtures + too-large + symlink');
check('audit.files.length', audit.files.length, audit.total, 'files array length equals total');
check(
  'audit.sorted',
  audit.files.map((f) => f.path),
  audit.files.map((f) => f.path).slice().sort(),
  'files are sorted by path',
);
check(
  'audit.entryKeys',
  Object.keys(audit.files.find((f) => f.path.endsWith('b-flow.md'))).sort(),
  ['action', 'added', 'backup', 'path', 'reason', 'toolsStyle'],
  'per-file keys are exactly the §9.9 set when no note applies',
);

const A = byPath(audit.files);
for (const c of CASES) {
  const key = `.claude/agents/${c.file}`;
  const e = A[key] || {};
  check(`audit.action[${c.file}]`, e.action, c.action, 'predicted action matches §11.3');
  check(`audit.reason[${c.file}]`, e.reason, c.reason, 'predicted reason matches §11.3');
  check(`audit.style[${c.file}]`, e.toolsStyle, c.style, 'detected tools style');
  check(`audit.added[${c.file}]`, e.added, c.added, 'exact list of names to add');
  check(`audit.backup[${c.file}]`, e.backup, '', 'audit never creates a backup');
}
check('audit.symlink', A['.claude/agents/r-symlink.md'].reason, 'symlink', 'symlinked .md is skipped');
check('audit.symlink.action', A['.claude/agents/r-symlink.md'].action, 'skipped', 'symlink action is skipped');
check('audit.tooLarge', A['.claude/agents/s-too-large.md'].reason, 'too-large', '>512 KB is skipped');
check(
  'audit.summary',
  audit.summary,
  { changed: 14, unchanged: 4, conflict: 0, skipped: 5, failed: 0 },
  'exact summary counts over the fixture set',
);
check('audit.noWrite', snapshotMd(P), beforeTree, 'audit changed zero bytes');

// ── apply without --yes: exit 4, nothing written ────────────────────────────
const plan = run(['apply'], ENV);
check('plan.exit', plan.status, 4, 'apply without --yes exits exactly 4');
check('plan.noWrite', snapshotMd(P), beforeTree, 'apply without --yes wrote nothing');
check(
  'plan.warns',
  plan.stdout.includes('--yes required'),
  true,
  'plan output states that --yes is required',
);

// ── dry run ─────────────────────────────────────────────────────────────────
const dry = run(['apply', '--yes'], { ...ENV, SEMBLE_DRY_RUN: '1' });
check('dry.exit', dry.status, 0, 'SEMBLE_DRY_RUN=1 exits 0');
check('dry.noWrite', snapshotMd(P), beforeTree, 'dry run wrote nothing');
check('dry.prefix', dry.stdout.includes('DRY '), true, 'dry run prefixes mutations with DRY');
check(
  'readOnly.noState',
  existsSync(statePath(P)),
  false,
  'neither audit nor a dry run creates state.json — only a real apply records ownership',
);

// ── apply ───────────────────────────────────────────────────────────────────
const applyRes = run(['apply', '--yes', '--json'], ENV);
const applied = safeParse(applyRes.stdout);
check('apply.exit', applyRes.status, 0, 'apply with no conflicts exits 0');
check(
  'apply.summary',
  applied.summary,
  { changed: 14, unchanged: 4, conflict: 0, skipped: 5, failed: 0 },
  'apply summary equals the audit prediction',
);

const afterTree = snapshotMd(P);
for (const c of CASES) {
  check(`apply.bytes[${c.file}]`, afterTree[c.file], c.after, 'resulting file bytes are exact');
}
const AP = byPath(applied.files);
check(
  'apply.backup.cleared',
  AP['.claude/agents/b-flow.md'].backup,
  '',
  'a verified write reports no backup — the transient copy is gone',
);
check(
  'apply.backup.noResidue',
  listEntries(P),
  beforeEntries,
  'apply leaves the agents dir with exactly its original entries, no .bak.* sibling',
);
check(
  'apply.emptyNote',
  AP['.claude/agents/f-empty-bare.md'].note,
  'tools: was an empty allowlist — this agent now has ONLY mcp__semble_code__search and mcp__semble_code__find_related',
  'the empty-allowlist narrowing is reported as a note',
);

// ── ownership record (SS04) ─────────────────────────────────────────────────
// Whatever `apply` did NOT insert must survive `--revert`; the record is what
// makes that decidable.
const LEDGER1 = ledgerOf(P);
const LEDGER_EXPECTED = {
  '.claude/agents/b-flow.md': [],
  '.claude/agents/c-block.md': [],
  '.claude/agents/d-csv.md': [],
  '.claude/agents/e-csv-quoted-comment.md': [],
  '.claude/agents/f-empty-bare.md': [],
  '.claude/agents/g-empty-flow.md': [],
  '.claude/agents/h-wildcard.md': [],
  '.claude/agents/h2-wildcard-mcp.md': [],
  '.claude/agents/i-partial.md': [SEARCH],
  '.claude/agents/i2-already.md': [SEARCH, RELATED],
  '.claude/agents/j-crlf-flow.md': [],
  '.claude/agents/k-crlf-block.md': [],
  '.claude/agents/l-mcpservers.md': [],
  '.claude/agents/p-bom.md': [],
  '.claude/agents/sub/q-nested.md': [],
  '.claude/agents/t-disallowed-unrelated.md': [],
  '.claude/agents/u-no-final-newline.md': [],
};
// One full-object comparison: the scope key, all 17 recorded paths and the
// pre-existing list of every one of them, in a single assertion.
check('ledger.project', LEDGER1, { project: LEDGER_EXPECTED },
  'apply records under exactly its own scope, exactly the 17 files with an editable tools list,'
  + ' and for each the names that were already there - a wildcard is neither of the two names,'
  + ' so it records as nothing pre-existing and revert may strip nothing the user authored');

// ── no mcpServers key is ever introduced (§11.2) ────────────────────────────
const mcpAdded = Object.keys(afterTree).filter(
  (k) => afterTree[k].includes('mcpServers') && !beforeTree[k].includes('mcpServers'),
);
check('apply.noMcpServersKey', mcpAdded, [], 'no file gained an mcpServers key');
check(
  'apply.mcpServersPreserved',
  afterTree['l-mcpservers.md'].split('mcpServers:\n  - semble_code\n').length,
  2,
  'an existing mcpServers block survives byte-for-byte',
);

// ── CRLF preservation ───────────────────────────────────────────────────────
check(
  'crlf.flow.cr',
  nCR(afterTree['j-crlf-flow.md']),
  nCR(CASES.find((c) => c.file === 'j-crlf-flow.md').before),
  'CRLF flow file keeps exactly its original CR count',
);
check(
  'crlf.block.cr',
  nCR(afterTree['k-crlf-block.md']),
  nCR(CASES.find((c) => c.file === 'k-crlf-block.md').before) + 2,
  'CRLF block file gains exactly 2 CRs (the 2 inserted lines)',
);
check(
  'crlf.noLoneLf',
  /[^\r]\n/.test(afterTree['k-crlf-block.md']),
  false,
  'no bare LF was introduced into a CRLF file',
);
check(
  'lf.noCr',
  nCR(afterTree['c-block.md']),
  0,
  'an LF-only file never gains a CR',
);

// ── idempotency ─────────────────────────────────────────────────────────────
const again = run(['apply', '--yes', '--json'], ENV);
const again2 = safeParse(again.stdout);
check('again.exit', again.status, 0, 'second apply exits 0');
check(
  'again.summary',
  again2.summary,
  { changed: 0, unchanged: 18, conflict: 0, skipped: 5, failed: 0 },
  'second apply reports zero changed',
);
check('again.bytes', snapshotMd(P), afterTree, 'second apply is byte-identical');
check(
  'again.noBackup',
  again2.files.filter((f) => f.backup !== '').length,
  0,
  'second apply creates no backups',
);
check(
  'again.ledger',
  ledgerOf(P),
  LEDGER1,
  'the second apply keeps the first observation — it never re-reads its own insertions as user-authored',
);

// ── revert ──────────────────────────────────────────────────────────────────
const rev = run(['apply', '--yes', '--revert', '--json'], ENV);
const rev2 = safeParse(rev.stdout);
check('revert.exit', rev.status, 0, 'revert exits 0');
check(
  'revert.summary',
  rev2.summary,
  { changed: 14, unchanged: 4, conflict: 0, skipped: 5, failed: 0 },
  'revert changes exactly the 14 files apply changed; a file whose names were all user-authored is unchanged',
);
const revTree = snapshotMd(P);
// Byte-exact restore for EVERY changed file, pre-existing names included: the
// ledger tells revert which names it may strip.
const REVERT_EXACT = CASES.filter((c) => c.action === 'changed');
for (const c of REVERT_EXACT) {
  check(`revert.bytes[${c.file}]`, revTree[c.file], c.before, 'revert restores the pre-apply bytes exactly');
}
check(
  'revert.emptyBare',
  revTree['f-empty-bare.md'],
  '---\nname: f\ntools:\n---\nBody\n',
  'a bare `tools:` round-trips byte-exactly: apply writes a block seq, revert deletes those lines',
);
check(
  'revert.emptyFlow',
  revTree['g-empty-flow.md'],
  '---\nname: g\ntools: []\n---\nBody\n',
  'an empty flow list round-trips byte-exactly and is never normalised to a bare `tools:`',
);
check(
  'cycle.noBakResidue',
  listEntries(P),
  beforeEntries,
  'after apply/apply/revert the agents dir holds exactly the entries it started with',
);
check(
  'cycle.noBakSiblings',
  listEntries(P).filter((n) => n.includes('.bak.')),
  [],
  'no .bak.* file survives an apply/apply/revert cycle',
);
check(
  'revert.preExistingPartial',
  revTree['i-partial.md'],
  `---\nname: i\ntools: [Read, ${SEARCH}]\n---\nBody\n`,
  'revert removes only find_related and keeps the search name the user authored before install',
);
check(
  'revert.preExistingBoth',
  revTree['i2-already.md'],
  `---\nname: i2\ntools: [Read, ${SEARCH}, ${RELATED}]\n---\nBody\n`,
  'a file that already carried both names is left byte-identical — this skill added neither',
);
const RV = byPath(rev2.files);
check(
  'revert.preExistingPartial.reason',
  [RV['.claude/agents/i-partial.md'].action, RV['.claude/agents/i-partial.md'].reason, RV['.claude/agents/i-partial.md'].added],
  ['changed', 'removed', [RELATED]],
  'the partial file reports exactly the one name this skill had added',
);
check(
  'revert.preExistingPartial.note',
  RV['.claude/agents/i-partial.md'].note,
  `kept ${SEARCH} — authored before install`,
  'the kept user-authored name is named in the note',
);
check(
  'revert.preExistingBoth.reason',
  [RV['.claude/agents/i2-already.md'].action, RV['.claude/agents/i2-already.md'].reason, RV['.claude/agents/i2-already.md'].added],
  ['unchanged', 'not-present', []],
  'a file this skill never wrote to is unchanged with an empty removal list',
);
check(
  'revert.preExistingBoth.note',
  RV['.claude/agents/i2-already.md'].note,
  `kept ${SEARCH} ${RELATED} — authored before install`,
  'both kept names are reported',
);
for (const c of CASES.filter((x) => x.action !== 'changed')) {
  check(`revert.untouched[${c.file}]`, revTree[c.file], c.before, 'revert leaves non-migrated files alone');
}

// ────────────────────────────────────────────────────────────────────────────
// No record at all (revert without a preceding apply, or a state.json from an
// older version): authorship is unknown, so nothing may be stripped.
// ────────────────────────────────────────────────────────────────────────────
const PN = join(BASE, 'norecord');
const ENVN = { SEMBLE_PROJECT_ROOT: PN, SEMBLE_TEST_HOME: join(BASE, 'home') };
writeAgent(PN, 'n1.md', `---\nname: n1\ntools: [Read, ${SEARCH}, ${RELATED}]\n---\nBody\n`);
const nBefore = snapshotMd(PN);
const nRev = run(['apply', '--yes', '--revert', '--json'], ENVN);
const nJson = safeParse(nRev.stdout);
check('noRecord.exit', nRev.status, 0, 'a revert with no record exits 0');
check(
  'noRecord.summary',
  nJson.summary,
  { changed: 0, unchanged: 1, conflict: 0, skipped: 0, failed: 0 },
  'nothing is changed when the ownership record is missing',
);
check(
  'noRecord.reason',
  [nJson.files[0].action, nJson.files[0].reason, nJson.files[0].added],
  ['unchanged', 'not-owned', []],
  'the file is reported as not-owned rather than stripped blind',
);
check(
  'noRecord.note',
  nJson.files[0].note,
  'no record of what this skill added here — nothing was removed',
  'the reason for declining is stated',
);
check('noRecord.bytes', snapshotMd(PN), nBefore, 'a revert with no record leaves every byte in place');
check('noRecord.noState', existsSync(statePath(PN)), false, 'revert never writes state.json');

// ────────────────────────────────────────────────────────────────────────────
// CONFLICT project: disallowedTools must never be silently overridden.
// ────────────────────────────────────────────────────────────────────────────
const PC = join(BASE, 'conflict');
const ENVC = { SEMBLE_PROJECT_ROOT: PC, SEMBLE_TEST_HOME: join(BASE, 'home') };
const CONFLICTS = {
  'x-flow.md': '---\nname: x\ntools: [Read]\ndisallowedTools: [mcp__*]\n---\nBody\n',
  'y-block.md':
    `---\nname: y\ntools: [Read]\ndisallowedTools:\n  - ${SEARCH}\n  - Write\n---\nBody\n`,
  'z-csv.md': '---\nname: z\ntools: [Read]\ndisallowedTools: mcp__semble_code__*\n---\nBody\n',
};
for (const [f, body] of Object.entries(CONFLICTS)) writeAgent(PC, f, body);
const cBefore = snapshotMd(PC);

const cAudit = safeParse(run(['audit', '--json'], ENVC).stdout);
check(
  'conflict.summary',
  cAudit.summary,
  { changed: 0, unchanged: 0, conflict: 3, skipped: 0, failed: 0 },
  'every disallowedTools form is detected as a conflict',
);
check(
  'conflict.reason',
  cAudit.files.map((f) => f.reason),
  ['disallowed-tools', 'disallowed-tools', 'disallowed-tools'],
  'conflict reason is exactly disallowed-tools',
);
check(
  'conflict.note',
  byPath(cAudit.files)['.claude/agents/x-flow.md'].note,
  'disallowedTools: [mcp__*]',
  'the exact offending line is reported',
);
const cApply = run(['apply', '--yes'], ENVC);
check('conflict.applyExit', cApply.status, 3, 'apply with conflicts exits 3');
check('conflict.noWrite', snapshotMd(PC), cBefore, 'a conflicting file is never written');

// ────────────────────────────────────────────────────────────────────────────
// Scope, usage and empty-tree behaviour
// ────────────────────────────────────────────────────────────────────────────
const HOME = join(BASE, 'globalhome');
writeAgent(HOME, 'g-global.md', '---\nname: g\ntools: [Read]\n---\nBody\n');
const gBefore = snapshotMd(HOME);
const gEnv = { SEMBLE_PROJECT_ROOT: P, SEMBLE_TEST_HOME: HOME };

const gAudit = safeParse(run(['audit', '--scope', 'global', '--json'], gEnv).stdout);
check('global.root', gAudit.root, HOME, 'global scope roots at the effective HOME');
check('global.scope', gAudit.scope, 'global', 'scope is reported as global');
check('global.total', gAudit.total, 1, 'global audit sees exactly the one global agent');

const gPlan = run(['apply', '--scope', 'global'], gEnv);
check('global.applyExit', gPlan.status, 4, 'apply --scope global without --yes exits 4');
check('global.noWrite', snapshotMd(HOME), gBefore, 'global agents are untouched without --yes');

const projAudit = safeParse(run(['audit', '--json'], gEnv).stdout);
check(
  'default.notGlobal',
  projAudit.files.filter((f) => f.path === '.claude/agents/g-global.md').length,
  0,
  'the default project scope never reaches a global agent',
);

const gYes = run(['apply', '--scope', 'global', '--yes', '--json'], gEnv);
check('global.yesExit', gYes.status, 0, 'apply --scope global --yes exits 0');
check(
  'global.yesBytes',
  snapshotMd(HOME)['g-global.md'],
  `---\nname: g\ntools: [Read, ${SEARCH}, ${RELATED}]\n---\nBody\n`,
  'global apply behind --yes writes the same transformation',
);
const LEDGER2 = ledgerOf(P);
check(
  'ledger.globalScope',
  Object.keys(LEDGER2).sort(),
  ['global', 'project'],
  'a global apply records under its own scope key and leaves the project map alone',
);
check(
  'ledger.globalPaths',
  LEDGER2.global,
  { '.claude/agents/g-global.md': [] },
  'the global map is keyed relative to the global root',
);
check('ledger.projectIntact', LEDGER2.project, LEDGER1.project, 'the project map survives a global apply byte-for-byte');

const empty = join(BASE, 'emptyproj');
mkdirSync(empty, { recursive: true });
const emptyAudit = run(['audit', '--json'], { SEMBLE_PROJECT_ROOT: empty, SEMBLE_TEST_HOME: HOME });
const emptyJson = safeParse(emptyAudit.stdout);
check('empty.exit', emptyAudit.status, 0, 'a project with no .claude/agents still exits 0');
check('empty.total', emptyJson.total, 0, 'total is exactly 0');
check('empty.files', emptyJson.files, [], 'files is an empty array');
check(
  'empty.summary',
  emptyJson.summary,
  { changed: 0, unchanged: 0, conflict: 0, skipped: 0, failed: 0 },
  'all summary counters are 0',
);

check('usage.noMode', run([], ENV).status, 2, 'no subcommand exits 2');
check('usage.badFlag', run(['audit', '--nope'], ENV).status, 2, 'an unknown flag exits 2');
check('usage.badScope', run(['audit', '--scope', 'user'], ENV).status, 2, 'an unknown scope exits 2');
check('usage.revertAudit', run(['audit', '--revert'], ENV).status, 2, '--revert is rejected for audit');
check('usage.help', run(['--help'], ENV).status, 0, '--help exits 0');
check(
  'json.singleObject',
  safeParse(run(['audit', '--json'], ENV).stdout).__PARSE_ERROR__,
  undefined,
  '--json prints one parseable JSON object and nothing else',
);

// ────────────────────────────────────────────────────────────────────────────
// Failure path: a write that cannot happen must report `failed` and damage
// nothing (read-only agents dir -> the backup copy itself fails).
// ────────────────────────────────────────────────────────────────────────────
const PF = join(BASE, 'readonly');
writeAgent(PF, 'w-locked.md', '---\nname: w\ntools: [Read]\n---\nBody\n');
const fBefore = snapshotMd(PF);
chmodSync(join(PF, '.claude', 'agents'), 0o500);
const fRes = run(['apply', '--yes', '--json'], { SEMBLE_PROJECT_ROOT: PF, SEMBLE_TEST_HOME: HOME });
const fJson = safeParse(fRes.stdout);
chmodSync(join(PF, '.claude', 'agents'), 0o700);
check('failed.exit', fRes.status, 1, 'a failed write exits 1');
check(
  'failed.summary',
  fJson.summary,
  { changed: 0, unchanged: 0, conflict: 0, skipped: 0, failed: 1 },
  'the file is reported as failed',
);
check('failed.reason', fJson.files[0].reason, 'write-error', 'the failure reason is write-error');
check('failed.bytes', snapshotMd(PF), fBefore, 'a failed write leaves the file byte-identical');

// ────────────────────────────────────────────────────────────────────────────
// Backup lifecycle: a mixed-EOL file (CRLF header, LF tools block) makes the
// inserted LF lines fail the EOL arithmetic — the one moment a backup matters.
// ────────────────────────────────────────────────────────────────────────────
const PV = join(BASE, 'verifyfail');
const V_BEFORE = '---\r\nname: v\r\ndescription: mixed eol\r\ntools:\n  - Read\n---\r\nBody\r\n';
writeAgent(PV, 'v-broken.md', V_BEFORE);
const vRes = run(['apply', '--yes', '--json'], { SEMBLE_PROJECT_ROOT: PV, SEMBLE_TEST_HOME: HOME });
const vJson = safeParse(vRes.stdout);
check('verifyFail.exit', vRes.status, 1, 'a verification mismatch exits 1');
check(
  'verifyFail.summary',
  vJson.summary,
  { changed: 0, unchanged: 0, conflict: 0, skipped: 0, failed: 1 },
  'the file is reported as failed',
);
check('verifyFail.reason', vJson.files[0].reason, 'verify-mismatch', 'the reason is verify-mismatch');
check('verifyFail.note', vJson.files[0].note, 'eol-style-drift', 'the exact verification that failed');
check(
  'verifyFail.restored',
  snapshotMd(PV)['v-broken.md'],
  V_BEFORE,
  'the pre-apply bytes are restored from the backup',
);
check(
  'verifyFail.backupKept',
  readFileSync(vJson.files[0].backup, 'utf8'),
  V_BEFORE,
  'the backup is kept on failure and holds the pre-apply bytes',
);
check(
  'verifyFail.backupCount',
  listEntries(PV).filter((n) => n.includes('.bak.')).length,
  1,
  'exactly one backup remains, for the one file that failed',
);

// ────────────────────────────────────────────────────────────────────────────
// Byte-preservation proof: everything outside the `tools:` line is identical.
// ────────────────────────────────────────────────────────────────────────────
const stripToolsRegion = (s) => {
  const lines = s.split(/(?<=\n)/);
  const out = [];
  let inTools = false;
  for (const l of lines) {
    const c = l.replace(/\r?\n$/, '');
    const isTools = /^tools\s*:/.test(c);
    const isItem = /^\s+-\s/.test(c);
    if (isTools) { inTools = true; continue; }
    if (inTools && isItem) continue;
    inTools = false;
    out.push(l);
  }
  return out.join('');
};
for (const c of CASES) {
  check(
    `preserve[${c.file}]`,
    stripToolsRegion(afterTree[c.file]),
    stripToolsRegion(c.before),
    'every byte outside the tools declaration is unchanged',
  );
}

// ── report ──────────────────────────────────────────────────────────────────
rmSync(BASE, { recursive: true, force: true });
console.log('suite-agents.mjs');
for (const line of results) console.log(line);
console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
