'use strict';

// Einstiegspunkt für schreibgeschützte, serverlose Umgebungen (Vercel).
// Die Daten wurden beim Build erzeugt (scripts/build-data.js) und liegen im
// Deployment; zur Laufzeit wird nichts heruntergeladen oder geschrieben.
// Aktualisiert wird durch einen neuen Build (GitHub-Action alle 6 Stunden).

const path = require('path');
const config = require('./config');
const logger = require('./logger');
const { createApp } = require('./app');
const { Addon } = require('./stremio/addon');
const { MediathekRepository } = require('./mediathek/repository');
const { LiveTvProvider } = require('./live/livetv');
const { RadioProvider } = require('./live/radio');

const repository = new MediathekRepository();
const dbFile = path.join(config.APP_DB_DIR, 'app.db');
try {
    repository.open(dbFile);
} catch (error) {
    logger.error('Mediathek-Datenbank nicht im Deployment gefunden – wurde "npm run vercel-build" ausgeführt?', { dbFile, error: error.message });
}

const live = new LiveTvProvider();
const radio = new RadioProvider();
const addon = new Addon({ repository, live, radio });

module.exports = createApp({ addon, repository, live, radio });
