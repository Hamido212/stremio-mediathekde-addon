'use strict';

// Persistenter Updater-Zustand (data/state.json).

const fs = require('fs');
const path = require('path');
const config = require('../config');

const DEFAULT_STATE = {
    currentDb: null,       // Dateiname der aktiven App-DB (relativ zu data/app)
    etag: null,
    lastModified: null,
    lastSuccess: null,     // ISO-Zeitpunkt
    lastAttempt: null,
    lastError: null,
    stats: null
};

function readState(file = config.STATE_FILE) {
    try {
        return { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch {
        return { ...DEFAULT_STATE };
    }
}

function writeState(patch, file = config.STATE_FILE) {
    const next = { ...readState(file), ...patch };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, file);
    return next;
}

function currentDbPath(state = readState()) {
    if (!state.currentDb) return null;
    const file = path.join(config.APP_DB_DIR, path.basename(state.currentDb));
    return fs.existsSync(file) ? file : null;
}

module.exports = { readState, writeState, currentDbPath };
