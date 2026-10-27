# Brewcode Docs

Documentation site `doc-claude.brewcode.app`. Astro 5 + Caddy + Docker.

## Development

Node.js 24 (build image pins `node:24.22.1-alpine3.23`), npm.

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

### CI/CD

Workflow `.github/workflows/docs.yml` builds `linux/amd64` images. Stable `vX.Y.Z` release tags publish automatically; branch pushes do not run it. Manual runs build and verify only unless `publish=true` is explicitly requested from `main`. No `latest` tag.

| Event | Image tags | Publication |
|-------|------------|-------------|
| Stable tag `vX.Y.Z` | `X.Y.Z` + `sha-<sha>-<run>-<attempt>` | Automatic |
| Manual run, `publish=false` (default) | `<product-version>-manual-<run>` + `sha-<sha>-<run>-<attempt>` | Build and verify only |
| Manual run on `main`, `publish=true` | `<product-version>-manual-<run>` + `sha-<sha>-<run>-<attempt>` | Publish and deploy documentation |

To check a branch without publishing, run from the repository root:

```bash
gh workflow run docs.yml --ref <branch>
```

To publish a documentation-only update already committed and pushed to `main`:

```bash
gh workflow run docs.yml --ref main -f publish=true
```

This does not bump product versions or create a release tag. A successful published build triggers `.github/workflows/deploy-docs.yml`, which verifies the image digest, source SHA, exact build run and attempt, and the publication authorization before deployment. Build-only manual runs cannot deploy.

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

For a documentation-only update, use the explicit `main` publication command above. Product releases still publish documentation through stable `vX.Y.Z` tags.

To redeploy a previously published build, run **Deploy Docs** with its exact provenance tag from the source Docs run:

```bash
gh workflow run deploy-docs.yml --ref main \
  -f image_tag=sha-<sha>-<run>-<attempt>
```

The deployment rechecks that the image came from a successful stable release build or an explicitly authorized publication from `main`.

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
