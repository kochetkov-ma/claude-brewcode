#!/usr/bin/env node
// SKILL.md fences run in phase order against stub claude/curl/gh and a fixture marketplace clone -> golden reports.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = readFileSync(join(ROOT, 'SKILL.md'), 'utf8');
const fenceKey = body => (body.match(/"✅ (.+?) OK"/) || body.match(/(prune --dry-run)/) || [null, null])[1];
const FENCES = SKILL.split(/^(?=## )/m).flatMap(s => [...s.matchAll(/```bash\n([\s\S]*?)```/g)]
    .map(m => ({ phase: s.split('\n')[0].slice(3, 10), key: fenceKey(m[1]), body: m[1] })));
const NAMES = ['brewmod-placeholders', 'brewmod-plan-effort', 'brewmod-reminders', 'brewcode', 'brewdoc', 'brewtools', 'brewui'];
const ID = name => `${name}@claude-brewcode`;
const NOTES_URL = 'https://github.com/kochetkov-ma/claude-brewcode/blob/main/RELEASE-NOTES.md';
// One stub for claude, curl and gh: logs every call; claude keeps the inventory in STUB_STATE, curl serves the clone.
const STUB = `#!/usr/bin/env node
const fs = require('fs'), path = require('path');
const cmd = path.basename(process.argv[1]), args = process.argv.slice(2), cwd = fs.realpathSync(process.cwd());
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify({ cmd, cwd, args }) + '\\n');
const manifest = name => fs.readFileSync(path.join(process.env.STUB_MARKET, name, '.claude-plugin', 'plugin.json'), 'utf8');
const latest = id => JSON.parse(manifest(id.split('@')[0])).version;
const state = () => JSON.parse(fs.readFileSync(process.env.STUB_STATE, 'utf8'));
const save = rows => fs.writeFileSync(process.env.STUB_STATE, JSON.stringify(rows));
const here = r => r.id === args[2] && r.scope === args[4] && (['project', 'local'].includes(r.scope) ? r.projectPath === cwd : true);
const update = rows => rows.some(here) ? (save(rows.map(r => here(r) ? { ...r, version: latest(r.id) } : r)), 0) : 1;
const HANDLERS = {
  'curl': () => (process.stdout.write(manifest(args.at(-1).split('/').at(-3))), 0),
  'gh': () => 1,
  'claude --version': () => (process.stdout.write('2.1.301 (Claude Code)\\n'), 0),
  'claude plugin list --json': () => (process.stdout.write(JSON.stringify(state())), 0),
  'claude plugin marketplace update claude-brewcode': () => 0,
  'claude plugin update --scope': () => update(state()),
  'claude plugin install': () => (save([...state(), { id: args[2], version: latest(args[2]), scope: 'user', enabled: true }]), 0),
};
const shape = cmd === 'claude' ? [cmd, ...args.filter(a => a.startsWith('-') || !a.includes('@') && !['user', 'project', 'local', 'managed'].includes(a))].join(' ') : cmd;
process.exitCode = (HANDLERS[shape] || (() => (process.stderr.write('stub: unexpected ' + shape + '\\n'), 1)))();
`;
const RELEASE_NOTES = `# Release Notes

---

## v6.9.6 (2026-10-16)

> Docs: [plugin-update](https://doc-claude.brewcode.app/brewtools/skills/plugin-update/)

**What changed for you**

❗ **Update Claude Code first:** the mods need Claude Code 2.1.301 or newer.

- One run updates every installed plugin and mod.
- The report shows versions before and after.
- Next steps are numbered.
- A fourth bullet, hidden by the cap.

More: [release notes](https://example.test/notes)

### brewtools

#### Changed

- **plugin-update:** technical bullet, never shown.

## v6.9.0 (2026-10-10)

**What changed for you**

- Setup status shows every setup.
- Teams get an intent guard.

## v6.8.0 (2026-10-01)

**What changed for you**

❗ **Update Claude Code first:** older requirement, never shown.

- Codewords live in brewmod-placeholders.
- Plan mode raises effort.
Update: run the plugin update.

**Migration:**

- Install brewmod-placeholders to keep \`++r\`.

### brewcode

- technical, never shown

## v6.7.1 (2026-09-20)

**What changed for you**

- Excluded: the installed version is the lower bound.
`;

function put(file, body) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body));
}

// Fixture: marketplace clone at 6.9.6, a profile pointing at it, the project (stale guide), another project, a session cwd.
function fixture() {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'plugin-update-report-')));
    process.on('exit', () => rmSync(base, { recursive: true, force: true }));
    const fx = { base, bin: join(base, 'bin'), proj: join(base, 'proj'), other: join(base, 'other'), market: join(base, 'market'),
        session: join(base, 'session'), log: join(base, 'stub.log'), runs: 0 };
    for (const n of NAMES) put(join(fx.market, n, '.claude-plugin', 'plugin.json'), { name: n, version: '6.9.6' });
    put(join(fx.market, 'RELEASE-NOTES.md'), RELEASE_NOTES);
    put(join(base, 'profile', 'plugins', 'known_marketplaces.json'), { 'claude-brewcode': { installLocation: fx.market, autoUpdate: false } });
    const guide = '.claude/brewdoc/my-claude/20261001_my-claude-internal.md';
    put(join(fx.proj, guide), '---\ndoc_type: user\nversion: "6.9.5"\n---\n# guide\n');
    put(join(fx.proj, '.claude', 'brewdoc', 'INDEX.jsonl'), `${JSON.stringify({ ts: '2026-10-01T10:00:00', mode: 'internal', path: guide, title: 'g', version: '1.0' })}\n`);
    mkdirSync(fx.other);
    mkdirSync(fx.session);
    mkdirSync(join(base, 'tmp'));
    put(join(base, 'state.json'), [
        { id: ID('brewtools'), version: '6.7.1', scope: 'user', enabled: true },
        { id: ID('brewcode'), version: '6.7.1', scope: 'user', enabled: true },
        { id: ID('brewcode'), version: '6.7.1', scope: 'project', enabled: true, projectPath: fx.proj },
        { id: ID('brewcode'), version: '6.7.1', scope: 'project', enabled: true, projectPath: fx.other },
        { id: ID('brewdoc'), version: '6.9.6', scope: 'user', enabled: true },
        { id: 'other@mkt', version: '1.0.0', scope: 'user', enabled: true },
        { id: 'scratch@inline', version: 'unknown', scope: 'session', enabled: true },
    ]);
    for (const c of ['claude', 'curl', 'gh']) {
        put(join(fx.bin, c), STUB);
        chmodSync(join(fx.bin, c), 0o755);
    }
    return fx;
}

// Runs the one fence of `phase` marked `key`, tokens substituted as at skill load, from a session cwd != the project root.
function runFence(fx, phase, key, vars) {
    const hits = FENCES.filter(f => f.phase === phase && f.key === key);
    assert.equal(hits.length, 1, `exactly one ${phase} fence is marked ${key}`);
    const tokens = { '${CLAUDE_PLUGIN_ROOT}': join(ROOT, '..', '..'), '${CLAUDE_SKILL_DIR}': ROOT, '${CLAUDE_PROJECT_DIR}': fx.proj, ...vars };
    const script = join(fx.base, `fence-${fx.runs++}.sh`);
    writeFileSync(script, Object.entries(tokens).reduce((s, [t, v]) => s.replaceAll(t, v), hits[0].body));
    const r = spawnSync('/bin/bash', [script], {
        cwd: fx.session, encoding: 'utf8', timeout: 20000,
        env: { PATH: `${fx.bin}:${process.env.PATH}`, HOME: fx.base, TMPDIR: join(fx.base, 'tmp'), CLAUDE_CONFIG_DIR: join(fx.base, 'profile'),
            STUB_LOG: fx.log, STUB_STATE: join(fx.base, 'state.json'), STUB_MARKET: fx.market },
    });
    return { out: r.stdout, err: r.stderr };
}

// Plays one run like the model does: Phase 0 -> 6 per the mode, `answer` = the options picked in the Phase 3 question.
function play(mode, answer) {
    const fx = fixture();
    const outs = [], errs = [], vars = {};
    const step = (phase, key, extra = {}) => { const r = runFence(fx, phase, key, { ...vars, ...extra }); outs.push(r.out); errs.push(r.err); return r.out; };
    vars['<dir>'] = step('Phase 0', 'scratch').match(/^SCRATCH (.+)$/m)[1];
    step('Phase 0', 'list');
    const latest = { update: () => [step('Phase 1', 'marketplace update'), step('Phase 1', 'latest')], check: () => [step('Phase 1', 'fetch')] };
    latest[mode]();
    const plan = JSON.parse(step('Phase 2', 'plan', { '<mode>': mode }).split('\n')[0]);
    const fence = { user: 'update <id>', managed: 'update <id>', project: 'update <id> (<scope> <projectPath>)', local: 'update <id> (<scope> <projectPath>)' };
    const apply = { update: () => [
        ...plan.update.filter(u => !u.orphan).map(u => step('Phase 4', fence[u.scope], { '<id>': u.id, '<scope>': u.scope, '<projectPath>': u.projectPath })),
        ...[...plan.offers.mods, ...plan.offers.plugins].filter(o => answer.includes(o.name)).map(o => step('Phase 4', 'install <plugin>', { '<plugin>': o.name })),
        step('Phase 5', 'list'),
    ], check: () => [] };
    apply[mode]();
    const report = step('Phase 6', 'report');
    const norm = s => s.replaceAll(vars['<dir>'], '<dir>').replaceAll(fx.base, '<base>');
    return {
        markers: outs.flatMap(o => o.split('\n').filter(l => /^(SCRATCH|✅|❌)/.test(l))).map(norm),
        calls: readFileSync(fx.log, 'utf8').trim().split('\n').map(l => JSON.parse(l)).map(c => [c.cmd, norm(c.cwd), ...c.args.map(norm)].join(' ')),
        stderr: errs.join(''),
        report: norm(report.slice(0, report.lastIndexOf('\n', report.length - 2) + 1)),
    };
}

// The stub reports Claude Code 2.1.301, the mods floor: the ❗ requirement line stays hidden.
const WHAT_CHANGED = `### What changed for you (6.7.1 → 6.9.6)

- **v6.8.0 migration:** Install brewmod-placeholders to keep \`++r\`.
- **v6.9.6:** One run updates every installed plugin and mod.
- **v6.9.6:** The report shows versions before and after.
- **v6.9.6:** Next steps are numbered.
- **v6.9.0:** Setup status shows every setup.
- **v6.9.0:** Teams get an intent guard.
- **v6.8.0:** Codewords live in brewmod-placeholders.
- **v6.8.0:** Plan mode raises effort.
- *+1 more:* [release notes](${NOTES_URL})`;
const REFRESH = '🔵 **`/brewdoc:my-claude refresh`**: your installation guide `.claude/brewdoc/my-claude/20261001_my-claude-internal.md` is older than brewdoc **6.9.6**.';
const AUTO = '🔵 Auto-update is off for claude-brewcode: `/plugin` -> Marketplaces -> claude-brewcode -> **Enable auto-update**.';

// GIVEN outdated rows in 2 projects, missing mods and a stale guide WHEN `update` runs and the user picks placeholders THEN the golden report holds.
assert.deepEqual(play('update', ['brewmod-placeholders']), {
    markers: ['SCRATCH <dir>', '✅ scratch OK', '✅ list OK', '✅ marketplace update OK', '✅ latest OK', '✅ plan OK',
        `✅ update ${ID('brewcode')} OK`, `✅ update ${ID('brewcode')} (project <base>/other) OK`, `✅ update ${ID('brewcode')} (project <base>/proj) OK`,
        `✅ update ${ID('brewtools')} OK`, '✅ install brewmod-placeholders OK', '✅ list OK', '✅ report OK'],
    calls: [
        'claude <base>/session --version', 'claude <base>/session plugin list --json', 'claude <base>/session plugin marketplace update claude-brewcode',
        `claude <base>/session plugin update ${ID('brewcode')} --scope user`, `claude <base>/other plugin update ${ID('brewcode')} --scope project`,
        `claude <base>/proj plugin update ${ID('brewcode')} --scope project`, `claude <base>/session plugin update ${ID('brewtools')} --scope user`,
        `claude <base>/session plugin install ${ID('brewmod-placeholders')}`, 'claude <base>/session plugin list --json',
    ],
    stderr: '',
    report: `## 🟢 brewcode updated: 5 of 6 components

| Component | Before | After | |
|---|---|---|---|
| **brewmod-placeholders** | — | **6.9.6** | 🟢 installed |
| **brewmod-plan-effort** | — | — | ⚪ not installed |
| **brewmod-reminders** | — | — | ⚪ not installed |
| **brewcode** | 6.7.1 | **6.9.6** | 🟢 updated |
| **brewcode** (project: \`<base>/other\`) | 6.7.1 | **6.9.6** | 🟢 updated |
| **brewcode** (project: \`<base>/proj\`) | 6.7.1 | **6.9.6** | 🟢 updated |
| **brewdoc** | 6.9.6 | 6.9.6 | ⚪ already current |
| **brewtools** | 6.7.1 | **6.9.6** | 🟢 updated |
| **brewui** | — | — | ⚪ not installed |

🔵 **brewmod-plan-effort** is not installed (effort \`xhigh\` in plan mode): \`claude plugin install brewmod-plan-effort@claude-brewcode\`

🔵 **brewmod-reminders** is not installed (durable reminders that survive sessions): \`claude plugin install brewmod-reminders@claude-brewcode\`

🔵 **brewui** is not installed (placeholder for future UI tools, no skills yet): \`claude plugin install brewui@claude-brewcode\`

${WHAT_CHANGED}

### Next steps

1. 🔵 **\`/reload-plugins\`**: activates the new versions in this session (or \`exit\`, then \`claude\`).
2. 🔵 **\`/brewcode:setup-status upgrade\`**: brings this project's setups up to **6.9.6** in one run; repeat it in every project you use: \`<base>/other\`.
3. ${REFRESH}

${AUTO}
`,
}, 'THEN updates run per scope from each projectPath, the picked mod installs after them and the report is printed verbatim');

// GIVEN the same inventory WHEN `check` runs THEN no refresh, no update, no install: versions come from the stub fetch and the check golden holds.
assert.deepEqual(play('check', []), {
    markers: ['SCRATCH <dir>', '✅ scratch OK', '✅ list OK', '✅ fetch OK', '✅ plan OK', '✅ report OK'],
    calls: ['claude <base>/session --version', 'claude <base>/session plugin list --json',
        ...['brewcode', 'brewdoc', 'brewtools', 'brewui', 'brewmod-placeholders', 'brewmod-plan-effort', 'brewmod-reminders'].map(n => `curl <base>/session -sSL --max-time 10 https://raw.githubusercontent.com/kochetkov-ma/claude-brewcode/main/${n}/.claude-plugin/plugin.json`)],
    stderr: '',
    report: `## 🔵 brewcode check: 4 of 5 components can be updated

| Component | Installed | Latest | |
|---|---|---|---|
| **brewmod-placeholders** | — | 6.9.6 | ⚪ not installed |
| **brewmod-plan-effort** | — | 6.9.6 | ⚪ not installed |
| **brewmod-reminders** | — | 6.9.6 | ⚪ not installed |
| **brewcode** | 6.7.1 | **6.9.6** | 🔵 update available |
| **brewcode** (project: \`<base>/other\`) | 6.7.1 | **6.9.6** | 🔵 update available |
| **brewcode** (project: \`<base>/proj\`) | 6.7.1 | **6.9.6** | 🔵 update available |
| **brewdoc** | 6.9.6 | 6.9.6 | ⚪ already current |
| **brewtools** | 6.7.1 | **6.9.6** | 🔵 update available |
| **brewui** | — | 6.9.6 | ⚪ not installed |

🔵 **Moved:** the codewords \`++m\`, \`++a\`, \`++r\`, \`++rr\` and \`+++\` now come from **brewmod-placeholders**, not from brewtools. ([docs](https://doc-claude.brewcode.app/mods/placeholders/))

🔵 **brewmod-placeholders** is not installed (\`++r\` and other prompt blocks): \`claude plugin install brewmod-placeholders@claude-brewcode\`

🔵 **brewmod-plan-effort** is not installed (effort \`xhigh\` in plan mode): \`claude plugin install brewmod-plan-effort@claude-brewcode\`

🔵 **brewmod-reminders** is not installed (durable reminders that survive sessions): \`claude plugin install brewmod-reminders@claude-brewcode\`

🔵 **brewui** is not installed (placeholder for future UI tools, no skills yet): \`claude plugin install brewui@claude-brewcode\`

${WHAT_CHANGED}

### Next steps

1. 🔵 **\`/brewtools:plugin-update\`**: applies the 4 updates.
2. ${REFRESH}

${AUTO}
`,
}, 'THEN check reads the fetch map, takes notes and auto-update from the local clone and prints the check report verbatim');
console.log('suite-report: PASS');
