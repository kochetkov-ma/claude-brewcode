// Copies ../../assets/demos/*.gif -> public/demos/; no-op when the source is absent (Docker).
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, '..', '..', 'assets', 'demos');
const dst = join(root, 'public', 'demos');

if (existsSync(src)) {
  try {
    mkdirSync(dst, { recursive: true });
    for (const f of readdirSync(src).filter((n) => n.endsWith('.gif'))) {
      cpSync(join(src, f), join(dst, f));
    }
  } catch (e) {
    console.error(`copy-demos failed: ${e.message}`);
    process.exit(1);
  }
}
