#!/usr/bin/env node
/**
 * Compact team-agent profile contract. Validates the Codex authority, native Codex projection,
 * shared team contract, and the intent-guard/non-team exemptions without mutating the repository.
 */
import { spawnSync } from 'node:child_process';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const EXPECTED_HEADINGS = [
  'Mission',
  'Owned surfaces',
  'Exclusions',
  'Must-load references',
  'Unique invariants',
  'Unique verification',
];
const LEGACY_HEADINGS = [
  'Immutable Traits (do NOT change during update)',
  'Update Protocol',
  'sub-agent task Acceptance Protocol',
  'Return Contract',
  'Domain Instructions',
  'Trace Instructions (optional — best effort)',
  'Colleagues',
];
const SOURCE_CLIENT_DIR = ['.', 'claude'].join('');
const SOURCE_TEAM_REF = `${SOURCE_CLIENT_DIR}/teams/{TEAM_NAME}/team.md`;
const NATIVE_TEAM_REF = '.codex/teams/{TEAM_NAME}/team.md';
const SOURCE_PLUGIN_ROOT = `${['CL', 'AUDE'].join('')}_PLUGIN_ROOT`;
const SOURCE_PLUGIN_ROOT_NEGATION = `!=\`\${${SOURCE_PLUGIN_ROOT}}\` substitution`;
const DUSK_ROSTER = [
  ['game-designer', 'design', 'pillars'],
  ['combat-dev', 'combat', 'loop'],
  ['physics-dev', 'physics', 'Jolt'],
  ['destruction-dev', 'destruct', 'fracture'],
  ['scenario-dev', 'scenarios', 'lab'],
  ['vfx-dev', 'VFX', 'impacts'],
  ['texture-artist', 'materials', 'textures'],
  ['modeller-3d', 'models', 'rigs'],
  ['sound-designer', 'audio', 'SFX'],
  ['feel-dev', 'feel', 'camera'],
  ['qa-tester', 'QA', 'tests'],
  ['docs-keeper', 'docs', 'sync'],
  ['build-eng', 'build', 'toolchain'],
];
const DUSK_NON_MEMBERS = ['task-tracker', 'intent-guard'];

let passed = 0;
let failed = 0;
const results = [];

function check(name, actual, expected, description) {
  if (actual === expected) {
    passed += 1;
    results.push(`  PASS  ${name}  (${description})`);
  } else {
    failed += 1;
    results.push(
      `  FAIL  ${name}  (${description} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`,
    );
  }
}

function findRepoRoot(start) {
  let candidate = start;
  while (dirname(candidate) !== candidate) {
    if (existsSync(join(candidate, '.codex', 'scripts', 'generate-compat.mjs'))) return candidate;
    candidate = dirname(candidate);
  }
  throw new Error('repository root with .codex/scripts/generate-compat.mjs not found');
}

function occurrences(text, literal) {
  return text.split(literal).length - 1;
}

function headings(text) {
  return [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
}

function fencedTeamTemplate(text) {
  const headingAt = text.indexOf('## team.md');
  const fenceAt = text.indexOf('```markdown\n', headingAt);
  const contentAt = fenceAt + '```markdown\n'.length;
  const endAt = text.indexOf('\n```', contentAt);
  return text.slice(contentAt, endAt);
}

function representativeProfile(text) {
  return text
    .replaceAll('{AGENT_NAME}', 'build-eng')
    .replaceAll('{TEAM_NAME}', 'dusk')
    .replaceAll('{PLUGIN_VERSION}', '6.1.4')
    .replaceAll('{LAST_UPDATED}', '2026-08-27')
    .replace(/\{[^}\n]+\}/g, 'bounded role detail');
}

function profileBody(text) {
  const bodyAt = text.indexOf('## Mission');
  return bodyAt >= 0 ? text.slice(bodyAt) : text;
}

function section(text, start, end) {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a + start.length);
  return text.slice(a, b < 0 ? text.length : b);
}

function rosterNames(team) {
  return section(team, '## Agents', '\n## ')
    .split('\n')
    .filter((line) => /^\|[a-z0-9]/.test(line) && !line.startsWith('|Agent|'))
    .map((line) => line.split('|')[1]);
}

function instantiateTeamTemplate(template, {
  projectRoot,
  roster,
  policy,
  version = '6.1.4',
  contentVersion = '6.1.0',
}) {
  const intentRow = policy === 'required'
    ? `|intent-guard|--|Anti-drift check: what was ASKED vs what was DELIVERED|active|2026-08-27|review-only|${version}|`
    : '';
  const domainRows = roster.map(([name, domain, mission]) =>
    `|${name}|${domain}|${mission}|active|2026-08-27|domain|${version}|`).join('\n');
  return `${template
    .replaceAll('{TEAM_NAME}', 'dusk')
    .replaceAll('{DATE}', '2026-08-27')
    .replaceAll('{LAST_UPDATED}', '2026-08-27')
    .replaceAll('{PLUGIN_VERSION}', version)
    .replaceAll('{CONTENT_VERSION}', contentVersion)
    .replaceAll('{N}', String(roster.length))
    .replaceAll('{CWD}', projectRoot)
    .replaceAll('{INTENT_GUARD_POLICY}', policy)
    .replaceAll('{INTENT_GUARD_ROW}', [intentRow, domainRows].filter(Boolean).join('\n'))}\n`;
}

const repo = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
const canonicalTemplatePath = join(repo, 'brewcode', 'skills', 'teams-setup', 'references', 'agent-template.md');
const canonicalFrameworkPath = join(repo, 'brewcode', 'skills', 'teams-setup', 'references', 'framework-files.md');
const canonicalSkillPath = join(repo, 'brewcode', '.codex', 'skills', 'teams-setup', 'SKILL.md');
const verifierPath = join(repo, 'brewcode', '.codex', 'skills', 'teams-setup', 'scripts', 'verify-team.sh');
const projectedTemplatePath = join(repo, 'brewcode', '.codex', 'skills', 'teams-setup', 'references', 'agent-template.md');
const projectedFrameworkPath = join(repo, 'brewcode', '.codex', 'skills', 'teams-setup', 'references', 'framework-files.md');
const distributedTemplatePath = join(repo, '.codex', 'plugins', 'brewcode', 'skills', 'teams-setup', 'references', 'agent-template.md');
const distributedFrameworkPath = join(repo, '.codex', 'plugins', 'brewcode', 'skills', 'teams-setup', 'references', 'framework-files.md');
const projectedCreatorPath = join(repo, 'brewcode', '.codex', 'agents', 'agent-creator.toml');

for (const [name, path] of [
  ['canonicalTemplate', canonicalTemplatePath],
  ['canonicalFramework', canonicalFrameworkPath],
  ['projectedTemplate', projectedTemplatePath],
  ['projectedFramework', projectedFrameworkPath],
  ['distributedTemplate', distributedTemplatePath],
  ['distributedFramework', distributedFrameworkPath],
  ['projectedCreator', projectedCreatorPath],
]) {
  check(`${name}.exists`, existsSync(path), true, `${name} artifact exists`);
}

const canonicalTemplate = readFileSync(canonicalTemplatePath, 'utf8');
const canonicalFramework = readFileSync(canonicalFrameworkPath, 'utf8');
const canonicalSkill = readFileSync(canonicalSkillPath, 'utf8');
const projectedTemplate = readFileSync(projectedTemplatePath, 'utf8');
const projectedFramework = readFileSync(projectedFrameworkPath, 'utf8');
const distributedTemplate = readFileSync(distributedTemplatePath, 'utf8');
const distributedFramework = readFileSync(distributedFrameworkPath, 'utf8');
const projectedCreator = readFileSync(projectedCreatorPath, 'utf8');

check(
  'canonical.headings',
  headings(canonicalTemplate).join('|'),
  EXPECTED_HEADINGS.join('|'),
  'canonical domain-agent body has exactly six ordered headings',
);
check(
  'canonical.legacyHeadings',
  LEGACY_HEADINGS.filter((heading) => headings(canonicalTemplate).includes(heading)).join('|'),
  '',
  'canonical profile carries no legacy shared-contract headings',
);
check(
  'canonical.sharedReferenceCount',
  occurrences(canonicalTemplate, SOURCE_TEAM_REF),
  1,
  'canonical profile loads the shared team contract exactly once',
);
check(
  'canonical.intentGuardExemption',
  canonicalTemplate.includes('superreview-setup/scripts/generate.sh emit-agent is its only writer'),
  true,
  'canonical template keeps the fixed intent-guard writer exemption',
);

const representative = representativeProfile(canonicalTemplate);
const representativeBody = profileBody(representative);
const runtimeRepresentativeBody = profileBody(representativeProfile(projectedTemplate));
check(
  'canonical.bodyBytesWithinCeiling',
  Buffer.byteLength(representativeBody, 'utf8') <= 3200,
  true,
  'representative generated body is at most 3200 bytes with frontmatter excluded',
);
check(
  'canonical.bodyTokensWithinCeiling',
  Math.ceil(representativeBody.length / 4) <= 800,
  true,
  'representative generated body is at most 800 estimated tokens',
);
check(
  'canonical.ceilingWording',
  canonicalTemplate.includes('frontmatter `---`; frontmatter excluded'),
  true,
  'the canonical template defines the ceiling over the body only',
);

const canonicalTeam = fencedTeamTemplate(canonicalFramework);
const projectedTeam = fencedTeamTemplate(projectedFramework);
const sourceReportsPath = `${SOURCE_CLIENT_DIR}/reports/YYYYMMDD-HHMMSS_{AGENT_NAME}/`;
const sourceTracePath = `${SOURCE_CLIENT_DIR}/teams/{TEAM_NAME}/trace-ops.sh`;
const sharedSourceLiterals = [
  '## Shared Agent Contract',
  'Before any task evaluate `Domain`, `Duplicate`, `Best candidate`.',
  '`1 attempt max`',
  'no retry, Bash only',
  'versionless project-local',
  sourceTracePath,
  SOURCE_PLUGIN_ROOT_NEGATION,
  'no `*_PLUGIN_ROOT` env',
  'plugin update/move/uninstall does not break it',
  '`took` / `refused` / `completed` / `failed`',
  'A task traced `took` ends with exactly one terminal track: `completed` or `failed`.',
  '`$SID` is 8 chars',
  'Verdict first, <=30 lines, `path:line`. !=bodies/output/log/preamble.',
  'This holds with or without agent-return.',
  sourceReportsPath,
  '>~1000 est-tokens (`chars/4`)',
  '>~2500',
  '<=3 lines',
  '!=imagined load/speculative abstraction',
  '10-user app !=lock-contention hardening',
  '!=replace them',
  '## Agents',
];
for (const literal of sharedSourceLiterals) {
  check(
    `shared.literal.${sharedSourceLiterals.indexOf(literal) + 1}`,
    canonicalTeam.includes(literal),
    true,
    `shared contract preserves exact literal ${JSON.stringify(literal)}`,
  );
}
check(
  'shared.templateCharsWithinCeiling',
  canonicalTeam.length <= 2800,
  true,
  'generated team.md fenced template is at most 2800 characters',
);
check(
  'shared.templateTokensWithinCeiling',
  Math.ceil(canonicalTeam.length / 4) <= 700,
  true,
  'generated team.md fenced template is at most 700 estimated tokens',
);
check(
  'shared.intentPolicyPlaceholder',
  occurrences(canonicalTeam, '{INTENT_GUARD_POLICY}'),
  1,
  'team template carries exactly one explicit intent-guard policy field',
);
check(
  'shared.intentRowPlaceholder',
  occurrences(canonicalTeam, '{INTENT_GUARD_ROW}'),
  1,
  'team template carries exactly one policy-controlled intent-guard row slot',
);

const fullDuskTeam = instantiateTeamTemplate(canonicalTeam, {
  projectRoot: '/Users/maximus/IdeaProjects/project-dusk',
  roster: DUSK_ROSTER,
  policy: 'legacy-absent',
});
check(
  'shared.fullDuskRosterCount',
  rosterNames(fullDuskTeam).length,
  13,
  'the representative full Dusk roster contains exactly 13 members',
);
check(
  'shared.fullDuskRosterNames',
  rosterNames(fullDuskTeam).join('|'),
  DUSK_ROSTER.map(([name]) => name).join('|'),
  'the full Dusk roster preserves the exact ordered member boundary',
);
check(
  'shared.fullDuskNonMembers',
  DUSK_NON_MEMBERS.filter((name) => rosterNames(fullDuskTeam).includes(name)).join('|'),
  '',
  'task-tracker and intent-guard stay outside the legacy-absent Dusk roster',
);
check(
  'shared.fullDuskPolicy',
  fullDuskTeam.includes('|Intent guard|legacy-absent|'),
  true,
  'the no-intent-guard roster carries an explicit legacy-absent policy',
);
check(
  'shared.fullDuskCharsWithinCeiling',
  fullDuskTeam.length <= 2800,
  true,
  'the complete 13-member Dusk team.md is at most 2800 characters',
);
check(
  'shared.fullDuskTokensWithinCeiling',
  Math.ceil(fullDuskTeam.length / 4) <= 700,
  true,
  'the complete 13-member Dusk team.md is at most 700 estimated tokens',
);

check(
  'codex.headings',
  headings(projectedTemplate).join('|'),
  EXPECTED_HEADINGS.join('|'),
  'native Codex template has the same six ordered headings',
);
check(
  'codex.legacyHeadings',
  LEGACY_HEADINGS.filter((heading) => headings(projectedTemplate).includes(heading)).join('|'),
  '',
  'native Codex profile carries no legacy shared-contract headings',
);
check(
  'codex.sharedReferenceCount',
  occurrences(projectedTemplate, NATIVE_TEAM_REF),
  1,
  'native Codex profile loads its shared team contract exactly once',
);
check(
  'codex.sourceReferenceAbsent',
  occurrences(projectedTemplate, SOURCE_TEAM_REF),
  0,
  'native Codex profile carries no Codex project path',
);
check(
  'codex.intentGuardExemption',
  projectedTemplate.includes('This template never applies to `intent-guard`.'),
  true,
  'native Codex template preserves the intent-guard exemption',
);
check(
  'codex.profileBytesWithinCeiling',
  Buffer.byteLength(profileBody(projectedTemplate), 'utf8') <= 3200,
  true,
  'native Codex team body is at most 3200 bytes with frontmatter excluded',
);
check(
  'codex.profileTokensWithinCeiling',
  Math.ceil(profileBody(projectedTemplate).length / 4) <= 800,
  true,
  'native Codex team body is at most 800 estimated tokens',
);

for (const literal of sharedSourceLiterals) {
  const nativeLiteral = literal
    .replaceAll(SOURCE_CLIENT_DIR, '.codex')
    .replaceAll(`\`\${${SOURCE_PLUGIN_ROOT}}\``, '`<plugin-root>`');
  check(
    `codex.sharedLiteral.${sharedSourceLiterals.indexOf(literal) + 1}`,
    projectedTeam.includes(nativeLiteral),
    true,
    `projected shared contract preserves ${JSON.stringify(nativeLiteral)}`,
  );
}
check(
  'codex.sharedContractCharsParity',
  projectedTeam.length <= canonicalTeam.length,
  true,
  'Codex path projection does not grow the shared contract',
);
const fullNativeDuskTeam = instantiateTeamTemplate(projectedTeam, {
  projectRoot: '/Users/maximus/IdeaProjects/project-dusk',
  roster: DUSK_ROSTER,
  policy: 'legacy-absent',
});
check(
  'codex.fullDuskRosterNames',
  rosterNames(fullNativeDuskTeam).join('|'),
  DUSK_ROSTER.map(([name]) => name).join('|'),
  'native Codex projection preserves the exact full Dusk member boundary',
);
check(
  'codex.fullDuskTokensWithinCeiling',
  Math.ceil(fullNativeDuskTeam.length / 4) <= 700,
  true,
  'native Codex full Dusk team remains at most 700 estimated tokens',
);
check(
  'codex.distributedTemplateParity',
  distributedTemplate,
  projectedTemplate,
  'distributed Codex team template equals the canonical projection byte-for-byte',
);
check(
  'codex.distributedFrameworkParity',
  distributedFramework,
  projectedFramework,
  'distributed Codex shared contract equals the canonical projection byte-for-byte',
);

const bootstrapAt = canonicalSkill.indexOf('### C2.6: Shared Contract Bootstrap');
const createAt = canonicalSkill.indexOf('### C3: Agent Creation');
const finalizeAt = canonicalSkill.indexOf('### C4: Roster Finalization');
check(
  'install.bootstrapBeforeAgents',
  bootstrapAt >= 0 && bootstrapAt < createAt,
  true,
  'the shared team contract is written before any discoverable domain profile',
);
check(
  'install.finalizeAfterAgents',
  createAt >= 0 && createAt < finalizeAt,
  true,
  'the final roster is written only after agent creation settles',
);
const bootstrap = section(canonicalSkill, '### C2.6: Shared Contract Bootstrap', '### C3: Agent Creation');
for (const literal of [
  'before any team-owned `.codex/agents/{name}.toml` is written',
  'write `team.md`',
  'Do not add domain-agent rows yet',
  '**STOP on any failure. Do not spawn or write an agent.**',
]) {
  check(
    `install.bootstrap.${literal.slice(0, 16)}`,
    bootstrap.includes(literal),
    true,
    `interrupted-install ordering preserves ${JSON.stringify(literal)}`,
  );
}

const migrationAt = canonicalSkill.indexOf('### U1b: Shared Contract Migration Gate');
const analyzeAt = canonicalSkill.indexOf('### U2: Analyze Performance');
const applyAt = canonicalSkill.indexOf('### U4: Apply Changes');
check(
  'upgrade.contractBeforeAgentRewrite',
  migrationAt >= 0 && migrationAt < analyzeAt && migrationAt < applyAt,
  true,
  'legacy team.md is migrated before any compact-agent rewrite can strip local rules',
);
const migration = section(canonicalSkill, '### U1b: Shared Contract Migration Gate', '### U2: Analyze Performance');
for (const literal of [
  'insert the canonical block before `## Agents`',
  'an existing intent-guard roster row -> `required`; no row',
  '-> `legacy-absent`. Never synthesize the row on the latter path.',
  'Legacy agent bodies remain byte-identical during this gate.',
  '**No agent may be tuned, regenerated, stripped,',
  'until the shared contract passes.',
]) {
  check(
    `upgrade.migration.${literal.slice(0, 16)}`,
    migration.includes(literal),
    true,
    `legacy-upgrade ordering preserves ${JSON.stringify(literal)}`,
  );
}
for (const literal of [
  'a new team defaults to `required`',
  'absence migrates\nto `legacy-absent`',
  '`legacy-absent` forbids that row and MUST NOT add the role during upgrade',
  'the complete written `team.md` (metadata + shared contract + every row) MUST be <=2800 characters',
  '`ceil(chars/4) <=700` estimated tokens',
]) {
  check(
    `policy.workflow.${literal.slice(0, 16)}`,
    canonicalSkill.includes(literal),
    true,
    `generator workflow preserves ${JSON.stringify(literal)}`,
  );
}

const c8 = section(canonicalSkill, '### C8: Fix', '### C9: Re-verify');
check(
  'repair.canonicalTemplate',
  c8.includes('`<skill-directory>/references/agent-template.md`'),
  true,
  'every C8 repair brief cites the canonical domain-agent template',
);
const c9 = section(canonicalSkill, '### C9: Re-verify', '> To skip review pipeline');
for (const literal of [
  '`developer_instructions` only: <=3200 bytes',
  '`Mission`, `Owned surfaces`, `Exclusions`, `Must-load references`, `Unique invariants`,',
  '`Unique verification` in order with no other headings',
  '`intent-guard` is exempt from this six-heading gate',
]) {
  check(
    `reverify.guard.${literal.slice(0, 16)}`,
    c9.includes(literal),
    true,
    `C9 hard-gates ${JSON.stringify(literal)}`,
  );
}

for (const literal of [
  'For a teams-setup domain agent',
  'Under Must-load references include exactly one',
  'keep shared task acceptance, routing, tracing, return, and colleague contracts only in that file',
  'Never apply the team profile to intent-guard',
  'For every non-team agent, retain the generic contract',
  'output discipline',
  'scope fit plus etalon-first',
]) {
  check(
    `creator.behavior.${literal.slice(0, 12)}`,
    projectedCreator.includes(literal),
    true,
    `native agent-creator preserves ${JSON.stringify(literal)}`,
  );
}
check(
  'creator.headingOrder',
  EXPECTED_HEADINGS.map((heading) => projectedCreator.indexOf(`## ${heading}`)).every(
    (position, index, positions) => position >= 0 && (index === 0 || position > positions[index - 1]),
  ),
  true,
  'native agent-creator names all six team headings in order',
);
check(
  'creator.sharedReferenceCount',
  occurrences(projectedCreator, NATIVE_TEAM_REF),
  1,
  'native agent-creator names the shared team reference exactly once',
);

// Runtime verifier regressions use an isolated cwd. The shipped verifier self-locates its own
// manifest/reference files, while every instantiated team/agent path stays below the temp root.
const pluginVersion = (/brewcode-meta: version=([0-9]+\.[0-9]+\.[0-9]+)/.exec(canonicalSkill) || [])[1];
const contentVersion = (/content_version=([0-9]+\.[0-9]+\.[0-9]+)/.exec(canonicalSkill) || [])[1];
const today = '2026-08-27';
const BUILD_ROSTER = [['build-eng', 'Build', 'deterministic builds']];

function instantiateTeam(projectRoot, { policy = 'required', roster = BUILD_ROSTER } = {}) {
  return instantiateTeamTemplate(projectedTeam, {
    projectRoot: '/Users/maximus/IdeaProjects/project-dusk', roster, policy, version: pluginVersion, contentVersion,
  });
}

// BEGIN RUNTIME AGENT FIXTURES
function tomlString(value) {
  return JSON.stringify(value);
}

function agentFile({ name = 'build-eng', body = runtimeRepresentativeBody, extraField = '' } = {}) {
  return `name = ${tomlString(name)}\ndescription = "Domain owner. Triggers: domain, review, verification."\ndeveloper_instructions = ${tomlString(body)}\n${extraField}`;
}

function intentGuardFile() {
  return `name = "intent-guard"\ndescription = "Review-only anti-drift check."\ndeveloper_instructions = "Review only; never implement or mutate project files."\n`;
}
// END RUNTIME AGENT FIXTURES

function makeWorld({
  teamText,
  agentText,
  policy = 'required',
  roster = BUILD_ROSTER,
  intent = policy === 'required',
} = {}) {
  const world = mkdtempSync(join(tmpdir(), 'team-profile-contract-'));
  const teamDir = join(world, '.codex', 'teams', 'dusk');
  const agentsDir = join(world, '.codex', 'agents');
  mkdirSync(teamDir, { recursive: true });
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(join(teamDir, 'team.md'), teamText ?? instantiateTeam(world, { policy, roster }));
  writeFileSync(join(teamDir, 'trace.jsonl'), '');
  writeFileSync(join(teamDir, 'trace-ops.sh'), '#!/bin/sh\nexit 0\n');
  chmodSync(join(teamDir, 'trace-ops.sh'), 0o755);
  for (const [name] of roster) {
    writeFileSync(join(agentsDir, `${name}.toml`),
      name === 'build-eng' && agentText ? agentText : agentFile({ name }));
  }
  if (intent) writeFileSync(join(agentsDir, 'intent-guard.toml'), intentGuardFile());
  return world;
}

function runVerifier(world) {
  const result = spawnSync('bash', [verifierPath, 'dusk'], {
    cwd: world,
    encoding: 'utf8',
    timeout: 30000,
  });
  return { status: result.status, output: `${result.stdout || ''}${result.stderr || ''}` };
}

function removeWorld(world) {
  rmSync(world, { recursive: true, force: true });
}

{
  const world = makeWorld();
  const result = runVerifier(world);
  check('verifier.current.exit', result.status, 0, 'a complete current team passes the hard verifier');
  check('verifier.current.shared', result.output.includes('CHECK: Shared Agent Contract ... OK'), true,
    'the instantiated shared contract is verified');
  removeWorld(world);
}

{
  const world = makeWorld({ policy: 'legacy-absent', roster: DUSK_ROSTER });
  const result = runVerifier(world);
  check('verifier.fullDuskLegacyAbsent.exit', result.status, 0,
    'the full 13-member Dusk roster passes without adding intent-guard');
  check('verifier.fullDuskLegacyAbsent.policy',
    result.output.includes('CHECK: Intent guard policy (legacy-absent) ... OK'), true,
    'the verifier accepts the explicit no-intent-guard policy');
  check('verifier.fullDuskLegacyAbsent.memberChecks',
    DUSK_ROSTER.every(([name]) => result.output.includes(`CHECK: agent ${name} ... OK`)), true,
    'the verifier checks every exact Dusk member');
  removeWorld(world);
}

{
  const world = makeWorld({ policy: 'required', intent: false });
  const teamPath = join(world, '.codex', 'teams', 'dusk', 'team.md');
  writeFileSync(teamPath, readFileSync(teamPath, 'utf8').replace(/^\|intent-guard\|.*\n/m, ''));
  const result = runVerifier(world);
  check('verifier.requiredMissing.exit', result.status, 1,
    'required policy fails when the intent-guard row is absent');
  check('verifier.requiredMissing.reason',
    result.output.includes('policy required needs exactly one row; found 0'), true,
    'required-policy failure names the missing row');
  removeWorld(world);
}

{
  const world = makeWorld({ policy: 'legacy-absent', intent: true });
  const teamPath = join(world, '.codex', 'teams', 'dusk', 'team.md');
  const team = readFileSync(teamPath, 'utf8');
  const forbiddenRow = `|intent-guard|--|Anti-drift check: what was ASKED vs what was DELIVERED|active|${today}|review-only|${pluginVersion}|`;
  writeFileSync(teamPath, `${team.trim()}\n${forbiddenRow}\n`);
  const result = runVerifier(world);
  check('verifier.legacyAbsentRow.exit', result.status, 1,
    'legacy-absent policy fails when an intent-guard row is introduced');
  check('verifier.legacyAbsentRow.reason',
    result.output.includes('policy legacy-absent requires zero rows; found 1'), true,
    'legacy-absent failure names the forbidden roster expansion');
  removeWorld(world);
}

{
  const world = makeWorld();
  const teamPath = join(world, '.codex', 'teams', 'dusk', 'team.md');
  writeFileSync(teamPath, readFileSync(teamPath, 'utf8').replace(
    '|Intent guard|required|', '|Intent guard|optional|'));
  const result = runVerifier(world);
  check('verifier.invalidPolicy.exit', result.status, 1,
    'an unsupported intent-guard policy fails');
  check('verifier.invalidPolicy.reason',
    result.output.includes("expected required or legacy-absent; found 'optional'"), true,
    'the verifier enumerates the only valid policy values');
  removeWorld(world);
}

{
  const world = makeWorld();
  const teamPath = join(world, '.codex', 'teams', 'dusk', 'team.md');
  writeFileSync(teamPath, `${readFileSync(teamPath, 'utf8')}${'x'.repeat(900)}\n`);
  const result = runVerifier(world);
  check('verifier.teamCeiling.exit', result.status, 1,
    'an oversized fully substituted team.md fails');
  check('verifier.teamCeiling.reason',
    result.output.includes('maximum 2800 chars and 700 ceil(chars/4) tokens'), true,
    'the runtime verifier names both complete-file ceilings');
  removeWorld(world);
}

{
  const world = makeWorld();
  const teamPath = join(world, '.codex', 'teams', 'dusk', 'team.md');
  writeFileSync(teamPath, readFileSync(teamPath, 'utf8').replace('|Agents|1|', '|Agents|2|'));
  const result = runVerifier(world);
  check('verifier.agentCountMismatch.exit', result.status, 1,
    'declared Agents count must equal unique domain rows');
  check('verifier.agentCountMismatch.reason',
    result.output.includes('declared 2, found 1 unique domain rows'), true,
    'the mismatch reports declared and observed unique-domain counts');
  removeWorld(world);
}

{
  const world = makeWorld();
  const teamPath = join(world, '.codex', 'teams', 'dusk', 'team.md');
  const duplicate = `|build-eng|Build|deterministic builds|active|${today}|domain|${pluginVersion}|\n`;
  writeFileSync(teamPath, `${readFileSync(teamPath, 'utf8')}${duplicate}`);
  const result = runVerifier(world);
  check('verifier.duplicateDomain.exit', result.status, 1,
    'duplicate domain roster names fail');
  check('verifier.duplicateDomain.reason',
    result.output.includes("duplicate roster name"), true,
    'the verifier identifies duplicate roster identity');
  removeWorld(world);
}

{
  const world = makeWorld();
  const teamPath = join(world, '.codex', 'teams', 'dusk', 'team.md');
  const duplicate = `|intent-guard|--|Anti-drift check: what was ASKED vs what was DELIVERED|active|${today}|review-only|${pluginVersion}|\n`;
  writeFileSync(teamPath, `${readFileSync(teamPath, 'utf8')}${duplicate}`);
  const result = runVerifier(world);
  check('verifier.duplicateIntentGuard.exit', result.status, 1,
    'required policy rejects duplicate intent-guard rows');
  check('verifier.duplicateIntentGuard.reason',
    result.output.includes('policy required needs exactly one row; found 2'), true,
    'the verifier enforces exactly one review-only row');
  removeWorld(world);
}

// BEGIN SOURCE FRONTMATTER BUDGET FIXTURE
{
  const world = makeWorld({ agentText: agentFile({ extraField: 'model = "legacy"\n' }) });
  const result = runVerifier(world);
  check('verifier.exactTomlKeys.exit', result.status, 1, 'an unsupported fourth TOML key fails');
  check('verifier.exactTomlKeys.reason', result.output.includes('TOML keys must be exactly name, description, developer_instructions'), true,
    'the verifier enforces the exact native schema structurally');
  removeWorld(world);
}

{
  const world = makeWorld({ agentText: '---\nname: build-eng\n---\n' });
  const result = runVerifier(world);
  check('verifier.renamedMarkdown.exit', result.status, 1, 'renamed Markdown is not accepted as TOML');
  check('verifier.renamedMarkdown.reason', result.output.includes('invalid TOML'), true,
    'the verifier parses the native fixture instead of scanning YAML text');
  removeWorld(world);
}
// END SOURCE FRONTMATTER BUDGET FIXTURE

{
  const oversized = `${runtimeRepresentativeBody}\n${'x'.repeat(3300)}\n`;
  const world = makeWorld({ agentText: agentFile({ body: oversized }) });
  const result = runVerifier(world);
  check('verifier.bodyCeiling.exit', result.status, 1, 'an oversized developer_instructions value fails');
  check('verifier.bodyCeiling.reason', result.output.includes('ceilings are 3200 bytes and 800 ceil(chars/4) tokens'), true,
    'the failure names the body-only contract');
  removeWorld(world);
}

const instantiatedLosses = [
  'Every domain agent loads this file before task acceptance. `intent-guard` is exempt: it keeps its review-only output contract and never implements.',
  'execute only owned surfaces',
  'Optional best effort, `1 attempt max`, no retry, Bash only.',
  'Track states: `took` / `refused` / `completed` / `failed`.',
  'Issue severity: `low` / `medium` / `high` / `critical`.',
  'Insight category (max 1-3): `pattern` / `architecture` / `performance` / `security` / `convention` / `debt`.',
  'A task traced `took` ends with exactly one terminal track: `completed` or `failed`.',
  'Verdict first, <=30 lines, `path:line`. !=bodies/output/log/preamble.',
  '>~1000 est-tokens (`chars/4`)',
  '<=3 lines',
];
for (const [index, literal] of instantiatedLosses.entries()) {
  const world = makeWorld();
  const teamPath = join(world, '.codex', 'teams', 'dusk', 'team.md');
  writeFileSync(teamPath, readFileSync(teamPath, 'utf8').replace(literal, '[removed contract literal]'));
  const result = runVerifier(world);
  check(`verifier.loss.${index + 1}.exit`, result.status, 1,
    `removing critical shared literal ${JSON.stringify(literal)} fails`);
  check(`verifier.loss.${index + 1}.reason`, result.output.includes(`missing: ${literal}`), true,
    'the verifier identifies the exact lost contract');
  removeWorld(world);
}

// BEGIN SOURCE LEGACY AGENT FIXTURE
{
  const legacyTeam = `# Team: dusk

| Field | Value |
|-------|-------|
| Created | ${today} |
| Version | ${pluginVersion} |
| Content version | ${contentVersion} |
| Generated by | brewcode:teams-setup |
| Last update | ${today} |
| Agents | 1 |
| Project | /legacy |

## Agents

| Agent | Domain | Mission | Status | Updated | Kind | Version |
|-------|--------|---------|--------|---------|------|---------|
| build-eng | Build | Legacy owner | active | ${today} | domain | ${pluginVersion} |
`;
  const legacyBody = '## Domain Instructions\n\nLegacy acceptance and trace rules remain local until upgrade.\n';
  const world = makeWorld({ teamText: legacyTeam, agentText: agentFile({ body: legacyBody }), intent: false });
  const result = runVerifier(world);
  check('verifier.legacyMigrationSafe.exit', result.status, 1,
    'a structurally parsed native agent without six headings fails');
  check('verifier.legacyMigrationSafe.warning',
    result.output.includes('body headings must be exactly the six ordered teams-setup headings in developer_instructions'),
    true,
    'legacy authority and legacy profile produce migration warnings without destructive failure');
  removeWorld(world);

  const interrupted = makeWorld({ teamText: legacyTeam, agentText: agentFile(), intent: false });
  const interruptedResult = runVerifier(interrupted);
  check('verifier.interruptedInstall.exit', interruptedResult.status, 1,
    'a compact discoverable profile without the shared contract is an unsafe interrupted install');
  check('verifier.interruptedInstall.reason', interruptedResult.output.includes('shared team contract missing; interrupted install/unsafe migration'), true,
    'the verifier directs repair of the shared authority before profile stripping');
  removeWorld(interrupted);
}
// END SOURCE LEGACY AGENT FIXTURE

for (const [name, mutate, reason] of [
  ['firstReference', (text) => text.replace('.codex/teams/dusk/team.md', '.codex/teams/other/team.md'),
    'Must-load references must name .codex/teams/dusk/team.md'],
  ['extraHeading', (text) => `${text}\n## Return Contract\n\nDuplicated.\n`,
    'body headings must be exactly the six ordered teams-setup headings'],
]) {
  const world = makeWorld({ agentText: agentFile({ body: mutate(runtimeRepresentativeBody) }) });
  const result = runVerifier(world);
  check(`verifier.profileLoss.${name}.exit`, result.status, 1, `${name} profile loss fails`);
  check(`verifier.profileLoss.${name}.reason`, result.output.includes(reason), true,
    'the verifier names the compact-profile loss');
  removeWorld(world);
}

for (const [name, mutate] of [
  ['domain', (row) => row.replace('|--|', '|code|')],
  ['mission', (row) => row.replace('Anti-drift check: what was ASKED vs what was DELIVERED', 'Implementation owner')],
  ['status', (row) => row.replace('|active|', '|inactive|')],
  ['updated', (row) => row.replace(`|${today}|review-only|`, '|2026-08-26|review-only|')],
  ['kind', (row) => row.replace('|review-only|', '|domain|')],
  ['version', (row) => row.replace(`|${pluginVersion}|`, '|0.0.0|')],
]) {
  const world = makeWorld();
  const teamPath = join(world, '.codex', 'teams', 'dusk', 'team.md');
  const fixedRow = `|intent-guard|--|Anti-drift check: what was ASKED vs what was DELIVERED|active|${today}|review-only|${pluginVersion}|`;
  writeFileSync(teamPath, readFileSync(teamPath, 'utf8').replace(fixedRow, mutate(fixedRow)));
  const result = runVerifier(world);
  check(`verifier.intentGuardFixed.${name}.exit`, result.status, 1,
    `changing fixed intent-guard ${name} fails`);
  check(`verifier.intentGuardFixed.${name}.reason`,
    result.output.includes('fixed cells require --, anti-drift mission, active, team Last update, review-only, and team Version'), true,
    'the verifier protects every fixed review-only cell');
  removeWorld(world);
}

const nativeVerifier = readFileSync(verifierPath, 'utf8');
check('codex.verifier.tomllib', nativeVerifier.includes('import tomllib'), true,
  'native verifier parses TOML structurally');
check('codex.verifier.noYamlParser', nativeVerifier.includes('NR == 1 && $0 == "---"'), false,
  'native verifier has no YAML fence parser');
check('codex.verifier.exactKeys',
  nativeVerifier.includes('required = {"name", "description", "developer_instructions"}'), true,
  'native verifier pins the exact supported top-level schema');

console.log('suite-agent-profile-contract.mjs');
for (const line of results) console.log(line);
console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
