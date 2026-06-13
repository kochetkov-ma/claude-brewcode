// brewtools:manager — resolve Manager mode prompt text.
// Resolution chain (mode = 'full' | 'planmode'):
//   project:  <cwd>/.claude/brewtools/manager/prompts/<mode>.md
//   global:   ~/.claude/manager/prompts/<mode>.md
//   default:  <pluginRoot>/skills/manager/references/<mode>.md
// Injected text = inside fenced ``` or ~~~ blocks if present (concatenated in order),
// else the whole file (raw-text fallback). Lets unfenced overrides work too.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const VALID_SCOPES = new Set(['project', 'global']);
export const VALID_MODES = new Set(['full', 'planmode']);

function resolveHome(p) {
  if (!p) return p;
  if (p === '~') return process.env.HOME || os.homedir();
  if (p.startsWith('~/')) return path.join(process.env.HOME || os.homedir(), p.slice(2));
  return p;
}

/**
 * Resolve a prompt file path for a scope.
 * @param {string} scope - 'project' | 'global'
 * @param {string} mode - 'full' | 'planmode'
 * @param {string} cwd
 * @returns {string} absolute path
 */
export function resolvePromptPath(scope, mode, cwd = process.cwd()) {
  if (!VALID_SCOPES.has(scope)) throw new Error(`invalid scope '${scope}' — must be one of: ${[...VALID_SCOPES].join(', ')}`);
  if (!VALID_MODES.has(mode)) throw new Error(`invalid mode '${mode}' — must be one of: ${[...VALID_MODES].join(', ')}`);
  if (scope === 'global') return resolveHome(`~/.claude/manager/prompts/${mode}.md`);
  return path.join(cwd, '.claude', 'brewtools', 'manager', 'prompts', `${mode}.md`);
}

function readSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

// Extract text inside all fenced ``` or ~~~ blocks, concatenated in document order
// (blank-line separated). If none found, return the raw text trimmed.
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

/**
 * Resolve the prompt text for a mode.
 * @param {string} mode - 'full' | 'planmode'
 * @param {string} cwd
 * @param {string} pluginRoot - CLAUDE_PLUGIN_ROOT
 * @returns {{text:string, source:'project'|'global'|'default'|'missing'}}
 */
export function resolvePrompt(mode, cwd = process.cwd(), pluginRoot) {
  if (!VALID_MODES.has(mode)) return { text: '', source: 'missing' };
  try {
    const project = readSafe(resolvePromptPath('project', mode, cwd));
    if (project != null) return { text: extractFenced(project), source: 'project' };

    const global = readSafe(resolvePromptPath('global', mode, cwd));
    if (global != null) return { text: extractFenced(global), source: 'global' };

    if (pluginRoot) {
      const defPath = path.join(pluginRoot, 'skills', 'manager', 'references', `${mode}.md`);
      const def = readSafe(defPath);
      if (def != null) return { text: extractFenced(def), source: 'default' };
    }
    return { text: '', source: 'missing' };
  } catch {
    return { text: '', source: 'missing' };
  }
}
