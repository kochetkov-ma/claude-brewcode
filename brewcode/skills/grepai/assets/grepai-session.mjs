#!/usr/bin/env node
/**
 * grepai SessionStart Hook (self-contained — installed into a user project)
 *
 * Auto-starts grepai watch when entering a project with .grepai/ configured.
 * Provides status information via systemMessage.
 *
 * NEVER blocks session start - all errors are informational only.
 * Platform: macOS/Linux only. Windows lacks pgrep - auto-start disabled.
 *
 * SELF-CONTAINED: readStdin / output / log are inlined below. No plugin-root
 * paths, no shared lib import. Pure ESM, Node built-ins only. Exits 0 always.
 */
import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, statSync, readFileSync } from 'fs';
import { join } from 'path';

// --- inlined helpers (from brewcode hooks lib/utils.mjs) -------------------
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(input);
  } catch (e) {
    throw new Error(`Invalid stdin JSON: ${e.message}. Input: ${input.substring(0, 100)}`);
  }
}

function output(response) {
  try {
    console.log(JSON.stringify(response));
  } catch (e) {
    console.log(JSON.stringify({ error: `Serialization failed: ${e.message}` }));
  }
}

// Minimal log: stderr only for warn/error, never throws, no file deps.
function log(level, prefix, message) {
  if (level === 'error' || level === 'warn') {
    try { console.error(`${prefix} ${message}`); } catch {}
  }
}
// ---------------------------------------------------------------------------

async function main() {
  let cwd = null;
  let session_id = null;

  try {
    cwd = process.cwd();
    const input = await readStdin();
    session_id = input.session_id;
    cwd = input.cwd || cwd;

    const result = await checkGrepai(cwd, session_id);
    output(result);
  } catch (err) {
    log('error', '[grepai]', `Hook error: ${err.message}`);
    output({});
  }
}

async function checkGrepai(cwd, session_id = null) {
  const grepaiDir = join(cwd, '.grepai'); // nosemgrep: path-join-resolve-traversal
  const indexPath = join(grepaiDir, 'index.gob'); // nosemgrep: path-join-resolve-traversal
  const logsDir = join(grepaiDir, 'logs'); // nosemgrep: path-join-resolve-traversal

  // No .grepai directory - skip silently (grepai not configured for this project)
  if (!existsSync(grepaiDir)) {
    return { systemMessage: 'grepai: not configured' };
  }

  const status = [];
  let indexStatus = null;
  let shouldAutoStart = false;

  // Check ollama
  const ollamaRunning = checkOllama();
  if (!ollamaRunning) {
    status.push('ollama: stopped');
  }

  // Check index with size-based file estimation
  const hasIndex = existsSync(indexPath);
  if (hasIndex) {
    try {
      const stats = statSync(indexPath);
      const sizeKB = Math.round(stats.size / 1024);

      // Estimate: ~10KB per file on average
      // <20KB = likely <2 files (nearly empty, warn)
      // 20-100KB = small project (display KB)
      // >100KB = normal project (display MB)
      if (stats.size < 20000) {
        indexStatus = `⚠️ ${sizeKB}KB`;
      } else if (stats.size < 100000) {
        indexStatus = `${sizeKB}KB`;
      } else {
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
        indexStatus = `${sizeMB}MB`;
      }
    } catch (err) {
      indexStatus = 'error';
      log('warn', '[grepai]', `index stat failed: ${err.message}`);
    }
  } else {
    status.push('index: missing');
  }

  // Check watch process
  const watchRunning = checkWatchRunning(cwd);

  if (!watchRunning && hasIndex && ollamaRunning && process.platform !== 'win32') {
    shouldAutoStart = true;
  }

  // Check MCP server
  const mcpRunning = checkMcpServer(cwd);
  if (!mcpRunning) {
    status.push('mcp-serve: stopped');
  }

  // Auto-start watch if conditions met
  if (shouldAutoStart) {
    try {
      if (!existsSync(logsDir)) {
        mkdirSync(logsDir, { recursive: true });
      }

      const child = spawn('grepai', ['watch', '--background', '--log-dir', logsDir], {
        cwd: cwd,
        detached: true,
        stdio: 'ignore'
      });
      child.on('error', (err) => {
        log('warn', '[grepai]', `Watch spawn error: ${err.message}`);
      });
      child.unref();

      status.push('watch: starting');
    } catch (err) {
      log('warn', '[grepai]', `Watch auto-start failed: ${err.message}`);
      status.push('watch: start failed');
    }
  } else if (!watchRunning) {
    status.push('watch: stopped');
  }

  // Build status message
  let statusMessage;
  if (status.length === 0) {
    statusMessage = indexStatus ? `ready | index: ${indexStatus}` : 'ready';
  } else {
    statusMessage = indexStatus
      ? `${status.join(', ')} | index: ${indexStatus}`
      : status.join(', ');
  }

  const result = { systemMessage: `grepai: ${statusMessage}` };

  // Reminder for Claude: only when grepai_search is actually usable (index + ollama + mcp)
  if (hasIndex && ollamaRunning && mcpRunning) {
    result.hookSpecificOutput = {
      hookEventName: 'SessionStart',
      additionalContext: 'grepai: USE grepai_search FIRST for code exploration'
    };
  }

  return result;
}

function checkOllama() {
  try {
    execSync('curl -s --max-time 1 localhost:11434/api/tags', {
      timeout: 1500,
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
}

function checkWatchRunning(cwd) {
  if (process.platform === 'win32') return false;
  // Check for grepai PID file first (project-specific)
  const pidFile = join(cwd, '.grepai', 'watch.pid'); // nosemgrep: path-join-resolve-traversal
  if (existsSync(pidFile)) {
    try {
      const pid = readFileSync(pidFile, 'utf8').trim();
      if (pid && /^\d+$/.test(pid)) {
        process.kill(parseInt(pid), 0);
        return true;
      }
    } catch {
      // Process not running, PID file is stale
    }
  }
  // Fallback: system-wide check (may match other projects)
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

function checkMcpServer(cwd) {
  if (process.platform === 'win32') return false;
  const pidFile = join(cwd, '.grepai', 'mcp-serve.pid'); // nosemgrep: path-join-resolve-traversal
  if (existsSync(pidFile)) {
    try {
      const pid = readFileSync(pidFile, 'utf8').trim();
      if (pid && /^\d+$/.test(pid)) {
        process.kill(parseInt(pid), 0);
        return true;
      }
    } catch {}
  }
  try {
    const result = execSync('pgrep -f "grepai mcp-serve"', {
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
