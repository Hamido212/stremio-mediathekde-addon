'use strict';

// Download (mit Conditional GET) und bz2-Entpacken der MediathekView-Filmliste.

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const config = require('../config');
const logger = require('../logger');

/**
 * Lädt `url` nach `destPath`. Gibt { notModified: true } zurück, wenn der
 * Server 304 liefert (ETag/Last-Modified unverändert).
 */
async function download(url, destPath, { etag, lastModified, timeoutMs = 15 * 60 * 1000 } = {}) {
    const headers = { 'User-Agent': config.HTTP_USER_AGENT };
    if (etag) headers['If-None-Match'] = etag;
    if (lastModified) headers['If-Modified-Since'] = lastModified;

    const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (response.status === 304) {
        await response.body?.cancel();
        return { notModified: true };
    }
    if (!response.ok) {
        throw new Error(`Download fehlgeschlagen: HTTP ${response.status} ${response.statusText}`);
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const partial = destPath + '.part';
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial));
    fs.renameSync(partial, destPath);

    return {
        notModified: false,
        size: fs.statSync(destPath).size,
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified')
    };
}

function findTool() {
    for (const tool of ['lbzip2', 'pbzip2', 'bzip2']) {
        try {
            const probe = spawnSync(tool, ['--help'], { stdio: 'ignore', timeout: 5000 });
            if (!probe.error) return tool;
        } catch { /* nicht vorhanden */ }
    }
    return null;
}

/** Entpackt eine .bz2-Datei – bevorzugt mit nativem (paralellem) bzip2. */
async function decompressBz2(sourcePath, destPath) {
    const tool = findTool();
    const started = Date.now();
    const partial = destPath + '.part';

    if (tool) {
        await new Promise((resolve, reject) => {
            const proc = spawn(tool, ['-d', '-c', sourcePath], { stdio: ['ignore', 'pipe', 'pipe'] });
            const out = fs.createWriteStream(partial);
            let stderr = '';
            proc.stderr.on('data', (chunk) => { stderr += chunk; });
            proc.stdout.pipe(out);
            proc.on('error', reject);
            out.on('error', reject);
            proc.on('close', (code) => {
                if (code !== 0) return reject(new Error(`${tool} beendet mit Code ${code}: ${stderr.trim()}`));
                out.on('finish', resolve);
                if (out.writableFinished) resolve();
            });
        });
    } else {
        logger.warn('Kein bzip2 gefunden – nutze langsameres JavaScript-Entpacken');
        const unbzip2 = require('unbzip2-stream');
        await pipeline(fs.createReadStream(sourcePath), unbzip2(), fs.createWriteStream(partial));
    }

    fs.renameSync(partial, destPath);
    logger.info('Filmliste entpackt', {
        tool: tool || 'unbzip2-stream',
        seconds: Math.round((Date.now() - started) / 1000),
        sizeMB: Math.round(fs.statSync(destPath).size / 1048576)
    });
}

module.exports = { download, decompressBz2 };
