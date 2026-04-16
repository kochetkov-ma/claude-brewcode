import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PREFERRED_MARKETPLACE = 'claude-brewcode';

export function pluginCacheRoot() {
  return path.join(os.homedir(), '.claude/plugins/cache');
}

export function semverCompare(a, b) {
  const pa = String(a).split('.').map(s => parseInt(s.replace(/[^0-9].*$/, ''), 10) || 0);
  const pb = String(b).split('.').map(s => parseInt(s.replace(/[^0-9].*$/, ''), 10) || 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function isSemverDir(name) {
  return /^\d+\.\d+\.\d+/.test(name);
}

function safeReadDir(p) {
  try { return fs.readdirSync(p, { withFileTypes: true }); } catch { return []; }
}

export function enumeratePlugins() {
  const root = pluginCacheRoot();
  const result = new Map();
  for (const mpEntry of safeReadDir(root)) {
    if (!mpEntry.isDirectory()) continue;
    const marketplace = mpEntry.name;
    const mpPath = path.join(root, marketplace);
    for (const plugEntry of safeReadDir(mpPath)) {
      if (!plugEntry.isDirectory()) continue;
      const plugin = plugEntry.name;
      const plugPath = path.join(mpPath, plugin);
      const versions = [];
      for (const v of safeReadDir(plugPath)) {
        if (v.isDirectory() && isSemverDir(v.name)) versions.push(v.name);
      }
      if (versions.length === 0) continue;
      versions.sort(semverCompare);
      const latest = versions[versions.length - 1];
      const entry = {
        marketplace,
        plugin,
        latest,
        path: path.join(plugPath, latest),
        versions
      };
      const existing = result.get(plugin);
      // WHY: prefer claude-brewcode marketplace when same plugin name exists in multiple marketplaces
      if (!existing || (marketplace === PREFERRED_MARKETPLACE && existing.marketplace !== PREFERRED_MARKETPLACE)) {
        result.set(plugin, entry);
      }
    }
  }
  return result;
}

export function resolveTarget(pluginEntry, kind, name) {
  const base = pluginEntry.path;
  if (kind === 'skill') {
    return {
      visible: path.join(base, 'skills', name, 'SKILL.md'),
      hidden: path.join(base, 'skills', name, '_SKILL.md')
    };
  }
  if (kind === 'agent') {
    return {
      visible: path.join(base, 'agents', `${name}.md`),
      hidden: path.join(base, 'agents', `_${name}.md`)
    };
  }
  return null;
}

export function detectKind(pluginEntry, name) {
  const base = pluginEntry.path;
  const skillDir = path.join(base, 'skills', name);
  try {
    if (fs.statSync(skillDir).isDirectory()) return 'skill';
  } catch {}
  const agentVisible = path.join(base, 'agents', `${name}.md`);
  const agentHidden = path.join(base, 'agents', `_${name}.md`);
  if (fs.existsSync(agentVisible) || fs.existsSync(agentHidden)) return 'agent';
  const skillVisible = path.join(skillDir, 'SKILL.md');
  const skillHidden = path.join(skillDir, '_SKILL.md');
  if (fs.existsSync(skillVisible) || fs.existsSync(skillHidden)) return 'skill';
  return null;
}
