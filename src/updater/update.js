'use strict';

// Ein Update-Durchlauf: Download → Entpacken → neue App-DB bauen →
// (optional) Poster anreichern → state.json auf neue Datei umstellen.
// Der laufende Server erkennt die neue Datei und wechselt ohne Neustart.

const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../logger');
const { download, decompressBz2 } = require('./downloader');
const { readState, writeState, currentDbPath } = require('./state');
const { acquireLock, lockHolder } = require('./lock');
const { buildAppDb } = require('../mediathek/builder');

function safeUnlink(file) {
    try { fs.unlinkSync(file); } catch { /* egal */ }
}

/**
 * Löscht alte App-DBs (alles außer den übergebenen Dateien). Läuft gerade
 * ein Update, wird nichts gelöscht – dessen neue Datei steht evtl. noch
 * nicht in state.json.
 */
function cleanupAppDbs(keep = []) {
    if (!fs.existsSync(config.APP_DB_DIR)) return;
    const holder = lockHolder();
    if (holder && holder !== process.pid) return;
    const keepNames = new Set(keep.filter(Boolean).map((f) => path.basename(f)));
    for (const name of fs.readdirSync(config.APP_DB_DIR)) {
        if (/^app-\d+\.db(\.building)?$/.test(name) && !keepNames.has(name)) {
            safeUnlink(path.join(config.APP_DB_DIR, name));
        }
    }
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.force]  Download auch bei unveränderter Liste erzwingen
 * @returns {Promise<{updated: boolean, file?: string, reason?: string, stats?: object}>}
 */
async function runUpdate({ force = false } = {}) {
    const release = acquireLock();
    if (!release) {
        logger.warn('Es läuft bereits ein Update – breche ab', { pid: lockHolder() });
        return { updated: false, reason: 'locked' };
    }

    const state = readState();
    const existing = currentDbPath(state);
    const runId = Date.now();
    const bz2Path = path.join(config.TMP_DIR, `filmliste-${runId}.db.bz2`);
    const sourcePath = path.join(config.TMP_DIR, `filmliste-${runId}.db`);
    const fileName = `app-${runId}.db`;
    const target = path.join(config.APP_DB_DIR, fileName);
    const buildTarget = `${target}.building`;

    try {
        writeState({ lastAttempt: new Date().toISOString() });
        fs.mkdirSync(config.TMP_DIR, { recursive: true });
        fs.mkdirSync(config.APP_DB_DIR, { recursive: true });
        // Reste abgebrochener Läufe entfernen (wir halten die Sperre)
        for (const name of fs.readdirSync(config.TMP_DIR)) safeUnlink(path.join(config.TMP_DIR, name));

        const started = Date.now();
        logger.info('Update gestartet', { source: config.SOURCE_URL, force });

        const conditional = !force && existing ? { etag: state.etag, lastModified: state.lastModified } : {};
        const dl = await download(config.SOURCE_URL, bz2Path, conditional);
        if (dl.notModified) {
            logger.info('Filmliste unverändert – kein Update nötig');
            writeState({ lastSuccess: new Date().toISOString(), lastError: null });
            return { updated: false, reason: 'not_modified', file: existing };
        }
        logger.info('Filmliste heruntergeladen', { sizeMB: Math.round(dl.size / 1048576) });

        await decompressBz2(bz2Path, sourcePath);
        safeUnlink(bz2Path);

        const stats = buildAppDb({
            sourcePath,
            targetPath: buildTarget,
            info: { source_url: config.SOURCE_URL, source_modified: dl.lastModified, source_etag: dl.etag }
        });
        safeUnlink(sourcePath);

        if (config.TMDB_API_KEY) {
            try {
                const { enrichArtwork } = require('../artwork/enrich');
                stats.artwork = await enrichArtwork(buildTarget);
            } catch (error) {
                logger.warn('Poster-Anreicherung fehlgeschlagen (Update läuft weiter)', { error: error.message });
            }
        }

        fs.renameSync(buildTarget, target);
        writeState({
            currentDb: fileName,
            etag: dl.etag,
            lastModified: dl.lastModified,
            lastSuccess: new Date().toISOString(),
            lastError: null,
            stats
        });
        // Vorherige DB bleibt bestehen, bis der Server umgeschaltet hat
        cleanupAppDbs([fileName, existing]);

        logger.info('Update abgeschlossen', { file: fileName, ...stats, totalSeconds: Math.round((Date.now() - started) / 1000) });
        return { updated: true, file: target, stats };
    } catch (error) {
        logger.error('Update fehlgeschlagen', { error: error.message });
        try {
            writeState({ lastError: `${new Date().toISOString()}: ${error.message}` });
        } catch { /* z.B. fehlende Schreibrechte – Fehler oben ist aussagekräftiger */ }
        throw error;
    } finally {
        for (const file of [bz2Path, sourcePath, buildTarget]) {
            safeUnlink(file);
            safeUnlink(`${file}.part`);
        }
        release();
    }
}

module.exports = { runUpdate, cleanupAppDbs };
