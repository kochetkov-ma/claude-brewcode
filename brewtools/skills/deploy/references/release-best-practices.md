# Release Best Practices

> Release flow, semver rules, changelog conventions for this project.

## Semver Rules

| Bump | When | Examples |
|------|------|---------|
| **patch** (0.0.X) | Bug fixes, typos, minor adjustments | Fix hook, fix script, update docs |
| **minor** (0.X.0) | New features, new skills, new agents | Add deploy skill, add image-gen |
| **major** (X.0.0) | Breaking changes, incompatible API | Restructure plugins, rename skills |

## Release Flow (this project)

```
1. bump-version.sh X.Y.Z     → Updates ALL 6 version files
2. Update RELEASE-NOTES.md    → Add changelog section
3. git add + commit           → "vX.Y.Z: <summary>"
4. git tag vX.Y.Z             → Create tag
5. git push && push --tags    → Push to remote (triggers CI)
6. update-plugin.sh           → Refresh local plugin cache
7. Verify CI                  → gh run list -L 3 (all green)
8. Verify cache               → grep matcher in hooks.json
```

## Version Files (CRITICAL — ALL must match)

| File | Path |
|------|------|
| brewcode plugin.json | `brewcode/.claude-plugin/plugin.json` |
| brewcode marketplace.json | `brewcode/.claude-plugin/marketplace.json` |
| brewdoc plugin.json | `brewdoc/.claude-plugin/plugin.json` |
| brewdoc marketplace.json | `brewdoc/.claude-plugin/marketplace.json` |
| brewtools plugin.json | `brewtools/.claude-plugin/plugin.json` |
| brewtools marketplace.json | `brewtools/.claude-plugin/marketplace.json` |

> NEVER edit versions manually. ALWAYS use `bash .claude/scripts/bump-version.sh X.Y.Z`

## RELEASE-NOTES.md Format

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

### Plugin Detection

Detect which plugin is affected from file paths:

| Path prefix | Plugin |
|-------------|--------|
| `brewcode/` | brewcode |
| `brewdoc/` | brewdoc |
| `brewtools/` | brewtools |
| `brewui/` | brewui |
| `.claude/`, `.github/` | infrastructure (under brewcode) |

## Tag Conventions

| Pattern | Meaning |
|---------|---------|
| `vX.Y.Z` | Release tag (triggers CI) |
| No pre-release tags | This project uses simple semver only |

## CI Triggers

| Event | Workflows triggered |
|-------|-------------------|
| Tag `v*.*.*` push | Docs (GHCR build), Release (GitHub Release) |
| Release workflow completes | Deploy Docs (VPS deploy) via `workflow_run` |
| Branch push (non-main) | Docs (GHCR build, branch tag) |

## Post-Release Verification

| Check | Command | Expected |
|-------|---------|----------|
| CI runs | `gh run list -L 3` | All green |
| Release created | `gh release view vX.Y.Z` | Exists, not draft |
| Plugin cache | `grep '"matcher"' ~/.claude/plugins/cache/claude-brewcode/brewcode/X.Y.Z/hooks/hooks.json` | Matchers present |
| Docs deployed | `curl -sf https://doc-claude.brewcode.app/getting-started/` | HTTP 200 |

## Emergency Rollback

If release has critical issues:

1. Do NOT delete the tag (breaks references)
2. Fix forward: create patch release `vX.Y.(Z+1)`
3. If CI broken: `gh workflow run "Deploy Docs" -f image_tag=PREVIOUS_VERSION`
