// Updater - Orchestriert Download, Validierung und Import mit Atomic Swap

const path = require('path');
const fs = require('fs');
const StateManager = require('./state-manager');
const Downloader = require('./downloader');
const Validator = require('./validator');
const Importer = require('../db/importer');
const logger = require('../logger');

class Updater {
    constructor(config) {
        this.config = {
            sourceUrl: config.sourceUrl || 'https://liste.mediathekview.de/filmliste-v2.db.bz2',
            dataDir: config.dataDir || path.join(process.cwd(), 'data'),
            stateFile: config.stateFile || path.join(process.cwd(), 'data', 'meta', 'state.json'),
            maxAgeDays: config.maxAgeDays || 90, // Erhöht auf 90 Tage für bessere Toleranz
            ...config
        };

        this.stateManager = new StateManager(this.config.stateFile);
    }

    /**
     * Führt Update-Zyklus aus
     */
    async update() {
        logger.info('Update-Zyklus gestartet');
        this.stateManager.markAttempt();

        try {
            // 1. Download (mit Conditional GET)
            const downloadResult = await this._download();
            
            if (!downloadResult.downloaded) {
                logger.info('Keine neuen Daten verfügbar (304 Not Modified)');
                return { updated: false, reason: 'not_modified' };
            }

            // 2. Decompress
            const decompressedPath = await this._decompress(downloadResult.compressedPath);

            // 3. Validate
            const validationResult = await this._validate(decompressedPath);
            
            if (!validationResult.valid) {
                logger.error('Validierung fehlgeschlagen', { errors: validationResult.errors });
                return { updated: false, reason: 'validation_failed', errors: validationResult.errors };
            }

            // 4. Atomic Swap (Source-DB)
            await this._atomicSwap(decompressedPath);

            // 5. Import (Source → App-DB)
            const sourceDbPath = path.join(this.config.dataDir, 'source', 'filmliste-v2.db');
            const appDbPath = path.join(this.config.dataDir, 'app', 'app.db');
            const categoriesPath = path.join(__dirname, '..', 'db', 'categories.json');

            const importer = new Importer(sourceDbPath, appDbPath, categoriesPath);
            const importResult = await importer.import();

            // 6. Update State
            this.stateManager.markSuccess({
                lastModified: downloadResult.metadata.lastModified,
                etag: downloadResult.metadata.etag,
                rowCount: validationResult.rowCount,
                maxDateTs: validationResult.maxDateTs,
                source: 'filmliste-v2.db'
            });

            logger.info('Update-Zyklus erfolgreich abgeschlossen', {
                rowCount: validationResult.rowCount,
                maxDateTs: validationResult.maxDateTs,
                importStats: importResult.stats
            });

            return {
                updated: true,
                stats: importResult.stats
            };

        } catch (error) {
            logger.error('Update-Zyklus fehlgeschlagen', {
                error: error.message,
                stack: error.stack
            });
            
            return {
                updated: false,
                reason: 'error',
                error: error.message
            };
        }
    }

    /**
     * Download-Schritt
     */
    async _download() {
        const destPath = path.join(this.config.dataDir, 'source', 'tmp', 'filmliste-v2.db.bz2');
        
        const headers = this.stateManager.getConditionalHeaders();

        const result = await Downloader.download(this.config.sourceUrl, destPath, { headers });

        return {
            downloaded: result.downloaded,
            compressedPath: result.downloaded ? destPath : null,
            metadata: Downloader.extractMetadata(result.headers)
        };
    }

    /**
     * Decompress-Schritt
     */
    async _decompress(compressedPath) {
        const decompressedPath = path.join(
            this.config.dataDir,
            'source',
            'tmp',
            'filmliste-v2.db'
        );

        await Downloader.decompressBz2(compressedPath, decompressedPath);

        return decompressedPath;
    }

    /**
     * Validierungs-Schritt
     */
    async _validate(dbPath) {
        return Validator.validate(dbPath, {
            checkFreshness: false, // Deaktiviert für maximale Kompatibilität
            maxAgeDays: this.config.maxAgeDays
        });
    }

    /**
     * Atomic Swap (tmp → production)
     */
    async _atomicSwap(tmpDbPath) {
        const targetPath = path.join(this.config.dataDir, 'source', 'filmliste-v2.db');
        const targetDir = path.dirname(targetPath);

        // Ensure target dir exists
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // Atomic rename
        fs.renameSync(tmpDbPath, targetPath);

        logger.info('Atomic Swap abgeschlossen', { targetPath });
    }

    /**
     * Cleanup (alte tmp-Dateien)
     */
    cleanup() {
        const tmpDir = path.join(this.config.dataDir, 'source', 'tmp');
        
        if (fs.existsSync(tmpDir)) {
            const files = fs.readdirSync(tmpDir);
            
            for (const file of files) {
                const filePath = path.join(tmpDir, file);
                fs.unlinkSync(filePath);
            }

            logger.info('Tmp-Verzeichnis bereinigt', { tmpDir });
        }
    }

    /**
     * Gibt State zurück
     */
    getState() {
        return this.stateManager.getState();
    }
}

// CLI-Entry-Point
if (require.main === module) {
    const updater = new Updater({});
    
    updater.update()
        .then(result => {
            console.log('Update Result:', JSON.stringify(result, null, 2));
            updater.cleanup();
            process.exit(result.updated ? 0 : 1);
        })
        .catch(error => {
            console.error('Update failed:', error);
            process.exit(1);
        });
}

module.exports = Updater;
