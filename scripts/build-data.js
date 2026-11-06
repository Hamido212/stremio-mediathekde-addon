#!/usr/bin/env node
'use strict';

// Baut das Datenverzeichnis für schreibgeschützte Deployments (Vercel):
//   .data/app/app.db          Mediathek (MediathekView-Filmliste)
//   .data/cache/live-tv.json  Live-TV-Sender inkl. geprüfter Streams
//   .data/cache/radio.json    Radiosender
//
// Läuft auf dem Vercel-Build-Server (npm run vercel-build). Eine GitHub-Action
// stößt alle 6 Stunden einen neuen Build an, damit die Daten aktuell bleiben.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
process.env.DATA_DIR = process.env.DATA_DIR || path.join(root, '.data');
// TMDB-Cache außerhalb des Deployments, im Build-Cache von Vercel (bleibt zwischen Builds erhalten)
process.env.ARTWORK_CACHE_FILE = process.env.ARTWORK_CACHE_FILE
    || path.join(root, 'node_modules', '.cache', 'mediathek', 'artwork.db');

const config = require('../src/config');
const logger = require('../src/logger');
const { runUpdate } = require('../src/updater/update');
const { LiveTvProvider } = require('../src/live/livetv');
const { RadioProvider } = require('../src/live/radio');

const mb = (file) => `${Math.round(fs.statSync(file).size / 1048576)} MB`;

async function main() {
    const started = Date.now();
    fs.rmSync(config.DATA_DIR, { recursive: true, force: true });

    const result = await runUpdate({ force: true });
    if (!result.updated || !result.file) throw new Error(`Mediathek-Import fehlgeschlagen: ${result.reason || 'unbekannt'}`);
    const dbFile = path.join(config.APP_DB_DIR, 'app.db');
    fs.renameSync(result.file, dbFile);

    const live = new LiveTvProvider();
    await live.refresh();
    const radio = new RadioProvider();
    await radio.refresh();
    if (!radio.stations.length) logger.warn('Keine Radiosender geladen – Radio-Kataloge bleiben in diesem Deployment leer');

    // Nur die Daten bleiben übrig, die die Funktion zur Laufzeit liest
    for (const name of ['tmp', 'state.json', 'update.lock']) {
        fs.rmSync(path.join(config.DATA_DIR, name), { recursive: true, force: true });
    }

    logger.info('Daten für das Deployment gebaut', {
        db: mb(dbFile),
        items: result.stats.items,
        liveChannels: live.stats().channels,
        radioStations: radio.stats().stations,
        seconds: Math.round((Date.now() - started) / 1000)
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
