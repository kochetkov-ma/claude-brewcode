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
    const permMode = input.permission_mode; // doc-verified common field (HOOKS-REFERENCE.md 2.1.195)

    const context = pluginRoot
      ? `BU_PLUGIN_ROOT=${pluginRoot}`
      : `brewui: ${sessionShort}`;

    // systemMessage is fixed-shape (plugin path + 8-char sid + short perm enum) -> well under
    // the 10K text-channel spill threshold; no capText needed.
    output({
      systemMessage: `brewui: ${pluginRoot} | session: ${sessionShort}${permMode ? ` | perm: ${permMode}` : ''}`,
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
