'use strict';

const config = require('./config');

/** fetch mit Timeout und User-Agent; wirft bei HTTP-Fehlern. */
async function fetchJson(url, { timeoutMs = 20000, headers = {} } = {}) {
    const response = await fetch(url, {
        headers: { 'User-Agent': config.HTTP_USER_AGENT, Accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} für ${url}`);
    return response.json();
}

/**
 * Prüft, ob eine Stream-URL erreichbar ist. Liefert 'ok', 'dead' (404/410,
 * DNS-Fehler) oder 'unknown' (Timeout, 403/Geo-Sperre o.ä.).
 */
async function probeUrl(url, { timeoutMs = 8000 } = {}) {
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'User-Agent': config.HTTP_USER_AGENT, Range: 'bytes=0-2047' },
            signal: AbortSignal.timeout(timeoutMs),
            redirect: 'follow'
        });
        await response.body?.cancel();
        if (response.ok) return 'ok';
        if (response.status === 404 || response.status === 410) return 'dead';
        return 'unknown';
    } catch (error) {
        const code = error?.cause?.code;
        if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ECONNREFUSED') return 'dead';
        return 'unknown';
    }
}

module.exports = { fetchJson, probeUrl };
