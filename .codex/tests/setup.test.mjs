import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkLink, SKILLS, validateSetup } from '../scripts/validate-setup.mjs';

const RULES = ['avoid', 'best-practice', 'docs-workflow', 'semble-first', 'astro-avoid', 'astro-best-practice', 'web-accessibility', 'docker-avoid', 'docker-best-practice'];
const CONFIG = 'model = "gpt-6.1-sol"\nreview_model = "gpt-6.1-sol"\n[agents]\nenabled = true\ndefault_subagent_model = "gpt-6.1-sol"\n[features]\nplugins = false\nremote_plugin = false\n';
const ROLE = 'name = "docs-writer"\ndescription = "Internal writer"\nmodel = "gpt-6.1-sol"\ndeveloper_instructions = "Owned documentation work"\n';

function fixture(run) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'native-setup-test-')));
  const put = (path, text) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text); };
  try {
    put('.codex/config.toml', CONFIG);
    put('.codex/agents/docs-writer.toml', ROLE);
    for (const path of ['.gitignore', '.codex/scripts/validate-setup.mjs', '.codex/scripts/check-setup-loader.py', '.claude/scripts/bump-version.sh']) put(path, 'Fixture source\n');
    put('AGENTS.md', RULES.map(name => `[rule](.codex/rules/${name}.md)`).join('\n'));
    for (const name of RULES) put(`.codex/rules/${name}.md`, 'Rule\n');
    mkdirSync(join(root, '.agents/skills'), { recursive: true });
    for (const name of SKILLS) {
      put(`.codex/skills/${name}/SKILL.md`, `---\nname: ${name}\ndescription: Native contract\n---\n[reference](references/check.md)\n`);
      put(`.codex/skills/${name}/references/check.md`, 'Owned reference\n');
      symlinkSync(`../../.codex/skills/${name}`, join(root, '.agents/skills', name));
    }
    put('unrelated.txt', 'Preserve exact bytes\n');
    return run(root, put);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('complete native setup passes without changing unrelated or config bytes', () => fixture(root => {
  // GIVEN: complete setup and unrelated content.
  const before = [readFileSync(join(root, 'unrelated.txt')), readFileSync(join(root, '.codex/config.toml'))];
  // WHEN: read-only verification runs.
  const result = validateSetup(root, { checkIgnore: false });
  // THEN: the setup passes and both byte sequences remain exact.
  assert.deepEqual(result.errors, [], 'complete setup must pass');
  assert.deepEqual([readFileSync(join(root, 'unrelated.txt')), readFileSync(join(root, '.codex/config.toml'))], before, 'validation must preserve unrelated and owned files');
}));

test('missing source target reports the broken discovery link', () => fixture(root => {
  // GIVEN: a discovery alias with a removed target.
  rmSync(join(root, '.codex/skills/docs'), { recursive: true });
  // WHEN: the link is checked.
  // THEN: failure names the dangling alias.
  assert.throws(() => checkLink(root, join(root, '.agents/skills/docs')), /broken symlink: \.agents\/skills\/docs/, 'dangling aliases must fail with their path');
}));

test('aliased project root produces the same canonical source closure', () => fixture(root => {
  // GIVEN: a complete setup reachable through a directory alias.
  const alias = join(root, 'project-alias');
  symlinkSync('.', alias);
  const expected = validateSetup(root, { checkIgnore: false });
  assert.deepEqual(expected.errors, [], 'canonical setup must pass before comparing aliases');
  // WHEN: verification starts from the aliased root.
  const actual = validateSetup(alias, { checkIgnore: false });
  // THEN: canonical paths preserve identical validation and source coverage.
  assert.deepEqual(actual, expected, 'aliased root must preserve the complete canonical result');
}));

test('relative and absolute escaping links are rejected', () => fixture(root => {
  // GIVEN: two unsafe links.
  symlinkSync('../../../outside', join(root, '.agents/skills/escape'));
  symlinkSync('/tmp', join(root, '.agents/skills/absolute'));
  // WHEN: the links are checked.
  // THEN: neither escape is accepted.
  assert.throws(() => checkLink(root, join(root, '.agents/skills/escape')), /escaping symlink/, 'relative escapes must fail');
  assert.throws(() => checkLink(root, join(root, '.agents/skills/absolute')), /absolute symlink/, 'absolute links must fail');
}));

test('malformed native role TOML fails independently of plugin SDK', () => fixture((root, put) => {
  // GIVEN: a role with malformed TOML.
  put('.codex/agents/docs-writer.toml', 'model = [');
  // WHEN: native verification runs.
  const result = validateSetup(root, { checkIgnore: false });
  // THEN: the role parser rejects that file.
  assert.deepEqual(result.errors, [`invalid TOML: ${join(root, '.codex/agents/docs-writer.toml')}`], 'malformed role must fail through the TOML parser');
}));

test('incorrect native role model is rejected', () => fixture((root, put) => {
  // GIVEN: a valid role pinned to the wrong model.
  put('.codex/agents/docs-writer.toml', 'name = "docs-writer"\nmodel = "wrong"\ndeveloper_instructions = "Owned work"\n');
  // WHEN: native verification runs.
  const result = validateSetup(root, { checkIgnore: false });
  // THEN: the model mismatch fails exactly.
  assert.deepEqual(result.errors, ['model mismatch: docs-writer'], 'role model drift must fail');
}));

test('missing rule index entry fails even when the rule file exists', () => fixture((root, put) => {
  // GIVEN: a rule directory whose first rule is omitted from instructions.
  put('AGENTS.md', RULES.slice(1).map(name => `[rule](.codex/rules/${name}.md)`).join('\n'));
  // WHEN: native verification runs.
  const result = validateSetup(root, { checkIgnore: false });
  // THEN: the omitted loading contract is named.
  assert.deepEqual(result.errors, ['rule index missing: .codex/rules/avoid.md'], 'existing but unindexed rule must fail');
}));

test('missing skill reference target fails after valid frontmatter', () => fixture(root => {
  // GIVEN: valid skill metadata with its reference removed.
  unlinkSync(join(root, '.codex/skills/docs/references/check.md'));
  // WHEN: native verification runs.
  const result = validateSetup(root, { checkIgnore: false });
  // THEN: the missing contract resource is named.
  assert.deepEqual(result.errors, ['missing skill reference: docs/references/check.md'], 'advertised local resources must exist');
}));

for (const [suffix, message] of [['approval_policy = "never"', 'approval_policy'], ['sandbox_mode = "danger-full-access"', 'sandbox_mode'], ['[permissions]', 'permissions']]) {
  test(`native role rejects inherited permission override ${message}`, () => fixture((root, put) => {
    // GIVEN: an otherwise valid role that changes inherited permissions.
    put('.codex/agents/docs-writer.toml', `${ROLE}${suffix}\n`);
    // WHEN: native verification runs.
    const result = validateSetup(root, { checkIgnore: false });
    // THEN: the override is rejected explicitly.
    assert.deepEqual(result.errors, [`role permission override: ${message}`], 'role must inherit permission configuration');
  }));
}

test('native role requires its loader description', () => fixture((root, put) => {
  // GIVEN: a role without required loader metadata.
  put('.codex/agents/docs-writer.toml', ROLE.replace('description = "Internal writer"\n', ''));
  // WHEN: native verification runs.
  const result = validateSetup(root, { checkIgnore: false });
  // THEN: incomplete role metadata is rejected.
  assert.deepEqual(result.errors, ['docs-writer description missing'], 'native role description must be present');
}));

test('root instructions reject missing linked native resources', () => fixture((root, put) => {
  // GIVEN: root instructions linking an absent native resource.
  put('AGENTS.md', `${readFileSync(join(root, 'AGENTS.md'), 'utf8')}\n[extra](.codex/missing.md)`);
  // WHEN: native verification follows root links.
  const result = validateSetup(root, { checkIgnore: false });
  // THEN: the absent linked resource is named.
  assert.deepEqual(result.errors, ['missing native reference: AGENTS.md/.codex/missing.md'], 'root links must be checked');
}));

test('nested native references reject missing resources without scanning product prose', () => fixture((root, put) => {
  // GIVEN: a native reference linking a product document and a missing native file.
  put('sources/product.md', '[product-specific](missing-product.md)');
  put('.codex/skills/docs/references/check.md', '[product](../../../../sources/product.md)\n[nested](missing.md)');
  // WHEN: native verification follows authored native Markdown.
  const result = validateSetup(root, { checkIgnore: false });
  // THEN: only the native missing link is rejected.
  assert.deepEqual(result.errors, ['missing native reference: .codex/skills/docs/references/check.md/missing.md'], 'nested native references must be checked without recursively scanning product documents');
}));

test('relative source chain rejects an absolute intermediate hop', () => fixture((root, put) => {
  // GIVEN: a relative reference link whose next hop is an absolute internal link.
  put('sources/owned.md', 'Owned source');
  unlinkSync(join(root, '.codex/skills/docs/references/check.md'));
  symlinkSync('../../../../sources/absolute-hop', join(root, '.codex/skills/docs/references/check.md'));
  symlinkSync(join(root, 'sources/owned.md'), join(root, 'sources/absolute-hop'));
  // WHEN: native verification follows every source hop.
  const result = validateSetup(root, { checkIgnore: false });
  // THEN: the nonportable intermediate link is rejected.
  assert.deepEqual(result.errors, ['absolute symlink: sources/absolute-hop'], 'all hops must remain relative');
}));

test('portable source chains retain every intermediate hop in closure', () => fixture((root, put) => {
  // GIVEN: a portable two-hop reference with a directory-link first hop.
  put('sources/owned/check.md', 'Owned source');
  mkdirSync(join(root, 'sources/aliases'));
  symlinkSync('../owned', join(root, 'sources/aliases/directory'));
  unlinkSync(join(root, '.codex/skills/docs/references/check.md'));
  symlinkSync('../../../../sources/aliases/directory/check.md', join(root, '.codex/skills/docs/references/check.md'));
  // WHEN: native verification collects the source closure.
  const result = validateSetup(root, { checkIgnore: false });
  // THEN: portable links pass and the directory hop stays visible to ignore checks.
  assert.deepEqual(result.errors, [], 'portable directory-link chains must pass');
  assert.deepEqual(result.closure.filter(path => path.startsWith('sources/')), ['sources/aliases/directory', 'sources/owned/check.md'], 'closure must include every link hop and final source');
}));
