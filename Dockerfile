# Verwende offizielles Node.js 18 Alpine Image (klein & effizient)
FROM node:18-alpine

# Installiere bzip2 für Dekompression
RUN apk add --no-cache bzip2

# Setze Arbeitsverzeichnis
WORKDIR /app

# Kopiere package.json und package-lock.json
COPY package*.json ./

# Installiere Abhängigkeiten (Production only)
RUN npm ci --only=production

# Kopiere Anwendungscode
COPY server.js ./
COPY src ./src

# Exponiere Port 7005
EXPOSE 7005

# Umgebungsvariablen
ENV PORT=7005
ENV NODE_ENV=production
ENV LOG_LEVEL=INFO

# Healthcheck (prüfe ob Server läuft)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:7005/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Starte Server
CMD ["node", "server.js"]
