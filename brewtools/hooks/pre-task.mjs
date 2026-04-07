#!/usr/bin/env node
/**
 * PreToolUse hook for Task|Agent tools
 * Injects BT_PLUGIN_ROOT into sub-agent prompts
 */
import { readStdin, output, log } from './lib/utils.mjs';

async function main() {
  let cwd = null;
  let session_id = null;

  try {
    cwd = process.cwd();
    const input = await readStdin();
    session_id = input.session_id;
    cwd = input.cwd || cwd;
    const tool_input = input.tool_input;

    if (!tool_input || !tool_input.subagent_type) {
      output({});
      return;
    }

    let updatedPrompt = tool_input.prompt || '';
    let modified = false;

    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '';
    if (pluginRoot) {
      updatedPrompt = `BT_PLUGIN_ROOT=${pluginRoot}\n\n${updatedPrompt}`;
      modified = true;
      log('debug', '[pre-task]', `Injected BT_PLUGIN_ROOT for ${tool_input.subagent_type}`, cwd, session_id);
    }

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
    log('error', '[pre-task]', `Error: ${error.message}`, cwd, session_id);
    output({});
  }
}

main();
