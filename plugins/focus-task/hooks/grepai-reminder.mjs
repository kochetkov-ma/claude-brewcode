#!/usr/bin/env node

/**
 * PreToolUse hook for Glob/Grep tools.
 * Reminds Claude to prefer grepai_search for semantic queries.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { output, log } from './lib/utils.mjs';

const cwd = process.cwd();
const grepaiDir = join(cwd, '.grepai');

if (existsSync(grepaiDir)) {
  log('debug', '[grepai]', 'Reminder triggered: grepai configured, Glob/Grep called', cwd);
  output({
    systemMessage: 'grepai: USE grepai_search FIRST for code exploration'
  });
} else {
  output({});
}

process.exit(0);
