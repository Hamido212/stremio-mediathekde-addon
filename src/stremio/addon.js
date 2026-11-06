'use strict';

// Stremio-Ressourcen (catalog/meta/stream) – verteilt Anfragen anhand der
// ID-Präfixe bzw. Katalog-IDs auf Mediathek, Live-TV und Radio.

const config = require('../config');
const logger = require('../logger');
const { catalogById, RADIO_TYPE } = require('./catalogs');
const { buildManifest, LIVE_PREFIX, RADIO_PREFIX } = require('./manifest');
const presenter = require('../mediathek/presenter');
const { ALL_CHANNEL_NAMES } = require('../mediathek/channels');

const { ITEM_PREFIX, SHOW_PREFIX } = presenter;
const NEW_MIN_DURATION = 15 * 60;
// Bis v3.0.0 hießen die Präfixe "live:" und "radio:". Ältere Installationen und
// Bibliothekseinträge fragen noch so an – das bedienen wir weiter, solange die
// ID zu einem unserer Sender passt (fremde "live:"-IDs anderer Add-ons nicht).
const LEGACY_LIVE_PREFIX = 'live:';
const LEGACY_RADIO_PREFIX = 'radio:';

function stripPrefix(id, ...prefixes) {
    for (const prefix of prefixes) if (id.startsWith(prefix)) return id.slice(prefix.length);
    return null;
}
const SHOW_DEFAULT_EXCLUDE = ['Nachrichten', 'Sport', 'Sonstiges'];
const NEW_EXCLUDE = ['Nachrichten', 'Sport'];
const PAGE = config.PAGE_SIZE;

const cache = (maxAge) => ({
    cacheMaxAge: maxAge,
    staleRevalidate: maxAge * 4,
    staleError: 7 * 24 * 3600
});
// Kurze Cachezeit, solange noch keine Daten da sind (Erst-Import läuft)
const NOT_READY = { cacheMaxAge: 60, staleRevalidate: 0, staleError: 0 };

class Addon {
    /**
     * @param {object} deps
     * @param {import('../mediathek/repository').MediathekRepository} deps.repository
     * @param {import('../live/livetv').LiveTvProvider} deps.live
     * @param {import('../live/radio').RadioProvider} deps.radio
     */
    constructor({ repository, live, radio }) {
        this.repository = repository;
        this.live = live;
        this.radio = radio;
    }

    manifest(userConfig, origin) {
        return buildManifest(userConfig, origin);
    }

    // ------------------------------------------------------------------ catalog

    async catalog({ type, id, extra = {} }, userConfig, origin) {
        const catalog = catalogById(id);
        if (!catalog || catalog.type !== type) return { metas: [] };

        const skip = Math.max(Number.parseInt(extra.skip, 10) || 0, 0);
        const genre = extra.genre || null;
        const search = extra.search ? String(extra.search).trim().slice(0, 100) : null;

        switch (catalog.kind) {
            case 'live': {
                if (skip > 0) return { metas: [], ...cache(config.CACHE.LIVE) };
                const metas = this.live.list({ group: genre, search }).map((c) => this._livePreview(c, origin));
                return { metas, ...cache(config.CACHE.LIVE) };
            }
            case 'radio-public':
            case 'radio-top': {
                const list = catalog.kind === 'radio-public'
                    ? this.radio.list({ publicOnly: true, group: genre, search })
                    : this.radio.list({ tag: genre, search });
                const metas = list.slice(skip, skip + PAGE).map((s) => this._radioPreview(s, origin));
                return { metas, ...cache(config.CACHE.LIVE) };
            }
            default:
                return this._mediathekCatalog(catalog, { skip, genre, search }, userConfig, origin);
        }
    }

    _mediathekCatalog(catalog, { skip, genre, search }, userConfig, origin) {
        if (!this.repository.ready) return { metas: [], ...NOT_READY };

        const channelGenre = genre && ALL_CHANNEL_NAMES.includes(genre) ? genre : null;
        const filters = {
            channels: channelGenre ? [channelGenre] : userConfig.channels,
            minDuration: userConfig.minDuration * 60,
            skip,
            limit: PAGE
        };

        let rows;
        switch (catalog.kind) {
            case 'latest':
                rows = this.repository.latest({
                    ...filters,
                    minDuration: Math.max(filters.minDuration, NEW_MIN_DURATION),
                    excludeCategories: NEW_EXCLUDE
                });
                return { metas: rows.map((r) => presenter.itemPreview(r, origin)), ...cache(config.CACHE.CATALOG_NEW) };
            case 'category':
                rows = this.repository.byCategory(catalog.category, filters);
                break;
            case 'search':
                rows = search ? this.repository.search(search, filters) : [];
                break;
            case 'shows': {
                const shows = this.repository.shows({
                    channels: userConfig.channels,
                    category: genre && !channelGenre ? genre : null,
                    excludeCategories: search || genre ? null : SHOW_DEFAULT_EXCLUDE,
                    search,
                    skip,
                    limit: PAGE
                });
                return { metas: shows.map((s) => presenter.showPreview(s, origin)), ...cache(config.CACHE.CATALOG) };
            }
            default:
                rows = [];
        }
        return { metas: rows.map((r) => presenter.itemPreview(r, origin)), ...cache(config.CACHE.CATALOG) };
    }

    // --------------------------------------------------------------------- meta

    async meta({ id }, userConfig, origin) {
        if (id.startsWith(ITEM_PREFIX)) {
            if (!this.repository.ready) return { meta: null, ...NOT_READY };
            const item = this.repository.item(id.slice(ITEM_PREFIX.length));
            return item ? { meta: presenter.itemMeta(item, origin), ...cache(config.CACHE.META) } : { meta: null };
        }
        if (id.startsWith(SHOW_PREFIX)) {
            if (!this.repository.ready) return { meta: null, ...NOT_READY };
            const show = this.repository.show(id.slice(SHOW_PREFIX.length));
            if (!show) return { meta: null };
            const episodes = this.repository.episodes(show.id);
            return { meta: presenter.showMeta(show, episodes, origin), ...cache(config.CACHE.CATALOG) };
        }
        const channel = this._liveChannel(id);
        if (channel) return { meta: { ...this._liveMeta(channel, origin), id, behaviorHints: { defaultVideoId: id } }, ...cache(config.CACHE.LIVE) };
        const station = this._radioStation(id);
        if (station) return { meta: { ...this._radioMeta(station, origin), id, behaviorHints: { defaultVideoId: id } }, ...cache(config.CACHE.LIVE) };
        return { meta: null };
    }

    // ------------------------------------------------------------------- stream

    async stream({ id }, userConfig, origin) {
        if (id.startsWith(ITEM_PREFIX)) {
            if (!this.repository.ready) return { streams: [], ...NOT_READY };
            const item = this.repository.item(id.slice(ITEM_PREFIX.length));
            if (!item) return { streams: [] };
            const variants = this.repository.variants(item);
            const subtitles = item.url_sub
                ? [{ id: `mvw-sub-${item.id}`, url: `${origin}/subtitles/${item.id}.vtt`, lang: 'ger' }]
                : [];
            return { streams: presenter.itemStreams(item, variants, { subtitles }), ...cache(config.CACHE.STREAM) };
        }
        const channel = this._liveChannel(id);
        if (channel) {
            const geo = channel.geo ? `Nur in ${channel.geo === 'AT' ? 'Österreich' : 'der Schweiz'} verfügbar` : null;
            // Bereinigte Playlist (schneller Start); Video/Ton laufen weiterhin direkt vom Sender-CDN
            const streams = channel.streams.map((s, index) => ({
                name: `${channel.name}\nLIVE`,
                description: [`${s.label} · beste Qualität, schneller Start`, geo].filter(Boolean).join('\n'),
                url: `${origin}/live/${channel.id}/${index}.m3u8`,
                behaviorHints: { notWebReady: false, bingeGroup: `live-${channel.id}` }
            }));
            if (channel.streams[0]) {
                streams.push({
                    name: `${channel.name}\nAuto`,
                    description: ['Automatische Qualität (für langsame Verbindungen)', geo].filter(Boolean).join('\n'),
                    url: `${origin}/live/${channel.id}/0.m3u8?abr=1`,
                    behaviorHints: { notWebReady: false, bingeGroup: `live-${channel.id}-auto` }
                });
                streams.push({
                    name: `${channel.name}\nAlle Tonspuren`,
                    description: ['Original-Playlist inkl. Audiodeskription / Klare Sprache (Start dauert länger)', geo].filter(Boolean).join('\n'),
                    url: channel.streams[0].url,
                    behaviorHints: { notWebReady: false, bingeGroup: `live-${channel.id}-original` }
                });
            }
            return { streams, ...cache(5 * 60) };
        }
        const station = this._radioStation(id);
        if (station) {
            const format = [station.codec, station.bitrate ? `${station.bitrate} kbit/s` : null].filter(Boolean).join(' · ');
            return {
                streams: [{
                    name: `Radio\n${station.codec || 'Stream'}`,
                    description: [station.name, format].filter(Boolean).join('\n'),
                    url: station.url,
                    // http-Streams über den Stremio-Streaming-Server leiten (Mixed Content im Web)
                    behaviorHints: { notWebReady: !station.url.startsWith('https:') }
                }],
                ...cache(5 * 60)
            };
        }
        return { streams: [] };
    }

    // ---------------------------------------------------------------- Live/Radio

    _liveChannel(id) {
        const key = stripPrefix(id, LIVE_PREFIX, LEGACY_LIVE_PREFIX);
        return key ? this.live.get(key) : null;
    }

    _radioStation(id) {
        const key = stripPrefix(id, RADIO_PREFIX, LEGACY_RADIO_PREFIX);
        return key ? this.radio.get(key) : null;
    }

    _livePreview(channel, origin) {
        return {
            id: LIVE_PREFIX + channel.id,
            type: 'tv',
            name: channel.name,
            poster: `${origin}/art/live/${channel.id}.svg`,
            posterShape: 'square',
            logo: channel.logo || undefined,
            description: `${channel.group} · Live-Stream`,
            genres: [channel.group]
        };
    }

    _liveMeta(channel, origin) {
        return {
            ...this._livePreview(channel, origin),
            background: `${origin}/art/live/${channel.id}.svg?shape=landscape`,
            description: `Live-Stream von ${channel.name} (${channel.group}).`
                + (channel.streams.length > 1 ? `\nVerfügbare Varianten: ${channel.streams.map((s) => s.label).join(', ')}` : '')
                + (channel.geo ? `\n🌍 Nur in ${channel.geo === 'AT' ? 'Österreich' : 'der Schweiz'} abrufbar.` : ''),
            behaviorHints: { defaultVideoId: LIVE_PREFIX + channel.id }
        };
    }

    _radioPreview(station, origin) {
        return {
            id: RADIO_PREFIX + station.id,
            type: RADIO_TYPE,
            name: station.name,
            poster: `${origin}/art/radio/${station.id}.svg`,
            posterShape: 'square',
            logo: station.favicon || undefined,
            description: station.tags.length ? station.tags.join(', ') : 'Radio',
            genres: station.tags.slice(0, 4)
        };
    }

    _radioMeta(station, origin) {
        const details = [
            station.tags.length ? `🎵 ${station.tags.join(', ')}` : null,
            station.state ? `📍 ${station.state}` : null,
            station.codec ? `🔊 ${station.codec}${station.bitrate ? ` · ${station.bitrate} kbit/s` : ''}` : null,
            station.homepage ? `🌐 ${station.homepage}` : null
        ].filter(Boolean).join('\n');
        return {
            ...this._radioPreview(station, origin),
            background: `${origin}/art/radio/${station.id}.svg?shape=landscape`,
            description: details || 'Radiosender',
            website: station.homepage || undefined,
            behaviorHints: { defaultVideoId: RADIO_PREFIX + station.id }
        };
    }
}

function safeHandler(name, fn) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            logger.error(`${name} fehlgeschlagen`, { error: error.message, stack: error.stack });
            throw error;
        }
    };
}

module.exports = { Addon, safeHandler };
