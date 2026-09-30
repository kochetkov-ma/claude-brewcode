#!/usr/bin/env node
/** Real writer/startup/alias invocation fixtures; isolated HOME and a harmless claude stub. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, rmSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRunner, makeBase } from './harness.mjs';

const HERE = join(fileURLToPath(import.meta.url), '..');
const WRITER = join(HERE, '..', 'scripts', 'write-alias.sh');
const HELPER = join(HERE, '..', 'scripts', 'provider-alias.py');
const STATUS = join(HERE, '..', 'scripts', 'check-status.sh');
const VERIFY = join(HERE, '..', 'scripts', 'verify-providers.sh');
const { check, report } = createRunner('suite-alias');
const BASE = makeBase('prv-alias-');
const env = { ...process.env };
for (const key of ['DEEPSEEK_API_KEY', 'ZAI_API_KEY', 'DASHSCOPE_API_KEY', 'MINIMAX_API_KEY', 'OPENROUTER_API_KEY']) delete env[key];

function world(label) {
  const root = join(BASE, label), home = join(root, 'home'), bin = join(root, 'bin');
  mkdirSync(home, { recursive: true }); mkdirSync(bin, { recursive: true });
  const stub = join(bin, 'claude');
  writeFileSync(stub, '#!/bin/bash\nprintf "%s\\n" "$ANTHROPIC_DEFAULT_OPUS_MODEL" "$ANTHROPIC_DEFAULT_SONNET_MODEL" "$ANTHROPIC_DEFAULT_HAIKU_MODEL" "$ANTHROPIC_BASE_URL" "${CLAUDE_ENABLE_BYTE_WATCHDOG:-none}" "${CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS:-none}"\n');
  chmodSync(stub, 0o755);
  const childEnv = { ...env, HOME: home, PATH: `${bin}${delimiter}${process.env.PATH}` };
  const run = args => spawnSync('bash', [WRITER, ...args], { env: childEnv, encoding: 'utf8' });
  run(['init']);
  return { root, home, run, childEnv, request: join(root, 'request.json'), rc: join(home, '.zshrc') };
}

const models = [
  ['deepseek', 'deepseek-v4-pro', 'https://api.deepseek.com/anthropic', 'none', 'none'],
  ['glm', 'glm-5.2', 'https://api.z.ai/api/anthropic', '0', '1'],
  ['qwen', 'qwen3.7-plus[1m]', 'https://dashscope-intl.aliyuncs.com/apps/anthropic', 'none', '1'],
  ['minimax', 'MiniMax-M3', 'https://api.minimax.io/anthropic', '0', '1'],
  ['openrouter', 'qwen/qwen3.7-plus[1m]', 'https://openrouter.ai/api', 'none', 'none'],
];
for (const [provider, model, endpoint, watchdog, betas] of models) {
  // GIVEN JSON data and the current provider defaults; WHEN written and invoked in real zsh.
  const w = world(provider), name = 'claudefixture';
  writeFileSync(w.request, JSON.stringify({ alias_name: name, provider, model_id: model }));
  const write = w.run(['set-alias', '--request', w.request]);
  check(`${provider}.write`, write.status, 0, 'structured request produces a provider alias');
  const invoke = spawnSync('zsh', ['-f', '-c', '. "$1"; eval "$2"', 'zsh', w.rc, name], { env: w.childEnv, encoding: 'utf8' });
  // THEN all roles, endpoints and required compatibility flags reach only the harmless stub.
  check(`${provider}.invoke`, invoke.status, 0, 'serialized alias parses and invokes in actual zsh');
  check(`${provider}.values`, invoke.stdout, [model, model, model, endpoint, watchdog, betas, ''].join('\n'), 'current models and compatibility flags survive startup and invocation');
  check(`${provider}.stderr`, invoke.stderr, '', 'quoted client suffix does not trigger shell glob errors');
  const refFile = { deepseek: 'deepseek', glm: 'zai-glm', qwen: 'qwen-dashscope', minimax: 'minimax', openrouter: 'openrouter' }[provider];
  const reference = readFileSync(join(HERE, '..', `references/${refFile}.md`), 'utf8');
  const referenceBody = reference.match(/^alias [a-z0-9]+='(.+)'$/m)[1].replaceAll('"MODEL"', `"${model}"`);
  check(`${provider}.reference-contract`, w.run(['set-alias', 'claudefixture', referenceBody]).status, 0, 'current shipped reference core/flags match the legacy producer contract');
}

const attacks = [
  ['quote', "vendor/model'; touch PWNED; '"],
  ['substitution', 'vendor/$(touch PWNED)'],
  ['backtick', 'vendor/`touch PWNED`'],
  ['newline', 'vendor/model\ntouch PWNED'],
  ['dollar', 'vendor/${IFS}model'],
  ['semicolon', 'vendor/model;touch PWNED'],
];
for (const [label, model] of attacks) {
  // GIVEN malicious model data; WHEN passed through the actual JSON writer.
  const w = world(label), before = readFileSync(w.rc, 'utf8');
  writeFileSync(w.request, JSON.stringify({ alias_name: 'claudefixture', provider: 'openrouter', model_id: model }));
  const write = w.run(['set-alias', '--request', w.request]);
  // THEN rejection precedes backup or mutation, and later shell startup executes nothing.
  check(`${label}.reject`, write.status, 1, 'shell syntax in model data is rejected');
  check(`${label}.unchanged`, readFileSync(w.rc, 'utf8'), before, 'rejected input leaves .zshrc byte-identical');
  check(`${label}.no-backup`, existsSync(w.rc + '.bak'), false, 'rejected data creates no backup');
  const source = spawnSync('zsh', ['-f', '-c', '. "$1"', 'zsh', w.rc], { cwd: w.root, env: w.childEnv, encoding: 'utf8' });
  check(`${label}.startup`, source.status, 0, 'unchanged startup remains valid');
  check(`${label}.no-exec`, existsSync(join(w.root, 'PWNED')), false, 'payload did not execute at write or startup');
}

{
  // GIVEN the old three-argument provider format; WHEN serialized by the new producer.
  const w = world('legacy');
  const body = 'export ANTHROPIC_BASE_URL=https://openrouter.ai/api; export ANTHROPIC_AUTH_TOKEN="$OPENROUTER_API_KEY"; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL="qwen/qwen3.7-plus[1m]"; export ANTHROPIC_DEFAULT_SONNET_MODEL="qwen/qwen3.7-plus[1m]"; export ANTHROPIC_DEFAULT_HAIKU_MODEL="qwen/qwen3.7-plus[1m]"; claude';
  check('legacy.valid', w.run(['set-alias', 'claudelegacy', body]).status, 0, 'recognized legacy provider form remains supported');
  const before = readFileSync(w.rc, 'utf8');
  check('legacy.reject', w.run(['set-alias', 'claudelegacy', body.replaceAll('qwen/qwen3.7-plus[1m]', 'qwen/$(touch PWNED)')]).status, 1, 'legacy model injection is rejected without eval');
  check('legacy.unchanged', readFileSync(w.rc, 'utf8'), before, 'rejected legacy request preserves configured model');
  check('name.reject', w.run(['set-alias', 'claude.*', body]).status, 1, 'alias grammar rejects regex/shell metacharacters');
  check('name.unchanged', readFileSync(w.rc, 'utf8'), before, 'bad alias name cannot delete unrelated lines');
}

{
  // GIVEN an explicitly selected documented Qwen endpoint; WHEN the JSON writer applies it.
  const w = world('qwen-region'), endpoint = 'https://workspace.ap-southeast-1.maas.aliyuncs.com/apps/anthropic';
  writeFileSync(w.request, JSON.stringify({ alias_name: 'clauderegion', provider: 'qwen', model_id: 'qwen3.7-plus[1m]', base_url: endpoint }));
  check('qwen.explicit-endpoint', w.run(['set-alias', '--request', w.request]).status, 0, 'explicit documented region/workspace endpoint is supported');
  const before = readFileSync(w.rc, 'utf8');
  writeFileSync(w.request, JSON.stringify({ alias_name: 'clauderegion', provider: 'qwen', model_id: 'qwen3.7-plus[1m]', base_url: 'https://attacker.invalid' }));
  check('endpoint.reject', w.run(['set-alias', '--request', w.request]).status, 1, 'unknown endpoint data is rejected');
  check('endpoint.unchanged', readFileSync(w.rc, 'utf8'), before, 'invalid endpoint cannot replace selected configuration');
}

const skill = readFileSync(join(HERE, '..', 'SKILL.md'), 'utf8');
for (const endpoint of [
  'https://workspace.cn-beijing.maas.aliyuncs.com/apps/anthropic',
  'https://workspace.ap-southeast-1.maas.aliyuncs.com/apps/anthropic',
  'https://workspace.us-east-1.maas.aliyuncs.com/apps/anthropic',
  'https://coding-intl.dashscope.aliyuncs.com/apps/anthropic',
]) {
  // GIVEN an actual supported alias; WHEN its exported environment reaches the actual status consumer.
  const w = world(endpoint.split('/')[2]), request = { alias_name: 'clauderegion', provider: 'qwen', model_id: 'qwen3.7-max[1m]', base_url: endpoint };
  writeFileSync(w.request, JSON.stringify(request));
  check(`status.${endpoint}.write`, w.run(['set-alias', '--request', w.request]).status, 0, 'supported explicit endpoint is written');
  const run = spawnSync('zsh', ['-f', '-c', '. "$1"; eval "$2"; bash "$3"', 'zsh', w.rc, request.alias_name, STATUS], { env: w.childEnv, encoding: 'utf8' });
  const kv = key => run.stdout.split('\n').find(l => l.startsWith(key + '='));
  check(`status.${endpoint}.provider`, kv('ACTIVE_PROVIDER'), 'ACTIVE_PROVIDER=qwen', 'producer-shaped region alias is classified correctly');
  check(`status.${endpoint}.model`, kv('ACTIVE_OPUS_MODEL'), 'ACTIVE_OPUS_MODEL=qwen3.7-max[1m]', 'status retains selected client model');
  const selection = join(w.root, 'selection.json');
  writeFileSync(selection, JSON.stringify({ alias_name: request.alias_name, provider: request.provider }));
  const inspect = spawnSync('python3', [HELPER, '--inspect', selection], { env: w.childEnv, encoding: 'utf8' });
  check(`inspect.${endpoint}.exit`, inspect.status, 0, 'read-only inspector parses the serialized alias without source/eval');
  check(`inspect.${endpoint}.record`, JSON.parse(inspect.stdout), { status: 'FOUND', request }, 'inspector carries current endpoint/model forward as validated data');
  const before = readFileSync(w.rc, 'utf8');
  writeFileSync(w.request, JSON.stringify(JSON.parse(inspect.stdout).request));
  check(`inspect.${endpoint}.rewrite`, w.run(['set-alias', '--request', w.request]).status, 0, 'carried-forward update remains valid');
  check(`inspect.${endpoint}.preserved`, readFileSync(w.rc, 'utf8'), before, 'update without endpoint/model selection preserves configured bytes');
}
for (const endpoint of ['https://maas.aliyuncs.com.attacker.invalid/apps/anthropic', 'https://attacker.invalid/dashscope', 'https://workspace.eu-west-1.maas.aliyuncs.com/apps/anthropic', 'https://workspace.ap-southeast-1.maas.aliyuncs.com/apps/anthropic/extra']) {
  // GIVEN an unsupported lookalike; WHEN status evaluates it, exact endpoint shapes must win.
  const w = world('lookalike-' + endpoint.split('/')[2]);
  const run = spawnSync('bash', [STATUS], { env: { ...w.childEnv, ANTHROPIC_BASE_URL: endpoint }, encoding: 'utf8' });
  check(`status.lookalike.${endpoint}`, run.stdout.split('\n').find(l => l.startsWith('ACTIVE_PROVIDER=')), 'ACTIVE_PROVIDER=unknown', 'arbitrary domain/path substring cannot classify as Qwen');
}

{
  // GIVEN retained request records for every selected provider and a curl mock; WHEN all are verified.
  const w = world('selected-verification'), records = join(w.root, 'requests'), log = join(w.root, 'curl.jsonl');
  mkdirSync(records);
  const requests = models.map(([provider, model, endpoint]) => ({ alias_name: 'claude' + provider, provider,
    model_id: provider === 'qwen' ? 'qwen3.7-max[1m]' : model,
    base_url: provider === 'qwen' ? 'https://workspace.ap-southeast-1.maas.aliyuncs.com/apps/anthropic' : endpoint }));
  for (const request of requests) writeFileSync(join(records, request.provider + '.json'), JSON.stringify(request));
  const curl = join(w.root, 'bin/curl');
  writeFileSync(curl, '#!/usr/bin/env python3\nimport json,os,sys\nfrom pathlib import Path\na=sys.argv[1:]; config=sys.stdin.read(); payload=json.loads(a[a.index("-d")+1]); record={"args":a,"config":config,"payload":payload}\nwith Path(os.environ["CURL_LOG"]).open("a") as f: f.write(json.dumps(record)+"\\n")\nprint(json.dumps({"model":payload["model"],"content":[{"type":"text","text":"OK"}]}));print("200")\n');
  chmodSync(curl, 0o755);
  const token = 'sk-ISOLATED-VERIFY-FIXTURE';
  const keys = Object.fromEntries(['DEEPSEEK_API_KEY', 'ZAI_API_KEY', 'DASHSCOPE_API_KEY', 'MINIMAX_API_KEY', 'OPENROUTER_API_KEY'].map(key => [key, token]));
  const verified = spawnSync('bash', [VERIFY, 'all', '--requests', records], { cwd: w.root, env: { ...w.childEnv, ...keys, CURL_LOG: log }, encoding: 'utf8' });
  check('selected.verify.exit', verified.status, 0, 'all retained requests are validated and mocked');
  const calls = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  check('selected.verify.urls', calls.map(call => call.args[call.args.indexOf('-X') + 2]), requests.map(request => request.base_url + '/v1/messages'), 'every selected endpoint reaches the mock exactly');
  check('selected.verify.models', calls.map(call => call.payload.model), requests.map(request => request.model_id.replace(/\[1m\]$/, '')), 'every selected model reaches the request, removing only the client suffix');
  check('selected.verify.sources', verified.stdout.split('\n').filter(line => line.startsWith('PROBE_SOURCE=')), Array(5).fill('PROBE_SOURCE=selected-request'), 'every provider record is identified as selected rather than default');
  check('selected.verify.results', verified.stdout.split('\n').filter(line => line.startsWith('STATUS=')), Array(5).fill('STATUS=pass'), 'selected mock endpoints/models pass their actual response gate');
  check('selected.verify.secret-stdin', calls.map(call => call.config), Array(5).fill(`header = "Authorization: Bearer ${token}"\n`), 'token transport remains stdin-only for every selected endpoint');
  check('selected.verify.secret-argv', calls.map(call => call.args.join(' ').includes(token)), Array(5).fill(false), 'no selected request exposes the token in argv');
  check('selected.verify.secret-output', (verified.stdout + verified.stderr).includes(token), false, 'verification output remains token-free');
  writeFileSync(join(records, 'qwen.json'), JSON.stringify({ ...requests[2], model_id: 'qwen/$(touch PWNED)' }));
  rmSync(log);
  const rejected = spawnSync('bash', [VERIFY, 'qwen', '--requests', records], { cwd: w.root, env: { ...w.childEnv, ...keys, CURL_LOG: log }, encoding: 'utf8' });
  check('selected.invalid-request.fail', rejected.stdout.split('\n').find(line => line.startsWith('STATUS=')), 'STATUS=fail', 'invalid selected request fails rather than falling back');
  check('selected.invalid-request.no-http', existsSync(log), false, 'malicious request fails before any mocked HTTP call');
  const fallback = spawnSync('bash', [VERIFY, 'qwen', '--requests', join(w.root, 'absent')], { cwd: w.root, env: { ...w.childEnv, ...keys, CURL_LOG: log }, encoding: 'utf8' });
  check('selected.absent.default-source', fallback.stdout.split('\n').find(line => line.startsWith('PROBE_SOURCE=')), 'PROBE_SOURCE=legacy-default', 'absent request preserves default probe with an honest source');
  check('selected.absent.default-url', fallback.stdout.split('\n').find(line => line.startsWith('PROBE_URL=')), 'PROBE_URL=https://dashscope-intl.aliyuncs.com/apps/anthropic/v1/messages', 'fallback reports the exact legacy endpoint tested');
  check('selected.absent.default-note', fallback.stdout.split('\n').find(line => line.startsWith('PROBE_NOTE=')), 'PROBE_NOTE=selected alias request unavailable; probing legacy default, configured endpoint/model not verified', 'default pass cannot claim configured-alias verification');
}

{
  // GIVEN the actual documented validation command and a public-catalog stub; WHEN JSON model data is checked.
  const w = world('catalog'), dir = join(w.root, '.claude/provider-switch');
  mkdirSync(dir, { recursive: true });
  const curl = join(w.root, 'bin/curl');
  writeFileSync(curl, '#!/bin/bash\nwhile [[ $# -gt 0 ]]; do\n  if [[ "$1" == "-o" ]]; then printf "%s" "$CATALOG_FIXTURE" > "$2"; exit 0; fi\n  shift\ndone\nexit 1\n');
  chmodSync(curl, 0o755);
  const reference = readFileSync(join(HERE, '..', 'references/openrouter-models.md'), 'utf8');
  const snippet = reference.match(/```bash\n([\s\S]*?)\n```/)[1];
  for (const [label, model, expected] of [
    ['menu', 'qwen/qwen3.7-plus', 'FOUND'],
    ['default-suffix', 'qwen/qwen3.7-plus[1m]', 'FOUND'],
    ['custom-missing', 'vendor/missing', 'NOT_FOUND'],
  ]) {
    writeFileSync(join(dir, 'model-request.json'), JSON.stringify({ model_id: model }));
    const run = spawnSync('bash', ['-c', snippet], { cwd: w.root, env: { ...w.childEnv, CATALOG_FIXTURE: JSON.stringify({ data: [{ id: 'qwen/qwen3.7-plus', context_length: 1000000 }] }) }, encoding: 'utf8' });
    check(`catalog.${label}.exit`, run.status, 0, 'actual validation snippet parses the public response');
    check(`catalog.${label}.status`, JSON.parse(run.stdout).status, expected, 'menu/default/custom all receive exact catalog result');
    check(`catalog.${label}.requested`, JSON.parse(run.stdout).requested_model, model, 'requested client id is preserved as data');
  }
  const bad = 'vendor/$(touch PWNED)';
  writeFileSync(join(dir, 'model-request.json'), JSON.stringify({ model_id: bad }));
  const rejected = spawnSync('bash', ['-c', snippet], { cwd: w.root, env: { ...w.childEnv, CATALOG_FIXTURE: JSON.stringify({ data: [{ id: bad }] }) }, encoding: 'utf8' });
  check('catalog.malicious.reject', rejected.status, 1, 'even a matching catalog entry cannot authorize shell syntax');
  check('catalog.malicious.no-exec', existsSync(join(w.root, 'PWNED')), false, 'JSON user text never enters executable shell source');
  writeFileSync(join(dir, 'model-request.json'), JSON.stringify({ model_id: 'qwen/qwen3.7-plus' }));
  const broken = spawnSync('bash', ['-c', snippet], { cwd: w.root, env: { ...w.childEnv, CATALOG_FIXTURE: 'invalid JSON' }, encoding: 'utf8' });
  check('catalog.invalid-json.reject', broken.status, 1, 'catalog parser failure is a verification failure');
  check('catalog.invalid-json.no-absence', broken.stdout, '', 'parser failure does not emit NOT_FOUND or a default');
}

check('skill.fixed-writer', skill.includes('set-alias --request .claude/provider-switch/alias-request.json'), true, 'main flow uses a fixed command and JSON data');
check('skill.no-raw-body', skill.includes('"ALIAS_BODY"'), false, 'main flow contains no raw body interpolation');
check('skill.all-models', skill.includes('Validate EVERY selection'), true, 'menu/default/custom all use catalog validation');
check('skill.no-retired-option', skill.includes('qwen/qwen3-coder:free'), false, 'absent free model is not offered');
check('skill.no-region-inference', skill.includes('Never infer region/validity from prefix or length'), true, 'key shape cannot claim region validity');
rmSync(BASE, { recursive: true, force: true });
report();
