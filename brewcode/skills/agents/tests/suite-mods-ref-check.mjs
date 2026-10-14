// Offline contract suite for scripts/mods-ref-check.mjs, derived from the SHIPPED references. Run: node --test <this file>.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'scripts', 'mods-ref-check.mjs');
const REFS = join(HERE, '..', 'references');
const MODS = ['api', 'changes', 'lifecycle', 'patterns', 'testing'].map((n) => `mods-${n}.md`);
const WORK = mkdtempSync(join(tmpdir(), 'mods-ref-check-'));
after(() => rmSync(WORK, { recursive: true, force: true }));

let seq = 0;
const fresh = (name) => join(WORK, `${name}-${seq++}`);
const collapse = (s) => s.replace(/\s+/g, ' ');

const API_DOC = readFileSync(join(REFS, 'mods-api.md'), 'utf8');
const BLOCK = API_DOC.slice(API_DOC.indexOf('<!-- mods-symbols:begin -->'), API_DOC.indexOf('<!-- mods-symbols:end -->'));
const ROW_RE = /^\| (event|noun|type|field|option) \| (.+?) \| (?:`` (.+?) ``|`([^`]+)`) \|$/;
const ROWS = BLOCK.split('\n').flatMap((line) => {
  const m = ROW_RE.exec(line);
  return m ? [{ line, kind: m[1], symbol: m[2], fragment: collapse((m[3] ?? m[4]).replaceAll('\\|', '|')) }] : [];
});
const N = ROWS.length;
const VERSIONS = MODS.map((f) => [f, /verified_on:\s*([0-9]+(?:\.[0-9]+)*)/.exec(readFileSync(join(REFS, f), 'utf8'))[1]]);
const V = VERSIONS[0][1];
const VERIFIED_LINE = `verified_on: ${VERSIONS.map(([f, v]) => `${f}=${v}`).join(' ')}`;
const CLEAN_LINES = [`mods-ref-check: CLEAN ${N}/${N} (verified_on ${V})`, VERIFIED_LINE, `VERSION types ${V} references ${V}`];

// Types text holding every fragment; every 3rd one gets its spaces swapped for newline/tab runs.
const typesFrom = (fragments, version = V) => `// Written by Claude Code ${version}.\n`
  + fragments.map((f, i) => (i % 3 === 0 ? f.replaceAll(' ', i % 2 === 0 ? '\n   ' : '\t \n') : f)).map((f) => `${f}\n// filler`).join('\n');
const FRAGMENTS = ROWS.map((r) => r.fragment);

const writeTypes = (text) => {
  const path = fresh('types') + '.d.ts';
  writeFileSync(path, text);
  return path;
};

const refsWith = (mutate) => {
  const dir = fresh('refs');
  mkdirSync(dir);
  for (const f of MODS) copyFileSync(join(REFS, f), join(dir, f));
  mutate(dir);
  return dir;
};

const editFile = (name, edit) => (dir) => {
  const p = join(dir, name);
  writeFileSync(p, edit(readFileSync(p, 'utf8')));
};
const refsEdited = (name, edit) => refsWith(editFile(name, edit));
const replaceOnce = (from, to) => (doc) => doc.replace(from, () => to);
const END_MARK = '<!-- mods-symbols:end -->';
const beforeEnd = (rows) => replaceOnce(END_MARK, `${rows}\n${END_MARK}`);

const run = (args, nodeArgs = []) => {
  const r = spawnSync(process.execPath, [...nodeArgs, SCRIPT, ...args], { encoding: 'utf8' });
  return { rc: r.status, lines: r.stdout.split('\n').filter(Boolean), stderr: r.stderr };
};
const outcome = (r) => ({ rc: r.rc, lines: r.lines });
const error = (reason) => ({ rc: 2, lines: [`mods-ref-check: ERROR ${reason}`] });

test('GIVEN the shipped references and types holding every indexed fragment WHEN checked THEN rc 0 and the exact CLEAN output', () => {
  const r = run([writeTypes(typesFrom(FRAGMENTS)), REFS]);
  assert.deepEqual({ rc: r.rc, lines: r.lines, stderr: r.stderr }, { rc: 0, lines: CLEAN_LINES, stderr: '' }, 'clean run output');
});

test('GIVEN the shipped references directory WHEN listed THEN the five mods-*.md are present', () => {
  const found = readdirSync(REFS).filter((f) => /^mods-.+\.md$/.test(f)).sort();
  assert.deepEqual(found, MODS, 'shipped mods-*.md files');
});

test('GIVEN the first indexed fragment absent from the types WHEN checked THEN rc 1 and a DRIFT line per missing row', () => {
  const text = typesFrom(FRAGMENTS.slice(1));
  const missing = ROWS.filter((r) => !collapse(text).includes(r.fragment));
  const r = run([writeTypes(text), REFS]);
  assert.deepEqual(
    outcome(r),
    {
      rc: 1,
      lines: [
        `mods-ref-check: DRIFT ${missing.length}/${N}`,
        ...missing.map((m) => `DRIFT ${m.kind} ${m.symbol} ${m.fragment}`),
        VERIFIED_LINE,
        `VERSION types ${V} references ${V}`,
      ],
    },
    'drift run output',
  );
  assert.equal(r.lines[1], `DRIFT ${ROWS[0].kind} ${ROWS[0].symbol} ${ROWS[0].fragment}`, 'first DRIFT row is the removed one');
});

test('GIVEN a missing types file WHEN checked THEN rc 2 and an ERROR verdict', () => {
  const missing = fresh('absent') + '.d.ts';
  assert.deepEqual(outcome(run([missing, REFS])), error(`cannot read types file ${missing}: ENOENT`), 'missing types output');
});

test('GIVEN a directory as the types path WHEN checked THEN rc 2 and an EISDIR verdict', () => {
  assert.deepEqual(outcome(run([WORK, REFS])), error(`cannot read types file ${WORK}: EISDIR`), 'directory types output');
});

test('GIVEN a regular file as the refs dir WHEN checked THEN rc 2 and an ENOTDIR verdict', () => {
  const file = writeTypes('x');
  const r = run([writeTypes(typesFrom(FRAGMENTS)), file]);
  assert.deepEqual(outcome(r), error(`cannot read index file ${join(file, 'mods-api.md')}: ENOTDIR`), 'file as refs dir output');
});

test('GIVEN an unexpected exception inside the script WHEN checked THEN rc 2 and a one-line ERROR verdict', () => {
  const preload = fresh('boom') + '.mjs';
  writeFileSync(preload, "const o = String.prototype.replaceAll;\nString.prototype.replaceAll = function (a, b) { if (a === '\\\\|') throw new TypeError('boom'); return o.call(this, a, b); };\n");
  const r = run([writeTypes(typesFrom(FRAGMENTS)), REFS], ['--import', preload]);
  assert.deepEqual({ ...outcome(r), stderr: r.stderr }, { ...error('unexpected TypeError: boom'), stderr: '' }, 'unexpected exception output');
});

test('GIVEN a refs dir without mods-api.md WHEN checked THEN rc 2 and an ERROR verdict', () => {
  const refs = refsWith((d) => rmSync(join(d, 'mods-api.md')));
  assert.deepEqual(
    outcome(run([writeTypes(typesFrom(FRAGMENTS)), refs])),
    error(`cannot read index file ${join(refs, 'mods-api.md')}: ENOENT`),
    'missing mods-api.md output',
  );
});

for (const name of MODS.slice(1)) {
  test(`GIVEN a refs dir without ${name} WHEN checked THEN rc 2 naming the missing file`, () => {
    const refs = refsWith((d) => rmSync(join(d, name)));
    assert.deepEqual(
      outcome(run([writeTypes(typesFrom(FRAGMENTS)), refs])),
      error(`cannot read reference ${join(refs, name)}: ENOENT`),
      `missing ${name} output`,
    );
  });
}

test('GIVEN an extra mods-extra.md in the refs dir WHEN checked THEN it is ignored and the output stays CLEAN', () => {
  const refs = refsWith((d) => writeFileSync(join(d, 'mods-extra.md'), '# extra\n\n> verified_on: 0.0.1\n'));
  assert.deepEqual(outcome(run([writeTypes(typesFrom(FRAGMENTS)), refs])), { rc: 0, lines: CLEAN_LINES }, 'extra file output');
});

test('GIVEN a reference without verified_on WHEN checked THEN rc 2 naming the file', () => {
  const refs = refsEdited('mods-testing.md', (doc) => doc.replaceAll('verified_on', 'verified'));
  assert.deepEqual(
    outcome(run([writeTypes(typesFrom(FRAGMENTS)), refs])),
    error(`no verified_on in ${join(refs, 'mods-testing.md')}`),
    'absent verified_on output',
  );
});

test('GIVEN a verified_on with a trailing dot WHEN checked THEN the dot is not part of the version', () => {
  const refs = refsEdited('mods-testing.md', (doc) => doc.replace(`verified_on: ${V}`, `verified_on: ${V}.`));
  assert.deepEqual(outcome(run([writeTypes(typesFrom(FRAGMENTS)), refs])), { rc: 0, lines: CLEAN_LINES }, 'trailing dot output');
});

test('GIVEN mods-api.md without the index block WHEN checked THEN rc 2 and an ERROR verdict', () => {
  const refs = refsEdited('mods-api.md', () => `# Mods API\n\n> verified_on: ${V}\n`);
  assert.deepEqual(
    outcome(run([writeTypes(typesFrom(FRAGMENTS)), refs])),
    error(`symbol index block missing in ${join(refs, 'mods-api.md')}`),
    'absent block output',
  );
});

test('GIVEN the END marker before the BEGIN marker WHEN checked THEN rc 2 and block missing', () => {
  const refs = refsEdited('mods-api.md', () => `# Mods API\n\n> verified_on: ${V}\n<!-- mods-symbols:end -->\n<!-- mods-symbols:begin -->\n| kind | symbol | fragment |\n|---|---|---|\n`);
  assert.deepEqual(
    outcome(run([writeTypes(typesFrom(FRAGMENTS)), refs])),
    error(`symbol index block missing in ${join(refs, 'mods-api.md')}`),
    'reversed markers output',
  );
});

test('GIVEN an index block with only header and separator WHEN checked THEN rc 2 and header malformed', () => {
  const refs = refsEdited('mods-api.md', () => `# Mods API\n\n> verified_on: ${V}\n<!-- mods-symbols:begin -->\n| kind | symbol | fragment |\n|---|---|---|\n${END_MARK}\n`);
  assert.deepEqual(
    outcome(run([writeTypes(typesFrom(FRAGMENTS)), refs])),
    error(`index table header or separator malformed in ${join(refs, 'mods-api.md')}`),
    'header-only output',
  );
});

test('GIVEN marker text inside a prose line before the block WHEN checked THEN only the marker lines count and the output is CLEAN', () => {
  const refs = refsEdited('mods-api.md', replaceOnce('<!-- mods-symbols:begin -->', 'Prose mentions <!-- mods-symbols:begin --> and <!-- mods-symbols:end --> inline.\n\n<!-- mods-symbols:begin -->'));
  assert.deepEqual(outcome(run([writeTypes(typesFrom(FRAGMENTS)), refs])), { rc: 0, lines: CLEAN_LINES }, 'inline marker output');
});

test('GIVEN a second index block WHEN checked THEN rc 2 and the ghost rows are not skipped silently', () => {
  const second = '<!-- mods-symbols:begin -->\n| kind | symbol | fragment |\n|---|---|---|\n| type | Ghost | `NoSuchThing;` |\n<!-- mods-symbols:end -->\n';
  const refs = refsEdited('mods-api.md', (doc) => `${doc}\n${second}`);
  assert.deepEqual(
    outcome(run([writeTypes(typesFrom(FRAGMENTS)), refs])),
    error(`second symbol index block in ${join(refs, 'mods-api.md')}`),
    'two blocks output',
  );
});

test('GIVEN a duplicated index row WHEN checked THEN rc 2 naming kind and symbol', () => {
  const refs = refsEdited('mods-api.md', beforeEnd(ROWS[0].line));
  assert.deepEqual(
    outcome(run([writeTypes(typesFrom(FRAGMENTS)), refs])),
    error(`duplicate index row: ${ROWS[0].kind} ${ROWS[0].symbol} in ${join(refs, 'mods-api.md')}`),
    'duplicate row output',
  );
});

test('GIVEN a 7-character fragment WHEN checked THEN rc 2 and fragment too short', () => {
  const row = '| type | Short | `1234567` |';
  const refs = refsEdited('mods-api.md', beforeEnd(row));
  assert.deepEqual(
    outcome(run([writeTypes(typesFrom(FRAGMENTS)), refs])),
    error(`fragment shorter than 8 characters: ${row}`),
    'short fragment output',
  );
});

test('GIVEN an 8-character fragment present in the types WHEN checked THEN it is accepted as the 110th row', () => {
  const refs = refsEdited('mods-api.md', beforeEnd('| type | Edge | `12345678` |'));
  assert.deepEqual(
    run([writeTypes(`${typesFrom(FRAGMENTS)}\n12345678\n`), refs]).lines[0],
    `mods-ref-check: CLEAN ${N + 1}/${N + 1} (verified_on ${V})`,
    'minimum fragment verdict',
  );
});

test('GIVEN an index row with an unbackticked fragment WHEN checked THEN rc 2 naming the row', () => {
  const bad = '| event | turn.step | TurnStepInput |';
  const refs = refsEdited('mods-api.md', replaceOnce(ROWS[0].line, bad));
  assert.deepEqual(outcome(run([writeTypes(typesFrom(FRAGMENTS)), refs])), error(`malformed index row: ${bad}`), 'malformed row output');
});

test('GIVEN an index row with an unknown kind WHEN checked THEN rc 2 naming the row', () => {
  const bad = ROWS[0].line.replace(`| ${ROWS[0].kind} |`, '| widget |');
  const refs = refsEdited('mods-api.md', replaceOnce(ROWS[0].line, bad));
  assert.deepEqual(outcome(run([writeTypes(typesFrom(FRAGMENTS)), refs])), error(`malformed index row: ${bad}`), 'unknown kind output');
});

test('GIVEN one argument WHEN run THEN rc 2 and the usage verdict', () => {
  assert.deepEqual(outcome(run([REFS])), error('usage: mods-ref-check.mjs <types.d.ts> <refs dir>'), 'one-arg output');
});

test('GIVEN three arguments WHEN run THEN rc 2 and the usage verdict', () => {
  assert.deepEqual(
    outcome(run([writeTypes(typesFrom(FRAGMENTS)), REFS, 'extra'])),
    error('usage: mods-ref-check.mjs <types.d.ts> <refs dir>'),
    'three-arg output',
  );
});

test('GIVEN an escaped pipe and a double-backtick span in the index WHEN checked THEN both fragments match', () => {
  const rows = '| type | Union | `type U = A \\| B;` |\n| type | Tick | `` const t = `x`; `` |';
  const refs = refsEdited('mods-api.md', beforeEnd(rows));
  const r = run([writeTypes(`${typesFrom(FRAGMENTS)}\ntype U =\n  A | B;\nconst t = \`x\`;\n`), refs]);
  assert.deepEqual(
    { rc: r.rc, verdict: r.lines[0] },
    { rc: 0, verdict: `mods-ref-check: CLEAN ${N + 2}/${N + 2} (verified_on ${V})` },
    'escaped pipe and double-backtick output',
  );
});

test('GIVEN verified_on differing between files WHEN checked THEN rc stays 0, a Warning follows verified_on and VERSION is last', () => {
  const refs = refsEdited('mods-testing.md', (doc) => doc.replace(`verified_on: ${V}`, 'verified_on: 0.0.1'));
  assert.deepEqual(
    outcome(run([writeTypes(typesFrom(FRAGMENTS)), refs])),
    {
      rc: 0,
      lines: [
        CLEAN_LINES[0],
        VERIFIED_LINE.replace(`mods-testing.md=${V}`, 'mods-testing.md=0.0.1'),
        'Warning: verified_on differs between mods-*.md files',
        CLEAN_LINES[2],
      ],
    },
    'mismatch output',
  );
});

test('GIVEN types from another build than the references WHEN checked THEN rc stays 0 and VERSION ends with MISMATCH', () => {
  assert.deepEqual(
    outcome(run([writeTypes(typesFrom(FRAGMENTS, '0.0.1')), REFS])),
    { rc: 0, lines: [CLEAN_LINES[0], VERIFIED_LINE, `VERSION types 0.0.1 references ${V} MISMATCH`] },
    'version mismatch output',
  );
});

test('GIVEN an empty types file WHEN checked THEN rc 2 and the not-a-types-file verdict', () => {
  assert.deepEqual(outcome(run([writeTypes(''), REFS])), error('types file empty or not a Claude Code types file'), 'empty types output');
});

test('GIVEN a types file without the Claude Code header on line 1 WHEN checked THEN rc 2 and the not-a-types-file verdict', () => {
  const r = run([writeTypes(`// other header\n// Written by Claude Code ${V}.\n${FRAGMENTS.join('\n')}`), REFS]);
  assert.deepEqual(outcome(r), error('types file empty or not a Claude Code types file'), 'headerless types output');
});

test('GIVEN CRLF line endings in the types and mods-api.md plus a BOM on the types WHEN checked THEN the output is CLEAN', () => {
  const types = `﻿${typesFrom(FRAGMENTS).replaceAll('\n', '\r\n')}`;
  const refs = refsEdited('mods-api.md', (doc) => doc.replaceAll('\n', '\r\n'));
  assert.deepEqual(outcome(run([writeTypes(types), refs])), { rc: 0, lines: CLEAN_LINES }, 'CRLF and BOM output');
});
