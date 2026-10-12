---
paths:
  - "**/Dockerfile"
  - "**/docker-compose*.yml"
  - "web/**/Caddyfile*"
---

# Docker / Caddy — Avoid

| # | Avoid | Instead | Why |
|---|-------|---------|-----|
| 1 | `docker compose pull --no-cache` | `docker compose pull && docker compose up -d --force-recreate` | `--no-cache` is a `docker build` flag, invalid for `pull` |
| 2 | `*.md` glob in `.dockerignore` to exclude `.mdx` files | List `.md` explicitly or use full path pattern | `*.md` only matches `.md` extension, not `.mdx` |
