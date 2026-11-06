'use strict';

// Lesezugriff auf die App-Datenbank. Die Datenbank kann zur Laufzeit gegen
// eine frisch gebaute Datei ausgetauscht werden (swap), ohne den Server neu
// zu starten.

const Database = require('better-sqlite3');
const { SCHEMA_VERSION } = require('./schema');
const logger = require('../logger');

const MAX_LIMIT = 200;
const MAX_EPISODES = 1000;

class MediathekRepository {
    constructor() {
        this.db = null;
        this.file = null;
        this.statements = new Map();
        this.info = {};
    }

    get ready() {
        return this.db !== null;
    }

    /** Öffnet die angegebene Datei und schließt eine evtl. vorher geöffnete. */
    open(file) {
        const db = new Database(file, { readonly: true, fileMustExist: true });
        let info;
        try {
            info = Object.fromEntries(db.prepare('SELECT key, value FROM meta').all().map((r) => [r.key, r.value]));
        } catch (error) {
            db.close();
            throw new Error(`Ungültige App-Datenbank ${file}: ${error.message}`);
        }
        if (Number(info.schema_version) !== SCHEMA_VERSION) {
            db.close();
            throw new Error(`App-Datenbank hat Schema ${info.schema_version}, erwartet ${SCHEMA_VERSION}`);
        }
        db.pragma('cache_size = -32768');
        db.pragma('mmap_size = 268435456');

        const previous = this.db;
        this.db = db;
        this.file = file;
        this.info = info;
        this.statements = new Map();
        if (previous) previous.close();
        logger.info('App-Datenbank geöffnet', { file, items: info.items, built: info.built_at });
    }

    close() {
        if (this.db) this.db.close();
        this.db = null;
        this.file = null;
        this.statements = new Map();
    }

    _stmt(sql) {
        if (!this.db) throw new Error('Mediathek-Datenbank ist noch nicht verfügbar');
        let stmt = this.statements.get(sql);
        if (!stmt) {
            stmt = this.db.prepare(sql);
            this.statements.set(sql, stmt);
        }
        return stmt;
    }

    /**
     * Baut WHERE-Bedingungen für die gemeinsamen Filter.
     * @param {object} f  { channels?: string[], minDuration?: number (Sek.), excludeCategories?: string[] }
     */
    _filters(f, params, alias = 'i') {
        const where = [`${alias}.hidden = 0`];
        if (Array.isArray(f.channels) && f.channels.length) {
            where.push(`${alias}.channel IN (SELECT value FROM json_each(@channels))`);
            params.channels = JSON.stringify(f.channels);
        }
        if (f.minDuration > 0) {
            where.push(`${alias}.duration >= @minDuration`);
            params.minDuration = f.minDuration;
        }
        if (Array.isArray(f.excludeCategories) && f.excludeCategories.length) {
            where.push(`${alias}.category NOT IN (SELECT value FROM json_each(@excludeCategories))`);
            params.excludeCategories = JSON.stringify(f.excludeCategories);
        }
        return where;
    }

    static _page(f, params) {
        params.limit = Math.min(Math.max(Number(f.limit) || 100, 1), MAX_LIMIT);
        params.skip = Math.max(Number(f.skip) || 0, 0);
    }

    /** Neueste Einträge (bereits ausgestrahlt). */
    latest(f = {}) {
        const params = { now: Math.floor(Date.now() / 1000) };
        const where = this._filters(f, params);
        where.push('i.aired <= @now');
        if (f.category) {
            where.push('i.category = @category');
            params.category = f.category;
        }
        MediathekRepository._page(f, params);
        return this._stmt(`
            SELECT i.* FROM items i
            WHERE ${where.join(' AND ')}
            ORDER BY i.aired DESC
            LIMIT @limit OFFSET @skip
        `).all(params);
    }

    /** Einträge einer Kategorie, neueste zuerst. */
    byCategory(category, f = {}) {
        return this.latest({ ...f, category });
    }

    /** Volltextsuche über Titel, Sendung und Sender. */
    search(query, f = {}) {
        // Exakte Wörter bevorzugen; nur wenn es dafür gar keinen Treffer gibt,
        // auf Präfix-Suche ausweichen – für alle Seiten gleich entscheiden.
        const exact = toFtsQuery(query, false);
        const hasExact = this._search(exact, { ...f, skip: 0, limit: 1 }).length > 0;
        return this._search(hasExact ? exact : toFtsQuery(query, true), f);
    }

    _search(match, f) {
        if (!match) return [];
        const params = { match };
        const where = this._filters(f, params);
        MediathekRepository._page(f, params);
        return this._stmt(`
            SELECT i.* FROM items_fts
            JOIN items i ON i.rowid = items_fts.rowid
            WHERE items_fts MATCH @match AND ${where.join(' AND ')}
            ORDER BY items_fts.rank, i.aired DESC
            LIMIT @limit OFFSET @skip
        `).all(params);
    }

    /** Sendungen (Serien) – nach letzter Ausstrahlung oder Suchrelevanz. */
    shows(f = {}) {
        const params = {};
        const where = ['s.episodes >= @minEpisodes', 's.generic = 0'];
        params.minEpisodes = f.minEpisodes ?? 2;
        if (Array.isArray(f.channels) && f.channels.length) {
            where.push('s.channel IN (SELECT value FROM json_each(@channels))');
            params.channels = JSON.stringify(f.channels);
        }
        if (f.category) {
            where.push('s.category = @category');
            params.category = f.category;
        } else if (Array.isArray(f.excludeCategories) && f.excludeCategories.length) {
            where.push('s.category NOT IN (SELECT value FROM json_each(@excludeCategories))');
            params.excludeCategories = JSON.stringify(f.excludeCategories);
        }
        MediathekRepository._page(f, params);

        if (f.search) {
            const match = toFtsQuery(f.search, true);
            if (!match) return [];
            params.match = match;
            return this._stmt(`
                SELECT s.* FROM shows_fts
                JOIN shows s ON s.rowid = shows_fts.rowid
                WHERE shows_fts MATCH @match AND ${where.join(' AND ')}
                ORDER BY shows_fts.rank, s.recent DESC, s.latest DESC
                LIMIT @limit OFFSET @skip
            `).all(params);
        }
        return this._stmt(`
            SELECT s.* FROM shows s
            WHERE ${where.join(' AND ')}
            ORDER BY s.recent DESC, s.latest DESC
            LIMIT @limit OFFSET @skip
        `).all(params);
    }

    show(id) {
        return this._stmt('SELECT * FROM shows WHERE id = ?').get(id) || null;
    }

    episodes(showId, limit = MAX_EPISODES) {
        return this._stmt(`
            SELECT * FROM items
            WHERE show_id = ? AND hidden = 0
            ORDER BY aired DESC
            LIMIT ?
        `).all(showId, Math.min(limit, MAX_EPISODES));
    }

    item(id) {
        return this._stmt('SELECT * FROM items WHERE id = ?').get(id) || null;
    }

    /** Alternative Fassungen (Audiodeskription, Gebärdensprache, …) zu einem Eintrag. */
    variants(item) {
        const base = item.base_title || item.title;
        return this._stmt(`
            SELECT * FROM items
            WHERE show_id = @showId AND id <> @id
              AND (base_title = @base OR (title = @base AND @isVariant = 1))
            ORDER BY variant
        `).all({ showId: item.show_id, id: item.id, base, isVariant: item.variant ? 1 : 0 });
    }

    stats() {
        if (!this.db) return null;
        return {
            file: this.file ? require('path').basename(this.file) : null,
            builtAt: this.info.built_at || null,
            sourceModified: this.info.source_modified || null,
            items: Number(this.info.items) || 0,
            shows: Number(this.info.shows) || 0
        };
    }

    channelCounts() {
        return this._stmt('SELECT channel, COUNT(*) AS n FROM items WHERE hidden = 0 GROUP BY channel ORDER BY n DESC').all();
    }
}

/**
 * Wandelt eine Benutzereingabe in eine sichere FTS5-Abfrage um: jedes Wort
 * wird in Anführungszeichen gesetzt (optional als Präfix-Term) und UND-verknüpft.
 */
function toFtsQuery(input, prefix = true) {
    if (!input) return null;
    const tokens = String(input)
        .normalize('NFC')
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .slice(0, 8);
    if (!tokens.length) return null;
    return tokens.map((t) => `"${t}"${prefix ? '*' : ''}`).join(' ');
}

module.exports = { MediathekRepository, toFtsQuery };
