'use strict';

// Benutzer-Konfiguration, die Stremio als erstes Pfadsegment mitschickt
// (https://host/<config>/manifest.json). Kodiert als base64url-JSON, damit
// keine Zeichen wie "/" oder "+" das Routing stören.

const { ALL_CHANNEL_NAMES, DEFAULT_CHANNEL_NAMES } = require('../mediathek/channels');
const { CATALOG_KEYS, DEFAULT_CATALOG_KEYS } = require('./catalogs');

const DEFAULT_MIN_DURATION = 5; // Minuten
const MAX_MIN_DURATION = 180;

const CHANNEL_LOOKUP = new Map(ALL_CHANNEL_NAMES.map((name) => [name.toLowerCase(), name]));

function defaults() {
    return {
        channels: [...DEFAULT_CHANNEL_NAMES],
        catalogs: [...DEFAULT_CATALOG_KEYS],
        minDuration: DEFAULT_MIN_DURATION
    };
}

function normalizeChannels(list) {
    if (typeof list === 'string') list = list.split(',');
    if (!Array.isArray(list)) return null;
    const result = [];
    for (const raw of list) {
        const name = CHANNEL_LOOKUP.get(String(raw).trim().toLowerCase());
        if (name && !result.includes(name)) result.push(name);
    }
    return result.length ? result : null;
}

function normalizeCatalogs(list) {
    if (typeof list === 'string') list = list.split(',');
    if (!Array.isArray(list)) return null;
    const result = list.map((k) => String(k).trim()).filter((k) => CATALOG_KEYS.includes(k));
    return result.length ? [...new Set(result)] : null;
}

function decodeRaw(segment) {
    // 1) base64url-JSON (aktuelles Format)  2) base64 (Format v2)  3) URL-kodiertes JSON
    const attempts = [
        () => Buffer.from(segment, 'base64url').toString('utf8'),
        () => Buffer.from(segment, 'base64').toString('utf8'),
        () => decodeURIComponent(segment)
    ];
    for (const attempt of attempts) {
        try {
            const value = JSON.parse(attempt());
            if (value && typeof value === 'object' && !Array.isArray(value)) return value;
        } catch { /* nächstes Format probieren */ }
    }
    return null;
}

/**
 * Liest die Konfiguration aus dem URL-Segment. Ungültige oder fehlende Werte
 * fallen auf Standardwerte zurück – ein Add-on soll nie wegen einer kaputten
 * Konfiguration komplett ausfallen.
 */
function parseUserConfig(segment) {
    const config = defaults();
    if (!segment) return config;
    const raw = decodeRaw(segment);
    if (!raw) return config;

    // Format v3: { c: [...], k: [...], d: 5 }   Format v2: { senders: "ARD,ZDF", minDuration: "5" }
    const channels = normalizeChannels(raw.c ?? raw.channels ?? raw.senders);
    if (channels) config.channels = channels;

    const catalogs = normalizeCatalogs(raw.k ?? raw.catalogs);
    if (catalogs) config.catalogs = catalogs;

    const minDuration = Number.parseInt(raw.d ?? raw.minDuration, 10);
    if (Number.isFinite(minDuration)) config.minDuration = Math.min(Math.max(minDuration, 0), MAX_MIN_DURATION);

    return config;
}

/** Kodiert eine Konfiguration (nur Abweichungen vom Standard) als URL-Segment. */
function encodeUserConfig(config) {
    const compact = {};
    const def = defaults();
    if (config.channels && !sameSet(config.channels, def.channels)) compact.c = config.channels;
    if (config.catalogs && !sameSet(config.catalogs, def.catalogs)) compact.k = config.catalogs;
    if (config.minDuration !== undefined && config.minDuration !== def.minDuration) compact.d = config.minDuration;
    if (!Object.keys(compact).length) return '';
    return Buffer.from(JSON.stringify(compact), 'utf8').toString('base64url');
}

function sameSet(a, b) {
    return a.length === b.length && a.every((x) => b.includes(x));
}

module.exports = { parseUserConfig, encodeUserConfig, defaults, DEFAULT_MIN_DURATION, MAX_MIN_DURATION };
