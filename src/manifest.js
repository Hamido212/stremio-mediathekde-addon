// Stremio Add-on Manifest

const config = require('./config');

// Top-Level Genres (Kategorien + Sender)
const GENRES = [
    // Kategorien
    'Doku',
    'News',
    'Krimi',
    'Kinder',
    'Kultur',
    'Wissen',
    
    // Sender
    'ARD',
    'ZDF',
    'arte',
    '3sat',
    'WDR',
    'NDR',
    'BR',
    'SWR',
    'MDR',
    'HR',
    'RBB'
];

// Katalog-Definitionen (ohne options in extra)
const CATALOGS = [
    {
        type: 'movie',
        id: 'de_new',
        name: '🆕 Neu (7 Tage)',
        extraSupported: ['genre', 'skip']
    },
    {
        type: 'movie',
        id: 'de_docs',
        name: '📺 Dokus & Reportagen',
        extraSupported: ['genre', 'skip']
    },
    {
        type: 'movie',
        id: 'de_news',
        name: '📰 Nachrichten & Politik',
        extraSupported: ['genre', 'skip']
    },
    {
        type: 'movie',
        id: 'de_knowledge',
        name: '🧠 Kultur & Wissen',
        extraSupported: ['genre', 'skip']
    },
    {
        type: 'movie',
        id: 'de_crime',
        name: '🔍 Krimi & Thriller',
        extraSupported: ['genre', 'skip']
    },
    {
        type: 'movie',
        id: 'de_kids',
        name: '👶 Kinder',
        extraSupported: ['genre', 'skip']
    },
    {
        type: 'movie',
        id: 'de_arte',
        name: '🎭 Arte Highlights',
        extraSupported: ['genre', 'skip']
    },
    {
        type: 'movie',
        id: 'de_search',
        name: '🔎 Suche',
        extra: [
            { name: 'search', isRequired: true },
            { name: 'genre', isRequired: false },
            { name: 'skip', isRequired: false }
        ]
    }
];

// Manifest (Best Practice: genres auf Top-Level)
const manifest = {
    id: 'de.mediathek.local',
    version: '2.0.0',
    name: 'DE Mediatheken',
    description: 'Deutsche Mediatheken (ARD, ZDF, Arte, 3sat, etc.) mit lokaler SQLite-Datenbank',
    logo: 'https://raw.githubusercontent.com/stremio/stremio-colors/master/dist/icons/icon-transparent.png',
    background: 'https://dl.strem.io/addon-background.jpg',
    
    types: ['movie'],
    resources: ['catalog', 'meta', 'stream'],
    idPrefixes: ['de-mvw:'],
    
    // Genres auf Top-Level (Best Practice)
    genres: GENRES,
    
    // Kataloge
    catalogs: CATALOGS,
    
    // Konfiguration unterstützen (wir haben /configure UI)
    behaviorHints: {
        configurable: true,
        configurationRequired: false
    }
};

module.exports = { manifest, GENRES, CATALOGS };
