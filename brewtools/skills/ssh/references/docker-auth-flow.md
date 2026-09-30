# Docker Registry Authentication Patterns

> Reference for authenticating to container registries on remote servers.

## Token sourcing (read this first)

A registry token must never become model-visible text. There is no model-invisible input channel:
`AskUserQuestion` answers, prompts and generated commands all land in the transcript. So the user
prepares the value outside the conversation and the skill only ever pipes it to stdin.

| Source | User prepares | Used as |
|--------|---------------|---------|
| env var | `read -rs GHCR_TOKEN && export GHCR_TOKEN` in the shell that launched Claude Code | `printf '%s' "$GHCR_TOKEN" \| ...` |
| file | token written to `~/.config/brewtools/ghcr.token`, then `chmod 600` | `... --password-stdin < ~/.config/brewtools/ghcr.token` |

| Never | Why |
|-------|-----|
| `AskUserQuestion` for a token | Answer is model-visible and transcript-persistent |
| `docker login -p TOKEN` / any token in argv | Visible in `ps`, shell history, remote audit logs |
| `echo $TOKEN` outside a pipe, `env`, `set`, `cat` on the token file | Leaks into transcript and logs |
| Writing the token into a generated file, agent, or compose file | Persists the secret in the repo |

Login changes a credential store: classify/gate it before execution (remote login is a remote mutation). Match the exact approved host/registry/user/command and recheck preconditions. Incoming `APPROVED:` ids govern delegates; tool availability never supplies approval. Examples below are templates, not execution authorization. Run pipelines with `set -o pipefail`; suppress login output and surface only `OK login <registry>` / `FAILED login <registry>`, preserving failure exit status. Env tokens must exist before the session launches; otherwise use the private file, not chat.

## GHCR (GitHub Container Registry)

### Login

```bash
set -o pipefail
printf '%s' "$GITHUB_TOKEN" | docker login ghcr.io -u USERNAME --password-stdin >/dev/null 2>&1 \
  && printf 'OK login ghcr.io\n' || { rc=$?; printf 'FAILED login ghcr.io\n' >&2; exit "$rc"; }
```

| Parameter | Source | Notes |
|-----------|--------|-------|
| Local token env (`GITHUB_TOKEN` / `GHCR_TOKEN`) | PAT (classic) | `read:packages` for pull; `write:packages` for push; org SSO if required |
| Actions `GITHUB_TOKEN` | Workflow-generated token, not a fine-grained PAT | `packages: read/write` and package access for the workflow repository; cross-repository pull needs explicit access |
| `USERNAME` | GitHub username | Case-sensitive |

[Official GHCR authentication](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry), checked 2026-09-30: Packages supports PAT **classic**, not fine-grained PAT. In Actions, prefer the scoped workflow `GITHUB_TOKEN` where supported. Public images can be read anonymously. Choose least privilege; do not silently create tokens or change login/account state.

### Pull Pattern

```bash
docker pull ghcr.io/OWNER/IMAGE:TAG
```

### Token Creation

1. GitHub Settings > Developer Settings > Personal Access Tokens
2. Select a classic token's needed scopes only: pull `read:packages`, push `write:packages`, delete `delete:packages` only when authorized; enable organization SSO where required.
3. Avoid the broad `repo` scope automatically selected with write:packages where unnecessary. Fine-grained repository Packages permissions are not a GHCR PAT authentication path; an Actions workflow token is a separate mechanism.

### Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `denied: denied` | Token missing `read:packages` | Regenerate with correct scope |
| `unauthorized: unauthenticated` | Not logged in | Run `docker login ghcr.io` |
| `manifest unknown` | Wrong image name/tag | Check `ghcr.io/OWNER/IMAGE:TAG` |

## DockerHub

### Login

```bash
set -o pipefail
printf '%s' "$DOCKER_TOKEN" | docker login -u USERNAME --password-stdin >/dev/null 2>&1 \
  && printf 'OK login DockerHub\n' || { rc=$?; printf 'FAILED login DockerHub\n' >&2; exit "$rc"; }
```

| Parameter | Source | Notes |
|-----------|--------|-------|
| `DOCKER_TOKEN` | DockerHub Access Token | Hub > Account Settings > Security > Access Tokens |
| `USERNAME` | DockerHub username | |

### Pull Limits — 2026-09-30

| Auth State | Limit |
|------------|-------|
| Anonymous | 100 / 6h per IPv4 address or IPv6 /64 subnet |
| Personal (authenticated) | 200 / 6h |
| Pro/Team/Business (authenticated) | Unlimited, subject to fair use |

[Official Docker Hub usage](https://docs.docker.com/docker-hub/usage/), checked 2026-09-30. Fair use can impose throttling/restrictions/charges; a separate abuse limit applies to all tiers/requests. Do not infer a user's account tier or promise unrestricted traffic.

## Multi-Registry Setup

When server needs access to multiple registries:

```bash
set -o pipefail
# GHCR
printf '%s' "$GH_TOKEN" | docker login ghcr.io -u GH_USER --password-stdin >/dev/null 2>&1 || exit "$?"

# DockerHub
printf '%s' "$DH_TOKEN" | docker login -u DH_USER --password-stdin >/dev/null 2>&1 || exit "$?"

# Custom registry
printf '%s' "$REG_TOKEN" | docker login registry.example.com -u REG_USER --password-stdin >/dev/null 2>&1 || exit "$?"
```

Without a credential helper/store, Docker keeps base64-encoded auth in `~/.docker/config.json`; base64 is not encryption. With a helper, secrets are stored by that helper. This JSON is an illustrative shape only; never dump real config:

```json
{
  "auths": {
    "ghcr.io": { "auth": "base64..." },
    "https://index.docker.io/v1/": { "auth": "base64..." },
    "registry.example.com": { "auth": "base64..." }
  }
}
```

## Credential Helpers

For production servers, use credential helpers instead of plain config:

```json
{
  "credHelpers": {
    "ghcr.io": "pass",
    "registry.example.com": "secretservice"
  }
}
```

## Token Refresh

### Check if token is valid

```bash
set -o pipefail
printf '%s' "$GITHUB_TOKEN" | docker login ghcr.io -u USERNAME --password-stdin >/dev/null 2>&1 \
  && printf 'OK login ghcr.io\n' || { rc=$?; printf 'FAILED login ghcr.io\n' >&2; exit "$rc"; }
```

### Automated refresh in CI/deploy scripts

```bash
# Only within an approved workflow/rotation; no silent fresh-token acquisition.
set -o pipefail
printf '%s' "$FRESH_TOKEN" | docker login ghcr.io -u USERNAME --password-stdin >/dev/null 2>&1 \
  && docker pull ghcr.io/OWNER/IMAGE:TAG || { rc=$?; printf 'FAILED registry refresh\n' >&2; exit "$rc"; }
```

## Security Rules

| Rule | Details |
|------|---------|
| NEVER hardcode tokens | Exported env var or `chmod 600` file, piped to `--password-stdin` -- never `AskUserQuestion`, never argv |
| NEVER commit .docker/config.json | Contains base64 credentials |
| Rotate tokens regularly | 90-day max for production |
| Use read-only tokens for pull | Minimize blast radius |
| Credential helpers | Preferred over plain JSON on production |
