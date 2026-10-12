#!/usr/bin/env node
// brewcode-meta: version=6.4.0 content_version=6.0.0 generated_by=brewtools:agent-return-setup
/**
 * agent-return-budget — shared config, thresholds and return contract
 * (Node built-ins only). Never invoked directly; imported by the pair.
 *
 * Single source of truth:
 *   agent-return-contract.mjs (SubagentStart) states the contract,
 *   agent-return-guard.mjs    (SubagentStop + PreToolUse SubagentHandback)
 *                             enforces the same numbers.
 * Both import from here so the announced budget and the enforced budget can
 * never drift apart.
 *
 * Sizing is a length heuristic, NOT a tokenizer: the measured distribution the
 * thresholds were derived from (80 real subagent returns) was computed with
 * chars/4, so anything more accurate would move the boundaries off the data.
 * Moving away from chars/4 means re-fitting PASS/FILE in the same change.
 *
 * ENABLE GATE: `enabled` must be exactly `true` in the config; a missing config
 * file means the feature is OFF. Same contract as agent-deadline.
 *
 * THRESHOLD PRECEDENCE, per threshold, first hit wins:
 *   1. config key   `passTokens` / `fileTokens`   (positive integer only)
 *   2. env var      AGENT_RETURN_PASS / AGENT_RETURN_FILE   (via intEnv)
 *   3. built-in     2500 / 6000
 *
 * Config, thresholds and the read-only list resolve ONCE at module load, not
 * per call: a hook process lives for exactly one invocation. The contract text
 * takes the agent type as its only input, so a read-only agent is never told
 * to write a file. Config discovery keys on process.cwd() (the dir Claude Code
 * spawns the hook in) rather than the payload `cwd`.
 *
 * GLOBAL CONFIG: $CLAUDE_CONFIG_DIR/agent-return.json when that variable is
 * set, then ~/.claude/agent-return.json. The second step keeps a profile whose
 * settings register the hooks, but whose config lives in ~/.claude, enabled.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MAX_CONFIG_CLIMB = 16;
const CONFIG_NAME = 'agent-return.json';
const STATE_NAME = 'agent-return-state';
const READ_ONLY_DEFAULT = ['Explore', 'Plan'];

/**
 * Project root, canonical recipe (D1 Q5): CLAUDE_PROJECT_DIR -> upward walk for
 * a `.git`/`.claude` marker -> hook cwd. Never throws. Exported so the guard
 * resolves the report destination from the SAME root this module reads the
 * config from — a guard that finds the config and a budget module that does not
 * is worse than either being wrong consistently.
 * `hookCwd` is the payload cwd where one exists; this module has no payload and
 * calls it with nothing.
 * @param {string} [hookCwd]
 * @returns {string} absolute root
 */
export function projectRoot(hookCwd) {
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (env && existsSync(env)) return path.resolve(env);

  let dir = path.resolve(hookCwd || process.cwd());
  for (;;) {
    if (existsSync(path.join(dir, '.git')) || existsSync(path.join(dir, '.claude'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return path.resolve(hookCwd || process.cwd());
}

/** ~4 chars per token. Deliberately crude; see the module note. */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Positive integer from env, anything else -> fallback. Number(), not
 * parseInt(): parseInt("1.7") is 1 and parseInt("12abc") is 12, so a typo'd
 * threshold used to be accepted as a plausible number instead of ignored.
 */
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

/**
 * Nearest project config wins over global; absent/invalid config = feature off.
 * Discovery STARTS at projectRoot(), not at the raw cwd: `claude` started from a
 * subdirectory reports that subdirectory as cwd, so a root-level config was
 * invisible past MAX_CONFIG_CLIMB levels — and `CLAUDE_PROJECT_DIR`, the only
 * route to a root with no marker, was unreachable behind an always-truthy
 * `process.cwd()`. The climb is kept for a root with neither `.git` nor
 * `.claude`, where projectRoot() falls back to cwd. A malformed project file is
 * not an object and is skipped, so the global config takes over.
 */
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

/** True when `agentType` is listed as having no file-writing tool. Exact match. */
export function isReadOnly(agentType) {
  return typeof agentType === 'string' && READ_ONLY.includes(agentType);
}

/**
 * Injected into every subagent at SubagentStart: the budget, its reason, and
 * what to do with detail that does not fit — per agent type, never a file order to a read-only one.
 */
export function returnContract(agentType) {
  const overflow = isReadOnly(agentType)
    ? `This agent cannot write files: return the essential part and name what you left out.`
    : `Detail beyond ~${FILE} tokens: write it under \`.claude/reports/YYYYMMDD-HHMMSS_<name>/\` ` +
      `and return the path plus a summary; without a write tool, return the essential part and ` +
      `name what you left out.`;
  return (
    `Return budget (agent-return guard): your report lands in the caller's finite context. ` +
    `Keep it under ~${PASS} tokens (~${PASS * 4} chars): verdict first, \`path:line\` refs, ` +
    `no file bodies, command output or logs. ${overflow} ` +
    `An over-budget report is returned to you once to shorten.`
  );
}
