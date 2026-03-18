# Brewcode Docs

Документация `doc-claude.brewcode.app`. Astro 5 + Caddy + Docker.

## Разработка

Node.js 22+, npm.

```bash
npm install       # зависимости
npm run dev       # localhost:4322
npm run build     # production -> dist/
npm run check     # TypeScript
```

Dev через Docker:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
# localhost:8080
```

## Деплой

### CI/CD (автоматически)

Workflow `.github/workflows/docs.yml` собирает и пушит образ в GHCR при push.

| Событие | Тег образа | Пример |
|---------|-----------|--------|
| Tag `v3.5.0` | `3.5.0` + `latest` | `ghcr.io/.../docs:3.5.0` |
| Branch push | `{version}-{branch}-{N}` | `ghcr.io/.../docs:3.4.6-web-1` |

Платформа: `linux/amd64`.

### Ручная сборка

```bash
docker buildx build --platform linux/amd64 \
  -t ghcr.io/<owner>/claude-brewcode-docs:TAG .

echo $GITHUB_DOCKER_TOKEN | docker login ghcr.io -u <owner> --password-stdin
docker buildx build --platform linux/amd64 \
  -t ghcr.io/<owner>/claude-brewcode-docs:TAG --push .
```

### Запуск на сервере

```bash
export DOCS_VERSION=3.5.0
docker compose up -d
```

### DNS

A/AAAA запись `doc-claude.brewcode.app` -> IP сервера. Caddy получит TLS-сертификат автоматически.

### Обновление

```bash
export DOCS_VERSION=3.5.1
docker compose pull && docker compose up -d
```

## Структура

```
web/docs/
├── Dockerfile              # multi-stage: node build + caddy serve
├── Caddyfile               # production (auto-TLS, security headers)
├── Caddyfile.dev           # dev (port 80, без TLS)
├── docker-compose.yml      # production
├── docker-compose.dev.yml  # dev override
├── src/content/docs/       # MDX-контент
├── src/components/         # компоненты
├── public/                 # статика
└── dist/                   # сборка (gitignored)
```

## Стек

Astro 5, Tailwind 3, DaisyUI 4, MDX, Shiki (catppuccin-mocha), Caddy 2.11
