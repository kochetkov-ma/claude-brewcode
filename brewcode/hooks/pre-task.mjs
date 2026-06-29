#!/usr/bin/env node
/**
 * PreToolUse hook for Task tool
 * - Injects grepai reminder for ALL agents (when .grepai/ exists)
 * - Injects BC_PLUGIN_ROOT/DATA, active mode, team SID, effort prefix into sub-agent prompts
 */
import {
  readStdin,
  output,
  log,
  getActiveMode
} from './lib/utils.mjs';
import { existsSync } from 'fs';
import { join } from 'path';

const GREPAI_REMINDER = 'grepai: USE grepai_search FIRST for code exploration';

async function main() {
  let cwd = null;
  let session_id = null;

  try {
    cwd = process.cwd();
    const input = await readStdin();
    session_id = input.session_id;
    cwd = input.cwd || cwd;
    const tool_input = input.tool_input;

    // Only process Task tool calls
    if (!tool_input) {
      output({});
      return;
    }

    const subagentType = tool_input.subagent_type;

    // Skip if no subagent type
    if (!subagentType) {
      output({});
      return;
    }

    // Check grepai availability (for ALL agents including system agents)
    const grepaiDir = join(cwd, '.grepai');
    const hasGrepai = existsSync(grepaiDir) && existsSync(join(grepaiDir, 'index.gob'));

    let updatedPrompt = tool_input.prompt || '';
    let modified = false;

    // 0.0 Effort-level prefix (CC 2.1.115+). Idempotent: skip if already present.
    // NOTE: effort.level is NOT in HOOKS-REFERENCE.md (2.1.195). Presence-guarded existing read; do not expand to other hooks.
    const effortLevel = input.effort?.level;
    if (effortLevel === 'low' && !updatedPrompt.includes('[EFFORT:')) {
      updatedPrompt = `[EFFORT: low | MODE: terse-light]\n${updatedPrompt}`;
      modified = true;
      log('debug', '[pre-task]', `Injected EFFORT=low prefix for ${subagentType}`, cwd, session_id);
    }

    // 0. Inject BC_PLUGIN_ROOT for ALL agents (first injection)
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '';
    if (pluginRoot) {
      updatedPrompt = `BC_PLUGIN_ROOT=${pluginRoot}\n\n${updatedPrompt}`;
      modified = true;
      log('debug', '[pre-task]', `Injected BC_PLUGIN_ROOT for ${subagentType}`, cwd, session_id);
    }

    const pluginData = process.env.CLAUDE_PLUGIN_DATA || '';
    if (pluginData) {
      updatedPrompt = `BC_PLUGIN_DATA=${pluginData}\n\n${updatedPrompt}`;
      modified = true;
      log('debug', '[pre-task]', `Injected BC_PLUGIN_DATA for ${subagentType}`, cwd, session_id);
    }

    // 0.5 Inject mode instructions for ALL agents
    const activeMode = getActiveMode(cwd, session_id);
    if (activeMode) {
      updatedPrompt = `[MODE: ${activeMode.name}] ${activeMode.instructions}\n\n${updatedPrompt}`;
      modified = true;
      log('debug', '[pre-task]', `Injected mode "${activeMode.name}" for ${subagentType}`, cwd, session_id);
    }

    // 0.7 Inject SID for all agents when teams exist (any agent may participate in teams)
    const teamsDir = join(cwd, '.claude', 'teams');
    if (existsSync(teamsDir) && typeof session_id === 'string' && session_id.length >= 8) {
      const sid = session_id.slice(0, 8);
      updatedPrompt = `SID=${sid}\n\n${updatedPrompt}`;
      modified = true;
      log('debug', '[pre-task]', `Injected SID=${sid} for ${subagentType}`, cwd, session_id);
    }

    // 1. Inject grepai reminder for ALL agents (including Explore, Plan, etc.)
    if (hasGrepai) {
      updatedPrompt = `${GREPAI_REMINDER}\n\n${updatedPrompt}`;
      modified = true;
      log('debug', '[pre-task]', `grepai reminder for ${subagentType}`, cwd, session_id);
    }

    // Output result - updatedInput MUST be inside hookSpecificOutput per Claude Code docs
    // Note: systemMessage removed - logs go to brewcode.log only, not UI
    if (modified) {
      output({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          updatedInput: {
            ...tool_input,
            prompt: updatedPrompt
          }
        }
      });
    } else {
      output({});
    }
  } catch (error) {
    // On error, pass through without modification
    log('error', '[pre-task]', `Error: ${error.message}`, cwd, session_id);
    output({});
  }
}

main();
