#!/usr/bin/env node
// brewcode-meta: version=6.4.0 content_version=5.6.0 generated_by=brewtools:agent-return-setup
/**
 * agent-return-contract — SubagentStart hook (Node built-ins only).
 *
 * States the return budget to the subagent at spawn, so the rule arrives with
 * the work instead of being inherited from a parent context the subagent never
 * sees. Enforcement is agent-return-guard.mjs (SubagentStop + PreToolUse
 * SubagentHandback); both read the same numbers from agent-return-budget.mjs,
 * so the announced budget always equals the enforced one.
 *
 * Advisory only: one `additionalContext`, no decision, no matcher assumptions —
 * registered without a matcher it fires for every agent type. stdin is read for
 * `agent_type` alone: a listed read-only agent (config `readOnlyAgentTypes`) gets
 * the text without the write-to-file step. Unreadable stdin -> the general text.
 *
 * Config gate: `.claude/agent-return.json` with `enabled: true` (project wins,
 * then global). No config = no-op. See agent-return-budget.mjs for the full
 * config-key > env-var > default precedence.
 *
 * Fail-open: any *runtime* throw -> `{}` on stdout, exit 0. A missing sibling
 * agent-return-budget.mjs is not catchable (ESM resolution runs before
 * evaluation): the hook exits 1 with empty stdout, a non-blocking hook error.
 * The three files ship together.
 */
import { readFileSync } from 'node:fs';
import { ENABLED, returnContract } from './agent-return-budget.mjs';

function output(obj) {
  process.stdout.write(JSON.stringify(obj));
}

/** `agent_type` from the SubagentStart payload; anything unreadable -> ''. */
function agentType() {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    return input && typeof input.agent_type === 'string' ? input.agent_type : '';
  } catch {
    return '';
  }
}

try {
  output(
    ENABLED
      ? {
          hookSpecificOutput: {
            hookEventName: 'SubagentStart',
            additionalContext: returnContract(agentType()),
          },
        }
      : {},
  );
} catch {
  output({});
}
