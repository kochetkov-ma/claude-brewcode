import fs from 'node:fs';
import path from 'node:path';

// Link targets, url = first defined group: inline `](url "t")`, reference `[r]: url`, `<img src>`/`<a href>`.
// Unsupported: `>` inside an attribute value (alt), `srcset`, angle-bracket paths with spaces.
const LINK_PATTERNS = [
  /\]\(\s*<?([^\s()<>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/dg,
  /^[ \t]*(?:>[ \t]*)*\[(?!\^)[^\]\n]+\]:[ \t]*<?([^\s<>]+)>?/dgm,
  /<(?:img|a)\b[^>]*?\s(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/dgi
];
// Fence opener/closer at any indent (list items) and quote depth: 1 = prefix, 2 = fence run, 3 = info.
const FENCE = /^([ \t]*(?:>[ \t]*)*)(`{3,}|~{3,})(.*)$/;

const blank = (value) => value.replace(/[^\n]/g, ' ');

// Closing run of exactly `size` backticks before the paragraph ends, or -1 (literal backticks).
function codeSpanEnd(text, start, size) {
  const paragraphBreak = /\n[ \t]*\n/g;
  paragraphBreak.lastIndex = start;
  const limit = paragraphBreak.exec(text)?.index ?? text.length;
  const closer = /`+/g;
  closer.lastIndex = start + size;
  for (let match = closer.exec(text); match && match.index < limit; match = closer.exec(text)) {
    if (match[0].length === size) return match.index + size;
  }
  return -1;
}

// One left-to-right pass: leftmost inline code span or HTML comment wins; unclosed = literal.
function maskSpans(text) {
  const opener = /<!--|`+/g;
  let output = '';
  let cursor = 0;
  for (let match = opener.exec(text); match; match = opener.exec(text)) {
    const close = match[0] === '<!--' ? text.indexOf('-->', match.index + 4) : -1;
    const end = match[0] === '<!--' ? (close < 0 ? -1 : close + 3) : codeSpanEnd(text, match.index, match[0].length);
    if (end < 0) continue;
    output += text.slice(cursor, match.index) + blank(text.slice(match.index, end));
    cursor = end;
    opener.lastIndex = end;
  }
  return output + text.slice(cursor);
}

// Fenced blocks, inline code spans and HTML comments never render links: blank them, offsets kept.
function maskNonLinkText(text) {
  let fence = null;
  const lines = text.split('\n').map((line) => {
    const match = line.match(FENCE);
    if (fence) {
      if (match && match[2][0] === fence[0] && match[2].length >= fence.length && !match[3].trim()) fence = null;
      return blank(line);
    }
    if (!match || (match[2][0] === '`' && match[3].includes('`'))) return line;
    fence = match[2];
    return blank(line);
  });
  return maskSpans(lines.join('\n'));
}

// Template placeholders (`{name}`) are not repo paths: skipped by the check and the rebase alike.
function isRepoRelative(url, target) {
  return target !== '' && !/^[#/]/.test(url) && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(url) && !/[{}]/.test(target);
}

// Every relative link target in rendered markdown: { start, end, url, target, suffix }.
export function relativeLinks(text) {
  const masked = maskNonLinkText(text);
  const links = [];
  for (const pattern of LINK_PATTERNS) {
    for (const match of masked.matchAll(pattern)) {
      const group = match.findIndex((value, index) => index > 0 && value !== undefined);
      const url = match[group];
      const [, target, suffix] = url.match(/^([^?#]*)(.*)$/s);
      if (!isRepoRelative(url, target)) continue;
      const start = match.indices[group][0];
      links.push({ start, end: start + url.length, url, target, suffix });
    }
  }
  return links.sort((left, right) => left.start - right.start);
}

function decodePath(target) {
  try { return decodeURI(target); } catch { return target; }
}

export function resolveLink(file, target) {
  return path.resolve(path.dirname(file), decodePath(target));
}

// Copy-time rebase: a link broken at toFile whose target exists from fromFile is recomputed from toFile.
export function rebaseLinks(text, fromFile, toFile) {
  const missing = [];
  let output = '';
  let cursor = 0;
  for (const link of relativeLinks(text)) {
    if (fs.existsSync(resolveLink(toFile, link.target))) continue;
    const resolved = resolveLink(fromFile, link.target);
    if (!fs.existsSync(resolved)) { missing.push(link.url); continue; }
    const relative = path.relative(path.dirname(toFile), resolved).split(path.sep).join('/') || '.';
    const rebased = link.target.endsWith('/') ? `${relative}/` : relative;
    output += text.slice(cursor, link.start) + (decodePath(link.target) === link.target ? rebased : encodeURI(rebased)) + link.suffix;
    cursor = link.end;
  }
  return { text: output + text.slice(cursor), missing };
}

// Relative links of `file` whose repo target does not exist.
export function brokenLinks(text, file) {
  return relativeLinks(text).filter((link) => !fs.existsSync(resolveLink(file, link.target)));
}
