# 🚀 Update-Anleitung für Docker/Synology

## 1. Code auf dem Server aktualisieren

SSH zu deinem Synology:

```bash
cd /volume2/docker/stremio-mediathek-addon
sudo git pull
```

## 2. TMDB API Key setzen (optional, für Poster)

Bearbeite `docker-compose.yml` und füge die Umgebungsvariable hinzu:

```yaml
services:
  addon:
    # ... existing config
    environment:
      - BASE_URL=http://dein-server:7005
      - TMDB_API_KEY=dein_tmdb_api_key_hier  # <-- NEU HINZUFÜGEN
    # ... rest

  updater:
    # ... existing config
    environment:
      - TMDB_API_KEY=dein_tmdb_api_key_hier  # <-- NEU HINZUFÜGEN
    # ... rest
```

**Wie du den TMDB API Key bekommst:**
- Registrieren: https://www.themoviedb.org/signup
- API Key anfordern: https://www.themoviedb.org/settings/api (kostenlos!)

## 3. Docker neu bauen und starten

```bash
# Container stoppen
sudo docker compose down

# Neu bauen (mit neuen Änderungen)
sudo docker compose build

# Starten
sudo docker compose up -d

# Logs prüfen
sudo docker compose logs -f
```

## 4. Update-Job anstoßen (einmalig für neue Daten)

```bash
# Updater manuell ausführen
sudo docker compose run --rm updater node src/updater/updater-cli.js

# Oder warte 6h bis automatischer Cron-Job läuft
```

## ✅ Was ist neu?

1. **Mindestdauer-Filter funktioniert jetzt** (war vorher kaputt)
2. **TMDB Poster-Integration** (optional, braucht API Key)
3. **Keine hässlichen Sender-Logos mehr als Poster**

## 🔍 Prüfen ob es funktioniert

```bash
# Logs vom Addon
sudo docker compose logs addon

# Logs vom letzten Update
sudo docker compose logs updater

# Du solltest sehen:
# [INFO] Starte TMDB Poster-Fetching... (nur wenn API Key gesetzt)
# [INFO] Poster-Fetching abgeschlossen { hitRate: '34.2%' }
```

## 🆘 Ohne TMDB API Key?

Kein Problem! Das Add-on funktioniert auch ohne:
- Mindestdauer-Filter funktioniert trotzdem
- Nur keine Poster, aber besser als vorher (keine falschen Logos)

Du kannst den API Key später jederzeit hinzufügen.
