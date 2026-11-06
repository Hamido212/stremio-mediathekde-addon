'use strict';

// Radio-Anbieter auf Basis von radio-browser.info (offene Community-Datenbank).
// Lädt die ~1500 meistgehörten deutschen Sender, erkennt öffentlich-rechtliche
// Programme und bietet Suche/Filter lokal an (schnell, keine Live-API pro Klick).

const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../logger');
const { fetchJson } = require('../http');

const API_HOSTS = ['https://de1.api.radio-browser.info', 'https://de2.api.radio-browser.info', 'https://fi1.api.radio-browser.info'];
const STATION_LIMIT = 1500;

const RADIO_GROUPS = ['ARD', 'Deutschlandradio', 'Deutsche Welle'];

// Öffentlich-rechtlich: über Homepage-Domain oder Sendernamen erkannt
const PUBLIC_DOMAINS = /(^|\.)(ardaudiothek\.de|ard\.de|br\.de|bayern3\.de|br-klassik\.de|puls\.br\.de|hr\.de|hr1\.de|hr2\.de|hr3\.de|hr4\.de|hr-inforadio\.de|youfm\.de|mdr\.de|jumpradio\.de|sputnik\.de|ndr\.de|n-joy\.de|radiobremen\.de|bremeneins\.de|bremenzwei\.de|bremenvier\.de|rbb-online\.de|rbb24\.de|radioeins\.de|fritz\.de|radio3\.de|inforadio\.de|antennebrandenburg\.de|sr\.de|sr-online\.de|unserding\.de|swr\.de|swr3\.de|dasding\.de|wdr\.de|1live\.de|cosmoradio\.de|einslive\.de|deutschlandfunk\.de|deutschlandfunkkultur\.de|deutschlandfunknova\.de|dradio\.de|dlf\.de|dw\.com)$/i;
const PUBLIC_NAMES = /^(1live|wdr ?[2-5]|wdr cosmo|cosmo|swr ?[1-4]|swr3|swr kultur|dasding|bayern ?[1-3]|br[ -]?klassik|br24|b5|puls|hr ?[1-4]|hr-info|hr info|you fm|mdr|jump|sputnik|ndr ?[1-2]|ndr ?90[,.]3|ndr kultur|ndr info|n-joy|bremen (eins|zwei|vier|next)|radio bremen|radioeins|fritz|radio ?3|inforadio|antenne brandenburg|rbb|sr ?[1-3]|unserding|antenne saar|deutschlandfunk|dlf|dradio|deutsche welle|dw )/i;

function groupOf(station) {
    if (/deutschlandfunk|dlf|dradio/i.test(`${station.name} ${station.homepage}`)) return 'Deutschlandradio';
    if (/deutsche welle|dw\.com/i.test(`${station.name} ${station.homepage}`)) return 'Deutsche Welle';
    return 'ARD';
}

function isPublic(station) {
    let host = '';
    try { host = new URL(station.homepage).hostname; } catch { /* ungültige URL */ }
    return PUBLIC_DOMAINS.test(host) || PUBLIC_NAMES.test(station.name.trim());
}

function cleanName(name) {
    return String(name || '').replace(/\s+/g, ' ').replace(/\s*\|\s*.*(mp3|aac|kbit|kbps).*$/i, '').trim();
}

function toStation(raw) {
    const url = raw.url_resolved || raw.url;
    if (!url || !raw.stationuuid) return null;
    return {
        id: raw.stationuuid,
        name: cleanName(raw.name),
        url,
        homepage: raw.homepage || null,
        favicon: /^https:\/\//.test(raw.favicon || '') ? raw.favicon : null,
        tags: String(raw.tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8),
        codec: raw.codec || null,
        bitrate: Number(raw.bitrate) || null,
        hls: raw.hls === 1 || /\.m3u8(\?|$)/i.test(url),
        state: raw.state || null,
        votes: Number(raw.votes) || 0,
        clicks: Number(raw.clickcount) || 0
    };
}

/** Doppelte Einträge (gleicher Name) zusammenfassen – der beliebteste gewinnt. */
function dedupe(stations) {
    const byName = new Map();
    for (const station of stations) {
        const key = station.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
        const existing = byName.get(key);
        if (!existing || station.clicks > existing.clicks || (station.url.startsWith('https:') && !existing.url.startsWith('https:') && station.clicks >= existing.clicks / 2)) {
            byName.set(key, station);
        }
    }
    return [...byName.values()];
}

class RadioProvider {
    constructor({ cacheFile = path.join(config.CACHE_DIR, 'radio.json') } = {}) {
        this.cacheFile = cacheFile;
        this.stations = [];
        this.updatedAt = null;
        this.timer = null;
        try {
            const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
            this.stations = cached.stations || [];
            this.updatedAt = cached.updatedAt || null;
        } catch { /* kein Cache */ }
    }

    start({ intervalHours = config.LIVE_REFRESH_HOURS } = {}) {
        const age = this.updatedAt ? Date.now() - Date.parse(this.updatedAt) : Infinity;
        if (age > intervalHours * 3600 * 1000) this.refresh();
        this.timer = setInterval(() => this.refresh(), intervalHours * 3600 * 1000);
        this.timer.unref();
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
    }

    async refresh() {
        const query = `/json/stations/search?countrycode=DE&hidebroken=true&order=clickcount&reverse=true&limit=${STATION_LIMIT}`;
        for (const host of API_HOSTS) {
            try {
                const raw = await fetchJson(host + query, { timeoutMs: 30000 });
                const stations = dedupe(raw.map(toStation).filter(Boolean));
                for (const station of stations) {
                    station.public = isPublic(station);
                    station.group = station.public ? groupOf(station) : null;
                }
                stations.sort((a, b) => b.clicks - a.clicks);
                this.stations = stations;
                this.updatedAt = new Date().toISOString();
                fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
                fs.writeFileSync(this.cacheFile, JSON.stringify({ updatedAt: this.updatedAt, stations }));
                logger.info('Radiosender aktualisiert', { stations: stations.length, public: stations.filter((s) => s.public).length, host });
                return;
            } catch (error) {
                logger.warn('radio-browser.info nicht erreichbar', { host, error: error.message });
            }
        }
    }

    /**
     * @param {{publicOnly?: boolean, group?: string, tag?: string, search?: string}} opts
     */
    list({ publicOnly = false, group, tag, search } = {}) {
        let list = this.stations;
        if (publicOnly) list = list.filter((s) => s.public);
        if (group) list = list.filter((s) => s.group === group);
        if (tag) {
            const t = tag.toLowerCase();
            list = list.filter((s) => s.tags.some((x) => x === t || x.includes(t)));
        }
        if (search) {
            const q = search.toLowerCase();
            list = list.filter((s) => s.name.toLowerCase().includes(q) || s.tags.some((x) => x.includes(q)));
        }
        return list;
    }

    get(id) {
        return this.stations.find((s) => s.id === id) || null;
    }

    stats() {
        return { stations: this.stations.length, updatedAt: this.updatedAt };
    }
}

const RADIO_TAGS = ['Pop', 'Rock', 'News', 'Schlager', 'Hip-Hop', 'Electronic', 'Classical', 'Jazz', 'Oldies', '80s', '90s', 'Chillout', 'Country', 'Metal', 'Kids'];

module.exports = { RadioProvider, RADIO_GROUPS, RADIO_TAGS, isPublic };
