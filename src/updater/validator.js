// Validator - SQLite Integrity + Freshness Checks

const Database = require('better-sqlite3');
const logger = require('../logger');

class Validator {
    /**
     * Validiert eine SQLite-Datenbank
     * @param {string} dbPath - Pfad zur DB
     * @param {Object} options - { checkFreshness, maxAgeDays }
     * @returns {Object} - { valid: boolean, rowCount, maxDateTs, errors }
     */
    static validate(dbPath, options = {}) {
        const errors = [];
        let db;

        try {
            // 1. Öffne DB
            db = new Database(dbPath, { readonly: true });

            // 2. Integrity Check
            const integrity = db.prepare('PRAGMA integrity_check').get();
            if (integrity.integrity_check !== 'ok') {
                errors.push(`Integrity Check failed: ${integrity.integrity_check}`);
            }

            // 3. Row Count Check
            const tables = db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
                ORDER BY name
            `).all();

            if (tables.length === 0) {
                errors.push('Keine Tabellen gefunden');
            }

            // Finde Haupttabelle (meiste Rows)
            let mainTable = null;
            let maxRows = 0;

            for (const table of tables) {
                const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
                if (count.count > maxRows) {
                    maxRows = count.count;
                    mainTable = table.name;
                }
            }

            if (!mainTable || maxRows === 0) {
                errors.push('Haupttabelle ist leer');
            }

            // 4. Freshness Check (optional)
            let maxDateTs = null;
            if (options.checkFreshness && mainTable) {
                maxDateTs = this._checkFreshness(db, mainTable, options.maxAgeDays || 14);
                if (!maxDateTs) {
                    errors.push(`Keine aktuellen Daten (älter als ${options.maxAgeDays || 14} Tage)`);
                }
            }

            db.close();

            const valid = errors.length === 0;

            if (valid) {
                logger.info('DB Validierung erfolgreich', {
                    dbPath,
                    mainTable,
                    rowCount: maxRows,
                    maxDateTs
                });
            } else {
                logger.warn('DB Validierung fehlgeschlagen', {
                    dbPath,
                    errors
                });
            }

            return {
                valid,
                rowCount: maxRows,
                maxDateTs,
                mainTable,
                errors
            };

        } catch (error) {
            if (db) db.close();

            logger.error('DB Validierung Error', {
                dbPath,
                error: error.message
            });

            return {
                valid: false,
                rowCount: 0,
                maxDateTs: null,
                mainTable: null,
                errors: [error.message]
            };
        }
    }

    /**
     * Prüft Freshness (MAX(datum/timestamp) innerhalb maxAgeDays)
     */
    static _checkFreshness(db, tableName, maxAgeDays) {
        try {
            // Versuche verschiedene Spalten-Namen
            const dateColumns = ['timestamp', 'datum', 'date', 'time'];

            for (const col of dateColumns) {
                try {
                    const result = db.prepare(`SELECT MAX(${col}) as maxDate FROM ${tableName}`).get();
                    
                    if (result.maxDate) {
                        // Konvertiere zu Unix Timestamp (falls noch nicht)
                        let ts = result.maxDate;
                        
                        // Falls String-Datum (ISO) → parse
                        if (typeof ts === 'string') {
                            ts = Math.floor(new Date(ts).getTime() / 1000);
                        }

                        // Prüfe Alter
                        const now = Math.floor(Date.now() / 1000);
                        const age = now - ts;
                        const maxAge = maxAgeDays * 24 * 60 * 60;

                        if (age <= maxAge) {
                            return ts;
                        }
                    }
                } catch {
                    // Spalte existiert nicht, weiter versuchen
                    continue;
                }
            }

            return null;
            
        } catch (error) {
            logger.warn('Freshness Check fehlgeschlagen', { error: error.message });
            return null;
        }
    }
}

module.exports = Validator;
