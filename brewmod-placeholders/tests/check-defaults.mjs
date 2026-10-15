#!/usr/bin/env node
// Pins placeholders/*.md bodies to SPEC_BODIES in defaults-pin.test.ts (plugin test cannot read files). rc 0 ok, 1 drift, 2 missing/unparsable.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModDefault } from '../../.codex/scripts/mod-default.mjs';

const pinFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'defaults-pin.test.ts');
const src = fs.readFileSync(pinFile, 'utf8');
// Single source of truth: parse the map from the test; a count != 6 means the format drifted -> rc 2.
const pins = new Map();
for (const m of src.matchAll(/^\s*(?:'([^']+)'|(\w+)): \{ sha256: '([0-9a-f]{64})', len: (\d+) \},?$/gm)) {
  pins.set(m[1] ?? m[2], { sha256: m[3], len: Number(m[4]) });
}
if (pins.size !== 6) {
  console.error(`check-defaults: parsed ${pins.size} pins from ${pinFile}, expected 6`);
  process.exit(2);
}

let rc = 0;
for (const [name, pin] of [...pins].sort(([a], [b]) => (a < b ? -1 : 1))) {
  let body;
  try {
    body = readModDefault(name);
  } catch (e) {
    console.error(`MISSING ${name}.md: ${e.message}`);
    process.exit(2);
  }
  const sha256 = crypto.createHash('sha256').update(body, 'utf8').digest('hex');
  if (sha256 !== pin.sha256 || body.length !== pin.len) {
    console.error(`DRIFT ${name}.md: expected len=${pin.len} sha256=${pin.sha256}, got len=${body.length} sha256=${sha256}`);
    rc = 1;
  } else {
    console.log(`OK ${name}.md len=${body.length}`);
  }
}
process.exit(rc);
