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
const BASE = mkdtempSync(join(tmpdir(), 'deploy-mode-'));
const ABSENT = join(BASE, 'absent');
const CONFIGURED = join(BASE, 'configured');
const FOREIGN = join(BASE, 'foreign');
const EMPTY = join(BASE, 'empty');
const CASES = [
    ["", "setup", false],
    ["  ", "setup", false],
    ["unknown noun", "setup", false],
    ["", "monitor", true],
    ["unknown noun", "monitor", true],
    ["please monitor deployment", "monitor", true],
    ["RELEASE?", "release", false],
    ["РЕЛИЗ", "release", false],
    ["нерелизный", "setup", false],
    ["deployment recreate release-notes.md", "monitor", true],
    ["set up workflows", "setup", false],
    ["bump version статус", "release", true],
    ["статус статус bump", "monitor", true],
    ["release deploy", "ask", true],
    ["MONITOR", "monitor", false],
    ["обнови агента", "update-agent", true],
    ["запусти workflow", "deploy", true],
    ["new workflow add workflow версия", "create", true],
    ["workflow-dispatcher", "monitor", true],
    ["--workflow release --scope=deploy status", "monitor", true],
    ["./deploy.yml deploy.yml workflow=release", "monitor", true],
    ["show state\nmonitor", "monitor", true],
    ["check runs", "monitor", true],
    ["check runs", "monitor", false],
    ["-s release unknown", "monitor", true],
    ["new workflow new workflow bump", "ask", true],
    ["conversion notag", "monitor", true],
    ["«РЕЛИЗ»", "release", true],
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
    writeFileSync(join(CONFIGURED, 'CLAUDE.local.md'), "# Local Configuration\n\n## GitHub Config\n\n| Property | Value |\n|----------|-------|\n| Owner | fixture |\n| Repo | fixture |\n");
    writeFileSync(join(FOREIGN, 'CLAUDE.local.md'), "## SSH Servers\n\n| Name | Host | User | Port | Key | Default |\n|------|------|------|------|-----|---------|\n| vps | host.example | deploy | 22 | key-path | * |\n");
    writeFileSync(join(EMPTY, 'CLAUDE.local.md'), "## GitHub Config\n");
    check(statSync(SCRIPT).mode & 0o111, 0o111, 'the existing producer remains executable');
    // WHEN free-form prompts, explicit modes, boundaries, casing and ties reach real Bash.
    // THEN defaults and ambiguity preserve the declared skill-specific safety route.
    for (const [prompt, mode, configured] of CASES) verify(run(prompt, configured ? CONFIGURED : ABSENT), prompt, mode);
    verify(run('', FOREIGN), '', "setup");
    verify(run('', EMPTY), '', "monitor");
    verify(run("release deploy", CONFIGURED, ["monitor"]), "release deploy", "monitor");
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
    verify(integrated, payload, "monitor");
    check(existsSync(marker), false, 'command substitution and backticks are never executed');
    const question = run("release deploy", CONFIGURED);
    verify(question, "release deploy", 'ask');
    check(SOURCE.includes('MODE: ask'), true, 'the actual consumer recognizes the question route before actions');
    check((question.stdout.match(/^MODE:/gm) || []).length, 1, 'only one producer MODE is available to the consumer');
    console.log('suite-mode-routing (deploy): ' + checks + ' passed');
} finally {
    rmSync(BASE, { recursive: true, force: true });
}
