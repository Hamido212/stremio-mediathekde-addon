// Downloader - Download mit Conditional GET und Decompression

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const unbzip2Stream = require('unbzip2-stream');
const logger = require('../logger');

class Downloader {
    /**
     * Lädt eine Datei mit Conditional GET herunter
     * @param {string} url - Download-URL
     * @param {string} destPath - Ziel-Pfad
     * @param {Object} options - { headers, timeout }
     * @returns {Object} - { downloaded: boolean, headers: {...} }
     */
    static async download(url, destPath, options = {}) {
        try {
            const headers = options.headers || {};
            const timeout = options.timeout || 120000; // 2 Minuten

            logger.info('Download gestartet', { url, destPath });

            const response = await axios({
                method: 'GET',
                url,
                headers,
                timeout,
                responseType: 'stream'
            });

            // 304 Not Modified
            if (response.status === 304) {
                logger.info('Datei unverändert (304)', { url });
                return {
                    downloaded: false,
                    status: 304,
                    headers: response.headers
                };
            }

            // Download ausführen
            const dir = path.dirname(destPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const writer = fs.createWriteStream(destPath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            logger.info('Download abgeschlossen', {
                url,
                destPath,
                size: fs.statSync(destPath).size
            });

            return {
                downloaded: true,
                status: response.status,
                headers: response.headers,
                size: fs.statSync(destPath).size
            };

        } catch (error) {
            logger.error('Download fehlgeschlagen', {
                url,
                error: error.message,
                status: error.response?.status
            });
            throw error;
        }
    }

    /**
     * Entpackt .bz2-Datei (via bzip2/7z/tar oder Node.js unbzip2-stream)
     * @param {string} sourcePath - .bz2 Datei
     * @param {string} destPath - Entpacktes Ziel
     * @returns {Promise<void>}
     */
    static async decompressBz2(sourcePath, destPath) {
        return new Promise((resolve, reject) => {
            logger.info('Decompression gestartet', { sourcePath, destPath });

            // Versuche verschiedene Tools (platform-abhängig)
            let command, args, useExternalTool = true;

            if (process.platform === 'win32') {
                // Windows: bevorzuge Node.js unbzip2-stream (sicherer als tar/7z)
                logger.info('Windows erkannt, verwende unbzip2-stream');
                useExternalTool = false;
            } else {
                // Linux/Mac: Verwende immer unbzip2-stream (zuverlässiger)
                logger.info('Verwende unbzip2-stream (zuverlässiger als bzip2)');
                useExternalTool = false;
            }

            // Fallback: Node.js Stream-basiert
            if (!useExternalTool) {
                try {
                    const reader = fs.createReadStream(sourcePath);
                    const writer = fs.createWriteStream(destPath);
                    const decompressor = unbzip2Stream();

                    reader
                        .pipe(decompressor)
                        .pipe(writer)
                        .on('finish', () => {
                            logger.info('Decompression abgeschlossen (unbzip2-stream)', {
                                sourcePath,
                                destPath,
                                size: fs.statSync(destPath).size
                            });
                            resolve();
                        })
                        .on('error', (error) => {
                            reject(new Error(`Decompression fehlgeschlagen: ${error.message}`));
                        });
                } catch (error) {
                    reject(new Error(`Decompression-Fehler: ${error.message}`));
                }
                return;
            }

            // External Tool
            const proc = spawn(command, args);
            const writer = fs.createWriteStream(destPath);

            proc.stdout.pipe(writer);

            let stderr = '';
            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    logger.info('Decompression abgeschlossen', {
                        sourcePath,
                        destPath,
                        size: fs.statSync(destPath).size
                    });
                    resolve();
                } else {
                    reject(new Error(`Decompression fehlgeschlagen (code ${code}): ${stderr}`));
                }
            });

            proc.on('error', (error) => {
                reject(new Error(`Decompression-Fehler: ${error.message}`));
            });
        });
    }

    /**
     * Prüft ob Command existiert (cross-platform)
     */
    static _commandExists(cmd) {
        try {
            const whichCmd = process.platform === 'win32' ? 'where' : 'which';
            const result = require('child_process').spawnSync(whichCmd, [cmd], { 
                stdio: 'ignore',
                shell: process.platform === 'win32' 
            });
            return result.status === 0;
        } catch {
            return false;
        }
    }

    /**
     * Extrahiert Last-Modified und ETag aus Response-Headers
     */
    static extractMetadata(headers) {
        return {
            lastModified: headers['last-modified'] || null,
            etag: headers['etag'] || null
        };
    }
}

module.exports = Downloader;
