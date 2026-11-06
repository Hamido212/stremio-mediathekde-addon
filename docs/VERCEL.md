# Mediathek DE auf Vercel betreiben (kostenlos)

## So funktioniert es

```
GitHub-Action (alle 6 h) ──► Vercel Deploy Hook ──► Vercel-Build: npm run vercel-build
                                                      │  lädt MediathekView-Filmliste, Live-TV, Radio
                                                      │  baut .data/app/app.db (SQLite, ~670 MB)
                                                      ▼
                                          Vercel-Funktion api/index.js (nur lesen)
                                          + Vercel-CDN cached Kataloge/Bilder
```

- Es gibt **keine externe Datenbank**: Die SQLite-Datei wird bei jedem Build neu erzeugt und mit der Funktion ausgeliefert.
- Die **Videos laufen nie über Vercel**, sondern direkt von den Servern der Sender. Vercel liefert nur kleine JSON-Antworten, Poster und Playlists aus.
- Der Gratis-Plan „Hobby" erlaubt Spenden-Links ausdrücklich: *„Asking for Donations does not fall under commercial usage."*

## Einrichtung (einmalig, ca. 10 Minuten)

### 1. Repository auf GitHub

Den Code in dein GitHub-Repository pushen (öffentlich empfohlen: Actions sind dann unbegrenzt kostenlos).

### 2. Projekt in Vercel anlegen

1. Auf <https://vercel.com> mit deinem GitHub-Konto anmelden.
2. **Add New → Project** → das Repository `stremio-mediathekde-addon` importieren.
3. *Framework Preset*: **Other**. Build-Einstellungen nicht ändern – `vercel.json` gibt alles vor.
4. Optionale *Environment Variables*:

   | Name | Wert |
   |---|---|
   | `DONATION_URL` | Link zu Ko-fi / PayPal / GitHub Sponsors |
   | `TMDB_API_KEY` | für echte Poster (kostenlos bei themoviedb.org) |
   | `VERCEL_SUPPORT_LARGE_FUNCTIONS` | `1` – nur nötig, falls der Build mit „exceeded the unzipped maximum size of 250 MB" abbricht |

5. **Deploy** klicken. Der erste Build dauert ca. 3–5 Minuten.

Danach ist das Add-on unter `https://<projektname>.vercel.app/configure` erreichbar.

### 3. Automatische Aktualisierung einrichten

1. In Vercel: **Project → Settings → Git → Deploy Hooks** → Name `daten-update`, Branch `main` → **Create Hook** → URL kopieren.
2. In GitHub: **Repository → Settings → Secrets and variables → Actions → New repository secret**
   - Name: `VERCEL_DEPLOY_HOOK_URL`
   - Wert: die kopierte URL
3. Test: **Actions → „Vercel – Daten aktualisieren" → Run workflow**. In Vercel startet ein neuer Build.

Ab jetzt baut Vercel die Daten alle 6 Stunden neu. Ein Push auf `main` löst ebenfalls einen Build aus.

### 4. Optional: eigene Domain

**Project → Settings → Domains** – z.B. `mediathek.deinedomain.de`. HTTPS stellt Vercel automatisch bereit.

## Grenzen des Gratis-Plans

| Ressource (pro Monat) | Hobby | Bedarf |
|---|---|---|
| Funktionsaufrufe | 1 Mio. | Kataloge/Bilder werden vom CDN gecacht, nur Cache-Fehler zählen |
| Active CPU | 4 Std. | eine Anfrage braucht wenige Millisekunden |
| Datenübertragung | 100 GB | JSON und Poster, kein Video |
| Deployments | 100 / Tag | 4 automatische + deine Pushes |

Wird das Add-on sehr beliebt, zeigt Vercel im Dashboard an, wenn ein Limit erreicht wird. Dann gibt es zwei Wege: auf Pro wechseln oder die Docker-Variante nutzen (siehe README).

## Unterschiede zur Docker-Variante

| | Docker (NAS/VPS) | Vercel |
|---|---|---|
| Aktualisierung | im Server alle 6 h | neuer Build alle 6 h (GitHub-Action) |
| `POST /admin/update` | ja | nein (Build über „Run workflow" anstoßen) |
| Live-TV-Prüfung | alle 12 h | bei jedem Build |
| Kosten | eigene Hardware | kostenlos (Hobby) |

## Fehlersuche

- **Build bricht beim Download ab:** `liste.mediathekview.de` war kurz nicht erreichbar. Den Build in Vercel mit *Redeploy* oder in GitHub mit *Run workflow* neu starten.
- **Kataloge leer:** Im Build-Log nach „Daten für das Deployment gebaut" suchen. Fehlt die Zeile, ist der Import fehlgeschlagen.
- **Erster Aufruf nach längerer Pause dauert länger:** Das ist der Kaltstart der Funktion. Danach antwortet das CDN aus dem Cache.
