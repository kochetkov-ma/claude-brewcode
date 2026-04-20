import path from 'node:path';
import os from 'node:os';
import { safeReadJson, safeWriteJson } from './safe-write.mjs';
import { log as utilsLog } from '../../../hooks/lib/utils.mjs';

const HARDCODED = {
  enabled: false,
  profile: 'medium',
  blacklist: ['debate', 'docs-writer', 'architect'],
};

const VALID_PROFILES = ['light', 'medium', 'aggressive'];
const ENV_ON = ['on', 'enable'];
const ENV_OFF = ['off', 'disable'];

export function log(level, message, cwd, sessionId) {
  utilsLog(level, 'think-short', message, cwd, sessionId);
}

export function getPaths(cwd) {
  const dataRoot = process.env.CLAUDE_PLUGIN_DATA
    || path.join(os.homedir(), '.claude/plugins/data/brewtools-claude-brewcode');
  const globalPath = path.join(dataRoot, 'think-short.json');
  const projectPath = path.join(cwd, '.claude/brewtools/think-short.json');
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  const pluginJsonPath = pluginRoot ? path.join(pluginRoot, '.claude-plugin/plugin.json') : null;
  return { globalPath, projectPath, pluginJsonPath };
}

/**
 * @returns {Promise<{enabled:boolean, profile:string}>}
 */
export async function readPluginDefaults(pluginJsonPath) {
  const fallback = { enabled: false, profile: 'medium' };
  if (!pluginJsonPath) return fallback;
  try {
    const data = await safeReadJson(pluginJsonPath);
    const ts = data && data.config && data.config.think_short;
    if (!ts) return fallback;
    return {
      enabled: typeof ts.default_enabled === 'boolean' ? ts.default_enabled : fallback.enabled,
      profile: VALID_PROFILES.includes(ts.default_profile) ? ts.default_profile : fallback.profile,
    };
  } catch {
    return fallback;
  }
}

function applyEnvOverride(state, cwd) {
  const raw = process.env.THINK_SHORT_DEFAULT;
  if (!raw) return { applied: false, field: null };
  const val = raw.trim().toLowerCase();
  if (ENV_ON.includes(val)) {
    state.enabled = true;
    return { applied: true, field: 'enabled' };
  }
  if (ENV_OFF.includes(val)) {
    state.enabled = false;
    return { applied: true, field: 'enabled' };
  }
  if (VALID_PROFILES.includes(val)) {
    state.profile = val;
    return { applied: true, field: 'profile' };
  }
  log('warn', `Ignoring unknown THINK_SHORT_DEFAULT value: ${raw}`, cwd, null);
  return { applied: false, field: null };
}

/**
 * @returns {Promise<{enabled:boolean, profile:string, blacklist:string[], sources:object, raw:object}>}
 */
export async function resolveEffectiveState(cwd) {
  const { globalPath, projectPath, pluginJsonPath } = getPaths(cwd);
  const pluginDefaults = await readPluginDefaults(pluginJsonPath);
  const global = await safeReadJson(globalPath);
  const project = await safeReadJson(projectPath);

  const sources = {
    enabled: 'hardcoded',
    profile: 'hardcoded',
    blacklist: 'hardcoded',
  };

  const merged = {
    enabled: HARDCODED.enabled,
    profile: HARDCODED.profile,
    blacklist: [...HARDCODED.blacklist],
  };

  if (pluginDefaults) {
    merged.enabled = pluginDefaults.enabled;
    merged.profile = pluginDefaults.profile;
    sources.enabled = 'plugin.json';
    sources.profile = 'plugin.json';
  }

  if (global && typeof global === 'object') {
    if (typeof global.enabled === 'boolean') { merged.enabled = global.enabled; sources.enabled = 'global-state'; }
    if (VALID_PROFILES.includes(global.profile)) { merged.profile = global.profile; sources.profile = 'global-state'; }
    if (Array.isArray(global.blacklist)) { merged.blacklist = global.blacklist; sources.blacklist = 'global-state'; }
  }

  if (project && typeof project === 'object') {
    if (typeof project.enabled === 'boolean') { merged.enabled = project.enabled; sources.enabled = 'project-state'; }
    if (VALID_PROFILES.includes(project.profile)) { merged.profile = project.profile; sources.profile = 'project-state'; }
    if (Array.isArray(project.blacklist)) { merged.blacklist = project.blacklist; sources.blacklist = 'project-state'; }
  }

  const envResult = applyEnvOverride(merged, cwd);
  if (envResult.applied) {
    sources[envResult.field] = 'env';
  }

  return {
    enabled: merged.enabled,
    profile: merged.profile,
    blacklist: merged.blacklist,
    sources,
    raw: {
      global,
      project,
      pluginDefaults,
      env: process.env.THINK_SHORT_DEFAULT || null,
    },
  };
}

async function resolveNonEnvDefaults(cwd) {
  const prevEnv = process.env.THINK_SHORT_DEFAULT;
  delete process.env.THINK_SHORT_DEFAULT;
  try {
    return await resolveEffectiveState(cwd);
  } finally {
    if (prevEnv !== undefined) process.env.THINK_SHORT_DEFAULT = prevEnv;
  }
}

/**
 * @returns {Promise<{path:string, before:object|null, after:object}>}
 */
export async function writeState(scope, patch, cwd) {
  if (scope !== 'global' && scope !== 'project') {
    throw new Error(`Invalid scope: ${scope}`);
  }
  const { globalPath, projectPath } = getPaths(cwd);
  const targetPath = scope === 'global' ? globalPath : projectPath;

  const before = await safeReadJson(targetPath);
  const defaults = await resolveNonEnvDefaults(cwd);

  const base = {
    version: 1,
    enabled: defaults.enabled,
    profile: defaults.profile,
    blacklist: defaults.blacklist,
  };

  const after = {
    ...base,
    ...(before || {}),
    ...patch,
    version: 1,
    updated_at: new Date().toISOString(),
  };

  await safeWriteJson(targetPath, after);
  return { path: targetPath, before, after };
}
