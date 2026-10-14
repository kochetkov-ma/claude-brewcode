#!/usr/bin/env node
// Usage: mods-ref-check.mjs <types.d.ts> <refs dir>; rc 0 clean, 1 drift, 2 error. Verdict = first stdout line.
// Every symbol-index row of <refs dir>/mods-api.md: its fragment must occur in the types (whitespace collapsed).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BEGIN = '<!-- mods-symbols:begin -->';
const END = '<!-- mods-symbols:end -->';
const KINDS = new Set(['event', 'noun', 'type', 'field', 'option']);
const HEADER = /^\|\s*kind\s*\|\s*symbol\s*\|\s*fragment\s*\|$/;
const SEPARATOR = /^\|[\s:|-]+\|$/;
// kind | symbol | fragment as one single- or double-backtick span; `\|` inside the fragment = a pipe.
const ROW = /^\|\s*(\w+)\s*\|\s*(.+?)\s*\|\s*(?:``\s?(.+?)\s?``|`([^`]+)`)\s*\|$/;

const collapse = (s) => s.replace(/\s+/g, ' ');

class CheckError extends Error {}

function readText(path, what) {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    throw new CheckError(`cannot read ${what} ${path}: ${err.code ?? err.message}`);
  }
}

function parseIndex(doc, docPath) {
  const begin = doc.indexOf(BEGIN);
  const end = doc.indexOf(END);
  if (begin < 0 || end < begin) throw new CheckError(`symbol index block missing in ${docPath}`);
  const lines = doc.slice(begin + BEGIN.length, end).split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3 || !HEADER.test(lines[0]) || !SEPARATOR.test(lines[1])) {
    throw new CheckError(`index table header or separator malformed in ${docPath}`);
  }
  return lines.slice(2).map((line) => {
    const m = ROW.exec(line);
    const fragment = m && collapse((m[3] ?? m[4]).replaceAll('\\|', '|')).trim();
    if (!m || !KINDS.has(m[1]) || !fragment) throw new CheckError(`malformed index row: ${line}`);
    return { kind: m[1], symbol: m[2], fragment };
  });
}

function verifiedOn(refsDir) {
  return readdirSync(refsDir)
    .filter((f) => /^mods-.+\.md$/.test(f))
    .sort()
    .map((f) => [f, /verified_on:\s*([0-9.]+)/.exec(readText(join(refsDir, f), 'reference'))?.[1] ?? 'none']);
}

function main(argv) {
  if (argv.length !== 2) throw new CheckError('usage: mods-ref-check.mjs <types.d.ts> <refs dir>');
  const [typesPath, refsDir] = argv;
  const types = collapse(readText(typesPath, 'types file'));
  const apiPath = join(refsDir, 'mods-api.md');
  const rows = parseIndex(readText(apiPath, 'index file'), apiPath);
  if (rows.length === 0) throw new CheckError(`symbol index in ${apiPath} has no rows`);
  const versions = verifiedOn(refsDir);
  const apiVersion = versions.find(([f]) => f === 'mods-api.md')[1];
  const missing = rows.filter((r) => !types.includes(r.fragment));
  const out = [missing.length === 0
    ? `mods-ref-check: CLEAN ${rows.length}/${rows.length} (verified_on ${apiVersion})`
    : `mods-ref-check: DRIFT ${missing.length}/${rows.length}`];
  for (const r of missing) out.push(`DRIFT ${r.kind} ${r.symbol} ${r.fragment}`);
  out.push(`verified_on: ${versions.map(([f, v]) => `${f}=${v}`).join(' ')}`);
  if (new Set(versions.map(([, v]) => v)).size > 1) out.push('Warning: verified_on differs between mods-*.md files');
  console.log(out.join('\n'));
  return missing.length === 0 ? 0 : 1;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  if (!(err instanceof CheckError)) throw err;
  console.log(`mods-ref-check: ERROR ${err.message}`);
  process.exitCode = 2;
}
