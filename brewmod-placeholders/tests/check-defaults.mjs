#!/usr/bin/env node
// Pins placeholders/*.md to the frozen golden (whole file), their bodies to SPEC_BODIES in defaults-pin.test.ts, m + m.plan to vector spec-2.
// rc 0 ok, 1 drift, 2 missing/unparsable.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModDefault } from '../../.codex/scripts/mod-default.mjs';
import { readGolden } from './golden-read.mjs';

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
// Front matter (name/when/order/header/insert/priority/group/legacy) is part of the spec: the whole file must equal the golden copy.
const dir = path.join(path.dirname(pinFile), '..', 'placeholders');
const { files: golden, vectors } = readGolden();
const onDisk = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort();
if (JSON.stringify(onDisk) !== JSON.stringify(Object.keys(golden).sort())) {
  console.error(`DRIFT file set: placeholders/ has [${onDisk}], golden has [${Object.keys(golden).sort()}]`);
  rc = 1;
}
for (const [name, want] of Object.entries(golden)) {
  const file = path.join(dir, `${name}.md`);
  if (!fs.existsSync(file)) continue;
  const got = fs.readFileSync(file, 'utf8');
  if (got !== want) {
    let at = 0;
    while (at < got.length && got[at] === want[at]) at++;
    console.error(`DRIFT ${name}.md: file differs from golden (len ${got.length} vs ${want.length}, first difference at ${at})`);
    rc = 1;
  }
}
const bodies = {};
const checks = [];
for (const [name, pin] of [...pins].sort(([a], [b]) => (a < b ? -1 : 1))) {
  try {
    bodies[name] = readModDefault(name);
  } catch (e) {
    console.error(`MISSING ${name}.md: ${e.message}`);
    process.exit(2);
  }
  checks.push([`${name}.md`, bodies[name], pin]);
}
for (const [label, body, pin] of checks) {
  const sha256 = crypto.createHash('sha256').update(body, 'utf8').digest('hex');
  if (sha256 !== pin.sha256 || body.length !== pin.len) {
    console.error(`DRIFT ${label}: expected len=${pin.len} sha256=${pin.sha256}, got len=${body.length} sha256=${sha256}`);
    rc = 1;
  } else {
    console.log(`OK ${label} len=${body.length}`);
  }
}
// Plan-mode ++m = plan header, m body, blank line, m.plan part (`plan: add`): byte-identical to the frozen v6.7.0 vector spec-2.
const spec2 = vectors.find((v) => v.id === 'spec-2')?.expected;
const planM = `User typed \`++m\` — Manager + Plan Mode is active for this turn:\n\n${bodies.m}\n\n${bodies['m.plan']}`;
if (planM !== spec2) {
  console.error(`DRIFT m.md + m.plan.md (plan-mode ++m): len ${planM.length} vs spec-2 ${spec2?.length ?? 'missing'}`);
  rc = 1;
} else {
  console.log(`OK m.md + m.plan.md (plan-mode ++m) = spec-2 len=${planM.length}`);
}
process.exit(rc);
