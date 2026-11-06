'use strict';

// Baut aus der MediathekView-Datenbank (filmliste-v2.db) eine neue,
// für Stremio-Abfragen optimierte App-Datenbank.
//
// Der Import läuft komplett in SQLite (ATTACH + INSERT … SELECT); nur
// Normalisierung/Klassifizierung sind als JS-Funktionen registriert.
// Ergebnis: ~700k Einträge in typischerweise unter einer Minute.

const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { SCHEMA_VERSION, CREATE_TABLES, CREATE_INDEXES, CREATE_FTS } = require('./schema');
const { detectVariant } = require('./variants');
const { isGenericShow } = require('./shows');
const { normalizeChannel } = require('./channels');
const { classify } = require('./categories');
const { encodeRelative, normalizeUrl } = require('./urls');
const logger = require('../logger');

const MAX_DESCRIPTION = 2000;

function showKey(channel, show) {
    const hash = crypto.createHash('sha1').update(`${channel}|${(show || '').trim().toLowerCase()}`).digest('hex');
    return hash.slice(0, 20);
}

function removeIfExists(file) {
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
        try { fs.unlinkSync(file + suffix); } catch { /* existiert nicht */ }
    }
}

/**
 * @param {object} opts
 * @param {string} opts.sourcePath  Pfad zur entpackten filmliste-v2.db
 * @param {string} opts.targetPath  Pfad der neu zu erzeugenden App-DB
 * @param {object} [opts.info]      Zusätzliche Metadaten (z.B. Quelle, ETag)
 * @param {number} [opts.now]       Referenzzeit (Sekunden) – für Tests
 */
function buildAppDb({ sourcePath, targetPath, info = {}, now = Math.floor(Date.now() / 1000) }) {
    const started = Date.now();
    removeIfExists(targetPath);

    const db = new Database(targetPath);
    try {
        db.pragma('journal_mode = OFF');
        db.pragma('synchronous = OFF');
        db.pragma('temp_store = MEMORY');
        db.pragma('cache_size = -65536');

        db.exec(CREATE_TABLES);

        const maxAired = now + 365 * 24 * 3600;
        db.function('mvw_channel', { deterministic: true }, (name) => normalizeChannel(name));
        db.function('mvw_show_key', { deterministic: true }, (channel, show) => showKey(channel, show));
        db.function('mvw_classify', { deterministic: true }, (channel, show, title, duration) =>
            classify({ channel, show, title, duration }));
        db.function('mvw_rel', { deterministic: true }, (base, url) => encodeRelative(base, url));
        db.function('mvw_url', { deterministic: true }, (url) => normalizeUrl(url));
        db.function('mvw_variant', { deterministic: true }, (title) => detectVariant(title)?.variant ?? null);
        db.function('mvw_base_title', { deterministic: true }, (title) => detectVariant(title)?.baseTitle ?? null);
        db.function('mvw_generic_show', { deterministic: true }, (channel, name) => (isGenericShow(channel, name) ? 1 : 0));
        db.function('mvw_text', { deterministic: true }, (text) => {
            if (!text) return null;
            const clean = String(text).replace(/\s+/g, ' ').trim();
            if (!clean) return null;
            return clean.length > MAX_DESCRIPTION ? clean.slice(0, MAX_DESCRIPTION - 1) + '…' : clean;
        });

        db.prepare('ATTACH DATABASE ? AS src').run(sourcePath);

        const insert = db.prepare(`
            INSERT OR IGNORE INTO items
                (id, show_id, channel, show, title, description, aired, duration, category,
                 variant, base_title, website, url, url_hd, url_low, url_sub)
            SELECT
                f.idhash,
                mvw_show_key(c.name, s.show),
                c.name,
                NULLIF(TRIM(s.show), ''),
                TRIM(f.title),
                mvw_text(f.description),
                CASE WHEN f.aired IS NULL OR f.aired > @maxAired THEN NULL ELSE f.aired END,
                NULLIF(f.duration, 0),
                mvw_classify(c.name, s.show, f.title, f.duration),
                mvw_variant(TRIM(f.title)),
                mvw_base_title(TRIM(f.title)),
                mvw_url(f.website),
                mvw_url(f.url_video),
                mvw_rel(mvw_url(f.url_video), f.url_video_hd),
                mvw_rel(mvw_url(f.url_video), f.url_video_sd),
                mvw_url(f.url_sub)
            FROM src.film f
            JOIN src.show s ON s.id = f.showid
            JOIN (SELECT id, mvw_channel(channel) AS name FROM src.channel) c ON c.id = f.channelid
            WHERE f.url_video IS NOT NULL AND TRIM(f.url_video) <> ''
              AND f.title IS NOT NULL AND TRIM(f.title) <> ''
        `);

        const result = db.transaction(() => insert.run({ maxAired }))();
        logger.info('Mediathek-Einträge importiert', { rows: result.changes });

        db.exec('DETACH DATABASE src');

        db.exec(CREATE_INDEXES);

        // Varianten ausblenden, wenn es die Hauptfassung ebenfalls gibt
        const hidden = db.prepare(`
            UPDATE items SET hidden = 1
            WHERE variant IS NOT NULL AND EXISTS (
                SELECT 1 FROM items b WHERE b.show_id = items.show_id AND b.title = items.base_title
            )
        `).run().changes;

        // Index wurde nur für die Varianten-Erkennung gebraucht (spart ~50 MB)
        db.exec('DROP INDEX idx_items_show_title');

        db.exec(`
            INSERT INTO shows (id, channel, name, generic, episodes, recent, latest, first)
            SELECT show_id, channel, COALESCE(show, title), mvw_generic_show(channel, show), COUNT(*),
                   COALESCE(SUM(aired >= ${now - 30 * 24 * 3600} AND aired <= ${now}), 0), MAX(aired), MIN(aired)
            FROM items
            WHERE hidden = 0
            GROUP BY show_id;
        `);

        // Kategorie einer Sendung = häufigste Kategorie ihrer Folgen
        db.exec(`
            UPDATE shows SET category = (
                SELECT category FROM items i
                WHERE i.show_id = shows.id
                GROUP BY category ORDER BY COUNT(*) DESC LIMIT 1
            );
        `);

        db.exec(CREATE_FTS);

        const counts = {
            items: db.prepare('SELECT COUNT(*) AS n FROM items').get().n,
            variants: hidden,
            shows: db.prepare('SELECT COUNT(*) AS n FROM shows').get().n
        };

        const setMeta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
        const metaEntries = {
            schema_version: String(SCHEMA_VERSION),
            built_at: new Date().toISOString(),
            items: String(counts.items),
            shows: String(counts.shows),
            ...Object.fromEntries(Object.entries(info).map(([k, v]) => [k, v == null ? null : String(v)]))
        };
        db.transaction(() => {
            for (const [key, value] of Object.entries(metaEntries)) setMeta.run(key, value);
        })();

        db.exec('ANALYZE');
        db.pragma('journal_mode = DELETE');

        const seconds = Math.round((Date.now() - started) / 100) / 10;
        logger.info('App-Datenbank erstellt', { ...counts, seconds, targetPath });
        return { ...counts, seconds };
    } finally {
        db.close();
    }
}

module.exports = { buildAppDb, showKey };
