---
paths:
  - "web/**/Dockerfile"
  - "web/**/docker-compose*.yml"
  - "web/**/Caddyfile*"
  - "**/Dockerfile"
  - "**/docker-compose*.yml"
---

# Docker / Caddy — Best Practices

Derived from `.claude/rules/docker-best-practice.md`; image examples match `web/docs/Dockerfile`. Pin external image versions; do not introduce floating tags or default fallbacks.

| # | Practice | Context | Source |
|---|----------|---------|--------|
| 1 | 2-stage build: `node:24.14.0-alpine3.23` (build) + `caddy:2.11.2-alpine` (serve) — copy only `/app/dist` to final stage | Astro static site Docker | `web/docs/Dockerfile` |
| 2 | Caddy security headers: `X-Content-Type-Options nosniff`, `X-Frame-Options DENY`, `Referrer-Policy strict-origin-when-cross-origin` | Production `Caddyfile` | reviewer |
| 3 | Caddy `handle_errors { rewrite * /404.html; file_server }` for custom 404 with correct HTTP 404 status | Caddyfile error handling | developer |
| 4 | Caddy `encode zstd gzip` with zstd prioritized; `/_astro/*` with `Cache-Control: public, max-age=31536000, immutable` | Static asset caching | reviewer |
| 5 | `!override` YAML tag on `ports`/`volumes` in dev override replaces (not merges) production values | Docker Compose v2.24+ dev/prod separation | developer |
| 6 | `Caddyfile.dev` (port 80, no TLS, no security headers) bind-mounted in dev override for local testing | Dev stack: `docker compose -f ... -f docker-compose.dev.yml` | developer |
| 7 | Remove `Server` header in production Caddyfile | Security hardening | reviewer |
| 8 | Alpine base images minimize attack surface; multi-stage discards `node_modules` and source from final image | Security / image size | architect |
