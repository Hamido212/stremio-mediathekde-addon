# TMDB Integration Setup Guide

Die TMDB-Integration lädt automatisch echte Poster-Bilder für Filme, Serien und Dokus von The Movie Database (TMDB).

## ✅ Vorteile
- **Echte Poster** statt Sender-Logos
- **Kostenlos** (bis zu 1.000 Anfragen/Tag)
- **Intelligentes Matching** mit Titel-Normalisierung
- **Automatisch** beim Import

## 🔑 TMDB API Key beantragen (kostenlos)

1. **Registrieren**: https://www.themoviedb.org/signup
2. **Email bestätigen**
3. **API Key beantragen**:
   - Gehe zu: https://www.themoviedb.org/settings/api
   - Klicke auf "Request an API Key"
   - Wähle "Developer"
   - Fülle das Formular aus (Name, Website-URL: z.B. "localhost", Beschreibung: "Personal Stremio Addon")
4. **API Key kopieren** (API Key v3)

## ⚙️ Konfiguration

### Option 1: Umgebungsvariable (empfohlen)

**Windows PowerShell:**
```powershell
$env:TMDB_API_KEY="dein_api_key_hier"
npm run update
npm start
```

**Windows CMD:**
```cmd
set TMDB_API_KEY=dein_api_key_hier
npm run update
npm start
```

**Linux/Mac:**
```bash
export TMDB_API_KEY="dein_api_key_hier"
npm run update
npm start
```

### Option 2: .env Datei

Erstelle eine `.env` Datei im Projekt-Root:

```env
TMDB_API_KEY=dein_api_key_hier
```

Füge in package.json hinzu (falls nicht vorhanden):
```json
{
  "scripts": {
    "start": "node -r dotenv/config server.js",
    "update": "node -r dotenv/config src/updater/updater-cli.js"
  }
}
```

Installiere dotenv:
```bash
npm install dotenv
```

### Option 3: Direkt in config.js (nicht empfohlen für Produktion)

In `src/config.js`:
```javascript
TMDB_API_KEY: 'dein_api_key_hier',
```

## 📊 Erwartete Ergebnisse

Nach dem ersten Update mit TMDB-Integration:

- **~30-50%** der Inhalte bekommen echte Poster
- **Krimis/Serien**: ~70-80% (Tatort, etc.)
- **Dokus**: ~40-60% (bekannte Titel)
- **News**: ~5-10% (meist generisch)
- **Kinder**: ~50-70%

## ⏱️ Performance

- **Ohne TMDB**: Import in ~30 Sekunden
- **Mit TMDB**: Import in ~5-10 Minuten (1000 Poster @ 4 Anfragen/Sekunde)

Der Import holt nur für die neuesten 1000 Inhalte Poster, um die Zeit zu begrenzen.

## 🔍 Logs prüfen

Nach dem Update siehst du Logs wie:

```
[INFO] Starte TMDB Poster-Fetching...
[INFO] Fetching Poster { count: 1000, estimated: '250 Sekunden' }
[INFO] TMDB Poster gefunden { matched: 'Tatort', similarity: '1.00', poster: 'https://...' }
[INFO] Poster-Fetching abgeschlossen { processed: 1000, updated: 342, hitRate: '34.2%' }
```

## ❓ FAQ

**Q: Brauche ich einen API Key?**  
A: Nein, das Add-on funktioniert auch ohne. Dann gibt es nur keine Poster.

**Q: Wie oft wird TMDB abgefragt?**  
A: Nur beim Import (nach `npm run update`), nicht bei Server-Requests.

**Q: Rate-Limits?**  
A: TMDB erlaubt 50 Anfragen/Sekunde. Das Add-on nutzt nur 4/Sekunde.

**Q: Kann ich das später aktivieren?**  
A: Ja! Einfach API Key setzen und `npm run update` erneut ausführen.

## 🐛 Troubleshooting

**"TMDB Poster gefunden" erscheint nicht in Logs:**
- Prüfe: `console.log(process.env.TMDB_API_KEY)` gibt Key aus?
- Prüfe: API Key ist korrekt (32 Zeichen)

**Wenig Treffer (<20%):**
- Normal für News/Magazine
- Höhere Rate bei Krimis/Serien erwartet

**Fehler "HTTP 401":**
- API Key ungültig oder abgelaufen
- Neuen Key generieren auf TMDB
