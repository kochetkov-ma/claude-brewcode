#!/usr/bin/env node
/**
 * redact.mjs - turn one (file, line) hit into a report-safe finding record.
 *
 * Usage: node redact.mjs <file> <line-number-1-based>
 * Prints ONE JSON object on stdout and nothing else. The raw matched value is
 * never printed, never returned, and never written anywhere: a scanner agent
 * calls this instead of quoting the secret it found, so no model turn and no
 * durable report ever holds the credential.
 *
 * Fields: status, path, line, category, match_len, sha256_12, preview.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEYWORDS =
  'password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?key|api[_-]?secret'
  + '|auth[_-]?token|access[_-]?token|token|bearer|client[_-]?secret'
  + '|encryption[_-]?key|aws[_-]?secret[_a-z]*|aws[_-]?access[_-]?key[_a-z]*';

// Ordered: the first rule that matches wins. URL before key=value so a
// connection string is not shredded into its `password:` fragment.
const RULES = [
  { category: 'AWS', re: /AKIA[0-9A-Z]{16}/, group: 0 },
  { category: 'Keys', re: /-----BEGIN[A-Z ]*PRIVATE KEY-----.*/, group: 0 },
  {
    category: 'DB URLs',
    re: /\b(?:jdbc:[a-z0-9]+|mongodb(?:\+srv)?|mysql|postgres(?:ql)?|redis|amqp):\/\/[^\s"'`]*:[^\s"'`]*@[^\s"'`]+/i,
    group: 0,
  },
  {
    category: null, // resolved from the matched keyword
    re: new RegExp(`(${KEYWORDS})\\s*[:=]\\s*["'\`]?([^\\s"'\`,;]+)`, 'i'),
    group: 2,
    keywordGroup: 1,
  },
];

// Env indirection is a reference, not a secret - Phase 2's SKIP rule.
const ENV_REF = /process\.env\.|os\.getenv\(|os\.environ|\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Z][A-Z0-9_]*$|<%=/;

function categoryFor(keyword) {
  const k = keyword.toLowerCase();
  if (/aws/.test(k)) return 'AWS';
  if (/client_secret|client-secret|clientsecret|encryption/.test(k)) return 'Keys';
  if (/token|bearer/.test(k)) return 'Tokens';
  if (/key|api_secret|api-secret/.test(k)) return 'API Keys';
  return 'Passwords';
}

/** Redacted record for one raw value. Reveals at most 4 chars, never half the value. */
export function redactValue(value) {
  const reveal = Math.min(4, Math.floor(value.length / 2));
  return {
    match_len: value.length,
    sha256_12: createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 12),
    preview: `${value.slice(0, reveal)}***`,
  };
}

/** Classify one source line. Returns a record with no raw value in it. */
export function inspectLine(line) {
  for (const rule of RULES) {
    const m = rule.re.exec(line);
    if (!m) continue;
    const value = m[rule.group];
    const category = rule.category ?? categoryFor(m[rule.keywordGroup]);
    if (ENV_REF.test(value)) return { status: 'SKIP_ENV_REF', category };
    return { status: 'OK', category, ...redactValue(value) };
  }
  return { status: 'NO_MATCH' };
}

function main(argv) {
  const [file, lineArg] = argv;
  if (!file || !lineArg) {
    process.stdout.write(`${JSON.stringify({ status: 'USAGE' })}\n`);
    return 2;
  }
  const lineNo = Number(lineArg);
  let lines;
  try {
    lines = readFileSync(file, 'utf8').split(/\r?\n/);
  } catch {
    process.stdout.write(`${JSON.stringify({ status: 'NO_FILE', path: file })}\n`);
    return 2;
  }
  if (!Number.isInteger(lineNo) || lineNo < 1 || lineNo > lines.length) {
    process.stdout.write(`${JSON.stringify({ status: 'NO_LINE', path: file, line: lineNo })}\n`);
    return 2;
  }
  const r = inspectLine(lines[lineNo - 1]);
  process.stdout.write(`${JSON.stringify({ path: file, line: lineNo, ...r })}\n`);
  return r.status === 'OK' ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
