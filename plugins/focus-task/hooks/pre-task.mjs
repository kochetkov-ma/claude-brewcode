#!/usr/bin/env node
/**
 * PreToolUse hook for Task tool
 * Injects ## K knowledge into sub-agent prompts
 * Only activates when lock file exists with matching session_id
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

    // Check lock with session match
    const lock = checkLock(cwd, session_id);
    if (!lock) {
      // No valid lock = focus-task not running in this session
      output({});
      return;
    }

    // Get task path from lock
    const taskPath = lock.task_path;
    if (!taskPath) {
      output({});
      return;
    }

    // Read knowledge
    const knowledgePath = getKnowledgePath(taskPath);
    const entries = readKnowledge(knowledgePath);

    if (!entries.length) {
      output({});
      return;
    }

    // Load config for maxTokens
    const config = loadConfig(cwd);

    // Compress knowledge to ## K format
    const knowledge = compressKnowledge(entries, config.knowledge.maxTokens);
    if (!knowledge) {
      output({});
      return;
    }

    log('info', '[pre-task]', `Injecting knowledge for ${subagentType} (${entries.length} entries)`, cwd, session_id);

    // Inject knowledge into prompt
    const originalPrompt = tool_input.prompt || '';
    const updatedPrompt = `${knowledge}\n\n${originalPrompt}`;

    output({
      updatedInput: {
        ...tool_input,
        prompt: updatedPrompt
      },
      systemMessage: `focus-task: knowledge injected (${entries.length} entries)`
    });
  } catch (error) {
    // On error, pass through without modification
    log('error', '[pre-task]', `Error: ${error.message}`, cwd, session_id);
    output({});
  }
}

main();
