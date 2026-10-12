#!/usr/bin/env node
// SessionStart: status line + update check; source 'clear' links .claude/plans/LATEST.md -> plan < 60 s old.
import {
  readStdin, output, log, getState, saveState, projectRoot, resolvePlansDir, latestPlanLink, ownsPlanTarget
} from './lib/utils.mjs';
import { readFileSync, readdirSync, statSync, lstatSync, readlinkSync, mkdirSync, symlinkSync, unlinkSync, existsSync, realpathSync } from 'fs';
import { join, dirname, basename, resolve } from 'path';
import { fileURLToPath } from 'url';

const VERSION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PLAN_FRESHNESS_MS = 60_000;
const RELEASES_URL = 'https://github.com/kochetkov-ma/claude-brewcode/releases/latest';
const RELEASES_API = 'https://api.github.com/repos/kochetkov-ma/claude-brewcode/releases/latest';

// Frees LATEST.md only when it is our symlink (`ownsPlanTarget`); file/dir/foreign symlink kept + logged.
// True = free to symlink.
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

  if (!ownsPlanTarget(root, target, plansDir)) {
    return preserve(`foreign symlink target ${target} outside ${plansDir}`);
  }

  try {
    unlinkSync(latestLink);
    return true;
  } catch (e) {
    return preserve(`unlink failed (${e.message})`);
  }
}

// Links <root>/.claude/plans/LATEST.md -> newest plan if < 60 s old and the path is free or ours.
// Returns linked plan file name, else null.
export function linkLatestPlan(root, sessionId = null) {
  const plansDir = resolvePlansDir(root, sessionId);
  const latestLink = latestPlanLink(root);
  const projectPlansDir = dirname(latestLink);

  if (!existsSync(plansDir)) return null;

  const plans = readdirSync(plansDir)
    .filter(f => f.endsWith('.md') && f !== basename(latestLink))
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
  // Recorded target = ownership proof that survives a switch to another config dir (profile).
  saveState(root, { ...getState(root), _planLink: latest.path });

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

    // 24h TTL cache. `fetchedAtMs` = epoch-ms runtime marker, not artifact provenance
    // (`checkedAt`/`last_updated` are reserved: setup-status/references/artifact-metadata.md).
    const state = getState(cwd);
    const cache = state._versionCache?.brewcode;
    if (cache?.remote && cache?.fetchedAtMs) {
      const age = Date.now() - cache.fetchedAtMs;
      if (age < VERSION_CACHE_TTL_MS) {
        log('debug', '[version]', `Using cached brewcode remote=${cache.remote} (age=${Math.round(age / 60000)}m)`, cwd, sessionId);
        return { updateAvailable: isNewer(cache.remote, local), local, remote: cache.remote };
      }
    }

    const data = await fetchJson(RELEASES_API, 1000);
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

async function main() {
  let cwd = null;
  let session_id = null;

  try {
    cwd = projectRoot(null);
    const input = await readStdin();
    session_id = input.session_id;
    // Stable project root for every stateful path (config, state, log, plan link);
    // input.cwd stays a hint only - it moves mid-session.
    cwd = projectRoot(input.cwd);
    const source = input.source;
    // Not every event carries permission_mode; the SessionStart doc example has none -> presence-guarded.
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

    // Local version comes from CLAUDE_PLUGIN_ROOT, so any config/cache dir is covered. Never throws.
    const version = pluginRoot ? await checkLatestVersion(pluginRoot, cwd, session_id) : undefined;
    let versionLine = '';
    if (version === null) {
      versionLine = `\ncheck brewcode updates: ${RELEASES_URL}`;
    } else if (version?.updateAvailable) {
      versionLine = `\nUPDATE brewcode ${version.local} → ${version.remote}: ${RELEASES_URL}`;
    }

    // User-facing only (systemMessage): this hook has nothing to tell the model.
    const permTag = permMode ? ` | perm: ${permMode}` : '';
    output({
      systemMessage: `brewcode: ${pluginRoot} | session: ${sessionShort}${permTag}${versionLine}`
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
