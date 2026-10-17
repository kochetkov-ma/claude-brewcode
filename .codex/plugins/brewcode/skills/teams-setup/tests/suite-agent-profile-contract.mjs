#!/usr/bin/env node
// Team-agent profile contract: Codex authority, native Codex projection, shared team contract,
// intent-guard/non-team exemptions; never mutates the repository.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, renameSync, rmSync,
  symlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// Every world dir this suite mkdtemps under tmpdir(); removed on exit even when a test throws.
const tempDirs = [];
process.on('exit', () => {
  for (const d of tempDirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

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
const REQUIRED_GUARD_SENTENCE = '`intent-guard` is review-only, keeps its own output contract, and never implements.';
const DUSK_PROJECT_ROOT = '/tmp/project-dusk';
const DUSK_ROSTER = [
  ['game-designer', 'GDD', 'Fun'],
  ['combat-dev', 'Combat', 'Actors'],
  ['physics-dev', 'Physics', 'Traversal'],
  ['destruction-dev', 'DST', 'Fracture'],
  ['scenario-dev', 'Lab', 'Evidence'],
  ['vfx-dev', 'VFX', 'Impacts'],
  ['texture-artist', 'Look', 'Materials'],
  ['modeller-3d', '3D', 'Pipeline'],
  ['sound-designer', 'SFX', 'Mix'],
  ['feel-dev', 'Feel', 'Timing'],
  ['qa-tester', 'QA', 'Verify'],
  ['docs-keeper', 'Docs', 'Sync'],
  ['build-eng', 'Build', 'Reproduce'],
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

function exactTokens(text, counterPath) {
  const preparerPath = join(dirname(counterPath), 'prepare-tokenizer.py');
  const result = spawnSync('python3', ['-I', '-S', preparerPath, 'run', counterPath], {
    input: text,
    encoding: 'utf8',
  });
  if (result.status !== 0 || !/^\d+\s*$/.test(result.stdout || '')) {
    throw new Error(`exact token counter failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return Number.parseInt(result.stdout, 10);
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
  compactDefaults = false,
}) {
  const intentRow = policy === 'required'
    ? `|intent-guard|--|Anti-drift check: what was ASKED vs what was DELIVERED|active|2026-08-27|review-only|${version}|`
    : '';
  const domainRows = roster.map(([name, domain, mission]) => compactDefaults
    ? `|${name}|${domain}|${mission}|||||`
    : `|${name}|${domain}|${mission}|active|2026-08-27|domain|${version}|`).join('\n');
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
const canonicalSkillPath = join(repo, 'brewcode', '.codex', 'skills', 'teams-setup', 'SKILL.md');
const verifierPath = join(repo, 'brewcode', '.codex', 'skills', 'teams-setup', 'scripts', 'verify-team.sh');
const canonicalCounterPath = join(repo, 'brewcode', 'skills', 'teams-setup', 'scripts', 'count-tokens.py');
const canonicalPreparerPath = join(repo, 'brewcode', 'skills', 'teams-setup', 'scripts', 'prepare-tokenizer.py');
const canonicalTraceOpsPath = join(repo, 'brewcode', 'skills', 'teams-setup', 'scripts', 'trace-ops.sh');
const projectedSkillPath = join(repo, 'brewcode', '.codex', 'skills', 'teams-setup', 'SKILL.md');
const projectedTemplatePath = join(repo, 'brewcode', '.codex', 'skills', 'teams-setup', 'references', 'agent-template.md');
const projectedFrameworkPath = join(repo, 'brewcode', '.codex', 'skills', 'teams-setup', 'references', 'framework-files.md');
const projectedCounterPath = join(repo, 'brewcode', '.codex', 'skills', 'teams-setup', 'scripts', 'count-tokens.py');
const projectedPreparerPath = join(repo, 'brewcode', '.codex', 'skills', 'teams-setup', 'scripts', 'prepare-tokenizer.py');
const projectedCreatorPath = join(repo, 'brewcode', '.codex', 'agents', 'agent-creator.toml');

for (const [name, path] of [
  ['canonicalTemplate', canonicalTemplatePath],
  ['canonicalFramework', canonicalFrameworkPath],
  ['projectedSkill', projectedSkillPath],
  ['projectedTemplate', projectedTemplatePath],
  ['projectedFramework', projectedFrameworkPath],
  ['canonicalCounter', canonicalCounterPath],
  ['projectedCounter', projectedCounterPath],
  ['canonicalPreparer', canonicalPreparerPath],
  ['projectedPreparer', projectedPreparerPath],
  ['projectedCreator', projectedCreatorPath],
]) {
  check(`${name}.exists`, existsSync(path), true, `${name} artifact exists`);
}

// CI sharding: TEAMS_PROFILE_PART=k of TEAMS_PROFILE_PARTS=n runs part k of the greedy weight split.
const PROFILE_PARTS = Number.parseInt(process.env.TEAMS_PROFILE_PARTS || '1', 10);
const PROFILE_PART = Number.parseInt(process.env.TEAMS_PROFILE_PART || '0', 10);
const partLoads = new Array(PROFILE_PARTS).fill(0);
function part(body, weight = 1) {
  const target = partLoads.indexOf(Math.min(...partLoads));
  partLoads[target] += weight;
  if (target === PROFILE_PART) body();
}
check('profile.part.range', PROFILE_PART >= 0 && PROFILE_PART < PROFILE_PARTS, true,
  'the selected shard exists, so no part is silently skipped');

// Tokenizer hardening runs once in the source suite: it targets the same canonical preparer bytes.

const canonicalTemplate = readFileSync(canonicalTemplatePath, 'utf8');
const canonicalFramework = readFileSync(canonicalFrameworkPath, 'utf8');
const canonicalSkill = readFileSync(canonicalSkillPath, 'utf8');
const projectedSkill = readFileSync(projectedSkillPath, 'utf8');
const projectedTemplate = readFileSync(projectedTemplatePath, 'utf8');
const projectedFramework = readFileSync(projectedFrameworkPath, 'utf8');
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
  exactTokens(representativeBody, canonicalCounterPath) <= 800,
  true,
  'representative generated body is at most 800 exact o200k tokens',
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
  'Load this before task acceptance.',
  'Gate Domain/Duplicate/Best:',
  'Mismatch/duplicate/better',
  'refuse+owner/link+return',
  'accept -> trace took',
  'execute only owned surfaces',
  'exclusions win.',
  'versionless project-local',
  'T/trace-ops.sh',
  'optional Bash once',
  '`!=` retry/plugin root/env',
  'Missing/fail',
  'update/move/uninstall',
  sourceTracePath,
  'bash "',
  '"$SID"',
  '"{AGENT_NAME}"',
  '"<kind>"',
  '"<state>"',
  '"<text>"',
  'Track took/refused/completed/failed; took -> 1 terminal.',
  '`$SID`: 8 chars; if unset choose any 8-char marker.',
  'Marker chars `[A-Za-z0-9._-]`.',
  'Issue low/medium/high/critical',
  'insight pattern/architecture/performance/security/convention/debt.',
  'Return with or without agent-return:',
  'verdict/path/check',
  '`path:line`',
  'Return changed path/check only.',
  '!=bodies/output/log/preamble',
  reportPathPlaceholder,
  '!=content',
  'Approx chars/4:',
  '>1000',
  '>2500',
  '<=3 lines.',
  'Actual scale;',
  '!=imagined',
  'load/speculative',
  '10-user',
  '!=lock-contention',
  'Class/module/test',
  `${SOURCE_CLIENT_DIR}/convention/`,
  'rules/conventions/docs',
  '!=replace',
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
  exactTokens(canonicalTeam, canonicalCounterPath) <= 700,
  true,
  'generated team.md fenced template is at most 700 exact o200k tokens',
);
check(
  'shared.intentPolicyPlaceholder',
  occurrences(canonicalTeam, '{INTENT_GUARD_POLICY}'),
  1,
  'team template carries exactly one explicit intent-guard policy field',
);
check(
  'shared.agentDefaultsPlaceholder',
  canonicalTeam.includes('|Agent defaults|active;{LAST_UPDATED};domain;{PLUGIN_VERSION}|'),
  true,
  'team metadata defines the four repeated domain-row defaults once',
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
  projectRoot: DUSK_PROJECT_ROOT,
  roster: DUSK_ROSTER,
  policy: 'legacy-absent',
  reportRoot: '.codex/reports',
  compactDefaults: true,
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
  'Dusk output has no unresolved report placeholder or Codex-default regrowth',
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
  'shared.fullDuskAgentDefaults',
  fullDuskTeam.includes('|Agent defaults|active;2026-08-27;domain;6.1.4|'),
  true,
  'the Dusk roster resolves its repeated status, update, kind, and version once',
);
check(
  'shared.fullDuskCompactRows',
  DUSK_ROSTER.every(([name, domain, mission]) => fullDuskTeam.includes(`|${name}|${domain}|${mission}|||||`)),
  true,
  'all 13 Dusk rows preserve seven columns while inheriting the declared defaults',
);
check(
  'shared.fullDuskCharsWithinCeiling',
  fullDuskTeam.length <= 2800,
  true,
  'the complete 13-member Dusk team.md is at most 2800 characters',
);
const fullDuskTokenCount = exactTokens(fullDuskTeam, canonicalCounterPath);
check(
  'shared.fullDuskTokensWithinCeiling',
  fullDuskTokenCount <= 700,
  true,
  'the complete 13-member Dusk team.md is at most 700 exact o200k tokens',
);
check(
  'shared.fullDuskCurrentTokenRange',
  fullDuskTokenCount >= 500 && fullDuskTokenCount <= 690,
  true,
  'the current canonical Dusk fixture records bounded exact-token evidence with headroom',
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
  exactTokens(profileBody(projectedTemplate), projectedCounterPath) <= 800,
  true,
  'native Codex team body is at most 800 exact o200k tokens',
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
  projectRoot: DUSK_PROJECT_ROOT,
  roster: DUSK_ROSTER,
  policy: 'legacy-absent',
  reportRoot: '.codex/reports',
  compactDefaults: true,
});
check(
  'codex.fullDuskRosterNames',
  rosterNames(fullNativeDuskTeam).join('|'),
  DUSK_ROSTER.map(([name]) => name).join('|'),
  'native Codex projection preserves the exact full Dusk member boundary',
);
const fullNativeDuskTokenCount = exactTokens(fullNativeDuskTeam, projectedCounterPath);
check(
  'codex.fullDuskTokensWithinCeiling',
  fullNativeDuskTokenCount <= 700,
  true,
  'native Codex full Dusk team remains at most 700 exact o200k tokens',
);
check(
  'codex.fullDuskTokenParity',
  fullNativeDuskTokenCount,
  fullDuskTokenCount,
  'native Codex records the same bounded exact Dusk token count',
);
check(
  'codex.counterProjectionParity',
  readFileSync(projectedCounterPath, 'utf8'),
  readFileSync(canonicalCounterPath, 'utf8'),
  'native Codex carries the pinned exact counter byte-for-byte',
);
check(
  'codex.preparerProjectionParity',
  readFileSync(projectedPreparerPath, 'utf8'),
  readFileSync(canonicalPreparerPath, 'utf8'),
  'native Codex carries the pinned durable preparer byte-for-byte',
);

// BEGIN PROJECTED WORKFLOW CONTRACT
const nativeModes = ['status', 'install', 'upgrade', 'enable', 'disable', 'uninstall', 'purge'];
for (const mode of nativeModes) {
  check(
    `workflow.mode.${mode}`,
    canonicalSkill.includes(`## Mode: ${mode}`),
    true,
    `native teams workflow keeps the complete ${mode} routing branch`,
  );
}

const bootstrapAt = canonicalSkill.indexOf('### C2.6: shared-contract bootstrap');
const createAt = canonicalSkill.indexOf('### C3-C4: creation and roster finalization');
const reviewAt = canonicalSkill.indexOf('### C5-C7: independent review');
const tokenizerCheckAt = canonicalSkill.indexOf('python3 -I -S scripts/prepare-tokenizer.py check');
const tokenizerPrepareAt = canonicalSkill.indexOf('python3 -I -S scripts/prepare-tokenizer.py prepare');
check(
  'install.nativeStageOrder',
  bootstrapAt >= 0 && bootstrapAt < createAt && createAt < reviewAt,
  true,
  'shared contract bootstrap precedes native TOML creation and independent review',
);
check(
  'workflow.tokenizerApprovalOrder',
  tokenizerCheckAt >= 0 && tokenizerCheckAt < tokenizerPrepareAt,
  true,
  'read-only tokenizer check precedes the explicitly approved prepare path',
);
for (const literal of [
  'Before any domain agent write',
  'The user must approve the final roster before any team or agent file is written',
  'atomically creates the absent guard before the full `verify-team.sh` bootstrap check',
  'three independent reviewers, distinct from creators',
  'confirmed by at least 2/3',
  'spawn a new verifier not used in C5 or creation',
  'at most two repair cycles',
  'obtain approval for roster actions',
  '`status` asks nothing',
  'Every mutating mode requires existing authorization or explicit main-chat approval',
  'An absent `trace.jsonl` is valid before the first event or after cleanup',
  'Before any team mutation, run the read-only, offline preflight `python3 -I -S scripts/prepare-tokenizer.py check`',
  'Only after that approval, run `python3 -I -S scripts/prepare-tokenizer.py prepare && python3 -I -S scripts/prepare-tokenizer.py check`',
  '`verify-team.sh` and token counts use isolated `prepare-tokenizer.py run count-tokens.py` without network, installation, fallback, host Python injection, or an unverified runtime',
  'resolve `REPORT_ROOT` from the narrowest applicable durable project guidance',
  'Every slash-separated segment must match `^[A-Za-z0-9._-]+$`',
  'Equal-specificity conflicting report-root directives -> STOP',
  'Enforce every live or parked domain member description as one nonempty line of at most 100 characters',
  'legacy-absent gets no guard mention',
  'Capture an immutable UTC upgrade cutoff before the initial cursor and trace reads',
  'set the cursor to that captured cutoff, never to a new completion-time timestamp',
]) {
  check(
    `workflow.control.${literal.slice(0, 18)}`,
    canonicalSkill.includes(literal),
    true,
    `native workflow preserves ${JSON.stringify(literal)}`,
  );
}
check(
  'workflow.compactSkillCeiling',
  canonicalSkill.length <= 12500,
  true,
  'complete native workflow stays within its 12,500-character compact ceiling',
);
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
const pluginVersion = (/brewcode-meta: version=([0-9]+\.[0-9]+\.[0-9]+)/.exec(canonicalSkill) || [])[1];
const contentVersion = (/content_version=([0-9]+\.[0-9]+\.[0-9]+)/.exec(canonicalSkill) || [])[1];
const today = '2026-08-27';
const BUILD_ROSTER = [['build-eng', 'Build', 'deterministic builds']];

function instantiateTeam({
  policy = 'required', roster = BUILD_ROSTER, reportRoot = `${SOURCE_CLIENT_DIR}/reports`,
  compactDefaults = false,
} = {}) {
  return instantiateTeamTemplate(projectedTeam, {
    projectRoot: DUSK_PROJECT_ROOT, roster, policy, reportRoot,
    version: pluginVersion, contentVersion, compactDefaults,
  });
}

// BEGIN RUNTIME AGENT FIXTURES
function tomlString(value) {
  return JSON.stringify(value).replaceAll('\u007f', '\\u007f');
}

function agentFile({ name = 'build-eng', description = 'Domain owner. Triggers: domain, review, verification.', body = runtimeRepresentativeBody, extraField = '' } = {}) {
  return `name = ${tomlString(name)}\ndescription = ${tomlString(description)}\ndeveloper_instructions = ${tomlString(body)}\n${extraField}`;
}

function intentGuardFile() {
  return `name = "intent-guard"\ndescription = "Review-only anti-drift check."\ndeveloper_instructions = "Review-only. Never implement and never mutate project files. Report a verdict with file:line evidence."\n`;
}
// END RUNTIME AGENT FIXTURES

function makeWorld({
  teamText,
  agentText,
  policy = 'required',
  roster = BUILD_ROSTER,
  reportRoot = `${SOURCE_CLIENT_DIR}/reports`,
  compactDefaults = false,
  intent = policy === 'required',
} = {}) {
  const world = mkdtempSync(join(tmpdir(), 'team-profile-contract-'));
  tempDirs.push(world);
  const teamDir = join(world, '.codex', 'teams', 'dusk');
  const agentsDir = join(world, '.codex', 'agents');
  mkdirSync(teamDir, { recursive: true });
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(join(teamDir, 'team.md'), teamText ?? instantiateTeam(
    { policy, roster, reportRoot, compactDefaults },
  ));
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

// Verifier-only memo of exact-count calls keyed by script, input and cache env: first call per key
// runs the real tokenizer, repeats replay it; `-I -S -` stdin code runs in-process so nested counts hit it.
const TOKEN_MEMO_PY = [
  'import hashlib, json, os, subprocess, sys',
  'real, cache, args = sys.argv[1], sys.argv[2], sys.argv[3:]',
  'def digest(path):',
  '    with open(path, "rb") as handle:',
  '        return hashlib.sha256(handle.read()).hexdigest()',
  'memo = (len(args) >= 5 and args[:2] == ["-I", "-S"] and args[3] == "run"',
  '        and os.path.basename(args[2]) == "prepare-tokenizer.py"',
  '        and os.path.basename(args[4]) == "count-tokens.py" and len(args) <= 6',
  '        and (len(args) == 5 or args[5] == "--check" or os.path.isfile(args[5])))',
  'if args[:3] == ["-I", "-S", "-"]:',
  '    sys.argv = ["-", *args[3:]]',
  '    sys.executable = os.path.join(os.path.dirname(cache), "bin", "python3")',
  '    exec(compile(sys.stdin.read(), "<stdin>", "exec"), {"__name__": "__main__"})',
  '    sys.exit(0)',
  'if not memo:',
  '    os.execv(real, [real, *args])',
  'extra = args[5:]',
  'stdin = sys.stdin.buffer.read() if not extra else None',
  'parts = [digest(args[2]), digest(args[4]), extra == ["--check"],',
  '         digest(extra[0]) if extra and extra[0] != "--check" else None,',
  '         hashlib.sha256(stdin).hexdigest() if stdin is not None else None,',
  '         [os.environ.get(k) for k in ("BREWCODE_TOKENIZER_ROOT", "XDG_CACHE_HOME", "HOME",',
  '                                      "LOCALAPPDATA", "TIKTOKEN_CACHE_DIR")]]',
  'entry = os.path.join(cache, hashlib.sha256(json.dumps(parts).encode()).hexdigest() + ".json")',
  'if os.path.isfile(entry):',
  '    with open(entry, encoding="utf-8") as handle:',
  '        rc, out, err = json.load(handle)',
  'else:',
  '    done = subprocess.run([real, *args], input=stdin, capture_output=True)',
  '    rc, out, err = done.returncode, done.stdout.decode(), done.stderr.decode()',
  '    if rc == 0:',
  '        with open(entry + ".tmp", "w", encoding="utf-8") as handle:',
  '            json.dump([rc, out, err], handle)',
  '        os.replace(entry + ".tmp", entry)',
  'sys.stdout.write(out)',
  'sys.stderr.write(err)',
  'sys.exit(rc)',
  '',
].join('\n');
const tokenMemoRoot = mkdtempSync(join(tmpdir(), 'team-token-memo-'));
tempDirs.push(tokenMemoRoot);
mkdirSync(join(tokenMemoRoot, 'bin'));
mkdirSync(join(tokenMemoRoot, 'cache'));
const memoRealPython = spawnSync('python3', ['-I', '-S', '-c', 'import sys; print(sys.executable)'],
  { encoding: 'utf8' }).stdout.trim();
writeFileSync(join(tokenMemoRoot, 'memo.py'), TOKEN_MEMO_PY);
writeFileSync(join(tokenMemoRoot, 'bin', 'python3'), `#!/bin/sh
exec '${memoRealPython}' -I -S '${join(tokenMemoRoot, 'memo.py')}' '${memoRealPython}' '${join(tokenMemoRoot, 'cache')}' "$@"
`);
chmodSync(join(tokenMemoRoot, 'bin', 'python3'), 0o755);
const verifierEnv = { ...process.env, PATH: `${join(tokenMemoRoot, 'bin')}:${process.env.PATH}` };
check('verifier.tokenMemo.python', existsSync(memoRealPython), true, 'the memo replays through the host python3');

function runVerifier(world, env = verifierEnv) {
  const result = spawnSync('bash', [verifierPath, 'dusk'], {
    cwd: world,
    env,
    encoding: 'utf8',
    // Hang guard, not a readiness wait: 13-member Dusk verify exceeded 30 s under load.
    timeout: 180000,
  });
  return { status: result.status, output: `${result.stdout || ''}${result.stderr || ''}` };
}

function removeWorld(world) {
  rmSync(world, { recursive: true, force: true });
}

part(() => {
  const world = makeWorld();
  const result = runVerifier(world);
  check('verifier.current.exit', result.status, 0, 'a complete current team passes the hard verifier');
  check('verifier.current.shared', result.output.includes('CHECK: Shared Agent Contract ... OK'), true,
    'the instantiated shared contract is verified');
  removeWorld(world);
});

part(() => {
  // GIVEN: cleanup left a complete current team with no trace file.
  const world = makeWorld();
  const tracePath = join(world, '.codex', 'teams', 'dusk', 'trace.jsonl');
  rmSync(tracePath);

  // WHEN: the hard verifier checks the clean team.
  const result = runVerifier(world);

  // THEN: absence is valid, explicit, and read-only until the first trace write.
  check('verifier.absentTrace.exit', result.status, 0,
    'a clean team without trace.jsonl passes the hard verifier');
  check('verifier.absentTrace.reason',
    result.output.includes('ABSENT (trace-ops.sh creates it on first write)'), true,
    'the verifier explains the lazy trace creation contract');
  check('verifier.absentTrace.noMutation', existsSync(tracePath), false,
    'verification does not create trace storage');
  removeWorld(world);
});

{
  // GIVEN: a fresh shell has no preexisting SID and trace storage is absent.
  const world = mkdtempSync(join(tmpdir(), 'team-fresh-sid-'));
  tempDirs.push(world);
  const teamDir = join(world, '.codex', 'teams', 'dusk');
  mkdirSync(teamDir, { recursive: true });

  // WHEN: the shared-contract fallback chooses an arbitrary safe eight-character marker.
  const result = spawnSync('bash', [
    '-c',
    'set -eu; unset SID; SID="${SID:-00000000}"; bash "$1" add "$2" "$SID" build-eng track took fresh-shell',
    'fresh-shell', canonicalTraceOpsPath, teamDir,
  ], { encoding: 'utf8' });

  // THEN: the helper creates the first valid trace row without an inherited variable.
  const row = JSON.parse(readFileSync(join(teamDir, 'trace.jsonl'), 'utf8').trim());
  check('trace.freshShell.exit', result.status, 0, 'an unset SID can be replaced before the first trace add');
  check('trace.freshShell.sid', row.sid, '00000000', 'the chosen fallback is exactly eight safe characters');
  check('trace.freshShell.source', row.src, 'build-eng', 'the valid agent identifier is preserved');
  removeWorld(world);
}

part(() => {
  // GIVEN: a present regular trace contains a schema-invalid short SID.
  const world = makeWorld();
  const tracePath = join(world, '.codex', 'teams', 'dusk', 'trace.jsonl');
  writeFileSync(tracePath,
    '{"ts":"2026-08-28T00:00:00Z","sid":"short","src":"build-eng","k":"track","s":"took","txt":"bad"}\n');

  // WHEN: the hard verifier checks the team.
  const result = runVerifier(world);

  // THEN: a regular file with invalid JSONL schema still fails closed.
  check('verifier.invalidTrace.exit', result.status, 1, 'a schema-invalid present trace fails verification');
  check('verifier.invalidTrace.reason',
    result.output.includes('sid must be exactly 8 safe ASCII characters'), true,
    'the verifier identifies the exact invalid trace field');
  removeWorld(world);
});

part(() => {
  // GIVEN: a calendar-impossible timestamp has the right lexical shape.
  const world = makeWorld();
  const tracePath = join(world, '.codex', 'teams', 'dusk', 'trace.jsonl');
  writeFileSync(tracePath,
    '{"ts":"2026-02-31T00:00:00Z","sid":"sid00000","src":"build-eng","k":"track","s":"took","txt":"bad"}\n');

  // WHEN: strict trace validation checks the calendar value.
  const invalid = runVerifier(world);

  // THEN: Node date normalization cannot turn it into a valid trace row.
  check('verifier.invalidCalendarTrace.exit', invalid.status, 1,
    'a normalized but calendar-impossible timestamp fails verification');
  check('verifier.invalidCalendarTrace.reason', invalid.output.includes('invalid timestamp'), true,
    'the verifier reports the strict timestamp failure');

  // GIVEN: a real leap day uses the same exact UTC shape.
  writeFileSync(tracePath,
    '{"ts":"2028-02-29T00:00:00Z","sid":"sid00000","src":"build-eng","k":"track","s":"took","txt":"ok"}\n');

  // WHEN/THEN: the strict round-trip accepts it.
  const valid = runVerifier(world);
  check('verifier.validLeapTrace.exit', valid.status, 0, 'a valid leap-day timestamp passes verification');
  removeWorld(world);
});

part(() => {
  // GIVEN: trace.jsonl is present only as a symlink to foreign bytes.
  const world = makeWorld();
  const tracePath = join(world, '.codex', 'teams', 'dusk', 'trace.jsonl');
  const foreignPath = join(world, 'foreign-trace.jsonl');
  rmSync(tracePath);
  writeFileSync(foreignPath, '{"foreign":true}\n');
  symlinkSync(foreignPath, tracePath);

  // WHEN: the hard verifier checks the unsafe present target.
  const result = runVerifier(world);

  // THEN: it fails closed without replacing or writing through the symlink.
  check('verifier.symlinkTrace.exit', result.status, 1,
    'a symlinked trace target fails the hard verifier');
  check('verifier.symlinkTrace.reason',
    result.output.includes('UNSAFE (must be absent or a non-symlink regular file)'), true,
    'the failure states the accepted trace target kinds');
  check('verifier.symlinkTrace.preserved', readlinkSync(tracePath), foreignPath,
    'verification preserves the unsafe symlink for explicit cleanup');
  check('verifier.symlinkTrace.foreignBytes', readFileSync(foreignPath, 'utf8'), '{"foreign":true}\n',
    'verification never mutates the foreign target');
  removeWorld(world);
});

part(() => {
  const world = makeWorld();
  const teamPath = join(world, '.codex', 'teams', 'dusk', 'team.md');
  const base = readFileSync(teamPath, 'utf8');
  const availableChars = 2800 - Array.from(base).length - 1;
  const adversarial = `${base}${'🧪'.repeat(Math.min(300, availableChars))}\n`;
  writeFileSync(teamPath, adversarial);
  check('verifier.falsePass.charCeiling', Array.from(adversarial).length <= 2800, true,
    'the adversarial fixture remains within the character ceiling');
  check('verifier.falsePass.oldEstimate', Math.ceil(Array.from(adversarial).length / 4) <= 700, true,
    'the retired chars/4 hard gate would falsely pass the adversarial fixture');
  check('verifier.falsePass.exactTokens', exactTokens(adversarial, canonicalCounterPath) > 700, true,
    'the pinned tokenizer detects the adversarial overflow');
  const result = runVerifier(world);
  check('verifier.falsePass.exit', result.status, 1,
    'runtime verification rejects the chars/4 false pass');
  check('verifier.falsePass.reason', result.output.includes('exact o200k tokens; maximum'), true,
    'runtime failure reports the exact-token boundary');
  removeWorld(world);
});

part(() => {
  const world = makeWorld();
  const teamPath = join(world, '.codex', 'teams', 'dusk', 'team.md');
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
});

part(() => {
  const world = makeWorld();
  const teamPath = join(world, '.codex', 'teams', 'dusk', 'team.md');
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
});

part(() => {
  const world = makeWorld({
    policy: 'legacy-absent', roster: DUSK_ROSTER, reportRoot: '.codex/reports', compactDefaults: true,
  });
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
});

part(() => {
  const world = makeWorld();
  const teamPath = join(world, '.codex', 'teams', 'dusk', 'team.md');
  writeFileSync(teamPath, readFileSync(teamPath, 'utf8').replace(REQUIRED_GUARD_SENTENCE, ''));
  const result = runVerifier(world);
  check('verifier.requiredGuardSentence.exit', result.status, 1,
    'required policy fails without its exact shared guard sentence');
  check('verifier.requiredGuardSentence.reason',
    result.output.includes('required needs exact sentence once; found 0'), true,
    'the verifier identifies the missing required-policy sentence');
  removeWorld(world);
});

part(() => {
  const world = makeWorld({ policy: 'legacy-absent' });
  const teamPath = join(world, '.codex', 'teams', 'dusk', 'team.md');
  writeFileSync(teamPath, readFileSync(teamPath, 'utf8').replace(
    'Domain/Duplicate/Best:',
    `Domain/Duplicate/Best:\n${REQUIRED_GUARD_SENTENCE}`,
  ));
  const result = runVerifier(world);
  check('verifier.legacyPhantomGuard.exit', result.status, 1,
    'legacy-absent policy rejects shared wording that asserts a phantom guard');
  check('verifier.legacyPhantomGuard.reason',
    result.output.includes('legacy-absent must not name a phantom role'), true,
    'the verifier identifies the phantom-role wording');
  removeWorld(world);
});

part(() => {
  const world = makeWorld({ policy: 'legacy-absent' });
  const teamPath = join(world, '.codex', 'teams', 'dusk', 'team.md');
  writeFileSync(teamPath, readFileSync(teamPath, 'utf8').replace(
    'Domain/Duplicate/Best:',
    'Domain/Duplicate/Best:\n{INTENT_GUARD_SHARED_CONTRACT}',
  ));
  const result = runVerifier(world);
  check('verifier.unresolvedGuardContract.exit', result.status, 1,
    'legacy-absent fails when its conditional shared placeholder survives');
  check('verifier.unresolvedGuardContract.reason',
    result.output.includes('unresolved policy-conditional placeholder'), true,
    'the verifier identifies the unresolved conditional placeholder');
  removeWorld(world);
});

part(() => {
  const world = makeWorld({ reportRoot: '{REPORT_ROOT}' });
  const result = runVerifier(world);
  check('verifier.unresolvedReportRoot.exit', result.status, 1,
    'an unresolved report-root placeholder fails');
  check('verifier.unresolvedReportRoot.reason',
    result.output.includes('unsafe or unresolved project-relative path'), true,
    'the verifier identifies unresolved report-root output');
  removeWorld(world);
});

part(() => {
  const world = makeWorld({ reportRoot: '../outside' });
  const result = runVerifier(world);
  check('verifier.traversalReportRoot.exit', result.status, 1,
    'a traversal report root fails');
  check('verifier.traversalReportRoot.reason',
    result.output.includes("unsafe or unresolved project-relative path: '../outside'"), true,
    'the verifier identifies the unsafe report root');
  removeWorld(world);
});

part(() => {
  // bash 3.2 under a UTF-8 locale let an A-Z/a-z range match accented letters.
  const world = makeWorld({ reportRoot: `${SOURCE_CLIENT_DIR}/réports` });
  const result = runVerifier(world, { ...verifierEnv, LC_ALL: 'en_US.UTF-8' });
  check('verifier.nonAsciiReportRoot.refused',
    JSON.stringify([result.status, result.output.includes(`unsafe or unresolved project-relative path: '${SOURCE_CLIENT_DIR}/réports'`)]),
    JSON.stringify([1, true]),
    'GIVEN a non-ASCII report root under a UTF-8 locale WHEN the verifier runs THEN it fails as unsafe');
  removeWorld(world);
});

part(() => {
  const world = makeWorld();
  const teamPath = join(world, '.codex', 'teams', 'dusk', 'team.md');
  const bulk = `Bulk -> \`${SOURCE_CLIENT_DIR}/reports/YYYYMMDD-HHMMSS_{AGENT_NAME}/\``;
  writeFileSync(teamPath, readFileSync(teamPath, 'utf8').replace(bulk, `${bulk} ${bulk}`));
  const result = runVerifier(world);
  check('verifier.reportRootSameLineDuplicate.exit', result.status, 1,
    'two Bulk report patterns on one line fail exact-once validation');
  check('verifier.reportRootSameLineDuplicate.reason',
    result.output.includes('expected exactly one Bulk directive, one report template, and one resolved path; found 2/2/2'), true,
    'the verifier counts concrete report patterns rather than matching lines');
  removeWorld(world);
});

part(() => {
  const world = makeWorld();
  const teamPath = join(world, '.codex', 'teams', 'dusk', 'team.md');
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
});

part(() => {
  const world = makeWorld();
  const teamPath = join(world, '.codex', 'teams', 'dusk', 'team.md');
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
});

for (const [name, reportRoot] of [
  ['commandSubstitution', '.codex/$(touch-pwned)'],
  ['backticks', '.codex/`touch-pwned`'],
  ['semicolon', '.codex/reports;touch-pwned'],
  ['ampersand', '.codex/reports&touch-pwned'],
  ['pipe', '.codex/reports|touch-pwned'],
  ['control', `.codex/${String.fromCharCode(1)}reports`],
  ['dotSegment', '.codex/./reports'],
  ['trailingSlash', '.codex/reports/'],
]) part(() => {
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
});

for (const reportRoot of ['.codex/reports', 'reports/team-1', '.reports_2/a.b']) part(() => {
  const world = makeWorld({ reportRoot });
  const result = runVerifier(world);
  check(`verifier.safeReportRoot.${reportRoot}.exit`, result.status, 0,
    `${reportRoot} passes the conservative segment allowlist`);
  removeWorld(world);
});

part(() => {
  const world = makeWorld({ agentText: agentFile({ description: 'x'.repeat(100) }) });
  const result = runVerifier(world);
  check('verifier.description100.exit', result.status, 0,
    'a domain description at exactly 100 characters passes');
  removeWorld(world);
});

// BEGIN SOURCE YAML DESCRIPTION FIXTURES
for (const [name, description] of [['empty', ''], ['multiline', 'first line\nsecond line'], ['c0Escaped', 'first\u0001second'], ['delEscaped', 'first\u007fsecond'], ['nel', 'first\u0085second'], ['c1Start', 'first\u0080second'], ['c1End', 'first\u009fsecond'], ['yamlNoncharacterFffe', 'first\ufffesecond'], ['yamlNoncharacterFfff', 'first\uffffsecond']]) {
  for (const parked of [false, true]) part(() => {
    const world = makeWorld({ agentText: agentFile({ description }) });
    if (parked) {
      const agentsDir = join(world, '.codex', 'agents');
      renameSync(join(agentsDir, 'build-eng.toml'), join(agentsDir, 'build-eng.toml.disabled'));
    }
    const result = runVerifier(world);
    const state = parked ? 'parked' : 'live';
    check(`verifier.descriptionScalar.${name}.${state}.exit`, result.status, 1,
      `${state} native domain member rejects ${name} description`);
    check(`verifier.descriptionScalar.${name}.${state}.reason`,
      result.output.includes('description must be one nonempty line'), true,
      'the verifier identifies the strict native string defect');
    removeWorld(world);
  });
}
// END SOURCE YAML DESCRIPTION FIXTURES

part(() => {
  const world = makeWorld({ agentText: agentFile({ description: 'x'.repeat(101) }) });
  const result = runVerifier(world);
  check('verifier.description101.exit', result.status, 1,
    'a domain description over 100 characters fails');
  check('verifier.description101.reason',
    result.output.includes('description is 101 characters; ceiling is 100'), true,
    'the verifier names the exact description length and ceiling');
  removeWorld(world);
});

part(() => {
  const world = makeWorld({ agentText: agentFile({ description: 'x'.repeat(101) }) });
  const agentsDir = join(world, '.codex', 'agents');
  renameSync(join(agentsDir, 'build-eng.toml'), join(agentsDir, 'build-eng.toml.disabled'));
  const result = runVerifier(world);
  check('verifier.parkedDescription101.exit', result.status, 1,
    'a parked domain member remains subject to the description ceiling');
  check('verifier.parkedDescription101.reason',
    result.output.includes('description is 101 characters; ceiling is 100'), true,
    'the parked-member failure names the same exact ceiling');
  removeWorld(world);
});

part(() => {
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
});

part(() => {
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
});

part(() => {
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
});

part(() => {
  const world = makeWorld();
  const teamPath = join(world, '.codex', 'teams', 'dusk', 'team.md');
  writeFileSync(teamPath, `${readFileSync(teamPath, 'utf8')}${'x'.repeat(3000)}\n`);
  const result = runVerifier(world);
  check('verifier.teamCeiling.exit', result.status, 1,
    'an oversized fully substituted team.md fails');
  check('verifier.teamCeiling.reason',
    result.output.includes('maximum 2800 chars and 700 tiktoken 0.13.0/o200k_base tokens'), true,
    'the runtime verifier names both complete-file ceilings');
  removeWorld(world);
});

// D2: 2800/700 holds up to 13 domain rows; each row past 13 adds 80 chars/20 tokens (SKILL.md C4).
const DUSK_MAXIMUM_ROSTER = [...DUSK_ROSTER,
  ['level-dev', 'Levels', 'Layout'], ['ai-dev', 'AI', 'Behaviour'], ['ui-dev', 'UI', 'HUD'],
  ['net-dev', 'Net', 'Sync'], ['save-dev', 'Save', 'Persist'], ['perf-dev', 'Perf', 'Budget'],
  ['audio-dev', 'Audio', 'Engine']];

part(() => {
  const world = makeWorld({ roster: DUSK_MAXIMUM_ROSTER, compactDefaults: true });
  const team = readFileSync(join(world, '.codex', 'teams', 'dusk', 'team.md'), 'utf8');
  const chars = Array.from(team).length;
  const tokens = exactTokens(team, canonicalCounterPath);
  check('verifier.maximumTeam.precondition',
    JSON.stringify([DUSK_MAXIMUM_ROSTER.length, tokens > 700, chars <= 3360, tokens <= 840]),
    JSON.stringify([20, true, true, true]),
    'GIVEN the terse 20-agent Maximum variant THEN it exceeds the flat 700-token ceiling yet fits 3360/840');
  const result = runVerifier(world);
  check('verifier.maximumTeam.verdict', JSON.stringify([result.status,
    result.output.includes(`CHECK: full team.md ceiling ... OK (${chars} chars, ${tokens} exact o200k tokens; 20 domain rows)`)]),
  JSON.stringify([0, true]), 'GIVEN 20 terse domain rows WHEN verify runs THEN the scaled ceiling passes the team');
  removeWorld(world);
}, 2);

for (const [label, targetChars, expectedStatus] of [['atCeiling', 2880, 0], ['overCeiling', 2881, 1]]) part(() => {
  const roster = DUSK_MAXIMUM_ROSTER.slice(0, 14);
  const world = makeWorld({ roster, compactDefaults: true });
  const teamPath = join(world, '.codex', 'teams', 'dusk', 'team.md');
  const base = readFileSync(teamPath, 'utf8');
  const padded = `${base}${'='.repeat(targetChars - Array.from(base).length - 1)}\n`;
  writeFileSync(teamPath, padded);
  const tokens = exactTokens(padded, canonicalCounterPath);
  check(`verifier.rowCeiling.${label}.precondition`, JSON.stringify([Array.from(padded).length, tokens <= 720]),
    JSON.stringify([targetChars, true]), `GIVEN 14 domain rows padded to ${targetChars} chars THEN only the char ceiling is in play`);
  const result = runVerifier(world);
  const line = expectedStatus === 0
    ? `CHECK: full team.md ceiling ... OK (${targetChars} chars, ${tokens} exact o200k tokens; 14 domain rows)`
    : `CHECK: full team.md ceiling ... FAIL (${targetChars} chars, ${tokens} exact o200k tokens; maximum 2880 chars and 720 tiktoken 0.13.0/o200k_base tokens for 14 domain rows)`;
  check(`verifier.rowCeiling.${label}.verdict`, JSON.stringify([result.status, result.output.includes(line)]),
    JSON.stringify([expectedStatus, true]),
    `GIVEN 14 domain rows at ${targetChars} chars WHEN verify runs THEN the 2880-char row-scaled boundary decides`);
  removeWorld(world);
});

part(() => {
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
});

part(() => {
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
});

part(() => {
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
});

// BEGIN SOURCE FRONTMATTER BUDGET FIXTURE
part(() => {
  const world = makeWorld({ agentText: agentFile({ extraField: 'model = "legacy"\n' }) });
  const result = runVerifier(world);
  check('verifier.exactTomlKeys.exit', result.status, 1, 'an unsupported fourth TOML key fails');
  check('verifier.exactTomlKeys.reason', result.output.includes('TOML keys must be exactly name, description, developer_instructions'), true,
    'the verifier enforces the exact native schema structurally');
  removeWorld(world);
});

part(() => {
  const world = makeWorld();
  const poisonDir = join(world, 'poison-python-environment');
  const poisonSentinel = join(world, 'python-injection-sentinel');
  mkdirSync(poisonDir, { recursive: true });
  writeFileSync(join(poisonDir, 'sitecustomize.py'), [
    'import os',
    'from pathlib import Path',
    'Path(os.environ[\"TOKENIZER_POISON_SENTINEL\"]).write_text(\"executed\\n\", encoding=\"utf-8\")',
    'raise RuntimeError(\"malicious sitecustomize executed\")',
    '',
  ].join('\n'));
  const missingHostCache = join(world, 'missing-host-tiktoken-cache');
  const result = runVerifier(world, {
    ...process.env,
    PYTHONPATH: poisonDir,
    PYTHONHOME: poisonDir,
    PYTHONUSERBASE: poisonDir,
    PYTHONSTARTUP: join(poisonDir, 'sitecustomize.py'),
    TIKTOKEN_CACHE_DIR: missingHostCache,
    TOKENIZER_POISON_SENTINEL: poisonSentinel,
  });
  check('verifier.preparedProfileCount.exit', result.status, 0,
    'native profile counts use the verified prepared runtime');
  check('verifier.preparedProfileCount.agent', result.output.includes('CHECK: agent build-eng ... OK'), true,
    'malicious Python environment cannot affect the native domain profile count');
  check('verifier.preparedProfileCount.hostCache', existsSync(missingHostCache), false,
    'native profile counting neither reads nor creates the missing host cache');
  check('verifier.preparedProfileCount.noInjection', existsSync(poisonSentinel), false,
    'neither outer preparer nor isolated runtime executes injected sitecustomize');
  removeWorld(world);
});

part(() => {
  const world = makeWorld({ agentText: '---\nname: build-eng\n---\n' });
  const result = runVerifier(world);
  check('verifier.renamedMarkdown.exit', result.status, 1, 'renamed Markdown is not accepted as TOML');
  check('verifier.renamedMarkdown.reason', result.output.includes('invalid TOML'), true,
    'the verifier parses the native fixture instead of scanning YAML text');
  removeWorld(world);
});

const approvedCompactIntentGuard = "Review-only. Never implement and never mutate project files. Report a verdict with file:line evidence.";

for (const [name, instructions] of [
  ['emptyIntentGuard', ''],
  ['hostileIntentGuard', 'Review-only. Implement fixes and mutate project files. Report a verdict with file:line evidence.'],
  ['suffixImplement', approvedCompactIntentGuard + ' Implement fixes after reporting.'],
  ['suffixMutate', approvedCompactIntentGuard + ' Then mutate project files.'],
  ['suffixApplyEdit', approvedCompactIntentGuard + ' Apply fixes and edit project files.'],
  ['suffixWriteDelete', approvedCompactIntentGuard + ' You may write or delete project files.'],
  ['suffixCreate', approvedCompactIntentGuard + ' Create project files after reporting.'],
  ['suffixGenerate', approvedCompactIntentGuard + ' Generate replacement artifacts after reporting.'],
  ['suffixRefactor', approvedCompactIntentGuard + ' Refactor the affected source after reporting.'],
  ['suffixRemove', approvedCompactIntentGuard + ' Remove stale files after reporting.'],
  ['suffixCommit', approvedCompactIntentGuard + ' Commit the repaired code after reporting.'],
  ['suffixAlter', approvedCompactIntentGuard + ' Alter configuration after reporting.'],
  ['suffixTouch', approvedCompactIntentGuard + ' Touch project files after reporting.'],
  ['suffixExecute', approvedCompactIntentGuard + ' Execute remediation after reporting.'],
  ['suffixProduce', approvedCompactIntentGuard + ' Produce a patch after reporting.'],
  ['suffixShip', approvedCompactIntentGuard + ' Ship corrections after reporting.'],
  ['suffixRewrite', approvedCompactIntentGuard + ' Rewrite tests after reporting.'],
  ['suffixOverwrite', approvedCompactIntentGuard + ' Overwrite manifests after reporting.'],
  ['suffixScaffold', approvedCompactIntentGuard + ' Scaffold missing modules after reporting.'],
  ['suffixSynchronize', approvedCompactIntentGuard + ' Synchronize source files after reporting.'],
]) part(() => {
  const world = makeWorld();
  const target = join(world, '.codex', 'agents', 'intent-guard.toml');
  const hostile = `name = "intent-guard"\ndescription = "Review-only fixture."\ndeveloper_instructions = ${JSON.stringify(instructions)}\n`;
  writeFileSync(target, hostile);
  const result = runVerifier(world);
  check('verifier.' + name + '.exit', result.status, 1, 'unsafe review-only TOML fails closed');
  check('verifier.' + name + '.reason', result.output.includes('intent-guard contract mismatch'), true,
    'the verifier names the non-allowlisted intent-guard contract');
  check('verifier.' + name + '.bytes', readFileSync(target, 'utf8'), hostile,
    'verification does not rewrite hostile or empty existing bytes');
  removeWorld(world);
});
// END SOURCE FRONTMATTER BUDGET FIXTURE

part(() => {
  const oversized = `${runtimeRepresentativeBody}\n${'x'.repeat(3300)}\n`;
  const world = makeWorld({ agentText: agentFile({ body: oversized }) });
  const result = runVerifier(world);
  check('verifier.bodyCeiling.exit', result.status, 1, 'an oversized developer_instructions value fails');
  check('verifier.bodyCeiling.reason', result.output.includes('ceilings are 3200 bytes and 800 tokens'), true,
    'the failure names the body-only contract');
  removeWorld(world);
});

const instantiatedLosses = [
  'Load this before task acceptance.',
  'Mismatch/duplicate/better',
  'refuse+owner/link+return',
  'accept -> trace took',
  'execute only owned surfaces',
  'versionless project-local',
  '`!=` retry/plugin root/env',
  'Missing/fail',
  'update/move/uninstall',
  'Track took/refused/completed/failed; took -> 1 terminal.',
  'Issue low/medium/high/critical',
  'Return with or without agent-return:',
  '`path:line`',
  'Return changed path/check only.',
  '!=bodies/output/log/preamble',
  '!=content',
  'Approx chars/4:',
  '<=3 lines.',
  'Class/module/test',
  'rules/conventions/docs',
];
for (const [index, literal] of instantiatedLosses.entries()) part(() => {
  const world = makeWorld();
  const teamPath = join(world, '.codex', 'teams', 'dusk', 'team.md');
  writeFileSync(teamPath, readFileSync(teamPath, 'utf8').replace(literal, '[removed contract literal]'));
  const result = runVerifier(world);
  check(`verifier.loss.${index + 1}.exit`, result.status, 1,
    `removing critical shared literal ${JSON.stringify(literal)} fails`);
  check(`verifier.loss.${index + 1}.reason`, result.output.includes(`missing: ${literal}`), true,
    'the verifier identifies the exact lost contract');
  removeWorld(world);
});

// BEGIN SOURCE LEGACY AGENT FIXTURE
part(() => {
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
});
// END SOURCE LEGACY AGENT FIXTURE

for (const [name, mutate, reason] of [
  ['firstReference', (text) => text.replace('.codex/teams/dusk/team.md', '.codex/teams/other/team.md'),
    'Must-load references must name .codex/teams/dusk/team.md'],
  ['extraHeading', (text) => `${text}\n## Return Contract\n\nDuplicated.\n`,
    'body headings must be exactly the six ordered teams-setup headings'],
]) part(() => {
  const world = makeWorld({ agentText: agentFile({ body: mutate(runtimeRepresentativeBody) }) });
  const result = runVerifier(world);
  check(`verifier.profileLoss.${name}.exit`, result.status, 1, `${name} profile loss fails`);
  check(`verifier.profileLoss.${name}.reason`, result.output.includes(reason), true,
    'the verifier names the compact-profile loss');
  removeWorld(world);
});

for (const [name, mutate] of [
  ['domain', (row) => row.replace('|--|', '|code|')],
  ['mission', (row) => row.replace('Anti-drift check: what was ASKED vs what was DELIVERED', 'Implementation owner')],
  ['status', (row) => row.replace('|active|', '|inactive|')],
  ['updated', (row) => row.replace(`|${today}|review-only|`, '|2026-08-26|review-only|')],
  ['kind', (row) => row.replace('|review-only|', '|domain|')],
  ['version', (row) => row.replace(`|${pluginVersion}|`, '|0.0.0|')],
]) part(() => {
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
});

const nativeVerifier = readFileSync(verifierPath, 'utf8');
check('codex.verifier.tomllib', nativeVerifier.includes('import tomllib'), true,
  'native verifier parses TOML structurally');
check('codex.verifier.noYamlParser', nativeVerifier.includes('NR == 1 && $0 == "---"'), false,
  'native verifier has no YAML fence parser');
check('codex.verifier.exactKeys',
  nativeVerifier.includes('required = {"name", "description", "developer_instructions"}'), true,
  'native verifier pins the exact supported top-level schema');
check('codex.verifier.normalizedAllowlist', nativeVerifier.includes('approved_contracts'), true,
  'native verifier uses a closed normalized contract allowlist');
check('codex.verifier.noMutationVerbDenylist',
  nativeVerifier.includes('forbidden_action') || nativeVerifier.includes('weakening ='), false,
  'native verifier contains no mutation-verb denylist');

console.log('suite-agent-profile-contract.mjs');
for (const line of results) console.log(line);
console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
