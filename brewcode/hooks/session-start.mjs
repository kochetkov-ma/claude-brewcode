#!/usr/bin/env node
/**
 * SessionStart hook - logs session ID, symlinks latest plan on clear
 *
 * LATEST PLAN SYMLINK LOGIC:
 * ─────────────────────────
 * When user exits Plan Mode, Claude offers "Clear session and start work".
 * If user chooses Clear → SessionStart fires with source='clear'.
 *
 * Flow:
 * 1. EnterPlanMode → Claude writes plan to ~/.claude/plans/<name>.md
 * 2. ExitPlanMode → Claude offers "Clear session?" option
 * 3. User clicks Clear → SessionStart(source='clear')
 * 4. This hook creates .claude/plans/LATEST.md → ~/.claude/plans/<newest>.md
 *
 * Conditions:
 * - Only on source='clear' (not on init/resume)
 * - Only if plan modified < 60 seconds ago (fresh plan)
 * - Symlink points to global plan file for easy access from project
 *
 * Cleanup: /brewcode:teardown removes .claude/plans/ directory
 */
import { readStdin, output, log, getActiveTaskPath, getLock, getActiveMode } from './lib/utils.mjs';
import { readFileSync, readdirSync, statSync, mkdirSync, symlinkSync, unlinkSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { homedir } from 'os';

const PLAN_FRESHNESS_MS = 60_000;

/**
 * Creates symlink .claude/plans/LATEST.md → ~/.claude/plans/<newest>.md
 * Only if newest plan is < 60 seconds old (fresh from Plan Mode)
 */
function linkLatestPlan(cwd) {
  const globalPlansDir = join(homedir(), '.claude', 'plans');
  const projectPlansDir = join(cwd, '.claude', 'plans');
  const latestLink = join(projectPlansDir, 'LATEST.md');

  if (!existsSync(globalPlansDir)) return null;

  const plans = readdirSync(globalPlansDir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      try {
        const p = join(globalPlansDir, f);
        return { name: f, path: p, mtime: statSync(p).mtime };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);

  if (plans.length === 0) return null;

  const latest = plans[0];
  const ageMs = Date.now() - latest.mtime.getTime();

  if (ageMs > PLAN_FRESHNESS_MS) return null;

  mkdirSync(projectPlansDir, { recursive: true });

  try { unlinkSync(latestLink); } catch {}
  symlinkSync(latest.path, latestLink);

  return latest.name;
}

function isNewer(remoteVer, localVer) {
  const l = localVer.split('.').map(Number);
  const r = remoteVer.split('.').map(Number);
  for (let i = 0; i < Math.max(l.length, r.length); i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true;
    if ((r[i] || 0) < (l[i] || 0)) return false;
  }
  return false;
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok ? await res.json() : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function parseVersion(pluginRoot) {
  const match = pluginRoot.match(/\/(\d+\.\d+\.\d+)\/?$/);
  if (match) return match[1];
  try {
    const pj = JSON.parse(readFileSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'));
    if (pj.version) return pj.version;
  } catch {}
  return null;
}

async function checkLatestVersion(pluginRoot, cwd, sessionId) {
  try {
    const local = parseVersion(pluginRoot);
    if (!local) {
      log('debug', '[version]', `Cannot parse version from path: ${pluginRoot}`, cwd, sessionId);
      return null;
    }
    log('debug', '[version]', `Local brewcode: ${local}`, cwd, sessionId);

    const url = 'https://api.github.com/repos/kochetkov-ma/claude-brewcode/releases/latest';
    const data = await fetchJson(url, 1000);
    if (!data) {
      log('debug', '[version]', `GitHub API fetch failed (timeout or error)`, cwd, sessionId);
      return { updateAvailable: false, local, remote: null, remoteFailed: true };
    }

    const remote = (data.tag_name || '').replace(/^v/, '');
    if (!remote) {
      log('debug', '[version]', `GitHub tag_name missing: ${JSON.stringify(data.tag_name)}`, cwd, sessionId);
      return { updateAvailable: false, local, remote: null, remoteFailed: true };
    }

    const result = { updateAvailable: isNewer(remote, local), local, remote };
    log('debug', '[version]', `brewcode: local=${local}, remote=${remote}, update=${result.updateAvailable}`, cwd, sessionId);
    return result;
  } catch (e) {
    log('debug', '[version]', `checkLatestVersion error: ${e.message}`, cwd, sessionId);
    return null;
  }
}

async function checkClaudeCodeVersion(cwd, sessionId) {
  try {
    let rawOutput;
    try {
      rawOutput = execFileSync('claude', ['-v'], { timeout: 500, encoding: 'utf8' });
    } catch (e) {
      log('debug', '[version]', `claude -v failed: ${e.message}`, cwd, sessionId);
      return null;
    }

    const local = (rawOutput.match(/(\d+\.\d+\.\d+)/) || [])[1];
    if (!local) {
      log('debug', '[version]', `Cannot parse claude version from: ${rawOutput.trim()}`, cwd, sessionId);
      return null;
    }
    log('debug', '[version]', `Claude Code local: ${local}`, cwd, sessionId);

    const url = 'https://registry.npmjs.org/@anthropic-ai/claude-code/latest';
    const data = await fetchJson(url, 1000);
    if (!data?.version) {
      log('debug', '[version]', `npm fetch failed or no version in response`, cwd, sessionId);
      return null;
    }

    const result = { updateAvailable: isNewer(data.version, local), local, remote: data.version };
    log('debug', '[version]', `Claude Code: local=${local}, remote=${data.version}, update=${result.updateAvailable}`, cwd, sessionId);
    return result;
  } catch (e) {
    log('debug', '[version]', `checkClaudeCodeVersion error: ${e.message}`, cwd, sessionId);
    return null;
  }
}

async function main() {
  let cwd = null;
  let session_id = null;

  try {
    cwd = process.cwd();
    const input = await readStdin();
    session_id = input.session_id;
    cwd = input.cwd || cwd;
    const source = input.source;

    log('info', '[session-start]', `Started: ${session_id?.slice(0, 8) || 'unknown'} (${source})`, cwd, session_id);

    if (source === 'clear' && cwd) {
      try {
        const linked = linkLatestPlan(cwd);
        if (linked) {
          log('info', '[session-start]', `Linked: .claude/plans/LATEST.md -> ${linked}`, cwd, session_id);
        }
      } catch (e) {
        log('warn', '[session-start]', `Plan linking failed: ${e.message}`, cwd, session_id);
      }
    }

    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '';
    const pluginData = process.env.CLAUDE_PLUGIN_DATA || '';
    const sessionShort = session_id?.slice(0, 8) || 'unknown';

    let context = pluginRoot
      ? `BC_PLUGIN_ROOT=${pluginRoot}\nbrewcode: active | session: ${sessionShort}`
      : `brewcode: active | session: ${sessionShort}`;

    if (pluginData) {
      context = `BC_PLUGIN_DATA=${pluginData}\n${context}`;
    }

    // Inject active mode
    const activeMode = getActiveMode(cwd, session_id);
    if (activeMode) {
      context += `\n[MODE: ${activeMode.name}] ${activeMode.instructions}`;
    }

    const versionLines = [];
    try {
      const [brewcodeResult, claudeResult] = await Promise.all([
        pluginRoot ? checkLatestVersion(pluginRoot, cwd, session_id).catch(() => null) : Promise.resolve(null),
        checkClaudeCodeVersion(cwd, session_id).catch(() => null)
      ]);

      if (brewcodeResult === null && pluginRoot) {
        versionLines.push(`check brewcode updates: https://github.com/kochetkov-ma/claude-brewcode/releases/latest`);
      } else if (brewcodeResult?.updateAvailable) {
        versionLines.push(`UPDATE brewcode ${brewcodeResult.local} → ${brewcodeResult.remote}: https://github.com/kochetkov-ma/claude-brewcode/releases/latest`);
      }

      if (claudeResult?.updateAvailable) {
        versionLines.push(`UPDATE claude ${claudeResult.local} → ${claudeResult.remote}: claude update`);
      }
    } catch {
      if (pluginRoot) versionLines.push(`check brewcode updates: https://github.com/kochetkov-ma/claude-brewcode/releases/latest`);
    }

    if (cwd) {
      const lock = getLock(cwd);
      if (lock?.task_path && (!lock.session_id || lock.session_id === session_id)) {
        const taskDir = dirname(join(cwd, lock.task_path));
        const isV3 = existsSync(join(taskDir, 'phases'));

        if (source === 'compact') {
          if (isV3) {
            context += '\n\n[HANDOFF after compact] 1) TaskList() for current task state 2) Read PLAN.md for protocol 3) DO NOT read phases/ — they are for agents 4) Continue with current in_progress or next pending task 5) WRITE report -> CALL coordinator after EVERY agent';
          } else {
            context += '\n\n[HANDOFF after compact] Re-read PLAN.md and KNOWLEDGE.jsonl, then continue current phase.';
          }
        }

        if (isV3) {
          context += '\n\nbrewcode v3: You work through Task API. Call TaskList() to get current task state. DO NOT read phases/ files.';
          log('info', '[session-start]', `v3 task detected at ${taskDir}, injected Task API reminder`, cwd, session_id);
        }
      } else if (source === 'compact' && getActiveTaskPath(cwd)) {
        // Fallback: lock missing/mismatch but TASK.md reference exists (v2 task without lock)
        context += '\n\n[HANDOFF after compact] Re-read PLAN.md and KNOWLEDGE.jsonl, then continue current phase.';
      }
    }

    const modeTag = activeMode ? ` | mode: ${activeMode.name}` : '';
    output({
      systemMessage: `brewcode: ${pluginRoot} | session: ${sessionShort}${modeTag}${versionLines.length ? '\n' + versionLines.join('\n') : ''}`,
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
