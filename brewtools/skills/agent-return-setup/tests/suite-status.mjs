#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');
const SKILL_DIR = join(HERE, '..');
const RUNBOOK = join(SKILL_DIR, 'assets', 'INSTALL.md');

function blockAfter(source, marker, fence) {
  const markerAt = source.indexOf(marker);
  assert.equal(markerAt >= 0, true, `source contains ${marker}`);
  const start = source.indexOf(fence, markerAt);
  assert.equal(start >= 0, true, `source fences ${marker}`);
  const end = source.indexOf('\n```', start + fence.length);
  assert.equal(end >= 0, true, `source closes ${marker}`);
  return source.slice(start + fence.length, end);
}

const base = mkdtempSync(join(tmpdir(), 'return-status-'));
try {
  // GIVEN: actual copied hook assets, the three owned registrations, and an unrelated co-handler.
  const project = join(base, 'project');
  const hooksDir = join(project, '.claude', 'hooks');
  mkdirSync(hooksDir, { recursive: true });
  for (const script of ['agent-return-budget.mjs', 'agent-return-contract.mjs', 'agent-return-guard.mjs']) {
    writeFileSync(join(hooksDir, script), readFileSync(join(SKILL_DIR, 'assets', script)));
  }
  const settingsPath = join(project, '.claude', 'settings.json');
  const foreign = { type: 'command', command: 'node', args: ['/foreign/keep.mjs'], timeout: 4 };
  writeFileSync(settingsPath, JSON.stringify({ env: { KEEP: 'yes' }, hooks: {
    SubagentStart: [{ hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-return-contract.mjs'], timeout: 5 }, foreign] }],
    SubagentStop: [{ hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-return-guard.mjs'], timeout: 5 }] }],
    PreToolUse: [{ matcher: 'SubagentHandback', hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-return-guard.mjs'], timeout: 5 }] }],
  } }));
  const settingsBefore = readFileSync(settingsPath, 'utf8');
  const env = { ...process.env, HOME: join(base, 'home'), CLAUDE_PLUGIN_ROOT: join(SKILL_DIR, '..', '..'), ROOT: project, RUNBOOK, PASS_TOKENS: '2500', FILE_TOKENS: '6000', PLUGIN_VERSION: '1.0.0' };
  delete env.CLAUDE_CONFIG_DIR;
  const configBlock = blockAfter(readFileSync(RUNBOOK, 'utf8'), '**EXECUTE** config write', '```\n');
  const producer = spawnSync('bash', ['-c', configBlock], { cwd: project, env, encoding: 'utf8', timeout: 30000 });
  assert.equal(producer.status, 0, `authoritative return config producer succeeds: ${producer.stderr}`);
  const configPath = join(project, '.claude', 'agent-return.json');
  const currentConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(currentConfig.version, '1.0.0', 'fixture retains deliberately older release provenance');
  // Claude Code substitutes the braced session dir into SKILL.md at load; mirror that here.
  const statusBlock = blockAfter(readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8'), '## Step 1 — STATUS FIRST, always', '```bash\n')
    .replaceAll('${CLAUDE_PROJECT_DIR}', project);
  const probe = () => spawnSync('bash', ['-c', statusBlock], { cwd: project, env, encoding: 'utf8', timeout: 30000 });

  // GIVEN: the shell cwd drifted into a subdirectory. WHEN: status probes. THEN: the session dir is the project scope.
  const drifted = join(project, 'sub');
  mkdirSync(drifted, { recursive: true });
  const fromSub = spawnSync('bash', ['-c', statusBlock], { cwd: drifted, env, encoding: 'utf8', timeout: 30000 });
  assert.equal(fromSub.status, 0, `status from a subdirectory exits successfully: ${fromSub.stderr}`);
  assert.match(fromSub.stdout, new RegExp(`PROJECT_ROOT=${project}\\n[^]*project: hook_files=3/3`), 'project scope keys on the session dir, not the shell cwd');

  // WHEN: the actual consumer probes producer-shaped current content with older provenance.
  const current = probe();
  // THEN: release drift does not invent staleness, and all settings remain intact.
  assert.equal(current.status, 0, 'current return status exits successfully');
  assert.match(current.stdout, /project: hook_files=3\/3 settings_refs=2 enabled=true.*config_version=1\.0\.0.*content_state=current/, 'matching CV reports current despite the older release');
  assert.equal(readFileSync(settingsPath, 'utf8'), settingsBefore, 'status preserves foreign settings byte-for-byte');

  // GIVEN: valid stale content metadata.
  writeFileSync(configPath, JSON.stringify({ ...currentConfig, content_version: '0.0.1' }));
  // WHEN: status compares the current runbook and installed metadata.
  const stale = probe();
  // THEN: content drift is surfaced and settings remain untouched.
  assert.equal(stale.status, 0, 'stale content status exits successfully');
  assert.match(stale.stdout, /project:.*content_state=stale/, 'changed config CV reports stale');
  assert.equal(readFileSync(settingsPath, 'utf8'), settingsBefore, 'stale probe preserves unrelated settings');

  // GIVEN: current config but a stale shared module marker.
  writeFileSync(configPath, JSON.stringify(currentConfig));
  const budgetPath = join(hooksDir, 'agent-return-budget.mjs');
  const budgetBytes = readFileSync(budgetPath, 'utf8');
  writeFileSync(budgetPath, budgetBytes.replace(/content_version=[0-9.]+/, 'content_version=0.0.1'));
  // WHEN: the consumer compares every installed asset, including the unregistered library.
  const staleLibrary = probe();
  // THEN: a current guard alone cannot hide stale shared runtime code.
  assert.equal(staleLibrary.status, 0, 'shared library CV remains readable');
  assert.match(staleLibrary.stdout, /project:.*content_state=stale/, 'changed shared-module CV reports stale');
  assert.match(staleLibrary.stdout, /content_findings=agent-return-budget\.mjs:0\.0\.1->[0-9]+\.[0-9]+\.[0-9]+/, 'status names the stale shared module and both CVs');
  writeFileSync(budgetPath, budgetBytes);

  for (const [label, contentVersion] of [['missing', undefined], ['malformed', 'not-a-version']]) {
    // GIVEN: installed hooks with incomplete metadata.
    writeFileSync(configPath, JSON.stringify({ ...currentConfig, content_version: contentVersion }));
    // WHEN: status reads missing/malformed content metadata.
    const partial = probe();
    // THEN: older release metadata cannot substitute for the missing CV.
    assert.equal(partial.status, 0, `${label} CV remains a readable status`);
    assert.match(partial.stdout, /project:.*config_content_version=n\/a.*content_state=partial/, `${label} CV is explicitly partial`);
    assert.equal(readFileSync(settingsPath, 'utf8'), settingsBefore, `${label} metadata leaves foreign settings unchanged`);
  }

  // GIVEN: a deliberately disabled current installation.
  writeFileSync(configPath, JSON.stringify({ ...currentConfig, enabled: false }));
  const disabledBefore = readFileSync(configPath, 'utf8');
  // WHEN: status reads content metadata.
  const disabled = probe();
  // THEN: off-switch state is preserved and reported alongside current content.
  assert.equal(disabled.status, 0, 'disabled return status succeeds');
  assert.match(disabled.stdout, /project:.*enabled=false.*content_state=current/, 'current metadata does not re-enable the setup');
  assert.equal(readFileSync(configPath, 'utf8'), disabledBefore, 'disabled config stays byte-identical');
  assert.equal(readFileSync(settingsPath, 'utf8'), settingsBefore, 'disabled probe preserves foreign settings');

  // GIVEN: a malformed hook marker with a valid-looking prefix.
  writeFileSync(budgetPath, budgetBytes.replace(/content_version=([0-9.]+)/, 'content_version=$1broken'));
  // WHEN: the actual consumer reads the metadata token.
  const malformedLibrary = probe();
  // THEN: missing valid CV is partial, while disabled state stays independent.
  assert.equal(malformedLibrary.status, 0, 'malformed library metadata status succeeds');
  assert.match(malformedLibrary.stdout, /project:.*enabled=false.*content_state=partial/, 'malformed library CV is partial without re-enabling');

  // GIVEN: a current install, probed against plugin copies with one asset CV bumped (runbook only, or the config-reading module).
  writeFileSync(budgetPath, budgetBytes);
  writeFileSync(configPath, JSON.stringify(currentConfig));
  const bumpedPlugin = (label, bumped) => {
    const assets = join(base, `plugin-${label}`, 'skills', 'agent-return-setup', 'assets');
    mkdirSync(assets, { recursive: true });
    for (const name of ['INSTALL.md', 'agent-return-budget.mjs', 'agent-return-contract.mjs', 'agent-return-guard.mjs']) {
      const bytes = readFileSync(join(SKILL_DIR, 'assets', name), 'utf8');
      writeFileSync(join(assets, name), name === bumped ? bytes.replace(/content_version=[0-9.]+/, 'content_version=99.0.0') : bytes);
    }
    return join(base, `plugin-${label}`);
  };
  const contentAgainst = pluginRoot => {
    const r = spawnSync('bash', ['-c', statusBlock], { cwd: project, env: { ...env, CLAUDE_PLUGIN_ROOT: pluginRoot }, encoding: 'utf8', timeout: 30000 });
    const line = r.stdout.split('\n').find(l => l.startsWith('project:')) ?? `NO project: LINE ${r.stderr}`;
    const keys = ['config_content_version', 'contract_content_version', 'content_state', 'content_findings'];
    return { rc: r.status, ...Object.fromEntries(keys.map(k => [k, line.match(new RegExp(` ${k}=(\\S+)`))?.[1] ?? 'absent'])) };
  };
  const contractCV = budgetBytes.match(/content_version=([0-9]+\.[0-9]+\.[0-9]+)/)[1];
  // WHEN: status probes a runbook-only CV bump, then a CV bump of the module that parses the config.
  const runbookOnly = contentAgainst(bumpedPlugin('runbook', 'INSTALL.md'));
  const moduleBump = contentAgainst(bumpedPlugin('module', 'agent-return-budget.mjs'));
  // THEN: runbook prose never stales the config; a contract change stales the config and the module.
  assert.deepEqual([runbookOnly, moduleBump], [
    { rc: 0, config_content_version: contractCV, contract_content_version: contractCV, content_state: 'current', content_findings: 'none' },
    { rc: 0, config_content_version: contractCV, contract_content_version: '99.0.0', content_state: 'stale',
      content_findings: `agent-return.json:${contractCV}->99.0.0,agent-return-budget.mjs:${contractCV}->99.0.0` },
  ], 'config staleness follows the config-reading module CV, never the INSTALL.md header');

  // GIVEN: global hooks wired in a profile (config 2500/6000) and a project install with config 1000/2500.
  const orphan = join(base, 'orphan');
  const profile = join(orphan, 'profile');
  const proj = join(orphan, 'project');
  mkdirSync(join(proj, '.claude'), { recursive: true });
  mkdirSync(profile, { recursive: true });
  const runbookText = readFileSync(RUNBOOK, 'utf8');
  const oEnv = { ...env, HOME: join(orphan, 'home'), CLAUDE_CONFIG_DIR: profile, ROOT: proj, PASS_TOKENS: '1000', FILE_TOKENS: '2500' };
  const run = (block, extra) => spawnSync('bash', ['-c', block], { cwd: proj, env: { ...oEnv, ...(extra || {}) }, encoding: 'utf8', timeout: 30000 });
  const step = marker => run(blockAfter(runbookText, marker, '```\n'));
  const wiring = ['**EXECUTE** copy (global', '**EXECUTE** merge settings (global', '**EXECUTE** copy (project',
    '**EXECUTE** config write', '**EXECUTE** merge settings (project)'].map(marker => [marker, step(marker).status]);
  writeFileSync(join(profile, 'agent-return.json'), JSON.stringify({ enabled: true, passTokens: 2500, fileTokens: 6000 }));
  const projCfg = join(proj, '.claude', 'agent-return.json');
  const rawStatus = blockAfter(readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8'), '## Step 1 — STATUS FIRST, always', '```bash\n');
  const statusOf = () => {
    const r = run(rawStatus.replaceAll('${CLAUDE_PROJECT_DIR}', proj));
    const pick = prefix => r.stdout.split('\n').find(line => line.startsWith(prefix)) ?? `NO ${prefix} LINE`;
    return [r.status, pick('project:').match(/registrations=\d\/3/)?.[0], pick('global:').match(/registrations=\d\/3/)?.[0], pick('governing_config=')];
  };
  const contractSays = () => {
    const r = spawnSync('node', [join(profile, 'hooks', 'agent-return-contract.mjs')], { input: '{}', env: { ...oEnv, CLAUDE_PROJECT_DIR: proj }, encoding: 'utf8', timeout: 30000 });
    return r.stdout.match(/Keep it under ~\d+ tokens/)?.[0] ?? `NO BUDGET: ${r.stdout}${r.stderr}`;
  };
  // WHEN: status probes both scopes wired.
  const bothWired = statusOf();
  // THEN: the project config governs, but it is no orphan while project hooks are registered.
  assert.deepEqual([wiring, bothWired], [
    [['**EXECUTE** copy (global', 0], ['**EXECUTE** merge settings (global', 0], ['**EXECUTE** copy (project', 0],
      ['**EXECUTE** config write', 0], ['**EXECUTE** merge settings (project)', 0]],
    [0, 'registrations=3/3', 'registrations=3/3', `governing_config=${projCfg} governing_scope=project orphan_config=no`],
  ], 'wired project config governs without an orphan finding');

  // WHEN: the project scope is uninstalled while the global hooks stay wired.
  const uninstalled = step('## UNINSTALL');
  // THEN: the kept config is named as governing, and the global hook really obeys it.
  assert.deepEqual([uninstalled.status, uninstalled.stdout.trim().split('\n').slice(-2), existsSync(projCfg), statusOf(), contractSays()], [
    0,
    [`WARNING: kept ${projCfg} still GOVERNS: the global agent-return hooks (${join(profile, 'settings.json')}) read the nearest project config first, so pass=1000 file=2500 enabled=true override ${join(profile, 'agent-return.json')}. Hand control to the global config: /brewtools:agent-return-setup purge project. Keeping it on purpose is valid.`,
      `✅ uninstalled from ${join(proj, '.claude', 'hooks')}`],
    true,
    [0, 'registrations=0/3', 'registrations=3/3', `governing_config=${projCfg} governing_scope=project orphan_config=yes`],
    'Keep it under ~1000 tokens',
  ], `project uninstall under a global install warns and status flags the orphan: ${uninstalled.stderr}`);

  // WHEN: the project scope is purged.
  const purged = step('## PURGE');
  // THEN: the global config governs again and no orphan is reported.
  assert.deepEqual([purged.status, existsSync(projCfg), statusOf(), contractSays()], [
    0, false, [0, 'registrations=0/3', 'registrations=3/3', `governing_config=${join(profile, 'agent-return.json')} governing_scope=global orphan_config=no`],
    'Keep it under ~2500 tokens',
  ], `purge project hands control to the global config: ${purged.stderr}`);

  // GIVEN: a project install and an empty profile with no global hooks.
  const lone = join(orphan, 'lone');
  const emptyProfile = join(orphan, 'empty-profile');
  mkdirSync(join(lone, '.claude'), { recursive: true });
  mkdirSync(emptyProfile, { recursive: true });
  const loneEnv = { ROOT: lone, CLAUDE_CONFIG_DIR: emptyProfile };
  const loneWiring = ['**EXECUTE** copy (project', '**EXECUTE** config write', '**EXECUTE** merge settings (project)']
    .map(marker => run(blockAfter(runbookText, marker, '```\n'), loneEnv).status);
  // WHEN: the project scope is uninstalled.
  const loneUninstall = run(blockAfter(runbookText, '## UNINSTALL', '```\n'), loneEnv);
  // THEN: nothing shadows a global config, so no warning is printed.
  assert.deepEqual([loneWiring, loneUninstall.status, loneUninstall.stdout.split('\n').filter(line => line.startsWith('WARNING:')),
    loneUninstall.stdout.trim().split('\n').pop(), existsSync(join(lone, '.claude', 'agent-return.json'))],
  [[0, 0, 0], 0, [], `✅ uninstalled from ${join(lone, '.claude', 'hooks')}`, true],
  `no global install: uninstall keeps the config silently: ${loneUninstall.stderr}`);

  // GIVEN: git root `top`, shell cwd top/a/sub, the only project config in its parent top/a, a profile config.
  const climb = join(realpathSync(base), 'climb');
  const top = join(climb, 'top');
  const parentDir = join(top, 'a');
  const cwdSub = join(parentDir, 'sub');
  const climbProfile = join(climb, 'profile');
  for (const dir of [join(parentDir, '.claude'), cwdSub, climbProfile]) mkdirSync(dir, { recursive: true });
  const gitInit = spawnSync('git', ['init', '-q', top], { encoding: 'utf8', timeout: 30000 });
  const parentCfg = join(parentDir, '.claude', 'agent-return.json');
  writeFileSync(parentCfg, JSON.stringify({ enabled: true, passTokens: 1111, fileTokens: 3333 }));
  writeFileSync(join(climbProfile, 'agent-return.json'), JSON.stringify({ enabled: true, passTokens: 2222, fileTokens: 4444 }));
  const climbEnv = { ...env, HOME: join(climb, 'home'), CLAUDE_CONFIG_DIR: climbProfile, PWD: cwdSub };
  delete climbEnv.CLAUDE_PROJECT_DIR;
  const climbStatus = blockAfter(readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8'), '## Step 1 — STATUS FIRST, always', '```bash\n');
  const governs = sessionDir => {
    const r = spawnSync('bash', ['-c', climbStatus.replaceAll('${CLAUDE_PROJECT_DIR}', sessionDir)], { cwd: cwdSub, env: climbEnv, encoding: 'utf8', timeout: 30000 });
    return [r.status, r.stdout.split('\n').find(line => line.startsWith('governing_config=')) ?? `NO governing_config= LINE: ${r.stderr}`];
  };
  const hookSays = hookEnv => {
    const r = spawnSync('node', [join(SKILL_DIR, 'assets', 'agent-return-contract.mjs')], { input: '{}', cwd: cwdSub, env: hookEnv, encoding: 'utf8', timeout: 30000 });
    return r.stdout.match(/Keep it under ~\d+ tokens/)?.[0] ?? `NO BUDGET: ${r.stdout}${r.stderr}`;
  };
  // WHEN: no session dir reaches the shell (status falls back), and the hook has none either.
  // THEN: both climb from projectRoot(cwd) = top/a, never from the git toplevel, and name the parent config.
  assert.deepEqual([gitInit.status, governs(''), hookSays(climbEnv)], [
    0, [0, `governing_config=${parentCfg} governing_scope=project orphan_config=no`], 'Keep it under ~1111 tokens',
  ], 'status mirrors projectRoot(): nearest .git/.claude ancestor of the cwd, not git rev-parse --show-toplevel');
  // WHEN: the session dir `top` is substituted and the hook gets it as CLAUDE_PROJECT_DIR.
  // THEN: both climb from top, never from the cwd, so the profile config governs.
  assert.deepEqual([governs(top), hookSays({ ...climbEnv, CLAUDE_PROJECT_DIR: top })], [
    [0, `governing_config=${join(climbProfile, 'agent-return.json')} governing_scope=global orphan_config=no`], 'Keep it under ~2222 tokens',
  ], 'the agent-return hooks start at CLAUDE_PROJECT_DIR, not the payload cwd: status must not climb from $PWD then');

  // GIVEN outer/.git > h/.claude > h/notes/misc WHEN h is HOME, the config-dir parent, or plain
  // THEN hook projectRoot() and the runbook root block skip h as a profile; plain h stays a root
  const outer = join(realpathSync(base), 'profile-walk');
  const h = join(outer, 'h');
  const cwdMisc = join(h, 'notes', 'misc');
  mkdirSync(join(outer, '.git'), { recursive: true });
  mkdirSync(join(h, '.claude'), { recursive: true });
  mkdirSync(cwdMisc, { recursive: true });
  const rootBlock = blockAfter(readFileSync(RUNBOOK, 'utf8'), 'Resolve it once, in the SAME Bash call', '```\n');
  const budgetUrl = new URL(`file://${join(SKILL_DIR, 'assets', 'agent-return-budget.mjs')}`).href;
  const rootsAs = (envOver) => {
    const walkEnv = { ...process.env, HOME: join(outer, 'elsewhere'), ...envOver };
    delete walkEnv.CLAUDE_PROJECT_DIR;
    if (!envOver.CLAUDE_CONFIG_DIR) delete walkEnv.CLAUDE_CONFIG_DIR;
    const code = `const m = await import(${JSON.stringify(budgetUrl)}); process.stdout.write(m.projectRoot(${JSON.stringify(cwdMisc)}));`;
    const hook = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: walkEnv, encoding: 'utf8', timeout: 30000 });
    const shell = spawnSync('bash', ['-c', rootBlock], { cwd: cwdMisc, env: walkEnv, encoding: 'utf8', timeout: 30000 });
    return [hook.stdout, shell.stdout.trim()];
  };
  assert.deepEqual(
    [rootsAs({ HOME: h }), rootsAs({ CLAUDE_CONFIG_DIR: join(h, '.claude') }), rootsAs({})],
    [[outer, `✅ ROOT=${outer}`], [outer, `✅ ROOT=${outer}`], [h, `✅ ROOT=${h}`]],
    'a HOME or config-dir-parent .claude is the profile: hook and installer must never resolve it as the project root',
  );
} finally {
  rmSync(base, { recursive: true, force: true });
}
process.stdout.write('agent-return status tests passed\n');
