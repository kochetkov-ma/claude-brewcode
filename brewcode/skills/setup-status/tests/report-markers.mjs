#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const STATUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['SKILL.md', 'references/signals.md', 'references/run-list.md', 'references/upgrade-runner.md'];
const MARKERS = ['🟢', '🔵', '🔴', '⚪'];
const PICTO = /\p{Extended_Pictographic}/gu;

// Every line with its fence context: 'bash', another fence language ('' = bare), or null outside fences.
function scan(file) {
  let fence = null;
  return readFileSync(join(STATUS_DIR, file), 'utf8').split('\n').map((text, i) => {
    const open = /^\s*```(\S*)/.exec(text);
    const row = { file, n: i + 1, text, fence: open ? 'marker' : fence };
    if (open) fence = fence === null ? open[1] : null;
    return row;
  });
}
const LINES = FILES.flatMap(scan);
const picto = text => [...text.matchAll(PICTO)].map(match => match[0]);
const isRunLine = row => row.file === 'references/upgrade-runner.md' && row.fence === null && row.text.startsWith('`Rows to run: ');
const isQ1 = row => row.file === 'SKILL.md' && row.fence === null && row.text.startsWith('| Q1 `Upgrade N setups now?`');
const isFenceCheck = row => row.fence === 'bash' || row.text.startsWith('> **STOP if ❌**');

test('GIVEN SKILL.md and upgrade-runner.md WHEN scanning every pictograph THEN only 🟢🔵🔴⚪ mark status, ✅❌ stay fence checks, 🌐 only in the run line and Q1', () => {
  const allowed = row => [...MARKERS, ...(isFenceCheck(row) ? ['✅', '❌'] : []), ...(isRunLine(row) || isQ1(row) ? ['🌐'] : [])];
  const violations = LINES.flatMap(row => picto(row.text).filter(ch => !allowed(row).includes(ch)).map(ch => `${row.file}:${row.n} ${ch}`));
  const globe = LINES.filter(row => row.text.includes('🌐')).map(row => `${row.file} ${row.text.slice(0, 7)}`);
  assert.deepEqual({ violations, globe }, { violations: [], globe: ['SKILL.md | Q1 `U', 'references/upgrade-runner.md `Rows t'] },
    'house markers only (impl-brief); OQ10: 🌐 marks global rows in the runner run line (the PLAN prints before the probes) and Q1, the report writes (global)');
});

test('GIVEN the run-list and the Phase 7 report templates WHEN reading titles and stage headers THEN titles open with a marker and stage headers carry none', () => {
  const md = LINES.filter(row => row.fence === 'markdown');
  const titles = LINES.flatMap(row => [...row.text.matchAll(/(?:^|`)## (\S+) Setups\b/g)].map(match => `${row.file} ${match[1]}`));
  const stages = LINES.filter(row => /\*\*Stage (\d+|<n>) — /.test(row.text) || /^\| \d \*\*[A-Z]/.test(row.text));
  assert.deepEqual({
    templateLines: md.length,
    templateEmoji: md.flatMap(row => picto(row.text).filter(ch => !MARKERS.includes(ch)).map(ch => `${row.file}:${row.n} ${ch}`)),
    titles,
    stageLines: stages.length,
    stageEmoji: stages.filter(row => picto(row.text).length > 0).map(row => `${row.file}:${row.n}`),
  }, {
    templateLines: 32, templateEmoji: [],
    titles: ['SKILL.md <marker>', 'references/upgrade-runner.md ⚪', 'references/upgrade-runner.md 🔴'],
    stageLines: 11, stageEmoji: [],
  }, 'run-list (15) + Phase 7 report (17) fences; titles open with one marker; stage names (3 sample headers, the header rule, 7 table rows) are plain');
});
