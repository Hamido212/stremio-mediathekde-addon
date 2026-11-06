'use strict';

// Zerlegt Stremio-Add-on-Pfade gemäß Protokoll:
//   /[config/]manifest.json
//   /[config/]{resource}/{type}/{id}.json
//   /[config/]{resource}/{type}/{id}/{extra}.json   extra = "search=foo%20bar&skip=100"

const RESOURCES = new Set(['catalog', 'meta', 'stream', 'subtitles', 'addon_catalog']);

function safeDecode(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function parseExtra(raw) {
    const extra = {};
    if (!raw) return extra;
    for (const [key, value] of new URLSearchParams(raw)) {
        if (key) extra[key] = value;
    }
    return extra;
}

/**
 * @param {string} pathname  Roher (nicht dekodierter) URL-Pfad
 * @returns {null | {config: string|null, manifest: true} | {config: string|null, resource: string, type: string, id: string, extra: object}}
 */
function parseAddonPath(pathname) {
    const segments = pathname.split('/').filter(Boolean);
    if (!segments.length) return null;
    const last = segments[segments.length - 1];
    if (!last.endsWith('.json')) return null;
    segments[segments.length - 1] = last.slice(0, -'.json'.length);

    if (segments.length === 1 && segments[0] === 'manifest') return { config: null, manifest: true };
    if (segments.length === 2 && segments[1] === 'manifest') return { config: segments[0], manifest: true };

    let config = null;
    let rest = segments;
    if (!RESOURCES.has(rest[0]) && RESOURCES.has(rest[1])) {
        config = rest[0];
        rest = rest.slice(1);
    }
    if (!RESOURCES.has(rest[0]) || rest.length < 3 || rest.length > 4) return null;

    return {
        config,
        resource: rest[0],
        type: safeDecode(rest[1]),
        id: safeDecode(rest[2]),
        extra: parseExtra(rest[3])
    };
}

module.exports = { parseAddonPath, parseExtra, RESOURCES };
