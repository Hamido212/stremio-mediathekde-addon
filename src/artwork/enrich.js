'use strict';

// Optionale Poster-Anreicherung über TMDB (nur mit TMDB_API_KEY).
//
// Gesucht wird auf Ebene der *Sendungen* (Tatort, Sturm der Liebe, …) und
// der *Spielfilme* – nicht für jeden einzelnen Clip. Ergebnisse (auch
// Fehltreffer) werden dauerhaft in data/cache/artwork.db gespeichert, damit
// jeder Titel nur einmal (bzw. alle 30 Tage) nachgeschlagen wird.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('../config');
const logger = require('../logger');
const { isGenericShow } = require('../mediathek/shows');

const TMDB = 'https://api.themoviedb.org/3';
const IMAGE = 'https://image.tmdb.org/t/p';
const RECHECK_MS = 30 * 24 * 3600 * 1000;
const REQUEST_GAP_MS = 120; // ~8 Anfragen/s – deutlich unter dem TMDB-Limit

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalize(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/\(.*?\)|\[.*?\]/g, ' ')
        .replace(/[^a-z0-9ß]+/g, ' ')
        .trim();
}

/** Ähnlichkeit zweier Titel (0–1) über gemeinsame Wörter. */
function similarity(a, b) {
    const x = normalize(a);
    const y = normalize(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    const wa = new Set(x.split(' '));
    const wb = new Set(y.split(' '));
    let common = 0;
    for (const w of wa) if (wb.has(w)) common++;
    return (2 * common) / (wa.size + wb.size);
}

function openCache(file = config.ARTWORK_CACHE_FILE) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new Database(file);
    db.pragma('journal_mode = WAL');
    db.exec(`CREATE TABLE IF NOT EXISTS artwork (
        key TEXT PRIMARY KEY, poster TEXT, background TEXT, tmdb_id INTEGER, checked_at INTEGER NOT NULL
    )`);
    return db;
}

async function tmdbSearch(kind, query, { apiKey, fetchImpl = fetch, year } = {}) {
    const params = new URLSearchParams({ query, language: 'de-DE', include_adult: 'false' });
    if (year && kind === 'movie') params.set('year', String(year));
    const headers = { Accept: 'application/json', 'User-Agent': config.HTTP_USER_AGENT };
    // v4-Token (lang, beginnt mit "eyJ") per Header, v3-Key als Query-Parameter
    if (apiKey.startsWith('eyJ')) headers.Authorization = `Bearer ${apiKey}`;
    else params.set('api_key', apiKey);
    const response = await fetchImpl(`${TMDB}/search/${kind}?${params}`, { headers, signal: AbortSignal.timeout(10000) });
    if (response.status === 429) throw Object.assign(new Error('TMDB rate limit'), { retry: true });
    if (!response.ok) throw new Error(`TMDB HTTP ${response.status}`);
    const body = await response.json();
    return Array.isArray(body.results) ? body.results : [];
}

function pickMatch(results, title, nameField) {
    let best = null;
    for (const result of results.slice(0, 5)) {
        const names = [result[nameField], result[nameField === 'name' ? 'original_name' : 'original_title']];
        const score = Math.max(...names.map((n) => similarity(title, n)));
        if (score >= 0.85 && result.poster_path && (!best || score > best.score)) best = { result, score };
    }
    return best?.result || null;
}

/**
 * Reichert die (noch nicht aktive) App-DB mit Postern an.
 * @param {string} appDbPath
 * @param {object} [opts]  { apiKey, maxLookups, fetchImpl, cacheFile, delayMs }
 */
async function enrichArtwork(appDbPath, opts = {}) {
    const apiKey = opts.apiKey ?? config.TMDB_API_KEY;
    if (!apiKey) return { skipped: true };
    const maxLookups = opts.maxLookups ?? config.TMDB_MAX_LOOKUPS;
    const delayMs = opts.delayMs ?? REQUEST_GAP_MS;
    const cache = openCache(opts.cacheFile);
    const app = new Database(appDbPath);
    const now = Date.now();
    let lookups = 0;
    let found = 0;

    try {
        const getCached = cache.prepare('SELECT * FROM artwork WHERE key = ?');
        const putCached = cache.prepare('INSERT OR REPLACE INTO artwork (key, poster, background, tmdb_id, checked_at) VALUES (?, ?, ?, ?, ?)');

        // Kandidaten: aktive Sendungen (mehr Folgen zuerst) und Spielfilme (neueste zuerst)
        const shows = app.prepare(`
            SELECT id, channel, name FROM shows
            WHERE generic = 0 AND episodes >= 2 AND category NOT IN ('Nachrichten', 'Sport', 'Sonstiges')
            ORDER BY recent DESC, episodes DESC
        `).all().filter((s) => !isGenericShow(s.channel, s.name));
        const films = app.prepare(`
            SELECT id, COALESCE(base_title, title) AS title, aired FROM items
            WHERE category = 'Film' AND hidden = 0 ORDER BY aired DESC
        `).all();

        const tasks = [
            ...shows.map((s) => ({ key: `show:${normalize(s.name)}`, kind: 'tv', query: s.name, apply: { table: 'shows', id: s.id } })),
            ...films.map((f) => ({ key: `film:${normalize(f.title)}`, kind: 'movie', query: f.title, apply: { table: 'items', id: f.id } }))
        ];

        const updateShow = app.prepare('UPDATE shows SET poster = ?, background = ? WHERE id = ?');
        const updateItem = app.prepare('UPDATE items SET poster = ? WHERE id = ?');
        // Schreibvorgänge gebündelt in Transaktionen (schnell auch auf HDD/NAS)
        let pending = [];
        const flush = app.transaction((rows) => {
            for (const [task, art] of rows) {
                if (task.apply.table === 'shows') updateShow.run(art.poster, art.background, task.apply.id);
                else updateItem.run(art.poster, task.apply.id);
            }
        });
        const apply = (task, art) => {
            if (!art?.poster) return;
            pending.push([task, art]);
            found++;
            if (pending.length >= 500) { flush(pending); pending = []; }
        };

        for (const task of tasks) {
            const cached = getCached.get(task.key);
            if (cached && (cached.poster || now - cached.checked_at < RECHECK_MS)) {
                apply(task, cached);
                continue;
            }
            if (lookups >= maxLookups) continue;
            lookups++;
            try {
                let results;
                for (let attempt = 0; ; attempt++) {
                    try {
                        results = await tmdbSearch(task.kind, task.query, { apiKey, fetchImpl: opts.fetchImpl });
                        break;
                    } catch (error) {
                        if (!error.retry || attempt >= 2) throw error;
                        await sleep(5000 * (attempt + 1));
                    }
                }
                const match = pickMatch(results, task.query, task.kind === 'tv' ? 'name' : 'title');
                const art = match ? {
                    poster: `${IMAGE}/w500${match.poster_path}`,
                    background: match.backdrop_path ? `${IMAGE}/w1280${match.backdrop_path}` : null
                } : null;
                putCached.run(task.key, art?.poster ?? null, art?.background ?? null, match?.id ?? null, now);
                apply(task, art);
            } catch (error) {
                logger.debug('TMDB-Suche fehlgeschlagen', { query: task.query, error: error.message });
            }
            if (delayMs) await sleep(delayMs);
        }
        if (pending.length) flush(pending);
    } finally {
        app.close();
        cache.close();
    }

    logger.info('Poster-Anreicherung abgeschlossen', { lookups, withPoster: found });
    return { lookups, withPoster: found };
}

module.exports = { enrichArtwork, similarity, normalize };
