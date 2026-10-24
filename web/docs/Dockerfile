FROM node:24.22.1-alpine3.23 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY . .
ARG VERSION
RUN ASTRO_TELEMETRY_DISABLED=1 PUBLIC_VERSION=${VERSION} npm run build && node scripts/check-csp.mjs

FROM caddy:2.11.7-alpine
RUN adduser -D -u 1000 caddy && chown -R caddy:caddy /data /config
COPY --from=build --chown=caddy:caddy /app/dist /srv
COPY --chown=caddy:caddy Caddyfile /etc/caddy/Caddyfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1
USER caddy
LABEL org.opencontainers.image.source=https://github.com/kochetkov-ma/claude-brewcode
LABEL org.opencontainers.image.description="claude-brewcode documentation site"
LABEL org.opencontainers.image.licenses=MIT
