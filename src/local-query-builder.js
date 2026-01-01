// Query-Builder für lokale SQLite Queries

const Database = require('better-sqlite3');
const path = require('path');
const logger = require('./logger');
const config = require('./config');

class LocalQueryBuilder {
    constructor(dbPath) {
        this.dbPath = dbPath || path.join(process.cwd(), 'data', 'app', 'app.db');
        this.db = null;
    }

    /**
     * Öffnet DB (lazy)
     */
    _getDb() {
        if (!this.db) {
            this.db = new Database(this.dbPath, { readonly: true });
            this.db.pragma('query_only = ON');
        }
        return this.db;
    }

    /**
     * Catalog Query - Neue Inhalte (7 Tage)
     */
    queryCatalogNew(filters = {}) {
        const db = this._getDb();
        
        const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
        const limit = filters.limit || 20;
        const skip = filters.skip || 0;

        let sql = 'SELECT * FROM items WHERE date_ts >= ?';
        const params = [sevenDaysAgo];

        // Genre-Filter (Sender oder Kategorie)
        if (filters.genre) {
            if (this._isSender(filters.genre)) {
                sql += ' AND channel = ?';
                params.push(filters.genre);
            } else {
                sql += ' AND category = ?';
                params.push(filters.genre);
            }
        }

        sql += ' ORDER BY date_ts DESC LIMIT ? OFFSET ?';
        params.push(limit, skip);

        return db.prepare(sql).all(...params);
    }

    /**
     * Catalog Query - Nach Kategorie
     */
    queryCatalogByCategory(category, filters = {}) {
        const db = this._getDb();
        
        const limit = filters.limit || 20;
        const skip = filters.skip || 0;

        let sql = 'SELECT * FROM items WHERE category = ?';
        const params = [category];

        // Genre-Filter zusätzlich
        if (filters.genre) {
            if (this._isSender(filters.genre)) {
                sql += ' AND channel = ?';
                params.push(filters.genre);
            }
        }

        sql += ' ORDER BY date_ts DESC LIMIT ? OFFSET ?';
        params.push(limit, skip);

        return db.prepare(sql).all(...params);
    }

    /**
     * Catalog Query - Nach Sender
     */
    queryCatalogBySender(sender, filters = {}) {
        const db = this._getDb();
        
        const limit = filters.limit || 20;
        const skip = filters.skip || 0;

        let sql = 'SELECT * FROM items WHERE channel = ?';
        const params = [sender];

        sql += ' ORDER BY date_ts DESC LIMIT ? OFFSET ?';
        params.push(limit, skip);

        return db.prepare(sql).all(...params);
    }

    /**
     * Search Query (FTS5)
     */
    querySearch(searchTerm, filters = {}) {
        const db = this._getDb();
        
        const limit = filters.limit || 20;
        const skip = filters.skip || 0;

        // FTS-Query sanitizen
        const sanitized = this._sanitizeFtsQuery(searchTerm);

        let sql = `
            SELECT items.* 
            FROM items_fts
            JOIN items ON items.rowid = items_fts.rowid
            WHERE items_fts MATCH ?
        `;
        const params = [sanitized];

        // Genre-Filter
        if (filters.genre) {
            if (this._isSender(filters.genre)) {
                sql += ' AND items.channel = ?';
                params.push(filters.genre);
            } else {
                sql += ' AND items.category = ?';
                params.push(filters.genre);
            }
        }

        sql += ' ORDER BY bm25(items_fts), items.date_ts DESC LIMIT ? OFFSET ?';
        params.push(limit, skip);

        return db.prepare(sql).all(...params);
    }

    /**
     * Meta Query - Item by ID
     */
    queryMeta(id) {
        const db = this._getDb();
        return db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    }

    /**
     * Stats Query
     */
    queryStats() {
        const db = this._getDb();
        
        const totalCount = db.prepare('SELECT COUNT(*) as count FROM items').get();
        const maxDate = db.prepare('SELECT MAX(date_ts) as maxDate FROM items').get();
        
        return {
            totalCount: totalCount.count,
            maxDate: maxDate.maxDate,
            lastUpdate: maxDate.maxDate ? new Date(maxDate.maxDate * 1000).toISOString() : null
        };
    }

    /**
     * Prüft ob Genre ein Sender ist
     */
    _isSender(genre) {
        const senders = ['ARD', 'ZDF', 'arte', '3sat', 'WDR', 'NDR', 'BR', 'SWR', 'MDR', 'HR', 'RBB', 'KiKA', 'phoenix', 'ZDFinfo', 'ZDFneo'];
        return senders.includes(genre);
    }

    /**
     * Sanitize FTS Query
     */
    _sanitizeFtsQuery(query) {
        // Entferne gefährliche Zeichen
        let sanitized = query.replace(/[^\w\säöüÄÖÜß-]/g, ' ');
        
        // Split in Tokens
        const tokens = sanitized.trim().split(/\s+/).filter(t => t.length > 0);
        
        // Baue FTS-Query (mit OR)
        return tokens.join(' OR ');
    }

    /**
     * Close DB
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

module.exports = LocalQueryBuilder;
