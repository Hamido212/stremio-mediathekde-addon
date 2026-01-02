// Importer - Importiert von Source-DB nach App-DB

const Database = require('better-sqlite3');
const DBInspector = require('./inspector');
const Classifier = require('./classifier');
const AppDB = require('./app-db');
const logger = require('../logger');
const senderLogos = require('../sender-logos');

// MediathekView Channel ID → Name Mapping
const CHANNEL_ID_MAP = {
    1: 'ARD',
    2: 'ZDF',
    3: 'arte',
    4: '3sat',
    5: 'BR',
    6: 'HR',
    7: 'MDR',
    8: 'NDR',
    9: 'Radio Bremen TV',
    10: 'RBB',
    11: 'SR',
    12: 'SWR',
    13: 'WDR',
    14: 'KIKA',
    15: 'Phoenix',
    16: 'tagesschau24',
    17: 'ARD-alpha',
    18: 'ONE',
    19: 'ZDFneo',
    20: 'ZDFinfo',
    21: 'Funk',
    22: 'DW (Deutsch)',
    23: 'ORF',
    24: 'SRF',
    25: 'rbtv',
    26: 'ServusTV',
    27: 'KabelEins',
    28: 'Sport1',
    29: 'Eurosport',
    30: 'DW (English)'
};

class Importer {
    constructor(sourceDbPath, appDbPath, categoriesConfigPath) {
        this.sourceDbPath = sourceDbPath;
        this.appDbPath = appDbPath;
        this.classifier = new Classifier(categoriesConfigPath);
    }

    /**
     * Führt Import durch
     */
    async import() {
        const startTime = Date.now();
        
        try {
            // 1. Inspiziere Source-DB
            logger.info('Inspiziere Source-DB...', { path: this.sourceDbPath });
            const schema = DBInspector.inspect(this.sourceDbPath);
            
            const mainTable = DBInspector._guessMainTable(schema);
            if (!mainTable) {
                throw new Error('Keine Haupttabelle in Source-DB gefunden');
            }

            logger.info('Source-DB Schema erkannt', {
                mainTable,
                rowCount: schema.rowCounts[mainTable],
                columns: schema.tables[mainTable].columns.length
            });

            // 2. Öffne DBs
            const sourceDb = new Database(this.sourceDbPath, { readonly: true });
            const appDb = new AppDB(this.appDbPath);
            appDb.open();
            appDb.createSchema();

            // 3. Column-Mapping definieren
            const columnMapping = this._detectColumnMapping(schema.tables[mainTable].columns);
            logger.info('Column-Mapping erkannt', columnMapping);

            // 4. SELECT-Query bauen
            const selectSql = this._buildSelectQuery(mainTable, columnMapping);
            
            // 5. Import ausführen
            logger.info('Import gestartet...');
            const items = [];
            const stmt = sourceDb.prepare(selectSql);
            
            for (const row of stmt.iterate()) {
                const item = this._transformRow(row, columnMapping);
                if (item) {
                    items.push(item);
                }

                // Batch Insert alle 5000 Items
                if (items.length >= 5000) {
                    appDb.insertBulk(items);
                    items.length = 0;
                }
            }

            // Rest einfügen
            if (items.length > 0) {
                appDb.insertBulk(items);
            }

            // 6. Cleanup (alte Items löschen)
            const deleted = appDb.deleteOldItems(90);

            // 7. Stats
            const stats = appDb.getStats();

            sourceDb.close();
            appDb.close();

            const duration = Math.round((Date.now() - startTime) / 1000);

            logger.info('Import abgeschlossen', {
                duration: `${duration}s`,
                imported: stats.totalCount,
                deleted,
                maxDate: stats.maxDate
            });

            return {
                success: true,
                duration,
                stats
            };

        } catch (error) {
            logger.error('Import fehlgeschlagen', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Erkennt Column-Mapping aus Schema
     */
    _detectColumnMapping(columns) {
        const columnNames = columns.map(c => c.name.toLowerCase());
        
        const mapping = {
            title: this._findColumn(columnNames, ['title', 'titel', 'thema']),
            channel: this._findColumn(columnNames, ['channel', 'sender', 'channelid']),
            topic: this._findColumn(columnNames, ['topic', 'thema', 'showid']),
            description: this._findColumn(columnNames, ['description', 'beschreibung']),
            date_ts: this._findColumn(columnNames, ['aired', 'timestamp', 'datum', 'date', 'zeit', 'time']),
            duration: this._findColumn(columnNames, ['duration', 'dauer']),
            url_video: this._findColumn(columnNames, ['url_video', 'url', 'url_video_hd']),
            url_website: this._findColumn(columnNames, ['url_website', 'website']),
            is_hd: this._findColumn(columnNames, ['url_video_hd', 'hd']),
            has_subtitles: this._findColumn(columnNames, ['url_subtitle', 'url_sub', 'untertitel'])
        };

        return mapping;
    }

    /**
     * Findet passende Spalte
     */
    _findColumn(availableColumns, candidates) {
        for (const candidate of candidates) {
            if (availableColumns.includes(candidate)) {
                return candidate;
            }
        }
        return null;
    }

    /**
     * Baut SELECT-Query
     */
    _buildSelectQuery(tableName, mapping) {
        const columns = [];
        for (const [key, sourceColumn] of Object.entries(mapping)) {
            if (sourceColumn) {
                columns.push(`${sourceColumn} as ${key}`);
            }
        }

        return `SELECT ${columns.join(', ')} FROM ${tableName}`;
    }

    /**
     * Transformiert Row zu App-DB Format
     */
    _transformRow(row, mapping) {
        try {
            const title = row.title;
            // Map channelid zu Channel-Name
            const channelId = parseInt(row.channel);
            const channel = CHANNEL_ID_MAP[channelId] || `Channel ${channelId}`;
            const url_website = row.url_website;
            const url_video = row.url_video;

            // Pflichtfelder prüfen
            if (!title || (!url_video && !url_website)) {
                return null;
            }

            // Date Timestamp normalisieren und validieren
            let date_ts = row.date_ts;
            if (typeof date_ts === 'string') {
                date_ts = Math.floor(new Date(date_ts).getTime() / 1000);
            }
            
            // Validiere Timestamp (plausibel zwischen 2000 und heute+1 Jahr)
            const MIN_TS = 946684800;  // 1.1.2000
            const MAX_TS = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60); // Heute + 1 Jahr
            if (!date_ts || date_ts < MIN_TS || date_ts > MAX_TS) {
                date_ts = null;
            }

            // Category klassifizieren
            const category = this.classifier.classify({
                title,
                channel,
                topic: row.topic,
                description: row.description
            });

            // Poster (Logo) mapping
            const poster = senderLogos[channel] || null;

            // ID generieren
            const id = AppDB.generateId(channel, url_website, url_video, title, date_ts);

            return {
                id,
                type: 'movie',
                title,
                channel,
                topic: row.topic || null,
                description: row.description || null,
                date_ts,
                duration_sec: row.duration || null,
                url_video,
                url_website,
                is_hd: row.is_hd ? 1 : 0,
                has_subtitles: row.has_subtitles ? 1 : 0,
                category,
                poster
            };

        } catch (error) {
            logger.warn('Row-Transformation fehlgeschlagen', {
                error: error.message,
                row
            });
            return null;
        }
    }
}

module.exports = Importer;
