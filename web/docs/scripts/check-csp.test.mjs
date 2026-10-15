#!/usr/bin/env node
// Positive/negative controls for check-csp.mjs; run: node scripts/check-csp.test.mjs (rc 0 pass, 1 fail)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const base = mkdtempSync(join(tmpdir(), 'check-csp-'));
const cases = [
  ['clean page', '<p>ok</p><img src="/a.png" alt="x"><a href="https://github.com/x">g</a>', 0],
  ['json-ld is not executable', '<script type="application/ld+json">{"a":1}</script>', 0],
  ['script in comment', '<!-- <script>alert(1)</script> -->', 0],
  ['self srcset url with comma', '<img srcset="/a,b.png 1x">', 0],
  ['google fonts stylesheet', '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">', 0],
  ['inline script', '<script>alert(1)</script>', 1],
  ['upper-case inline script', '<SCRIPT>alert(1)</SCRIPT>', 1],
  ['inline handler', '<a onclick="x()">a</a>', 1],
  ['javascript url', '<a href="javascript:alert(1)">a</a>', 1],
  ['foreign img', '<img src="https://evil.test/x.png">', 1],
  ['foreign img unquoted', '<img src=https://evil.test/x.png>', 1],
  ['foreign img newline separator', '<img\nsrc=https://evil.test/x.png>', 1],
  ['slash-separated img', '<img/src=https://evil.test/x.png>', 1],
  ['slash-separated script', '<script/src=https://evil.test/x.js></script>', 1],
  ['self-closed slash script', '<script/src=https://evil.test/x.js/>', 1],
  ['slash-separated link', '<link/rel=stylesheet href=https://evil.test/a.css>', 1],
  ['attrs touching a quote', '<img src="https://evil.test/a.png"alt="b">', 1],
  ['second candidate in img srcset', '<img src="/a.png" srcset="/a.png 1x, https://evil.test/b.png 2x">', 1],
  ['second candidate in source srcset', '<picture><source srcset="/a.webp 1x, https://evil.test/b.webp 2x"></picture>', 1],
  ['second source element', '<picture><source srcset="/a.webp"><source srcset="https://evil.test/b.webp"></picture>', 1],
  ['protocol-relative script', '<script src="//cdn.evil.test/x.js"></script>', 1],
  ['inline style element', '<style>a{}</style>', 1],
  ['foreign iframe', '<iframe src="https://youtube.com/embed/x"></iframe>', 1],
  ['pathological attr run stays linear', `<A\t!=${'!/\t!='.repeat(20000)}`, 0],
  ['foreign form action', '<form action="https://evil.test/p"></form>', 1],
];

let failed = 0;
cases.forEach(([name, html, want]) => {
  const d = mkdtempSync(join(base, 'c-'));
  writeFileSync(join(d, 'index.html'), html);
  const r = spawnSync('node', [join(here, 'check-csp.mjs'), '--dist', d], { encoding: 'utf8', timeout: 10000 });
  const ok = r.status === want;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: want rc ${want}, got ${r.status}`);
});
const stale = join(base, 'Caddyfile.stale');
writeFileSync(stale, '  Content-Security-Policy "default-src \'none\'; script-src \'self\'"\n');
const cleanDir = mkdtempSync(join(base, 'c-'));
writeFileSync(join(cleanDir, 'index.html'), '<p>ok</p>');
const drift = spawnSync('node', [join(here, 'check-csp.mjs'), '--dist', cleanDir, '--image-caddyfile', stale], { encoding: 'utf8' });
console.log(`${drift.status === 1 ? 'PASS' : 'FAIL'} image Caddyfile CSP drift: want rc 1, got ${drift.status}`);
if (drift.status !== 1) failed++;
if (failed) {
  console.error(`check-csp.test: ${failed} case(s) failed`);
  process.exit(1);
}
console.log(`check-csp.test: all ${cases.length + 1} cases passed`);
