#!/usr/bin/env node
/**
 * Compact team-agent profile contract. Validates the Codex authority, native Codex projection,
 * shared team contract, and the intent-guard/non-team exemptions without mutating the repository.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, renameSync, rmSync,
  symlinkSync, writeFileSync,
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
const FOREIGN_DEFAULT_REPORT_ROOT = ['.', 'claude', 'reports'].join('/');
const SOURCE_TEAM_REF = `${SOURCE_CLIENT_DIR}/teams/{TEAM_NAME}/team.md`;
const NATIVE_TEAM_REF = '.codex/teams/{TEAM_NAME}/team.md';
const SOURCE_PLUGIN_ROOT = `${['CL', 'AUDE'].join('')}_PLUGIN_ROOT`;
const REQUIRED_GUARD_SENTENCE = '`intent-guard` is review-only, keeps its own output contract, and never implements.';
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
const distributedTemplatePath = join(repo, '.codex', 'plugins', 'brewcode', 'skills', 'teams-setup', 'references', 'agent-template.md');
const distributedFrameworkPath = join(repo, '.codex', 'plugins', 'brewcode', 'skills', 'teams-setup', 'references', 'framework-files.md');
const projectedCounterPath = join(repo, 'brewcode', '.codex', 'skills', 'teams-setup', 'scripts', 'count-tokens.py');
const distributedCounterPath = join(repo, '.codex', 'plugins', 'brewcode', 'skills', 'teams-setup', 'scripts', 'count-tokens.py');
const projectedPreparerPath = join(repo, 'brewcode', '.codex', 'skills', 'teams-setup', 'scripts', 'prepare-tokenizer.py');
const distributedPreparerPath = join(repo, '.codex', 'plugins', 'brewcode', 'skills', 'teams-setup', 'scripts', 'prepare-tokenizer.py');
const projectedCreatorPath = join(repo, 'brewcode', '.codex', 'agents', 'agent-creator.toml');

for (const [name, path] of [
  ['canonicalTemplate', canonicalTemplatePath],
  ['canonicalFramework', canonicalFrameworkPath],
  ['projectedSkill', projectedSkillPath],
  ['projectedTemplate', projectedTemplatePath],
  ['projectedFramework', projectedFrameworkPath],
  ['distributedTemplate', distributedTemplatePath],
  ['distributedFramework', distributedFrameworkPath],
  ['canonicalCounter', canonicalCounterPath],
  ['projectedCounter', projectedCounterPath],
  ['distributedCounter', distributedCounterPath],
  ['canonicalPreparer', canonicalPreparerPath],
  ['projectedPreparer', projectedPreparerPath],
  ['distributedPreparer', distributedPreparerPath],
  ['projectedCreator', projectedCreatorPath],
]) {
  check(`${name}.exists`, existsSync(path), true, `${name} artifact exists`);
}

const tokenizerUrl = 'https://openaipublic.blob.core.windows.net/encodings/o200k_base.tiktoken';
const tokenizerSha = '446a9538cb6c348e3516120d7c08b09f57c36495e2acfffe59a5bf8b0cfb1a2d';
const preparerManifestResult = spawnSync('python3', ['-I', '-S', canonicalPreparerPath, 'manifest'], {
  encoding: 'utf8',
});
const preparerManifest = JSON.parse(preparerManifestResult.stdout);
check('preparer.manifest.exit', preparerManifestResult.status, 0, 'the artifact manifest resolves');
check('preparer.manifest.version', preparerManifest.tiktoken_version, '0.13.0', 'the package is exact');
check('preparer.manifest.encodingHash', preparerManifest.encoding_sha256, tokenizerSha, 'the BPE hash is exact');
check(
  'preparer.manifest.declaredDependencies',
  preparerManifest.declared_dependencies.join('|'),
  'regex|requests',
  'upstream metadata dependencies remain explicit',
);
check(
  'preparer.manifest.isolatedDependencies',
  `${preparerManifest.isolated_installed_dependencies.length}|${preparerManifest.isolated_loaded_dependencies.length}`,
  '0|0',
  'the no-deps runtime installs and loads no declared dependency',
);
check('preparer.manifest.wheelCount', preparerManifest.wheels.length, 30, 'six CPython ABIs have five exact platform wheels');
check(
  'preparer.manifest.platforms',
  [...new Set(preparerManifest.wheels.map((wheel) => `${wheel.system}/${wheel.machine}`))].sort().join('|'),
  'Darwin/arm64|Darwin/x86_64|Linux/aarch64|Linux/x86_64|Windows/x86_64',
  'the exact wheel matrix covers common macOS, Linux, and Windows hosts',
);
check(
  'preparer.manifest.abis',
  [...new Set(preparerManifest.wheels.map((wheel) => wheel.abi))].sort().join('|'),
  'cp310|cp311|cp312|cp313|cp314|cp39',
  'the preparer pins every supported CPython ABI from 3.9 through 3.14',
);
const wheelHashes = new Map(preparerManifest.wheels.map((wheel) => [
  `${wheel.system}/${wheel.machine}/${wheel.abi}`, wheel.sha256,
]));
check(
  'preparer.manifest.macosIntelHash',
  wheelHashes.get('Darwin/x86_64/cp314'),
  'eaaaef47c2406277181d2086484c317bf7fc433e2d5d03ff94f56b0dcec87471',
  'the current Intel macOS wheel hash matches the primary PyPI release manifest',
);
check(
  'preparer.manifest.linuxArmHash',
  wheelHashes.get('Linux/aarch64/cp314'),
  '32e0c12305105002c047b3bb1070b0dd9a73b0cb3b2856a8972b810e7a4f5881',
  'the current Linux ARM64 wheel hash matches the primary PyPI release manifest',
);
check(
  'preparer.manifest.windowsHash',
  wheelHashes.get('Windows/x86_64/cp314'),
  '115c4f26ffa11caac8b54eea35c2ad38c612c20a48d35dd15d70a02ac6f51f58',
  'the current Windows x86_64 wheel hash matches the primary PyPI release manifest',
);

// GIVEN the canonical counter and verified offline cache.
// WHEN its runtime identity is requested.
const preparerCheck = spawnSync('python3', ['-I', '-S', canonicalPreparerPath, 'check'], { encoding: 'utf8' });
const counterIdentity = spawnSync(
  'python3', ['-I', '-S', canonicalPreparerPath, 'run', canonicalCounterPath, '--check'], { encoding: 'utf8' },
);
// THEN every pinned tokenizer component is reported exactly.
check('preparer.check.exit', preparerCheck.status, 0, 'the durable tokenizer preflight succeeds');
check(
  'preparer.check.durable',
  preparerCheck.stdout.includes('cache=verified-durable'),
  true,
  'the preflight reports the verified durable cache',
);

const pythonInjectionRoot = mkdtempSync(join(tmpdir(), 'teams-tokenizer-python-injection-'));
try {
  // GIVEN: every common Python startup hook points at an unconditional malicious sitecustomize.
  const poisonSentinel = join(pythonInjectionRoot, 'sitecustomize-executed');
  writeFileSync(join(pythonInjectionRoot, 'sitecustomize.py'), [
    'import os',
    'from pathlib import Path',
    'Path(os.environ["TOKENIZER_POISON_SENTINEL"]).write_text("executed\\n", encoding="utf-8")',
    'raise RuntimeError("malicious sitecustomize executed")',
    '',
  ].join('\n'));
  const poisonEnvironment = {
    ...process.env,
    PYTHONPATH: pythonInjectionRoot,
    PYTHONHOME: pythonInjectionRoot,
    PYTHONUSERBASE: pythonInjectionRoot,
    PYTHONSTARTUP: join(pythonInjectionRoot, 'sitecustomize.py'),
    TOKENIZER_POISON_SENTINEL: poisonSentinel,
  };

  // WHEN: supported isolated preflight and counter paths run through the preparer.
  const poisonedCheck = spawnSync(
    'python3', ['-I', '-S', canonicalPreparerPath, 'check'],
    { encoding: 'utf8', env: poisonEnvironment },
  );
  const poisonedRun = spawnSync(
    'python3', ['-I', '-S', canonicalPreparerPath, 'run', canonicalCounterPath, '--check'],
    { encoding: 'utf8', env: poisonEnvironment },
  );

  // THEN: neither the outer preparer nor the isolated venv loads the injected hook.
  check('preparer.pythonInjection.checkExit', poisonedCheck.status, 0,
    'isolated preflight ignores hostile Python startup variables');
  check('preparer.pythonInjection.runExit', poisonedRun.status, 0,
    'isolated exact counting ignores hostile Python startup variables');
  check('preparer.pythonInjection.identity',
    poisonedRun.stdout.includes('tiktoken=0.13.0 encoding=o200k_base'), true,
    'the protected run still reports the pinned tokenizer identity');
  check('preparer.pythonInjection.noSentinel', existsSync(poisonSentinel), false,
    'no malicious sitecustomize executes outside or inside the venv');
} finally {
  rmSync(pythonInjectionRoot, { recursive: true, force: true });
}

const stdinRun = spawnSync('python3', ['-I', '-S', canonicalPreparerPath, 'run', '-', 'arg'], {
  input: 'import sys\nprint("stdin-safe:" + sys.argv[1])\n', encoding: 'utf8',
});
check('preparer.run.stdinExit', stdinRun.status, 0, 'the isolated runner accepts explicit stdin mode');
check('preparer.run.stdinOutput', stdinRun.stdout, 'stdin-safe:arg\n', 'stdin mode preserves arguments');
const codeRun = spawnSync(
  'python3', ['-I', '-S', canonicalPreparerPath, 'run', '-c', 'import sys; print("code-safe:" + sys.argv[1])', 'arg'],
  { encoding: 'utf8' },
);
check('preparer.run.codeExit', codeRun.status, 0, 'the isolated runner accepts explicit code mode');
check('preparer.run.codeOutput', codeRun.stdout, 'code-safe:arg\n', 'code mode preserves arguments');
const loaderEnvironment = {
  ...process.env,
  LD_LIBRARY_PATH: '/hostile-loader-path',
  LD_PRELOAD: '',
  DYLD_INSERT_LIBRARIES: '',
  DYLD_LIBRARY_PATH: '/hostile-loader-path',
};
const loaderRun = spawnSync(
  'python3', [
    '-I', '-S', canonicalPreparerPath, 'run', '-c',
    'import os; print("|".join(sorted(k for k in os.environ if k.startswith(("LD_", "DYLD_")))))',
  ],
  { encoding: 'utf8', env: loaderEnvironment },
);
check('preparer.run.loaderEnvironmentExit', loaderRun.status, 0,
  'the isolated runner starts under a hostile host loader environment');
check('preparer.run.loaderEnvironmentAbsent', loaderRun.stdout, '\n',
  'the attested child receives no host loader injection variables');
const unsafeInterpreterOption = spawnSync(
  'python3', ['-I', '-S', canonicalPreparerPath, 'run', '-S', '-'], { encoding: 'utf8' },
);
check('preparer.run.optionExit', unsafeInterpreterOption.status, 2,
  'the runner rejects caller-controlled interpreter options');
check('preparer.run.optionReason',
  unsafeInterpreterOption.stderr.includes('use run <script>, run -, or run -c <code>'), true,
  'the failure reports every supported isolated execution form');
const missingRuntimeRoot = join(tmpdir(), `teams-tokenizer-missing-${process.pid}-${Date.now()}`);
const missingRuntime = spawnSync('python3', ['-I', '-S', canonicalPreparerPath, 'check'], {
  encoding: 'utf8',
  env: { ...process.env, BREWCODE_TOKENIZER_ROOT: missingRuntimeRoot },
});
check('preparer.missing.exit', missingRuntime.status, 2, 'a missing runtime fails closed');
check('preparer.missing.stdout', missingRuntime.stdout, '', 'a missing runtime emits no success result');
check(
  'preparer.missing.repair',
  missingRuntime.stderr.includes('REPAIR:')
    && missingRuntime.stderr.includes(' -I -S ')
    && missingRuntime.stderr.includes(' prepare'),
  true,
  'the offline preflight gives the exact no-site preparation remedy',
);
check(
  'preparer.missing.noMutation',
  existsSync(missingRuntimeRoot),
  false,
  'check mode neither downloads nor creates cache state',
);
const securityFixtures = spawnSync('python3', ['-I', '-S', '-c', `
import importlib.util
import os
from pathlib import Path
import py_compile
import shutil
import subprocess
import sys
import tempfile

source = Path(sys.argv[1]).resolve()
spec = importlib.util.spec_from_file_location('teams_tokenizer_fixture', source)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
source_item = module.runtime()
module.check(source_item)

safe_temp = Path(tempfile.gettempdir()).resolve()
with tempfile.TemporaryDirectory(dir=safe_temp) as temporary:
    base = Path(temporary)
    victim = base / 'outside-victim'
    victim.mkdir()
    sentinel = victim / 'sentinel'
    sentinel.write_text('outside-sentinel-unchanged\\n', encoding='utf-8')

    unsafe_roots = [base / 'nested' / '..' / '..']
    if os.name != 'nt':
        unsafe_roots.append(Path('/tmp/..'))
    for unsafe_root in unsafe_roots:
        os.environ['BREWCODE_TOKENIZER_ROOT'] = str(unsafe_root)
        try:
            module.cache_root()
        except RuntimeError as error:
            assert 'parent traversal' in str(error)
        else:
            raise AssertionError(f'parent traversal cache root was accepted: {unsafe_root}')
        assert sentinel.read_text(encoding='utf-8') == 'outside-sentinel-unchanged\\n'

    if os.name != 'nt':
        carrier = base / 'carrier'
        carrier.mkdir()
        (carrier / 'link').symlink_to(victim, target_is_directory=True)
        try:
            module.ensure_directory(
                carrier / 'link' / 'tokenizer',
                carrier / 'link' / 'tokenizer' / 'artifacts',
                'fixture',
            )
        except RuntimeError:
            pass
        else:
            raise AssertionError('symlinked ancestor was accepted')
        assert not (victim / 'tokenizer').exists()

        fixture_root = base / 'atomic-runtime'
        os.environ['BREWCODE_TOKENIZER_ROOT'] = str(fixture_root)
        fixture = module.runtime()
        fixture.wheel_path.parent.mkdir(parents=True)
        fixture.bpe_cache_dir.mkdir(parents=True)
        shutil.copy2(source_item.wheel_path, fixture.wheel_path)
        shutil.copy2(source_item.bpe_path, fixture.bpe_path)
        fixture.venv_path.mkdir()
        (fixture.venv_path / 'escape').symlink_to(victim, target_is_directory=True)
        (fixture.bpe_path.with_name(fixture.bpe_path.name + '.part')).symlink_to(sentinel)
        module.prepare(fixture)
        module.check(fixture)
        assert sentinel.read_text(encoding='utf-8') == 'outside-sentinel-unchanged\\n'
        assert not (fixture.venv_path / 'escape').exists()
        assert not list(fixture.venv_path.parent.glob('.venv-build-*'))
        assert not list(fixture.venv_path.parent.glob('.venv-old-*'))
    else:
        carrier = base / 'junction-carrier'
        carrier.mkdir()
        junction = carrier / 'junction'
        created = subprocess.run(
            ['cmd', '/d', '/c', 'mklink', '/J', str(junction), str(victim)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        assert created.returncode == 0, (created.stdout, created.stderr)
        try:
            module.ensure_directory(
                carrier / 'junction' / 'tokenizer',
                carrier / 'junction' / 'tokenizer' / 'artifacts',
                'fixture',
            )
        except RuntimeError:
            pass
        else:
            raise AssertionError('Windows junction ancestor was accepted')
        assert sentinel.read_text(encoding='utf-8') == 'outside-sentinel-unchanged\\n'
        assert not (victim / 'tokenizer').exists()
        junction.rmdir()

    concurrent_root = base / 'concurrent-runtime'
    os.environ['BREWCODE_TOKENIZER_ROOT'] = str(concurrent_root)
    concurrent = module.runtime()
    concurrent.wheel_path.parent.mkdir(parents=True)
    concurrent.bpe_cache_dir.mkdir(parents=True)
    shutil.copy2(source_item.wheel_path, concurrent.wheel_path)
    shutil.copy2(source_item.bpe_path, concurrent.bpe_path)
    outside_pip_target = victim / 'pip-target'
    outside_pip_prefix = victim / 'pip-prefix'
    outside_python_cache = victim / 'python-pycache'
    hostile_pip_config = victim / 'pip.conf'
    hostile_pip_config.write_text(
        f'[global]\\ntarget = {outside_pip_target}\\n', encoding='utf-8'
    )
    environment = {
        **os.environ,
        'BREWCODE_TOKENIZER_ROOT': str(concurrent_root),
        'PIP_CONFIG_FILE': str(hostile_pip_config),
        'PIP_PREFIX': str(outside_pip_prefix),
        'PIP_TARGET': str(outside_pip_target),
        'PYTHONINSPECT': '1',
        'PYTHONPYCACHEPREFIX': str(outside_python_cache),
        'PYTHONWARNINGS': 'error',
    }
    processes = [
        subprocess.Popen(
            [sys.executable, '-I', '-S', str(source), 'prepare'],
            env=environment,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        for _ in range(2)
    ]
    results = [process.communicate(timeout=60) for process in processes]
    assert all(process.returncode == 0 for process in processes), results
    assert results[0][0] == results[1][0], results
    module.check(concurrent)
    assert not list(concurrent.venv_path.parent.glob('.venv-build-*'))
    assert not list(concurrent.venv_path.parent.glob('.venv-old-*'))
    assert not outside_pip_target.exists()
    assert not outside_pip_prefix.exists()
    assert not outside_python_cache.exists()
    assert sentinel.read_text(encoding='utf-8') == 'outside-sentinel-unchanged\\n'

    installed_init = (
        module.site_packages_in_venv(concurrent.venv_path) / 'tiktoken' / '__init__.py'
    )
    authentic_init = installed_init.read_bytes()
    installed_init.write_bytes(authentic_init + b'\\n# hostile installed-byte tamper\\n')
    tampered_check = subprocess.run(
        [sys.executable, '-I', '-S', str(source), 'check'],
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    tampered_run = subprocess.run(
        [sys.executable, '-I', '-S', str(source), 'run', str(Path(sys.argv[2]).resolve()), '--check'],
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    assert tampered_check.returncode == 2, (tampered_check.stdout, tampered_check.stderr)
    assert tampered_run.returncode == 2, (tampered_run.stdout, tampered_run.stderr)
    assert 'installed tokenizer file hash mismatch' in tampered_check.stderr
    assert 'installed tokenizer file hash mismatch' in tampered_run.stderr
    repaired = subprocess.run(
        [sys.executable, '-I', '-S', str(source), 'prepare'],
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=60,
    )
    assert repaired.returncode == 0, (repaired.stdout, repaired.stderr)
    module.check(concurrent)
    assert installed_init.read_bytes() == authentic_init

    shadow = module.site_packages_in_venv(concurrent.venv_path) / 'tiktoken.py'
    shadow.write_text('raise RuntimeError("top-level tokenizer shadow executed")\\n', encoding='utf-8')
    shadow_check = subprocess.run(
        [sys.executable, '-I', '-S', str(source), 'check'], env=environment,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    shadow_run = subprocess.run(
        [sys.executable, '-I', '-S', str(source), 'run', str(Path(sys.argv[2]).resolve()), '--check'],
        env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    assert shadow_check.returncode == 2, (shadow_check.stdout, shadow_check.stderr)
    assert shadow_run.returncode == 2, (shadow_run.stdout, shadow_run.stderr)
    assert 'unexpected top-level entry: tiktoken.py' in shadow_check.stderr
    assert 'unexpected top-level entry: tiktoken.py' in shadow_run.stderr
    repaired = subprocess.run(
        [sys.executable, '-I', '-S', str(source), 'prepare'], env=environment,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=60,
    )
    assert repaired.returncode == 0, (repaired.stdout, repaired.stderr)
    assert not shadow.exists()

    installed_init = (
        module.site_packages_in_venv(concurrent.venv_path) / 'tiktoken' / '__init__.py'
    )
    pyc_sentinel = victim / 'malicious-pyc-executed'
    malicious_source = base / 'malicious-tokenizer-init.py'
    malicious_source.write_text(
        'from pathlib import Path\\n'
        f'Path({str(pyc_sentinel)!r}).write_text("executed\\\\n", encoding="utf-8")\\n',
        encoding='utf-8',
    )
    cached_init = Path(importlib.util.cache_from_source(str(installed_init)))
    cached_init.parent.mkdir()
    py_compile.compile(
        str(malicious_source), cfile=str(cached_init), doraise=True,
        invalidation_mode=py_compile.PycInvalidationMode.UNCHECKED_HASH,
    )
    malicious_source.unlink()
    pyc_check = subprocess.run(
        [sys.executable, '-I', '-S', str(source), 'check'], env=environment,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    pyc_run = subprocess.run(
        [sys.executable, '-I', '-S', str(source), 'run', str(Path(sys.argv[2]).resolve()), '--check'],
        env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    assert pyc_check.returncode == 2, (pyc_check.stdout, pyc_check.stderr)
    assert pyc_run.returncode == 2, (pyc_run.stdout, pyc_run.stderr)
    assert 'installed tokenizer bytecode cache is forbidden' in pyc_check.stderr
    assert 'installed tokenizer bytecode cache is forbidden' in pyc_run.stderr
    assert not pyc_sentinel.exists()
    repaired = subprocess.run(
        [sys.executable, '-I', '-S', str(source), 'prepare'], env=environment,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=60,
    )
    assert repaired.returncode == 0, (repaired.stdout, repaired.stderr)
    assert not cached_init.exists()

    launcher_sentinel = victim / 'venv-launcher-executed'
    concurrent.python.unlink()
    concurrent.python.write_text(
        '#!/bin/sh\\nprintf executed > "' + str(launcher_sentinel) + '"\\nexit 0\\n',
        encoding='utf-8',
    )
    concurrent.python.chmod(0o755)
    launcher_check = subprocess.run(
        [sys.executable, '-I', '-S', str(source), 'check'], env=environment,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    launcher_run = subprocess.run(
        [sys.executable, '-I', '-S', str(source), 'run', str(Path(sys.argv[2]).resolve()), '--check'],
        env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    assert launcher_check.returncode == 0, (launcher_check.stdout, launcher_check.stderr)
    assert launcher_run.returncode == 0, (launcher_run.stdout, launcher_run.stderr)
    assert 'tiktoken=0.13.0 encoding=o200k_base' in launcher_run.stdout
    assert not launcher_sentinel.exists()
    assert not outside_pip_target.exists()
    assert not outside_pip_prefix.exists()
    assert not outside_python_cache.exists()
print('ancestor=fail-closed reparse=fail-closed traversal=rejected env=isolated attestation=source-shadow-pyc-rejected launcher=unused sentinel=unchanged atomic=fresh concurrent=serialized')
`, canonicalPreparerPath, canonicalCounterPath], { encoding: 'utf8', timeout: 240_000 });
check('preparer.securityFixtures.exit', securityFixtures.status, 0, 'the adversarial tokenizer fixtures pass');
check('preparer.securityFixtures.stderr', securityFixtures.stderr, '',
  'the adversarial tokenizer fixtures emit no hidden failure diagnostics');
check(
  'preparer.securityFixtures.output',
  securityFixtures.stdout,
  'ancestor=fail-closed reparse=fail-closed traversal=rejected env=isolated attestation=source-shadow-pyc-rejected launcher=unused sentinel=unchanged atomic=fresh concurrent=serialized\n',
  'ancestor/reparse/traversal, environment isolation, exact-tree attestation, launcher independence, sentinels, atomic promotion, and concurrency are proven together',
);
const preparerSource = readFileSync(canonicalPreparerPath, 'utf8');
check(
  'preparer.pythonEnvironment.sanitized',
  preparerSource.includes('if key.upper() in RUNTIME_ENV_ALLOWLIST')
    && preparerSource.includes('def sanitized_venv_creation_environment('),
  true,
  'runtime children and venv creation use minimal environments without host injection variables',
);
check(
  'preparer.pythonEnvironment.isolated',
  preparerSource.includes('sys.executable,\n                "-I",')
    && preparerSource.includes('str(build_python),\n                    "-I",\n                    "-m",')
    && preparerSource.includes('sys.executable,\n            "-I",\n            "-S",')
    && !preparerSource.includes('str(item.python),\n                "-I"'),
  true,
  'probe/run use the trusted invoking interpreter while pip alone uses the temporary venv launcher',
);
check(
  'preparer.pipEnvironment.minimal',
  preparerSource.includes('if key.upper() in PIP_ENV_ALLOWLIST')
    && preparerSource.includes('"PIP_CONFIG_FILE": os.devnull')
    && preparerSource.includes('env=pip_install_env()'),
  true,
  'pip installation uses a minimal allowlist and ignores host package-manager configuration',
);
check(
  'preparer.windowsReparse.failClosed',
  preparerSource.includes('getattr(path, "is_junction", None)')
    && preparerSource.includes('FILE_ATTRIBUTE_REPARSE_POINT')
    && preparerSource.includes('cannot validate Windows reparse safety'),
  true,
  'Windows junction and name-surrogate reparse validation fails closed',
);
check(
  'preparer.cacheRoot.noParentTraversal',
  preparerSource.includes('if ".." in root.parts')
    && preparerSource.includes('refusing parent traversal in tokenizer cache root'),
  true,
  'cache-root validation rejects parent traversal before any operation',
);
check(
  'preparer.installedBytes.attested',
  preparerSource.includes('def wheel_install_manifest(')
    && preparerSource.includes('def attest_installed_distribution(')
    && preparerSource.includes('def materialize_authenticated_wheel(')
    && preparerSource.includes('installed tokenizer file hash mismatch')
    && preparerSource.includes('installed tokenizer bytecode cache is forbidden')
    && preparerSource.includes('unexpected top-level entry'),
  true,
  'the runtime is normalized to and attested against the authenticated wheel exact tree',
);
check(
  'preparer.run.lockedAttestation',
  preparerSource.includes('with preparation_lock(item, create=False):\n        check_unlocked(item)')
    && preparerSource.includes('with preparation_lock(item, create=True):'),
  true,
  'check/use and prepare share the same bounded runtime lock',
);
check(
  'preparer.lock.bounded',
  preparerSource.includes('PREPARE_LOCK_TIMEOUT_SECONDS = 120'),
  true,
  'the cross-process preparation lock has a hard wait bound',
);
check(
  'preparer.download.uniqueNoFollow',
  preparerSource.includes('tempfile.mkstemp(') &&
    preparerSource.includes('O_NOFOLLOW') &&
    !preparerSource.includes('clear=True'),
  true,
  'artifacts use unique files, locks refuse symlinks, and venv rebuilds never clear in place',
);
check('counter.identity.exit', counterIdentity.status, 0, 'the pinned tokenizer identity check succeeds');
check(
  'counter.identity.output',
  counterIdentity.stdout,
  `tiktoken=0.13.0 encoding=o200k_base bpe_sha256=${tokenizerSha} cache=verified-offline\n`,
  'the counter reports package, encoding, cache hash, and offline verification',
);

// GIVEN an explicitly disabled tokenizer cache.
// WHEN exact counting is preflighted.
const emptyCache = spawnSync('python3', ['-I', canonicalCounterPath, '--check'], {
  encoding: 'utf8',
  env: { ...process.env, TIKTOKEN_CACHE_DIR: '' },
});
// THEN validation fails closed without writing a count.
check('counter.emptyCache.exit', emptyCache.status, 2, 'an empty cache override fails closed');
check('counter.emptyCache.stdout', emptyCache.stdout, '', 'a failed cache preflight emits no count');
check(
  'counter.emptyCache.reason',
  emptyCache.stderr.includes('exact tokenizer cache is disabled'),
  true,
  'the failure identifies the required exact cache',
);

const corruptCacheDir = mkdtempSync(join(tmpdir(), 'teams-token-cache-'));
try {
  // GIVEN corrupt bytes under the exact o200k cache key.
  const cacheKey = createHash('sha1').update(tokenizerUrl).digest('hex');
  writeFileSync(join(corruptCacheDir, cacheKey), 'corrupt');
  // WHEN exact counting is preflighted.
  const corruptCache = spawnSync('python3', ['-I', canonicalCounterPath, '--check'], {
    encoding: 'utf8',
    env: { ...process.env, TIKTOKEN_CACHE_DIR: corruptCacheDir },
  });
  // THEN the hash mismatch fails closed without writing a count.
  check('counter.corruptCache.exit', corruptCache.status, 2, 'a corrupt pinned cache fails closed');
  check('counter.corruptCache.stdout', corruptCache.stdout, '', 'a hash failure emits no count');
  check(
    'counter.corruptCache.reason',
    corruptCache.stderr.includes('o200k_base cache hash mismatch'),
    true,
    'the failure identifies the verified-cache hash mismatch',
  );
} finally {
  rmSync(corruptCacheDir, { recursive: true, force: true });
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
  projectRoot: '/Users/maximus/IdeaProjects/project-dusk',
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
  projectRoot: '/Users/maximus/IdeaProjects/project-dusk',
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
  'codex.counterDistributionParity',
  readFileSync(distributedCounterPath, 'utf8'),
  readFileSync(projectedCounterPath, 'utf8'),
  'distributed Codex carries the generated pinned counter byte-for-byte',
);
check(
  'codex.preparerProjectionParity',
  readFileSync(projectedPreparerPath, 'utf8'),
  readFileSync(canonicalPreparerPath, 'utf8'),
  'native Codex carries the pinned durable preparer byte-for-byte',
);
check(
  'codex.preparerDistributionParity',
  readFileSync(distributedPreparerPath, 'utf8'),
  readFileSync(projectedPreparerPath, 'utf8'),
  'distributed Codex carries the durable preparer byte-for-byte',
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
  'Every mutating mode requires `request_user_input` approval',
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

function instantiateTeam(projectRoot, {
  policy = 'required', roster = BUILD_ROSTER, reportRoot = `${SOURCE_CLIENT_DIR}/reports`,
  compactDefaults = false,
} = {}) {
  return instantiateTeamTemplate(projectedTeam, {
    projectRoot: '/Users/maximus/IdeaProjects/project-dusk', roster, policy, reportRoot,
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
  const teamDir = join(world, '.codex', 'teams', 'dusk');
  const agentsDir = join(world, '.codex', 'agents');
  mkdirSync(teamDir, { recursive: true });
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(join(teamDir, 'team.md'), teamText ?? instantiateTeam(
    world, { policy, roster, reportRoot, compactDefaults },
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

function runVerifier(world, env = process.env) {
  const result = spawnSync('bash', [verifierPath, 'dusk'], {
    cwd: world,
    env,
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
}

{
  // GIVEN: a fresh shell has no preexisting SID and trace storage is absent.
  const world = mkdtempSync(join(tmpdir(), 'team-fresh-sid-'));
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

{
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
}

{
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
}

{
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
}

{
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
}

{
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
}

{
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
}

{
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
}

{
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
}

{
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
}

{
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
}

{
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
}

{
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
for (const [name, description] of [['empty', ''], ['multiline', 'first line\nsecond line'], ['c0Escaped', 'first\u0001second'], ['delEscaped', 'first\u007fsecond'], ['nel', 'first\u0085second'], ['c1Start', 'first\u0080second'], ['c1End', 'first\u009fsecond'], ['yamlNoncharacterFffe', 'first\ufffesecond'], ['yamlNoncharacterFfff', 'first\uffffsecond']]) {
  for (const parked of [false, true]) {
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
  const agentsDir = join(world, '.codex', 'agents');
  renameSync(join(agentsDir, 'build-eng.toml'), join(agentsDir, 'build-eng.toml.disabled'));
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
  writeFileSync(teamPath, `${readFileSync(teamPath, 'utf8')}${'x'.repeat(3000)}\n`);
  const result = runVerifier(world);
  check('verifier.teamCeiling.exit', result.status, 1,
    'an oversized fully substituted team.md fails');
  check('verifier.teamCeiling.reason',
    result.output.includes('maximum 2800 chars and 700 tiktoken 0.13.0/o200k_base tokens'), true,
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
}

{
  const world = makeWorld({ agentText: '---\nname: build-eng\n---\n' });
  const result = runVerifier(world);
  check('verifier.renamedMarkdown.exit', result.status, 1, 'renamed Markdown is not accepted as TOML');
  check('verifier.renamedMarkdown.reason', result.output.includes('invalid TOML'), true,
    'the verifier parses the native fixture instead of scanning YAML text');
  removeWorld(world);
}

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
]) {
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
}
// END SOURCE FRONTMATTER BUDGET FIXTURE

{
  const oversized = `${runtimeRepresentativeBody}\n${'x'.repeat(3300)}\n`;
  const world = makeWorld({ agentText: agentFile({ body: oversized }) });
  const result = runVerifier(world);
  check('verifier.bodyCeiling.exit', result.status, 1, 'an oversized developer_instructions value fails');
  check('verifier.bodyCeiling.reason', result.output.includes('ceilings are 3200 bytes and 800 tokens'), true,
    'the failure names the body-only contract');
  removeWorld(world);
}

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
check('codex.verifier.normalizedAllowlist', nativeVerifier.includes('approved_contracts'), true,
  'native verifier uses a closed normalized contract allowlist');
check('codex.verifier.noMutationVerbDenylist',
  nativeVerifier.includes('forbidden_action') || nativeVerifier.includes('weakening ='), false,
  'native verifier contains no mutation-verb denylist');

console.log('suite-agent-profile-contract.mjs');
for (const line of results) console.log(line);
console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
