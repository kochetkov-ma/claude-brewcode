#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILLS = ['docs', 'superreview', 'brewcode-review', 'memory-sync', 'claude-plugin-guide', 'update-overview', 'eurodns'];
const RULES = ['avoid', 'best-practice', 'docs-workflow', 'semble-first', 'astro-avoid', 'astro-best-practice', 'web-accessibility', 'docker-avoid', 'docker-best-practice'];
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const inside = (root, path) => {
  const local = relative(root, path);
  return local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local);
};

function resolveSource(root, path, onLink = () => {}) {
  let hops = 0;
  while (true) {
    if (!inside(root, path)) throw new Error(`escaping symlink: ${relative(root, path)}`);
    const parts = relative(root, path).split(sep).filter(Boolean);
    let current = root;
    let followed = false;
    for (const [index, part] of parts.entries()) {
      current = join(current, part);
      if (!lstatSync(current).isSymbolicLink()) continue;
      onLink(current);
      const target = readlinkSync(current);
      if (isAbsolute(target)) throw new Error(`absolute symlink: ${relative(root, current)}`);
      const destination = resolve(dirname(current), target);
      if (!inside(root, destination)) throw new Error(`escaping symlink: ${relative(root, current)}`);
      if (!existsSync(destination)) throw new Error(`broken symlink: ${relative(root, current)}`);
      if (++hops > 40) throw new Error(`symlink cycle: ${relative(root, current)}`);
      path = join(destination, ...parts.slice(index + 1));
      followed = true;
      break;
    }
    if (!followed) return current;
  }
}

export function checkLink(root, path, expected) {
  if (expected !== undefined && readlinkSync(path) !== expected) throw new Error(`unexpected symlink: ${relative(root, path)}`);
  return resolveSource(realpathSync(root), path);
}

export function readToml(path) {
  const result = spawnSync('python3', ['-I', '-S', '-c', 'import json,sys,tomllib; print(json.dumps(tomllib.load(open(sys.argv[1],"rb"))))', path], { encoding: 'utf8', timeout: 10000 });
  if (result.status !== 0) throw new Error(`invalid TOML: ${path}`);
  return JSON.parse(result.stdout);
}

export function validateSetup(root = ROOT, { checkIgnore = true } = {}) {
  root = realpathSync(root);
  const errors = [];
  const closure = new Set();
  const attempt = fn => { try { fn(); } catch (error) { errors.push(error.message); } };
  const requireValue = (actual, expected, message) => { if (actual !== expected) throw new Error(message); };
  const visit = path => {
    const local = relative(root, path);
    if (closure.has(local)) return;
    closure.add(local);
    const canonical = resolveSource(root, path, link => closure.add(relative(root, link)));
    if (canonical !== path) { visit(canonical); return; }
    const stat = lstatSync(path);
    if (stat.isDirectory()) { for (const entry of readdirSync(path)) visit(join(path, entry)); }
    if (stat.isFile() && path.endsWith('.md') && (local === 'AGENTS.md' || local.startsWith(`.codex${sep}`))) {
      for (const match of readFileSync(path, 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
        const target = match[1].split('#')[0];
        if (!target || /^(?:[a-z]+:|\/|\$|<)/i.test(target)) continue;
        const destination = resolve(dirname(path), target);
        const source = local.endsWith('/SKILL.md') ? `skill reference: ${relative(join(root, '.codex/skills'), dirname(path))}` : `native reference: ${local}`;
        if (!inside(root, destination)) throw new Error(`escaping ${source}/${target}`);
        if (!existsSync(destination)) throw new Error(`missing ${source}/${target}`);
        visit(destination);
      }
    }
  };
  attempt(() => {
    const config = readToml(join(root, '.codex/config.toml'));
    for (const key of ['model', 'review_model']) requireValue(config[key], 'gpt-6.1-sol', `model mismatch: ${key}`);
    requireValue(config.agents?.default_subagent_model, 'gpt-6.1-sol', 'model mismatch: default_subagent_model');
    requireValue(config.agents?.enabled, true, 'native agents disabled');
    for (const key of ['plugins', 'remote_plugin']) requireValue(config.features?.[key], false, `plugins must remain disabled: ${key}`);
    for (const key of ['approval_policy', 'sandbox_mode', 'permissions']) requireValue(Object.hasOwn(config, key), false, `permission override: ${key}`);
    const role = readToml(join(root, '.codex/agents/docs-writer.toml'));
    requireValue(role.name, 'docs-writer', 'native docs-writer name missing');
    requireValue(role.model, 'gpt-6.1-sol', 'model mismatch: docs-writer');
    if (typeof role.description !== 'string' || role.description.trim() === '') throw new Error('docs-writer description missing');
    if (typeof role.developer_instructions !== 'string' || role.developer_instructions.trim() === '') throw new Error('docs-writer instructions missing');
    for (const key of ['approval_policy', 'sandbox_mode', 'permissions']) requireValue(Object.hasOwn(role, key), false, `role permission override: ${key}`);
    visit(join(root, '.codex/config.toml'));
    visit(join(root, '.codex/agents/docs-writer.toml'));
  });
  attempt(() => {
    const instructions = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    for (const name of RULES) {
      const path = `.codex/rules/${name}.md`;
      if (!instructions.includes(`](${path})`)) throw new Error(`rule index missing: ${path}`);
      visit(join(root, path));
    }
    const actual = readdirSync(join(root, '.codex/rules')).filter(name => name.endsWith('.md')).sort();
    requireValue(JSON.stringify(actual), JSON.stringify(RULES.map(name => `${name}.md`).sort()), 'rule index and directory differ');
  });
  for (const name of SKILLS) attempt(() => {
    const alias = join(root, '.agents/skills', name);
    checkLink(root, alias, `../../.codex/skills/${name}`);
    visit(alias);
    const skill = join(root, '.codex/skills', name, 'SKILL.md');
    const text = readFileSync(skill, 'utf8');
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
    if (!frontmatter || !new RegExp(`^name:\\s*${name}\\s*$`, 'm').test(frontmatter) || !/^description:\s*\S/m.test(frontmatter)) throw new Error(`invalid native skill frontmatter: ${name}`);
  });
  for (const path of ['AGENTS.md', '.gitignore', '.codex/scripts/validate-setup.mjs', '.codex/scripts/check-setup-loader.py', '.claude/scripts/bump-version.sh']) attempt(() => visit(join(root, path)));
  if (checkIgnore) attempt(() => {
    const files = [...closure].filter(path => existsSync(join(root, path)) && !lstatSync(join(root, path)).isDirectory());
    const ignored = spawnSync('git', ['check-ignore', '--no-index', '--', ...files], { cwd: root, encoding: 'utf8', timeout: 10000 });
    if (![0, 1].includes(ignored.status)) throw new Error('git check-ignore failed');
    if (ignored.stdout.trim()) throw new Error(`ignored source closure: ${ignored.stdout.trim()}`);
    const privatePaths = ['.claude/settings.local.json', '.claude/auth.json', '.claude/history.jsonl', '.claude/sessions/runtime.json', '.env'];
    const privateResult = spawnSync('git', ['check-ignore', '--no-index', '--', ...privatePaths], { cwd: root, encoding: 'utf8', timeout: 10000 });
    requireValue(privateResult.stdout.trim().split('\n').sort().join('\n'), privatePaths.sort().join('\n'), 'private/runtime exclusion missing');
  });
  return { errors, closure: [...closure].sort() };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = validateSetup(process.argv[2] ? resolve(process.argv[2]) : ROOT);
  for (const error of result.errors) process.stderr.write(`${error}\n`);
  if (result.errors.length === 0) process.stdout.write(`Native setup valid: ${SKILLS.length} skills, ${RULES.length} rules; ${result.closure.length} closure paths\n`);
  process.exitCode = Number(result.errors.length > 0);
}
