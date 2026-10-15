import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLACEHOLDERS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'brewmod-placeholders', 'placeholders');

// Port of brewmod-placeholders hooks/lib/defs.ts extractFenced: text inside all fences, blank-line joined; no fence -> trimmed raw.
function extractFenced(raw) {
  const blocks = [];
  for (const m of raw.matchAll(/(?:```|~~~)[^\n]*\n([\s\S]*?)\n?(?:```|~~~)/g)) blocks.push((m[1] ?? '').replace(/\n+$/, ''));
  return blocks.length === 0 ? raw.trim() : blocks.join('\n\n').trim();
}

// Port of defs.ts splitFrontMatter: first non-blank `---` line to the next `---` line; no opening -> null.
function splitFrontMatter(raw) {
  const src = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const open = /^(?:[ \t]*\r?\n)*---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!open) return null;
  let pos = open[0].length;
  while (pos <= src.length) {
    const nl = src.indexOf('\n', pos);
    const end = nl === -1 ? src.length : nl;
    if (/^---[ \t]*$/.test(src.slice(pos, end).replace(/\r$/, ''))) return nl === -1 ? '' : src.slice(nl + 1);
    if (nl === -1) break;
    pos = nl + 1;
  }
  throw new Error('front matter is not closed');
}

// Body of the brewmod-placeholders default `<name>.md`, parsed the way the mod does (front matter dropped, fenced extract).
export function readModDefault(name) {
  const file = path.join(PLACEHOLDERS_DIR, `${name}.md`);
  if (!fs.existsSync(file)) throw new Error(`brewmod-placeholders default not found: ${file}`);
  const raw = fs.readFileSync(file, 'utf8');
  const body = splitFrontMatter(raw);
  return extractFenced(body === null ? raw : body);
}
