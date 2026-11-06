# Architektur & Entscheidungen (v3)

## Überblick

```
server.js                    Verdrahtung: Repository, Live-TV, Radio, Scheduler, HTTP
src/app.js                   Express: Stremio-Protokoll, /configure, /health, Bilder, Untertitel
src/stremio/                 Protokoll-Parser, Benutzer-Config, Katalog-Definitionen, Manifest, Handler
src/mediathek/               Import (builder), Lesezugriff (repository), Darstellung (presenter),
                             Sender, Kategorien, Varianten, Untertitel-Konvertierung
src/live/                    Live-TV (kuratiert + iptv-org) und Radio (radio-browser.info)
src/updater/                 Download/Entpacken, Update-Lauf, Scheduler (Kindprozess), CLI
src/artwork/                 Optionale TMDB-Poster (mit dauerhaftem Cache)
src/web/                     Konfigurationsseite, SVG-Poster, PNG-Logo
test/                        node:test – Unit- und Integrationstests mit Fixture-DB
```

## Datenfluss Mediathek

1. **Download** `filmliste-v2.db.bz2` (MediathekView, ~160 MB) mit `If-None-Match` – bei unveränderter Liste passiert nichts.
2. **Entpacken** mit `bzip2` (bzw. `lbzip2`/`pbzip2`, falls vorhanden) (Fallback: JavaScript), ~760 MB SQLite.
3. **Build** einer *neuen* Datei `data/app/app-<timestamp>.db`:
   `ATTACH` der Quelle und ein einziges `INSERT … SELECT` mit JOIN auf `channel`/`show`.
   Normalisierung, Klassifizierung und Varianten-Erkennung laufen als in SQLite registrierte JS-Funktionen.
   Danach Indizes, Sendungs-Aggregation und FTS5-Index (`rebuild`).
4. **Wechsel**: `state.json` zeigt auf die neue Datei; der Server öffnet sie und schließt die alte – ohne Neustart, ohne Ausfall.
5. Der Import läuft in einem **Kindprozess**, damit der Server währenddessen schnell antwortet.

Jeder Lauf baut die Datenbank komplett neu. Dadurch verschwinden abgelaufene Videos automatisch,
und es sind keine Migrationen nötig (`SCHEMA_VERSION` erhöhen → Server baut beim Start neu).

## Wichtige Korrekturen gegenüber v2

| Problem in v2 | Lösung in v3 |
|---|---|
| Sender-IDs hartkodiert geraten → **alle Sendernamen falsch** (z.B. 3sat als „ARD") | JOIN auf die `channel`-Tabelle der Quelle |
| `showid` (Zahl) als Sendungsname verwendet → Kategorisierung griff nie | JOIN auf `show`-Tabelle |
| Alles älter als 90 Tage gelöscht → ~90 % der verfügbaren Videos fehlten | Komplette Liste importiert (MediathekView listet nur Verfügbares) |
| Stremio-Extras falsch geparst (`genre=…&skip=…`, Leerzeichen) | Protokoll-Parser mit `URLSearchParams` auf dem rohen Pfad |
| Sender-Auswahl der Konfiguration wurde nie angewendet | Filter in allen Katalogen und Genre-Optionen |
| base64-Config mit `/` und `+` zerstörte die URL | base64url (Altformat wird weiterhin gelesen) |
| Genre-Filter ohne `options` → in Stremio unsichtbar | `options` pro Katalog |
| Nur eine Stream-Qualität | HD/SD/Mobil + barrierefreie Fassungen + Web-Link |
| Docker-Build schlug fehl (`npm ci` ohne Lockfile, Node 18 EOL) | Lockfile im Repo, Node 22, Multi-Stage, non-root, tini |
| Zwei Container (Server + Shell-Schleife) | Ein Container mit integriertem Scheduler |
| Import 5–15 min, zeilenweise in JS | ~20 s in SQLite, Gesamt-Update ~45 s |

## Bewertung der Vorschläge aus dem Google-Chat

| Vorschlag | Bewertung |
|---|---|
| Live-TV über iptv-org | ✅ Übernommen – aber **nur offizielle Sender-CDNs** (iptv-org enthält auch fremde Restreams) plus kuratierte Fallback-Liste und Erreichbarkeitsprüfung. |
| Radio über radio-browser.info | ✅ Übernommen, lokal gecacht (keine Live-API pro Klick). |
| Spenden-Link in Konfig-Seite und Manifest | ✅ Übernommen als optionales `DONATION_URL`. Keine Paywall. |
| WAL + eine große Transaktion | ⚠️ War bereits vorhanden und nicht der Engpass. Der echte Gewinn kam durch `INSERT … SELECT` in SQLite und einen frischen DB-Aufbau. |
| „Unter 30 Sekunden Import" | ✅ Für den Import selbst erreicht (~20 s); inkl. Download/Entpacken ~45 s. |
| **Umbau auf Vercel + Turso/Neon** | ❌ Externe Datenbank abgelehnt – ✅ Vercel aber umgesetzt, mit SQLite-Datei im Deployment (siehe unten). |
| Premium-Features (z.B. stündliche Updates für Spender) | ⏸️ Zurückgestellt – bringt wenig, weil MediathekView ohnehin nur ein paar Mal täglich neue Listen erzeugt, und erhöht den Betriebsaufwand. |

### Warum keine externe Datenbank (Turso, Neon)?

- **Datenmenge vs. Free-Tier:** Jede Aktualisierung schreibt ~700.000 Zeilen (+ FTS-Index). Bei 4 Läufen/Tag sind das >80 Mio. Zeilen-Schreibvorgänge im Monat – weit über den kostenlosen Kontingenten von Turso/libSQL.
- **Laufzeitgrenzen:** Ein Update lädt 160 MB, entpackt auf 760 MB und importiert – das passt weder in die Zeit- noch in die Speicherlimits von Serverless-Funktionen.
- **Latenz:** Jede Stremio-Anfrage wäre ein Netzwerk-Roundtrip zur Datenbank statt eines lokalen SQLite-Lesezugriffs (< 5 ms).
- **Komplexität:** Zwei externe Dienste, Secrets, Cron-Endpunkt-Absicherung – für ein Projekt, das als einzelner Container trivial läuft.

Neon Free (Stand 11/2026): 1 GB Speicher, 100 CU-Stunden und 5 GB Datenübertragung pro Monat. Bei Community-Nutzung schläft die Datenbank praktisch nie und das Kontingent wäre nach 2–3 Wochen aufgebraucht.

### Lösung für Vercel: SQLite im Deployment

Die Daten ändern sich nur alle paar Stunden und werden ansonsten nur gelesen. Deshalb wird die SQLite-Datei
**auf Vercels Build-Server** gebaut (`npm run vercel-build` → `scripts/build-data.js`) und über `includeFiles` mit der Funktion ausgeliefert
(Vercel „Large Functions", bis 5 GB). Eine GitHub-Action ruft alle 6 Stunden einen Deploy Hook auf → neuer Build mit aktuellen Daten.
CLI-Uploads wären im Hobby-Plan auf 100 MB begrenzt – deshalb wird die Datei auf Vercel gebaut statt hochgeladen.
Antworten tragen `s-maxage`, damit das Vercel-CDN Kataloge und Bilder cached und die Funktion selten aufgerufen wird.
Einrichtung: [docs/VERCEL.md](VERCEL.md).

Für Selbst-Hoster gibt es weiterhin das Docker-Image (amd64 + arm64, GitHub Container Registry) mit integriertem Scheduler.

## Mögliche nächste Schritte

- Echte Vorschaubilder (`og:image` der Mediathek-Seiten) für neue Inhalte im Hintergrund nachladen.
- Inkrementelle Updates über `Filmliste-diff.xz` (spart Bandbreite).
- EPG („Was läuft gerade?") für Live-TV.
- Veröffentlichung im Stremio-Community-Katalog (stremio-addons.net), sobald eine öffentliche HTTPS-Instanz läuft.
