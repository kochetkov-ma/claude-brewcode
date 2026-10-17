#!/usr/bin/env node
// Phase 3b: classified rows (stdin JSON [{row, setup, scope, team, class, state, drift, before, plugin, command}]) -> runner plan.
// Usage: node upgrade-plan.mjs [--quick] [--spawn-depth N] [--root <plugin>=<dir>]... -> JSON {auto, manual, counts}; exit 0, 1 = bad input, 2 = usage.
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Stage n = STAGES[n - 1], rows in run order: the table in references/run-list.md (tests/upgrade-plan-lockstep.mjs).
export const STAGES = [[11], [2], [12], [1], [7, 8, 6, 3], [4], [9, 10]];
export const ORDER = STAGES.flat();
export const DELEGATES = [4, 6, 7, 11]; // owners whose upgrade spawns a subagent (SKILL.md Phase 0b)
export const SCOPED = [6, 11]; // installed per scope: one input object per installed scope; row 1: one per team
const SCOPES = ['project', 'global'];
const DRIFTS = ['behind', 'differs']; // disabled rows: `differs` = only a DIFFERS pair under a current stamp
const TEAM = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;
const MODIFIED = 'modified: a hand edit or a missed re-copy, diff it first';
const UPGRADE_WORD = /^\/?[a-z0-9-]+:[a-z0-9-]+ upgrade ([A-Za-z0-9_][A-Za-z0-9_-]*)(?= |$)/;

function fail(msg, rc) { process.stderr.write(`upgrade-plan: ${msg}\n`); process.exit(rc); }
const stageOf = id => STAGES.findIndex(rows => rows.includes(id)) + 1;
const upgradeWord = r => UPGRADE_WORD.exec(typeof r.command === 'string' ? r.command : '')?.[1];
// The Command's word after `upgrade` names the scope; the input field covers a Command without one.
const scopeOf = r => (SCOPES.includes(upgradeWord(r)) ? upgradeWord(r) : r.scope);

// '' = valid; else the rc 1 message. A scope/team the Command disagrees with would upgrade the wrong target.
function invalid(r) {
  if (!r || !ORDER.includes(r.row) || !/^\/?[a-z0-9-]+:[a-z0-9-]+$/.test(r.setup ?? '')
    || typeof r.state !== 'string' || !/^[ABC]$/.test(r.class ?? '')) return 'needs row (roster id), setup, state, class A|B|C';
  if (r.command != null && typeof r.command !== 'string') return 'command must be a string';
  if (r.drift != null && !DRIFTS.includes(r.drift)) return `drift must be ${DRIFTS.join('|')}`;
  const word = upgradeWord(r);
  if (SCOPED.includes(r.row) && SCOPES.includes(word) && r.scope != null && r.scope !== word) return `scope ${r.scope} != Command scope ${word}`;
  if (r.row === 1 && TEAM.test(word ?? '') && r.team != null && r.team !== word) return `team ${r.team} != Command team ${word}`;
  return '';
}

// 'drop' = needs no command; '' = auto; any other string = manual, with that reason.
function decide(r, { quick, depth }) {
  const st = r.state, cmd = r.command ?? '';
  const verb = /^\/?[a-z0-9-]+:[a-z0-9-]+ (\S+)/.exec(cmd)?.[1] ?? 'none';
  const restamp = st === 'current (restamp pending)';
  const disabled = st.startsWith('disabled');
  if (/^(n\/a|missing|version unknown)/.test(st) || (st.startsWith('current') && !restamp)) return 'drop';
  // A clean disabled row only: a drift row, a chain or a --force Command is never dropped.
  if (disabled && !r.drift && (cmd.trim() === '' || ['enable', 'status'].includes(verb)) && !cmd.includes(', then ') && !cmd.includes('--force')) return 'drop';
  if (r.class === 'C') return 'class C: an interview upgrade, run it yourself';
  if (st.startsWith('modified')) return MODIFIED;
  if (st.includes('(custom)')) return 'custom registration: report-only, your call';
  if (cmd.includes('--force')) return 'prescribes --force: your call';
  if (disabled && r.drift !== 'behind') return r.drift === 'differs' ? MODIFIED : 'disabled with no drift kind: diff it first';
  if (cmd.includes(', then ')) return 'parked: enable, upgrade and disable run by hand';
  if (!restamp && verb !== 'upgrade') return `prescribes ${verb}`;
  if (SCOPED.includes(r.row) && !SCOPES.includes(scopeOf(r))) return 'no scope token';
  if (r.row === 1 && !TEAM.test(r.team ?? '')) return 'no team name';
  if (depth === 0) return 'spawn depth 0: no subagent can run';
  if (depth === 1 && DELEGATES.includes(r.row)) return 'spawn depth 1: this owner delegates to a subagent';
  if (quick && r.class === 'B') return 'quick run: class B is a long run';
  return '';
}

function frontmatterModel(file) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { fail(`cannot read ${file}`, 1); }
  const fm = /^---\n([\s\S]*?)\n---/.exec(text);
  return (fm && /^model: *(\S+)/m.exec(fm[1]))?.[1] ?? 'inherit';
}

function main(argv) {
  let quick = false, depth = null;
  const roots = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--quick') quick = true;
    else if (argv[i] === '--spawn-depth' && /^\d+$/.test(argv[i + 1] ?? '')) depth = Number(argv[++i]);
    else if (argv[i] === '--root' && /^[a-z0-9-]+=./.test(argv[i + 1] ?? '')) { const [k, ...v] = argv[++i].split('='); roots[k] = v.join('='); }
    else fail(`bad argument ${argv[i]}; usage: [--quick] [--spawn-depth N] [--root <plugin>=<dir>]...`, 2);
  }
  let rows;
  try { rows = JSON.parse(readFileSync(0, 'utf8')); } catch (e) { fail(`stdin is not JSON: ${e.message}`, 1); }
  if (!Array.isArray(rows)) fail('stdin must be a JSON array', 1);
  rows.forEach((r, i) => { const why = invalid(r); if (why) fail(`row ${i}: ${why}`, 1); });

  const auto = [], manual = [];
  for (const r of [...rows].sort((a, b) => ORDER.indexOf(a.row) - ORDER.indexOf(b.row))) {
    const why = decide(r, { quick, depth });
    if (why === 'drop') continue;
    const [plugin, skill] = r.setup.replace(/^\//, '').split(':');
    const base = { row: r.row, stage: stageOf(r.row), setup: `${plugin}:${skill}`, class: r.class, state: r.state, before: r.before ?? null,
      plugin: r.plugin ?? null, command: r.command ?? null };
    if (why) { manual.push({ ...base, reason: why }); continue; }
    if (!roots[plugin]) fail(`no --root for ${plugin} (row ${r.row})`, 1);
    const dir = join(roots[plugin], 'skills', skill);
    // decide() already proved the scope (rows 6, 11) or team (row 1) token present.
    const scoped = SCOPED.includes(r.row), tag = scoped ? 'scope' : r.row === 1 ? 'team' : '';
    const token = scoped ? scopeOf(r) : tag ? r.team : '';
    auto.push({ ...base, global: scoped && token === 'global', model: r.class === 'A' ? 'sonnet' : frontmatterModel(join(dir, 'SKILL.md')),
      brief: { ID: `${base.setup}${token && ` ${tag}=${token}`}`, SKILL: join(dir, 'SKILL.md'), CLAUDE_SKILL_DIR: dir, CLAUDE_PLUGIN_ROOT: roots[plugin],
        ARGUMENTS: `upgrade${token && ` ${token}`} --unattended` } });
  }
  const quickCount = auto.filter(a => a.class === 'A').length;
  process.stdout.write(`${JSON.stringify({ auto, manual,
    counts: { auto: auto.length, quick: quickCount, long: auto.length - quickCount, manual: manual.length } }, null, 2)}\n`);
}

/** Run only when executed directly; importing (the lockstep test) must not read stdin. Doubt -> run. */
function invokedDirectly() {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return true; }
}

if (invokedDirectly()) main(process.argv.slice(2));
