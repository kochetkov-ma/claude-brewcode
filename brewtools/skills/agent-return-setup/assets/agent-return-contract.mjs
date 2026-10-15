#!/usr/bin/env node
// brewcode-meta: version=6.8.0 content_version=6.5.0 generated_by=brewtools:agent-return-setup

// agent-return SubagentStart, advisory: states the budget enforced by agent-return-guard.mjs (same numbers, agent-return-budget.mjs).
// Runtime throw -> `{}`; a missing sibling budget module exits 1 (ESM import, non-blocking).
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
