'use strict';

// Zentrale Laufzeit-Konfiguration (ausschließlich über Umgebungsvariablen).

const path = require('path');

function int(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : fallback;
}

function bool(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

const PORT = int('PORT', 7005);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));

module.exports = {
    PORT,
    // Öffentliche URL des Add-ons (ohne Slash am Ende). Wird nur für Links auf
    // Landing-/Konfig-Seite benötigt; Manifest-URLs werden aus dem Request abgeleitet.
    BASE_URL: (process.env.BASE_URL || '').replace(/\/+$/, ''),

    DATA_DIR,
    APP_DB_DIR: path.join(DATA_DIR, 'app'),
    TMP_DIR: path.join(DATA_DIR, 'tmp'),
    CACHE_DIR: path.join(DATA_DIR, 'cache'),
    STATE_FILE: path.join(DATA_DIR, 'state.json'),

    // MediathekView-Filmliste (SQLite, bz2-komprimiert)
    SOURCE_URL: process.env.SOURCE_URL || 'https://liste.mediathekview.de/filmliste-v2.db.bz2',

    // Automatische Aktualisierung im Server-Prozess
    UPDATE_INTERVAL_HOURS: int('UPDATE_INTERVAL_HOURS', 6),
    UPDATE_ON_START: bool('UPDATE_ON_START', true),

    // Optionaler Token für POST /admin/update
    ADMIN_TOKEN: process.env.ADMIN_TOKEN || '',

    // Optionaler Spenden-/Support-Link (Ko-fi, PayPal, GitHub Sponsors, …)
    DONATION_URL: process.env.DONATION_URL || '',

    // Optional: TMDB API-Key für Poster von Sendungen/Spielfilmen
    TMDB_API_KEY: process.env.TMDB_API_KEY || '',
    TMDB_MAX_LOOKUPS: int('TMDB_MAX_LOOKUPS', 1500),
    ARTWORK_CACHE_FILE: process.env.ARTWORK_CACHE_FILE || path.join(DATA_DIR, 'cache', 'artwork.db'),

    // true = nur lesen (z.B. Vercel): keine Updates/Refreshes im laufenden Betrieb
    READ_ONLY: bool('READ_ONLY', false),

    // Seitengröße der Kataloge (Stremio lädt die nächste Seite per skip)
    PAGE_SIZE: 100,

    // Cache-Dauern (Sekunden) für Stremio-Antworten
    CACHE: {
        CATALOG: 60 * 60,
        CATALOG_NEW: 15 * 60,
        META: 6 * 60 * 60,
        STREAM: 60 * 60,
        LIVE: 30 * 60
    },

    LIVE_REFRESH_HOURS: int('LIVE_REFRESH_HOURS', 12),
    HTTP_USER_AGENT: 'stremio-mediathek-addon/3 (+https://github.com/Hamido212/stremio-mediathekde-addon)'
};
