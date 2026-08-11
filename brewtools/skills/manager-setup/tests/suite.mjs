#!/usr/bin/env node
/**
 * E2E suite for the manager HARD wall guard (brewtools/hooks/hardmode-guard.mjs).
 * Focus: main-session vs subagent discrimination.
 * State is driven through an isolated temp project passed as `cwd` on stdin —
 * this repo's .claude/ is never read or written and no real wall is ever armed.
 * Assertion policy: every check is an unconditional exact deep-equality
 * comparison with a description; no branching gates which asserts run.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');
const GUARD_MJS = join(HERE, '..', '..', '..', 'hooks', 'hardmode-guard.mjs');

const BASE = mkdtempSync(join(tmpdir(), 'hardmode-test-'));
let passed = 0;
let failed = 0;
const results = [];

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

function check(name, actual, expected, message) {
  const ok = deepEqual(actual, expected);
  passed += ok ? 1 : 0;
  failed += ok ? 0 : 1;
  results.push(ok
    ? `  PASS  ${name}  (${message})`
    : `  FAIL  ${name}  (${message} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`);
}

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return { __PARSE_ERROR__: String(e), raw: str };
  }
}

function runGuard(stdinStr) {
  const r = spawnSync(process.execPath, [GUARD_MJS], {
    input: stdinStr,
    encoding: 'utf8',
    timeout: 8000,
  });
  return safeParse(r.stdout || '');
}

/** Isolated project whose state.json arms/disarms the wall for one scenario. */
function makeProject(name, state) {
  const proj = join(BASE, name);
  mkdirSync(join(proj, '.claude', 'brewtools', 'manager'), { recursive: true });
  writeFileSync(join(proj, '.claude', 'brewtools', 'manager', 'state.json'), JSON.stringify(state));
  return proj;
}

const PASS_THROUGH = {};
const EXIT_HINT = 'Manager HARD wall is ON — delegate via Task/Agent. To exit run `/brewtools:manager-setup disable`; the only Bash it needs — `node <project>/.claude/brewtools/manager/manager-state.mjs set hard=false` — is self-exempt at every level.';

function denial(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `${reason} ${EXIT_HINT}`,
    },
  };
}

const WRITE_DENIAL = denial('Hard wall: Write is blocked in the main session — delegate to a subagent.');
const BASH_DENIAL = denial('Hard wall (balanced): only read-only Bash is allowed in the main session — delegate execution to a subagent.');

const ARMED = makeProject('armed', { hard: true, level: 'balanced' });
const DISARMED = makeProject('disarmed', { hard: false, level: 'balanced' });

function stdin(cwd, extra) {
  return JSON.stringify({
    session_id: 'S1',
    cwd,
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: { file_path: join(cwd, 'x.txt'), content: 'x' },
    ...extra,
  });
}

// GIVEN an armed wall, WHEN a real subagent (agent_id present) writes, THEN it passes through.
check(
  '01-subagent-with-agent-id-passes',
  runGuard(stdin(ARMED, { agent_id: 'sub-1', agent_type: 'general-purpose' })),
  PASS_THROUGH,
  'agent_id present means a genuine subagent tool call and must never be walled',
);

// GIVEN an armed wall, WHEN agent_type is present without agent_id, THEN the call is DENIED.
// REGRESSION: CC 2.1.228 sets agent_type on the MAIN thread of a `claude --agent <name>`
// session (no agent_id). Treating agent_type as a subagent discriminator silently
// disarmed the wall for every such session — agent_id is the SOLE discriminator.
check(
  '02-regression-agent-type-only-main-session-is-walled',
  runGuard(stdin(ARMED, { agent_type: 'reviewer' })),
  WRITE_DENIAL,
  'a `claude --agent` MAIN session carries agent_type without agent_id and must stay walled',
);

// GIVEN an armed wall, WHEN neither agent key is present, THEN the call is DENIED (fail-safe).
check(
  '03-plain-main-session-is-walled',
  runGuard(stdin(ARMED, {})),
  WRITE_DENIAL,
  'a plain main session carries no agent keys and must be walled',
);

// GIVEN an armed wall and an agent_type-only main session, WHEN Bash is used,
// THEN the balanced Bash classifier still applies — the discriminator does not bypass it.
check(
  '04-agent-type-only-main-session-bash-is-classified',
  runGuard(stdin(ARMED, { agent_type: 'reviewer', tool_name: 'Bash', tool_input: { command: 'rm -rf /tmp/nope' } })),
  BASH_DENIAL,
  'mutating Bash from a --agent main session must be denied by the balanced classifier',
);

// GIVEN an armed wall and an agent_type-only main session, WHEN an always-allowed tool is used,
// THEN it passes — the wall discriminates by tool, not by punishing the session.
check(
  '05-agent-type-only-main-session-keeps-read-tools',
  runGuard(stdin(ARMED, { agent_type: 'reviewer', tool_name: 'Read', tool_input: { file_path: '/etc/hosts' } })),
  PASS_THROUGH,
  'Read stays allowed in a walled main session',
);

// GIVEN a disarmed wall, WHEN a main session writes, THEN the guard short-circuits before
// any agent-key inspection.
check(
  '06-disarmed-wall-short-circuits',
  runGuard(stdin(DISARMED, {})),
  PASS_THROUGH,
  'hard=false must no-op regardless of agent keys',
);

// GIVEN no state file at all, WHEN a main session writes, THEN the guard treats the wall as off.
check(
  '07-missing-state-file-is-unarmed',
  runGuard(stdin(join(BASE, 'no-such-project'), {})),
  PASS_THROUGH,
  'an unreadable or absent state.json means hard=false',
);

// GIVEN malformed stdin, WHEN the guard runs, THEN it fails open instead of crashing.
check(
  '08-malformed-stdin-fails-open',
  runGuard('{not json'),
  PASS_THROUGH,
  'a guard bug or bad payload must never brick the session',
);

try { rmSync(BASE, { recursive: true, force: true }); } catch { /* ignore */ }

console.log('\n=== hardmode-guard E2E TEST REPORT ===');
for (const line of results) console.log(line);
console.log(`\nTOTAL: ${passed + failed} | PASS: ${passed} | FAIL: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
