# Stremio Add-on für Deutsche Mediatheken 🎬

Stremio Add-on für ARD, ZDF, Arte und weitere deutsche Mediatheken - **lokale SQLite-basierte Architektur** für maximale Stabilität ohne API-Rate-Limits.

## ✨ Features

- **8 kuratierte Kataloge**: Neu (7 Tage), Dokus, News, Wissen, Krimis, Kinder, Arte, Suche
- **17 Genre-Filter**: 6 Kategorien + 11 Sender (ARD, ZDF, arte, 3sat, etc.)
- **Schnelle Volltextsuche** mit SQLite FTS5
- **Keine Rate-Limits**: Alle Daten lokal verfügbar
- **Automatische Updates**: Filmliste wird alle 6h aktualisiert
- **Docker-ready**: Einfaches Deployment mit docker-compose

## 🚀 Quick Start

### Lokal (Node.js)

```bash
# 1. Dependencies installieren
npm install

# 2. Erste Datenbank-Aktualisierung (5-15 Min)
npm run update

# 3. Server starten
npm start
```

Server läuft auf: **http://localhost:7005**

### Docker

```bash
# Build & Start (inkl. automatischer Updates)
docker-compose up -d

# Logs ansehen
docker-compose logs -f addon
```

## 📖 Dokumentation

- **[SETUP.md](SETUP.md)**: Ausführliche Setup-Anleitung, Deployment-Optionen, Troubleshooting
- **[new todo.md](new todo.md)**: Technische Architektur-Doku

## 🏗️ Architektur

Das Add-on nutzt **keine Live-API**, sondern eine lokale SQLite-Datenbank:

1. **Updater**: Lädt MediathekView-Filmliste (https://liste.mediathekview.de) alle 6h
2. **Import**: Verarbeitet ~200k+ Items mit Kategorisierung und FTS5-Index
3. **Addon-Server**: Beantwortet Stremio-Requests aus lokaler DB (< 10ms)

### Vorteile gegenüber API-Ansatz:

- ✅ **Keine 500-Errors** (MediathekViewWeb API war instabil)
- ✅ **Schnellere Antworten** (lokal statt Netzwerk)
- ✅ **Offline-fähig** (nach initialem Download)
- ✅ **Keine Concurrency-Probleme**

## 🔧 Wartung

### Update manuell ausführen

```bash
npm run update
```

### Update-Frequenz ändern

Docker Compose (`docker-compose.yml`):
```yaml
command: sh -c "while true; do npm run update && sleep 21600; done"
#                                                      ^^^^^ 6h (in Sekunden)
```

### Health Check

```bash
curl http://localhost:7005/health
```

## 📊 Endpoints

- `/manifest.json` - Stremio Manifest
- `/health` - Health Check mit DB-Stats
- `/debug/db` - DB Test Query
- `/metrics` - Performance Metrics
- `/configure` - Konfigurations-UI

## 🐛 Troubleshooting

Siehe [SETUP.md](SETUP.md#troubleshooting)

## 📦 Tech Stack

- **Node.js** v22+
- **better-sqlite3** - Schnelle SQLite-Bindings
- **stremio-addon-sdk** - Stremio Integration
- **express** - HTTP Server

## 📝 TODOs

Siehe [new todo.md](new todo.md) für geplante Features und technische Details.

## ⚖️ Lizenz

MIT

---

**Hinweis**: Dieses Add-on ist nicht offiziell von MediathekView oder den Sendern unterstützt. Es nutzt öffentlich verfügbare Daten.
