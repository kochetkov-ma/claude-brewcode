#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// Keeps user site-packages (pip --user) that -I hides, and drops only the cwd entry '' of -c / stdin.
const SAFE = 'import sys; sys.path[:] = [p for p in sys.path if p]';
const SKIP = [/^\.codex\/reports\//, /^web\/docs\/package-lock\.json$/];
// Test data, never executed: an indexed fixture file and a telemetry reject-list command string.
const DATA = new Set([
  'brewcode/skills/semble-setup/tests/fixtures/repo-b/run.sh\0exec python3 -c "print(\'entry point main function\')"',
  'brewcode/skills/semble-setup/tests/suite-telemetry.mjs\0    \'python3 -c "import re"\',',
]);

function startsSafe(text) {
  return text.replace(/^\s*['"]?/, '').startsWith(SAFE);
}

function calls(text) {
  const found = [];
  const lineOf = at => text.slice(0, at).split('\n').length;
  for (const m of text.matchAll(/(?<![\w./-])python3?((?:\s+-[A-Za-z]+)*?)\s+(-[cm]\b|-(?=\s))/g)) {
    const after = text.slice(m.index + m[0].length);
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    const lineEnd = text.indexOf('\n', m.index);
    const line = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd);
    const heredoc = after.slice(0, after.indexOf('\n') + 1).includes('<<') ? after.slice(after.indexOf('\n') + 1) : '';
    const isolated = /(^|\s)-I(\s|$)/.test(m[1] + ' ')
      || (m[2] === '-c' && startsSafe(after))
      || (m[2] === '-' && heredoc.startsWith(SAFE))
      || (m[2] === '-m' && text.slice(lineStart, m.index).endsWith('cd / && '));
    found.push({ line: lineOf(m.index), text: line, isolated });
  }
  for (const m of text.matchAll(/(?:['"]python3?['"]|sys\.executable)\s*,\s*\[?\s*/g)) {
    const literals = [];
    let rest = text.slice(m.index + m[0].length);
    for (let next; (next = rest.match(/^\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*,?\s*/s)); rest = rest.slice(next[0].length)) literals.push(next[2]);
    const mode = literals.findIndex(value => value === '-c' || value === '-m' || value === '-');
    if (mode < 0 || literals.slice(0, mode).some(value => !value.startsWith('-'))) continue;
    const isolated = literals.slice(0, mode).includes('-I') || (literals[mode] === '-c' && (literals[mode + 1] ?? '').startsWith(SAFE));
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    const lineEnd = text.indexOf('\n', m.index);
    found.push({ line: lineOf(m.index), text: text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd), isolated });
  }
  return found;
}

for (const [label, source, expected] of [
  ['shell -c without -I', "python3 -c 'import json'", [false]],
  ['shell stdin heredoc without -I', "python3 - \"$f\" <<'PY'\nimport json\nPY", [false]],
  ['shell -m without -I', 'python -m py_compile x.py', [false]],
  ['flags before -c without -I', "python3 -B -c 'import re'", [false]],
  ['shell -I -S -c', "python3 -I -S -c 'import json'", [true]],
  ['shell -I -S stdin', "python3 -I -S - \"$zip\" <<'PY'\nimport hashlib\nPY", [true]],
  ['site-package check drops cwd', `python3 -c "${SAFE}; import yaml"`, [true]],
  ['pip from a neutral cwd', '(cd / && python3 -m pip install x==1)', [true]],
  ['script file is out of class', 'python3 "$HERE/history.py" init', []],
  ['JS -c without -I', "spawnSync('python3', ['-c', 'import json'])", [false]],
  ['JS -I -S -c', "spawnSync('python3', ['-I', '-S', '-c', 'import json'])", [true]],
  ['JS site-package check drops cwd', `spawnSync('python3', ['-c', '${SAFE}; import yaml'])`, [true]],
  ['JS script file is out of class', "spawnSync('python3', [join(dir, 'history.py'), 'init'])", []],
  ['Python list -c without -I', "subprocess.run(['python3', '-c', 'import json'])", [false]],
  ['Python sys.executable -I -c', "subprocess.run([sys.executable, '-I', '-c', 'pass'])", [true]],
]) test(`detector: ${label}`, () => {
  // GIVEN one invocation shape WHEN classified THEN only cwd-isolated calls pass.
  assert.deepEqual(calls(source).map(call => call.isolated), expected, `${label}: isolation verdict`);
});

test('every tracked Python -c, stdin and -m call ignores modules in the working directory', () => {
  // GIVEN every tracked text file WHEN scanned THEN no call puts the working directory on sys.path.
  const listed = spawnSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8' });
  assert.equal(listed.status, 0, `git ls-files must list the tracked tree: ${listed.stderr}`);
  const files = listed.stdout.split('\0').filter(file => file && !SKIP.some(rule => rule.test(file)));
  const found = files.flatMap(file => {
    // Symlinks name files already scanned at their real path.
    if (!lstatSync(join(ROOT, file)).isFile()) return [];
    const bytes = readFileSync(join(ROOT, file));
    if (bytes.includes(0)) return [];
    return calls(bytes.toString('utf8')).filter(call => !DATA.has(`${file}\0${call.text}`)).map(call => ({ ...call, file }));
  });
  const open = found.filter(call => !call.isolated).map(call => `${call.file}:${call.line}: ${call.text.trim()}`);
  assert.deepEqual([open, found.length > 0], [[], true], 'each python -c / - / -m call carries -I, drops the cwd entry, or runs pip from /');
});
