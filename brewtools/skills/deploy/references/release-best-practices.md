# Release Best Practices

> Semver rules below are **general** — they apply anywhere.
>
> Everything from "Release Flow" down is a **WORKED EXAMPLE** taken from one specific repo
> (`claude-brewcode`, a 4-plugin Claude Code marketplace). Its script names, file paths, URLs
> and heading names are that repo's, **not yours**. Read it for the SHAPE — probe-then-run,
> every version file in lockstep, verify the published artifact, gate on a version check —
> and translate each step to whatever the current project actually has.
>
> **Do not execute any command from the example blocks in another repo.** `/brewtools:deploy`
> P4 Step 0 probes for the real tooling first.

## Semver Rules

| Bump | When | Examples |
|------|------|---------|
| **patch** (0.0.X) | Bug fixes, typos, minor adjustments | Fix hook, fix script, update docs |
| **minor** (0.X.0) | New features, new skills, new agents | Add deploy skill, add image-gen |
| **major** (X.0.0) | Breaking changes, incompatible API | Restructure plugins, rename skills |

## EXAMPLE — Release Flow (claude-brewcode repo)

```
1. Discover tags; select unused X.Y.Z and the exact owned paths/branch.
2. bash .claude/scripts/bump-version.sh X.Y.Z → synchronize the current carriers.
3. Update RELEASE-NOTES.md and affected docs; validate the owned change set.
4. Execute the authorized release as one failure-stop chain:
   git add -- <owned paths> && git commit -m "Release vX.Y.Z" &&
   git push origin HEAD && git tag vX.Y.Z && git push origin refs/tags/vX.Y.Z
   → explicit paths only; git add -A is banned; git push --tags is banned.
5. Verify CI for the committed SHA, published release, and served docs provenance/content.
6. Refresh local Claude plugin caches only with explicit authorization for those caches.
   Native Codex plugins remain disabled; a release does not authorize local installation.
```

## EXAMPLE — Version Carriers (claude-brewcode repo)

| File | Path |
|------|------|
| brewcode plugin.json | `brewcode/.claude-plugin/plugin.json` |
| brewdoc plugin.json | `brewdoc/.claude-plugin/plugin.json` |
| brewtools plugin.json | `brewtools/.claude-plugin/plugin.json` |
| brewui plugin.json | `brewui/.claude-plugin/plugin.json` |
| Marketplace product entries | `.claude-plugin/marketplace.json` |
| brewcode package version | `brewcode/package.json` |
| Derived stamps, versioned docs, compatibility mirror | Current coverage in `.claude/scripts/bump-version.sh` |

> In THAT repo: never edit versions manually, always `bash .claude/scripts/bump-version.sh X.Y.Z`.
> Product versions match; the native compatibility schema version is independent. Read the helper
> for current generated coverage instead of hard-coding a carrier count.
> In YOUR repo: use whatever P4 Step 0 discovered — the equivalent script, or every version file by hand.

## EXAMPLE — RELEASE-NOTES.md Format (claude-brewcode repo)

```markdown
## vX.Y.Z (YYYY-MM-DD)

> Docs: [page](https://doc-claude.brewcode.app/plugin/path/) | [page2](...)

### brewcode
#### Added
- **skill:** deploy skill — GitHub Actions deployment with safety gates

#### Changed
- **hook:** improved pre-compact knowledge extraction

#### Fixed
- **script:** bump-version.sh handles missing files gracefully
```

### Rules

| Rule | Details |
|------|---------|
| `> Docs:` line | MUST list doc pages for ALL affected skills/agents/hooks |
| URL pattern | `https://doc-claude.brewcode.app/{plugin}/{skills\|agents}/{name}/` |
| Group by plugin | Separate `### brewcode`, `### brewdoc`, `### brewtools`, `### brewui` |
| Group by type | `#### Added`, `#### Changed`, `#### Fixed` under each plugin |
| Category prefix | Bold: `**skill:**`, `**hook:**`, `**agent:**`, `**script:**` |

## Changelog Generation

### From Commits

Analyze commits since last tag:

```bash
git log --oneline $(git describe --tags --abbrev=0)..HEAD
```

### Type Mapping

| Commit prefix | Changelog type |
|---------------|---------------|
| `feat:`, `add:`, new file | Added |
| `fix:`, `bugfix:` | Fixed |
| `refactor:`, `update:`, `improve:` | Changed |
| `docs:` | Changed (docs) |
| `test:` | Usually skip unless significant |

### EXAMPLE — Component Detection (claude-brewcode repo)

Map changed file paths to the component they belong to. Derive the equivalent table for the
current repo from its top-level layout:

| Path prefix | Plugin |
|-------------|--------|
| `brewcode/` | brewcode |
| `brewdoc/` | brewdoc |
| `brewtools/` | brewtools |
| `brewui/` | brewui |
| `.claude/`, `.github/` | infrastructure (under brewcode) |

## EXAMPLE — Tag + CI Conventions (claude-brewcode repo)

| Pattern | Meaning |
|---------|---------|
| `vX.Y.Z` | Release tag (triggers CI) |
| No pre-release tags | This project uses simple semver only |

### CI Triggers

| Event | Workflows triggered |
|-------|-------------------|
| Tag `v*.*.*` push | Docs (GHCR build), Release (GitHub Release) |
| Docs workflow completes successfully | Deploy Docs (VPS deploy) via `workflow_run` |
| Branch push (non-main) | Docs (GHCR build, branch tag) |

## Post-Release Verification

General rule: verify the ARTIFACT, not just the run. Gate on both a health check AND a version
check (the live thing reports X.Y.Z). Pick the checks that match what this repo publishes.

### EXAMPLE — checks for the claude-brewcode repo

| Check | Command | Expected |
|-------|---------|----------|
| CI runs | `gh run watch "$(gh run list -L 20 --json databaseId,headSha --jq "[.[] \| select(.headSha == \"$(git rev-parse HEAD)\")] \| .[0].databaseId")" --exit-status` | Exit 0 — correlated to this commit, !=whatever ran last |
| Release created | `gh release view vX.Y.Z` | Exists, not draft |
| Docs provenance | `curl -fsS https://doc-claude.brewcode.app/build-info.json` | Exact `{version,sha,buildRunId}` matches the successful Docs image/build |
| Docs content | Fetch affected pages and compare the deployed getting-started HTML hash with the image | HTTP 200, correct version/content; health alone is insufficient |
| Local caches (only if authorized) | Verify the explicitly named cache against the released source | Correct version and hooks; no implicit machine-local updates |

## Emergency Rollback

If release has critical issues:

1. Do NOT delete the tag (breaks references)
2. Fix forward: create patch release `vX.Y.(Z+1)`
3. For an authorized docs rollback: `gh workflow run "Deploy Docs" -f image_tag=PREVIOUS_VERSION`.
   The selected image must have verified SHA/run labels and build metadata; legacy images without
   provenance fail closed. An attempted rollback is not verified recovery.
