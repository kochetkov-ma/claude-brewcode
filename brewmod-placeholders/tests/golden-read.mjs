// Reads the frozen spec (PLACEHOLDER_FILES, VECTORS) out of golden.generated.ts without a TS loader: both literals are plain JSON.
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

export function readGolden() {
  const src = fs.readFileSync(FILE, 'utf8');
  return {
    files: literal(src, 'export const PLACEHOLDER_FILES: Record<string, string> = {', '{', '}'),
    vectors: literal(src, 'export const VECTORS: GoldenVector[] = [', '[', ']'),
  };
}
