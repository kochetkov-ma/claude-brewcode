FROM node:24.14.0-alpine3.23 AS build
ARG VERSION
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN PUBLIC_VERSION=${VERSION} npm run build

FROM caddy:2.11.2-alpine
RUN adduser -D -u 1000 caddy
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
RUN chown -R caddy:caddy /data /config /srv
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1
USER caddy
LABEL org.opencontainers.image.source=https://github.com/kochetkov-ma/claude-brewcode
LABEL org.opencontainers.image.description="claude-brewcode documentation site"
LABEL org.opencontainers.image.licenses=MIT
