#!/usr/bin/env node
/**
 * Compact team-agent profile contract. Validates the Claude authority, native Codex projection,
 * shared team contract, and the intent-guard/non-team exemptions without mutating the repository.
 */
import { spawnSync } from 'node:child_process';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync,
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
  'Task Acceptance Protocol',
  'Return Contract',
  'Domain Instructions',
  'Trace Instructions (optional — best effort)',
  'Colleagues',
];
const SOURCE_CLIENT_DIR = ['.', 'claude'].join('');
const FOREIGN_DEFAULT_REPORT_ROOT = ['.', 'claude', 'reports'].join('/');
const SOURCE_TEAM_REF = `${SOURCE_CLIENT_DIR}/teams/{TEAM_NAME}/team.md`;
const NATIVE_TEAM_REF = '.codex/teams/{TEAM_NAME}/team.md';
const SOURCE_PLUGIN_ROOT = `${['CL', 'AUDE'].join('')}_PLUGIN_ROOT`;
const SOURCE_PLUGIN_ROOT_NEGATION = `!=\`\${${SOURCE_PLUGIN_ROOT}}\` substitution`;
const REQUIRED_GUARD_SENTENCE = '`intent-guard` is review-only, keeps its own output contract, and never implements.';
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
  reportRoot = `${SOURCE_CLIENT_DIR}/reports`,
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
    .replaceAll('{REPORT_ROOT}', reportRoot)
    .replaceAll('{INTENT_GUARD_POLICY}', policy)
    .replaceAll('{INTENT_GUARD_SHARED_CONTRACT}', policy === 'required' ? REQUIRED_GUARD_SENTENCE : '')
    .replaceAll('{INTENT_GUARD_ROW}', [intentRow, domainRows].filter(Boolean).join('\n'))}\n`;
}

const repo = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
const canonicalTemplatePath = join(repo, 'brewcode', 'skills', 'teams-setup', 'references', 'agent-template.md');
const canonicalFrameworkPath = join(repo, 'brewcode', 'skills', 'teams-setup', 'references', 'framework-files.md');
const canonicalSkillPath = join(repo, 'brewcode', 'skills', 'teams-setup', 'SKILL.md');
const verifierPath = join(repo, 'brewcode', 'skills', 'teams-setup', 'scripts', 'verify-team.sh');
const projectedSkillPath = join(repo, 'brewcode', '.codex', 'skills', 'teams-setup', 'SKILL.md');
const projectedTemplatePath = join(repo, 'brewcode', '.codex', 'skills', 'teams-setup', 'references', 'agent-template.md');
const projectedFrameworkPath = join(repo, 'brewcode', '.codex', 'skills', 'teams-setup', 'references', 'framework-files.md');
const distributedTemplatePath = join(repo, '.codex', 'plugins', 'brewcode', 'skills', 'teams-setup', 'references', 'agent-template.md');
const distributedFrameworkPath = join(repo, '.codex', 'plugins', 'brewcode', 'skills', 'teams-setup', 'references', 'framework-files.md');
const projectedCreatorPath = join(repo, 'brewcode', '.codex', 'agents', 'agent-creator.toml');

for (const [name, path] of [
  ['canonicalTemplate', canonicalTemplatePath],
  ['canonicalFramework', canonicalFrameworkPath],
  ['projectedSkill', projectedSkillPath],
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
const projectedSkill = readFileSync(projectedSkillPath, 'utf8');
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
const reportPathPlaceholder = '{REPORT_ROOT}/YYYYMMDD-HHMMSS_{AGENT_NAME}/';
const sourceTracePath = `${SOURCE_CLIENT_DIR}/teams/{TEAM_NAME}/trace-ops.sh`;
const sharedSourceLiterals = [
  '## Shared Agent Contract',
  'Every domain agent loads this file before task acceptance.',
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
  reportPathPlaceholder,
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
check(
  'shared.reportRootPlaceholder',
  occurrences(canonicalTeam, '{REPORT_ROOT}'),
  1,
  'team template carries exactly one project-resolved report-root slot',
);
check(
  'shared.intentContractPlaceholder',
  occurrences(canonicalTeam, '{INTENT_GUARD_SHARED_CONTRACT}'),
  1,
  'team template carries exactly one policy-conditional shared guard slot',
);
check(
  'shared.noHardcodedSourceReportRoot',
  canonicalTeam.includes(`${SOURCE_CLIENT_DIR}/reports/YYYYMMDD-HHMMSS_{AGENT_NAME}/`),
  false,
  'canonical framework cannot regrow the plugin-default report root',
);

const fullDuskTeam = instantiateTeamTemplate(canonicalTeam, {
  projectRoot: '/Users/maximus/IdeaProjects/project-dusk',
  roster: DUSK_ROSTER,
  policy: 'legacy-absent',
  reportRoot: '.codex/reports',
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
  'shared.fullDuskReportRoot',
  fullDuskTeam.includes('Bulk -> `.codex/reports/YYYYMMDD-HHMMSS_{AGENT_NAME}/`'),
  true,
  'Dusk guidance resolves the exact project report root',
);
check(
  'shared.fullDuskNoReportPlaceholderOrRegrowth',
  fullDuskTeam.includes('{REPORT_ROOT}') || fullDuskTeam.includes(`Bulk -> \`${FOREIGN_DEFAULT_REPORT_ROOT}/`),
  false,
  'Dusk output has no unresolved report placeholder or Claude-default regrowth',
);
check(
  'shared.fullDuskNoPhantomGuard',
  section(fullDuskTeam, '## Shared Agent Contract', '## Agents').includes('intent-guard'),
  false,
  'legacy-absent shared wording does not assert a phantom role',
);
const requiredTeam = instantiateTeamTemplate(canonicalTeam, {
  projectRoot: '/project', roster: [['build-eng', 'Build', 'deterministic builds']], policy: 'required',
});
check(
  'shared.requiredGuardSentence',
  occurrences(section(requiredTeam, '## Shared Agent Contract', '## Agents'), REQUIRED_GUARD_SENTENCE),
  1,
  'required policy includes the exact review-only guard sentence once',
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
  'native Codex profile carries no Claude project path',
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
  reportRoot: '.codex/reports',
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

// BEGIN PROJECTED WORKFLOW CONTRACT
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
  'before any team-owned `.claude/agents/{name}.md` is written',
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
  '-> `legacy-absent`. Substitute the exact review-only guard sentence only for `required`',
  'shared contract never names a phantom role',
  'Never synthesize the row on\nthe latter path.',
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
const upgrade = section(canonicalSkill, '## Mode: UPGRADE (self-reflection)', '## Mode: ENABLE');
const cutoffCaptureAt = upgrade.indexOf('UPGRADE_CUTOFF=$(date -u +%Y-%m-%dT%H:%M:%SZ)');
const cursorReadAt = upgrade.indexOf('CURSOR=$(bash');
const traceReadAt = upgrade.indexOf('trace-ops.sh" read');
const cursorCommitAt = upgrade.indexOf('set "$UPGRADE_CUTOFF"');
check('upgrade.cursorCutoff.order',
  cutoffCaptureAt >= 0 && cutoffCaptureAt < cursorReadAt && cursorReadAt < traceReadAt &&
    traceReadAt < cursorCommitAt,
  true,
  'upgrade captures one stable cutoff before reading and commits it only after the work');
check('upgrade.cursorCutoff.noCompletionTimestamp',
  upgrade.includes('cursor ".claude/teams/{TEAM_NAME}" set "$(date -u'), false,
  'upgrade never advances the cursor to a later completion-time timestamp');
check('upgrade.cursorCutoff.concurrentSafety',
  upgrade.includes('must never be skipped by advancing the cursor past them'), true,
  'the workflow explicitly preserves entries created during upgrade');
check('codex.upgradeCursorCutoff',
  projectedSkill.includes('Capture an immutable UTC upgrade cutoff before the initial cursor and trace reads') &&
    projectedSkill.includes('set the cursor to that captured cutoff, never to a new completion-time timestamp'),
  true,
  'the generated native workflow preserves stable cursor-cutoff ordering');
for (const literal of [
  'a new team defaults to `required`',
  'absence migrates\nto `legacy-absent`',
  '`legacy-absent` forbids that row and MUST NOT add the role during upgrade',
  'segments, backslashes, whitespace, doubled\nslashes, unresolved `{...}` tokens, control characters, or shell metacharacters',
  'segment MUST match `^[A-Za-z0-9._-]+$`',
  'conflicting report-root directives -> STOP',
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
  c8.includes('`${CLAUDE_SKILL_DIR}/references/agent-template.md`'),
  true,
  'every C8 repair brief cites the canonical domain-agent template',
);
const c9 = section(canonicalSkill, '### C9: Re-verify', '> To skip review pipeline');
for (const literal of [
  'exactly one single-line description <=100 characters',
  'body only (frontmatter excluded): <=3200 bytes',
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
// END PROJECTED WORKFLOW CONTRACT

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
const pluginVersion = JSON.parse(readFileSync(
  join(repo, 'brewcode', '.claude-plugin', 'plugin.json'), 'utf8',
)).version;
const contentVersion = (/content_version=([0-9]+\.[0-9]+\.[0-9]+)/.exec(canonicalSkill) || [])[1];
const today = '2026-08-27';
const BUILD_ROSTER = [['build-eng', 'Build', 'deterministic builds']];

function instantiateTeam(projectRoot, {
  policy = 'required', roster = BUILD_ROSTER, reportRoot = `${SOURCE_CLIENT_DIR}/reports`,
} = {}) {
  return instantiateTeamTemplate(canonicalTeam, {
    projectRoot: '/Users/maximus/IdeaProjects/project-dusk', roster, policy, reportRoot,
    version: pluginVersion, contentVersion,
  });
}

// BEGIN RUNTIME AGENT FIXTURES
function agentFile({
  name = 'build-eng', description = '"Domain owner. Triggers: domain, review, verification."',
  body = representativeBody, frontmatterPadding = '',
} = {}) {
  return `---
name: ${name}
description: ${description}
model: opus
tools: Read, Bash
${frontmatterPadding}doc_type: llm
version: "${pluginVersion}"
generated_by: "brewcode:teams-setup"
last_updated: "${today}"
---

${body}`;
}

function intentGuardFile() {
  return `---
name: intent-guard
description: Review-only anti-drift check.
model: sonnet
tools: Read
doc_type: llm
version: "${pluginVersion}"
generated_by: "brewcode:superreview-setup"
last_updated: "${today}"
---

# Intent guard

Review only.
`;
}
// END RUNTIME AGENT FIXTURES

function makeWorld({
  teamText,
  agentText,
  policy = 'required',
  roster = BUILD_ROSTER,
  reportRoot = `${SOURCE_CLIENT_DIR}/reports`,
  intent = policy === 'required',
} = {}) {
  const world = mkdtempSync(join(tmpdir(), 'team-profile-contract-'));
  const teamDir = join(world, SOURCE_CLIENT_DIR, 'teams', 'dusk');
  const agentsDir = join(world, SOURCE_CLIENT_DIR, 'agents');
  mkdirSync(teamDir, { recursive: true });
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(join(teamDir, 'team.md'), teamText ?? instantiateTeam(world, { policy, roster, reportRoot }));
  writeFileSync(join(teamDir, 'trace.jsonl'), '');
  writeFileSync(join(teamDir, 'trace-ops.sh'), '#!/bin/sh\nexit 0\n');
  chmodSync(join(teamDir, 'trace-ops.sh'), 0o755);
  for (const [name] of roster) {
    writeFileSync(join(agentsDir, `${name}.md`),
      name === 'build-eng' && agentText ? agentText : agentFile({ name }));
  }
  if (intent) writeFileSync(join(agentsDir, 'intent-guard.md'), intentGuardFile());
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
  const world = makeWorld();
  const teamPath = join(world, SOURCE_CLIENT_DIR, 'teams', 'dusk', 'team.md');
  writeFileSync(teamPath, readFileSync(teamPath, 'utf8').replace(
    REQUIRED_GUARD_SENTENCE,
    `${REQUIRED_GUARD_SENTENCE} Contradiction: intent-guard implements every requested repair.`,
  ));
  const result = runVerifier(world);
  check('verifier.requiredGuardExtraMention.exit', result.status, 1,
    'required policy rejects a contradictory extra intent-guard mention');
  check('verifier.requiredGuardExtraMention.reason',
    result.output.includes('required permits exactly one total intent-guard mention; found 2'), true,
    'the exact safe sentence must be the sole shared mention of the role');
  removeWorld(world);
}

{
  const world = makeWorld();
  const teamPath = join(world, SOURCE_CLIENT_DIR, 'teams', 'dusk', 'team.md');
  writeFileSync(teamPath, readFileSync(teamPath, 'utf8').replace(
    REQUIRED_GUARD_SENTENCE, `${REQUIRED_GUARD_SENTENCE} ${REQUIRED_GUARD_SENTENCE}`,
  ));
  const result = runVerifier(world);
  check('verifier.requiredGuardSameLineDuplicate.exit', result.status, 1,
    'required policy rejects two exact guard sentences on one line');
  check('verifier.requiredGuardSameLineDuplicate.reason',
    result.output.includes('required needs exact sentence once; found 2'), true,
    'the verifier counts exact occurrences rather than matching lines');
  removeWorld(world);
}

{
  const world = makeWorld({ policy: 'legacy-absent', roster: DUSK_ROSTER, reportRoot: '.codex/reports' });
  const result = runVerifier(world);
  check('verifier.fullDuskLegacyAbsent.exit', result.status, 0,
    'the full 13-member Dusk roster passes without adding intent-guard');
  check('verifier.fullDuskLegacyAbsent.policy',
    result.output.includes('CHECK: Intent guard policy (legacy-absent) ... OK'), true,
    'the verifier accepts the explicit no-intent-guard policy');
  check('verifier.fullDuskLegacyAbsent.memberChecks',
    DUSK_ROSTER.every(([name]) => result.output.includes(`CHECK: agent ${name} ... OK`)), true,
    'the verifier checks every exact Dusk member');
  check('verifier.fullDuskLegacyAbsent.reportRoot',
    result.output.includes('CHECK: Shared report root (.codex/reports) ... OK'), true,
    'the verifier accepts the exact guidance-derived Dusk report root');
  removeWorld(world);
}

{
  const world = makeWorld();
  const teamPath = join(world, SOURCE_CLIENT_DIR, 'teams', 'dusk', 'team.md');
  writeFileSync(teamPath, readFileSync(teamPath, 'utf8').replace(REQUIRED_GUARD_SENTENCE, ''));
  const result = runVerifier(world);
  check('verifier.requiredGuardSentence.exit', result.status, 1,
    'required policy fails without its exact shared guard sentence');
  check('verifier.requiredGuardSentence.reason',
    result.output.includes('required needs exact sentence once; found 0'), true,
    'the verifier identifies the missing required-policy sentence');
  removeWorld(world);
}

{
  const world = makeWorld({ policy: 'legacy-absent' });
  const teamPath = join(world, SOURCE_CLIENT_DIR, 'teams', 'dusk', 'team.md');
  writeFileSync(teamPath, readFileSync(teamPath, 'utf8').replace(
    'Every domain agent loads this file before task acceptance.',
    `Every domain agent loads this file before task acceptance.\n${REQUIRED_GUARD_SENTENCE}`,
  ));
  const result = runVerifier(world);
  check('verifier.legacyPhantomGuard.exit', result.status, 1,
    'legacy-absent policy rejects shared wording that asserts a phantom guard');
  check('verifier.legacyPhantomGuard.reason',
    result.output.includes('legacy-absent must not name a phantom role'), true,
    'the verifier identifies the phantom-role wording');
  removeWorld(world);
}

{
  const world = makeWorld({ policy: 'legacy-absent' });
  const teamPath = join(world, SOURCE_CLIENT_DIR, 'teams', 'dusk', 'team.md');
  writeFileSync(teamPath, readFileSync(teamPath, 'utf8').replace(
    'Every domain agent loads this file before task acceptance.',
    'Every domain agent loads this file before task acceptance.\n{INTENT_GUARD_SHARED_CONTRACT}',
  ));
  const result = runVerifier(world);
  check('verifier.unresolvedGuardContract.exit', result.status, 1,
    'legacy-absent fails when its conditional shared placeholder survives');
  check('verifier.unresolvedGuardContract.reason',
    result.output.includes('unresolved policy-conditional placeholder'), true,
    'the verifier identifies the unresolved conditional placeholder');
  removeWorld(world);
}

{
  const world = makeWorld({ reportRoot: '{REPORT_ROOT}' });
  const result = runVerifier(world);
  check('verifier.unresolvedReportRoot.exit', result.status, 1,
    'an unresolved report-root placeholder fails');
  check('verifier.unresolvedReportRoot.reason',
    result.output.includes('unsafe or unresolved project-relative path'), true,
    'the verifier identifies unresolved report-root output');
  removeWorld(world);
}

{
  const world = makeWorld({ reportRoot: '../outside' });
  const result = runVerifier(world);
  check('verifier.traversalReportRoot.exit', result.status, 1,
    'a traversal report root fails');
  check('verifier.traversalReportRoot.reason',
    result.output.includes("unsafe or unresolved project-relative path: '../outside'"), true,
    'the verifier identifies the unsafe report root');
  removeWorld(world);
}

{
  const world = makeWorld();
  const teamPath = join(world, SOURCE_CLIENT_DIR, 'teams', 'dusk', 'team.md');
  const bulk = `Bulk -> \`${SOURCE_CLIENT_DIR}/reports/YYYYMMDD-HHMMSS_{AGENT_NAME}/\``;
  writeFileSync(teamPath, readFileSync(teamPath, 'utf8').replace(bulk, `${bulk} ${bulk}`));
  const result = runVerifier(world);
  check('verifier.reportRootSameLineDuplicate.exit', result.status, 1,
    'two Bulk report patterns on one line fail exact-once validation');
  check('verifier.reportRootSameLineDuplicate.reason',
    result.output.includes('expected exactly one Bulk directive, one report template, and one resolved path; found 2/2/2'), true,
    'the verifier counts concrete report patterns rather than matching lines');
  removeWorld(world);
}

{
  const world = makeWorld();
  const teamPath = join(world, SOURCE_CLIENT_DIR, 'teams', 'dusk', 'team.md');
  const bulk = `Bulk -> \`${SOURCE_CLIENT_DIR}/reports/YYYYMMDD-HHMMSS_{AGENT_NAME}/\``;
  writeFileSync(teamPath, readFileSync(teamPath, 'utf8').replace(
    bulk, `${bulk} Bulk -> $(touch-pwned)/YYYYMMDD-HHMMSS_{AGENT_NAME}/`,
  ));
  const result = runVerifier(world);
  check('verifier.reportRootUnsafeSecondBulk.exit', result.status, 1,
    'a canonical Bulk path plus an unsafe same-line Bulk directive fails');
  check('verifier.reportRootUnsafeSecondBulk.reason',
    result.output.includes('expected exactly one Bulk directive, one report template, and one resolved path; found 2/2/1'), true,
    'the verifier counts all directives and templates, not only canonical path matches');
  check('verifier.reportRootUnsafeSecondBulk.noExecution', existsSync(join(world, 'touch-pwned')), false,
    'verification treats the unsafe second directive as data');
  removeWorld(world);
}

{
  const world = makeWorld();
  const teamPath = join(world, SOURCE_CLIENT_DIR, 'teams', 'dusk', 'team.md');
  const bulk = `Bulk -> \`${SOURCE_CLIENT_DIR}/reports/YYYYMMDD-HHMMSS_{AGENT_NAME}/\``;
  writeFileSync(teamPath, readFileSync(teamPath, 'utf8').replace(
    bulk, `${bulk}/YYYYMMDD-HHMMSS_{AGENT_NAME}/`,
  ));
  const result = runVerifier(world);
  check('verifier.reportTemplateAdjacentDuplicate.exit', result.status, 1,
    'an adjacent extra report template fails exact-once validation');
  check('verifier.reportTemplateAdjacentDuplicate.reason',
    result.output.includes('expected exactly one Bulk directive, one report template, and one resolved path; found 1/2/1'), true,
    'the verifier counts report-template occurrences independently of directives');
  removeWorld(world);
}

for (const [name, reportRoot] of [
  ['commandSubstitution', '.codex/$(touch-pwned)'],
  ['backticks', '.codex/`touch-pwned`'],
  ['semicolon', '.codex/reports;touch-pwned'],
  ['ampersand', '.codex/reports&touch-pwned'],
  ['pipe', '.codex/reports|touch-pwned'],
  ['control', `.codex/${String.fromCharCode(1)}reports`],
  ['dotSegment', '.codex/./reports'],
  ['trailingSlash', '.codex/reports/'],
]) {
  const world = makeWorld({ reportRoot });
  const result = runVerifier(world);
  check(`verifier.hostileReportRoot.${name}.exit`, result.status, 1,
    `${name} report root fails the conservative segment allowlist`);
  check(`verifier.hostileReportRoot.${name}.reason`,
    result.output.includes('CHECK: Shared report root ... FAIL'), true,
    'the verifier rejects the hostile path as inert data');
  check(`verifier.hostileReportRoot.${name}.noExecution`,
    existsSync(join(world, 'touch-pwned')), false,
    'verification never executes report-root text');
  removeWorld(world);
}

for (const reportRoot of ['.codex/reports', 'reports/team-1', '.reports_2/a.b']) {
  const world = makeWorld({ reportRoot });
  const result = runVerifier(world);
  check(`verifier.safeReportRoot.${reportRoot}.exit`, result.status, 0,
    `${reportRoot} passes the conservative segment allowlist`);
  removeWorld(world);
}

{
  const world = makeWorld({ agentText: agentFile({ description: 'x'.repeat(100) }) });
  const result = runVerifier(world);
  check('verifier.description100.exit', result.status, 0,
    'a domain description at exactly 100 characters passes');
  removeWorld(world);
}

// BEGIN SOURCE YAML DESCRIPTION FIXTURES
for (const [name, description] of [
  ['plainUseful', 'Domain owner for YAML reviews and verification.'],
  ['doubleQuotedUseful', '"Quoted owner # literal; triggers: YAML."'],
  ['singleQuotedUseful', "'Owner''s role. Triggers: YAML.'"],
  ['quotedNullLiteral', '"null"'],
  ['quotedDescription100', `"${'x'.repeat(100)}"`],
  ['escapedUnicodeDescription100', `"${'\\u00e9'.repeat(100)}"`],
  ['unicodeDescription100', 'é'.repeat(100)],
  ['unicodeMaxScalar', `Owner ${String.fromCodePoint(0x10ffff)}`],
]) {
  for (const parked of [false, true]) {
    const world = makeWorld({ agentText: agentFile({ description }) });
    if (parked) {
      const agentsDir = join(world, SOURCE_CLIENT_DIR, 'agents');
      renameSync(join(agentsDir, 'build-eng.md'), join(agentsDir, 'build-eng.md.disabled'));
    }
    const result = runVerifier(world);
    const state = parked ? 'parked' : 'live';
    check(`verifier.descriptionString.${name}.${state}.exit`, result.status, 0,
      `${state} domain member accepts a useful YAML string scalar`);
    removeWorld(world);
  }
}

for (const [name, description, reason] of [
  ['emptyUnquoted', '', 'nonempty inline scalar'],
  ['emptyDoubleQuoted', '""', 'description must be nonempty'],
  ['emptySingleQuoted', "''", 'description must be nonempty'],
  ['commentOnly', '# empty', 'unambiguous YAML string scalar'],
  ['nullTilde', '~', 'implicit typed value'],
  ['nullLower', 'null', 'implicit typed value'],
  ['nullTitle', 'Null', 'implicit typed value'],
  ['nullUpper', 'NULL', 'implicit typed value'],
  ['booleanTrue', 'true', 'implicit typed value'],
  ['booleanFalse', 'FALSE', 'implicit typed value'],
  ['booleanYes', 'Yes', 'implicit typed value'],
  ['booleanOff', 'OFF', 'implicit typed value'],
  ['integer', '42', 'implicit typed value'],
  ['negativeInteger', '-7', 'implicit typed value'],
  ['float', '3.14', 'implicit typed value'],
  ['floatTrailingDot', '3.', 'implicit typed value'],
  ['exponent', '1e6', 'implicit typed value'],
  ['hex', '0x2a', 'implicit typed value'],
  ['date', '2026-08-28', 'implicit typed value'],
  ['timestamp', '2026-08-28T12:34:56Z', 'implicit typed value'],
  ['infinity', '.inf', 'implicit typed value'],
  ['negativeInfinity', '-.Inf', 'implicit typed value'],
  ['nan', '.NaN', 'implicit typed value'],
  ['emptySequence', '[]', 'unambiguous YAML string scalar'],
  ['emptyMapping', '{}', 'unambiguous YAML string scalar'],
  ['tag', '!!str role owner', 'unambiguous YAML string scalar'],
  ['anchor', '&role role owner', 'unambiguous YAML string scalar'],
  ['alias', '*role', 'unambiguous YAML string scalar'],
  ['inlineComment', 'Role owner # ambiguous comment', 'unambiguous YAML string scalar'],
  ['block', '|', 'block/folded values are forbidden'],
  ['folded', '>', 'block/folded values are forbidden'],
  ['multiline', 'first line\n  second line', 'multiline continuation is forbidden'],
  ['escapedNewline', '"first\\nsecond"', 'decoded value must be one line'],
  ['rawNel', `first${String.fromCharCode(0x85)}second`, 'decoded value must be one line'],
  ['doubleQuotedRawNel', `"first${String.fromCharCode(0x85)}second"`, 'decoded value must be one line'],
  ['doubleQuotedEscapedNel', '"first\\u0085second"', 'decoded value must be one line'],
  ['singleQuotedRawNel', `'first${String.fromCharCode(0x85)}second'`, 'decoded value must be one line'],
  ['rawC1Start', `first${String.fromCharCode(0x80)}second`, 'forbidden control character'],
  ['doubleQuotedRawC1Start', `"first${String.fromCharCode(0x80)}second"`, 'forbidden control character'],
  ['rawC1End', `first${String.fromCharCode(0x9f)}second`, 'forbidden control character'],
  ['doubleQuotedRawC1End', `"first${String.fromCharCode(0x9f)}second"`, 'forbidden control character'],
  ['rawYamlNoncharacterFffe', `first${String.fromCharCode(0xfffe)}second`, 'forbidden YAML noncharacter'],
  ['doubleQuotedRawYamlNoncharacterFfff', `"first${String.fromCharCode(0xffff)}second"`, 'forbidden YAML noncharacter'],
  ['loneSurrogate', '"\\ud800"', 'valid Unicode scalar values'],
  ['unicodeDescription101', 'é'.repeat(101), 'description is 101 characters; ceiling is 100'],
]) {
  for (const parked of [false, true]) {
    const world = makeWorld({ agentText: agentFile({ description }) });
    if (parked) {
      const agentsDir = join(world, SOURCE_CLIENT_DIR, 'agents');
      renameSync(join(agentsDir, 'build-eng.md'), join(agentsDir, 'build-eng.md.disabled'));
    }
    const result = runVerifier(world);
    const state = parked ? 'parked' : 'live';
    check(`verifier.descriptionScalar.${name}.${state}.exit`, result.status, 1,
      `${state} domain member rejects ${name} YAML description`);
    check(`verifier.descriptionScalar.${name}.${state}.reason`,
      result.output.includes(reason), true,
      'the verifier identifies the strict scalar defect');
    removeWorld(world);
  }
}
// END SOURCE YAML DESCRIPTION FIXTURES

{
  const world = makeWorld({ agentText: agentFile({ description: 'x'.repeat(101) }) });
  const result = runVerifier(world);
  check('verifier.description101.exit', result.status, 1,
    'a domain description over 100 characters fails');
  check('verifier.description101.reason',
    result.output.includes('description is 101 characters; ceiling is 100'), true,
    'the verifier names the exact description length and ceiling');
  removeWorld(world);
}

{
  const world = makeWorld({ agentText: agentFile({ description: 'x'.repeat(101) }) });
  const agentsDir = join(world, SOURCE_CLIENT_DIR, 'agents');
  renameSync(join(agentsDir, 'build-eng.md'), join(agentsDir, 'build-eng.md.disabled'));
  const result = runVerifier(world);
  check('verifier.parkedDescription101.exit', result.status, 1,
    'a parked domain member remains subject to the description ceiling');
  check('verifier.parkedDescription101.reason',
    result.output.includes('description is 101 characters; ceiling is 100'), true,
    'the parked-member failure names the same exact ceiling');
  removeWorld(world);
}

{
  const world = makeWorld({ policy: 'required', intent: false });
  const teamPath = join(world, SOURCE_CLIENT_DIR, 'teams', 'dusk', 'team.md');
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
  const teamPath = join(world, SOURCE_CLIENT_DIR, 'teams', 'dusk', 'team.md');
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
  const teamPath = join(world, SOURCE_CLIENT_DIR, 'teams', 'dusk', 'team.md');
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
  const teamPath = join(world, SOURCE_CLIENT_DIR, 'teams', 'dusk', 'team.md');
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
  const teamPath = join(world, SOURCE_CLIENT_DIR, 'teams', 'dusk', 'team.md');
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
  const teamPath = join(world, SOURCE_CLIENT_DIR, 'teams', 'dusk', 'team.md');
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
  const teamPath = join(world, SOURCE_CLIENT_DIR, 'teams', 'dusk', 'team.md');
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
  const padding = `notes: "${'x'.repeat(5000)}"\n`;
  const world = makeWorld({ agentText: agentFile({ frontmatterPadding: padding }) });
  const result = runVerifier(world);
  check('verifier.frontmatterExcluded', result.status, 0,
    'large valid frontmatter does not consume the 3200-byte body budget');
  check('verifier.frontmatterTotalOverCeiling',
    Buffer.byteLength(readFileSync(join(world, SOURCE_CLIENT_DIR, 'agents', 'build-eng.md'))) > 3200,
    true,
    'the fixture proves the full file itself exceeds 3200 bytes');
  removeWorld(world);
}
// END SOURCE FRONTMATTER BUDGET FIXTURE

{
  const oversized = `${representativeBody}\n${'x'.repeat(3300)}\n`;
  const world = makeWorld({ agentText: agentFile({ body: oversized }) });
  const result = runVerifier(world);
  check('verifier.bodyCeiling.exit', result.status, 1, 'an oversized body fails even with small frontmatter');
  check('verifier.bodyCeiling.reason', result.output.includes('ceiling is 3200 (~800 est-tokens), frontmatter excluded'), true,
    'the failure names the body-only contract');
  removeWorld(world);
}

const instantiatedLosses = [
  'Every domain agent loads this file before task acceptance.',
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
  const teamPath = join(world, SOURCE_CLIENT_DIR, 'teams', 'dusk', 'team.md');
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
  check('verifier.legacyMigrationSafe.exit', result.status, 0,
    'a fully legacy team remains runnable while upgrade is required');
  check('verifier.legacyMigrationSafe.warning',
    result.output.includes('has no Shared Agent Contract (legacy team)')
      && result.output.includes('legacy repeated/unknown profile shape'),
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
  ['firstReference', (text) => text.replace('.claude/teams/dusk/team.md', '.claude/teams/other/team.md'),
    'Must-load references must name .claude/teams/dusk/team.md'],
  ['extraHeading', (text) => `${text}\n## Return Contract\n\nDuplicated.\n`,
    'body headings must be exactly the six ordered teams-setup headings'],
]) {
  const world = makeWorld({ agentText: agentFile({ body: mutate(representativeBody) }) });
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
  const teamPath = join(world, SOURCE_CLIENT_DIR, 'teams', 'dusk', 'team.md');
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

console.log('suite-agent-profile-contract.mjs');
for (const line of results) console.log(line);
console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
