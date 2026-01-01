# Stremio Mediathek Add-on - Setup & Betrieb

## 🎯 Übersicht

Dieses Add-on nutzt **lokale SQLite-Datenbanken** statt Live-API-Abfragen für maximale Stabilität und Performance.

## 📦 Architektur

- **Addon-Server** (`server.js`): Beantwortet Stremio-Requests aus lokaler DB
- **Updater** (`src/updater/updater.js`): Lädt/aktualisiert Filmliste alle 6h
- **App-DB** (`data/app/app.db`): Optimierte DB mit FTS5 für schnelle Suchen
- **Source-DB** (`data/source/filmliste-v2.db`): Original MediathekView-DB

## 🚀 Schnellstart

### 1. Initiales Setup

```bash
# Dependencies installieren
npm install

# Ersten Update-Zyklus ausführen (Download + Import)
npm run update
```

**Hinweis**: Der erste Update dauert 5-15 Minuten (Download ~80MB, Import ~200k+ Items).

### 2. Server starten

```bash
npm start
```

Server läuft auf: http://localhost:7005

### 3. In Stremio installieren

1. Öffne: http://localhost:7005
2. Klicke auf "Add-on installieren"
3. Fertig!

## 🐳 Docker Deployment

### Docker Compose (empfohlen)

```bash
# Build & Start
docker-compose up -d

# Logs ansehen
docker-compose logs -f addon
docker-compose logs -f updater

# Stop
docker-compose down
```

**Features**:
- Addon-Server läuft kontinuierlich
- Updater aktualisiert alle 6h automatisch
- Shared Volume für DB-Zugriff

### Einzelner Docker Container

```bash
# Build
docker build -t stremio-mediathek .

# Run mit Volume
docker run -d \
  -p 7005:7005 \
  -v $(pwd)/data:/app/data \
  --name stremio-mediathek \
  stremio-mediathek
```

## 🔧 Manueller Update

```bash
# Update ausführen
npm run update

# Mit Debug-Logs
NODE_ENV=development npm run update
```

## 📊 Monitoring

### Health Check

```bash
curl http://localhost:7005/health
```

**Response**:
```json
{
  "status": "ok",
  "database": {
    "totalItems": 234567,
    "lastUpdate": "2026-01-01T20:00:00.000Z",
    "source": "filmliste-v2.db"
  },
  "cache": { ... },
  "memory": { ... }
}
```

### Debug Endpoints

- **DB Test Query**: http://localhost:7005/debug/db
- **Metrics**: http://localhost:7005/metrics

## 📂 Datenstruktur

```
data/
├── source/
│   ├── filmliste-v2.db      # Original MediathekView DB
│   └── tmp/                  # Temp-Downloads
├── app/
│   └── app.db                # Optimierte App-DB mit FTS5
└── meta/
    └── state.json            # Update-State (ETag, Timestamps)
```

## ⚙️ Konfiguration

### Update-Frequenz ändern

**Docker Compose** (`docker-compose.yml`):
```yaml
command: sh -c "while true; do npm run update && sleep 14400; done"
#                                                      ^^^^^ 4h in Sekunden
```

**Systemd Timer** (Linux):
```ini
# /etc/systemd/system/stremio-update.timer
[Timer]
OnBootSec=5min
OnUnitActiveSec=6h
```

### Retention (alte Items löschen)

In `src/db/app-db.js`:
```javascript
deleteOldItems(maxAgeDays = 90)  // Ändere 90 auf gewünschte Tage
```

## 🐛 Troubleshooting

### "Cannot open database"

**Problem**: App-DB existiert nicht.

**Lösung**:
```bash
npm run update
```

### "Download fehlgeschlagen"

**Problem**: MediathekView-Server nicht erreichbar.

**Lösung**:
- Warte 1-2 Stunden (Server-Wartung)
- Prüfe Internetverbindung
- Manuelle Prüfung: https://liste.mediathekview.de/

### "Decompression fehlgeschlagen" (Windows)

**Problem**: Kein bz2-Tool gefunden.

**Lösung**:
```powershell
# Installiere 7-Zip
choco install 7zip

# Oder nutze Git Bash (hat tar)
```

### "Keine Items in Stremio"

**Checks**:
1. Health: `curl http://localhost:7005/health`
2. DB vorhanden? `ls data/app/app.db`
3. Items gezählt? Health zeigt `totalItems > 0`?

## 📈 Performance-Tuning

### FTS5 Index optimieren

```javascript
// Nach Import in src/db/importer.js:
db.exec('INSERT INTO items_fts(items_fts) VALUES("optimize")');
```

### Größere Batches beim Import

```javascript
// src/db/app-db.js
insertBulk(items, batchSize = 5000)  // Erhöhe von 1000 auf 5000
```

### Cache-Größe anpassen

```javascript
// src/cache.js
this.maxSize = 2000;  // Erhöhe von 1000
```

## 📝 Update-Logs

```bash
# Docker Compose
docker-compose logs updater

# Direkt
tail -f update.log
```

## 🔐 Produktions-Deployment

### Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name mediathek.example.com;

    location / {
        proxy_pass http://localhost:7005;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Systemd Service (VPS)

```ini
# /etc/systemd/system/stremio-mediathek.service
[Unit]
Description=Stremio Mediathek Addon
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/stremio-mediathek
ExecStart=/usr/bin/node server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

## 📚 Weitere Infos

- **MediathekView Doku**: https://mediathekview.de/
- **Filmliste-Format**: https://github.com/mediathekview/
- **Stremio SDK**: https://github.com/Stremio/stremio-addon-sdk

## ⚖️ Lizenz

MIT
