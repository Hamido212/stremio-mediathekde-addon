// DB Inspector - Schema-Analyse der MediathekView SQLite DB

const Database = require('better-sqlite3');
const logger = require('../logger');

class DBInspector {
    /**
     * Inspiziert das Schema einer SQLite-Datenbank
     * @param {string} dbPath - Pfad zur DB-Datei
     * @returns {Object} - Schema-Informationen
     */
    static inspect(dbPath) {
        try {
            const db = new Database(dbPath, { readonly: true });
            
            // Liste alle Tabellen
            const tables = db.prepare(`
                SELECT name, sql 
                FROM sqlite_master 
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
                ORDER BY name
            `).all();

            const schema = {
                tables: {},
                rowCounts: {}
            };

            for (const table of tables) {
                // Hole Spalten-Info
                const columns = db.prepare(`PRAGMA table_info(${table.name})`).all();
                
                // Hole Row Count
                const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
                
                schema.tables[table.name] = {
                    columns: columns.map(col => ({
                        name: col.name,
                        type: col.type,
                        notNull: col.notnull === 1,
                        primaryKey: col.pk === 1
                    })),
                    createSql: table.sql
                };
                
                schema.rowCounts[table.name] = count.count;
            }

            // Sample aus Haupttabelle
            const mainTable = this._guessMainTable(schema);
            if (mainTable) {
                const sample = db.prepare(`SELECT * FROM ${mainTable} LIMIT 3`).all();
                schema.sample = { table: mainTable, rows: sample };
            }

            db.close();
            
            logger.info('DB Schema inspiziert', {
                dbPath,
                tableCount: tables.length,
                mainTable,
                totalRows: schema.rowCounts[mainTable] || 0
            });

            return schema;
            
        } catch (error) {
            logger.error('DB Inspektion fehlgeschlagen', {
                dbPath,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Errät die Haupttabelle (meiste Rows)
     */
    static _guessMainTable(schema) {
        let maxRows = 0;
        let mainTable = null;

        for (const [tableName, count] of Object.entries(schema.rowCounts)) {
            if (count > maxRows) {
                maxRows = count;
                mainTable = tableName;
            }
        }

        return mainTable;
    }

    /**
     * Validiert dass notwendige Spalten existieren
     */
    static validateColumns(schema, requiredColumns) {
        const mainTable = this._guessMainTable(schema);
        if (!mainTable) {
            throw new Error('Keine Haupttabelle gefunden');
        }

        const tableSchema = schema.tables[mainTable];
        const availableColumns = tableSchema.columns.map(c => c.name.toLowerCase());

        const missing = [];
        for (const required of requiredColumns) {
            if (!availableColumns.includes(required.toLowerCase())) {
                missing.push(required);
            }
        }

        if (missing.length > 0) {
            throw new Error(`Fehlende Spalten: ${missing.join(', ')}`);
        }

        return { mainTable, columns: tableSchema.columns };
    }
}

module.exports = DBInspector;
