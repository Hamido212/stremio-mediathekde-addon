'use strict';

const pkg = require('../../package.json');
const config = require('../config');
const { CATALOGS, SHOW_GENRES } = require('./catalogs');
const { LIVE_GROUPS } = require('../live/channels');
const { RADIO_GROUPS, RADIO_TAGS } = require('../live/radio');
const { ITEM_PREFIX, SHOW_PREFIX } = require('../mediathek/presenter');

const ADDON_ID = 'de.hamido212.mediathek';
const LIVE_PREFIX = 'mvw-live:';
const RADIO_PREFIX = 'mvw-radio:';
const ID_PREFIXES = [ITEM_PREFIX, SHOW_PREFIX, LIVE_PREFIX, RADIO_PREFIX];

function genreOptions(kind, userConfig) {
    switch (kind) {
        case 'channels': return userConfig.channels;
        case 'categories': return SHOW_GENRES;
        case 'liveGroups': return LIVE_GROUPS;
        case 'radioGroups': return RADIO_GROUPS;
        case 'radioTags': return RADIO_TAGS;
        default: return undefined;
    }
}

function buildCatalogs(userConfig) {
    return CATALOGS.filter((c) => userConfig.catalogs.includes(c.key)).map((c) => {
        const extra = [];
        if (c.search === 'required') extra.push({ name: 'search', isRequired: true });
        if (c.genres) extra.push({ name: 'genre', isRequired: false, options: genreOptions(c.genres, userConfig) });
        if (c.search === 'optional') extra.push({ name: 'search', isRequired: false });
        extra.push({ name: 'skip', isRequired: false });
        return {
            type: c.type,
            id: c.id,
            name: c.name,
            extra,
            extraSupported: extra.map((e) => e.name),
            ...(c.search === 'required' ? { extraRequired: ['search'] } : {})
        };
    });
}

/**
 * @param {object} userConfig  Ergebnis von parseUserConfig()
 * @param {string} origin      z.B. "https://mediathek.example.org"
 */
function buildManifest(userConfig, origin) {
    const description = [
        'Die öffentlich-rechtlichen Mediatheken (ARD, ZDF, ARTE, 3sat, phoenix, KiKA und alle Dritten) direkt in Stremio:',
        'Spielfilme, Krimis, Dokus, Sendungen als Serien, Live-TV und Radio. Alle Inhalte stammen aus frei zugänglichen, offiziellen Quellen.'
    ];
    if (config.DONATION_URL) description.push(`Gefällt dir das Add-on? Unterstützen: ${config.DONATION_URL}`);

    const types = [...new Set(buildCatalogs(userConfig).map((c) => c.type).concat(['movie', 'series', 'tv']))];

    return {
        id: ADDON_ID,
        version: pkg.version,
        name: 'Mediathek DE',
        description: description.join(' '),
        logo: `${origin}/logo.png`,
        background: `${origin}/art/brand/mediathek.svg?shape=landscape`,
        types,
        catalogs: buildCatalogs(userConfig),
        resources: [
            'catalog',
            { name: 'meta', types: ['movie', 'series', 'tv'], idPrefixes: ID_PREFIXES },
            { name: 'stream', types: ['movie', 'series', 'tv'], idPrefixes: ID_PREFIXES }
        ],
        idPrefixes: ID_PREFIXES,
        behaviorHints: {
            configurable: true,
            configurationRequired: false
        }
    };
}

module.exports = { buildManifest, ADDON_ID, LIVE_PREFIX, RADIO_PREFIX, ID_PREFIXES };
