#!/usr/bin/env node
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const VALIDATOR = join(ROOT, '.codex/scripts/validate-compat.mjs');
const NATIVE = join(ROOT, 'brewcode/.codex/skills/agents');
const DIST = join(ROOT, '.codex/plugins/brewcode/skills/agents');
const REF_NAMES = [
  'agent-context-and-execution.md', 'agent-frontmatter-fields.md', 'agent-scope-and-tools.md',
  'agent-sync.md', 'agent-template.md',
];
const nativeText = readFileSync(join(NATIVE, 'SKILL.md'), 'utf8');
const template = readFileSync(join(NATIVE, 'references/agent-template.md'), 'utf8');
const fences = (text, language) => [...text.matchAll(new RegExp('```' + language + '\\n([\\s\\S]*?)\\n```', 'g'))].map((match) => match[1]);
const validationFence = fences(template, 'bash')[0];
const minimalTemplate = fences(template, 'toml')[0];
const modelTemplate = fences(template, 'toml')[1];
const validateClosure = (root) => spawnSync(process.execPath,
  [VALIDATOR, '--check-native-agent-authoring', root], { encoding: 'utf8', timeout: 30000 });

test('emitted native authoring has current schema/template/context/discovery/sync closure in canonical and distribution trees', () => {
  // GIVEN: freshly generated canonical and shipped native authoring resources.
  for (const root of [NATIVE, DIST]) {
    // WHEN: the real closure checker and reference inventory run.
    const result = validateClosure(root);
    // THEN: the complete native workflow is self-contained.
    assert.equal(result.status, 0, `native resource closure must pass: ${result.stderr}`);
    assert.deepEqual(readdirSync(join(root, 'references')).sort(), REF_NAMES,
      'only dedicated native references are shipped; foreign hook references are not portable');
    for (const name of ['SKILL.md', 'README.md', ...REF_NAMES.map(name => 'references/' + name)]) {
      assert.equal(readFileSync(join(NATIVE, name), 'utf8'), readFileSync(join(DIST, name), 'utf8'),
        `${name} must be identical in canonical and distributed output`);
    }
  }
});

test('actual emitted main brief drives a TOML target and schema-valid materialized template', () => {
  // GIVEN: the actual JSON main brief and native TOML template, including escaped user text.
  const call = JSON.parse(fences(nativeText, 'json')[0]);
  const temp = mkdtempSync(join(tmpdir(), 'native-agent-brief-'));
  try {
    const values = { scope: join(temp, '.codex'), name: 'repository-reader',
      description: 'Read "quoted" repository evidence; return paths.', routing: 'omitted/inherited',
      existing: 'explorer', owners: 'peer owns tests', skill_directory: NATIVE };
    const message = call.message.replace(/\{([a-z_]+)\}/g, (_, key) => values[key]);
    const target = message.match(/^SCOPE: create or improve (\S+\.toml) from/m)[1];
    const resource = message.match(/^SCOPE:.* from (\S+\/references\/agent-template\.md);/m)[1];
    const calls = [];
    const context = vm.createContext({ spawn_agent: (args) => calls.push(args) });
    // WHEN: emitted main arguments reach a native-shaped consumer and its named template is materialized.
    vm.runInContext('spawn_agent(' + JSON.stringify({ ...call, message }) + ')', context);
    assert.equal(calls.length, 1, 'main brief must execute as exactly one native spawn request');
    assert.deepEqual(Object.keys(calls[0]).sort(), ['message', 'task_name'],
      'the emitted example carries current mandatory native arguments only');
    assert.equal(target, join(temp, '.codex/agents/repository-reader.toml'), 'brief must name the exact owned TOML artifact');
    assert.equal(readFileSync(resource, 'utf8'), template, 'brief must resolve its actual shipped native template');
    const document = minimalTemplate.replace('"{name}"', JSON.stringify(values.name))
      .replace('"{description}"', JSON.stringify(values.description));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, document);
    const python = spawnSync('python3', ['-c',
      'import json,pathlib,sys,tomllib; print(json.dumps(tomllib.loads(pathlib.Path(sys.argv[1]).read_text())))', target],
    { encoding: 'utf8' });
    // THEN: the consumer artifact is real parsed native TOML with preserved user strings.
    assert.equal(python.status, 0, `emitted TOML must parse: ${python.stderr}`);
    const parsed = JSON.parse(python.stdout);
    assert.deepEqual(Object.keys(parsed).sort(), ['description', 'developer_instructions', 'name'],
      'default emitted role has exactly the three required native fields');
    assert.equal(parsed.name, values.name, 'name field must retain the resolved role identity');
    assert.equal(parsed.description, values.description, 'TOML string escaping must retain the user description');
    assert.equal(parsed.developer_instructions.includes('do not re-delegate'), true,
      'project no-nested-delegation instruction remains in the emitted role');
    const checked = spawnSync('/bin/bash', ['-c', validationFence.replaceAll('{name}', values.name)],
      { cwd: temp, encoding: 'utf8' });
    assert.equal(checked.status, 0, `actual emitted parser/schema check must accept its template: ${checked.stderr}`);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('emitted authoring validator accepts supported config shapes and rejects foreign or malformed role fields', () => {
  const temp = mkdtempSync(join(tmpdir(), 'native-agent-schema-'));
  try {
    mkdirSync(join(temp, '.codex/agents'), { recursive: true });
    const target = join(temp, '.codex/agents/test-agent.toml');
    const minimal = minimalTemplate.replaceAll('{name}', 'test-agent').replaceAll('{description}', 'Read-only evidence collector.');
    const optional = modelTemplate + '\nsandbox_mode = "read-only"\n[mcp_servers.docs]\nurl = "https://developers.openai.com/mcp"\n[[skills.config]]\npath = "/tmp/docs"\nenabled = false\n';
    const fixtures = [
      ['minimal', minimal, 0],
      ['supported optional config', minimal + '\n' + optional, 0],
      ['missing required string', minimal.replace('name = "test-agent"', ''), 1],
      ['empty description', minimal.replace('description = "Read-only evidence collector."', 'description = ""'), 1],
      ['YAML artifact', '---\nname: test-agent\ndescription: evidence\n---\nInstructions', 1],
      ['foreign turn field', minimal + '\nmaxTurns = 20\n', 1],
      ['foreign skill preload', minimal + '\nskills = ["review"]\n', 1],
      ['fake inherit model', minimal + '\nmodel = "inherit"\n', 1],
      ['numeric effort', minimal + '\nmodel_reasoning_effort = 42\n', 1],
      ['foreign sandbox mode', minimal + '\nsandbox_mode = "acceptEdits"\n', 1],
      ['wrong MCP type', minimal + '\nmcp_servers = ["docs"]\n', 1],
      ['wrong skill enabled type', minimal + '\n[[skills.config]]\npath = "/tmp/docs"\nenabled = "false"\n', 1],
    ];
    for (const [label, document, status] of fixtures) {
      // GIVEN: producer-shaped supported or invalid TOML, not an implementation mirror.
      writeFileSync(target, document);
      // WHEN: the actual emitted validation fence executes against that role.
      const result = spawnSync('/bin/bash', ['-c', validationFence.replaceAll('{name}', 'test-agent')],
        { cwd: temp, encoding: 'utf8' });
      // THEN: bounded native schema failures fail closed.
      assert.equal(result.status, status, `${label} must yield the declared schema verdict: ${result.stderr}`);
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('native authoring checker detects original wrong-artifact, discovery, dependency and foreign-authority regressions', () => {
  const temp = mkdtempSync(join(tmpdir(), 'native-agent-closure-'));
  try {
    for (const [label, mutate, error] of [
      ['brief target', (root) => {
        const file = join(root, 'SKILL.md');
        writeFileSync(file, readFileSync(file, 'utf8').replaceAll('{scope}/agents/{name}.toml', '{scope}/agents/{name}.md'));
      }, 'main brief target must be TOML'],
      ['discovery', (root) => {
        const file = join(root, 'SKILL.md');
        writeFileSync(file, readFileSync(file, 'utf8').replace('`*.toml`', '`*.md`'));
      }, 'discovery must enumerate TOML'],
      ['sibling sync dependency', (root) => {
        const file = join(root, 'SKILL.md');
        writeFileSync(file, readFileSync(file, 'utf8') + '\nSYNC_REF: ../skills/references/mode-sync.md\n');
      }, 'unshipped sibling dependency'],
      ['missing sync resource', (root) => rmSync(join(root, 'references/agent-sync.md')), 'reference missing agent-sync.md'],
      ['broken link', (root) => {
        const file = join(root, 'SKILL.md');
        writeFileSync(file, readFileSync(file, 'utf8').replace('(references/agent-template.md)', '(references/missing.md)'));
      }, 'broken link references/missing.md'],
      ['foreign API authority', (root) => {
        const file = join(root, 'references/agent-frontmatter-fields.md');
        writeFileSync(file, readFileSync(file, 'utf8') + '\nAuthority: https://code.claude.com/docs/en/sub-agents; maxTurns = 20\n');
      }, 'foreign schema agent-frontmatter-fields.md'],
      ['foreign hook dependency', (root) => writeFileSync(join(root, 'references/hooks-io-contract.md'), 'Foreign hook schema'), 'reference inventory'],
    ]) {
      // GIVEN: one independent regression added to the valid emitted bundle.
      const root = join(temp, label.replaceAll(' ', '-'));
      cpSync(NATIVE, root, { recursive: true });
      mutate(root);
      // WHEN: the real shipped compatibility closure checker runs.
      const result = validateClosure(root);
      // THEN: it fails and identifies the broken native consumer contract.
      assert.equal(result.status, 1, `${label} must fail native closure`);
      assert.equal(result.stderr.includes(error), true, `${label} must report its exact contract gap`);
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
