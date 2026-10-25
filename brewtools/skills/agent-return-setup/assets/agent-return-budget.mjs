#!/usr/bin/env node
// brewcode-meta: version=6.12.3 content_version=6.5.2 generated_by=brewtools:agent-return-setup

// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

// agent-return shared config + thresholds, imported by contract and guard so announced == enforced budget.
// Per threshold: config `passTokens`/`fileTokens` > AGENT_RETURN_PASS/_FILE > 2500/6000; resolved once at load.
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MAX_CONFIG_CLIMB = 16;
const CONFIG_NAME = 'agent-return.json';
const STATE_NAME = 'agent-return-state';
const READ_ONLY_DEFAULT = ['Explore', 'Plan'];
const REPORT_DIR_DEFAULT = '.claude/reports';

// Mirrors semble isProfileParent: HOME or the active config dir's parent holds a profile .claude, never a root.
function isProfileParent(dir) {
  const real = (p) => { try { return realpathSync(p); } catch { return ''; } };
  const p = real(dir);
  if (!p) return false;
  if (process.env.HOME && real(process.env.HOME) === p) return true;
  const cfg = process.env.CLAUDE_CONFIG_DIR;
  return Boolean(cfg) && real(cfg) === path.join(p, '.claude');
}

// Project root: CLAUDE_PROJECT_DIR -> upward walk for `.git`/`.claude` (profile parents skipped) -> hook cwd; never throws.
// Exported so the guard's report dir uses the same root as config discovery.
export function projectRoot(hookCwd) {
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (env && existsSync(env)) return path.resolve(env);

  let dir = path.resolve(hookCwd || process.cwd());
  for (;;) {
    if (existsSync(path.join(dir, '.git'))) return dir;
    if (existsSync(path.join(dir, '.claude')) && !isProfileParent(dir)) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return path.resolve(hookCwd || process.cwd());
}

/** chars/4, not a tokenizer: thresholds were fitted on chars/4 (change both together) */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// Positive integer from env, else fallback; Number(), not parseInt() ("12abc" must not read as 12).
function intEnv(name, fallback) {
  const raw = process.env[name];
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// Climb from projectRoot() (never raw cwd); nearest object config wins, then $CLAUDE_CONFIG_DIR, then
// ~/.claude; `enabled` must be exactly true, none = off.
function loadConfig() {
  const globals = globalDirs();
  let dir = projectRoot();
  for (let i = 0; i < MAX_CONFIG_CLIMB; i++) {
    const home = path.join(dir, '.claude');
    // ~/.claude met on the climb is the GLOBAL scope: leave it to globalDirs() order.
    if (globals.includes(home)) break;
    const cfg = readJson(path.join(home, CONFIG_NAME));
    // An array is a JSON object to typeof; accepting one froze the walk on a file
    // that can never carry `enabled`, silently disabling the feature.
    if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) return { cfg, home };
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const home of globals) {
    const cfg = readJson(path.join(home, CONFIG_NAME));
    if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) return { cfg, home };
  }
  return null;
}

/** Global config dirs, nearest first: $CLAUDE_CONFIG_DIR when set, then ~/.claude. */
function globalDirs() {
  const dirs = [];
  const env = process.env.CLAUDE_CONFIG_DIR;
  if (typeof env === 'string' && env.trim()) dirs.push(path.resolve(env));
  try {
    const legacy = path.join(os.homedir(), '.claude');
    if (!dirs.includes(legacy)) dirs.push(legacy);
  } catch {
    // homedir unavailable -> project config and CLAUDE_CONFIG_DIR only
  }
  return dirs;
}

/** Config key > env var > built-in default. Validation lives here, not in intEnv. */
function threshold(cfg, key, envName, fallback) {
  const v = cfg ? cfg[key] : undefined;
  if (Number.isInteger(v) && v > 0) return v;
  return intEnv(envName, fallback);
}

let LOADED = null;
try {
  LOADED = loadConfig();
} catch {
  LOADED = null; // unreadable filesystem -> feature off, never a throw at import
}
const CONFIG = LOADED ? LOADED.cfg : null;

/** Exactly `true` enables; no config file at all = disabled. */
export const ENABLED = !!CONFIG && CONFIG.enabled === true;
/** Pass ceiling, ~p78 of the measured returns: a full structured report fits under it. */
export const PASS = threshold(CONFIG, 'passTokens', 'AGENT_RETURN_PASS', 2500);
/** Past this, compression loses content — the detail belongs in a file. */
export const FILE = threshold(CONFIG, 'fileTokens', 'AGENT_RETURN_FILE', 6000);
/** Once-per-agent markers live beside the config that enabled the feature. */
export const STATE_DIR = LOADED ? path.join(LOADED.home, STATE_NAME) : '';

/** Config `readOnlyAgentTypes` (any array, `[]` = nobody) > built-in Explore/Plan. */
const READ_ONLY = Array.isArray(CONFIG && CONFIG.readOnlyAgentTypes)
  ? CONFIG.readOnlyAgentTypes.filter((v) => typeof v === 'string')
  : READ_ONLY_DEFAULT;

/** Config `reportDir`: absolute, `~/`-prefixed or project-root-relative; else `.claude/reports`. */
function reportDir(cfg) {
  const v = cfg ? cfg.reportDir : undefined;
  if (typeof v !== 'string' || v.includes('\0')) return REPORT_DIR_DEFAULT;
  let d = v.trim().replace(/[\\/]+$/, '');
  try {
    if (d === '~' || d.startsWith('~/')) d = path.join(os.homedir(), d.slice(1));
  } catch {
    d = '';
  }
  return d || REPORT_DIR_DEFAULT;
}

/** Long-report base as configured; the guard anchors a relative one at projectRoot(). */
export const REPORT_DIR = reportDir(CONFIG);

/** Absolute report base; a root that cannot be resolved keeps the configured text. */
export function reportBase(hookCwd) {
  if (path.isAbsolute(REPORT_DIR)) return REPORT_DIR;
  try {
    return path.join(projectRoot(typeof hookCwd === 'string' ? hookCwd : ''), REPORT_DIR);
  } catch {
    return REPORT_DIR;
  }
}

/** True when `agentType` is listed as having no file-writing tool. Exact match. */
export function isReadOnly(agentType) {
  return typeof agentType === 'string' && READ_ONLY.includes(agentType);
}

/** SubagentStart text: budget, reason, overflow handling; never a file order to a read-only agent */
export function returnContract(agentType) {
  const overflow = isReadOnly(agentType)
    ? `This agent cannot write files: return the essential part and name what you left out.`
    : `Detail beyond ~${FILE} tokens: write it under \`${REPORT_DIR}/YYYYMMDD-HHMMSS_<name>/\` ` +
      `and return the path plus a summary. No write tool, or the write is denied: never retry ` +
      `it, return a compressed inline report with the essential part and name what you left out.`;
  return (
    `Return budget (agent-return guard): your report lands in the caller's finite context. ` +
    `Keep it under ~${PASS} tokens (~${PASS * 4} chars): verdict first, \`path:line\` refs, ` +
    `no file bodies, command output or logs. ${overflow} ` +
    `An over-budget report is returned to you once to shorten.`
  );
}
