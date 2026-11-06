# Mediathek DE – Stremio Add-on 📺📻

Die deutschen öffentlich-rechtlichen Mediatheken direkt in [Stremio](https://www.stremio.com):
**ARD, ZDF, ARTE, 3sat, phoenix, KiKA, alle Dritten** – dazu **Live-TV** und **Radio**.
Alle Inhalte kommen aus frei zugänglichen, offiziellen Quellen und werden direkt von den Servern der Sender abgespielt.

## Funktionen

| | |
|---|---|
| 🎬 **~700.000 Videos** | komplette MediathekView-Filmliste, alle 6 Stunden automatisch aktualisiert |
| 🗂️ **Kataloge** | Neu, Spielfilme, Krimis, Dokus, Wissen, Kultur, Nachrichten, Kinder, Serienfolgen, Unterhaltung, Sport |
| 📚 **Sendungen als Serien** | „Tatort", „Sturm der Liebe", „Die Sendung mit der Maus" … mit allen Folgen, nach Staffel/Jahr sortiert |
| 🔎 **Volltextsuche** | SQLite FTS5 über Titel, Sendung und Sender (inkl. Umlaute) |
| 🎚️ **Qualitäten** | HD / SD / Mobil als eigene Streams |
| ♿ **Barrierefreie Fassungen** | Audiodeskription, Gebärdensprache, Originalversion als zusätzliche Streams – keine doppelten Kacheln |
| 💬 **Untertitel** | EBU-TT/TTML der Sender wird live in WebVTT umgewandelt |
| 📡 **Live-TV** | 23 öffentlich-rechtliche Sender (inkl. Regionalvarianten), nur offizielle Sender-CDNs, tote Streams werden aussortiert; bereinigte Playlists starten in ~1 s statt 2–5 s |
| 📻 **Radio** | ~1.300 deutsche Sender via radio-browser.info, öffentlich-rechtliche separat |
| ⚙️ **Konfigurierbar** | Sender, Kataloge und Mindestlänge pro Installation |
| 🖼️ **Poster** | generierte Poster in Senderfarben; optional echte Poster von TMDB |

## Schnellstart

### Vercel (kostenlos, ohne eigenen Server – für eine öffentliche Community-Instanz)

Vercel baut die Datenbank beim Deployment selbst; eine GitHub-Action stößt alle 6 Stunden einen neuen Build an.
Schritt-für-Schritt-Anleitung: **[docs/VERCEL.md](docs/VERCEL.md)**.

### Docker (z.B. Synology, Raspberry Pi, VPS)

```bash
git clone https://github.com/Hamido212/stremio-mediathekde-addon.git
cd stremio-mediathekde-addon
docker compose up -d
```

Danach **http://\<server\>:7005/configure** öffnen und auf „In Stremio installieren" klicken.
Der erste Import dauert ca. 1–3 Minuten (Download ~160 MB). Fortschritt: `docker compose logs -f`.

Fertige Images (amd64 + arm64) werden bei jedem Push gebaut: `ghcr.io/hamido212/stremio-mediathekde-addon:latest`.

### Lokal mit Node.js (≥ 22)

```bash
npm install
npm start          # startet Server + ersten Import automatisch
```

Weitere Befehle:

```bash
npm run update     # Filmliste manuell aktualisieren (läuft auch neben dem Server)
npm run update -- --force
npm test           # Tests
```

## Konfiguration (Umgebungsvariablen)

| Variable | Standard | Beschreibung |
|---|---|---|
| `PORT` | `7005` | HTTP-Port |
| `BASE_URL` | – | Öffentliche URL (hinter Reverse-Proxy/HTTPS setzen, z.B. `https://mediathek.example.de`) |
| `DATA_DIR` | `./data` | Datenverzeichnis (App-DB, Cache, Status) |
| `UPDATE_INTERVAL_HOURS` | `6` | Aktualisierungsintervall der Filmliste |
| `UPDATE_ON_START` | `true` | Beim Start aktualisieren, wenn die Daten älter als das Intervall sind |
| `DONATION_URL` | – | Link zu Ko-fi/PayPal/GitHub Sponsors – erscheint im Add-on und auf der Konfig-Seite |
| `TMDB_API_KEY` | – | Optional: echte Poster für Sendungen und Spielfilme ([kostenloser Key](https://www.themoviedb.org/settings/api)) |
| `ADMIN_TOKEN` | – | Aktiviert `POST /admin/update` (Header `Authorization: Bearer <token>`) |
| `LOG_LEVEL` | `info` | `error` · `warn` · `info` · `debug` |
| `PUID` / `PGID` | `1000` | Docker: Benutzer für die Dateien in `./data` (Synology z.B. `1026` / `100`) |

## Stremio Web & lokales Netzwerk

Stremio **Desktop, Android und TV** greifen direkt auf das Add-on zu. **Stremio Web** (`https://web.stremio.com`) läuft dagegen im Browser,
und Chrome/Edge blockieren Zugriffe von öffentlichen Webseiten auf Geräte im lokalen Netz („Zugriff auf lokales Netzwerk").
Zwei Lösungen:

1. **Empfohlen:** Add-on über HTTPS mit eigener Domain erreichbar machen (z.B. Synology-Reverse-Proxy + Let's Encrypt, Cloudflare Tunnel) und `BASE_URL` setzen.
2. Für lokale Tests: in Chrome auf `web.stremio.com` → Schloss-Symbol → *Website-Einstellungen* → **Zugriff auf lokales Netzwerk: Zulassen**.

> ⚠️ Die offizielle Adresse ist **web.stremio.com**. `stremio.io` ist eine geparkte Domain, die auf Werbe-/Betrugsseiten weiterleitet.

## Endpunkte

| Pfad | |
|---|---|
| `/configure` | Konfiguration & Installation |
| `/manifest.json`, `/<config>/manifest.json` | Stremio-Manifest |
| `/health` | Status (DB-Stand, Update, Live-TV, Radio) als JSON |
| `/art/...` | generierte Poster (SVG) |
| `/subtitles/<id>.vtt` | Untertitel als WebVTT |
| `/live/<sender>/<n>.m3u8` | bereinigte Live-Playlist (schneller Start; Video/Ton direkt vom Sender) |
| `POST /admin/update` | Update anstoßen (nur mit `ADMIN_TOKEN`) |

## Architektur

Kurzfassung – Details und Entscheidungen in [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md):

```
MediathekView (filmliste-v2.db.bz2) ──► Updater (Kindprozess, alle 6h)
                                           │  Download → bzip2 → ATTACH + INSERT…SELECT → FTS5
                                           ▼
                                   data/app/app-<ts>.db  ──(Hot-Swap ohne Neustart)──►  Express-Server
iptv-org + kuratierte Liste ──► Live-TV (12h, Stream-Check)  ─────────────────────────►  /catalog /meta /stream
radio-browser.info ───────────► Radio  (12h)                 ─────────────────────────►  /configure /health
```

Ein kompletter Update-Lauf (Download, Entpacken, Import von ~713.000 Einträgen) dauert ca. **45 Sekunden**;
Katalog-Anfragen werden in **1–25 ms** beantwortet.

## Rechtliches

Dieses Projekt steht in keiner Verbindung zu den Rundfunkanstalten, zu MediathekView, iptv-org oder radio-browser.info.
Es verlinkt ausschließlich auf frei zugängliche Inhalte, die die Sender selbst öffentlich anbieten; es werden keine Inhalte gespeichert oder weiterverbreitet.
Live-TV-Streams werden nur von offiziellen Sender-CDNs übernommen. ORF/SRF-Inhalte sind teils nur in Österreich bzw. der Schweiz abrufbar.

Lizenz: MIT
