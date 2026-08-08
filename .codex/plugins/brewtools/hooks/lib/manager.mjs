import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MODES = new Set(['full', 'planmode', 'architect', 'review-regression', 'review-double']);

function readText(file) {
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
}

function readJson(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

export function state(cwd) {
  const value = readJson(path.join(cwd, '.codex', 'brewtools', 'manager', 'state.json'));
  return {
    hard: value.hard === true,
    level: value.level === 'strict' ? 'strict' : 'balanced'
  };
}

export function prompt(mode, cwd, pluginRoot) {
  if (!MODES.has(mode)) return '';
  const candidates = [
    path.join(cwd, '.codex', 'brewtools', 'manager', 'prompts', `${mode}.md`),
    path.join(os.homedir(), '.codex', 'manager', 'prompts', `${mode}.md`),
    path.join(pluginRoot || '', 'skills', 'manager-setup', 'references', `${mode}.md`),
    path.join(pluginRoot || '', '.codex', 'skills', 'manager-setup', 'references', `${mode}.md`)
  ];
  for (const candidate of candidates) {
    const value = readText(candidate);
    if (value) return value;
  }
  return '';
}
