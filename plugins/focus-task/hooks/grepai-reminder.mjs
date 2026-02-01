#!/usr/bin/env node

/**
 * PreToolUse hook for Glob/Grep tools.
 * Reminds Claude to prefer grepai_search for semantic queries.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { log } from './lib/utils.mjs';

const cwd = process.cwd();
const grepaiDir = join(cwd, '.grepai');

if (existsSync(grepaiDir)) {
  log('debug', '[grepai]', 'Reminder triggered: grepai configured, Glob/Grep called', cwd);
  console.log('⚠️ grepai is configured in this project. Consider using grepai MCP tool for semantic/intent-based queries. Use Glob/Grep only for exact text matching or file patterns.');
}

// Always exit 0 - don't block, just remind
process.exit(0);
