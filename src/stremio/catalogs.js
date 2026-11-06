'use strict';

// Katalog-Definitionen. `key` ist der kurze Schlüssel in der Benutzer-Konfiguration,
// `id` die Katalog-ID im Stremio-Manifest.

const { CATEGORY_IDS, FALLBACK_CATEGORY } = require('../mediathek/categories');

// Typ für Radiosender. Stremio unterstützt beliebige Typen, aber 'tv' wird
// in allen Apps (Web, Desktop, Android, TV) zuverlässig angezeigt.
const RADIO_TYPE = 'tv';

const CATALOGS = [
    { key: 'new', id: 'mvw.new', type: 'movie', name: 'Mediathek · Neu', kind: 'latest', genres: 'channels', default: true },
    { key: 'film', id: 'mvw.film', type: 'movie', name: 'Mediathek · Spielfilme', kind: 'category', category: 'Film', genres: 'channels', default: true },
    { key: 'krimi', id: 'mvw.krimi', type: 'movie', name: 'Mediathek · Krimis', kind: 'category', category: 'Krimi', genres: 'channels', default: true },
    { key: 'doku', id: 'mvw.doku', type: 'movie', name: 'Mediathek · Dokus & Reportagen', kind: 'category', category: 'Doku', genres: 'channels', default: true },
    { key: 'wissen', id: 'mvw.wissen', type: 'movie', name: 'Mediathek · Wissen', kind: 'category', category: 'Wissen', genres: 'channels', default: true },
    { key: 'kultur', id: 'mvw.kultur', type: 'movie', name: 'Mediathek · Kultur & Musik', kind: 'category', category: 'Kultur', genres: 'channels', default: false },
    { key: 'news', id: 'mvw.news', type: 'movie', name: 'Mediathek · Nachrichten & Politik', kind: 'category', category: 'Nachrichten', genres: 'channels', default: true },
    { key: 'kinder', id: 'mvw.kinder', type: 'movie', name: 'Mediathek · Kinder', kind: 'category', category: 'Kinder', genres: 'channels', default: true },
    { key: 'serien', id: 'mvw.serien', type: 'movie', name: 'Mediathek · Serienfolgen', kind: 'category', category: 'Serien', genres: 'channels', default: false },
    { key: 'unterhaltung', id: 'mvw.unterhaltung', type: 'movie', name: 'Mediathek · Unterhaltung & Satire', kind: 'category', category: 'Unterhaltung', genres: 'channels', default: false },
    { key: 'sport', id: 'mvw.sport', type: 'movie', name: 'Mediathek · Sport', kind: 'category', category: 'Sport', genres: 'channels', default: false },
    { key: 'shows', id: 'mvw.shows', type: 'series', name: 'Mediathek · Sendungen', kind: 'shows', genres: 'categories', search: 'optional', default: true },
    { key: 'search', id: 'mvw.search', type: 'movie', name: 'Mediathek', kind: 'search', search: 'required', default: true },
    { key: 'live', id: 'live.tv', type: 'tv', name: 'Live-TV', kind: 'live', genres: 'liveGroups', search: 'optional', default: true },
    { key: 'radio', id: 'radio.public', type: RADIO_TYPE, name: 'Radio · Öffentlich-rechtlich', kind: 'radio-public', genres: 'radioGroups', search: 'optional', default: true },
    { key: 'radiotop', id: 'radio.top', type: RADIO_TYPE, name: 'Radio · Beliebt in Deutschland', kind: 'radio-top', genres: 'radioTags', search: 'optional', default: false }
];

const CATALOG_KEYS = CATALOGS.map((c) => c.key);
const DEFAULT_CATALOG_KEYS = CATALOGS.filter((c) => c.default).map((c) => c.key);
const BY_ID = new Map(CATALOGS.map((c) => [c.id, c]));

const SHOW_GENRES = [...CATEGORY_IDS, FALLBACK_CATEGORY];

function catalogById(id) {
    return BY_ID.get(id) || null;
}

module.exports = { CATALOGS, CATALOG_KEYS, DEFAULT_CATALOG_KEYS, SHOW_GENRES, RADIO_TYPE, catalogById };
