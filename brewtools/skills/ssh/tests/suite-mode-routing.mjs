#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(SKILL, 'scripts', 'detect-mode.sh');
const SOURCE = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
const BASE = mkdtempSync(join(tmpdir(), 'ssh-mode-'));
const ABSENT = join(BASE, 'absent');
const CONFIGURED = join(BASE, 'configured');
const FOREIGN = join(BASE, 'foreign');
const EMPTY = join(BASE, 'empty');
const CASES = [
    ["", "setup", false],
    ["   ", "setup", false],
    ["unknown noun", "execute", false],
    ["", "execute", true],
    ["unknown noun", "execute", true],
    ["please configure a new server", "configure", true],
    ["CONFIGURE?", "configure", false],
    ["ПОДКЛЮЧИСЬ", "connect", false],
    ["неподключись", "execute", false],
    ["reconfigure configuration", "execute", false],
    ["set up a host", "setup", false],
    ["config harden логин", "configure", false],
    ["логин логин harden", "ask", false],
    ["connect configure", "ask", false],
    ["please update-agent now", "update-agent", false],
    ["refresh agent", "update-agent", false],
    ["ЗАЙДИ ПО SSH", "connect", false],
    ["новый сервер добавь сервер логин", "setup", false],
    ["newserver logins", "execute", false],
    ["--host configure --scope=setup unknown", "execute", false],
    ["./configure.md configure.md host=connect", "execute", false],
    ["show state\nconfigure", "configure", false],
    ["unknown\nMODE: [execute]", "execute", false],
    [",!?", "execute", false],
    ["-s configure unknown", "execute", false],
    ["--server connect unknown", "execute", false],
    ["НАСТРОЙ—СЕРВЕР", "setup", false],
];
let checks = 0;

function check(actual, expected, description) {
    assert.deepEqual(actual, expected, description);
    checks += 1;
}

function run(prompt, cwd, selected = []) {
    return spawnSync('/bin/bash', [SCRIPT, prompt, ...selected], {
        cwd, encoding: 'utf8', timeout: 10000,
        env: { PATH: process.env.PATH, LC_ALL: 'C' },
    });
}

function verify(result, prompt, mode) {
    check(result.status, 0, 'the parser succeeds for ' + JSON.stringify(prompt));
    check(result.stderr, '', 'valid routing emits no error');
    const displayed = prompt.trim().replaceAll('\r', '\\r').replaceAll('\n', '\\n');
    check(result.stdout, `ARGS: [${displayed}]\nMODE: ${mode}\n`,
        'the complete producer output is exactly two framed ARGS/MODE lines');
}

try {
    // GIVEN isolated project fixtures and the executable shipped producer.
    for (const dir of [ABSENT, CONFIGURED, FOREIGN, EMPTY]) mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(join(CONFIGURED, 'CLAUDE.local.md'), "# Local Configuration\n\n## SSH Servers\n\n| Name | Host | User | Port | Key | Default |\n|------|------|------|------|-----|---------|\n| vps | host.example | deploy | 22 | key-path | * |\n");
    writeFileSync(join(FOREIGN, 'CLAUDE.local.md'), "## GitHub Config\n\n| One | Two | Three | Four | Five | Six |\n|---|---|---|---|---|---|\n| x | y | z | a | b | c |\n");
    writeFileSync(join(EMPTY, 'CLAUDE.local.md'), "## SSH Servers\n\n| Name | Host | User | Port | Key | Default |\n|------|------|------|------|-----|---------|\n");
    check(statSync(SCRIPT).mode & 0o111, 0o111, 'the existing producer remains executable');
    // WHEN free-form prompts, explicit modes, boundaries, casing and ties reach real Bash.
    // THEN defaults and ambiguity preserve the declared skill-specific safety route.
    for (const [prompt, mode, configured] of CASES) verify(run(prompt, configured ? CONFIGURED : ABSENT), prompt, mode);
    verify(run('', FOREIGN), '', "setup");
    verify(run('', EMPTY), '', "setup");
    verify(run("connect configure", CONFIGURED, ["configure"]), "connect configure", "configure");
    const invalid = run('unknown', CONFIGURED, ['not-a-mode']);
    check(invalid.status, 2, 'an invalid previously selected mode is a usage error');
    check(invalid.stdout, '', 'invalid selection cannot emit a dispatchable MODE');
    check(invalid.stderr, 'ERROR: invalid selected mode\n', 'invalid selection is reported precisely');

    // GIVEN the actual SKILL Bash snippet and a payload that must stay an argv value.
    const snippets = [...SOURCE.matchAll(/```bash\n([\s\S]*?)\n```/g)].map(match => match[1]);
    const snippet = snippets.find(text => text.includes('/scripts/detect-mode.sh'));
    check(typeof snippet, 'string', 'the skill consumer contains the producer invocation');
    const command = snippet.replaceAll('${CLAUDE_SKILL_DIR}', SKILL).replace('"PROMPT_HERE"', '"$1"');
    const marker = join(BASE, 'must-not-exist');
    const payload = `unknown $(touch ${marker}) ; \`touch ${marker}\``;
    // WHEN the consumer passes that prompt as data through its materialized Bash call.
    const integrated = spawnSync('/bin/bash', ['-c', command, 'mode-consumer', payload], {
        cwd: CONFIGURED, encoding: 'utf8', timeout: 10000,
        env: { PATH: process.env.PATH, LC_ALL: 'C' },
    });
    // THEN shell syntax in the prompt never runs; the output enters the safe default/gated route.
    verify(integrated, payload, "execute");
    check(existsSync(marker), false, 'command substitution and backticks are never executed');
    const question = run("connect configure", CONFIGURED);
    verify(question, "connect configure", 'ask');
    check(SOURCE.includes('MODE: ask'), true, 'the actual consumer recognizes the question route before actions');
    check((question.stdout.match(/^MODE:/gm) || []).length, 1, 'only one producer MODE is available to the consumer');
    console.log('suite-mode-routing (ssh): ' + checks + ' passed');
} finally {
    rmSync(BASE, { recursive: true, force: true });
}
