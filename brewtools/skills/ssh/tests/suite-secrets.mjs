#!/usr/bin/env node
/**
 * Suite: credential and host-key contracts of the shipped skill text
 * (BT-F22 skill half, BT-F12, BT-F21 doc half).
 *
 * Static half: every token reference in SKILL.md / references / template is
 * rewritten to a distinctive sentinel and the resulting lines must all be
 * stdin-only shapes -- a sentinel on a command line or in an `echo` fails.
 * Runtime half: the canonical login line lifted verbatim from SKILL.md is run
 * against an argv+stdin capturing `ssh` stub. No network, no docker, no SSH.
 * Assertion policy: unconditional exact-equality checks with a description.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');
const SKILL = join(HERE, '..');

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

const SENTINEL = 'SENTINEL-TOKEN-D0NTLEAK-4Q7';
const TOKEN_VARS = ['GHCR_TOKEN', 'GITHUB_TOKEN', 'DOCKER_TOKEN', 'GH_TOKEN', 'DH_TOKEN', 'REG_TOKEN', 'FRESH_TOKEN', 'TOKEN'];

const FILES = {
  'SKILL.md': readFileSync(join(SKILL, 'SKILL.md'), 'utf8'),
  'references/docker-auth-flow.md': readFileSync(join(SKILL, 'references', 'docker-auth-flow.md'), 'utf8'),
  'references/ssh-best-practices.md': readFileSync(join(SKILL, 'references', 'ssh-best-practices.md'), 'utf8'),
  'references/safety-rules.md': readFileSync(join(SKILL, 'references', 'safety-rules.md'), 'utf8'),
  'templates/ssh-admin-agent.md.template': readFileSync(join(SKILL, 'templates', 'ssh-admin-agent.md.template'), 'utf8'),
};

/** Lines inside ```bash fences only - prose mentioning `docker login` is not a command. */
function bashLines(text) {
  const out = [];
  let inFence = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) {
      inFence = line.startsWith('```bash');
      continue;
    }
    if (inFence) out.push(line);
  }
  return out;
}

const substitute = (line) =>
  TOKEN_VARS.reduce((acc, v) => acc.split(`"$${v}"`).join(SENTINEL).split(`$${v}`).join(SENTINEL), line);

// Only shape allowed to carry a live token: printf into a pipe feeding --password-stdin.
const ALLOWED = new RegExp(`^\\s*printf '%s' ${SENTINEL} \\| .*--password-stdin`);

// ── 1. no credential ever reaches a command line or an echo ───────────────
{
  const leaks = [];
  for (const [name, text] of Object.entries(FILES)) {
    for (const line of bashLines(text)) {
      const s = substitute(line);
      if (s.includes(SENTINEL) && !ALLOWED.test(s)) leaks.push(`${name}: ${line.trim()}`);
    }
  }
  check('sentinel.no-argv-or-echo-leak', leaks, [], 'every token reference in a bash block is a stdin-only printf pipe');
}

// ── 2. every docker login in a bash block reads the secret from stdin ─────
{
  const logins = [];
  const bad = [];
  for (const [name, text] of Object.entries(FILES)) {
    for (const line of bashLines(text)) {
      if (!line.includes('docker login')) continue;
      logins.push(`${name}`);
      if (!line.includes('--password-stdin')) bad.push(`${name}: ${line.trim()}`);
    }
  }
  check('login.count', logins.length, 11, 'the shipped bash blocks contain exactly 11 docker login commands');
  check('login.all-password-stdin', bad, [], 'every one of them uses --password-stdin');
  const argvPass = Object.entries(FILES).flatMap(([name, text]) =>
    bashLines(text).filter((l) => / -p \S/.test(l) && l.includes('docker login')).map((l) => `${name}: ${l.trim()}`),
  );
  check('login.no-p-flag', argvPass, [], 'no docker login passes a password with -p');
}

// ── 3. BT-F22: AskUserQuestion is never the credential channel ────────────
{
  check(
    'auq.skill-no-credential-question',
    FILES['SKILL.md'].split('Use AskUserQuestion for registry credentials').length - 1,
    0,
    'SKILL.md no longer routes registry credentials through AskUserQuestion',
  );
  check(
    'auq.auth-flow-not-an-option',
    FILES['references/docker-auth-flow.md'].split('or AskUserQuestion').length - 1,
    0,
    'docker-auth-flow.md no longer lists AskUserQuestion as a token source',
  );
  const tmplAuq = FILES['templates/ssh-admin-agent.md.template'].split('\n').filter((l) => l.includes('AskUserQuestion'));
  check(
    'auq.template-mentions-absence-only',
    tmplAuq,
    ['You have no `AskUserQuestion`. Do every non-destructive step, execute NOTHING destructive, and end'],
    'the generated agent mentions AskUserQuestion only to state that it does not have it',
  );
  check(
    'auq.template-tools',
    FILES['templates/ssh-admin-agent.md.template'].split('\n').filter((l) => l.startsWith('tools:')),
    ['tools: Read, Write, Edit, Bash, Grep, Glob'],
    'the generated agent no longer declares the inert AskUserQuestion tool',
  );
}

// ── 4. approval-envelope contract is present on both sides ───────────────
{
  const fields = ['COMMAND:', 'HOST:', 'EFFECT:', 'ROLLBACK:', 'EVIDENCE:', 'PRECONDITION:'];
  const missingSkill = fields.filter((f) => !FILES['SKILL.md'].includes(f));
  const missingTmpl = fields.filter((f) => !FILES['templates/ssh-admin-agent.md.template'].includes(f));
  check('envelope.skill-fields', missingSkill, [], 'SKILL.md defines all six envelope fields');
  check('envelope.template-fields', missingTmpl, [], 'the generated agent defines all six envelope fields');
  check(
    'envelope.approval-token',
    [FILES['SKILL.md'].includes('APPROVED:'), FILES['templates/ssh-admin-agent.md.template'].includes('APPROVED:')],
    [true, true],
    'both sides name the APPROVED token as the only authorization',
  );
}

// ── 5. BT-F12: no blind keyscan, fingerprints verified instead ───────────
{
  const blind = Object.entries(FILES).flatMap(([name, text]) =>
    bashLines(text).filter((l) => l.includes('ssh-keyscan') && l.includes('>> ~/.ssh/known_hosts')).map((l) => `${name}: ${l.trim()}`),
  );
  check('keyscan.no-blind-append', blind, [], 'no ssh-keyscan output is appended straight into known_hosts');
  check(
    'keyscan.no-silenced-scan',
    Object.entries(FILES).flatMap(([name, text]) =>
      bashLines(text).filter((l) => l.includes('ssh-keyscan') && l.includes('2>/dev/null')).map((l) => `${name}: ${l.trim()}`),
    ),
    [],
    'no ssh-keyscan hides its errors with 2>/dev/null',
  );
  check(
    'keyscan.fingerprint-counts',
    [
      FILES['SKILL.md'].split('ssh-keygen -lf').length - 1,
      FILES['references/ssh-best-practices.md'].split('ssh-keygen -lf').length - 1,
    ],
    [3, 3],
    'SKILL.md names the fingerprint check three times (scan, question, console recipe); ssh-best-practices covers setup, rotation and the console recipe',
  );
  check(
    'keyscan.no-strict-off',
    Object.entries(FILES).flatMap(([name, text]) =>
      text.split('\n').filter((l) => l.includes('StrictHostKeyChecking=no') && !l.includes('Never') && !l.includes('| `no` |')).map((l) => `${name}: ${l.trim()}`),
    ),
    [],
    'StrictHostKeyChecking=no appears only as a prohibition',
  );
}

// ── 6. BT-F21 doc half: the promised bound is actually emitted ───────────
{
  check(
    'deadline.exec-blocks',
    FILES['SKILL.md'].split('SSH_DISCOVER_TIMEOUT=30 bash').length - 1,
    2,
    'both server-discover.sh EXEC blocks carry the promised 30s bound',
  );
  check(
    'deadline.no-gnu-timeout',
    FILES['SKILL.md'].split('timeout 30 bash').length - 1,
    0,
    'the unimplemented `timeout 30 bash` promise is gone (no GNU timeout on macOS)',
  );
}

// ── 7. runtime: the canonical login line leaks nothing into argv ─────────
{
  const CANON =
    `printf '%s' "$GHCR_TOKEN" | ssh SERVERNAME "docker login ghcr.io -u USERNAME --password-stdin" >/dev/null 2>&1`;
  check(
    'runtime.line-is-shipped',
    FILES['SKILL.md'].split(CANON).length - 1,
    1,
    'the executed line is lifted verbatim from SKILL.md, so the test tracks the doc',
  );

  const base = realpathSync(mkdtempSync(join(tmpdir(), 'ssh-secrets-')));
  const bin = join(base, 'bin');
  mkdirSync(bin);
  const argvLog = join(base, 'argv.log');
  const stdinLog = join(base, 'stdin.log');
  writeFileSync(
    join(bin, 'ssh'),
    `#!/bin/bash\nfor a in "$@"; do printf '%s\\n' "$a" >> "${argvLog}"; done\ncat > "${stdinLog}"\n`,
  );
  chmodSync(join(bin, 'ssh'), 0o755);
  const r = spawnSync('bash', ['-c', CANON], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GHCR_TOKEN: SENTINEL },
    timeout: 20000,
  });
  const argv = readFileSync(argvLog, 'utf8').split('\n').filter((x) => x.length > 0);
  const stdin = readFileSync(stdinLog, 'utf8');
  check('runtime.exit', r.status, 0, 'the login idiom runs against the stub');
  check(
    'runtime.argv',
    argv,
    ['SERVERNAME', 'docker login ghcr.io -u USERNAME --password-stdin'],
    'ssh argv is exactly host + remote command, with no credential in it',
  );
  check('runtime.stdin', stdin, SENTINEL, 'the token reaches the remote docker login through stdin only');
  check('runtime.stdout', r.stdout, '', 'nothing is echoed to the transcript');
  rmSync(base, { recursive: true, force: true });
}

console.log(results.join('\n'));
console.log(`\nsuite-secrets: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
