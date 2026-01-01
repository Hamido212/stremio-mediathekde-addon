// App-DB Client - Verwaltung der optimierten SQLite-Datenbank

const Database = require('better-sqlite3');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

class AppDB {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = null;
    }

    /**
     * Öffnet/erstellt die Datenbank
     */
    open() {
        try {
            // Ensure directory exists
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            this.db = new Database(this.dbPath);
            this.db.pragma('journal_mode = WAL');
            logger.info('App-DB geöffnet', { dbPath: this.dbPath });
        } catch (error) {
            logger.error('App-DB öffnen fehlgeschlagen', {
                dbPath: this.dbPath,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Schließt die Datenbank
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }

    /**
     * Erstellt das Schema
     */
    createSchema() {
        const sql = `
            CREATE TABLE IF NOT EXISTS items (
                id TEXT PRIMARY KEY,
                type TEXT DEFAULT 'movie',
                title TEXT NOT NULL,
                channel TEXT,
                topic TEXT,
                description TEXT,
                date_ts INTEGER,
                duration_sec INTEGER,
                url_video TEXT,
                url_website TEXT,
                is_hd INTEGER DEFAULT 0,
                has_subtitles INTEGER DEFAULT 0,
                category TEXT,
                poster TEXT,
                created_at INTEGER DEFAULT (unixepoch()),
                updated_at INTEGER DEFAULT (unixepoch())
            );

            CREATE INDEX IF NOT EXISTS idx_items_date ON items(date_ts DESC);
            CREATE INDEX IF NOT EXISTS idx_items_channel ON items(channel);
            CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
            CREATE INDEX IF NOT EXISTS idx_items_channel_date ON items(channel, date_ts DESC);

            CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
                title,
                channel,
                topic,
                description,
                content='items',
                content_rowid='rowid'
            );

            CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
                INSERT INTO items_fts(rowid, title, channel, topic, description)
                VALUES (new.rowid, new.title, new.channel, new.topic, new.description);
            END;

            CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
                INSERT INTO items_fts(items_fts, rowid, title, channel, topic, description)
                VALUES ('delete', old.rowid, old.title, old.channel, old.topic, old.description);
            END;

            CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
                INSERT INTO items_fts(items_fts, rowid, title, channel, topic, description)
                VALUES ('delete', old.rowid, old.title, old.channel, old.topic, old.description);
                INSERT INTO items_fts(rowid, title, channel, topic, description)
                VALUES (new.rowid, new.title, new.channel, new.topic, new.description);
            END;
        `;

        this.db.exec(sql);
        logger.info('App-DB Schema erstellt');
    }

    /**
     * Generiert stabile ID aus Item-Daten
     */
    static generateId(channel, url_website, url_video, title, date_ts) {
        const data = `${channel}|${url_website || url_video}|${title}|${date_ts}`;
        const hash = crypto.createHash('sha1').update(data).digest('hex');
        return `de-mvw:${hash}`;
    }

    /**
     * Fügt Item ein (oder update bei Konflikt)
     */
    insertItem(item) {
        const stmt = this.db.prepare(`
            INSERT INTO items (
                id, type, title, channel, topic, description,
                date_ts, duration_sec, url_video, url_website,
                is_hd, has_subtitles, category, poster
            ) VALUES (
                @id, @type, @title, @channel, @topic, @description,
                @date_ts, @duration_sec, @url_video, @url_website,
                @is_hd, @has_subtitles, @category, @poster
            )
            ON CONFLICT(id) DO UPDATE SET
                updated_at = unixepoch()
        `);

        stmt.run(item);
    }

    /**
     * Bulk-Insert mit Transaction
     */
    insertBulk(items, batchSize = 1000) {
        const stmt = this.db.prepare(`
            INSERT INTO items (
                id, type, title, channel, topic, description,
                date_ts, duration_sec, url_video, url_website,
                is_hd, has_subtitles, category, poster
            ) VALUES (
                @id, @type, @title, @channel, @topic, @description,
                @date_ts, @duration_sec, @url_video, @url_website,
                @is_hd, @has_subtitles, @category, @poster
            )
            ON CONFLICT(id) DO UPDATE SET
                updated_at = unixepoch()
        `);

        const insertMany = this.db.transaction((items) => {
            for (const item of items) {
                stmt.run(item);
            }
        });

        // Batch-Verarbeitung
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            insertMany(batch);
            
            if (i % 10000 === 0) {
                logger.info(`Import Fortschritt: ${i}/${items.length}`);
            }
        }

        logger.info('Bulk-Insert abgeschlossen', { count: items.length });
    }

    /**
     * Löscht alte Items (älter als maxAgeDays)
     */
    deleteOldItems(maxAgeDays = 90) {
        const cutoff = Math.floor(Date.now() / 1000) - (maxAgeDays * 24 * 60 * 60);
        
        const result = this.db.prepare(`
            DELETE FROM items WHERE date_ts < ?
        `).run(cutoff);

        logger.info('Alte Items gelöscht', {
            maxAgeDays,
            deleted: result.changes
        });

        return result.changes;
    }

    /**
     * Gibt DB-Statistiken zurück
     */
    getStats() {
        const totalCount = this.db.prepare('SELECT COUNT(*) as count FROM items').get();
        const maxDate = this.db.prepare('SELECT MAX(date_ts) as maxDate FROM items').get();
        
        const byCategory = this.db.prepare(`
            SELECT category, COUNT(*) as count 
            FROM items 
            WHERE category IS NOT NULL
            GROUP BY category
        `).all();

        const byChannel = this.db.prepare(`
            SELECT channel, COUNT(*) as count 
            FROM items 
            GROUP BY channel 
            ORDER BY count DESC 
            LIMIT 10
        `).all();

        return {
            totalCount: totalCount.count,
            maxDate: maxDate.maxDate,
            byCategory,
            byChannel
        };
    }
}

module.exports = AppDB;
