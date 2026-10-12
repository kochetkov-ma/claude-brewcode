# Deploy: claude-brewcode Documentation Site

## Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Docker | 20.10+ | Container runtime |
| Docker Compose | v2.24+ | Service orchestration (`!override` tag support) |
| GHCR read access | public package, or PAT with `read:packages` | Pull images for local tests |

**GHCR image:** `ghcr.io/kochetkov-ma/claude-brewcode-docs`

**Domain:** `doc-claude.brewcode.app`

> No floating tags. Images are published only as exact tags (see [Image Tags](#image-tags)); `latest` is no longer pushed, and the old `latest` image in GHCR is an orphan nothing reads.

## Local Development

```bash
cd web/docs

docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Access at **http://localhost:8080**. No image tag is needed: the dev override builds locally. Compose only warns that `DOCS_VERSION` is unset (the base file's GHCR image is replaced).

Dev override (`docker-compose.dev.yml`):
- Builds from local `Dockerfile` as `brewcode-docs:dev` instead of pulling the GHCR image
- Binds `Caddyfile.dev` (HTTP-only, port 80) instead of the baked-in TLS config
- Maps host port `8080` to container port `80` (`ports: !override`)
- No restart policy (`restart: "no"`)

Stop:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

## Building the Image

Published images are built by CI only (see [CI/CD](#cicd)). A local build is for testing and uses a local-only tag:

**Standard build** (same architecture as host):
```bash
docker build -t brewcode-docs:local \
  -f web/docs/Dockerfile web/docs/
```

**Cross-architecture** (Apple Silicon -> amd64 VPS):
```bash
docker buildx build --platform linux/amd64 \
  -t brewcode-docs:local \
  -f web/docs/Dockerfile web/docs/
```

> Run `docker buildx create --use` once if buildx multi-platform builder is not configured.

**Build context:** `web/docs/` -- all `COPY` paths in Dockerfile are relative to this directory.

**2-stage build** (exact pins in `web/docs/Dockerfile`):
1. `node:24.21.0-alpine3.23` -- installs dependencies (`npm ci`), runs `npm run build` with `PUBLIC_VERSION=${VERSION}` (build arg)
2. `caddy:2.11.7-alpine` -- copies only `/app/dist` to `/srv`, runs as uid `1000`, `HEALTHCHECK` on `http://localhost:80/`

## CI/CD

### Image Tags

`.github/workflows/docs.yml` builds `linux/amd64` and pushes to GHCR on `v*.*.*` tags and non-`main` branch pushes. Every build gets two tags:

| Trigger | Version tag | Provenance tag |
|---------|-------------|----------------|
| Tag `vX.Y.Z` | `X.Y.Z` (no `v`) | `sha-<40-char sha>-<run id>-<run attempt>` |
| Branch push | `<last X.Y.Z>-<branch>-<commits since tag>` (preview) | `sha-<40-char sha>-<run id>-<run attempt>` |

The image carries labels `org.opencontainers.image.version`, `org.opencontainers.image.revision`, `io.brewcode.docs.build-run-id`, `io.brewcode.docs.build-attempt`, and `/srv/build-info.json` (`{"version","sha","buildRunId"}`).

### Deploy (release tags only)

`.github/workflows/deploy-docs.yml` runs after a successful Docs run whose upstream ref is a release tag `vX.Y.Z` from this repository. Branch preview images never reach production. Manual `workflow_dispatch` takes an exact `image_tag` (`X.Y.Z` or `sha-...`) and still verifies the image came from a successful same-repository `vX.Y.Z` Docs build.

Release flow: push tag `vX.Y.Z` -> Docs builds and pushes -> Deploy Docs:
1. Verifies image provenance (labels, digest, `build-info.json`, source Docs run)
2. Copies `web/docs/deploy/{docker-compose.yml,docs.Caddyfile,brewcode-docs.caddy}` to the VPS
3. Writes `DOCS_TAG=sha-<sha>-<run>-<attempt>` into `/opt/brewcode-docs/.env`, pulls, recreates `docs`, reloads the shared Caddy
4. Checks the served `build-info.json` and page hash; on failure restores the previous `.env` (rollback)
5. Records a GitHub Deployment (`environment: docs`, `environment_url` = live site)

### GHCR Visibility

New GHCR packages default to **private**. To make public:

1. Go to **GitHub** > **Settings** > **Packages**
2. Find `claude-brewcode-docs`
3. **Package settings** > **Change visibility** > **Public**

## Testing a Published Image

`web/docker-compose.test.yml` runs a GHCR image with the production `docs.Caddyfile` on port 8080. `DOCS_TAG` is required (`:?` fail-closed):

```bash
cd web
DOCS_TAG=X.Y.Z docker compose -f docker-compose.test.yml up
```

## VPS Deployment

Production runs behind a shared Caddy reverse proxy on the VPS; the docs container serves plain HTTP.

| VPS path | Source in repo | Role |
|----------|----------------|------|
| `/opt/brewcode-docs/docker-compose.yml` | `web/docs/deploy/docker-compose.yml` | `docs` service, container `brewcode-docs`, external network `vps-proxy`, `expose: 80`, `mem_limit: 256m`, `cpus: 0.5` |
| `/opt/brewcode-docs/docs.Caddyfile` | `web/docs/deploy/docs.Caddyfile` | In-container `:80` file server, security headers, `/404.html` |
| `/opt/brewcode-docs/.env` | written by CI | `DOCS_TAG=<exact tag>` |
| `/opt/caddy/sites/brewcode-docs.caddy` | `web/docs/deploy/brewcode-docs.caddy` | Shared proxy site: TLS for `doc-claude.brewcode.app`, `reverse_proxy brewcode-docs:80`, HSTS |

The prod compose image is `ghcr.io/kochetkov-ma/claude-brewcode-docs:${DOCS_TAG:?set a verified immutable docs tag}`: without `DOCS_TAG` compose refuses to start.

### First-time Setup

1. Point DNS `doc-claude.brewcode.app` A-record to VPS IP
2. Ensure the shared Caddy container `caddy` and the external network `vps-proxy` exist, and create `/opt/brewcode-docs` and `/opt/caddy/sites`
3. Add repository secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
4. Push a release tag `vX.Y.Z`; CI copies the deploy files and starts the service

The shared Caddy obtains TLS certificates via ACME (Let's Encrypt) once the domain resolves to the VPS.

5. Verify:

```bash
curl -I https://doc-claude.brewcode.app
curl -s https://doc-claude.brewcode.app/build-info.json
```

Expected: `HTTP/2 301` redirect to `/getting-started/` with security headers, and `build-info.json` matching the released version.

### Security Headers

| Header | Value | Set by |
|--------|-------|--------|
| `X-Content-Type-Options` | `nosniff` | `docs.Caddyfile`, `brewcode-docs.caddy` |
| `X-Frame-Options` | `DENY` | `docs.Caddyfile`, `brewcode-docs.caddy` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | `docs.Caddyfile`, `brewcode-docs.caddy` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | `brewcode-docs.caddy` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` | `brewcode-docs.caddy` |
| `-Server` | (removed) | both |

Static assets (`/_astro/*`) served with `Cache-Control: public, max-age=31536000, immutable` (content-hashed filenames).

## Updating

Push a new release tag `vX.Y.Z`; CI builds, deploys and verifies it. To redeploy an existing release, run **Deploy Docs** (`workflow_dispatch`) with its exact `image_tag`. No hand or ssh deploys.

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| TLS cert not obtained | DNS not pointing to VPS | Verify A-record resolves: `dig doc-claude.brewcode.app` |
| `required variable DOCS_TAG is missing a value` | `DOCS_TAG` unset | Set it to an exact `X.Y.Z` or `sha-...` tag (CI writes it to `.env`) |
| Branch push not deployed | By design | Only `v*.*.*` tag builds deploy |
| Deploy Docs fails provenance check | Image not from a successful same-repo `vX.Y.Z` Docs build | Push a release tag; never retag images by hand |
| Port 80/443 conflict | Another service using ports | `sudo lsof -i :80` / `sudo lsof -i :443` to find conflicting process |
| Image exec format error | Built on ARM, run on amd64 | Rebuild with `--platform linux/amd64` |
| GHCR pull denied | Package is private or PAT expired | Set package to public or refresh PAT |
| 404 not styled | `404.html` missing from build | Verify `src/pages/404.astro` exists and `npm run build` succeeds |
