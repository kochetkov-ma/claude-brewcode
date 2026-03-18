# Deploy: claude-brewcode Documentation Site

## Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Docker | 20.10+ | Container runtime |
| Docker Compose | v2.24+ | Service orchestration (`!override` tag support) |
| GHCR access | PAT with `write:packages` | Push images to GitHub Container Registry |

**GHCR image:** `ghcr.io/kochetkov-ma/claude-brewcode-docs`

**Domain:** `doc-claude.brewcode.app`

## Local Development

```bash
cd web/docs

docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Access at **http://localhost:8080**

Dev override (`docker-compose.dev.yml`):
- Builds from local `Dockerfile` instead of pulling GHCR image
- Binds `Caddyfile.dev` (HTTP-only, port 80) instead of production TLS config
- Maps host port `8080` to container port `80`
- No restart policy (`restart: "no"`)

Stop:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

## Building the Image

**Standard build** (same architecture as host):
```bash
docker build -t ghcr.io/kochetkov-ma/claude-brewcode-docs:latest \
  -f web/docs/Dockerfile web/docs/
```

**Cross-architecture** (Apple Silicon -> amd64 VPS):
```bash
docker buildx build --platform linux/amd64 \
  -t ghcr.io/kochetkov-ma/claude-brewcode-docs:latest \
  -f web/docs/Dockerfile web/docs/
```

> Run `docker buildx create --use` once if buildx multi-platform builder is not configured.

**Build context:** `web/docs/` -- all `COPY` paths in Dockerfile are relative to this directory.

**2-stage build:**
1. `node:22-alpine` -- installs dependencies (`npm ci`), runs `npm run build`
2. `caddy:2-alpine` -- copies only `/app/dist` to `/srv`, no source code or node_modules

## GHCR Publishing

### Login

```bash
echo $CR_PAT | docker login ghcr.io -u USERNAME --password-stdin
```

`CR_PAT` = GitHub Personal Access Token with `write:packages` scope.

### Push

```bash
docker push ghcr.io/kochetkov-ma/claude-brewcode-docs:latest
```

### Tagging

Tag with version and git SHA for traceability:

```bash
docker tag ghcr.io/kochetkov-ma/claude-brewcode-docs:latest \
  ghcr.io/kochetkov-ma/claude-brewcode-docs:vX.Y.Z

docker tag ghcr.io/kochetkov-ma/claude-brewcode-docs:latest \
  ghcr.io/kochetkov-ma/claude-brewcode-docs:sha-$(git rev-parse --short HEAD)

docker push ghcr.io/kochetkov-ma/claude-brewcode-docs:vX.Y.Z
docker push ghcr.io/kochetkov-ma/claude-brewcode-docs:sha-$(git rev-parse --short HEAD)
```

### GHCR Visibility

New GHCR packages default to **private**. To make public:

1. Go to **GitHub** > **Settings** > **Packages**
2. Find `claude-brewcode-docs`
3. **Package settings** > **Change visibility** > **Public**

## VPS Deployment

### First-time Setup

1. Point DNS `doc-claude.brewcode.app` A-record to VPS IP
2. Copy deployment files to VPS:

```bash
scp web/docs/docker-compose.yml web/docs/Caddyfile user@VPS:/opt/brewcode-docs/
```

3. On VPS, login to GHCR and start:

```bash
cd /opt/brewcode-docs

echo $CR_PAT | docker login ghcr.io -u USERNAME --password-stdin

docker compose up -d
```

Caddy automatically obtains TLS certificates via ACME (Let's Encrypt) once the domain resolves to the VPS.

4. Verify:

```bash
curl -I https://doc-claude.brewcode.app
```

Expected: `HTTP/2 200` with security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`).

### Production Compose

`docker-compose.yml` exposes ports `80`, `443`, `443/udp` (HTTP/3) with named volumes for Caddy data (certificates) and config.

### Security Headers (Caddyfile)

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevent MIME-type sniffing |
| `X-Frame-Options` | `DENY` | Block iframe embedding |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer leakage |
| `-Server` | (removed) | Hide server identity |

Static assets (`/_astro/*`) served with `Cache-Control: public, max-age=31536000, immutable` (content-hashed filenames).

## Updating

Pull new image and restart:

```bash
cd /opt/brewcode-docs

docker compose pull
docker compose up -d
```

Caddy preserves TLS certificates across restarts via the `caddy_data` volume.

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| TLS cert not obtained | DNS not pointing to VPS | Verify A-record resolves: `dig doc-claude.brewcode.app` |
| Cert lost after restart | `caddy_data` volume deleted | Never `docker compose down -v` in production |
| Port 80/443 conflict | Another service using ports | `sudo lsof -i :80` / `sudo lsof -i :443` to find conflicting process |
| Image exec format error | Built on ARM, deployed on amd64 | Rebuild with `--platform linux/amd64` |
| GHCR pull denied | Package is private or PAT expired | Set package to public or refresh PAT |
| 404 not styled | `404.html` missing from build | Verify `src/pages/404.astro` exists and `npm run build` succeeds |
| Stale content after update | Old image cached | `docker compose pull && docker compose up -d --force-recreate` |
