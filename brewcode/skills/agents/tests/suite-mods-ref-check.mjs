// Offline contract suite for scripts/mods-ref-check.mjs: rc 0/1/2, verdict and DRIFT lines. Run: node --test <this file>.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'scripts', 'mods-ref-check.mjs');
const FIXTURE_REFS = join(HERE, 'fixtures', 'refs');
const WORK = mkdtempSync(join(tmpdir(), 'mods-ref-check-'));
after(() => rmSync(WORK, { recursive: true, force: true }));

let seq = 0;
const fresh = (name) => join(WORK, `${name}-${seq++}`);

// Fragments read straight from the fixture index: the last backtick span of each table row.
const FRAGMENTS = [...readFileSync(join(FIXTURE_REFS, 'mods-api.md'), 'utf8')
  .matchAll(/^\| (?:event|noun|type|field|option) \|.*\| `([^`]+)` \|$/gm)].map((m) => m[1]);

// Types text holding every fragment; every 3rd one gets its spaces swapped for newline/tab runs.
const typesFrom = (fragments, transform = (s) => s) => fragments
  .map((f, i) => (i % 3 === 0 ? f.replaceAll(' ', i % 2 === 0 ? '\n   ' : '\t \n') : f))
  .map((f) => `${transform(f)}\n// filler`)
  .join('\n');

const writeTypes = (text) => {
  const path = fresh('types') + '.d.ts';
  writeFileSync(path, text);
  return path;
};

const refsWith = (mutate) => {
  const dir = fresh('refs');
  cpSync(FIXTURE_REFS, dir, { recursive: true });
  mutate(dir);
  return dir;
};

const run = (...args) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  return { rc: r.status, lines: r.stdout.split('\n').filter(Boolean), stderr: r.stderr };
};

const INDEX_ROW = '| event | turn.step | `\'turn.step\': TurnStepInput;` |';
const VERIFIED_LINE = 'verified_on: mods-api.md=2.1.300 mods-changes.md=2.1.300 mods-lifecycle.md=2.1.300 '
  + 'mods-patterns.md=2.1.300 mods-testing.md=2.1.300';

test('GIVEN types holding all 109 fragments with extra whitespace WHEN checked THEN rc 0 and the exact CLEAN line', () => {
  const r = run(writeTypes(typesFrom(FRAGMENTS)), FIXTURE_REFS);
  assert.equal(FRAGMENTS.length, 109, 'fixture index row count');
  assert.deepEqual(
    { rc: r.rc, lines: r.lines, stderr: r.stderr },
    { rc: 0, lines: ['mods-ref-check: CLEAN 109/109 (verified_on 2.1.300)', VERIFIED_LINE], stderr: '' },
    'clean run output',
  );
});

test('GIVEN one event renamed in the types WHEN checked THEN rc 1 and a DRIFT line per missing row', () => {
  const r = run(writeTypes(typesFrom(FRAGMENTS, (s) => s.replaceAll("'turn.step'", "'turn.stride'"))), FIXTURE_REFS);
  assert.deepEqual(
    { rc: r.rc, lines: r.lines },
    {
      rc: 1,
      lines: [
        'mods-ref-check: DRIFT 2/109',
        "DRIFT event turn.step 'turn.step': TurnStepInput;",
        "DRIFT type StreamingEventName export type StreamingEventName = 'turn.step'",
        VERIFIED_LINE,
      ],
    },
    'drift run output',
  );
});

test('GIVEN a missing types file WHEN checked THEN rc 2 and an ERROR verdict', () => {
  const missing = fresh('absent') + '.d.ts';
  const r = run(missing, FIXTURE_REFS);
  assert.deepEqual(
    { rc: r.rc, lines: r.lines },
    { rc: 2, lines: [`mods-ref-check: ERROR cannot read types file ${missing}: ENOENT`] },
    'missing types output',
  );
});

test('GIVEN a refs dir without mods-api.md WHEN checked THEN rc 2 and an ERROR verdict', () => {
  const refs = refsWith((d) => rmSync(join(d, 'mods-api.md')));
  const r = run(writeTypes(typesFrom(FRAGMENTS)), refs);
  assert.deepEqual(
    { rc: r.rc, lines: r.lines },
    { rc: 2, lines: [`mods-ref-check: ERROR cannot read index file ${join(refs, 'mods-api.md')}: ENOENT`] },
    'missing mods-api.md output',
  );
});

test('GIVEN mods-api.md without the index block WHEN checked THEN rc 2 and an ERROR verdict', () => {
  const refs = refsWith((d) => writeFileSync(join(d, 'mods-api.md'), '# Mods API\n\n> verified_on: 2.1.300\n'));
  const r = run(writeTypes(typesFrom(FRAGMENTS)), refs);
  assert.deepEqual(
    { rc: r.rc, lines: r.lines },
    { rc: 2, lines: [`mods-ref-check: ERROR symbol index block missing in ${join(refs, 'mods-api.md')}`] },
    'absent block output',
  );
});

test('GIVEN an index row with an unbackticked fragment WHEN checked THEN rc 2 naming the row', () => {
  const bad = '| event | turn.step | TurnStepInput |';
  const refs = refsWith((d) => {
    const p = join(d, 'mods-api.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace(INDEX_ROW, bad));
  });
  const r = run(writeTypes(typesFrom(FRAGMENTS)), refs);
  assert.deepEqual(
    { rc: r.rc, lines: r.lines },
    { rc: 2, lines: [`mods-ref-check: ERROR malformed index row: ${bad}`] },
    'malformed row output',
  );
});

test('GIVEN an index row with an unknown kind WHEN checked THEN rc 2 naming the row', () => {
  const bad = INDEX_ROW.replace('| event |', '| widget |');
  const refs = refsWith((d) => {
    const p = join(d, 'mods-api.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace(INDEX_ROW, bad));
  });
  const r = run(writeTypes(typesFrom(FRAGMENTS)), refs);
  assert.deepEqual(
    { rc: r.rc, lines: r.lines },
    { rc: 2, lines: [`mods-ref-check: ERROR malformed index row: ${bad}`] },
    'unknown kind output',
  );
});

test('GIVEN a wrong argument count WHEN run THEN rc 2 and the usage verdict', () => {
  const r = run(FIXTURE_REFS);
  assert.deepEqual(
    { rc: r.rc, lines: r.lines },
    { rc: 2, lines: ['mods-ref-check: ERROR usage: mods-ref-check.mjs <types.d.ts> <refs dir>'] },
    'usage output',
  );
});

test('GIVEN an escaped pipe and a double-backtick span in the index WHEN checked THEN both fragments match', () => {
  const rows = '| type | Union | `type U = A \\| B;` |\n| type | Tick | `` const t = `x`; `` |';
  const refs = refsWith((d) => {
    const p = join(d, 'mods-api.md');
    const doc = readFileSync(p, 'utf8');
    writeFileSync(p, doc.replace('<!-- mods-symbols:end -->', `${rows}\n<!-- mods-symbols:end -->`));
  });
  const types = writeTypes(`${typesFrom(FRAGMENTS)}\ntype U =\n  A | B;\nconst t = \`x\`;\n`);
  const r = run(types, refs);
  assert.deepEqual(
    { rc: r.rc, verdict: r.lines[0] },
    { rc: 0, verdict: 'mods-ref-check: CLEAN 111/111 (verified_on 2.1.300)' },
    'escaped pipe and double-backtick output',
  );
});

test('GIVEN verified_on differing between files WHEN checked THEN rc stays 0 and a Warning line follows', () => {
  const refs = refsWith((d) => writeFileSync(join(d, 'mods-testing.md'), '# fixture\n\n> verified_on: 2.1.299\n'));
  const r = run(writeTypes(typesFrom(FRAGMENTS)), refs);
  assert.deepEqual(
    { rc: r.rc, lines: r.lines },
    {
      rc: 0,
      lines: [
        'mods-ref-check: CLEAN 109/109 (verified_on 2.1.300)',
        VERIFIED_LINE.replace('mods-testing.md=2.1.300', 'mods-testing.md=2.1.299'),
        'Warning: verified_on differs between mods-*.md files',
      ],
    },
    'mismatch output',
  );
});
