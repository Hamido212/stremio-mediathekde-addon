# syntax=docker/dockerfile:1

# ---- Abhängigkeiten (inkl. nativer better-sqlite3-Binaries) ----
FROM node:22-alpine AS deps
# Build-Tools nur für diese Stage: better-sqlite3 wird kompiliert, falls kein
# vorgefertigtes Binary für die Plattform existiert (z.B. musl/arm64).
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- Laufzeit-Image ----
FROM node:22-alpine
# bzip2 zum Entpacken der Filmliste (deutlich schneller als die JS-Variante)
RUN apk add --no-cache bzip2 tini su-exec
WORKDIR /app
ENV NODE_ENV=production \
    PORT=7005 \
    DATA_DIR=/app/data \
    UPDATE_INTERVAL_HOURS=6

COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.js ./
COPY src ./src
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Startet als root, korrigiert die Rechte von /app/data und wechselt dann zu
# PUID:PGID (Standard 1000:1000 = Benutzer "node"), siehe docker-entrypoint.sh
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME ["/app/data"]
EXPOSE 7005

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/health >/dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--", "docker-entrypoint.sh"]
CMD ["node", "server.js"]
