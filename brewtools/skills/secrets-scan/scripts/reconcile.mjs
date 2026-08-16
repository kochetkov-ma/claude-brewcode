#!/usr/bin/env node
/**
 * reconcile.mjs - enforce `assigned == union(scanned, skipped)` for one chunk.
 *
 * Usage: node reconcile.mjs <assigned-list-file> <agent-json-file>
 * Prints ONE JSON verdict on stdout. Exit 0 = OK, 1 = MISMATCH, 2 = MALFORMED.
 * A chunk that cannot be reconciled must never be counted as scanned - that is
 * the difference between "no findings" and "never looked".
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function readList(file) {
  return readFileSync(file, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0);
}

function diff(a, b) {
  return [...a].filter((x) => !b.has(x)).sort();
}

/** Compare one assigned list against one agent payload. No file access, no secrets. */
export function reconcile(assignedList, payload) {
  const assigned = new Set(assignedList);
  const scanned = Array.isArray(payload.scanned) ? payload.scanned : null;
  const skipped = Array.isArray(payload.skipped) ? payload.skipped : null;
  if (scanned === null || skipped === null) {
    return { status: 'MALFORMED', reason: 'scanned[] or skipped[] missing', agent: payload.agent ?? null };
  }
  const skippedPaths = skipped.map((s) => (s && typeof s === 'object' ? s.path : s));
  if (skippedPaths.some((p) => typeof p !== 'string')) {
    return { status: 'MALFORMED', reason: 'skipped[] entry without a path', agent: payload.agent ?? null };
  }
  const accounted = new Set([...scanned, ...skippedPaths]);
  const missing = diff(assigned, accounted);
  const extra = diff(accounted, assigned);
  return {
    status: missing.length === 0 && extra.length === 0 ? 'OK' : 'MISMATCH',
    agent: payload.agent ?? null,
    assigned: assigned.size,
    accounted: accounted.size,
    missing,
    extra,
  };
}

const EXIT = { OK: 0, MISMATCH: 1, MALFORMED: 2 };

function main(argv) {
  const [assignedFile, jsonFile] = argv;
  if (!assignedFile || !jsonFile) {
    process.stdout.write(`${JSON.stringify({ status: 'USAGE' })}\n`);
    return 2;
  }
  let assignedList;
  let payload;
  try {
    assignedList = readList(assignedFile);
  } catch {
    process.stdout.write(`${JSON.stringify({ status: 'MALFORMED', reason: 'assigned list unreadable', agent: null })}\n`);
    return 2;
  }
  try {
    payload = JSON.parse(readFileSync(jsonFile, 'utf8'));
  } catch (e) {
    process.stdout.write(`${JSON.stringify({ status: 'MALFORMED', reason: `unparsable agent JSON: ${e.name}`, agent: null })}\n`);
    return 2;
  }
  const verdict = reconcile(assignedList, payload);
  process.stdout.write(`${JSON.stringify(verdict)}\n`);
  return EXIT[verdict.status];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
