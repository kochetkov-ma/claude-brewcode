#!/usr/bin/env node
/**
 * PreToolUse hook for Task tool
 * - Injects grepai reminder for ALL agents (when .grepai/ exists)
 * - Injects ## K knowledge into sub-agent prompts (focus-task only)
 */
import {
  readStdin,
  output,
  getKnowledgePath,
  checkLock,
  isSystemAgent,
  loadConfig,
  log
} from './lib/utils.mjs';
import { readKnowledge, compressKnowledge } from './lib/knowledge.mjs';
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

    // Skip system agents (including coordinator)
    if (!subagentType || isSystemAgent(subagentType, cwd)) {
      output({});
      return;
    }

    // Check grepai availability (for ALL agents)
    const grepaiDir = join(cwd, '.grepai');
    const hasGrepai = existsSync(grepaiDir);

    // Check lock with session match (for focus-task knowledge injection)
    const lock = checkLock(cwd, session_id);

    let updatedPrompt = tool_input.prompt || '';
    const messages = [];

    // 1. Inject grepai reminder for ALL agents
    if (hasGrepai) {
      messages.push(GREPAI_REMINDER);
      log('debug', '[pre-task]', `grepai reminder for ${subagentType}`, cwd, session_id);
    }

    // 2. Inject knowledge for focus-task agents (when lock exists)
    if (lock && lock.task_path) {
      const knowledgePath = getKnowledgePath(lock.task_path);
      const entries = readKnowledge(knowledgePath);

      if (entries.length) {
        const config = loadConfig(cwd);
        const knowledge = compressKnowledge(entries, config.knowledge.maxTokens);

        if (knowledge) {
          updatedPrompt = `${knowledge}\n\n${updatedPrompt}`;
          messages.push(`focus-task: knowledge injected (${entries.length} entries)`);
          log('info', '[pre-task]', `Injecting knowledge for ${subagentType} (${entries.length} entries)`, cwd, session_id);
        }
      }
    }

    // Output result
    if (messages.length || updatedPrompt !== tool_input.prompt) {
      output({
        updatedInput: {
          ...tool_input,
          prompt: updatedPrompt
        },
        systemMessage: messages.join(' | ')
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
