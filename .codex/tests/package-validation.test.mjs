import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { validateNativePackage } from '../scripts/validate-native-package.mjs';

function fixture(t, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'native-package-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.codex-plugin'));
  mkdirSync(join(root, 'skills/example'), { recursive: true });
  writeFileSync(join(root, 'skills/example/SKILL.md'), '---\nname: example\ndescription: Example workflow.\n---\nInstructions.\n');
  writeFileSync(join(root, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'example', version: '1.2.3+codex.20260930', description: 'Local package.', author: { name: 'Local developer' }, interface: {}, skills: './skills/', ...overrides }));
  return root;
}

test('all generated compatibility packages pass the standalone repository contract', () => {
  // GIVEN the three actual generated packages.
  for (const name of ['brewcode', 'brewdoc', 'brewtools']) {
    const root = fileURLToPath(new URL(`../plugins/${name}/`, import.meta.url));
    // WHEN their metadata, components, and resources are validated.
    const errors = validateNativePackage(root);
    // THEN the same maintained validator used by validate-compat accepts each package.
    assert.deepEqual(errors, [], `${name} package is valid without an installed validator skill`);
  }
});

for (const [label, override, expected] of [
  ['invalid name', { name: 'Wrong_Name' }, /manifest name/],
  ['floating version', { version: 'latest' }, /semantic versioning/],
  ['empty description', { description: '' }, /description/],
  ['missing publisher name', { author: {} }, /author.name/],
  ['array interface', { interface: [] }, /interface must be an object/],
  ['submission schema', { $schema: 'https://example.com/schema.json' }, /omit \$schema/],
  ['absolute component', { skills: '/tmp' }, /must start with/],
  ['escaping component', { skills: './../outside' }, /escapes package/],
  ['empty skills array', { skills: [] }, /must not be empty/],
  ['missing MCP config', { mcpServers: './missing.json' }, /ENOENT/],
  ['missing declared icon', { interface: { logo: './missing.svg' } }, /ENOENT/],
  ['missing onboarding entrypoint', { extensions: { 'com.openai': { onboardingSkill: './skills/missing/SKILL.md' } } }, /ENOENT/],
]) test(`invalid fixture rejects ${label}`, (t) => {
  // GIVEN a package whose relevant contract field is invalid.
  const root = fixture(t, override);
  // WHEN validation runs.
  const errors = validateNativePackage(root);
  // THEN a concrete failure remains visible.
  assert.match(errors.join('\n'), expected, `${label} cannot silently pass validation`);
});

test('skills directory arrays work without public submission metadata', (t) => {
  // GIVEN a minimal local package, with the supported directory-array spelling.
  const root = fixture(t, { skills: ['./skills/'] });
  // WHEN validation runs.
  const errors = validateNativePackage(root);
  // THEN publication-only fields are not imposed on a local package.
  assert.deepEqual(errors, [], 'local package accepts arrays and needs no publication data');
});

test('missing skill entrypoints are rejected', (t) => {
  // GIVEN a skill directory without SKILL.md.
  const root = fixture(t);
  rmSync(join(root, 'skills/example/SKILL.md'));
  // WHEN validation discovers the component.
  const errors = validateNativePackage(root);
  // THEN an absent entrypoint fails validation.
  assert.match(errors.join('\n'), /ENOENT/, 'missing SKILL.md cannot pass');
});

test('resource symlinks cannot escape package boundaries', (t) => {
  // GIVEN an otherwise valid package with a resource linking outside it.
  const root = fixture(t);
  symlinkSync(tmpdir(), join(root, 'outside-resource'));
  // WHEN the resource closure is validated.
  const errors = validateNativePackage(root);
  // THEN escaping resources are rejected without following external state.
  assert.match(errors.join('\n'), /resource symlink escapes package/, 'external symlink fails containment checks');
});
