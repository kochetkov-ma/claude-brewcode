#!/usr/bin/env node
// Usage: mods-ref-check.mjs <types.d.ts> <refs dir>; rc 0 clean, 1 drift, 2 error. Stdout line 1 = verdict (CLEAN n/n | DRIFT k/n | ERROR reason).
// Then DRIFT rows, `verified_on: ...`, optional `Warning:`, last `VERSION types X references Y[ MISMATCH]` (rc unchanged by MISMATCH).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BEGIN = /^<!-- mods-symbols:begin -->[ \t\r]*$/gm;
const END = /^<!-- mods-symbols:end -->[ \t\r]*$/gm;
const KINDS = new Set(['event', 'noun', 'type', 'field', 'option']);
const HEADER = /^\|\s*kind\s*\|\s*symbol\s*\|\s*fragment\s*\|$/;
const SEPARATOR = /^\|[\s:|-]+\|$/;
// kind | symbol | fragment as one single- or double-backtick span; `\|` inside the fragment = a pipe.
const ROW = /^\|\s*(\w+)\s*\|\s*(.+?)\s*\|\s*(?:``\s?(.+?)\s?``|`([^`]+)`)\s*\|$/;
// Shortest fragment shipped in mods-api.md is 14 characters; 8 rejects stubs like `a` with margin.
const MIN_FRAGMENT = 8;
const TYPES_HEADER = /^\/\/ Written by Claude Code ([0-9]+(?:\.[0-9]+)*)\.?$/;
const REFS = ['api', 'changes', 'lifecycle', 'patterns', 'testing'].map((n) => `mods-${n}.md`);

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
  const begins = [...doc.matchAll(BEGIN)];
  const ends = [...doc.matchAll(END)];
  if (begins.length > 1) throw new CheckError(`second symbol index block in ${docPath}`);
  const begin = begins[0]?.index ?? -1;
  const end = ends.find((e) => e.index > begin)?.index ?? -1;
  if (begin < 0 || end < 0) throw new CheckError(`symbol index block missing in ${docPath}`);
  const lines = doc.slice(begin, end).split('\n').slice(1).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3 || !HEADER.test(lines[0]) || !SEPARATOR.test(lines[1])) {
    throw new CheckError(`index table header or separator malformed in ${docPath}`);
  }
  const seen = new Set();
  return lines.slice(2).map((line) => {
    const m = ROW.exec(line);
    const fragment = m && collapse((m[3] ?? m[4]).replaceAll('\\|', '|')).trim();
    if (!m || !KINDS.has(m[1]) || !fragment) throw new CheckError(`malformed index row: ${line}`);
    if (fragment.length < MIN_FRAGMENT) throw new CheckError(`fragment shorter than ${MIN_FRAGMENT} characters: ${line}`);
    const key = `${m[1]} ${m[2]}`;
    if (seen.has(key)) throw new CheckError(`duplicate index row: ${key} in ${docPath}`);
    seen.add(key);
    return { kind: m[1], symbol: m[2], fragment };
  });
}

function verifiedOn(refsDir) {
  return REFS.map((f) => {
    const path = join(refsDir, f);
    const m = /verified_on:\s*([0-9]+(?:\.[0-9]+)*)/.exec(readText(path, 'reference'));
    if (!m) throw new CheckError(`no verified_on in ${path}`);
    return [f, m[1]];
  });
}

function main(argv) {
  if (argv.length !== 2) throw new CheckError('usage: mods-ref-check.mjs <types.d.ts> <refs dir>');
  const [typesPath, refsDir] = argv;
  const raw = readText(typesPath, 'types file').replace(/^﻿/, '');
  const typesVersion = TYPES_HEADER.exec(raw.split('\n', 1)[0].trim())?.[1];
  if (!typesVersion) throw new CheckError('types file empty or not a Claude Code types file');
  const types = collapse(raw);
  const apiPath = join(refsDir, 'mods-api.md');
  const rows = parseIndex(readText(apiPath, 'index file'), apiPath);
  const versions = verifiedOn(refsDir);
  const apiVersion = versions[0][1];
  const missing = rows.filter((r) => !types.includes(r.fragment));
  const out = [missing.length === 0
    ? `mods-ref-check: CLEAN ${rows.length}/${rows.length} (verified_on ${apiVersion})`
    : `mods-ref-check: DRIFT ${missing.length}/${rows.length}`];
  for (const r of missing) out.push(`DRIFT ${r.kind} ${r.symbol} ${r.fragment}`);
  out.push(`verified_on: ${versions.map(([f, v]) => `${f}=${v}`).join(' ')}`);
  if (new Set(versions.map(([, v]) => v)).size > 1) out.push('Warning: verified_on differs between mods-*.md files');
  out.push(`VERSION types ${typesVersion} references ${apiVersion}${typesVersion === apiVersion ? '' : ' MISMATCH'}`);
  console.log(out.join('\n'));
  return missing.length === 0 ? 0 : 1;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  const reason = err instanceof CheckError ? err.message : `unexpected ${err?.code ?? err?.name ?? 'error'}: ${err?.message ?? err}`;
  console.log(`mods-ref-check: ERROR ${reason.split('\n')[0]}`);
  process.exitCode = 2;
}
