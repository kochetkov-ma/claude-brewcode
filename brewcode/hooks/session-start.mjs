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
 * - Plans dir honours the `plansDirectory` setting (docs/settings.md:308)
 * - LATEST.md is replaced ONLY when it is a symlink into that plans dir; a user
 *   file, a directory or a foreign symlink is preserved and logged as a conflict
 *
 * Cleanup: /brewcode:teardown removes .claude/plans/ directory
 */
import { readStdin, output, log, getState, saveState, projectRoot } from './lib/utils.mjs';
import { readFileSync, readdirSync, statSync, lstatSync, readlinkSync, mkdirSync, symlinkSync, unlinkSync, existsSync, realpathSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const VERSION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const PLAN_FRESHNESS_MS = 60_000;

const LATEST_LINK_NAME = 'LATEST.md';

/** `~/x` -> home-relative, anything else -> project-root-relative (docs/settings.md:308) */
function expandPath(p, root) {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return resolve(root, p);
}

/**
 * Where Claude Code stores plan files: `plansDirectory` in settings precedence
 * (local > project > user), default `~/.claude/plans`.
 */
export function resolvePlansDir(root, sessionId = null) {
  const candidates = [
    join(root, '.claude', 'settings.local.json'),
    join(root, '.claude', 'settings.json'),
    join(homedir(), '.claude', 'settings.json')
  ];
  for (const file of candidates) {
    try {
      if (!existsSync(file)) continue;
      const value = JSON.parse(readFileSync(file, 'utf8')).plansDirectory;
      if (typeof value === 'string' && value.length > 0) return expandPath(value, root);
    } catch (e) {
      log('warn', '[session-start]', `Ignoring unreadable settings ${file}: ${e.message}`, root, sessionId);
    }
  }
  return join(homedir(), '.claude', 'plans');
}

/**
 * Clear the way for a fresh LATEST.md symlink WITHOUT destroying anything this hook
 * did not create: only a symlink whose target resolves inside `plansDir` is removed.
 * A regular file, a directory or a foreign symlink is preserved and reported.
 * @returns {boolean} true when the path is free to be symlinked
 */
function claimLatestLink(latestLink, plansDir, root, sessionId) {
  const preserve = (why) => {
    log('warn', '[session-start]', `Preserved ${latestLink}: ${why}`, root, sessionId);
    return false;
  };

  let st;
  try {
    st = lstatSync(latestLink);
  } catch (e) {
    if (e.code === 'ENOENT') return true;
    return preserve(`cannot stat (${e.message})`);
  }

  if (!st.isSymbolicLink()) return preserve('not a symlink created by brewcode - plan link skipped');

  let target;
  try {
    target = resolve(dirname(latestLink), readlinkSync(latestLink));
  } catch (e) {
    return preserve(`cannot read symlink target (${e.message})`);
  }

  if (target !== plansDir && !target.startsWith(plansDir + sep)) {
    return preserve(`foreign symlink target ${target} outside ${plansDir}`);
  }

  try {
    unlinkSync(latestLink);
    return true;
  } catch (e) {
    return preserve(`unlink failed (${e.message})`);
  }
}

/**
 * Creates symlink <root>/.claude/plans/LATEST.md → <plansDir>/<newest>.md
 * Only if newest plan is < 60 seconds old (fresh from Plan Mode) and the link path
 * is free or holds a symlink this hook owns.
 * @returns {string|null} Linked plan file name, or null when nothing was linked
 */
export function linkLatestPlan(root, sessionId = null) {
  const plansDir = resolvePlansDir(root, sessionId);
  const projectPlansDir = join(root, '.claude', 'plans');
  const latestLink = join(projectPlansDir, LATEST_LINK_NAME);

  if (!existsSync(plansDir)) return null;

  const plans = readdirSync(plansDir)
    .filter(f => f.endsWith('.md') && f !== LATEST_LINK_NAME)
    .map(f => {
      try {
        const p = join(plansDir, f);
        return { name: f, path: p, mtime: statSync(p).mtime };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);

  if (plans.length === 0) return null;

  const latest = plans[0];
  const ageMs = Date.now() - latest.mtime.getTime();

  if (ageMs > PLAN_FRESHNESS_MS) return null;

  // Containment: mkdirSync/symlinkSync FOLLOW a symlinked .claude/plans and would
  // write LATEST.md outside the project root. claimLatestLink only guards the link.
  try {
    if (lstatSync(projectPlansDir).isSymbolicLink()) {
      log('warn', '[session-start]', `Preserved ${projectPlansDir}: plans dir is a symlink outside the project - plan link skipped`, root, sessionId);
      return null;
    }
  } catch { /* ENOENT: mkdirSync creates it below */ }

  mkdirSync(projectPlansDir, { recursive: true });

  if (!claimLatestLink(latestLink, plansDir, root, sessionId)) return null;

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

    // Check 24h TTL cache. `fetchedAtMs` is an epoch-ms runtime marker, deliberately NOT
    // `checkedAt` / `last_updated`: `checkedAt` is a retired provenance spelling
    // (setup-status/references/artifact-metadata.md §8) and this is ephemeral state, never
    // artifact provenance (§9). An old cache carrying the former simply misses and refetches.
    const state = getState(cwd);
    const cache = state._versionCache?.brewcode;
    if (cache?.remote && cache?.fetchedAtMs) {
      const age = Date.now() - cache.fetchedAtMs;
      if (age < VERSION_CACHE_TTL_MS) {
        log('debug', '[version]', `Using cached brewcode remote=${cache.remote} (age=${Math.round(age / 60000)}m)`, cwd, sessionId);
        return { updateAvailable: isNewer(cache.remote, local), local, remote: cache.remote };
      }
    }

    const url = 'https://api.github.com/repos/kochetkov-ma/claude-brewcode/releases/latest';
    const data = await fetchJson(url, 1000);
    if (!data) {
      log('debug', '[version]', `GitHub API fetch failed (timeout or error)`, cwd, sessionId);
      // Fallback to stale cache if available
      if (cache?.remote) {
        log('debug', '[version]', `Falling back to stale cache: remote=${cache.remote}`, cwd, sessionId);
        return { updateAvailable: isNewer(cache.remote, local), local, remote: cache.remote };
      }
      return { updateAvailable: false, local, remote: null, remoteFailed: true };
    }

    const remote = (data.tag_name || '').replace(/^v/, '');
    if (!remote) {
      log('debug', '[version]', `GitHub tag_name missing: ${JSON.stringify(data.tag_name)}`, cwd, sessionId);
      return { updateAvailable: false, local, remote: null, remoteFailed: true };
    }

    // Update cache
    const updatedState = getState(cwd);
    updatedState._versionCache = updatedState._versionCache || {};
    updatedState._versionCache.brewcode = { remote, fetchedAtMs: Date.now() };
    saveState(cwd, updatedState);

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

    // Check 24h TTL cache
    const state = getState(cwd);
    const cache = state._versionCache?.claudeCode;
    if (cache?.remote && cache?.fetchedAtMs) {
      const age = Date.now() - cache.fetchedAtMs;
      if (age < VERSION_CACHE_TTL_MS) {
        log('debug', '[version]', `Using cached claude-code remote=${cache.remote} (age=${Math.round(age / 60000)}m)`, cwd, sessionId);
        return { updateAvailable: isNewer(cache.remote, local), local, remote: cache.remote };
      }
    }

    const url = 'https://registry.npmjs.org/@anthropic-ai/claude-code/latest';
    const data = await fetchJson(url, 1000);
    if (!data?.version) {
      log('debug', '[version]', `npm fetch failed or no version in response`, cwd, sessionId);
      // Fallback to stale cache if available
      if (cache?.remote) {
        log('debug', '[version]', `Falling back to stale cache: remote=${cache.remote}`, cwd, sessionId);
        return { updateAvailable: isNewer(cache.remote, local), local, remote: cache.remote };
      }
      return null;
    }

    // Update cache
    const updatedState = getState(cwd);
    updatedState._versionCache = updatedState._versionCache || {};
    updatedState._versionCache.claudeCode = { remote: data.version, fetchedAtMs: Date.now() };
    saveState(cwd, updatedState);

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
    cwd = projectRoot(null);
    const input = await readStdin();
    session_id = input.session_id;
    // Stable project root for every stateful path (config, state, log, plan link);
    // input.cwd stays a hint only - it moves mid-session (docs/hooks.md:717).
    cwd = projectRoot(input.cwd);
    const source = input.source;
    // permission_mode: DOC-VERIFIED common field (2.1.223). Presence-guarded use below.
    const permMode = input.permission_mode;

    log('info', '[session-start]', `Started: ${session_id?.slice(0, 8) || 'unknown'} (${source}${permMode ? ', ' + permMode : ''})`, cwd, session_id);

    if (source === 'clear') {
      try {
        const linked = linkLatestPlan(cwd, session_id);
        if (linked) {
          log('info', '[session-start]', `Linked: .claude/plans/LATEST.md -> ${linked}`, cwd, session_id);
        }
      } catch (e) {
        log('warn', '[session-start]', `Plan linking failed: ${e.message}`, cwd, session_id);
      }
    }

    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '';
    const sessionShort = session_id?.slice(0, 8) || 'unknown';

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

    // reloadSkills not set: this hook toggles no skill files
    // No additionalContext: version/plan info is user-facing (systemMessage) only;
    // there is nothing model-facing to inject now that root/mode payloads are gone.
    const permTag = permMode ? ` | perm: ${permMode}` : '';
    output({
      systemMessage: `brewcode: ${pluginRoot} | session: ${sessionShort}${permTag}${versionLines.length ? '\n' + versionLines.join('\n') : ''}`
    });
  } catch (error) {
    log('error', '[session-start]', `Error: ${error.message}`, cwd, session_id);
    output({});
  }
}

/** Run only when executed as a hook; importing (tests) must not consume stdin. Doubt -> run. */
function invokedDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return true;
  }
}

if (invokedDirectly()) main();
