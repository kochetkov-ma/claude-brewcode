#!/usr/bin/env node
// Suite server-discover.sh (BT-F21): port/connection operands never word-split into ssh options; discovery bounded by portable in-process deadline.
// argv-capturing `ssh` stub on PATH, no network, no real SSH; unconditional exact-equality checks with description.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');
const SCRIPT = join(HERE, '..', 'scripts', 'server-discover.sh');

let passed = 0;
let failed = 0;
const results = [];

function check(name, actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
  } else {
    failed++;
    results.push(`  FAIL  ${name}  (${message} | actual=${a} expected=${e})`);
  }
}

/** Temp sandbox with an `ssh` stub that appends its argv, one line per word, to argv.log. */
function sandbox(body) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'ssh-discover-')));
  const bin = join(base, 'bin');
  mkdirSync(bin);
  const log = join(base, 'argv.log');
  writeFileSync(
    join(bin, 'ssh'),
    `#!/bin/bash\nfor a in "$@"; do printf '%s\\n' "$a" >> "${log}"; done\nprintf -- '---\\n' >> "${log}"\n[ -n "\${STUB_SLEEP:-}" ] && sleep "$STUB_SLEEP"\nexit "\${STUB_EXIT:-0}"\n`,
  );
  chmodSync(join(bin, 'ssh'), 0o755);
  // Pipe stdio on purpose: the deadline timer must never hold a caller's pipe (case 9 bounds the time).
  const run = (args, env = {}) => {
    const r = spawnSync('bash', [SCRIPT, ...args], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ...env },
      timeout: 30000,
    });
    return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
  };
  const argv = () => (existsSync(log) ? readFileSync(log, 'utf8') : '');
  try {
    body({ run, argv, base });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

const PORT_PAYLOAD = '22 -o ProxyCommand=/tmp/pwn -o StrictHostKeyChecking=no';

// ── 1. the reported injection vector: port text carrying ssh options ──────
sandbox(({ run, argv }) => {
  const r = run(['deploy@10.0.0.1', PORT_PAYLOAD]);
  check('port-injection.exit', r.status, 2, 'a port carrying ssh options exits 2');
  check(
    'port-injection.stderr',
    r.stderr,
    `ERROR: invalid port '${PORT_PAYLOAD}' (expected integer 1..65535)\n`,
    'the rejection names the bad port',
  );
  check('port-injection.stdout', r.stdout, '', 'nothing is printed before the rejection');
  check('port-injection.ssh-never-invoked', argv(), '', 'ssh is never executed, so ProxyCommand never runs');
});

// ── 2. the connection operand cannot smuggle options either ──────────────
sandbox(({ run, argv }) => {
  const bad = 'deploy@10.0.0.1 -o ProxyCommand=/tmp/pwn';
  const r = run([bad, '22']);
  check('conn-injection.exit', r.status, 2, 'a connection operand with whitespace/options exits 2');
  check(
    'conn-injection.stderr',
    r.stderr,
    `ERROR: invalid connection '${bad}' (expected user@host, host or ssh alias)\n`,
    'the rejection names the bad connection',
  );
  check('conn-injection.ssh-never-invoked', argv(), '', 'ssh is never executed');
});

// ── 3. out-of-range and malformed ports ─────────────────────────────────
sandbox(({ run }) => {
  const cases = [
    ['65536', 2],
    ['0', 2],
    ['022', 2],
    ['22a', 2],
    ['-1', 2],
    ['65535', 0],
  ];
  const actual = cases.map(([p]) => [p, run(['deploy@10.0.0.1', p], { SSH_DISCOVER_TIMEOUT: '20' }).status]);
  check(
    'port-range.exits',
    actual,
    cases,
    'ports 65536/0/leading-zero/trailing-text/negative exit 2, the boundary 65535 is accepted',
  );
  check(
    'port-empty.default',
    run(['deploy@10.0.0.1', ''], { SSH_DISCOVER_TIMEOUT: '20' }).status,
    0,
    'an empty port argument falls back to the documented default 22',
  );
});

// ── 4. a valid run passes an exact, unsplittable argv to ssh ─────────────
sandbox(({ run, argv }) => {
  const r = run(['deploy@10.0.0.1', '2222'], { SSH_DISCOVER_TIMEOUT: '20' });
  check('valid.exit', r.status, 0, 'a valid run exits 0');
  check(
    'valid.first-argv',
    argv().split('---\n')[0].split('\n').filter((x) => x.length > 0),
    ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=accept-new', '-p', '2222', 'deploy@10.0.0.1', 'true'],
    'the connectivity probe argv is exactly the array-built option list',
  );
  check(
    'valid.discovery-complete',
    r.stdout.split('\n').filter((l) => l === '=== Discovery Complete ==='),
    ['=== Discovery Complete ==='],
    'discovery runs to completion against the stub',
  );
});

// ── 5. an ssh alias (no user@) is accepted ──────────────────────────────
sandbox(({ run }) => {
  const r = run(['vps-main']);
  check('alias.exit', r.status, 0, 'a bare ssh_config alias is a valid operand');
});

// ── 6. unreachable host: exit 1, no partial discovery output ────────────
sandbox(({ run }) => {
  const r = run(['deploy@10.0.0.1', '22'], { STUB_EXIT: '255' });
  check('unreachable.exit', r.status, 1, 'a failing connectivity probe exits 1');
  check(
    'unreachable.stderr',
    r.stderr,
    'ERROR: Cannot connect to deploy@10.0.0.1:22 (timeout or auth failure)\n',
    'the unreachable error names host and port',
  );
  check('unreachable.stdout', r.stdout, '', 'no discovery output is emitted');
});

// ── 7. portable outer deadline (no GNU timeout needed) ──────────────────
sandbox(({ run }) => {
  const started = Date.now();
  const r = run(['deploy@10.0.0.1', '22'], { SSH_DISCOVER_TIMEOUT: '1', STUB_SLEEP: '10' });
  const elapsedMs = Date.now() - started;
  check('deadline.exit', r.status, 124, 'a hung ssh is killed and the script exits 124');
  // Bound 5000 ms: 1 s budget + 4 s tolerance for a loaded CI runner; the hung stub alone would hold 10 s.
  check(
    'deadline.pipe-released',
    elapsedMs <= 5000,
    true,
    `the hung ssh is killed with the run, so the captured pipe closes: ${elapsedMs} ms, bound 5000 ms, stub sleep 10000 ms`,
  );
  check(
    'deadline.stderr',
    r.stderr,
    'ERROR: discovery exceeded 1s deadline\n',
    'the deadline message names the configured budget',
  );
});

// ── 8. an invalid deadline is rejected, not silently ignored ────────────
sandbox(({ run, argv }) => {
  const r = run(['deploy@10.0.0.1', '22'], { SSH_DISCOVER_TIMEOUT: '30s' });
  check('deadline-arg.exit', r.status, 2, 'a non-integer SSH_DISCOVER_TIMEOUT exits 2');
  check(
    'deadline-arg.stderr',
    r.stderr,
    "ERROR: invalid SSH_DISCOVER_TIMEOUT '30s' (expected positive integer seconds)\n",
    'the rejection names the bad budget',
  );
  check('deadline-arg.ssh-never-invoked', argv(), '', 'ssh is never executed with an unbounded run');
});

// ── 9. $(...) capture returns on success, not at the deadline ───────────
// Bound 5000 ms vs 20 s budget: stubbed work ~0.2 s + 4.8 s tolerance for a loaded CI runner.
sandbox(({ base }) => {
  const harness = join(base, 'capture.sh');
  writeFileSync(
    harness,
    `#!/bin/bash\nout=$(bash "$1" deploy@10.0.0.1 22)\nrc=$?\nprintf 'rc=%s\\n%s\\n' "$rc" "$(printf '%s\\n' "$out" | grep -c '^=== Discovery Complete ===$')"\n`,
  );
  const started = Date.now();
  const r = spawnSync('bash', [harness, SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(base, 'bin')}:${process.env.PATH}`, SSH_DISCOVER_TIMEOUT: '20' },
    timeout: 30000,
  });
  const elapsedMs = Date.now() - started;
  check(
    'capture.output',
    [r.status, r.stdout],
    [0, 'rc=0\n1\n'],
    'command substitution gets rc 0 and exactly one completion line',
  );
  check(
    'capture.elapsed-within-bound',
    elapsedMs <= 5000,
    true,
    `the deadline timer never holds the captured stdout: ${elapsedMs} ms, bound 5000 ms, budget 20000 ms`,
  );
});

console.log(results.join('\n'));
console.log(`\nsuite-discover: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
