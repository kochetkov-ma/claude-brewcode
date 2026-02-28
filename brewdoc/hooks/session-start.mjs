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

    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '';
    const sessionShort = session_id?.slice(0, 8) || 'unknown';

    const context = pluginRoot
      ? `BD_PLUGIN_ROOT=${pluginRoot}\nbrewdoc: active | session: ${sessionShort}`
      : `brewdoc: active | session: ${sessionShort}`;

    output({
      systemMessage: `brewdoc: ${pluginRoot} | session: ${sessionShort}`,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: context
      }
    });
  } catch (error) {
    log('error', '[session-start]', `Error: ${error.message}`, cwd, session_id);
    output({});
  }
}

main();
