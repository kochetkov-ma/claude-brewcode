#!/usr/bin/env node
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

    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '';
    if (!pluginRoot) {
      output({});
      return;
    }

    const updatedPrompt = `BD_PLUGIN_ROOT=${pluginRoot}\n\n${tool_input.prompt || ''}`;

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
  } catch (error) {
    log('error', '[pre-task]', `Error: ${error.message}`, cwd, session_id);
    output({});
  }
}

main();
