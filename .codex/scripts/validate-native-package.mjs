#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Local compatibility package contract; publication-only requirements do not apply here.
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const inside = (root, target) => {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateNativePackage(packageRoot) {
  const errors = [];
  const attempt = action => { try { return action(); } catch (error) { errors.push(error.message); return undefined; } };
  const root = attempt(() => fs.realpathSync(packageRoot));
  if (!root) return errors;
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const local = (relative, directory) => {
    assert(typeof relative === 'string' && relative.startsWith('./') && !relative.includes('\\'), `component path must start with ./ and stay package-local: ${relative}`);
    const target = path.resolve(root, relative);
    assert(inside(root, target), `component path escapes package: ${relative}`);
    const resolved = fs.realpathSync(target);
    assert(inside(root, resolved), `component symlink escapes package: ${relative}`);
    assert(directory ? fs.statSync(resolved).isDirectory() : fs.statSync(resolved).isFile(), `component has wrong type: ${relative}`);
    return resolved;
  };
  const manifest = attempt(() => JSON.parse(fs.readFileSync(local('./.codex-plugin/plugin.json', false), 'utf8')));
  if (!object(manifest)) {
    errors.push('package manifest must be a JSON object');
    return errors;
  }
  attempt(() => assert(typeof manifest.name === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.name) && manifest.name.length <= 64, 'manifest name must be lowercase kebab-case, at most 64 characters'));
  attempt(() => assert(typeof manifest.version === 'string' && SEMVER.test(manifest.version), 'manifest version must be semantic versioning, including optional build metadata'));
  attempt(() => assert(typeof manifest.description === 'string' && manifest.description.trim() !== '', 'manifest description must be nonempty text'));
  attempt(() => assert(object(manifest.author) && typeof manifest.author.name === 'string' && manifest.author.name.trim() !== '', 'Codex manifest author.name must be nonempty text'));
  attempt(() => assert(object(manifest.interface), 'manifest interface must be an object'));
  attempt(() => assert(!Object.hasOwn(manifest, '$schema'), 'standalone Codex manifest must omit $schema'));

  if (manifest.skills !== undefined) attempt(() => {
    const directories = Array.isArray(manifest.skills) ? manifest.skills : [manifest.skills];
    assert(directories.length > 0, 'skills component array must not be empty');
    for (const directory of directories) {
      const component = local(directory, true);
      const skills = fs.readdirSync(component, { withFileTypes: true }).filter(entry => entry.isDirectory() || entry.isSymbolicLink());
      assert(skills.length > 0, `skills component contains no skills: ${directory}`);
      for (const skill of skills) {
        assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name), `skill directory must use lowercase kebab-case: ${skill.name}`);
        const entry = local(`${directory.replace(/\/$/, '')}/${skill.name}/SKILL.md`, false);
        const source = fs.readFileSync(entry, 'utf8');
        const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
        assert(frontmatter && new RegExp(`^name:\\s*${skill.name}\\s*$`, 'm').test(frontmatter) && /^description:\s*\S/m.test(frontmatter), `invalid skill metadata: ${directory}/${skill.name}`);
      }
    }
  });
  if (manifest.mcpServers !== undefined) attempt(() => {
    const config = JSON.parse(fs.readFileSync(local(manifest.mcpServers, false), 'utf8'));
    assert(object(config), 'bundled MCP config must be a JSON object');
  });
  if (object(manifest.interface)) {
    for (const field of ['composerIcon', 'composerIconDark', 'logo', 'logoDark']) {
      if (manifest.interface[field] !== undefined) attempt(() => local(manifest.interface[field], false));
    }
    if (manifest.interface.screenshots !== undefined) attempt(() => {
      assert(Array.isArray(manifest.interface.screenshots), 'interface screenshots must be an array of package-local paths');
      for (const screenshot of manifest.interface.screenshots) local(screenshot, false);
    });
  }
  const onboarding = manifest.extensions?.['com.openai']?.onboardingSkill;
  if (onboarding !== undefined) attempt(() => local(onboarding, false));

  // Resolve every shipped resource, including symlinks, without reading runtime/account state.
  const visited = new Set();
  const visit = target => {
    const resolved = fs.realpathSync(target);
    assert(inside(root, resolved), `resource symlink escapes package: ${path.relative(root, target)}`);
    if (visited.has(resolved)) return;
    visited.add(resolved);
    const stat = fs.statSync(resolved);
    assert(stat.isDirectory() || stat.isFile(), `unsupported package resource: ${path.relative(root, target)}`);
    if (stat.isDirectory()) for (const name of fs.readdirSync(resolved)) visit(path.join(resolved, name));
  };
  attempt(() => visit(root));
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2];
  if (!root) { process.stderr.write('Usage: validate-native-package.mjs <package-root>\n'); process.exit(2); }
  const errors = validateNativePackage(root);
  if (errors.length) { process.stderr.write(`${errors.join('\n')}\n`); process.exit(1); }
  process.stdout.write('Native package validation passed.\n');
}
