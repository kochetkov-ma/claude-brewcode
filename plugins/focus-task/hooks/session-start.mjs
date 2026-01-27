#!/usr/bin/env node
/**
 * SessionStart hook - logs session ID
 */
import { readStdin, output, log } from './lib/utils.mjs';

async function main() {
  try {
    const input = await readStdin();
    const { session_id, source, cwd } = input;

    log('info', '[session]', `Started: ${session_id} (${source})`, cwd);

    output({});
  } catch (error) {
    console.error(`[session-start] Error: ${error.message}`);
    output({});
  }
}

main();
