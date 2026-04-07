# Docker Registry Authentication Patterns

> Reference for authenticating to container registries on remote servers.

## GHCR (GitHub Container Registry)

### Login

```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u USERNAME --password-stdin
```

| Parameter | Source | Notes |
|-----------|--------|-------|
| `GITHUB_TOKEN` | GitHub PAT (classic) or fine-grained | Scope: `read:packages` (pull), `write:packages` (push) |
| `USERNAME` | GitHub username | Case-sensitive |

### Pull Pattern

```bash
docker pull ghcr.io/OWNER/IMAGE:TAG
```

### Token Creation

1. GitHub Settings > Developer Settings > Personal Access Tokens
2. Classic token: select `read:packages`, `write:packages`
3. Fine-grained: select repository, Packages: Read (or Read+Write)

### Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `denied: denied` | Token missing `read:packages` | Regenerate with correct scope |
| `unauthorized: unauthenticated` | Not logged in | Run `docker login ghcr.io` |
| `manifest unknown` | Wrong image name/tag | Check `ghcr.io/OWNER/IMAGE:TAG` |

## DockerHub

### Login

```bash
echo "$DOCKER_TOKEN" | docker login -u USERNAME --password-stdin
```

| Parameter | Source | Notes |
|-----------|--------|-------|
| `DOCKER_TOKEN` | DockerHub Access Token | Hub > Account Settings > Security > Access Tokens |
| `USERNAME` | DockerHub username | |

### Rate Limits

| Auth State | Limit |
|------------|-------|
| Anonymous | 100 pulls / 6h per IP |
| Authenticated (free) | 200 pulls / 6h |
| Pro/Team | 5000 pulls / day |

## Multi-Registry Setup

When server needs access to multiple registries:

```bash
# GHCR
echo "$GH_TOKEN" | docker login ghcr.io -u GH_USER --password-stdin

# DockerHub
echo "$DH_TOKEN" | docker login -u DH_USER --password-stdin

# Custom registry
echo "$REG_TOKEN" | docker login registry.example.com -u REG_USER --password-stdin
```

All credentials stored in `~/.docker/config.json`:

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
docker login ghcr.io -u USERNAME --password-stdin <<< "$TOKEN" 2>&1 | grep -q "Login Succeeded"
```

### Automated refresh in CI/deploy scripts

```bash
# Check auth, re-login if expired
docker pull ghcr.io/OWNER/IMAGE:TAG 2>&1 | grep -q "unauthorized" && \
  echo "$FRESH_TOKEN" | docker login ghcr.io -u USERNAME --password-stdin
```

## Security Rules

| Rule | Details |
|------|---------|
| NEVER hardcode tokens | Use env vars, secrets manager, or AskUserQuestion |
| NEVER commit .docker/config.json | Contains base64 credentials |
| Rotate tokens regularly | 90-day max for production |
| Use read-only tokens for pull | Minimize blast radius |
| Credential helpers | Preferred over plain JSON on production |
