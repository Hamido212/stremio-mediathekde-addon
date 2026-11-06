'use strict';

// Sender-Stammdaten: Normalisierung der MediathekView-Sendernamen auf
// einheitliche Anzeigenamen, plus Farbe (für generierte Poster), Gruppe und
// ob der Sender standardmäßig aktiv ist.

const CHANNELS = [
    { name: 'ARD', sources: ['ARD'], color: '#00326e', group: 'ARD', default: true },
    { name: 'ZDF', sources: ['ZDF'], color: '#e8740c', group: 'ZDF', default: true },
    { name: 'ARTE', sources: ['ARTE.DE'], color: '#e0531a', group: 'Weitere', default: true },
    { name: '3sat', sources: ['3Sat', '3sat'], color: '#b4002d', group: 'Weitere', default: true },
    { name: 'phoenix', sources: ['PHOENIX', 'phoenix'], color: '#1f5e8c', group: 'Weitere', default: true },
    { name: 'tagesschau24', sources: ['tagesschau24'], color: '#0a2a5e', group: 'ARD', default: true },
    { name: 'ONE', sources: ['ONE'], color: '#3a2a6e', group: 'ARD', default: true },
    { name: 'ARD alpha', sources: ['ARD-alpha'], color: '#1b6f8a', group: 'ARD', default: true },
    { name: 'BR', sources: ['BR'], color: '#0068b4', group: 'ARD', default: true },
    { name: 'hr', sources: ['HR'], color: '#005ca9', group: 'ARD', default: true },
    { name: 'MDR', sources: ['MDR'], color: '#003d7d', group: 'ARD', default: true },
    { name: 'NDR', sources: ['NDR'], color: '#0c4a95', group: 'ARD', default: true },
    { name: 'Radio Bremen', sources: ['Radio Bremen TV'], color: '#d20a11', group: 'ARD', default: true },
    { name: 'rbb', sources: ['RBB'], color: '#c4002b', group: 'ARD', default: true },
    { name: 'SR', sources: ['SR'], color: '#00579c', group: 'ARD', default: true },
    { name: 'SWR', sources: ['SWR'], color: '#2b2e83', group: 'ARD', default: true },
    { name: 'WDR', sources: ['WDR'], color: '#00345e', group: 'ARD', default: true },
    { name: 'ZDFinfo', sources: ['ZDFinfo'], color: '#33608c', group: 'ZDF', default: true },
    { name: 'ZDFneo', sources: ['ZDFneo'], color: '#3a7d44', group: 'ZDF', default: true },
    { name: 'KiKA', sources: ['KiKA', 'KIKA'], color: '#6cb32c', group: 'Kinder', default: true },
    { name: 'ZDFtivi', sources: ['ZDF-tivi'], color: '#f39200', group: 'Kinder', default: true },
    { name: 'funk', sources: ['Funk.net'], color: '#141414', group: 'Weitere', default: true },
    { name: 'DW', sources: ['DW'], color: '#05141f', group: 'Weitere', default: true },
    { name: 'ORF', sources: ['ORF'], color: '#c8102e', group: 'Österreich & Schweiz', default: false, geo: 'AT' },
    { name: 'SRF', sources: ['SRF'], color: '#af001e', group: 'Österreich & Schweiz', default: false, geo: 'CH' },
    { name: 'ARTE (FR)', sources: ['ARTE.FR'], color: '#e0531a', group: 'ARTE fremdsprachig', default: false, lang: 'fr' },
    { name: 'ARTE (EN)', sources: ['ARTE.EN'], color: '#e0531a', group: 'ARTE fremdsprachig', default: false, lang: 'en' },
    { name: 'ARTE (ES)', sources: ['ARTE.ES'], color: '#e0531a', group: 'ARTE fremdsprachig', default: false, lang: 'es' },
    { name: 'ARTE (IT)', sources: ['ARTE.IT'], color: '#e0531a', group: 'ARTE fremdsprachig', default: false, lang: 'it' },
    { name: 'ARTE (PL)', sources: ['ARTE.PL'], color: '#e0531a', group: 'ARTE fremdsprachig', default: false, lang: 'pl' },
    { name: 'Rocket Beans TV', sources: ['rbtv', 'RBTV'], color: '#1d1d1b', group: 'Weitere', default: false }
];

const BY_SOURCE = new Map();
const BY_NAME = new Map();
for (const channel of CHANNELS) {
    BY_NAME.set(channel.name, channel);
    for (const source of channel.sources) BY_SOURCE.set(source.toLowerCase(), channel);
}

/** MediathekView-Sendername → Anzeigename (unbekannte Sender bleiben unverändert). */
function normalizeChannel(sourceName) {
    if (!sourceName) return 'Unbekannt';
    const known = BY_SOURCE.get(String(sourceName).toLowerCase());
    return known ? known.name : String(sourceName).trim();
}

function getChannel(name) {
    return BY_NAME.get(name) || null;
}

const FALLBACK_COLORS = ['#2d3a8c', '#7a2d8c', '#8c2d4a', '#2d7a8c', '#3d8c2d', '#8c5a2d', '#4a4a6a', '#1f6f5c'];

function channelColor(name) {
    const channel = BY_NAME.get(name);
    if (channel) return channel.color;
    // Stabile Fallback-Farbe aus dem Namen ableiten
    let hash = 0;
    for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

const ALL_CHANNEL_NAMES = CHANNELS.map((c) => c.name);
const DEFAULT_CHANNEL_NAMES = CHANNELS.filter((c) => c.default).map((c) => c.name);

module.exports = {
    CHANNELS,
    ALL_CHANNEL_NAMES,
    DEFAULT_CHANNEL_NAMES,
    normalizeChannel,
    getChannel,
    channelColor
};
