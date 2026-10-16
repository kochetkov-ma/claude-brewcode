// Reads the frozen spec (PLACEHOLDER_FILES, VECTORS) and the reviewed 6.9.5 overlay out of golden.generated.ts without a TS loader: all plain JSON.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'parity', 'golden.generated.ts');

function literal(src, head, open, close) {
  const at = src.indexOf(head);
  if (at < 0) throw new Error(`golden: '${head}' not found`);
  const from = src.indexOf(open, at + head.length - 1);
  const to = src.indexOf(`\n${close}\n`, from);
  return JSON.parse(src.slice(from, to + 2));
}

// vectors = VECTORS with BREAKS_6_9_5 applied (expected, length, sha; `broken` = the reason); frozen = VECTORS as recorded.
export function readGolden() {
  const src = fs.readFileSync(FILE, 'utf8');
  const breaks = literal(src, 'export const BREAKS_6_9_5: Record<string, GoldenBreak> = {', '{', '}');
  const frozen = literal(src, 'export const VECTORS: GoldenVector[] = [', '[', ']');
  const vectors = frozen.map((v) => {
    const b = breaks[v.id];
    if (b === undefined) return v;
    const sha = b.expected === null ? null : crypto.createHash('sha256').update(b.expected, 'utf8').digest('hex');
    return { ...v, expected: b.expected, length: b.expected === null ? null : b.expected.length, sha, broken: b.reason };
  });
  return { files: literal(src, 'export const PLACEHOLDER_FILES: Record<string, string> = {', '{', '}'), breaks, frozen, vectors };
}
