#!/usr/bin/env node
/**
 * suite-creator-contract.mjs - pins the Claude Code 2.1.233 facts that the three
 * creator agents (hook-creator, skill-creator, agent-creator) teach, so a future
 * drift fails a test instead of shipping silently.
 *
 * Regression suite, not a style linter: every check maps to a High/destructive
 * finding from the v6.0.0 review. Evidence of record for the expected values is
 * the upstream snapshot `docs/hooks.md` / `docs/sub-agents.md` of 2026-08-15 -
 * the fixtures below ARE the transcription of it, deliberately hardcoded so the
 * suite runs standalone (no network, no MCP, no evidence dir).
 *
 * Assertion policy: unconditional exact-equality / exact-set checks with a
 * description. No branching decides which asserts run. Every failure names the
 * file, the expected value and the actual value.
 *
 * Usage: node brewcode/agents/tests/suite-creator-contract.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');   // agents/tests/
const AGENTS = join(HERE, '..');                           // brewcode/agents/

const FILES = ['hook-creator.md', 'skill-creator.md', 'agent-creator.md'];
const text = Object.fromEntries(
  FILES.map((f) => [f, readFileSync(join(AGENTS, f), 'utf8')]),
);

// ---------------------------------------------------------------- fixtures

/** The 31 hook events, verbatim from docs/hooks.md `### ` section headings. */
const EVENTS_31 = [
  'ConfigChange', 'CwdChanged', 'DirectoryAdded', 'Elicitation', 'ElicitationResult',
  'FileChanged', 'InstructionsLoaded', 'MessageDisplay', 'Notification', 'PermissionDenied',
  'PermissionRequest', 'PostCompact', 'PostToolBatch', 'PostToolUse', 'PostToolUseFailure',
  'PreCompact', 'PreToolUse', 'SessionEnd', 'SessionStart', 'Setup',
  'Stop', 'StopFailure', 'SubagentStart', 'SubagentStop', 'TaskCompleted',
  'TaskCreated', 'TeammateIdle', 'UserPromptExpansion', 'UserPromptSubmit', 'WorktreeCreate',
  'WorktreeRemove',
];

/** hook-creator.md writes events in its own DICT abbreviations. */
const ABBREV = {
  SS: 'SessionStart', PTU: 'PreToolUse', POT: 'PostToolUse',
  PR: 'PermissionRequest', PCD: 'PostCompact', MD: 'MessageDisplay',
};

const HANDLER_TYPES = ['agent', 'command', 'http', 'mcp_tool', 'prompt'];

const SESSIONSTART_SOURCES = ['clear', 'compact', 'fork', 'resume', 'startup'];

const STOPFAILURE_TYPES = [
  'authentication_failed', 'billing_error', 'invalid_request', 'max_output_tokens',
  'model_not_found', 'oauth_org_not_allowed', 'overloaded', 'rate_limit',
  'server_error', 'unknown',
];

const NOTIFICATION_TYPES = [
  'agent_completed', 'agent_needs_input', 'auth_success', 'elicitation_complete',
  'elicitation_dialog', 'elicitation_response', 'elicitation_url_dialog',
  'idle_prompt', 'permission_prompt',
];

const REF_VER = '2.1.233';

/** Claims that were true once and are now wrong; a hit, in any casing, is a regression. */
const BANNED = [
  ['non-blockable', 'PostToolUse does carry decision:"block" + updatedToolOutput (hooks:1923)'],
  ['no decision field', 'PostToolUse does carry a decision field'],
  ['user_prompt', 'the UserPromptSubmit stdin field is `prompt`'],
  ['denial_reason', 'the PermissionDenied stdin field is `reason`'],
];

// ---------------------------------------------------------------- helpers

let passed = 0;
let failed = 0;
const results = [];

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function check(name, actual, expected, message) {
  if (deepEqual(actual, expected)) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
  } else {
    failed++;
    results.push(
      `  FAIL  ${name}  (${message} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`,
    );
  }
}

/** Lines of `file` between the two anchors, end-exclusive. */
function section(file, startAnchor, endAnchor) {
  const lines = text[file].split('\n');
  const from = lines.findIndex((l) => l.startsWith(startAnchor));
  const to = lines.findIndex((l, i) => i > from && l.startsWith(endAnchor));
  return lines.slice(from < 0 ? 0 : from, to < 0 ? lines.length : to);
}

/** Backticked tokens of a markdown cell, sorted+deduped. */
function tokens(cell) {
  return [...new Set([...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]))].sort();
}

/** 1-based line numbers of `file` whose text matches `re`. */
function hits(file, re) {
  return text[file].split('\n')
    .map((l, i) => (re.test(l) ? i + 1 : -1))
    .filter((n) => n > 0);
}

/** Literal -> regex source. */
function esc(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 1-based line number of the character offset `index` in `file`. */
function lineAt(file, index) {
  return text[file].slice(0, index).split('\n').length;
}

/**
 * Text windows in which a file talks about PostToolUse: every `PostToolUse` mention
 * (never the distinct PostToolUseFailure event) plus the sec.1 routing row `| POT |`.
 * A claim about POT counts only if it lives inside one of these - a claim about Stop
 * or UserPromptExpansion elsewhere in the file must not stand in for it.
 */
function potWindows(file) {
  const t = text[file];
  return [...t.matchAll(/PostToolUse(?!Failure)|^\| POT \|/gm)]
    .map((m) => t.slice(m.index, m.index + 260));
}

/** Runs a hook template with `stdin` and returns its non-empty stdout lines. */
function runHookTemplate(source, stdin) {
  const dir = mkdtempSync(join(tmpdir(), 'creator-contract-'));
  try {
    const file = join(dir, 'hook.sh');
    writeFileSync(file, source);
    const stdout = execFileSync('bash', [file], { input: stdin, encoding: 'utf8' });
    return stdout.trim().split('\n').filter(Boolean);
  } catch (error) {
    return [`<hook failed: ${error.message.split('\n')[0]}>`];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- 1. roster

{
  const rows = section('hook-creator.md', '## 2. All 31 Hook Events', '### Common stdin')
    .filter((l) => /^\| \d+ \|/.test(l))
    .map((l) => l.split('|')[2].trim());
  const expanded = rows.map((e) => ABBREV[e] || e).sort();
  check('roster.count', rows.length, 31,
    'hook-creator.md sec.2 must list every hook event of docs/hooks.md exactly once');
  check('roster.set', expanded, EVENTS_31,
    'hook-creator.md sec.2 event names must equal the 31 headings of docs/hooks.md');
  check('roster.heading', hits('hook-creator.md', /^## 2\. All 31 Hook Events$/).length, 1,
    'hook-creator.md sec.2 heading must state the same count it lists');
}

// ------------------------------------------------------------ 2. handler types

{
  const types = section('hook-creator.md', '## 3. Hook Types', '> `prompt`/`agent` = gates')
    .filter((l) => /^\| `/.test(l))
    .map((l) => l.split('|')[1].trim().replace(/`/g, ''))
    .sort();
  check('types.set', types, HANDLER_TYPES,
    'hook-creator.md sec.3 must document exactly the 5 handler types');
  const header = hits('hook-creator.md',
    /^> Ref ver: .* \| 5 hook types \(command, http, mcp_tool, prompt, agent\)$/);
  check('types.header', header.length, 1,
    'hook-creator.md header line must name the same 5 handler types');
}

// ------------------------------------------------- 3. matcher rows (N1/N2/N3/N5)

{
  const sec11 = section('hook-creator.md', '## 11. Matcher Patterns', '## 12.');
  const row = (re) => sec11.find((l) => re.test(l)) || '';

  check('matcher.noMatcher.PostToolBatch',
    /PostToolBatch/.test(row(/\| No matcher \|/)), true,
    'hook-creator.md sec.11 no-matcher row must list PostToolBatch (N5)');
  check('matcher.noMatcher.PermissionDenied',
    /PermissionDenied/.test(row(/\| No matcher \|/)), false,
    'hook-creator.md sec.11 PermissionDenied takes a tool-name matcher, not the no-matcher row (H02)');
  check('matcher.toolName.PermissionDenied',
    /PermissionDenied/.test(row(/\| tool name \|/)), true,
    'hook-creator.md sec.11 must put PermissionDenied on the tool-name matcher row (H02)');

  check('matcher.SessionStart.sources',
    tokens(row(/^\| SS \| source string \|/)), SESSIONSTART_SOURCES,
    'hook-creator.md sec.11 SessionStart sources must include `fork` (N1)');
  check('matcher.StopFailure.types',
    tokens(row(/^\| StopFailure \|/)), STOPFAILURE_TYPES,
    'hook-creator.md sec.11 StopFailure must carry all 10 error types (N2)');
  check('matcher.Notification.types',
    tokens(row(/^\| Notification \|/)), NOTIFICATION_TYPES,
    'hook-creator.md sec.11 Notification must carry all 9 notification types (N3)');

  // N2 second location: the sec.2 event table row for StopFailure.
  const sec2Row = section('hook-creator.md', '## 2. All 31 Hook Events', '### Common stdin')
    .find((l) => /^\| 22 \| StopFailure \|/.test(l)) || '';
  check('matcher.StopFailure.types.sec2',
    tokens(sec2Row.split('|')[4] || ''), STOPFAILURE_TYPES,
    'hook-creator.md sec.2 StopFailure row must carry the same 10 error types as sec.11 (N2)');

  const ssRow = section('hook-creator.md', '## 2. All 31 Hook Events', '### Common stdin')
    .find((l) => /^\| 1 \| SS \|/.test(l)) || '';
  check('matcher.SessionStart.sources.sec2',
    tokens(ssRow.split('|')[4] || ''), SESSIONSTART_SOURCES,
    'hook-creator.md sec.2 SessionStart row must carry the same 5 sources as sec.11 (N1)');
}

// --------------------------------------------- 4. no live 200-subagent cap

{
  // Any 200 near subagent talk, however phrased - `200-spawn cap`, `(default 200)`,
  // `MAX_SUBAGENTS ... 200`. The sentence wraps, so the window is the number +/- 160
  // chars, not one line; inside it the removal must be stated or the number is a claim.
  const offenders = [];
  for (const f of FILES) {
    for (const m of text[f].matchAll(/\b200\b/g)) {
      const around = text[f].slice(Math.max(0, m.index - 160), m.index + 160);
      const aboutSubagents = /subagents?\b|\bSAs?\b|spawn|MAX_SUBAGENTS/i.test(around);
      const statesRemoval = /2\.1\.224/.test(around) && /remov(?:ed|al)/i.test(around);
      if (aboutSubagents && !statesRemoval) {
        offenders.push(`${f}:${lineAt(f, m.index)}`);
      }
    }
  }
  check('cap.no200', offenders, [],
    'no creator file may assert a live 200-subagent-per-session cap; it was removed in 2.1.224');
}

// -------------------------------------- 5. CLAUDE_PLUGIN_DATA is writable

{
  const offenders = [];
  for (const f of FILES) {
    for (const n of hits(f, /CLAUDE_PLUGIN_DATA/)) {
      const line = text[f].split('\n')[n - 1];
      if (/block|forbidden|protected[- ]path|never a Write target|read-only/i.test(line)) {
        offenders.push(`${f}:${n}`);
      }
    }
  }
  check('pluginData.writable', offenders, [],
    'no creator file may claim ${CLAUDE_PLUGIN_DATA} writes are blocked; it is the official writable plugin data dir (D1 Q1/H16)');

  const asked = hits('hook-creator.md', /Sensitive-path prompt \(2\.1\.233, verified in binary\)/);
  check('pluginData.sensitivePathBlock', asked.length, 1,
    'hook-creator.md must carry D1\'s sensitive-path ASK text exactly once (H16)');
}

// ---------------------------- 6. PostToolUse blockability, stated identically

{
  const offenders = [];
  for (const f of FILES) {
    for (const [needle, why] of BANNED) {
      for (const n of hits(f, new RegExp(esc(needle), 'i'))) {
        offenders.push(`${f}:${n} "${needle}" (${why})`);
      }
    }
  }
  check('pot.noBannedClaims', offenders, [],
    'a banned stale claim reappeared in a creator file (N6/H03/H02/H13)');

  // Naming the field is not stating the fact: the meaning is asserted, not the token.
  const stating = FILES.filter(
    (f) => /`updatedToolOutput` (?:replaces|rewrites) what Claude sees/.test(text[f]),
  ).sort();
  check('pot.updatedToolOutput.files', stating, ['hook-creator.md', 'skill-creator.md'],
    'the two creator files that teach hook output schemas must both state that `updatedToolOutput` replaces what Claude sees (N6)');

  const blockable = FILES
    .filter((f) => potWindows(f).some((w) => /`decision: ?"block"`[^\n]*reason/.test(w)))
    .sort();
  check('pot.blockable.files', blockable, ['hook-creator.md', 'skill-creator.md'],
    'both files that state PostToolUse blockability must state it the same way, in the POT row/paragraph itself: decision:"block" + reason (N6)');
}

// ------------------------------------------------------ 7. reference version

{
  const refs = [];
  for (const f of FILES) {
    for (const m of text[f].matchAll(/Ref ver:\s*([0-9]+\.[0-9]+\.[0-9]+)/g)) {
      refs.push(`${f}=${m[1]}`);
    }
  }
  check('refver.values', refs.map((r) => r.split('=')[1]), [REF_VER, REF_VER],
    `every creator "Ref ver:" must read ${REF_VER} (N4)`);
  check('refver.files', refs.map((r) => r.split('=')[0]),
    ['hook-creator.md', 'skill-creator.md'],
    'hook-creator.md and skill-creator.md are the two creators carrying a "Ref ver:" header');
}

// ------------------------------- 8. AskUserQuestion is not promised to a SA

{
  const SA_REMOVAL = /AskUserQuestion[^\n]*(removed|stripped|unavailable)|(?:removed|stripped) from (?:every|EVERY) SA/;
  const declaring = FILES.filter((f) => {
    const fm = text[f].split('\n').slice(0, 15).find((l) => l.startsWith('tools:')) || '';
    return /AskUserQuestion/.test(fm);
  });
  // Ruling D1-Q3: the tool is stripped from every SA, so a declaration is inert - and
  // documenting the removal does not license keeping the dead entry (agent-creator.md
  // dropped it, skill-creator.md followed in v6.0.0).
  check('auq.declared', declaring, [],
    'no creator may declare the inert AskUserQuestion in `tools:`; it is stripped from every SA (Q3)');

  const carrying = FILES.filter((f) => SA_REMOVAL.test(text[f])).sort();
  check('auq.removalFact.files', carrying, ['agent-creator.md', 'skill-creator.md'],
    'both creators that describe a subagent tool pool must state the AskUserQuestion removal (Q3)');

  check('auq.hookCreatorTools',
    /AskUserQuestion/.test(text['hook-creator.md'].split('\n').slice(0, 15)
      .find((l) => l.startsWith('tools:')) || ''), false,
    'hook-creator.md must not declare the inert AskUserQuestion tool (Q3)');
}

// ------------------------------------- 9. BC-A01: templates are fail-closed

{
  const tpl = section('hook-creator.md', '## 7. Templates', '## 8. Known Bugs').join('\n');

  // Behavioural, not textual: the shipped bash template is run on the stop-hook path,
  // the one that tempted an early `echo '{}'`. Two objects on stdout = discarded verdict.
  const bashTpl = (tpl.match(/```bash\n([\s\S]*?)```/) || ['', ''])[1];
  check('template.bash.singleStdoutWrite',
    runHookTemplate(bashTpl, '{"stop_hook_active":true}'), ['{}'],
    'hook-creator.md sec.7 bash template must print exactly one JSON object on every path (BC-A01)');
  check('template.decideFn',
    (tpl.match(/output\(decide\(await readStdin\(\)\)\)/g) || []).length, 1,
    'hook-creator.md sec.7 JS template must emit one object from one decide() call (BC-A01)');
  check('template.noCommentedDecisions',
    /^\s*(#|\/\/) (?:Deny tool|Block stop|Inject context)/m.test(tpl), false,
    'hook-creator.md sec.7 templates must not park the real decision outputs in comments (BC-A01)');
}

// ---------------------------------------------------------------- report

console.log('\nsuite-creator-contract (brewcode creator agents)');
console.log(`  base: ${AGENTS}`);
for (const line of results) console.log(line);
console.log(`\n  passed=${passed} failed=${failed} total=${passed + failed}\n`);
process.exit(failed === 0 ? 0 : 1);
