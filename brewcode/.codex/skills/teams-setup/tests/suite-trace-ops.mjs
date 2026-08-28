#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  chmodSync, copyFileSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync,
  symlinkSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');
const TRACE_OPS = join(HERE, '..', 'scripts', 'trace-ops.sh');
const BASE = mkdtempSync(join(tmpdir(), 'trace-ops-test-'));
let passed = 0;
let failed = 0;
const results = [];

function check(name, actual, expected, description) {
  if (actual === expected) {
    passed += 1;
    results.push(`  PASS  ${name}  (${description})`);
  } else {
    failed += 1;
    results.push(
      `  FAIL  ${name}  (${description} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`,
    );
  }
}

function newTeam(tag) {
  const dir = join(BASE, tag);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'trace.jsonl'), '');
  return dir;
}

function add(teamDir, sid, agent, text) {
  return spawnSync(
    'sh',
    [TRACE_OPS, 'add', teamDir, sid, agent, 'track', 'completed', text],
    { encoding: 'utf8', timeout: 8000 },
  );
}

function parseSingleLine(teamDir) {
  const lines = readFileSync(join(teamDir, 'trace.jsonl'), 'utf8').trimEnd().split('\n');
  return { count: lines.length, value: JSON.parse(lines[0]) };
}

function decodeEscapedJsonString(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return '';
  }
}

function commandShim(tag, name, body) {
  const dir = join(BASE, `${tag}-bin`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\nset -eu\n${body}\n`);
  chmodSync(path, 0o755);
  return dir;
}

const c0WithoutNul = Array.from({ length: 31 }, (_, index) => String.fromCharCode(index + 1)).join('');

{
  // GIVEN: raw bytes for the complete C0 range; NUL cannot travel in a process argv,
  // but it can reach the exact stdin encoder used by every trace field.
  const script = readFileSync(TRACE_OPS, 'utf8');
  const begin = `  printf '%s' "$1" | run_node -e '\n`;
  const end = `\n' "$_json_limit" || die "trace-ops: JSON encoding failed"`;
  const beginAt = script.indexOf(begin);
  const endAt = script.indexOf(end, beginAt + begin.length);
  const encoder = script.slice(beginAt + begin.length, endAt);
  const controls = Buffer.from(Array.from({ length: 32 }, (_, index) => index));
  // WHEN: that production encoder receives U+0000 through U+001F as raw UTF-8.
  const result = spawnSync(process.execPath, ['-e', encoder, ''], { input: controls, encoding: 'utf8' });
  const decoded = decodeEscapedJsonString(result.stdout);
  // THEN: the escaped output parses back to the exact complete range.
  check('allC0.encoderLocated', beginAt >= 0 && endAt > beginAt, true, 'production encoder is located exactly');
  check('allC0.exit', result.status, 0, 'production encoder accepts the complete C0 range');
  check(
    'allC0.roundTrip',
    JSON.stringify(Array.from(decoded, (char) => char.charCodeAt(0))),
    JSON.stringify(Array.from({ length: 32 }, (_, index) => index)),
    'U+0000 through U+001F round-trip through JSON.parse',
  );
}

{
  // GIVEN: a copied project helper, a bounded resolver, and hostile PATH/Node preload inputs.
  const projectRoot = join(BASE, 'bounded-project');
  const teamDir = join(projectRoot, '.codex', 'teams', 'unit');
  const resolver = join(projectRoot, '.codex', 'scripts', 'toolchain_preflight.py');
  const shadowDir = join(projectRoot, 'shadow-bin');
  const boundedMarker = join(projectRoot, 'bounded-used');
  const shadowMarker = join(projectRoot, 'shadow-used');
  const preloadMarker = join(projectRoot, 'preload-used');
  const preload = join(projectRoot, 'preload.cjs');
  mkdirSync(teamDir, { recursive: true });
  mkdirSync(join(projectRoot, '.codex', 'scripts'), { recursive: true });
  mkdirSync(shadowDir, { recursive: true });
  copyFileSync(TRACE_OPS, join(teamDir, 'trace-ops.sh'));
  chmodSync(join(teamDir, 'trace-ops.sh'), 0o755);
  writeFileSync(join(teamDir, 'trace.jsonl'), '');
  writeFileSync(preload, `require('node:fs').writeFileSync(${JSON.stringify(preloadMarker)}, 'bad');\n`);
  writeFileSync(
    resolver,
    `#!/bin/sh\nset -eu\n[ "$1" = exec ] && [ "$2" = node ] && [ "$3" = -- ]\nshift 3\nprintf used > ${JSON.stringify(boundedMarker)}\nexec ${JSON.stringify(process.execPath)} "$@"\n`,
  );
  chmodSync(resolver, 0o755);
  writeFileSync(
    join(shadowDir, 'node'),
    `#!/bin/sh\nprintf used > ${JSON.stringify(shadowMarker)}\nexit 97\n`,
  );
  chmodSync(join(shadowDir, 'node'), 0o755);

  // WHEN: trace append runs with only the shadow Node on PATH and a preload request.
  const result = spawnSync(
    'sh',
    [join(teamDir, 'trace-ops.sh'), 'add', teamDir, 'sid00000', 'agent', 'track', 'completed', 'bounded'],
    {
      encoding: 'utf8',
      timeout: 8000,
      env: {
        ...process.env,
        PATH: `${shadowDir}:/usr/bin:/bin`,
        NODE_OPTIONS: `--require=${preload}`,
        NODE_PATH: projectRoot,
      },
    },
  );

  // THEN: every Node operation uses the project resolver with injection variables removed.
  check('boundedNode.exit', result.status, 0, 'bounded trace append succeeds');
  check('boundedNode.resolver', existsSync(boundedMarker), true, 'project resolver is used');
  check('boundedNode.shadow', existsSync(shadowMarker), false, 'PATH Node is not used');
  check('boundedNode.preload', existsSync(preloadMarker), false, 'NODE_OPTIONS preload is removed');
}

for (const [name, sid, agent, text, key, expected] of [
  ['text-controls', 'sid00000', 'agent', c0WithoutNul, 'txt', c0WithoutNul],
]) {
  // GIVEN: one trace field containing every C0 control representable in a process argument.
  const teamDir = newTeam(name);
  // WHEN: trace-ops appends and echoes the record.
  const result = add(teamDir, sid, agent, text);
  const parsed = parseSingleLine(teamDir);
  // THEN: both outputs are one valid JSON record and the controls round-trip exactly.
  check(`${name}.exit`, result.status, 0, 'trace append succeeds');
  check(`${name}.lineCount`, parsed.count, 1, 'append writes exactly one JSONL record');
  check(`${name}.fileRoundTrip`, parsed.value[key], expected, 'JSON.parse restores every control');
  check(`${name}.stdoutRoundTrip`, JSON.parse(result.stdout)[key], expected, 'echoed JSON also parses');
}

for (const [name, sid, agent, reason] of [
  ['sid-short', 'short', 'agent', 'expected exactly 8 ASCII marker characters'],
  ['sid-long', 's'.repeat(9), 'agent', 'expected exactly 8 ASCII marker characters'],
  ['sid-control', 'sid0000\n', 'agent', 'expected exactly 8 ASCII marker characters'],
  ['agent-control', 'sid00000', c0WithoutNul, 'expected ^[a-z0-9][a-z0-9-]*$'],
  ['agent-traversal', 'sid00000', '../agent', 'expected ^[a-z0-9][a-z0-9-]*$'],
]) {
  // GIVEN: an invalid schema identity and an empty trace.
  const teamDir = newTeam(name);
  // WHEN: add validates identity before staging or locking.
  const result = add(teamDir, sid, agent, 'text');
  // THEN: the operation fails with no trace mutation.
  check(`${name}.exit`, result.status === 0, false, 'invalid trace identity is rejected');
  check(`${name}.reason`, result.stderr.includes(reason), true, 'the exact identity rule is reported');
  check(`${name}.trace`, readFileSync(join(teamDir, 'trace.jsonl'), 'utf8'), '', 'rejection appends no bytes');
}

{
  // GIVEN: the form-feed regression plus text beyond the established 100-code-point cap.
  const teamDir = newTeam('truncate-form-feed');
  const text = `before\fafter${'x'.repeat(120)}`;
  // WHEN: the record is appended.
  const result = add(teamDir, 'sid00000', 'agent', text);
  const parsed = parseSingleLine(teamDir);
  // THEN: form-feed stays valid JSON and truncation remains exactly 100 code points.
  check('truncateFormFeed.exit', result.status, 0, 'form-feed trace append succeeds');
  check('truncateFormFeed.length', parsed.value.txt.length, 100, 'text keeps the 100-code-point cap');
  check('truncateFormFeed.value', parsed.value.txt, text.slice(0, 100), 'truncated text round-trips');
}

{
  // GIVEN: 99 ASCII code points, a supplementary-plane emoji, then one extra character.
  const teamDir = newTeam('unicode-truncate');
  const text = `${'a'.repeat(99)}😀b`;
  // WHEN: the record is appended through the central encoder's 100-code-point limit.
  const result = add(teamDir, 'sid00000', 'agent-name', text);
  const parsed = parseSingleLine(teamDir);
  // THEN: the emoji is preserved whole and valid identities remain exact.
  check('unicodeTruncate.exit', result.status, 0, 'Unicode trace append succeeds');
  check('unicodeTruncate.value', parsed.value.txt, `${'a'.repeat(99)}😀`, 'UTF-8 is never split');
  check('unicodeTruncate.points', Array.from(parsed.value.txt).length, 100, 'text is capped by code points');
  check('unicodeTruncate.sid', parsed.value.sid, 'sid00000', 'the exact SID is preserved');
  check('unicodeTruncate.agent', parsed.value.src, 'agent-name', 'the exact agent id is preserved');
}

{
  // GIVEN: an invalid UTF-8 byte supplied through the shell rather than a Node argv string.
  const teamDir = newTeam('invalid-utf8');
  // WHEN: trace-ops attempts to encode the invalid agent value.
  const result = spawnSync(
    'sh',
    ['-c', 'bad=$(printf "\\377"); exec sh "$1" add "$2" sid00000 "$bad" track completed text', 'sh', TRACE_OPS, teamDir],
    { encoding: 'utf8', timeout: 8000, env: { ...process.env, LC_ALL: 'C' } },
  );
  // THEN: encoding fails closed and no partial JSONL record is appended.
  check('invalidUtf8.exit', result.status === 0, false, 'invalid UTF-8 is rejected');
  check('invalidUtf8.file', readFileSync(join(teamDir, 'trace.jsonl'), 'utf8'), '', 'failed encoding does not append');
}

{
  // GIVEN: three legacy sources, with a valid tracking row before a later invalid UTF-8 issue row.
  const teamDir = newTeam('migration-transaction');
  const traceBefore = Buffer.from('{"preexisting":true}\n');
  writeFileSync(join(teamDir, 'trace.jsonl'), traceBefore);
  const tracking = Buffer.from(
    '| Date | Agent | Work | Status | Comment |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    '| 2026-08-28 | builder | first task | completed | ready |\n',
  );
  const validIssuePrefix =
    '| Date | Agent | Description | Severity |\n' +
    '| --- | --- | --- | --- |\n' +
    '| 2026-08-28 | reviewer | first issue | high |\n' +
    '| 2026-08-28 | ';
  const invalidIssues = Buffer.concat([
    Buffer.from(validIssuePrefix), Buffer.from([0xff]), Buffer.from(' | later issue | low |\n'),
  ]);
  const insights = Buffer.from(
    '| Date | Agent | Insight | Category |\n' +
    '| --- | --- | --- | --- |\n' +
    '| 2026-08-28 | architect | one insight | pattern |\n',
  );
  writeFileSync(join(teamDir, 'tracking.md'), tracking);
  writeFileSync(join(teamDir, 'issues.md'), invalidIssues);
  writeFileSync(join(teamDir, 'insights.md'), insights);

  // WHEN: validation fails after earlier rows have already been staged.
  const failedRun = spawnSync('sh', [TRACE_OPS, 'migrate', teamDir], {
    encoding: 'utf8', timeout: 8000, env: { ...process.env, LC_ALL: 'C' },
  });

  // THEN: no durable artifact changes and no staging file survives.
  check('migrationFailure.exit', failedRun.status === 0, false, 'later invalid UTF-8 fails migration');
  check('migrationFailure.trace', readFileSync(join(teamDir, 'trace.jsonl')).equals(traceBefore), true,
    'trace remains byte-identical');
  check('migrationFailure.tracking', readFileSync(join(teamDir, 'tracking.md')).equals(tracking), true,
    'tracking source remains byte-identical');
  check('migrationFailure.issues', readFileSync(join(teamDir, 'issues.md')).equals(invalidIssues), true,
    'issues source remains byte-identical');
  check('migrationFailure.insights', readFileSync(join(teamDir, 'insights.md')).equals(insights), true,
    'insights source remains byte-identical');
  check('migrationFailure.backups',
    ['tracking.md.bak', 'issues.md.bak', 'insights.md.bak'].filter((name) => existsSync(join(teamDir, name))).length,
    0, 'failed migration creates no backups');
  check('migrationFailure.temps', readdirSync(teamDir).filter((name) => name.startsWith('.trace-migrate.')).length,
    0, 'failed migration removes its staging file');

  // GIVEN: the invalid row is repaired without touching the other sources.
  const repairedIssues = Buffer.from(
    validIssuePrefix + 'reviewer-two | later issue | low |\n',
  );
  writeFileSync(join(teamDir, 'issues.md'), repairedIssues);
  // WHEN: migration is retried and then invoked once more after the sources were backed up.
  const repairedRun = spawnSync('sh', [TRACE_OPS, 'migrate', teamDir], {
    encoding: 'utf8', timeout: 8000, env: { ...process.env, LC_ALL: 'C' },
  });
  const traceAfterRepair = readFileSync(join(teamDir, 'trace.jsonl'), 'utf8');
  const parsed = traceAfterRepair.trimEnd().split('\n').map((line) => JSON.parse(line));
  const secondRun = spawnSync('sh', [TRACE_OPS, 'migrate', teamDir], {
    encoding: 'utf8', timeout: 8000, env: { ...process.env, LC_ALL: 'C' },
  });
  // THEN: every repaired row appears exactly once and each backup preserves its source bytes.
  check('migrationRetry.exit', repairedRun.status, 0, 'repaired migration succeeds');
  check('migrationRetry.summary', repairedRun.stdout.trim(), 'Migrated: tracking=1 issues=2 insights=1',
    'summary counts every migrated row');
  check('migrationRetry.lineCount', parsed.length, 5, 'one existing plus four migrated rows remain');
  check('migrationRetry.rows', JSON.stringify(parsed.slice(1).map(({ k, src, txt }) => [k, src, txt])), JSON.stringify([
    ['track', 'builder', 'first task — ready'],
    ['issue', 'reviewer', 'first issue'],
    ['issue', 'reviewer-two', 'later issue'],
    ['insight', 'architect', 'one insight'],
  ]), 'each legacy row is appended exactly once in source order');
  check('migrationRetry.trackingBackup', readFileSync(join(teamDir, 'tracking.md.bak')).equals(tracking), true,
    'tracking backup is byte-identical');
  check('migrationRetry.issuesBackup', readFileSync(join(teamDir, 'issues.md.bak')).equals(repairedIssues), true,
    'repaired issues backup is byte-identical');
  check('migrationRetry.insightsBackup', readFileSync(join(teamDir, 'insights.md.bak')).equals(insights), true,
    'insights backup is byte-identical');
  check('migrationRetry.liveSources',
    ['tracking.md', 'issues.md', 'insights.md'].filter((name) => existsSync(join(teamDir, name))).length,
    0, 'successful migration parks every legacy source');
  check('migrationRetry.secondExit', secondRun.status, 0, 'a no-source retry succeeds');
  check('migrationRetry.noDuplicates', readFileSync(join(teamDir, 'trace.jsonl'), 'utf8'), traceAfterRepair,
    'a subsequent retry appends no duplicates');
}

{
  // GIVEN: a legacy source whose final backup path is already occupied.
  const teamDir = newTeam('migration-backup-collision');
  const trace = Buffer.from('{"stable":true}\n');
  const tracking = Buffer.from(
    '| Date | Agent | Work | Status | Comment |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    '| 2026-08-28 | builder | collision task | completed | |\n',
  );
  const collision = Buffer.from('foreign backup bytes\n');
  writeFileSync(join(teamDir, 'trace.jsonl'), trace);
  writeFileSync(join(teamDir, 'tracking.md'), tracking);
  writeFileSync(join(teamDir, 'tracking.md.bak'), collision);
  // WHEN: migration preflight resolves the target set.
  const result = spawnSync('sh', [TRACE_OPS, 'migrate', teamDir], {
    encoding: 'utf8', timeout: 8000, env: { ...process.env, LC_ALL: 'C' },
  });
  // THEN: collision fails before staging or mutation and every byte remains intact.
  check('migrationCollision.exit', result.status === 0, false, 'existing backup blocks migration');
  check('migrationCollision.reason', result.stderr.includes('Backup collision'), true,
    'failure names the occupied backup path');
  check('migrationCollision.trace', readFileSync(join(teamDir, 'trace.jsonl')).equals(trace), true,
    'collision preserves trace bytes');
  check('migrationCollision.source', readFileSync(join(teamDir, 'tracking.md')).equals(tracking), true,
    'collision preserves source bytes');
  check('migrationCollision.backup', readFileSync(join(teamDir, 'tracking.md.bak')).equals(collision), true,
    'collision preserves foreign backup bytes');
  check('migrationCollision.temps', readdirSync(teamDir).filter((name) => name.startsWith('.trace-migrate.')).length,
    0, 'collision creates no staging file');
}

{
  // GIVEN: migration passed preflight, then a foreign issues backup appears at the exact publish race.
  const teamDir = newTeam('migration-backup-race');
  const trace = Buffer.from('{"stable":true}\n');
  const tracking = Buffer.from(
    '| Date | Agent | Work | Status | Comment |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    '| 2026-08-28 | builder | first source | completed | |\n',
  );
  const issues = Buffer.from(
    '| Date | Agent | Description | Severity |\n' +
    '| --- | --- | --- | --- |\n' +
    '| 2026-08-28 | reviewer | second source | high |\n',
  );
  const foreign = Buffer.from('foreign race backup bytes\n');
  writeFileSync(join(teamDir, 'trace.jsonl'), trace);
  writeFileSync(join(teamDir, 'tracking.md'), tracking);
  writeFileSync(join(teamDir, 'issues.md'), issues);
  const marker = join(teamDir, '.backup-race-fired');
  const realLn = spawnSync('sh', ['-c', 'command -v ln'], { encoding: 'utf8' }).stdout.trim();
  const shimDir = commandShim('backup-race', 'ln', `
case "$2" in
  */issues.md.bak)
    if [ ! -e "$TRACE_RACE_MARKER" ]; then
      printf '%s' "$TRACE_RACE_BYTES" > "$2"
      : > "$TRACE_RACE_MARKER"
    fi
    ;;
esac
exec "$TRACE_REAL_LN" "$@"`);
  // WHEN: no-clobber backup publication loses the race after tracking.md was already parked.
  const result = spawnSync('sh', [TRACE_OPS, 'migrate', teamDir], {
    encoding: 'utf8', timeout: 8000,
    env: {
      ...process.env,
      PATH: `${shimDir}:${process.env.PATH}`,
      TRACE_RACE_MARKER: marker,
      TRACE_RACE_BYTES: foreign.toString('utf8'),
      TRACE_REAL_LN: realLn,
    },
  });
  // THEN: the foreign target is preserved and the earlier backup is rolled back without overwrite.
  check('migrationBackupRace.exit', result.status === 0, false, 'a post-preflight backup collision fails');
  check('migrationBackupRace.reason', result.stderr.includes('without replacement'), true,
    'failure identifies no-clobber backup publication');
  check('migrationBackupRace.trace', readFileSync(join(teamDir, 'trace.jsonl')).equals(trace), true,
    'trace remains byte-identical');
  check('migrationBackupRace.tracking', readFileSync(join(teamDir, 'tracking.md')).equals(tracking), true,
    'the earlier source is restored byte-identically');
  check('migrationBackupRace.issues', readFileSync(join(teamDir, 'issues.md')).equals(issues), true,
    'the raced source remains byte-identical');
  check('migrationBackupRace.foreignBackup', readFileSync(join(teamDir, 'issues.md.bak')).equals(foreign), true,
    'the foreign backup is never overwritten');
  check('migrationBackupRace.earlierBackup', existsSync(join(teamDir, 'tracking.md.bak')), false,
    'rollback removes only the migration-owned earlier backup');
  check('migrationBackupRace.lock', existsSync(join(teamDir, '.trace-ops.lock')), false,
    'failed migration releases its owned lock');
}

{
  // GIVEN: tracking.md is bound and snapshotted, then a foreign source replaces it inside the ln publication call.
  const teamDir = newTeam('migration-source-identity-race');
  const trace = Buffer.from('{"stable":true}\n');
  const original = Buffer.from(
    '| Date | Agent | Work | Status | Comment |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    '| 2026-08-28 | builder | original staged row | completed | |\n',
  );
  const foreign = Buffer.from(
    '| Date | Agent | Work | Status | Comment |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    '| 2026-08-28 | intruder | foreign replacement row | failed | |\n',
  );
  const sourcePath = join(teamDir, 'tracking.md');
  const backupPath = join(teamDir, 'tracking.md.bak');
  const marker = join(teamDir, '.source-identity-race-fired');
  writeFileSync(join(teamDir, 'trace.jsonl'), trace);
  writeFileSync(sourcePath, original);
  const realLn = spawnSync('sh', ['-c', 'command -v ln'], { encoding: 'utf8' }).stdout.trim();
  const shimDir = commandShim('source-identity-race', 'ln', `
if [ "$2" = "$TRACE_BACKUP" ] && [ ! -e "$TRACE_RACE_MARKER" ]; then
  printf '%s' "$TRACE_FOREIGN" > "$TRACE_SOURCE"
  : > "$TRACE_RACE_MARKER"
fi
exec "$TRACE_REAL_LN" "$@"`);
  // WHEN: backup publication would otherwise bind the foreign replacement after parsing the original bytes.
  const result = spawnSync('sh', [TRACE_OPS, 'migrate', teamDir], {
    encoding: 'utf8', timeout: 8000,
    env: {
      ...process.env,
      PATH: `${shimDir}:${process.env.PATH}`,
      TRACE_SOURCE: sourcePath,
      TRACE_BACKUP: backupPath,
      TRACE_RACE_MARKER: marker,
      TRACE_FOREIGN: foreign.toString('utf8'),
      TRACE_REAL_LN: realLn,
    },
  });
  // THEN: migration fails before parking or append and preserves both source identities byte-for-byte.
  check('migrationSourceRace.exit', result.status === 0, false, 'source substitution aborts migration');
  check('migrationSourceRace.reason', result.stderr.includes('foreign tracking.md source appeared'), true,
    'failure names the post-snapshot foreign source');
  check('migrationSourceRace.trace', readFileSync(join(teamDir, 'trace.jsonl')).equals(trace), true,
    'staged original rows are never appended after source substitution');
  check('migrationSourceRace.foreign', readFileSync(sourcePath).equals(foreign), true,
    'foreign source bytes remain at the substituted path');
  check('migrationSourceRace.original', readFileSync(backupPath).equals(original), true,
    'the bound original source remains byte-identical at its recovery backup');
  check('migrationSourceRace.temps', readdirSync(teamDir).filter(
    (name) => name.startsWith('.trace-migrate.') || name.startsWith('.trace-source-'),
  ).length, 0, 'failed migration removes delta and source snapshots');
  check('migrationSourceRace.lock', existsSync(join(teamDir, '.trace-ops.lock')), false,
    'failed migration releases its owned lock');
}

{
  // GIVEN: backup identity checks pass, then a foreign source appears immediately before held cleanup.
  const teamDir = newTeam('migration-post-check-source-race');
  const trace = Buffer.from('{"stable":true}\n');
  const original = Buffer.from(
    '| Date | Agent | Work | Status | Comment |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    '| 2026-08-28 | builder | verified original row | completed | |\n',
  );
  const foreign = Buffer.from('foreign replacement after identity check\n');
  const sourcePath = join(teamDir, 'tracking.md');
  const backupPath = join(teamDir, 'tracking.md.bak');
  const marker = join(teamDir, '.post-check-source-race-fired');
  writeFileSync(join(teamDir, 'trace.jsonl'), trace);
  writeFileSync(sourcePath, original);
  const realRm = spawnSync('sh', ['-c', 'command -v rm'], { encoding: 'utf8' }).stdout.trim();
  const shimDir = commandShim('post-check-source-race', 'rm', `
case "$1" in
  */.trace-source-hold.*/source)
    if [ ! -e "$TRACE_RACE_MARKER" ]; then
      printf '%s' "$TRACE_FOREIGN" > "$TRACE_SOURCE"
      : > "$TRACE_RACE_MARKER"
    fi
    ;;
esac
exec "$TRACE_REAL_RM" "$@"`);
  // WHEN: the former check-to-rm window is hit after held and backup identities were verified.
  const result = spawnSync('sh', [TRACE_OPS, 'migrate', teamDir], {
    encoding: 'utf8', timeout: 8000,
    env: {
      ...process.env,
      PATH: `${shimDir}:${process.env.PATH}`,
      TRACE_SOURCE: sourcePath,
      TRACE_RACE_MARKER: marker,
      TRACE_FOREIGN: foreign.toString('utf8'),
      TRACE_REAL_RM: realRm,
    },
  });
  // THEN: only the private held link is removed; foreign path bytes and the original backup both survive.
  check('migrationPostCheckRace.exit', result.status === 0, false, 'post-check substitution fails closed');
  check('migrationPostCheckRace.reason', result.stderr.includes('foreign tracking.md source appeared'), true,
    'failure identifies the final park race');
  check('migrationPostCheckRace.trace', readFileSync(join(teamDir, 'trace.jsonl')).equals(trace), true,
    'trace stays byte-identical');
  check('migrationPostCheckRace.foreign', readFileSync(sourcePath).equals(foreign), true,
    'foreign source bytes are never removed or overwritten');
  check('migrationPostCheckRace.original', readFileSync(backupPath).equals(original), true,
    'the verified original survives byte-identically at the backup path');
  check('migrationPostCheckRace.temps', readdirSync(teamDir).filter(
    (name) => name.startsWith('.trace-migrate.') || name.startsWith('.trace-source-'),
  ).length, 0, 'failed migration removes staging, snapshot, and holding paths');
  check('migrationPostCheckRace.lock', existsSync(join(teamDir, '.trace-ops.lock')), false,
    'failed migration releases its lock');
}

{
  // GIVEN: tracking.md keeps its inode but is edited in place after the identity-bound snapshot.
  const teamDir = newTeam('migration-source-content-race');
  const trace = Buffer.from('{"stable":true}\n');
  const original = Buffer.from(
    '| Date | Agent | Work | Status | Comment |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    '| 2026-08-28 | builder | snapshotted row | completed | |\n',
  );
  const mutated = Buffer.from(
    '| Date | Agent | Work | Status | Comment |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    '| 2026-08-28 | editor | concurrent in-place row | failed | |\n',
  );
  const sourcePath = join(teamDir, 'tracking.md');
  const backupPath = join(teamDir, 'tracking.md.bak');
  const marker = join(teamDir, '.source-content-race-fired');
  writeFileSync(join(teamDir, 'trace.jsonl'), trace);
  writeFileSync(sourcePath, original);
  const originalInode = lstatSync(sourcePath).ino;
  const realMv = spawnSync('sh', ['-c', 'command -v mv'], { encoding: 'utf8' }).stdout.trim();
  const shimDir = commandShim('source-content-race', 'mv', `
if [ "$1" = "$TRACE_SOURCE" ] && [ ! -e "$TRACE_RACE_MARKER" ]; then
  printf '%s' "$TRACE_MUTATED" > "$TRACE_SOURCE"
  : > "$TRACE_RACE_MARKER"
fi
exec "$TRACE_REAL_MV" "$@"`);
  // WHEN: the source is moved into private holding after the same-inode mutation.
  const result = spawnSync('sh', [TRACE_OPS, 'migrate', teamDir], {
    encoding: 'utf8', timeout: 8000,
    env: {
      ...process.env,
      PATH: `${shimDir}:${process.env.PATH}`,
      TRACE_SOURCE: sourcePath,
      TRACE_RACE_MARKER: marker,
      TRACE_MUTATED: mutated.toString('utf8'),
      TRACE_REAL_MV: realMv,
    },
  });
  // THEN: content binding rejects the stale snapshot before backup or trace publication.
  check('migrationContentRace.exit', result.status === 0, false, 'same-inode content mutation aborts migration');
  check('migrationContentRace.reason', result.stderr.includes('legacy source content changed after snapshot'), true,
    'failure names the content-binding mismatch');
  check('migrationContentRace.trace', readFileSync(join(teamDir, 'trace.jsonl')).equals(trace), true,
    'stale staged rows never reach trace');
  check('migrationContentRace.source', readFileSync(sourcePath).equals(mutated), true,
    'concurrently edited source bytes are restored without overwrite');
  check('migrationContentRace.inode', lstatSync(sourcePath).ino, originalInode,
    'fixture and rollback preserve the original source inode');
  check('migrationContentRace.backup', existsSync(backupPath), false,
    'content mismatch occurs before backup publication');
  check('migrationContentRace.temps', readdirSync(teamDir).filter(
    (name) => name.startsWith('.trace-migrate.') || name.startsWith('.trace-source-'),
  ).length, 0, 'failed migration removes staging, snapshot, and holding paths');
  check('migrationContentRace.lock', existsSync(join(teamDir, '.trace-ops.lock')), false,
    'failed migration releases its lock');
}

{
  // GIVEN: held bytes match the snapshot, then the held inode is edited inside no-clobber backup publication.
  const teamDir = newTeam('migration-post-cmp-content-race');
  const trace = Buffer.from('{"stable":true}\n');
  const original = Buffer.from(
    '| Date | Agent | Work | Status | Comment |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    '| 2026-08-28 | builder | pre-link snapshot row | completed | |\n',
  );
  const mutated = Buffer.from(
    '| Date | Agent | Work | Status | Comment |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    '| 2026-08-28 | editor | post-cmp mutation row | failed | |\n',
  );
  const sourcePath = join(teamDir, 'tracking.md');
  const backupPath = join(teamDir, 'tracking.md.bak');
  const marker = join(teamDir, '.post-cmp-content-race-fired');
  writeFileSync(join(teamDir, 'trace.jsonl'), trace);
  writeFileSync(sourcePath, original);
  const originalInode = lstatSync(sourcePath).ino;
  const realLn = spawnSync('sh', ['-c', 'command -v ln'], { encoding: 'utf8' }).stdout.trim();
  const shimDir = commandShim('post-cmp-content-race', 'ln', `
if [ "$2" = "$TRACE_BACKUP" ] && [ ! -e "$TRACE_RACE_MARKER" ]; then
  printf '%s' "$TRACE_MUTATED" > "$1"
  : > "$TRACE_RACE_MARKER"
fi
exec "$TRACE_REAL_LN" "$@"`);
  // WHEN: hard-link publication runs after the first held-vs-snapshot comparison.
  const result = spawnSync('sh', [TRACE_OPS, 'migrate', teamDir], {
    encoding: 'utf8', timeout: 8000,
    env: {
      ...process.env,
      PATH: `${shimDir}:${process.env.PATH}`,
      TRACE_BACKUP: backupPath,
      TRACE_RACE_MARKER: marker,
      TRACE_MUTATED: mutated.toString('utf8'),
      TRACE_REAL_LN: realLn,
    },
  });
  // THEN: post-publication content validation restores the current source and aborts stale append.
  check('migrationPostCmpRace.exit', result.status === 0, false, 'post-cmp held mutation aborts migration');
  check('migrationPostCmpRace.reason', result.stderr.includes('content changed during tracking.md backup publication'), true,
    'failure identifies the post-publication content mismatch');
  check('migrationPostCmpRace.trace', readFileSync(join(teamDir, 'trace.jsonl')).equals(trace), true,
    'trace remains byte-identical to pre-migration state');
  check('migrationPostCmpRace.source', readFileSync(sourcePath).equals(mutated), true,
    'mutated held bytes are restored without overwrite');
  check('migrationPostCmpRace.inode', lstatSync(sourcePath).ino, originalInode,
    'restored current source keeps the mutated original inode');
  check('migrationPostCmpRace.backup', existsSync(backupPath), false,
    'mismatched owned backup is removed after source restoration');
  check('migrationPostCmpRace.temps', readdirSync(teamDir).filter(
    (name) => name.startsWith('.trace-migrate.') || name.startsWith('.trace-source-'),
  ).length, 0, 'failed migration removes staging, snapshot, and holding paths');
  check('migrationPostCmpRace.lock', existsSync(join(teamDir, '.trace-ops.lock')), false,
    'failed migration releases its lock');
}

{
  // GIVEN: an external trace row arrives immediately before the migration delta publisher opens trace.jsonl.
  const teamDir = newTeam('migration-preappend');
  const initial = '{"initial":true}\n';
  const external = '{"external":"preserve-me"}';
  const tracking =
    '| Date | Agent | Work | Status | Comment |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    '| 2026-08-28 | builder | migrated source | completed | |\n';
  writeFileSync(join(teamDir, 'trace.jsonl'), initial);
  writeFileSync(join(teamDir, 'tracking.md'), tracking);
  const marker = join(teamDir, '.preappend-fired');
  const shimDir = commandShim('preappend', 'node', `
if [ "$1" = "-" ] && [ ! -e "$TRACE_RACE_MARKER" ]; then
  printf '%s\\n' "$TRACE_RACE_LINE" >> "$TRACE_RACE_OUT"
  : > "$TRACE_RACE_MARKER"
fi
exec "$TRACE_REAL_NODE" "$@"`);
  // WHEN: migration appends its staged delta under the lock.
  const result = spawnSync('sh', [TRACE_OPS, 'migrate', teamDir], {
    encoding: 'utf8', timeout: 8000,
    env: {
      ...process.env,
      PATH: `${shimDir}:${process.env.PATH}`,
      TRACE_RACE_MARKER: marker,
      TRACE_RACE_LINE: external,
      TRACE_RACE_OUT: join(teamDir, 'trace.jsonl'),
      TRACE_REAL_NODE: process.execPath,
    },
  });
  const lines = readFileSync(join(teamDir, 'trace.jsonl'), 'utf8').trimEnd().split('\n');
  // THEN: current trace bytes, the external pre-append, and the migration row all remain in order.
  check('migrationPreappend.exit', result.status, 0, 'delta migration succeeds');
  check('migrationPreappend.lineCount', lines.length, 3, 'no current or concurrent row is replaced');
  check('migrationPreappend.initial', lines[0], initial.trimEnd(), 'the initial trace remains first');
  check('migrationPreappend.external', lines[1], external, 'the external pre-append is preserved');
  check('migrationPreappend.delta', JSON.parse(lines[2]).txt, 'migrated source',
    'the validated migration delta appends last');
}

{
  // GIVEN: another supported operation holds the project-local trace lock.
  const teamDir = newTeam('add-lock-contention');
  const trace = Buffer.from('{"stable":true}\n');
  writeFileSync(join(teamDir, 'trace.jsonl'), trace);
  mkdirSync(join(teamDir, '.trace-ops.lock'));
  // WHEN: add attempts to publish a new row.
  const result = add(teamDir, 'sid00000', 'agent', 'blocked add');
  // THEN: add fails closed without changing trace or taking over the foreign lock.
  check('addLock.exit', result.status === 0, false, 'add fails while the lock is held');
  check('addLock.reason', result.stderr.includes('Trace operation locked'), true, 'contention is explicit');
  check('addLock.trace', readFileSync(join(teamDir, 'trace.jsonl')).equals(trace), true,
    'contended add leaves trace byte-identical');
  check('addLock.preserved', existsSync(join(teamDir, '.trace-ops.lock')), true,
    'add never removes a lock it did not acquire');
}

{
  // GIVEN: another supported operation holds the lock while a legacy source is still live.
  const teamDir = newTeam('migrate-lock-contention');
  const trace = Buffer.from('{"stable":true}\n');
  const tracking = Buffer.from(
    '| Date | Agent | Work | Status | Comment |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    '| 2026-08-28 | builder | blocked migrate | completed | |\n',
  );
  writeFileSync(join(teamDir, 'trace.jsonl'), trace);
  writeFileSync(join(teamDir, 'tracking.md'), tracking);
  mkdirSync(join(teamDir, '.trace-ops.lock'));
  // WHEN: migrate attempts to start.
  const result = spawnSync('sh', [TRACE_OPS, 'migrate', teamDir], { encoding: 'utf8', timeout: 8000 });
  // THEN: it fails before staging, backup, or append and preserves the held lock.
  check('migrateLock.exit', result.status === 0, false, 'migrate fails while the lock is held');
  check('migrateLock.trace', readFileSync(join(teamDir, 'trace.jsonl')).equals(trace), true,
    'contended migrate leaves trace byte-identical');
  check('migrateLock.source', readFileSync(join(teamDir, 'tracking.md')).equals(tracking), true,
    'contended migrate leaves its source byte-identical');
  check('migrateLock.backup', existsSync(join(teamDir, 'tracking.md.bak')), false,
    'contended migrate creates no backup');
  check('migrateLock.preserved', existsSync(join(teamDir, '.trace-ops.lock')), true,
    'migrate never removes a lock it did not acquire');
}

{
  // GIVEN: validated migration data and a publisher runtime that fails before writing any delta bytes.
  const teamDir = newTeam('migration-publish-failure');
  const trace = Buffer.from('{"stable":true}\n');
  const tracking = Buffer.from(
    '| Date | Agent | Work | Status | Comment |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    '| 2026-08-28 | builder | publish failure | completed | |\n',
  );
  writeFileSync(join(teamDir, 'trace.jsonl'), trace);
  writeFileSync(join(teamDir, 'tracking.md'), tracking);
  const shimDir = commandShim('publish-failure', 'node', `
if [ "$1" = "-" ]; then exit 97; fi
exec "$TRACE_REAL_NODE" "$@"`);
  // WHEN: final delta publication fails after backup success.
  const result = spawnSync('sh', [TRACE_OPS, 'migrate', teamDir], {
    encoding: 'utf8', timeout: 8000,
    env: { ...process.env, PATH: `${shimDir}:${process.env.PATH}`, TRACE_REAL_NODE: process.execPath },
  });
  // THEN: backup publication rolls back and no trace delta or staging artifact survives.
  check('migrationPublishFailure.exit', result.status === 0, false, 'publisher failure aborts migration');
  check('migrationPublishFailure.trace', readFileSync(join(teamDir, 'trace.jsonl')).equals(trace), true,
    'publisher failure preserves trace bytes');
  check('migrationPublishFailure.source', readFileSync(join(teamDir, 'tracking.md')).equals(tracking), true,
    'publisher failure restores source bytes');
  check('migrationPublishFailure.backup', existsSync(join(teamDir, 'tracking.md.bak')), false,
    'publisher failure removes the migration-owned backup');
  check('migrationPublishFailure.temps', readdirSync(teamDir).filter((name) => name.startsWith('.trace-migrate.')).length,
    0, 'publisher failure removes staging files');
  check('migrationPublishFailure.lock', existsSync(join(teamDir, '.trace-ops.lock')), false,
    'publisher failure releases the migration lock');
}

{
  // GIVEN: a trace row plus filter values that escaped the former interpolated jq program.
  const teamDir = newTeam('read-jq-injection');
  const secret = 'TRACE_READ_SECRET_DO_NOT_DISCLOSE';
  writeFileSync(join(teamDir, 'trace.jsonl'),
    '{"ts":"2026-08-28T00:00:00Z","sid":"safe0000","src":"agent","k":"track","s":"completed","txt":"ok"}\n');
  for (const option of ['--sid', '--since', '--kind']) {
    const result = spawnSync('sh', [TRACE_OPS, 'read', teamDir, option, 'x") | env #'], {
      encoding: 'utf8', timeout: 8000, env: { ...process.env, TRACE_READ_SECRET: secret },
    });
    const name = option.slice(2);
    check(`readJqInjection.${name}.exit`, result.status, 0, `${name} payload remains ordinary jq data`);
    check(`readJqInjection.${name}.stdout`, result.stdout, '', `${name} payload matches no trace row`);
    check(`readJqInjection.${name}.secret`, result.stdout.includes(secret), false,
      `${name} payload cannot disclose process environment`);
  }
}

{
  // GIVEN: trace.jsonl is a symlink to a foreign regular file.
  const teamDir = newTeam('add-trace-symlink');
  const tracePath = join(teamDir, 'trace.jsonl');
  const victim = join(teamDir, 'victim.jsonl');
  const victimBytes = Buffer.from('{"victim":true}\n');
  writeFileSync(victim, victimBytes);
  rmSync(tracePath);
  symlinkSync(victim, tracePath);
  const result = add(teamDir, 'sid00000', 'agent', 'must not reach victim');
  check('addSymlink.exit', result.status === 0, false, 'add rejects a symlinked trace target');
  check('addSymlink.victim', readFileSync(victim).equals(victimBytes), true, 'victim bytes remain unchanged');
  check('addSymlink.preserved', lstatSync(tracePath).isSymbolicLink(), true, 'foreign symlink remains untouched');
  check('addSymlink.temps', readdirSync(teamDir).filter((name) => name.startsWith('.trace-add.')).length,
    0, 'failed add removes its staging file');
}

{
  // GIVEN: foreign trace and cursor bytes are exposed only through symlinks.
  const teamDir = newTeam('read-symlink-disclosure');
  const tracePath = join(teamDir, 'trace.jsonl');
  const traceVictim = join(teamDir, 'trace-victim');
  const cursorPath = join(teamDir, 'trace.cursor');
  const cursorVictim = join(teamDir, 'cursor-victim');
  writeFileSync(traceVictim, 'TRACE_VICTIM_SECRET\n');
  writeFileSync(cursorVictim, 'CURSOR_VICTIM_SECRET\n');
  rmSync(tracePath);
  symlinkSync(traceVictim, tracePath);
  symlinkSync(cursorVictim, cursorPath);
  const traceRead = spawnSync('sh', [TRACE_OPS, 'read', teamDir], { encoding: 'utf8', timeout: 8000 });
  const cursorRead = spawnSync('sh', [TRACE_OPS, 'cursor', teamDir], { encoding: 'utf8', timeout: 8000 });
  const cursorSet = spawnSync('sh', [TRACE_OPS, 'cursor', teamDir, 'set', '2026-08-28T01:02:03Z'], {
    encoding: 'utf8', timeout: 8000,
  });
  check('readSymlink.traceExit', traceRead.status === 0, false, 'trace read rejects a symlink');
  check('readSymlink.traceSecret', traceRead.stdout.includes('TRACE_VICTIM_SECRET'), false,
    'trace read discloses no linked bytes');
  check('readSymlink.cursorExit', cursorRead.status === 0, false, 'cursor read rejects a symlink');
  check('readSymlink.cursorSecret', cursorRead.stdout.includes('CURSOR_VICTIM_SECRET'), false,
    'cursor read discloses no linked bytes');
  check('readSymlink.cursorSetExit', cursorSet.status === 0, false, 'cursor set rejects a symlink');
  check('readSymlink.traceVictim', readFileSync(traceVictim, 'utf8'), 'TRACE_VICTIM_SECRET\n',
    'trace victim remains unchanged');
  check('readSymlink.cursorVictim', readFileSync(cursorVictim, 'utf8'), 'CURSOR_VICTIM_SECRET\n',
    'cursor victim remains unchanged');
}

{
  // GIVEN: an existing ordinary cursor file.
  const teamDir = newTeam('cursor-atomic');
  const cursorPath = join(teamDir, 'trace.cursor');
  writeFileSync(cursorPath, '2026-08-27T00:00:00Z\n');
  const setResult = spawnSync('sh', [TRACE_OPS, 'cursor', teamDir, 'set', '2026-08-28T01:02:03Z'], {
    encoding: 'utf8', timeout: 8000,
  });
  const readResult = spawnSync('sh', [TRACE_OPS, 'cursor', teamDir], { encoding: 'utf8', timeout: 8000 });
  check('cursorAtomic.setExit', setResult.status, 0, 'ordinary cursor replacement succeeds');
  check('cursorAtomic.readExit', readResult.status, 0, 'ordinary cursor snapshot read succeeds');
  check('cursorAtomic.value', readResult.stdout, '2026-08-28T01:02:03Z\n', 'cursor replacement is complete');
  check('cursorAtomic.temps', readdirSync(teamDir).filter((name) => name.startsWith('.trace-cursor.')).length,
    0, 'atomic publication leaves no temporary file');
}

{
  // GIVEN: a foreign regular cursor is substituted after the caller binds the original inode.
  const teamDir = newTeam('cursor-target-substitution');
  const cursorPath = join(teamDir, 'trace.cursor');
  const savedPath = join(teamDir, 'cursor-original-saved');
  const preloadPath = join(teamDir, 'inject-cursor-race.cjs');
  const original = '2026-08-27T00:00:00Z\n';
  const foreign = '2099-01-01T00:00:00Z\n';
  writeFileSync(cursorPath, original);
  writeFileSync(preloadPath, `
const fs = require('node:fs');
const path = require('node:path');
const realRename = fs.renameSync;
let injected = false;
fs.renameSync = (from, to) => {
  const legacyPublish = to.endsWith('/trace.cursor') && path.basename(from).startsWith('.trace-cursor.');
  const guardedPublish = from.endsWith('/trace.cursor') && path.basename(path.dirname(to)).startsWith('.trace-cursor-old.');
  if (!injected && (legacyPublish || guardedPublish)) {
    injected = true;
    const target = legacyPublish ? to : from;
    realRename(target, process.env.TRACE_CURSOR_SAVED);
    fs.writeFileSync(target, process.env.TRACE_CURSOR_FOREIGN);
  }
  return realRename(from, to);
};
`);
  const injectedNodeDir = commandShim('cursor-target-substitution', 'node', `
NODE_OPTIONS="--require=${preloadPath}" exec ${JSON.stringify(process.execPath)} "$@"
`);
  // WHEN: publication reaches the old check-to-rename race window.
  const setResult = spawnSync('sh', [TRACE_OPS, 'cursor', teamDir, 'set', '2026-08-28T01:02:03Z'], {
    encoding: 'utf8',
    timeout: 8000,
    env: {
      ...process.env,
      PATH: `${injectedNodeDir}:${process.env.PATH}`,
      TRACE_CURSOR_SAVED: savedPath,
      TRACE_CURSOR_FOREIGN: foreign,
    },
  });
  const readResult = spawnSync('sh', [TRACE_OPS, 'cursor', teamDir], { encoding: 'utf8', timeout: 8000 });
  // THEN: the set fails closed, foreign bytes remain at the supported path, and the original survives.
  check('cursorTargetRace.exit', setResult.status === 0, false, 'cursor substitution aborts publication');
  check('cursorTargetRace.foreign', readFileSync(cursorPath, 'utf8'), foreign,
    'foreign cursor bytes are never overwritten');
  check('cursorTargetRace.original', readFileSync(savedPath, 'utf8'), original,
    'the externally displaced original cursor remains byte-identical');
  check('cursorTargetRace.readExit', readResult.status, 0, 'a supported read remains consistent after rollback');
  check('cursorTargetRace.readValue', readResult.stdout, foreign, 'supported read returns the complete foreign cursor');
  check('cursorTargetRace.temps', readdirSync(teamDir).filter(
    (name) => name.startsWith('.trace-cursor.') || name.startsWith('.trace-cursor-old.'),
  ).length,
    0, 'failed publication removes owned staging and recovery paths');
}

{
  // GIVEN: cleanup of the private held source fails once after its backup was published.
  const teamDir = newTeam('migration-source-unlink-failure');
  const trace = Buffer.from('{"stable":true}\n');
  const tracking = Buffer.from(
    '| Date | Agent | Work | Status | Comment |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    '| 2026-08-28 | builder | retryable row | completed | |\n',
  );
  writeFileSync(join(teamDir, 'trace.jsonl'), trace);
  writeFileSync(join(teamDir, 'tracking.md'), tracking);
  const marker = join(teamDir, '.rm-race-fired');
  const realRm = spawnSync('sh', ['-c', 'command -v rm'], { encoding: 'utf8' }).stdout.trim();
  const shimDir = commandShim('source-unlink-failure', 'rm', `
case "$1" in
  */.trace-source-hold.*/source)
    if [ ! -e "$TRACE_RM_MARKER" ]; then
      : > "$TRACE_RM_MARKER"
      exit 91
    fi
    ;;
esac
exec "$TRACE_REAL_RM" "$@"`);
  const failedRun = spawnSync('sh', [TRACE_OPS, 'migrate', teamDir], {
    encoding: 'utf8', timeout: 8000,
    env: {
      ...process.env,
      PATH: `${shimDir}:${process.env.PATH}`,
      TRACE_RM_MARKER: marker,
      TRACE_REAL_RM: realRm,
    },
  });
  const failedTrace = readFileSync(join(teamDir, 'trace.jsonl'));
  const failedSource = readFileSync(join(teamDir, 'tracking.md'));
  const failedBackupExists = existsSync(join(teamDir, 'tracking.md.bak'));
  const retry = spawnSync('sh', [TRACE_OPS, 'migrate', teamDir], { encoding: 'utf8', timeout: 8000 });
  check('migrationRmFailure.exit', failedRun.status === 0, false, 'source unlink failure aborts migration');
  check('migrationRmFailure.trace', failedTrace.equals(trace), true, 'failed attempt leaves trace byte-identical');
  check('migrationRmFailure.source', failedSource.equals(tracking), true, 'failed attempt leaves source byte-identical');
  check('migrationRmFailure.ownedBackup', failedBackupExists, false, 'rollback removes the verified owned backup');
  check('migrationRmFailure.retry', retry.status, 0, 'no stale backup blocks a clean retry');
  check('migrationRmFailure.retryRows', readFileSync(join(teamDir, 'trace.jsonl'), 'utf8').trimEnd().split('\n').length,
    2, 'retry appends the legacy row exactly once');
  check('migrationRmFailure.sourceBackup', readFileSync(join(teamDir, 'tracking.md.bak')).equals(tracking), true,
    'successful retry preserves exact source bytes');
}

for (const name of ['add', 'migrate']) {
  // GIVEN: an otherwise valid existing JSON value with no terminating JSONL newline.
  const teamDir = newTeam(`no-trailing-newline-${name}`);
  const trace = Buffer.from('{"old":true}');
  writeFileSync(join(teamDir, 'trace.jsonl'), trace);
  if (name === 'migrate') {
    writeFileSync(join(teamDir, 'tracking.md'),
      '| Date | Agent | Work | Status | Comment |\n' +
      '| --- | --- | --- | --- | --- |\n' +
      '| 2026-08-28 | builder | boundary row | completed | |\n');
  }
  const result = name === 'add'
    ? add(teamDir, 'sid00000', 'agent', 'new row')
    : spawnSync('sh', [TRACE_OPS, 'migrate', teamDir], { encoding: 'utf8', timeout: 8000 });
  check(`newlineBoundary.${name}.exit`, result.status === 0, false, `${name} rejects a missing JSONL boundary`);
  check(`newlineBoundary.${name}.trace`, readFileSync(join(teamDir, 'trace.jsonl')).equals(trace), true,
    `${name} leaves the existing trace byte-identical`);
  check(`newlineBoundary.${name}.backup`, existsSync(join(teamDir, 'tracking.md.bak')), false,
    `${name} leaves no migration backup`);
}

{
  // GIVEN: migrate bound the original trace inode, then a publisher shim substitutes a foreign file.
  const teamDir = newTeam('migration-target-substitution');
  const trace = Buffer.from('{"original":true}\n');
  const foreign = Buffer.from('{"foreign":true}\n');
  const tracking = Buffer.from(
    '| Date | Agent | Work | Status | Comment |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    '| 2026-08-28 | builder | must not publish | completed | |\n',
  );
  const swapped = join(teamDir, 'trace.swapped-out');
  writeFileSync(join(teamDir, 'trace.jsonl'), trace);
  writeFileSync(join(teamDir, 'tracking.md'), tracking);
  const marker = join(teamDir, '.target-race-fired');
  const shimDir = commandShim('target-substitution', 'node', `
if [ "$1" = "-" ] && [ ! -e "$TRACE_RACE_MARKER" ]; then
  mv "$TRACE_RACE_TARGET" "$TRACE_RACE_SWAPPED"
  printf '%s' "$TRACE_RACE_FOREIGN" > "$TRACE_RACE_TARGET"
  : > "$TRACE_RACE_MARKER"
fi
exec "$TRACE_REAL_NODE" "$@"`);
  const result = spawnSync('sh', [TRACE_OPS, 'migrate', teamDir], {
    encoding: 'utf8', timeout: 8000,
    env: {
      ...process.env,
      PATH: `${shimDir}:${process.env.PATH}`,
      TRACE_RACE_MARKER: marker,
      TRACE_RACE_TARGET: join(teamDir, 'trace.jsonl'),
      TRACE_RACE_SWAPPED: swapped,
      TRACE_RACE_FOREIGN: foreign.toString('utf8'),
      TRACE_REAL_NODE: process.execPath,
    },
  });
  check('migrationTargetRace.exit', result.status === 0, false, 'trace target substitution aborts migration');
  check('migrationTargetRace.foreign', readFileSync(join(teamDir, 'trace.jsonl')).equals(foreign), true,
    'foreign replacement receives no migration delta');
  check('migrationTargetRace.original', readFileSync(swapped).equals(trace), true,
    'externally moved original trace receives no migration delta');
  check('migrationTargetRace.source', readFileSync(join(teamDir, 'tracking.md')).equals(tracking), true,
    'migration restores the legacy source');
  check('migrationTargetRace.backup', existsSync(join(teamDir, 'tracking.md.bak')), false,
    'migration removes its owned backup during rollback');
}

{
  // GIVEN: migrate bound an absent trace target, then a foreign regular file appears before publication.
  const teamDir = newTeam('migration-absent-target-substitution');
  const tracePath = join(teamDir, 'trace.jsonl');
  const foreign = Buffer.from('{"foreign-absent-race":true}\n');
  const tracking = Buffer.from(
    '| Date | Agent | Work | Status | Comment |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    '| 2026-08-28 | builder | absent race | completed | |\n',
  );
  rmSync(tracePath);
  writeFileSync(join(teamDir, 'tracking.md'), tracking);
  const marker = join(teamDir, '.absent-target-race-fired');
  const shimDir = commandShim('absent-target-substitution', 'node', `
if [ "$1" = "-" ] && [ ! -e "$TRACE_RACE_MARKER" ]; then
  printf '%s' "$TRACE_RACE_FOREIGN" > "$TRACE_RACE_TARGET"
  : > "$TRACE_RACE_MARKER"
fi
exec "$TRACE_REAL_NODE" "$@"`);
  const result = spawnSync('sh', [TRACE_OPS, 'migrate', teamDir], {
    encoding: 'utf8', timeout: 8000,
    env: {
      ...process.env,
      PATH: `${shimDir}:${process.env.PATH}`,
      TRACE_RACE_MARKER: marker,
      TRACE_RACE_TARGET: tracePath,
      TRACE_RACE_FOREIGN: foreign.toString('utf8'),
      TRACE_REAL_NODE: process.execPath,
    },
  });
  check('migrationAbsentTargetRace.exit', result.status === 0, false,
    'a target appearing after absent preflight aborts migration');
  check('migrationAbsentTargetRace.foreign', readFileSync(tracePath).equals(foreign), true,
    'the newly appeared foreign trace receives no delta');
  check('migrationAbsentTargetRace.source', readFileSync(join(teamDir, 'tracking.md')).equals(tracking), true,
    'migration restores the source after lost O_EXCL publication');
  check('migrationAbsentTargetRace.backup', existsSync(join(teamDir, 'tracking.md.bak')), false,
    'migration leaves no owned backup after rollback');
}

for (const [name, tracking] of [
  ['quoted', Buffer.from(
    '| Date | Agent | Work | Status | Comment |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    '| 2026-08-28 | builder | valid first | completed | |\n' +
    '| 2026-08-28"evil | builder | invalid later | completed | |\n')],
  ['control', Buffer.from(
    '| Date | Agent | Work | Status | Comment |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    '| 2026-08-28 | builder | valid first | completed | |\n' +
    `| 2026-08-${String.fromCharCode(1)}28 | builder | invalid later | completed | |\n`)],
  ['invalidUtf8', Buffer.concat([
    Buffer.from(
      '| Date | Agent | Work | Status | Comment |\n' +
      '| --- | --- | --- | --- | --- |\n' +
      '| 2026-08-28 | builder | valid first | completed | |\n| '),
    Buffer.from([0xff]),
    Buffer.from(' | builder | invalid later | completed | |\n'),
  ])],
]) {
  // GIVEN: a valid first row followed by a malicious unsupported Date value.
  const teamDir = newTeam(`migration-date-${name}`);
  const trace = Buffer.from('{"stable":true}\n');
  writeFileSync(join(teamDir, 'trace.jsonl'), trace);
  writeFileSync(join(teamDir, 'tracking.md'), tracking);
  const result = spawnSync('sh', [TRACE_OPS, 'migrate', teamDir], {
    encoding: 'utf8', timeout: 8000, env: { ...process.env, LC_ALL: 'C' },
  });
  check(`migrationDate.${name}.exit`, result.status === 0, false, 'malicious later Date aborts migration');
  check(`migrationDate.${name}.trace`, readFileSync(join(teamDir, 'trace.jsonl')).equals(trace), true,
    'trace remains byte-identical');
  check(`migrationDate.${name}.source`, readFileSync(join(teamDir, 'tracking.md')).equals(tracking), true,
    'legacy source remains byte-identical');
  check(`migrationDate.${name}.backup`, existsSync(join(teamDir, 'tracking.md.bak')), false,
    'no backup is published before complete delta validation');
}

{
  // GIVEN: migration pauses in its final publisher while holding the shared trace lock.
  const teamDir = newTeam('read-during-migrate');
  writeFileSync(join(teamDir, 'trace.jsonl'), '{"initial":true}\n');
  writeFileSync(join(teamDir, 'tracking.md'),
    '| Date | Agent | Work | Status | Comment |\n' +
    '| --- | --- | --- | --- | --- |\n' +
    '| 2026-08-28 | builder | concurrent row | completed | |\n');
  const marker = join(teamDir, '.publisher-paused');
  const release = join(teamDir, '.publisher-release');
  const readOut = join(teamDir, '.read-out');
  const readErr = join(teamDir, '.read-err');
  const shimDir = commandShim('read-during-migrate', 'node', `
if [ "$1" = "-" ] && [ ! -e "$TRACE_PAUSE_MARKER" ]; then
  : > "$TRACE_PAUSE_MARKER"
  while [ ! -e "$TRACE_PAUSE_RELEASE" ]; do sleep 0.01; done
fi
exec "$TRACE_REAL_NODE" "$@"`);
  const orchestratorDir = commandShim('read-during-migrate-orchestrator', 'orchestrate', `
export PATH="$TRACE_SHIM_DIR:$PATH"
sh "$TRACE_OPS_PATH" migrate "$TRACE_TEAM_DIR" >/dev/null 2>&1 &
migrate_pid=$!
attempt=0
while [ ! -e "$TRACE_PAUSE_MARKER" ] && [ "$attempt" -lt 500 ]; do
  sleep 0.01
  attempt=$((attempt + 1))
done
if [ ! -e "$TRACE_PAUSE_MARKER" ]; then
  : > "$TRACE_PAUSE_RELEASE"
  wait "$migrate_pid" || true
  exit 88
fi
set +e
sh "$TRACE_OPS_PATH" read "$TRACE_TEAM_DIR" >"$TRACE_READ_OUT" 2>"$TRACE_READ_ERR"
read_rc=$?
: > "$TRACE_PAUSE_RELEASE"
wait "$migrate_pid"
migrate_rc=$?
set -e
printf '%s %s' "$migrate_rc" "$read_rc"`);
  const result = spawnSync(join(orchestratorDir, 'orchestrate'), [], {
    encoding: 'utf8', timeout: 15000,
    env: {
      ...process.env,
      TRACE_SHIM_DIR: shimDir,
      TRACE_OPS_PATH: TRACE_OPS,
      TRACE_TEAM_DIR: teamDir,
      TRACE_PAUSE_MARKER: marker,
      TRACE_PAUSE_RELEASE: release,
      TRACE_REAL_NODE: process.execPath,
      TRACE_READ_OUT: readOut,
      TRACE_READ_ERR: readErr,
    },
  });
  check('readDuringMigrate.statuses', result.stdout, '0 1', 'migrate succeeds and contended read fails');
  check('readDuringMigrate.stdout', readFileSync(readOut, 'utf8'), '', 'contended read emits no partial data');
  check('readDuringMigrate.reason', readFileSync(readErr, 'utf8').includes('Trace operation locked'), true,
    'read contention is explicit');
  const finalLines = readFileSync(join(teamDir, 'trace.jsonl'), 'utf8').trimEnd().split('\n');
  check('readDuringMigrate.finalJsonl', finalLines.every((line) => {
    JSON.parse(line);
    return true;
  }), true, 'completed migration leaves only valid JSONL rows');
}

try {
  rmSync(BASE, { recursive: true, force: true });
} catch {
  /* ignore */
}

console.log('\n=== trace-ops TEST REPORT ===');
for (const line of results) console.log(line);
console.log(`\n  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
if (failed > 0) process.exit(1);
console.log('  ALL TESTS PASSED');
