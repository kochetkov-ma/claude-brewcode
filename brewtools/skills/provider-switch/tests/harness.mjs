/**
 * Shared assertion + reporting primitives for the provider-switch suites.
 *
 * Assertion policy (CLAUDE.md): unconditional exact-equality checks, each with a description.
 * No inequalities, no truthiness, no branching inside a check.
 */
import { mkdtempSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

function trunc(s) {
  const str = String(s);
  return str.length > 600 ? `${str.slice(0, 600)}...` : str;
}

export function createRunner(suiteName) {
  let passed = 0;
  let failed = 0;
  const results = [];

  const check = (name, actual, expected, message) => {
    if (deepEqual(actual, expected)) {
      passed++;
      results.push(`  PASS  ${name}  (${message})`);
      return;
    }
    failed++;
    results.push(
      `  FAIL  ${name}  (${message} | actual=${trunc(JSON.stringify(actual))} expected=${trunc(JSON.stringify(expected))})`,
    );
  };

  const report = () => {
    for (const line of results) console.log(line);
    console.log(`\n| ${suiteName} | Value |`);
    console.log('|-----------|-------|');
    console.log(`| checks | ${passed + failed} |`);
    console.log(`| passed | ${passed} |`);
    console.log(`| failed | ${failed} |`);
    if (failed !== 0) {
      console.log(`❌ ${suiteName}: ${failed} failing`);
      process.exit(1);
    }
    console.log(`✅ ${suiteName}: all ${passed} checks passed`);
  };

  return { check, report };
}

/** Isolated world: a realpath'd temp base (macOS /var -> /private/var). */
export function makeBase(prefix) {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}
