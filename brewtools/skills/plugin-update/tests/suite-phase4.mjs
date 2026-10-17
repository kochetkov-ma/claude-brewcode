#!/usr/bin/env node
// Phase 4 fences run against a stub `claude`: project/local rows update from their projectPath, not the session cwd.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'SKILL.md'), 'utf8');
const PHASE4 = SKILL.slice(SKILL.indexOf('## Phase 4'), SKILL.indexOf('## Phase 5'));
const FENCES = [...PHASE4.matchAll(/```bash\n([\s\S]*?)```/g)].map(m => m[1]);
const ID = 'brewcode@claude-brewcode';
const STUB = `#!/usr/bin/env node
const fs = require('fs');
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify({ cwd: fs.realpathSync(process.cwd()), args: process.argv.slice(2) }) + '\\n');
`;

const base = realpathSync(mkdtempSync(join(tmpdir(), 'plugin-update-phase4-')));
process.on('exit', () => rmSync(base, { recursive: true, force: true }));
const project = join(base, 'proj');
const session = join(base, 'session');
const bin = join(base, 'bin');
for (const d of [project, session, bin]) mkdirSync(d);
writeFileSync(join(bin, 'claude'), STUB);
chmodSync(join(bin, 'claude'), 0o755);

function runFence(fence, n) {
    const log = join(base, `stub-${n}.log`);
    const script = join(base, `fence-${n}.sh`);
    writeFileSync(script, fence.replaceAll('<id>', ID).replaceAll('<scope>', 'project').replaceAll('<projectPath>', project));
    const r = spawnSync('/bin/bash', [script], {
        cwd: session, encoding: 'utf8', timeout: 10000,
        env: { PATH: `${bin}:${process.env.PATH}`, STUB_LOG: log },
    });
    const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [];
    return { rc: r.status, stdout: r.stdout, calls };
}

// GIVEN a project row of another project WHEN the Phase 4 project-row fence runs from the session cwd THEN claude runs in projectPath with --scope project.
assert.deepEqual(FENCES.filter(f => f.includes('"<projectPath>"')).map(runFence), [{
    rc: 0,
    stdout: `✅ update ${ID} (project ${project}) OK\n`,
    calls: [{ cwd: project, args: ['plugin', 'update', ID, '--scope', 'project'] }],
}], 'THEN exactly one Phase 4 fence carries projectPath and it updates from that directory');

// GIVEN a project row whose projectPath is gone WHEN Phase 4 reaches it THEN it reports an orphan with the removal command and runs nothing.
assert.deepEqual(PHASE4.split('\n').filter(l => l.includes('orphan')), [
    '`projectPath` absent or not a directory: run nothing for that row; report `orphan <scope> install: <id> at <projectPath>` with the removal command `mkdir -p "<projectPath>" && cd "<projectPath>" && claude plugin uninstall "<id>" --scope "<scope>"`.',
], 'THEN Phase 4 states the orphan rule verbatim');

// GIVEN Phase 0 WHEN rows are read THEN projectPath is one of the kept fields.
assert.deepEqual(SKILL.split('\n').filter(l => l.includes('`projectPath` (`project`/`local` rows')), [
    '(may be `"unknown"`), `scope`, `enabled`, `projectPath` (`project`/`local` rows; other projects too).',
], 'THEN Phase 0 keeps projectPath for the Phase 4 update set');
const REF = file => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'references', file), 'utf8');
const COMMANDS = REF('update-commands.md');

// GIVEN the update references WHEN they template an update THEN project/local rows run from projectPath, user/managed rows keep --scope.
assert.deepEqual([...REF('update-prompt.md').split('\n'), ...COMMANDS.split('\n')].filter(l => l.includes('claude plugin update <id>')), [
    '3. for every brewcode/brewdoc/brewtools/brewui row, and every installed brewmod-placeholders/brewmod-plan-effort row (never install a missing mod), from step 1 with scope user or managed: claude plugin update <id> --scope <scope of that row>',
    '4. for every such row with scope project or local: (cd "<projectPath of that row>" && claude plugin update <id> --scope <scope of that row>); if that projectPath is not a directory, run nothing for it and report it as an orphan install',
    'claude plugin update <id> --scope <scope>      # user/managed rows, one per update[] row',
    '(cd "<projectPath>" && claude plugin update <id> --scope <scope>)      # project/local rows',
], 'THEN update-prompt.md and update-commands.md template project/local updates from projectPath, never the session cwd');

// GIVEN the update-commands.md chain WHEN its projectPath line runs from the session cwd THEN claude runs in projectPath.
assert.deepEqual(COMMANDS.split('\n').filter(l => l.startsWith('(cd "<projectPath>"')).map((l, n) => runFence(l, `ref-${n}`)), [{
    rc: 0,
    stdout: '',
    calls: [{ cwd: project, args: ['plugin', 'update', ID, '--scope', 'project'] }],
}], 'THEN the reference chain line updates from projectPath');
console.log('suite-phase4: PASS');
