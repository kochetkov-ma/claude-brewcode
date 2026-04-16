import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const DEFAULT_STATE = Object.freeze({ version: 1, updated_at: null, disabled: {} });

export function globalStatePath() {
  const base = process.env.CLAUDE_PLUGIN_DATA
    || path.join(os.homedir(), '.claude/plugins/data/brewtools-claude-brewcode');
  return path.join(base, 'toggle-state.json');
}

export function projectStatePath(cwd) {
  return path.join(cwd, '.claude', 'brewtools', 'toggle-state.json');
}

export function stateKey(plugin, name) {
  return `${plugin}:${name}`;
}

function cloneDefault() {
  return { version: 1, updated_at: null, disabled: {} };
}

export function readState(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return cloneDefault();
    return {
      version: parsed.version ?? 1,
      updated_at: parsed.updated_at ?? null,
      disabled: (parsed.disabled && typeof parsed.disabled === 'object') ? parsed.disabled : {}
    };
  } catch {
    return cloneDefault();
  }
}

export function writeStateAtomic(filePath, state) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const stamped = {
    version: state.version ?? 1,
    updated_at: new Date().toISOString(),
    disabled: state.disabled ?? {}
  };
  const tmp = `${filePath}.tmp.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tmp, JSON.stringify(stamped, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
  return stamped;
}

export function mergeStates(globalState, projectState) {
  const g = (globalState && globalState.disabled) || {};
  const p = (projectState && projectState.disabled) || {};
  return { disabled: { ...g, ...p } };
}
