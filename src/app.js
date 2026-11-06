'use strict';

// HTTP-Schicht: Stremio-Protokoll, Konfigurationsseite, generierte Bilder,
// Untertitel-Konvertierung und Health-Check.

const express = require('express');
const pkg = require('../package.json');
const config = require('./config');
const logger = require('./logger');
const { parseAddonPath } = require('./stremio/protocol');
const { parseUserConfig } = require('./stremio/user-config');
const { renderConfigurePage } = require('./web/configure-page');
const { renderArt, renderLogoPng } = require('./web/art');
const { channelColor } = require('./mediathek/channels');
const { posterText } = require('./mediathek/presenter');
const { fetchAsVtt } = require('./mediathek/subtitles');
const { fetchTrimmedPlaylist } = require('./live/hls');

const REPO_URL = 'https://github.com/Hamido212/stremio-mediathekde-addon';
const SHAPES = new Set(['poster', 'landscape', 'square']);

function cacheControl(res, { cacheMaxAge, staleRevalidate, staleError } = {}) {
    if (!cacheMaxAge) {
        res.set('Cache-Control', 'no-cache');
        return;
    }
    const parts = ['public', `max-age=${cacheMaxAge}`, `s-maxage=${cacheMaxAge}`];
    if (staleRevalidate) parts.push(`stale-while-revalidate=${staleRevalidate}`);
    if (staleError) parts.push(`stale-if-error=${staleError}`);
    res.set('Cache-Control', parts.join(', '));
}

class LruCache {
    constructor(max) { this.max = max; this.map = new Map(); }
    get(key) {
        if (!this.map.has(key)) return undefined;
        const value = this.map.get(key);
        this.map.delete(key);
        this.map.set(key, value);
        return value;
    }
    set(key, value) {
        this.map.delete(key);
        this.map.set(key, value);
        if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    }
}

/**
 * @param {object} deps
 * @param {import('./stremio/addon').Addon} deps.addon
 * @param {import('./mediathek/repository').MediathekRepository} deps.repository
 * @param {import('./live/livetv').LiveTvProvider} deps.live
 * @param {import('./live/radio').RadioProvider} deps.radio
 * @param {import('./updater/scheduler').UpdateScheduler} [deps.scheduler]
 */
function createApp({ addon, repository, live, radio, scheduler }) {
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', true);

    const logoPng = renderLogoPng(256);
    const subtitleCache = new LruCache(200);
    const originOf = (req) => config.BASE_URL || `${req.protocol}://${req.host}`;

    app.use((req, res, next) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Headers', '*');
        // Chromium "Private Network Access": erlaubt https://web.stremio.com den Zugriff
        // auf ein Add-on im Heimnetz/localhost (Preflight mit Access-Control-Request-Private-Network)
        res.set('Access-Control-Allow-Private-Network', 'true');
        if (req.method === 'OPTIONS') return res.sendStatus(204);
        next();
    });

    // --- Seiten ------------------------------------------------------------------

    const status = () => ({
        mediathek: repository.stats(),
        updating: scheduler?.running ?? false,
        live: live.stats(),
        radio: radio.stats()
    });

    app.get('/', (req, res) => res.redirect('/configure'));
    app.get(['/configure', '/:config/configure'], (req, res) => {
        const userConfig = parseUserConfig(req.params.config);
        res.set('Cache-Control', 'no-cache');
        res.type('html').send(renderConfigurePage({
            userConfig,
            status: status(),
            donationUrl: config.DONATION_URL,
            repoUrl: REPO_URL
        }));
    });

    app.get('/health', (req, res) => {
        res.set('Cache-Control', 'no-cache');
        res.json({
            status: repository.ready ? 'ok' : 'starting',
            version: pkg.version,
            uptimeSeconds: Math.round(process.uptime()),
            ...status(),
            update: scheduler ? scheduler.status() : null
        });
    });

    app.post('/admin/update', (req, res) => {
        const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
        if (!config.ADMIN_TOKEN || token !== config.ADMIN_TOKEN) return res.status(403).json({ error: 'forbidden' });
        if (!scheduler) return res.status(503).json({ error: 'scheduler disabled' });
        const started = scheduler.trigger({ force: req.query.force === '1' });
        res.status(started ? 202 : 409).json({ started });
    });

    // --- Bilder ------------------------------------------------------------------

    app.get('/logo.png', (req, res) => {
        res.set('Cache-Control', 'public, max-age=604800, s-maxage=604800');
        res.type('png').send(logoPng);
    });

    app.get('/art/:kind/:file', (req, res) => {
        const { kind } = req.params;
        const id = req.params.file.replace(/\.svg$/, '');
        const requested = String(req.query.shape || '');
        let svg = null;

        if (kind === 'item' && repository.ready) {
            const item = repository.item(id);
            if (item) {
                const text = posterText(item);
                const shape = SHAPES.has(requested) ? requested : 'poster';
                svg = renderArt({ ...text, badge: item.channel, tag: item.category, color: channelColor(item.channel), shape, minimal: shape === 'landscape' });
            }
        } else if (kind === 'show' && repository.ready) {
            const show = repository.show(id);
            if (show) {
                const shape = SHAPES.has(requested) ? requested : 'poster';
                svg = renderArt({ title: show.name, badge: show.channel, tag: show.category, footer: `${show.episodes} Folgen`, color: channelColor(show.channel), shape, minimal: shape === 'landscape' });
            }
        } else if (kind === 'live') {
            const channel = live.get(id);
            if (channel) svg = renderArt({ title: channel.name, color: channel.color, mode: 'live', shape: requested === 'landscape' ? 'landscape' : 'square' });
        } else if (kind === 'radio') {
            const station = radio.get(id);
            if (station) svg = renderArt({ title: station.name, color: channelColor(station.name), mode: 'radio', shape: requested === 'landscape' ? 'landscape' : 'square' });
        } else if (kind === 'brand') { // /art/brand/mediathek.svg
            svg = renderArt({ title: 'Mediathek DE', kicker: 'ARD · ZDF · ARTE · 3sat · Live-TV · Radio', color: '#3b2a8c', shape: 'landscape' });
        }

        if (!svg) return res.status(404).type('text').send('not found');
        res.set('Cache-Control', 'public, max-age=86400, s-maxage=86400');
        res.type('image/svg+xml').send(svg);
    });

    // --- Untertitel (EBU-TT/TTML → WebVTT) ---------------------------------------

    app.get('/subtitles/:file', async (req, res) => {
        const id = req.params.file.replace(/\.vtt$/, '');
        const item = repository.ready ? repository.item(id) : null;
        if (!item?.url_sub) return res.status(404).type('text').send('not found');
        try {
            let vtt = subtitleCache.get(id);
            if (vtt === undefined) {
                vtt = await fetchAsVtt(item.url_sub);
                subtitleCache.set(id, vtt);
            }
            if (!vtt) return res.status(404).type('text').send('unsupported subtitle format');
            res.set('Cache-Control', 'public, max-age=86400, s-maxage=86400');
            res.type('text/vtt; charset=utf-8').send(vtt);
        } catch (error) {
            logger.warn('Untertitel nicht abrufbar', { id, error: error.message });
            res.status(502).type('text').send('subtitle fetch failed');
        }
    });

    // --- Live-TV: bereinigte HLS-Playlist für schnellen Start ---------------------

    app.get('/live/:channel/:file', async (req, res) => {
        const channel = live.get(req.params.channel);
        const index = Number.parseInt(req.params.file, 10);
        const stream = channel?.streams[Number.isFinite(index) ? index : 0];
        if (!stream) return res.status(404).type('text').send('not found');
        try {
            const playlist = await fetchTrimmedPlaylist(stream.url, { single: req.query.abr !== '1' });
            if (!playlist) return res.redirect(302, stream.url);
            res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
            res.type('application/vnd.apple.mpegurl').send(playlist);
        } catch (error) {
            logger.warn('Live-Playlist nicht abrufbar – leite auf Original um', { channel: channel.id, error: error.message });
            res.redirect(302, stream.url);
        }
    });

    // --- Stremio-Protokoll ---------------------------------------------------------

    app.get(/\.json$/, async (req, res, next) => {
        const request = parseAddonPath(req.path);
        if (!request) return next();
        const userConfig = parseUserConfig(request.config);
        const origin = originOf(req);
        const started = Date.now();
        res.on('finish', () => logger.info('Stremio-Anfrage', {
            resource: request.manifest ? 'manifest' : request.resource,
            type: request.type,
            id: request.id,
            extra: request.extra && Object.keys(request.extra).length ? request.extra : undefined,
            status: res.statusCode,
            ms: Date.now() - started
        }));

        try {
            if (request.manifest) {
                res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
                return res.json(addon.manifest(userConfig, origin));
            }
            let result;
            if (request.resource === 'catalog') result = await addon.catalog(request, userConfig, origin);
            else if (request.resource === 'meta') result = await addon.meta(request, userConfig, origin);
            else if (request.resource === 'stream') result = await addon.stream(request, userConfig, origin);
            else return res.status(404).json({ error: 'unsupported resource' });

            cacheControl(res, result);
            res.json(result);
        } catch (error) {
            logger.error('Anfrage fehlgeschlagen', { path: req.path, error: error.message, stack: error.stack });
            res.status(500).json({ error: 'internal error' });
        }
    });

    app.use((req, res) => res.status(404).json({ error: 'not found' }));

    return app;
}

module.exports = { createApp };
