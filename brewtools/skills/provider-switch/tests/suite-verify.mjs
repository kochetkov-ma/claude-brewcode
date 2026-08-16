#!/usr/bin/env node
/**
 * suite-verify.mjs - BT-F20 (response validation) + BT-F02 (no `eval` on ~/.zshrc).
 *
 * `curl` is shadowed by a stub on PATH that replays a canned body and HTTP code, so the suite
 * is fully offline. HOME is a temp dir; the real ~/.zshrc is never read.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRunner, makeBase } from './harness.mjs';

const HERE = join(fileURLToPath(import.meta.url), '..');
const SCRIPTS = join(HERE, '..', 'scripts');
const VERIFY = join(SCRIPTS, 'verify-providers.sh');

const { check, report } = createRunner('suite-verify');
const BASE = makeBase('prv-verify-');

const BIN = join(BASE, 'bin');
const HOME_DIR = join(BASE, 'home');
mkdirSync(BIN, { recursive: true });
mkdirSync(HOME_DIR, { recursive: true });

// Stub curl: replays $STUB_BODY then "\n$STUB_CODE" (matching -w "\n%{http_code}"), and records
// both argv and the -K config it reads from stdin, so the argv leak and the actually-sent
// Authorization header can each be asserted exactly.
const STUB = join(BIN, 'curl');
writeFileSync(STUB, `#!/bin/bash
[[ -n "\${STUB_ARGV_LOG:-}" ]] && printf '%s' "\$*" > "\$STUB_ARGV_LOG"
[[ -n "\${STUB_CFG_LOG:-}" ]] && cat > "\$STUB_CFG_LOG"
printf '%s' "\${STUB_BODY:-}"
printf '\\n%s' "\${STUB_CODE:-200}"
`);
chmodSync(STUB, 0o755);

const CLEAN_ENV = { ...process.env, PATH: `${BIN}${delimiter}${process.env.PATH}`, HOME: HOME_DIR };
for (const k of ['DEEPSEEK_API_KEY', 'ZAI_API_KEY', 'DASHSCOPE_API_KEY', 'MINIMAX_API_KEY', 'OPENROUTER_API_KEY']) {
  delete CLEAN_ENV[k];
}

const kv = (out, key) => {
  const line = out.split('\n').find((l) => l.startsWith(`${key}=`));
  return line === undefined ? null : line.slice(key.length + 1);
};

function runVerify(target, { body = '', code = '200', env = {} } = {}) {
  return spawnSync('bash', [VERIFY, target], {
    env: { ...CLEAN_ENV, STUB_BODY: body, STUB_CODE: code, ...env },
    encoding: 'utf8',
  });
}

const KEY = 'sk-verify-test-key';
const withKey = { DEEPSEEK_API_KEY: KEY };

// ── 1. a real completion passes ─────────────────────────────────────────────
{
  const body = JSON.stringify({ model: 'deepseek-v4-pro', content: [{ type: 'text', text: 'OK' }] });
  const r = runVerify('deepseek', { body, env: withKey });
  check('pass.exit', r.status, 0, 'verify-providers.sh exits 0');
  check('pass.key-set', kv(r.stdout, 'KEY_SET'), 'true', 'the key is seen');
  check('pass.http', kv(r.stdout, 'HTTP_CODE'), '200', 'HTTP code is reported verbatim');
  check('pass.response', kv(r.stdout, 'RESPONSE'), 'OK', 'RESPONSE is OK');
  check('pass.status', kv(r.stdout, 'STATUS'), 'pass', 'a 200 with a text block saying OK passes');
  check('pass.model', kv(r.stdout, 'MODEL'), 'deepseek-v4-pro', 'MODEL echoes the answered model id');
  check('pass.no-warning', kv(r.stdout, 'WARNING'), null, 'a matching model id emits no warning');
}

// ── 2. the BT-F20 false-pass bodies all fail ────────────────────────────────
{
  const cases = [
    ['html', '<html><body>502 Bad Gateway</body></html>', '200 with no assistant text block'],
    ['empty-json', '{}', '200 with no assistant text block'],
    ['no-text-block', JSON.stringify({ model: 'deepseek-v4-pro', content: [{ type: 'thinking', thinking: 'OK' }] }),
      '200 with no assistant text block'],
  ];
  for (const [name, body, reason] of cases) {
    const r = runVerify('deepseek', { body, env: withKey });
    check(`false200.${name}.status`, kv(r.stdout, 'STATUS'), 'fail', `a 200 body "${name}" is NOT a pass`);
    check(`false200.${name}.reason`, kv(r.stdout, 'RESPONSE'), reason, 'the reason names the missing text block');
  }
}

{
  // A normalised/substituted model id is a WARNING, never a failure - an aggregator would
  // otherwise fail a perfectly working key.
  const body = JSON.stringify({ model: 'deepseek-chat', content: [{ type: 'text', text: 'OK' }] });
  const r = runVerify('deepseek', { body, env: withKey });
  check('mismatch.status', kv(r.stdout, 'STATUS'), 'pass', 'a 200 answering a different model still passes');
  check('mismatch.model', kv(r.stdout, 'MODEL'), 'deepseek-chat', 'MODEL echoes what the provider answered');
  check('mismatch.warning', kv(r.stdout, 'WARNING'),
    'model mismatch: requested deepseek-v4-pro, answered deepseek-chat', 'the warning names both model ids');
}

{
  const body = JSON.stringify({ model: 'deepseek-v4-pro', content: [{ type: 'text', text: 'Sure, here you go.' }] });
  const r = runVerify('deepseek', { body, env: withKey });
  check('notok.status', kv(r.stdout, 'STATUS'), 'fail', 'a 200 whose text is not OK is NOT a pass');
}

{
  const body = JSON.stringify({ error: { message: 'invalid api-key' } });
  const r = runVerify('deepseek', { body, code: '200', env: withKey });
  check('err200.status', kv(r.stdout, 'STATUS'), 'fail', 'a 200-wrapped provider error is NOT a pass');
  check('err200.reason', kv(r.stdout, 'RESPONSE'), 'invalid api-key', 'the provider error message is surfaced');
}

{
  const body = JSON.stringify({ error: { message: 'invalid api-key' } });
  const r = runVerify('deepseek', { body, code: '403', env: withKey });
  check('err403.http', kv(r.stdout, 'HTTP_CODE'), '403', 'the HTTP code is reported verbatim');
  check('err403.status', kv(r.stdout, 'STATUS'), 'fail', 'a 403 fails');
}

// ── 3. no key at all is a skip, not a pass ──────────────────────────────────
{
  const r = runVerify('deepseek', { body: '{}' });
  check('skip.key-set', kv(r.stdout, 'KEY_SET'), 'false', 'an absent key is reported');
  check('skip.status', kv(r.stdout, 'STATUS'), 'skip', 'an absent key is skipped, never passed');
}

// ── 4. BT-F02: ~/.zshrc is PARSED, never eval'd ─────────────────────────────
{
  const src = readFileSync(VERIFY, 'utf8');
  check('noeval.source', /(^|\s)eval\s/.test(src), false, 'verify-providers.sh contains no `eval`');
}

{
  // A key that would execute if eval'd, stored the way write-alias.sh writes it.
  const nasty = `sk-a'b$(touch ${join(BASE, 'PWNED')})\`id\`"c`;
  const stored = nasty.split("'").join(`'\\''`);
  writeFileSync(join(HOME_DIR, '.zshrc'),
    `# ========== Claude Code Provider Aliases ==========\nexport DEEPSEEK_API_KEY='${stored}'\n`);
  const cfgLog = join(BASE, 'cfg.txt');
  const body = JSON.stringify({ model: 'deepseek-v4-pro', content: [{ type: 'text', text: 'OK' }] });
  const r = runVerify('deepseek', { body, env: { STUB_CFG_LOG: cfgLog } });

  check('parse.status', kv(r.stdout, 'STATUS'), 'pass', 'a key loaded from ~/.zshrc reaches the request');
  // curl's config parser needs `\` and `"` escaped inside the quoted value.
  const cfgEscaped = nasty.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  check('parse.exact', readFileSync(cfgLog, 'utf8'), `header = "Authorization: Bearer ${cfgEscaped}"\n`,
    'the parsed key is byte-identical to the original, quotes and all');
  check('parse.no-exec', existsSync(join(BASE, 'PWNED')), false,
    'the command substitution embedded in the key never executed');
  check('parse.no-leak', r.stdout.includes(nasty), false, 'the key never appears in verify output');
}

{
  // An env var set out of band must win over the ~/.zshrc copy.
  const cfgLog = join(BASE, 'cfg-env.txt');
  const body = JSON.stringify({ model: 'deepseek-v4-pro', content: [{ type: 'text', text: 'OK' }] });
  const r = runVerify('deepseek', { body, env: { DEEPSEEK_API_KEY: 'sk-env-wins', STUB_CFG_LOG: cfgLog } });
  check('precedence.status', kv(r.stdout, 'STATUS'), 'pass', 'the env-var path works');
  check('precedence.exact', readFileSync(cfgLog, 'utf8'), 'header = "Authorization: Bearer sk-env-wins"\n',
    'an exported key wins over the ~/.zshrc copy');
}

// ── 5. the key never reaches curl's argv (readable by any local `ps`) ───────
{
  const SENTINEL = 'sk-ARGV-SENTINEL-4b7e1c9a2f-DO-NOT-LEAK';
  const argvLog = join(BASE, 'argv.txt');
  const cfgLog = join(BASE, 'cfg-argv.txt');
  const body = JSON.stringify({ model: 'deepseek-v4-pro', content: [{ type: 'text', text: 'OK' }] });
  const r = runVerify('deepseek', {
    body,
    env: { DEEPSEEK_API_KEY: SENTINEL, STUB_ARGV_LOG: argvLog, STUB_CFG_LOG: cfgLog },
  });
  const argv = readFileSync(argvLog, 'utf8');

  check('argv.status', kv(r.stdout, 'STATUS'), 'pass', 'the request still succeeds');
  check('argv.leak', argv.includes(SENTINEL), false, 'the key never reaches curl argv, so `ps` cannot see it');
  check('argv.no-auth-header', argv.includes('Authorization'), false, 'no Authorization header on argv at all');
  check('argv.uses-config-stdin', argv.includes('-K -'), true, 'the header is passed via a -K config on stdin');
  check('argv.delivered', readFileSync(cfgLog, 'utf8'), `header = "Authorization: Bearer ${SENTINEL}"\n`,
    'the key is still delivered - through stdin, exactly once');
  check('argv.stdout-leak', r.stdout.includes(SENTINEL), false, 'the key never reaches stdout');
  check('argv.stderr-leak', r.stderr.includes(SENTINEL), false, 'the key never reaches stderr');
}

// ── 6. curl config quoting survives a key holding `"` and `\` ──────────────
{
  const tricky = 'sk-a"b\\c';
  const cfgLog = join(BASE, 'cfg-tricky.txt');
  const body = JSON.stringify({ model: 'deepseek-v4-pro', content: [{ type: 'text', text: 'OK' }] });
  runVerify('deepseek', { body, env: { DEEPSEEK_API_KEY: tricky, STUB_CFG_LOG: cfgLog } });
  check('cfg.escaping', readFileSync(cfgLog, 'utf8'), 'header = "Authorization: Bearer sk-a\\"b\\\\c"\n',
    'a key holding a quote and a backslash is escaped for curl\'s config parser');
}

// ── 6b. the DOCUMENTED curl snippets keep the key off argv too ──────────────
// The scripts are not the only thing that runs: SKILL.md and the references hand the model curl
// lines it is told to EXEC verbatim. Same sentinel idiom as section 5, applied to the docs.
{
  const SKILL_DIR = join(HERE, '..');
  const docs = ['SKILL.md', 'references/update-protocol.md', 'references/openrouter-models.md'];
  const bashBlocks = (text) => [...text.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]);

  const offenders = [];
  for (const doc of docs) {
    for (const block of bashBlocks(readFileSync(join(SKILL_DIR, doc), 'utf8'))) {
      if (!block.includes('curl')) continue;
      // a key on argv = an -H argument whose value interpolates a secret variable
      if (/-H\s+["'][^"']*\$\{?[A-Z_]*(API_KEY|TOKEN)/.test(block)) offenders.push(doc);
    }
  }
  check('docs.no-key-on-argv', offenders.join(','), '', 'no documented curl puts a key in an -H argument');

  // and the Z.ai live test from SKILL.md, executed exactly as written, against the curl stub
  const SENTINEL = 'sk-DOC-SENTINEL-91f3ad7e60-DO-NOT-LEAK';
  const argvLog = join(BASE, 'doc-argv.txt');
  const cfgLog = join(BASE, 'doc-cfg.txt');
  const snippet = bashBlocks(readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8'))
    .find((b) => b.includes('api.z.ai') && b.includes('curl'));
  check('docs.zai-snippet-found', typeof snippet, 'string', 'the Z.ai live-test snippet is still in SKILL.md');
  const r = spawnSync('bash', ['-c', snippet], {
    env: { ...CLEAN_ENV, ZAI_API_KEY: SENTINEL, STUB_ARGV_LOG: argvLog, STUB_CFG_LOG: cfgLog, STUB_CODE: '200' },
    encoding: 'utf8',
  });
  const docArgv = readFileSync(argvLog, 'utf8');
  check('docs.zai-runs', r.stdout.includes('OK'), true, 'the documented snippet still reports OK');
  check('docs.zai-argv-leak', docArgv.includes(SENTINEL), false, 'the documented snippet keeps the key off argv');
  check('docs.zai-config-stdin', docArgv.includes('-K -'), true, 'it uses the same -K config-on-stdin dialect');
  check('docs.zai-delivered', readFileSync(cfgLog, 'utf8'), `header = "x-api-key: ${SENTINEL}"\n`,
    'the key is still delivered through stdin, exactly once');
}

// ── 7. unknown target ───────────────────────────────────────────────────────
{
  const r = runVerify('nosuch', { body: '{}' });
  check('usage.exit', r.status, 1, 'an unknown target exits 1');
  check('usage.text', r.stdout.startsWith('Usage: verify-providers.sh'), true, 'usage is printed');
}

report();
