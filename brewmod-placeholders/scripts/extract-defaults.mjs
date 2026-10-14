#!/usr/bin/env node
// Regenerates placeholders/{m,m.plan,a,r,rr,+}.md from the brewtools manager-setup references; zero deps.
// Flags: --check (no writes, rc 1 on drift) | --shas (body sha table) | --dir <placeholders> | --refs <references>.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, def) => (args.includes(n) ? args[args.indexOf(n) + 1] : def);
const DIR = path.resolve(opt('--dir', path.join(ROOT, 'placeholders')));
const REFS = path.resolve(opt('--refs', path.join(ROOT, '..', 'brewtools', 'skills', 'manager-setup', 'references')));

const FIELDS = ['name', 'description', 'insert', 'when', 'order', 'group', 'priority', 'header', 'legacy'];
const QUOTED = new Set(['name', 'description', 'header']);

// ref = brewtools references/<ref>.md (the legacy mode name); headers copied from manager-prompt.mjs.
const DEFS = [
  { file: 'm.md', ref: 'full', meta: { name: 'm', description: 'Manager mode: orchestrate and delegate, never code in the main context', insert: 'context', when: 'always', order: 20, header: 'User typed `{token}` — Manager mode is active for this turn:', legacy: 'full' } },
  { file: 'm.plan.md', ref: 'planmode', meta: { name: 'm', description: 'Manager mode in Plan mode: the manager text plus the plan addon', insert: 'context', when: 'plan', order: 20, header: 'User typed `{token}` — Manager + Plan Mode is active for this turn:', legacy: 'planmode' } },
  { file: 'a.md', ref: 'architect', meta: { name: 'a', description: 'Architecture-first: delegate the design to expert agents before implementing', insert: 'context', when: 'always', order: 30, header: 'User typed `{token}` — Architecture-first discipline is active for this turn:', legacy: 'architect' } },
  { file: 'r.md', ref: 'review-double', meta: { name: 'r', description: 'Two-phase review: review every significant change, then double-check each finding', insert: 'context', when: 'always', order: 40, group: 'review', priority: 1, header: 'User typed `{token}` — Two-phase review discipline is active for this turn:', legacy: 'review-double' } },
  { file: 'rr.md', ref: 'review-regression', meta: { name: 'rr', description: 'Anti-regression review: regression, project standard and functional correctness axes', insert: 'context', when: 'always', order: 40, group: 'review', priority: 2, header: 'User typed `{token}` — Anti-regression review discipline is active for this turn:', legacy: 'review-regression' } },
  { file: '+.md', ref: 'cron-plan', meta: { name: '+', description: 'Anti-drift cron plan addon, active in Plan mode only', insert: 'context', when: 'plan', order: 10, header: 'User typed `{token}` in Plan mode — plan the task anti-drift cron:', legacy: 'cron-plan' } },
];

// 1:1 port of extractFenced in brewtools/hooks/lib/manager-prompts.mjs (no fence -> whole file trimmed).
function extractFenced(raw) {
  const blocks = [];
  const re = /(?:```|~~~)[^\n]*\n([\s\S]*?)\n?(?:```|~~~)/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    blocks.push(m[1].replace(/\n+$/, ''));
  }
  if (blocks.length === 0) return raw.trim();
  return blocks.join('\n\n').trim();
}

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

function render(meta, body) {
  const lines = FIELDS.filter((k) => meta[k] !== undefined).map((k) => `${k}: ${QUOTED.has(k) ? JSON.stringify(meta[k]) : meta[k]}`);
  return `---\n${lines.join('\n')}\n---\n${body}\n`;
}

// Body = text after the first closing `---` line, one trailing newline removed.
function bodyOf(text) {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---\n', 3);
  return end < 0 ? null : text.slice(end + 5).replace(/\n$/, '');
}

function firstDiff(a, b) {
  const al = a.split('\n');
  const bl = b.split('\n');
  for (let i = 0; i < Math.max(al.length, bl.length); i++) {
    if (al[i] !== bl[i]) return `line ${i + 1}: actual ${JSON.stringify((al[i] ?? '<eof>').slice(0, 60))} vs expected ${JSON.stringify((bl[i] ?? '<eof>').slice(0, 60))}`;
  }
  return 'no line difference (trailing bytes)';
}

const expected = new Map();
for (const d of DEFS) {
  const refPath = path.join(REFS, `${d.ref}.md`);
  if (!fs.existsSync(refPath)) {
    process.stderr.write(`extract-defaults: missing reference ${refPath}\n`);
    process.exit(2);
  }
  const body = extractFenced(fs.readFileSync(refPath, 'utf8'));
  expected.set(d.file, { body, text: render(d.meta, body) });
}

if (flag('--shas')) {
  for (const d of DEFS) {
    const actual = fs.existsSync(path.join(DIR, d.file)) ? bodyOf(fs.readFileSync(path.join(DIR, d.file), 'utf8')) : null;
    process.stdout.write(`${d.file}\t${d.meta.legacy}\t${actual === null ? 'MISSING' : sha(actual).slice(0, 16)}\t${actual === null ? 0 : Buffer.byteLength(actual)}\n`);
  }
  process.exit(0);
}

if (flag('--check')) {
  const problems = [];
  const bodies = new Map();
  for (const d of DEFS) {
    const file = path.join(DIR, d.file);
    const want = expected.get(d.file);
    if (!fs.existsSync(file)) { problems.push(`MISSING ${d.file}`); continue; }
    const actual = fs.readFileSync(file, 'utf8');
    bodies.set(d.file, bodyOf(actual));
    if (actual !== want.text) {
      problems.push(`DRIFT ${d.file}: ${Buffer.byteLength(actual)} bytes sha ${sha(actual).slice(0, 12)} vs expected ${Buffer.byteLength(want.text)} bytes sha ${sha(want.text).slice(0, 12)}; ${firstDiff(actual, want.text)}`);
    }
  }
  const known = new Set(DEFS.map((d) => d.file));
  for (const f of fs.existsSync(DIR) ? fs.readdirSync(DIR) : []) {
    if (f.endsWith('.md') && !known.has(f)) problems.push(`UNEXPECTED ${f}`);
  }
  const m = bodies.get('m.md');
  const mp = bodies.get('m.plan.md');
  if (typeof m !== 'string' || typeof mp !== 'string' || !mp.startsWith(`${m}\n\n`)) problems.push('INVARIANT m.plan.md body must start with m.md body + "\\n\\n"');
  if (problems.length > 0) {
    process.stderr.write(`extract-defaults --check: ${problems.length} problem(s)\n${problems.join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write(`extract-defaults --check: OK ${DEFS.length}/${DEFS.length} defaults match ${REFS}\n`);
  process.exit(0);
}

fs.mkdirSync(DIR, { recursive: true });
for (const d of DEFS) {
  const file = path.join(DIR, d.file);
  const want = expected.get(d.file).text;
  const same = fs.existsSync(file) && fs.readFileSync(file, 'utf8') === want;
  if (!same) fs.writeFileSync(file, want);
  process.stdout.write(`${same ? 'unchanged' : 'wrote'} ${d.file}\n`);
}
