#!/usr/bin/env node
// Pins the Claude Code 2.1.309 facts the three creator agents teach. A fact that lives in a reference
// is TWO asserts: the reference states it, the body cites that reference. Run: node <this file>.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');   // agents/tests/
const AGENTS = join(HERE, '..');                           // brewcode/agents/
const PLUGIN_ROOT = join(AGENTS, '..');                     // brewcode/

const FILES = ['hook-creator.md', 'skill-creator.md', 'agent-creator.md'];
const text = Object.fromEntries(
  FILES.map((f) => [f, readFileSync(join(AGENTS, f), 'utf8')]),
);

// Every `${CLAUDE_PLUGIN_ROOT}/.../*.md` token the three bodies cite, loaded once, keyed by
// basename. A missing file is not skipped: refs.exist below reports it.
const CITED = [...new Set(FILES.flatMap((f) =>
  [...text[f].matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/[^\s`|]+\.md/g)].map((m) => m[0]),
))];
const REF_PATH = {};
for (const token of CITED) {
  REF_PATH[token.split('/').pop()] = token.replace('${CLAUDE_PLUGIN_ROOT}', PLUGIN_ROOT);
}
const REFS = Object.keys(REF_PATH);
for (const base of REFS) {
  text[base] = existsSync(REF_PATH[base]) ? readFileSync(REF_PATH[base], 'utf8') : '';
}
const ALL_KEYS = [...FILES, ...REFS];

// ---------------------------------------------------------------- fixtures

/** The 33 hook events, verbatim from `hooks-events.md` "## All 33 Hook Events". */
const EVENTS_33 = [
  'ConfigChange', 'CwdChanged', 'DirectoryAdded', 'Elicitation', 'ElicitationResult',
  'FileChanged', 'InstructionsLoaded', 'MessageDisplay', 'Notification', 'PermissionDenied',
  'PermissionRequest', 'PostCompact', 'PostModelSwitch', 'PostToolBatch', 'PostToolUse',
  'PostToolUseFailure', 'PreCompact', 'PreModelSwitch', 'PreToolUse', 'SessionEnd',
  'SessionStart', 'Setup', 'Stop', 'StopFailure', 'SubagentStart', 'SubagentStop',
  'TaskCompleted', 'TaskCreated', 'TeammateIdle', 'UserPromptExpansion', 'UserPromptSubmit',
  'WorktreeCreate', 'WorktreeRemove',
];

/** hooks-events.md writes some events in the house DICT abbreviations. */
const ABBREV = {
  SS: 'SessionStart', PTU: 'PreToolUse', POT: 'PostToolUse',
  PR: 'PermissionRequest', PCD: 'PostCompact', MD: 'MessageDisplay',
};

const HANDLER_TYPES = ['agent', 'command', 'http', 'mcp_tool', 'prompt'];

const SESSIONSTART_SOURCES = ['clear', 'compact', 'fork', 'resume', 'startup'];

/** 12 values -- 2.1.267 added `account_on_hold` + `cloud_credential_error` (was 10). */
const STOPFAILURE_TYPES = [
  'account_on_hold', 'authentication_failed', 'billing_error', 'cloud_credential_error',
  'invalid_request', 'max_output_tokens', 'model_not_found', 'oauth_org_not_allowed',
  'overloaded', 'rate_limit', 'server_error', 'unknown',
];

/** 13 values -- 2.1.234 added the 3 `quota_auto_resume_*` values (was 9); docs list `plugin_notification` too. */
const NOTIFICATION_TYPES = [
  'agent_completed', 'agent_needs_input', 'auth_success', 'elicitation_complete',
  'elicitation_dialog', 'elicitation_response', 'elicitation_url_dialog', 'idle_prompt',
  'permission_prompt', 'plugin_notification', 'quota_auto_resume_disabled',
  'quota_auto_resume_fired', 'quota_auto_resume_stale',
];

const REF_VER = '2.1.309';

/** Claims that were true once and are now wrong; a hit, in any casing, is a regression. */
const BANNED = [
  ['non-blockable', 'PostToolUse does carry decision:"block" + updatedToolOutput (docs: PostToolUse decision control)'],
  ['no decision field', 'PostToolUse does carry a decision field'],
  ['user_prompt', 'the UserPromptSubmit stdin field is `prompt`'],
  ['denial_reason', 'the PermissionDenied stdin field is `reason`'],
];

/** Reference each agent body must cite because the fact-checks below read it there. */
const REQUIRED_CITES = {
  'hook-creator.md': [
    'hooks-events.md', 'hooks-types-config.md', 'hooks-env.md',
    'hooks-templates.md', 'hooks-io-contract.md',
  ],
  'skill-creator.md': ['frontmatter-fields.md'],
  'agent-creator.md': ['agent-frontmatter-fields.md', 'agent-scope-and-tools.md', 'agent-template.md'],
};

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

/** Lines of `file` between the two anchors, end-exclusive. `endAnchor` may be absent (runs to EOF). */
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

/** 260-char windows where `file` talks about PostToolUse (never PostToolUseFailure) or starts a `| POT |` row. */
function potWindows(file) {
  const t = text[file];
  return [...t.matchAll(/PostToolUse(?!Failure)|^\| POT \|/gm)]
    .map((m) => t.slice(m.index, m.index + 260));
}

/** Whether `file`'s body cites `refBase` (its Read-on-demand table names the file). */
function cites(file, refBase) {
  return new RegExp(esc(refBase)).test(text[file]);
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

// -------------------------------------------------- 0. restructure integrity

{
  const missing = REFS.filter((base) => !existsSync(REF_PATH[base]));
  check('refs.exist', missing, [],
    'every path cited in a "Read on demand" table must exist on disk');

  const tooLong = REFS
    .filter((base) => text[base] && text[base].split('\n').length > 200)
    .map((base) => `${base}:${text[base].split('\n').length}`);
  check('refs.maxLines200', tooLong, [],
    'every cited reference file must stay <=200 lines (on-demand loading budget)');

  function bodyWords(file) {
    const parts = text[file].split(/^---$/m);
    return parts.slice(2).join('---').trim().split(/\s+/).filter(Boolean).length;
  }
  const overWords = FILES
    .filter((f) => bodyWords(f) > 1500)
    .map((f) => `${f}:${bodyWords(f)}`);
  check('body.maxWords1500', overWords, [],
    'each agent body (measured after frontmatter) must stay <=1500 words');

  function frontmatter(file) {
    return text[file].split(/^---$/m)[1] || '';
  }
  const noName = FILES.filter((f) => !/^name:\s*\S+/m.test(frontmatter(f)));
  check('fm.name', noName, [], 'every creator agent frontmatter must carry `name`');

  const noModelInherit = FILES.filter((f) => !/^model:\s*inherit\s*$/m.test(frontmatter(f)));
  check('fm.modelInherit', noModelInherit, [],
    'every creator agent frontmatter must carry `model: inherit`');

  const noBash = FILES.filter((f) => {
    const toolsLine = frontmatter(f).split('\n').find((l) => l.startsWith('tools:')) || '';
    return !/\bBash\b/.test(toolsLine);
  });
  check('fm.toolsBash', noBash, [], 'every creator agent frontmatter `tools:` must include `Bash`');

  for (const [file, refs] of Object.entries(REQUIRED_CITES)) {
    const missingCite = refs.filter((r) => !cites(file, r));
    check(`cite.${file}`, missingCite, [],
      `${file} must cite every reference that now teaches a fact this suite checks there`);
  }
}

// ------------------------------------------ optimizer handoff prerequisites

{
  // GIVEN: the actual optimizer requires a caller-owned Phase 0 snapshot before editing.
  const optimizer = readFileSync(join(PLUGIN_ROOT, '../brewtools/agents/text-optimizer.md'), 'utf8');
  const workflow = readFileSync(join(PLUGIN_ROOT, '../brewtools/skills/text-optimize/SKILL.md'), 'utf8');
  check('optimizer.requiresCallerSnapshot', /no RUN_DIR in brief.*Phase 0 snapshot missing/.test(optimizer), true,
    'creator handoff must satisfy the actual optimizer missing-snapshot refusal');
  check('optimizer.snapshotWorkflow', /Phase 0: Preconditions \+ Snapshot/.test(workflow), true,
    'the installed skill remains the authority for pre-edit snapshot orchestration');

  for (const file of ['agent-creator.md', 'skill-creator.md']) {
    // WHEN: the main caller consumes the creator final handoff.
    const handoff = section(file, '### Optimization handoff', '## Read on demand').join('\n');
    const required = ['`Skill(skill: "brewtools:text-optimize", args: "<created paths> medium --allow-dirty")`',
      'not a hand-run copy of its Medium workflow', 'snapshots targets',
      'exit 0 + `RUN_DIR`', 'inventories', 'default\nEMPTY',
      'GOAL/ROLE/SCOPE/CONTEXT/CONSUMER/DONE', 'known-owned `checkpoint --run-dir`',
      '`verify --no-restore`', 'fresh independent read-only verifier',
      'without writer reports', '100% meaning',
      'preserving concurrent bytes', 'never spawns optimizers/verifiers',
      'Brewtools absent -> report skipped', 'requested/pending'];

    // THEN: no bare call bypasses the consumer prerequisites or falsely claims acceptance.
    check(`optimizer.handoff.${file}`, required.filter(token => !handoff.includes(token)), [],
      `${file} must hand optimization to the model-invocable skill, then main-owned independent acceptance`);
    check(`optimizer.noDmiWorkaround.${file}`, /DMI skill|not a `Skill` model invocation/.test(handoff), false,
      `GIVEN text-optimize is model-invocable WHEN ${file} hands off optimization THEN no DMI workaround remains`);
    check(`optimizer.noBareCall.${file}`, /Agent\(subagent_type="brewtools:text-optimizer"/.test(text[file]), false,
      `${file} must not request a target-only optimizer call that stops for missing RUN_DIR`);
    check(`optimizer.validation.${file}`, handoff.includes({
      'agent-creator.md': 'repeats gates + Validation Checklist',
      'skill-creator.md': 'repeats gates + `validate-skill.sh`',
    }[file]), true, `${file} must repeat its artifact validation after optimization repairs`);
  }
  check('optimizer.validColor', optimizer.match(/^color:\s*(\S+)$/m)?.[1], 'purple',
    'optimizer must use a supported color from the authoritative agent-template palette');
  check('optimizer.colorPaletteSource', /\| blue, purple, orange, pink \|/.test(text['agent-template.md']), true,
    'the maintained palette must explicitly support the chosen optimizer color');
}

// ---------------------------------------------------------------- 1. roster

{
  const rows = section('hooks-events.md', '## All 33 Hook Events', '### Common input')
    .filter((l) => /^\| \d+ \|/.test(l))
    .map((l) => l.split('|')[2].trim());
  const expanded = rows.map((e) => ABBREV[e] || e).sort();
  check('roster.count', rows.length, 33,
    'hooks-events.md must list every hook event exactly once');
  check('roster.set', expanded, EVENTS_33,
    'hooks-events.md event names must equal the 33 current events');
  check('roster.heading', hits('hooks-events.md', /^## All 33 Hook Events$/).length, 1,
    'hooks-events.md heading must state the same count it lists');
}

// ------------------------------------------------------------ 2. handler types

{
  const types = section('hooks-types-config.md', '## Hook Types', '> `prompt`/`agent` = gates')
    .filter((l) => /^\| `/.test(l))
    .map((l) => l.split('|')[1].trim().replace(/`/g, ''))
    .sort();
  check('types.set', types, HANDLER_TYPES,
    'hooks-types-config.md must document exactly the 5 handler types');
  const header = hits('hook-creator.md',
    /^> Ref ver: .* \| 5 hook types \(command, http, mcp_tool, prompt, agent\)/);
  check('types.header', header.length, 1,
    'hook-creator.md header line must name the same 5 handler types');
}

// ------------------------------------------------- 3. matcher rows (N1/N2/N3/N5)

{
  const matcherSec = section('hooks-events.md', '## Matcher Patterns', '\u0000-never-matches');
  const row = (re) => matcherSec.find((l) => re.test(l)) || '';

  check('matcher.noMatcher.PostToolBatch',
    /PostToolBatch/.test(row(/\| No matcher \|/)), true,
    'hooks-events.md no-matcher row must list PostToolBatch (N5)');
  check('matcher.noMatcher.PermissionDenied',
    /PermissionDenied/.test(row(/\| No matcher \|/)), false,
    'hooks-events.md PermissionDenied takes a tool-name matcher, not the no-matcher row (H02)');
  check('matcher.toolName.PermissionDenied',
    /PermissionDenied/.test(row(/\| tool name \|/)), true,
    'hooks-events.md must put PermissionDenied on the tool-name matcher row (H02)');

  check('matcher.SessionStart.sources',
    tokens(row(/^\| SS \| source string \|/)), SESSIONSTART_SOURCES,
    'hooks-events.md SessionStart sources must include `fork` (N1)');
  check('matcher.StopFailure.types',
    tokens(row(/^\| StopFailure \|/)), STOPFAILURE_TYPES,
    'hooks-events.md StopFailure must carry all 12 error types (N2, 2.1.267)');
  check('matcher.Notification.types',
    tokens(row(/^\| Notification \|/)), NOTIFICATION_TYPES,
    'hooks-events.md Notification must carry all 13 notification types (N3, 2.1.234)');

  // N2/N1 second location: the events-table row for StopFailure/SessionStart, same file.
  const eventsSec = section('hooks-events.md', '## All 33 Hook Events', '### Common input');
  const sec2Row = eventsSec.find((l) => /^\| 22 \| StopFailure \|/.test(l)) || '';
  check('matcher.StopFailure.types.sec2',
    tokens(sec2Row.split('|')[4] || ''), STOPFAILURE_TYPES,
    'hooks-events.md events-table StopFailure row must carry the same 12 error types as Matcher Patterns (N2)');

  const ssRow = eventsSec.find((l) => /^\| 1 \| SS \|/.test(l)) || '';
  check('matcher.SessionStart.sources.sec2',
    tokens(ssRow.split('|')[4] || ''), SESSIONSTART_SOURCES,
    'hooks-events.md events-table SessionStart row must carry the same 5 sources as Matcher Patterns (N1)');
}

// --------------------------------------------- 4. no live 200-subagent cap

{
  // Any 200 near subagent talk, however phrased, across every agent body + cited reference.
  const offenders = [];
  for (const f of ALL_KEYS) {
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
    'no creator file or reference may assert a live 200-subagent-per-session cap; it was removed in 2.1.224');
}

// -------------------------------------- 5. CLAUDE_PLUGIN_DATA is writable

{
  const offenders = [];
  for (const f of ALL_KEYS) {
    for (const n of hits(f, /CLAUDE_PLUGIN_DATA/)) {
      const line = text[f].split('\n')[n - 1];
      if (/block|forbidden|protected[- ]path|never a Write target|read-only/i.test(line)) {
        offenders.push(`${f}:${n}`);
      }
    }
  }
  check('pluginData.writable', offenders, [],
    'no creator file or reference may claim ${CLAUDE_PLUGIN_DATA} writes are blocked; it is the official writable plugin data dir (D1 Q1/H16)');

  // 2.1.233 binary note replaced by the 2.1.296 docs protected-paths table (w52-bc BC-7).
  const asked = hits('hooks-env.md', /Protected paths \(2\.1\.296, \[permission-modes\]/);
  check('pluginData.sensitivePathBlock', asked.length, 1,
    'hooks-env.md must carry the 2.1.296 protected-paths table exactly once (H16)');
}

// ---------------------------- 6. PostToolUse blockability, stated identically

{
  const offenders = [];
  for (const f of ALL_KEYS) {
    for (const [needle, why] of BANNED) {
      for (const n of hits(f, new RegExp(esc(needle), 'i'))) {
        offenders.push(`${f}:${n} "${needle}" (${why})`);
      }
    }
  }
  check('pot.noBannedClaims', offenders, [],
    'a banned stale claim reappeared in a creator file or reference (N6/H03/H02/H13)');

  // Naming the field is not stating the fact: the meaning is asserted, not the token.
  // \s+ tolerates hard-wrapped prose (frontmatter-fields.md wraps mid-sentence).
  const UTO_RE = /`updatedToolOutput`\s+(?:replaces|rewrites)\s+what Claude sees/;
  check('pot.updatedToolOutput.hooksIoContract', UTO_RE.test(text['hooks-io-contract.md']), true,
    'hooks-io-contract.md (cited by hook-creator.md) must state `updatedToolOutput` replaces what Claude sees (N6)');
  check('pot.updatedToolOutput.skillsFrontmatterFields', UTO_RE.test(text['frontmatter-fields.md']), true,
    'frontmatter-fields.md (cited by skill-creator.md) must state `updatedToolOutput` replaces what Claude sees (N6)');

  const BLOCKABLE_RE = /`decision: ?"block"`[^\n]*reason/;
  check('pot.blockable.hooksIoContract',
    potWindows('hooks-io-contract.md').some((w) => BLOCKABLE_RE.test(w)), true,
    'hooks-io-contract.md must state PostToolUse blockability in the POT row itself: decision:"block" + reason (N6)');
  check('pot.blockable.skillsFrontmatterFields', BLOCKABLE_RE.test(text['frontmatter-fields.md']), true,
    'frontmatter-fields.md must state PostToolUse blockability the same way: decision:"block" + reason (N6)');
}

// ------------------------------------------------------ 7. reference version

{
  // Only hook-creator.md carries a "Ref ver:" header; the other two name the baseline in
  // their intro sentence. Both forms are guarded so neither can drift.
  const refVerFiles = FILES.filter((f) => /Ref ver:/.test(text[f])).sort();
  check('refver.files', refVerFiles, ['hook-creator.md'],
    'only hook-creator.md carries the "Ref ver:" header post-restructure');

  const refVerValues = refVerFiles.map((f) => (text[f].match(/Ref ver:\s*([0-9]+\.[0-9]+\.[0-9]+)/) || [])[1]);
  check('refver.values', refVerValues, [REF_VER], `hook-creator.md's "Ref ver:" must read ${REF_VER} (N4)`);

  const mention = FILES.filter((f) => text[f].includes(REF_VER)).sort();
  check('refver.allMention', mention, FILES.slice().sort(),
    `every creator body must mention its ${REF_VER} baseline somewhere in prose`);
}

// ------------------------------- 8. AskUserQuestion is not promised to a SA

{
  const SA_REMOVAL = /AskUserQuestion[^\n]*(removed|stripped|unavailable)|(?:removed|stripped) from ordinary SAs/;
  const declaring = FILES.filter((f) => {
    const fm = text[f].split('\n').slice(0, 15).find((l) => l.startsWith('tools:')) || '';
    return /AskUserQuestion/.test(fm);
  });
  // Ordinary subagents lose this tool; conversation forks retain the parent pool.
  // These creators use ordinary delegation, so retaining a dead declaration is invalid.
  check('auq.declared', declaring, [],
    'no creator may declare AskUserQuestion in `tools:`; ordinary delegated creators cannot use it');

  const carrying = FILES.filter((f) => SA_REMOVAL.test(text[f])).sort();
  check('auq.removalFact.files', carrying, ['agent-creator.md', 'skill-creator.md'],
    'both creators must state the ordinary-subagent AskUserQuestion removal');

  const forkExceptions = ['agent-creator.md', 'skill-creator.md']
    .filter((f) => /conversation\s+forks retain the\s+parent(?:'s)? tools/.test(text[f])).sort();
  check('auq.forkException.files', forkExceptions, ['agent-creator.md', 'skill-creator.md'],
    'both creators must preserve the conversation-fork exception to tool removal');

  check('auq.hookCreatorTools',
    /AskUserQuestion/.test(text['hook-creator.md'].split('\n').slice(0, 15)
      .find((l) => l.startsWith('tools:')) || ''), false,
    'hook-creator.md must not declare the inert AskUserQuestion tool (Q3)');
}

// ------------------------------------- 9. BC-A01: templates are fail-closed

{
  const tpl = section('hooks-templates.md', '## Templates', '## Best Practices').join('\n');

  // GIVEN: the shipped PreToolUse Bash hard-gate template and valid harmless input.
  const bashTpl = (tpl.match(/```bash\n([\s\S]*?)```/) || ['', ''])[1];
  // WHEN/THEN: the pass-through path emits exactly one structured object.
  check('template.bash.singleStdoutWrite',
    runHookTemplate(bashTpl, '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"pwd"}}'), ['{}'],
    'hooks-templates.md bash template must print exactly one JSON object on the pass-through path (BC-A01)');
  // GIVEN/WHEN: malformed input reaches the same policy template.
  const malformed = spawnSync('bash', ['-c', bashTpl], { input: '{malformed', encoding: 'utf8' });
  // THEN: the hard gate refuses the call without a misleading approval object.
  check('template.bash.malformedBlocks',
    [malformed.status, malformed.stdout, /Invalid PreToolUse Bash input/.test(malformed.stderr)],
    [2, '', true], 'malformed policy input must exit 2 with stderr feedback and no approval JSON');
  check('template.decideFn',
    (tpl.match(/output\(decide\(await readStdin\(\)\)\)/g) || []).length, 1,
    'hooks-templates.md JS template must emit one object from one decide() call (BC-A01)');
  check('template.noCommentedDecisions',
    /^\s*(#|\/\/) (?:Deny tool|Block stop|Inject context)/m.test(tpl), false,
    'hooks-templates.md templates must not park the real decision outputs in comments (BC-A01)');
}

// ------------------------- 10. agent-creator 2.1.234-2.1.269 delta fixtures
// Facts live in agent-{frontmatter-fields,scope-and-tools,template}.md; cite.agent-creator.md asserts the citation.

{
  check('experimentalCacheTtl.fieldTable',
    /\|\s*`experimental\.cacheTtl`\s*\|/.test(text['agent-frontmatter-fields.md']), true,
    'agent-frontmatter-fields.md OPT Fields table must carry the experimental.cacheTtl field (2.1.248)');

  const precedence = section('agent-scope-and-tools.md', '## Model Precedence', '## Spawn From Main Conversation Only').join('\n');
  check('modelPrecedence.forceVar',
    /CLAUDE_CODE_SUBAGENT_MODEL_FORCE/.test(precedence), true,
    'agent-scope-and-tools.md Model Precedence table must mention CLAUDE_CODE_SUBAGENT_MODEL_FORCE (2.1.257)');

  const colorSec = section('agent-template.md', '## Color Semantics', '## Common AG Types')
    .filter((l) => /^\| /.test(l) && !/^\| Color \|/.test(l) && !/^\|-{2,}/.test(l));
  const colors = colorSec.flatMap((l) => l.split('|')[1].split(',').map((c) => c.trim().replace(/`/g, '')));
  check('color.noMagenta', colors.includes('magenta'), false,
    'agent-template.md Color Semantics table must not list magenta as a valid color value');
  check('color.count8', new Set(colors).size, 8,
    'agent-template.md Color Semantics table must enumerate exactly 8 valid color values');

  const tpl = section('agent-template.md', '### 6. Guardrails', '## LLM Text Rules').join('\n');
  check('template.returnContractHeading', /^## Return Contract$/m.test(tpl), true,
    'agent-template.md generated-agent template (Guardrails) must carry a literal "## Return Contract" heading');
}

// ------------------------------------------------------ 11. current authoring boundaries

{
  // GIVEN distributed skills and ordinary creator delegation WHEN their authoring instructions
  // are inspected THEN policy remains explicit and current capabilities are not suppressed.
  check('skill.permissions.turnScoped',
    /AT` grants and `DT` restrictions last only the invoking turn and clear on the next user message/.test(text['skill-creator.md']), true,
    'skill creator must distinguish persistent instructions from turn-scoped tool permissions');
  check('skill.invocation.distributedPolicy',
    /Distributed Brewcode skills require `UI-F: true` \+ `DMI: true`/.test(text['skill-creator.md']), true,
    'skill creator must retain the distributed explicit-invocation policy');
  check('skill.invocation.modelInvocableExceptions',
    /\(exceptions `brewdoc:publish`, `brewtools:text-optimize`, `brewtools:text-human`: `DMI: false`,\nscoped `AT`, user ruling\)/.test(text['skill-creator.md']), true,
    'GIVEN the user ruling WHEN skill creator states the policy THEN publish, text-optimize and text-human are its only model-invocable exceptions');
  check('agent.skillsPreload.exceptions',
    /only\n  `brewdoc:publish`, `brewtools:text-optimize` and `brewtools:text-human`: for any other/.test(text['agent-creator.md']), true,
    'GIVEN the user ruling WHEN agent creator lists preloadable shipped skills THEN exactly the three model-invocable ones');
  check('skill.context.notConversationFork',
    /`context: fork` creates an isolated SA, not a conversation fork/.test(text['skill-creator.md']), true,
    'skill context forks must not promise conversation history');
  check('agent.omitClaudeMd.managedException',
    /`omitClaudeMd: true`[\s\S]*?keeps managed policy/.test(text['agent-creator.md']), true,
    'agent creator must teach omitClaudeMd without promising managed-policy removal');
  check('agent.plugin.ignoredFields',
    /Plugin AGs ignore `hooks`, `mcpServers`, `permissionMode`, and `initialPrompt`/.test(text['agent-creator.md']), true,
    'plugin agents must not promise ignored per-agent configuration');
  check('creators.noLegacyTaskCalls',
    FILES.filter((f) => /\bTask\(/.test(text[f])), [],
    'creator bodies must generate current Agent tool calls');
  check('hook.stdout.worktreeException',
    /`WorktreeCreate` emits only the absolute worktree path/.test(text['hook-creator.md']), true,
    'hook creator must preserve the command WorktreeCreate path-only stdout contract');
  check('hook.failure.hardGate',
    /hard gates must deny\/block malformed input,[\s\S]*?exceptions, and invalid output/.test(text['hook-creator.md']), true,
    'hard gate error paths must not silently approve malformed input or exceptions');
  check('hook.async.advisoryOnly',
    /Async hooks cannot block or rewrite inputs/.test(text['hook-creator.md']), true,
    'hook creator must keep decisions out of async hook designs');
}

// ------------------------- 12. 2.1.296 facts: reference states, body points

{
  // GIVEN creator bodies that return every delegation to their caller
  // WHEN their `tools:` grant is read THEN none can spawn and each body says so.
  const toolsLine = (f) => (text[f].split(/^---$/m)[1] || '').split('\n')
    .find((l) => l.startsWith('tools:')) || '';
  check('fm.noAgentTool', FILES.filter((f) => /\bAgent\b/.test(toolsLine(f))), [],
    'no creator may declare `Agent` in `tools:` while its body returns delegation to the caller');
  check('body.noAgentTool.stated',
    FILES.filter((f) => /This definition carries no\s+`Agent` tool/.test(text[f])).sort(),
    ['agent-creator.md', 'skill-creator.md'],
    'both creators that once declared `Agent` must state where over-sized work goes instead');

  // A braced plugin-root token named in prose is rewritten to the install path at load.
  check('pluginRoot.onlyInPaths',
    FILES.flatMap((f) => hits(f, /\$\{CLAUDE_PLUGIN_ROOT\}(?!\/)/).map((n) => `${f}:${n}`)), [],
    'a creator body may write ${CLAUDE_PLUGIN_ROOT} only as a path prefix, never to name the token');

  check('debug.noClaudeDebugEnv',
    ALL_KEYS.flatMap((f) => hits(f, /\bCLAUDE_DEBUG\b/).map((n) => `${f}:${n}`)), [],
    '`CLAUDE_DEBUG` is not a debug switch; creator files and references teach `claude --debug`');
  check('debug.hookCreatorSwitch', /`claude --debug` logs a `Hooks:` line/.test(text['hook-creator.md']), true,
    'hook-creator.md Test step must name the documented switch and the 2.1.296 `Hooks:` proof line');

  // Every section a body names as its pointer must exist under that heading in the reference.
  const NAMED = [
    ['agent-template.md', /^## Validation Checklist$/m],
    ['agent-template.md', /^### 6\. Guardrails/m],
    ['agent-template.md', /^### teams-setup compact exception$/m],
    ['agent-scope-and-tools.md', /^### Discovery: walk-up scan/m],
    ['agent-context-and-execution.md', /^## SA Resource Limits$/m],
    ['hooks-events.md', /^### Subagent report and synthetic prompts$/m],
    ['hooks-types-config.md', /^## Hook Types$/m],
    ['hooks-types-config.md', /^### Conditional `if` field/m],
    ['hooks-templates.md', /^## Test$/m],
    ['hooks-templates.md', /^## Validation Checklist$/m],
    ['execution-model.md', /^## String substitutions$/m],
    ['activation-and-troubleshooting.md', /^## Validation tools$/m],
    ['activation-and-troubleshooting.md', /^## Validation checklist/m],
    ['design-patterns.md', /^## Location priority$/m],
  ];
  check('sections.named',
    NAMED.filter(([f, re]) => !re.test(text[f])).map(([f, re]) => `${f} ${re.source}`), [],
    'a heading a creator body points at was renamed or removed in its reference');

  // Each fact below: [reference that must state it, its wording there, body, its pointer there].
  const FACTS = [
    ['agent.pluginValidate', 'agent-frontmatter-fields.md',
      /fails to parse still loads[^\n]*with ALL tools[^\n]*`claude plugin validate <plugin-dir>`/,
      'agent-creator.md', /`claude plugin validate <plugin-dir>` exits 0/],
    ['agent.skillsPreload', 'agent-context-and-execution.md',
      /`disable-model-invocation: true` SK is never preloaded/,
      'agent-creator.md', /`skills:` preloads model-invocable skills only/],
    ['agent.globGrep', 'agent-scope-and-tools.md', /`Glob, Grep, Bash` == `Bash`/,
      'agent-creator.md', /`Glob, Grep` without `Bash`/],
    ['agent.teammateBackground', 'agent-frontmatter-fields.md',
      /in-process teammate that spawns a SA whose definition carries `background: true` gets an error/,
      'agent-creator.md', /`background: true` on a definition an in-process teammate may spawn/],
    ['skill.argumentsHeredoc', 'execution-model.md', /<<'__SKILL_ARGS__'/,
      'skill-creator.md', /`\$ARGUMENTS` spliced into shell/],
    ['skill.positionalSpelling', 'execution-model.md', /awk `\$\(1\)`, shell `\$\{1\}`/,
      'skill-creator.md', /a bare `\$1` in a fence/],
    ['skill.braceSpelling', 'execution-model.md', /Name it without the dollar-brace/,
      'skill-creator.md', /a path token without exact\s+braces/],
    ['skill.promptAudit', 'activation-and-troubleshooting.md', /`\/doctor prompt-audit \[path\]`/,
      'skill-creator.md', /`\/doctor prompt-audit \[path\]`/],
    ['hook.handback', 'hooks-events.md', /`SubagentHandback` tool call, text in `tool_input\.message`/,
      'hook-creator.md', /`SubagentHandback`/],
    ['hook.syntheticPrompts', 'hooks-events.md', /`<task-notification>` or `<agent-message from=`/,
      'hook-creator.md', /matching user text on UserPromptSubmit \(subagent deliveries fire it/],
    ['hook.onFailure', 'hooks-types-config.md', /`onFailure` \(`command` \+ `http` only, v2\.1\.295\+\)/,
      'hook-creator.md', /hard gate set `onFailure: "block"` \(2\.1\.295\+/],
    ['hook.ifOneTool', 'hooks-types-config.md', /\| one rule = one tool \|/,
      'hook-creator.md', /`if` = one rule, one tool, tool events only/],
  ];
  for (const [name, ref, refRe, body, bodyRe] of FACTS) {
    check(`${name}.reference`, refRe.test(text[ref]), true, `${ref} must state the fact ${body} points at`);
    check(`${name}.body`, bodyRe.test(text[body]), true, `${body} must carry its one-line pointer to ${ref}`);
  }
}

// ------------------------------- 13. shipped next steps name no repo-private /docs skill
{
  for (const ref of ['mode-sync.md', 'summary-template.md']) {
    const body = readFileSync(join(PLUGIN_ROOT, 'skills/skills/references', ref), 'utf8');
    check(`skill.noPrivateDocs.${ref}`, /`\/docs\b|\/docs "/.test(body), false,
      `${ref} ships to third-party users and must not name this repo's /docs skill`);
    check(`skill.projectDocs.${ref}`, /update the project's docs/i.test(body), true,
      `${ref} must keep the generic project-docs reminder`);
  }
}

// ------------------------------- 14. mod-creator (own block: FILES refver pins are hook-creator's CC 2.1.309 baseline)

{
  // GIVEN the mod-creator body WHEN read apart from FILES THEN its contract pieces are all present.
  const mod = readFileSync(join(AGENTS, 'mod-creator.md'), 'utf8');
  const fmKeys = (t) => (t.split(/^---$/m)[1] || '').split('\n')
    .filter((l) => /^[a-z_]+:/.test(l)).map((l) => l.split(':')[0]);
  const fmLine = (key) => ((mod.split(/^---$/m)[1] || '').split('\n').find((l) => l.startsWith(`${key}:`)) || '');
  const step0 = mod.split(/^## /m).find((h) => h.startsWith('Step 0')) || '';
  const refDir = join(PLUGIN_ROOT, 'skills/agents/references');
  const cited = [...mod.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/[^\s`|]+\.md/g)].map((m) => m[0]);

  check('mod.fm.keyOrder', fmKeys(mod), fmKeys(text['hook-creator.md']),
    'mod-creator frontmatter keys and order must equal its peer creators');
  check('mod.fm.tools', fmLine('tools').split(/[:,]/).slice(1).map((t) => t.trim()).filter((t) => ['Skill', 'Bash', 'AskUserQuestion', 'Agent'].includes(t)).sort(),
    ['Bash', 'Skill'], 'mod-creator tools must carry Skill + Bash and neither AskUserQuestion nor Agent');
  check('mod.cites.exist', cited.filter((c) => !existsSync(c.replace('${CLAUDE_PLUGIN_ROOT}', PLUGIN_ROOT))), [],
    'every reference path mod-creator cites must exist');
  check('mod.cites.count', cited.length > 0, true, 'mod-creator must cite at least one reference path');
  check('mod.cites.fiveRefs', ['api', 'changes', 'lifecycle', 'patterns', 'testing']
    .filter((n) => !existsSync(join(refDir, `mods-${n}.md`))), [], 'the five mods-*.md references must ship');
  check('mod.headings', ['## Scope Fit', '## Return contract', '## Step 0 (every run, before any work)']
    .filter((h) => !mod.split('\n').includes(h)), [], 'mod-creator must carry Scope Fit, Return contract and Step 0 headings');
  check('mod.step0.threeRows', [1, 2, 3].filter((n) => !new RegExp(`^\\| ${n} \\|`, 'm').test(step0)), [],
    'Step 0 must have its three numbered steps');
  check('mod.step0.skillThenScript',
    [/`Skill` -> `plugin-authoring`/.test(step0), /mods-ref-check\.mjs <TF>/.test(step0)], [true, true],
    'Step 0 must load plugin-authoring via Skill, then run the drift script on the derived types file');
  check('mod.step0.emptyStdoutIsError',
    /Empty stdout, any other first line, `ERROR` or rc 2 = ERROR, never drift/.test(step0), true,
    'Step 0 must treat empty stdout or a non-verdict first line as ERROR (wrong path gives rc 1)');
  check('mod.step0.versionLine', /`VERSION types X references Y`/.test(step0), true,
    'Step 0 must take the build from the VERSION line, not PATH claude --version');
  check('mod.step0.notRun', /STOP: return `Step 0: NOT RUN \(<reason>\)`, no mod work/.test(step0), true,
    'Step 0 must stop with NOT RUN when Skill, types file or script fails');
  check('mod.step0.ignoreWriteLocation', /ignore the skill's "WHERE TO WRITE"/.test(step0), true,
    'Step 0 must not follow the skill write location (~/.claude/dev-mods/)');
  check('mod.driftFloodCap', /DRIFT rows, each loud \(first 10 inline; rest \+ count in report file\)/.test(mod), true,
    'mod-creator must cap inline DRIFT rows at 10 and file the rest with the count (30-line cap)');
  check('mod.returnContract', /^## Return contract\n\nVerdict first, <=30 lines, `path:line` refs\./m.test(mod), true,
    'mod-creator must carry the verdict-first return contract');
  check('mod.refVer.noLiteral', [/^> Ref ver: .*`verified_on`/m.test(mod), /^> Ref ver: .*\d+\.\d+\.\d+/m.test(mod)], [true, false],
    'mod-creator Ref ver line must point at verified_on, not carry a CC version literal');
  check('mod.maintainerOnlyWhenAsked', /Maintainer update only when the brief asks and `git rev-parse --show-toplevel`/.test(mod), true,
    'mod-creator must update references only on request, rooted via git rev-parse');
  check('mod.liveGate', /mods-lifecycle\.md` "Debug lines", incl\. `unset CLAUDECODE`/.test(mod), true,
    'mod-creator live gate must point at the exact command in mods-lifecycle.md');
}

// ---------------------------------------------------------------- report

console.log('\nsuite-creator-contract (brewcode creator agents)');
console.log(`  base: ${AGENTS}`);
for (const line of results) console.log(line);
console.log(`\n  passed=${passed} failed=${failed} total=${passed + failed}\n`);
process.exit(failed === 0 ? 0 : 1);
