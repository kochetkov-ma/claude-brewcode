# GitHub Command Safety Classification

> Reference for command classification and confirmation gates.

## Classification Levels

| Level | Gate | Description |
|-------|------|-------------|
| **READ** | free | Observe CI/CD state, no changes |
| **CREATE** | free | Create new resources (workflow files, draft releases) |
| **MODIFY** | confirm | Change existing workflows, secrets, config |
| **SERVICE** | confirm | Trigger workflows, rerun jobs, push code/tags |
| **DELETE** | always confirm | Delete releases, cancel runs, remove workflow files |
| **PRIVILEGE** | always confirm | Delete secrets, modify branch protection, disable workflows |

## READ Commands (free)

| Category | Commands |
|----------|----------|
| Runs | `gh run list`, `gh run view`, `gh run view --log`, `gh run view --log-failed` |
| Workflows | `gh workflow list`, `gh workflow view` |
| Releases | `gh release list`, `gh release view` |
| Secrets | `gh secret list` (names only, no values) |
| Repo | `gh repo view`, `gh api repos/...` (GET) |
| Git | `git status`, `git log`, `git diff`, `git describe`, `git tag -l` |
| Docker | `docker images`, `docker manifest inspect` |

## CREATE Commands (free)

| Category | Commands |
|----------|----------|
| Workflows | Write new `.github/workflows/*.yml` file |
| Releases | `gh release create --draft` (draft only) |
| Git | `git branch`, `git stash` |
| Directories | `mkdir -p .github/workflows` |

## MODIFY Commands (confirm)

| Category | Commands | Risk |
|----------|----------|------|
| Secrets | `gh secret set` | Credential changes |
| Workflows | Edit existing `.github/workflows/*.yml` | CI behavior changes |
| Release notes | Edit `RELEASE-NOTES.md` | Documentation changes |
| Git | `git commit`, `git tag` | History changes |
| Config | Edit `.github/dependabot.yml`, `CODEOWNERS` | Repo config |

## SERVICE Commands (confirm)

| Category | Commands | Risk |
|----------|----------|------|
| Workflows | `gh workflow run`, `gh run rerun` | Trigger CI execution |
| Git | `git push`, `git push --tags` | Remote state changes |
| Releases | `gh release create` (non-draft), `gh release edit` | Public release |
| Docker | `docker push`, GHCR operations | Registry changes |

## DELETE Commands (always confirm)

| Category | Commands | Risk |
|----------|----------|------|
| Releases | `gh release delete` | Release removal |
| Runs | `gh run cancel` | Job interruption |
| Files | Remove workflow file from `.github/workflows/` | CI pipeline removal |
| Git | `git tag -d`, `git push --delete` | Tag/branch removal |
| Docker | `docker rmi`, GHCR package deletion | Image removal |

## PRIVILEGE Commands (always confirm)

| Category | Commands | Risk |
|----------|----------|------|
| Secrets | `gh secret delete` | Credential removal |
| Workflows | `gh workflow disable` | CI pipeline disable |
| Branch protection | `gh api -X PUT repos/.../branches/.../protection` | Security bypass |
| Force push | `git push --force` | History rewrite |
| Admin | `gh repo edit --visibility`, `gh repo delete` | Repository control |

## Compound Command Rules

| Pattern | Classification | Why |
|---------|----------------|-----|
| `git commit && git push` | SERVICE (highest) | Push changes remote |
| `git tag && git push --tags` | SERVICE | Triggers CI pipelines |
| `gh release create && gh workflow run` | SERVICE | Multiple side effects |
| `git push --force` | PRIVILEGE (overrides SERVICE) | History rewrite |
| `bump-version.sh && git commit && git tag && git push` | SERVICE | Release chain |

## Confirmation Message Format

### MODIFY/SERVICE

```
About to execute:

  [command 1]
  [command 2]

Classification: MODIFY/SERVICE
Repo: [owner/name]
Branch: [branch]
Proceed?
```

### DELETE/PRIVILEGE

```
WARNING: DESTRUCTIVE action on [owner/name]:

  [command 1] -- [what it deletes/changes]

Classification: DELETE/PRIVILEGE
This cannot be undone.
Proceed?
```

## Emergency Stop

If any command returns unexpected output suggesting:
- Wrong repository (owner/name mismatch)
- Production branch when expecting staging/dev
- Force push to main/master
- Deleting a non-draft release with downloads
- Tag already exists on remote with different commit

**STOP immediately.** Report findings. Ask user to confirm before continuing.
