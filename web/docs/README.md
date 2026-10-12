# Brewcode Docs

Documentation site `doc-claude.brewcode.app`. Astro 5 + Caddy + Docker.

## Development

Node.js 24 (build image pins `node:24.21.0-alpine3.23`), npm.

```bash
npm install       # dependencies
npm run dev       # localhost:4322
npm run build     # production -> dist/
npm run check     # TypeScript
```

Dev via Docker (no image tag needed, builds locally):
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
# localhost:8080
```

## Deploy

Full operator guide: [`web/DEPLOY.md`](../DEPLOY.md).

### CI/CD (automatic)

Workflow `.github/workflows/docs.yml` builds the image and pushes it to GHCR on `v*.*.*` tags and non-`main` branch pushes. No `latest` tag.

| Event | Image tags | Example |
|-------|-----------|---------|
| Tag `v3.5.0` | `3.5.0` + `sha-<sha>-<run>-<attempt>` | `ghcr.io/.../docs:3.5.0` |
| Branch push | `{version}-{branch}-{N}` + `sha-<sha>-<run>-<attempt>` | `ghcr.io/.../docs:3.4.6-web-1` |

Platform: `linux/amd64`.

`.github/workflows/deploy-docs.yml` deploys only release-tag (`v*.*.*`) builds; branch images are previews and never reach production.

### Manual build

Local testing only; published images come from CI.

```bash
docker buildx build --platform linux/amd64 \
  -t brewcode-docs:local .
```

### Testing a published image

```bash
cd ..
DOCS_TAG=3.5.0 docker compose -f docker-compose.test.yml up
# localhost:8080
```

### Running on the server

CI copies `deploy/docker-compose.yml` to `/opt/brewcode-docs/` and writes `DOCS_TAG` to its `.env`. The image reference is `${DOCS_TAG:?...}`: without an exact tag compose refuses to start.

### DNS

A/AAAA record `doc-claude.brewcode.app` -> server IP. The shared Caddy proxy on the VPS obtains the TLS certificate automatically.

### Updating

Push a new release tag `vX.Y.Z`. To redeploy an existing release, run **Deploy Docs** (`workflow_dispatch`) with its exact `image_tag`.

## Structure

```
web/docs/
├── Dockerfile              # multi-stage: node build + caddy serve
├── Caddyfile               # standalone (auto-TLS, security headers)
├── Caddyfile.dev           # dev (port 80, no TLS)
├── docker-compose.yml      # standalone base (DOCS_VERSION), dev-override base
├── docker-compose.dev.yml  # dev override
├── deploy/                 # production: docker-compose.yml (DOCS_TAG), docs.Caddyfile, brewcode-docs.caddy
├── src/content/docs/       # MDX content
├── src/components/         # components
├── public/                 # static assets
└── dist/                   # build output (gitignored)
```

## Stack

Astro 5, Tailwind 3, DaisyUI 4, MDX, Shiki (catppuccin-mocha), Caddy 2.11
