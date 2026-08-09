#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERSION = '4.0.6';
const EXPECTED = { brewcode: [5, 3], brewdoc: [1, 0], brewtools: [5, 1] };
const EXPECTED_SKILLS = {
  brewcode: ['agents', 'convention', 'rules', 'superreview-setup', 'teams-setup'],
  brewdoc: ['md-to-pdf'],
  brewtools: ['manager-setup', 'task-board-setup', 'text-human', 'text-optimize', 'think-short-setup']
};
// Canonical setup-skill mode set, in the mandated order. A skill declares the subset it
// supports in its source `argument-hint`; the Codex variant must document each one.
const CANONICAL_MODES = ['status', 'install', 'upgrade', 'enable', 'disable', 'uninstall', 'purge'];
const MANUAL_NATIVE_SKILLS = new Set([
  'brewcode/convention', 'brewcode/rules', 'brewtools/manager-setup', 'brewtools/task-board-setup',
  'brewtools/think-short-setup'
]);
const errors = [];
let retainedResources = 0;

function fail(message) { errors.push(message); }
function json(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(`${path.relative(ROOT, file)}: ${error.message}`); return null; }
}

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(target));
    else files.push(target);
  }
  return files;
}

function textFiles(dir) {
  return walk(dir).filter(file => !fs.readFileSync(file).includes(0));
}

function checkHookCommand(plugin, distRoot, hook) {
  const rendered = hook.command.replaceAll('${PLUGIN_ROOT}', distRoot);
  const match = rendered.match(/^node\s+["']([^"']+)["'](?:\s|$)/);
  if (!match) {
    fail(`${plugin}: hook command must invoke a quoted local Node entrypoint: ${hook.command}`);
    return;
  }
  if (!fs.existsSync(match[1]) || !fs.statSync(match[1]).isFile()) {
    fail(`${plugin}: hook command path does not exist: ${match[1]}`);
  }
}

function resourceTarget(plugin, skill, relative) {
  if (relative === 'SKILL.md' || relative.startsWith('.claude/') || relative.includes('/__pycache__/') || relative.endsWith('.pyc')) return null;
  if (plugin === 'brewtools' && skill === 'manager-setup' && ['references/hard.md', 'references/intent-routing.md'].includes(relative)) return null;
  if (plugin === 'brewtools' && skill === 'think-short-setup' && (relative === 'assets/think-short-task.mjs' || relative.startsWith('tests/'))) return null;
  return relative.replaceAll('claude-md', 'agents-md').replaceAll('claude-local', 'codex-local');
}

function checkFloatingInstalls(file, source) {
  for (const [index, line] of source.split('\n').entries()) {
    if (/\bbrew\s+install\b/.test(line)) fail(`${path.relative(ROOT, file)}:${index + 1}: floating brew install is forbidden`);
    const pip = line.match(/\b(?:pip3?|python3\s+-m\s+pip)\s+install\s+([^`|\n]+)/);
    if (pip) {
      const packages = pip[1].replace(/["'`]/g, '').split(/\s+/).filter(token => token && !token.startsWith('-'));
      if (packages.some(token => !token.includes('=='))) fail(`${path.relative(ROOT, file)}:${index + 1}: pip install must pin every package with ==`);
    }
    const npm = line.match(/\bnpm\s+install(?:\s+-g)?\s+([^\s"'`]+)/);
    if (npm) {
      const token = npm[1];
      const pinned = token.startsWith('@') ? token.lastIndexOf('@') > 0 : token.includes('@');
      if (!pinned) fail(`${path.relative(ROOT, file)}:${index + 1}: npm install must use an exact package version`);
    }
  }
}

for (const [plugin, [skillCount, agentCount]] of Object.entries(EXPECTED)) {
  const pluginRoot = path.join(ROOT, plugin);
  const canonicalManifest = json(path.join(pluginRoot, '.codex', 'package', 'plugin.json'));
  const distRoot = path.join(ROOT, '.codex', 'plugins', plugin);
  const manifest = json(path.join(distRoot, '.codex-plugin', 'plugin.json'));
  if (manifest) {
    if (manifest.name !== plugin) fail(`${plugin}: manifest name mismatch`);
    if (manifest.version !== VERSION && !manifest.version.startsWith(`${VERSION}+codex.`)) {
      fail(`${plugin}: expected version ${VERSION} or a Codex cachebuster derived from it`);
    }
    if (manifest.skills !== './skills/') fail(`${plugin}: dist skills path must be ./skills/`);
    if ('hooks' in manifest) fail(`${plugin}: use validator-compatible default hooks/hooks.json discovery`);
    if ('agents' in manifest) fail(`${plugin}: unsupported manifest agents field`);
    for (const key of ['description', 'author', 'interface']) if (!manifest[key]) fail(`${plugin}: missing manifest ${key}`);
  }
  if (JSON.stringify(canonicalManifest) !== JSON.stringify(manifest)) fail(`${plugin}: dist manifest differs from canonical .codex/package/plugin.json`);
  if (fs.existsSync(path.join(pluginRoot, '.codex-plugin'))) fail(`${plugin}: source-root .codex-plugin shim must not exist`);
  if (!fs.lstatSync(distRoot).isDirectory() || fs.lstatSync(distRoot).isSymbolicLink()) fail(`${plugin}: dist root must be a real directory`);

  const skillsRoot = path.join(pluginRoot, '.codex', 'skills');
  const skills = fs.readdirSync(skillsRoot, { withFileTypes: true }).filter(entry => entry.isDirectory());
  if (skills.length !== skillCount) fail(`${plugin}: expected ${skillCount} skills, got ${skills.length}`);
  const names = skills.map(entry => entry.name).sort();
  if (names.join(',') !== EXPECTED_SKILLS[plugin].join(',')) fail(`${plugin}: unexpected skill set ${names.join(',')}`);
  for (const entry of skills) {
    const skillFile = path.join(skillsRoot, entry.name, 'SKILL.md');
    const source = fs.readFileSync(skillFile, 'utf8');
    const frontmatter = source.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatter) { fail(`${plugin}/${entry.name}: invalid frontmatter`); continue; }
    const keys = frontmatter[1].split('\n').map(line => line.match(/^([a-zA-Z0-9_-]+):/)?.[1]).filter(Boolean);
    if (keys.join(',') !== 'name,description') fail(`${plugin}/${entry.name}: frontmatter must contain only name and description`);
    if (!frontmatter[1].includes(`name: ${entry.name}`)) fail(`${plugin}/${entry.name}: name must match directory`);
    const openai = path.join(skillsRoot, entry.name, 'agents', 'openai.yaml');
    if (!fs.existsSync(openai)) fail(`${plugin}/${entry.name}: missing agents/openai.yaml`);
    const sourceSkill = path.join(pluginRoot, 'skills', entry.name, 'SKILL.md');
    const sourceText = fs.readFileSync(sourceSkill, 'utf8');
    const manual = MANUAL_NATIVE_SKILLS.has(`${plugin}/${entry.name}`);
    if (manual && source.length < 900) fail(`${plugin}/${entry.name}: native workflow is too short to preserve source phases`);
    if (!manual && source.length < sourceText.length * 0.75) fail(`${plugin}/${entry.name}: transformed workflow lost substantive source content`);

    // Mode parity. A MANUAL_NATIVE variant is hand-authored and does NOT track source
    // SKILL.md edits, so a mode added or renamed upstream reaches nobody here and
    // regeneration will never notice. The source argument-hint is the contract: every
    // canonical mode it declares must be documented in the Codex variant. Checked for
    // every skill, not only the manual ones -- a transformed variant satisfies it for
    // free, which is exactly why the manual ones are the only place it can rot.
    const sourceHint = sourceText.match(/^argument-hint:\s*(.*)$/m)?.[1] ?? '';
    for (const mode of CANONICAL_MODES) {
      if (!new RegExp(`[[|]${mode}[\\]|]`).test(sourceHint)) continue;
      if (!new RegExp('`' + mode + '`').test(source)) {
        fail(`${plugin}/${entry.name}: Codex variant omits canonical mode \`${mode}\` declared by the source argument-hint`);
      }
    }

    const sourceRoot = path.join(pluginRoot, 'skills', entry.name);
    const targetRoot = path.join(skillsRoot, entry.name);
    for (const sourceResource of walk(sourceRoot)) {
      const relative = path.relative(sourceRoot, sourceResource);
      const mapped = resourceTarget(plugin, entry.name, relative);
      if (!mapped) continue;
      retainedResources += 1;
      if (!fs.existsSync(path.join(targetRoot, mapped))) fail(`${plugin}/${entry.name}: missing transformed resource ${mapped} (from ${relative})`);
    }

    for (const canonical of walk(targetRoot)) {
      const relative = path.relative(targetRoot, canonical);
      const distributed = path.join(distRoot, 'skills', entry.name, relative);
      if (!fs.existsSync(distributed) || !fs.readFileSync(canonical).equals(fs.readFileSync(distributed))) fail(`${plugin}/${entry.name}: dist resource differs from canonical ${relative}`);
    }
  }

  const agentsRoot = path.join(pluginRoot, '.codex', 'agents');
  const agents = fs.readdirSync(agentsRoot).filter(name => name.endsWith('.toml'));
  if (agents.length !== agentCount) fail(`${plugin}: expected ${agentCount} agents, got ${agents.length}`);
  if (agents.length) {
    const command = [
      'import pathlib,tomllib,sys',
      'files=sys.argv[1:]',
      'required={"name","description","developer_instructions"}',
      'bad=[]',
      'for f in files:',
      ' d=tomllib.loads(pathlib.Path(f).read_text())',
      ' missing=required-set(d)',
      ' extra=set(d)-required',
      ' bad.extend([f+":"+k for k in sorted(missing)])',
      ' bad.extend([f+":unsupported:"+k for k in sorted(extra)])',
      'print("\\n".join(bad))',
      'raise SystemExit(bool(bad))'
    ].join('\n');
    const result = spawnSync('python3', ['-c', command, ...agents.map(name => path.join(agentsRoot, name))], { encoding: 'utf8' });
    if (result.status !== 0) fail(`${plugin}: invalid agent TOML ${result.stdout || result.stderr}`);
  }

  const hooks = json(path.join(distRoot, 'hooks', 'hooks.json'));
  for (const [event, groups] of Object.entries(hooks?.hooks || {})) {
    if (!['SessionStart', 'UserPromptSubmit'].includes(event)) fail(`${plugin}: unsupported registered event ${event}`);
    for (const group of groups) {
      if (event === 'UserPromptSubmit' && Object.hasOwn(group, 'matcher')) fail(`${plugin}: UserPromptSubmit matcher is ignored and must be omitted`);
      for (const hook of group.hooks || []) {
        if (hook.type !== 'command' || typeof hook.command !== 'string' || !hook.command.trim()) fail(`${plugin}: hook command must be one string`);
        if ('args' in hook) fail(`${plugin}: Codex hooks must not use args arrays`);
        if (!Number.isInteger(hook.timeout) || hook.timeout < 1 || hook.timeout > 30) fail(`${plugin}: invalid hook timeout`);
        if (typeof hook.command === 'string' && hook.command.trim()) checkHookCommand(plugin, distRoot, hook);
      }
    }
  }

  const forbidden = /(Skill\s*\(\s*skill\s*=|spawn_agent\s*\([^)]*(?:subagent_type|model\s*=|prompt\s*=)|\$(?:code|doc):|\.codex\/agents\/[^\s'"`]+\.md|BC_PLUGIN_ROOT|BT_PLUGIN_ROOT|CLAUDE(?:_[A-Z0-9_]+)?|\bClaude(?: Code)?\b|\.claude(?:\/|\\)|(?:^|\/)plugins\/cache\/|settings(?:\.local)?\.json|AskUserQuestion|allowed-tools:|permissionMode:|@latest|:latest|@main|ubuntu-latest|default: "latest")/m;
  for (const root of [path.join(pluginRoot, '.codex'), distRoot]) {
    for (const file of textFiles(root)) {
      const source = fs.readFileSync(file, 'utf8');
      if (forbidden.test(source)) fail(`${path.relative(ROOT, file)}: contains non-native or floating compatibility syntax`);
      if (/\bbc-rules-organizer\b/.test(source)) fail(`${path.relative(ROOT, file)}: contains retired Codex agent bc-rules-organizer`);
      if (/\$brewcode:spec\b|\/brewcode:spec\b/.test(source)) fail(`${path.relative(ROOT, file)}: contains removed Codex skill brewcode:spec`);
      checkFloatingInstalls(file, source);
    }
  }

  const validator = path.join(process.env.HOME, '.codex', 'skills', '.system', 'plugin-creator', 'scripts', 'validate_plugin.py');
  const result = spawnSync('python3', [validator, distRoot], { encoding: 'utf8' });
  if (result.status !== 0) fail(`${plugin}: direct plugin-creator validation failed: ${result.stdout || result.stderr}`);
}

const managerRoot = path.join(ROOT, 'brewtools', '.codex', 'skills', 'manager-setup');
const managerMetadata = `${fs.readFileSync(path.join(managerRoot, 'SKILL.md'), 'utf8')}\n${fs.readFileSync(path.join(managerRoot, 'agents', 'openai.yaml'), 'utf8')}`;
if (!/allow_implicit_invocation: false/.test(managerMetadata)) fail('manager must require explicit user invocation');

for (const skill of ['task-board-setup', 'think-short-setup']) {
  const metadata = fs.readFileSync(path.join(ROOT, 'brewtools', '.codex', 'skills', skill, 'agents', 'openai.yaml'), 'utf8');
  if (!/allow_implicit_invocation: false/.test(metadata)) fail(`${skill} must require explicit user invocation`);
}

const rulesRoot = path.join(ROOT, 'brewcode', '.codex', 'skills', 'rules');
const rulesSkill = fs.readFileSync(path.join(rulesRoot, 'SKILL.md'), 'utf8');
const rulesMetadata = fs.readFileSync(path.join(rulesRoot, 'agents', 'openai.yaml'), 'utf8');
for (const literal of ['.codex/rules/', 'AGENTS.md', 'Rule', 'Load when', 'Purpose', '$brewtools:text-optimize -l']) {
  if (!rulesSkill.includes(literal)) fail(`rules skill missing ${literal}`);
}
if (!/allow_implicit_invocation: false/.test(rulesMetadata)) fail('rules must require explicit user invocation');

const optimizerMetadata = fs.readFileSync(path.join(ROOT, 'brewtools', '.codex', 'skills', 'text-optimize', 'agents', 'openai.yaml'), 'utf8');
if (!/allow_implicit_invocation: true/.test(optimizerMetadata)) fail('text-optimize must remain available for implicit invocation');

const installer = fs.readFileSync(path.join(ROOT, '.codex', 'scripts', 'install-update.mjs'), 'utf8');
for (const literal of ["'migrate'", "REMOTE_VERSION = '4.0.5'", 'item.version', 'item.enabled', 'rollbackPlugins', 'CODEX_COMPAT_TEST_FAIL_STEP']) {
  if (!installer.includes(literal)) fail(`installer missing transactional migration element ${literal}`);
}

for (const root of [
  path.join(ROOT, 'brewtools', '.codex', 'skills', 'task-board-setup'),
  path.join(ROOT, '.codex', 'plugins', 'brewtools', 'skills', 'task-board-setup')
]) {
  if (walk(root).some(file => file.includes(`${path.sep}.claude${path.sep}`) || file.endsWith(`${path.sep}.claude`))) {
    fail('task-board-setup Codex variant contains a stale foreign-assistant artifact');
  }
}

const marketplace = json(path.join(ROOT, '.codex', 'marketplace.json'));
if (marketplace?.plugins?.map(value => value.name).join(',') !== 'brewcode,brewdoc,brewtools') fail('marketplace must expose exactly three plugins');
for (const plugin of marketplace?.plugins || []) {
  if (!/^\.\/\.codex\/plugins\/(brewcode|brewdoc|brewtools)$/.test(plugin.source?.path || '')) fail(`marketplace path invalid for ${plugin.name}`);
  const source = path.resolve(ROOT, plugin.source?.path || 'missing');
  const expected = path.join(ROOT, '.codex', 'plugins', plugin.name);
  if (!fs.existsSync(source) || fs.realpathSync(source) !== fs.realpathSync(expected)) fail(`marketplace source does not resolve to dist root for ${plugin.name}`);
  else if (!fs.lstatSync(source).isDirectory() || fs.lstatSync(source).isSymbolicLink()) fail(`marketplace source must be a real directory for ${plugin.name}`);
}

const discovery = path.join(ROOT, '.agents', 'plugins', 'marketplace.json');
if (!fs.lstatSync(discovery).isSymbolicLink() || fs.readlinkSync(discovery) !== '../../.codex/marketplace.json') fail('marketplace discovery shim must point to .codex/marketplace.json');

if (errors.length) {
  process.stderr.write(`${errors.map(error => `- ${error}`).join('\n')}\n`);
  process.exit(1);
}
// Derived from EXPECTED, never hardcoded: a literal count silently goes stale the moment a
// skill or agent is added or dropped, and the banner then lies about a run that did pass.
const totals = Object.values(EXPECTED).reduce(
  (acc, [skills, agents]) => ({ skills: acc.skills + skills, agents: acc.agents + agents }),
  { skills: 0, agents: 0 }
);
process.stdout.write(`Codex compatibility validation passed: ${Object.keys(EXPECTED).length} plugins, ${totals.skills} skills, ${totals.agents} agents, ${retainedResources} mapped source resources.\n`);
