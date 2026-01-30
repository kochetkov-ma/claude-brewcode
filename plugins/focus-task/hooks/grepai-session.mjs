#!/usr/bin/env node
/**
 * grepai SessionStart Hook
 *
 * Auto-starts grepai watch when entering a project with .grepai/ configured.
 * Provides status information via systemMessage.
 *
 * NEVER blocks session start - all errors are informational only.
 */
import { readStdin, output, log } from './lib/utils.mjs';
import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';

async function main() {
  let cwd = null;
  let session_id = null;

  try {
    cwd = process.cwd();
    const input = await readStdin();
    session_id = input.session_id;
    cwd = input.cwd || cwd;

    log('info', '[grepai]', 'SessionStart hook triggered', cwd, session_id);

    const result = await checkGrepai(cwd, session_id);

    log('debug', '[grepai]', 'Hook completed', cwd, session_id);
    output(result);
  } catch (err) {
    log('error', '[grepai]', `Hook error: ${err.message}`, cwd, session_id);
    output({});
  }
}

async function checkGrepai(cwd, session_id = null) {
  const grepaiDir = join(cwd, '.grepai');
  const indexPath = join(grepaiDir, 'index.gob');
  const logsDir = join(grepaiDir, 'logs');

  // No .grepai directory - skip silently (grepai not configured for this project)
  if (!existsSync(grepaiDir)) {
    log('debug', '[grepai]', 'Not configured', cwd, session_id);
    return { systemMessage: 'grepai: not configured' };
  }

  const status = [];
  let shouldAutoStart = false;

  // Check ollama
  const ollamaRunning = checkOllama();
  log('debug', '[grepai]', `ollama: ${ollamaRunning ? 'running' : 'stopped'}`, cwd, session_id);
  if (!ollamaRunning) {
    status.push('ollama: stopped');
  }

  // Check index
  const hasIndex = existsSync(indexPath);
  if (hasIndex) {
    try {
      const stats = statSync(indexPath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
      log('debug', '[grepai]', `index: ${sizeMB}MB`, cwd, session_id);
    } catch {
      log('debug', '[grepai]', 'index: exists', cwd, session_id);
    }
  } else {
    log('debug', '[grepai]', 'index: missing', cwd, session_id);
    status.push('index: missing');
  }

  // Check watch process
  const watchRunning = checkWatchRunning();
  log('debug', '[grepai]', `watch: ${watchRunning ? 'running' : 'stopped'}`, cwd, session_id);

  if (!watchRunning && hasIndex && ollamaRunning) {
    shouldAutoStart = true;
  }

  // Auto-start watch if conditions met
  if (shouldAutoStart) {
    try {
      log('info', '[grepai]', 'Auto-starting watch', cwd, session_id);

      if (!existsSync(logsDir)) {
        mkdirSync(logsDir, { recursive: true });
      }

      const child = spawn('grepai', ['watch', '--background', '--log-dir', logsDir], {
        cwd: cwd,
        detached: true,
        stdio: 'ignore'
      });
      child.unref();

      log('info', '[grepai]', 'Watch started', cwd, session_id);
      status.push('watch: auto-started');
    } catch (err) {
      log('warn', '[grepai]', `Watch auto-start failed: ${err.message}`, cwd, session_id);
      status.push('watch: start failed');
    }
  } else if (!watchRunning) {
    status.push('watch: stopped');
  }

  // Build status message
  const statusMessage = status.length === 0
    ? 'ready'
    : status.join(', ');

  log('info', '[grepai]', `Status: ${statusMessage}`, cwd, session_id);

  return {
    systemMessage: `grepai: ${statusMessage}`
  };
}

function checkOllama() {
  try {
    execSync('curl -s localhost:11434/api/tags', {
      timeout: 2000,
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
}

function checkWatchRunning() {
  try {
    const result = execSync('pgrep -f "grepai watch"', {
      encoding: 'utf8',
      timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

main();
