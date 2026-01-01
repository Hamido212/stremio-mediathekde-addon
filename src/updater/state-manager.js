// State Manager - Verwaltet state.json für Updater

const fs = require('fs');
const path = require('path');
const logger = require('../logger');

class StateManager {
    constructor(stateFilePath) {
        this.stateFilePath = stateFilePath;
        this.state = this._load();
    }

    /**
     * Lädt state.json oder erstellt neue
     */
    _load() {
        try {
            if (fs.existsSync(this.stateFilePath)) {
                const data = fs.readFileSync(this.stateFilePath, 'utf-8');
                return JSON.parse(data);
            }
        } catch (error) {
            logger.warn('State-Datei konnte nicht geladen werden', {
                path: this.stateFilePath,
                error: error.message
            });
        }

        // Default State
        return {
            lastUpdateSuccess: null,
            lastUpdateAttempt: null,
            lastModified: null,
            etag: null,
            rowCount: 0,
            maxDateTs: null,
            source: null,
            version: 1
        };
    }

    /**
     * Speichert State
     */
    save() {
        try {
            const dir = path.dirname(this.stateFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(
                this.stateFilePath,
                JSON.stringify(this.state, null, 2),
                'utf-8'
            );

            logger.info('State gespeichert', { path: this.stateFilePath });
        } catch (error) {
            logger.error('State speichern fehlgeschlagen', {
                path: this.stateFilePath,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Markiert Update als erfolgreich
     */
    markSuccess(metadata) {
        this.state.lastUpdateSuccess = Date.now();
        this.state.lastUpdateAttempt = Date.now();
        
        if (metadata.lastModified) {
            this.state.lastModified = metadata.lastModified;
        }
        if (metadata.etag) {
            this.state.etag = metadata.etag;
        }
        if (metadata.rowCount !== undefined) {
            this.state.rowCount = metadata.rowCount;
        }
        if (metadata.maxDateTs !== undefined) {
            this.state.maxDateTs = metadata.maxDateTs;
        }
        if (metadata.source) {
            this.state.source = metadata.source;
        }

        this.save();
    }

    /**
     * Markiert Update-Versuch (auch bei Fehler)
     */
    markAttempt() {
        this.state.lastUpdateAttempt = Date.now();
        this.save();
    }

    /**
     * Gibt Conditional-Request-Headers zurück
     */
    getConditionalHeaders() {
        const headers = {};

        if (this.state.etag) {
            headers['If-None-Match'] = this.state.etag;
        }

        if (this.state.lastModified) {
            headers['If-Modified-Since'] = this.state.lastModified;
        }

        return headers;
    }

    /**
     * Prüft ob Update notwendig ist (Freshness-Check)
     */
    needsUpdate(maxAgeSeconds = 6 * 60 * 60) {
        if (!this.state.lastUpdateSuccess) {
            return true; // Noch nie erfolgreich
        }

        const age = Date.now() - this.state.lastUpdateSuccess;
        return age > (maxAgeSeconds * 1000);
    }

    /**
     * Gibt State zurück
     */
    getState() {
        return { ...this.state };
    }
}

module.exports = StateManager;
