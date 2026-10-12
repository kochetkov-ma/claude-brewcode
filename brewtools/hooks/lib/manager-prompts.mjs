// brewtools:manager-setup — Manager prompt text: `<project root>/.claude/brewtools/manager/prompts/<mode>.md`
// -> `<config dir>/manager/prompts/<mode>.md` -> `<pluginRoot>/skills/manager-setup/references/<mode>.md`.

import fs from 'node:fs';
import path from 'node:path';
import { configDir } from './manager-state.mjs';

const VALID_SCOPES = new Set(['project', 'global']);
// 'planmode' is hook-internal (++m when permission_mode === 'plan'), not a codeword;
// it stays resolvable for the plan-aware ++m and the status explainer.
export const VALID_MODES = new Set(['full', 'planmode', 'cron-plan', 'architect', 'review-regression', 'review-double']);

/** Absolute prompt path for scope 'project' (under cwd) | 'global' (config dir = CLAUDE_CONFIG_DIR, unset = ~/.claude) */
export function resolvePromptPath(scope, mode, cwd = process.cwd()) {
  if (!VALID_SCOPES.has(scope)) throw new Error(`invalid scope '${scope}' — must be one of: ${[...VALID_SCOPES].join(', ')}`);
  if (!VALID_MODES.has(mode)) throw new Error(`invalid mode '${mode}' — must be one of: ${[...VALID_MODES].join(', ')}`);
  if (scope === 'global') return path.join(configDir(), 'manager', 'prompts', `${mode}.md`);
  return path.join(cwd, '.claude', 'brewtools', 'manager', 'prompts', `${mode}.md`);
}

function readSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

// Text inside all ``` or ~~~ fences, in order, blank-line joined; no fence -> whole file trimmed
// (unfenced overrides work too).
function extractFenced(raw) {
  const blocks = [];
  const re = /(?:```|~~~)[^\n]*\n([\s\S]*?)\n?(?:```|~~~)/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    blocks.push(m[1].replace(/\n+$/, ''));
  }
  if (blocks.length === 0) return raw.trim();
  return blocks.join('\n\n').trim();
}

/** Prompt text for a mode -> {text, source: 'project'|'global'|'default'|'missing'}; cwd = project root */
export function resolvePrompt(mode, cwd = process.cwd(), pluginRoot) {
  if (!VALID_MODES.has(mode)) return { text: '', source: 'missing' };
  try {
    const project = readSafe(resolvePromptPath('project', mode, cwd));
    if (project != null) return { text: extractFenced(project), source: 'project' };

    const global = readSafe(resolvePromptPath('global', mode, cwd));
    if (global != null) return { text: extractFenced(global), source: 'global' };

    if (pluginRoot) {
      const defPath = path.join(pluginRoot, 'skills', 'manager-setup', 'references', `${mode}.md`);
      const def = readSafe(defPath);
      if (def != null) return { text: extractFenced(def), source: 'default' };
    }
    return { text: '', source: 'missing' };
  } catch {
    return { text: '', source: 'missing' };
  }
}
