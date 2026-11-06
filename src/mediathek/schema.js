'use strict';

// Schema der App-Datenbank. Wird bei jedem Update komplett neu aufgebaut
// (frische Datei + atomarer Wechsel), daher sind keine Migrationen nötig.
// SCHEMA_VERSION erhöhen, wenn sich das Schema ändert – der Server baut dann neu.

const SCHEMA_VERSION = 5;

const CREATE_TABLES = `
CREATE TABLE items (
    rowid       INTEGER PRIMARY KEY,
    id          TEXT NOT NULL UNIQUE,      -- MediathekView idhash
    show_id     TEXT NOT NULL,
    channel     TEXT NOT NULL,
    show        TEXT,
    title       TEXT NOT NULL,
    description TEXT,
    aired       INTEGER,                   -- Unix-Zeit (Sekunden)
    duration    INTEGER,                   -- Sekunden
    category    TEXT NOT NULL,
    variant     TEXT,                      -- z.B. 'Audiodeskription' (sonst NULL)
    base_title  TEXT,                      -- Titel ohne Varianten-Zusatz (nur bei Varianten)
    hidden      INTEGER NOT NULL DEFAULT 0,-- 1 = Variante einer vorhandenen Hauptfassung
    website     TEXT,
    url         TEXT NOT NULL,             -- Standardqualität
    url_hd      TEXT,                      -- relativ zu url kodiert (siehe urls.js)
    url_low     TEXT,                      -- relativ zu url kodiert
    url_sub     TEXT,
    poster      TEXT
);

CREATE TABLE shows (
    rowid       INTEGER PRIMARY KEY,
    id          TEXT NOT NULL UNIQUE,
    channel     TEXT NOT NULL,
    name        TEXT NOT NULL,
    category    TEXT,
    episodes    INTEGER NOT NULL,
    recent      INTEGER NOT NULL DEFAULT 0, -- Folgen der letzten 30 Tage
    generic     INTEGER NOT NULL DEFAULT 0, -- 1 = nur Rubrik (z.B. "Filme in der ARD")
    latest      INTEGER,
    first       INTEGER,
    poster      TEXT,
    background  TEXT
);

CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);
`;

const CREATE_INDEXES = `
CREATE INDEX idx_items_show_title     ON items(show_id, title);
CREATE INDEX idx_items_aired          ON items(aired DESC);
CREATE INDEX idx_items_category_aired ON items(category, aired DESC);
CREATE INDEX idx_items_channel_aired  ON items(channel, aired DESC);
CREATE INDEX idx_items_show_aired     ON items(show_id, aired DESC);
CREATE INDEX idx_shows_recent         ON shows(recent DESC, latest DESC);
CREATE INDEX idx_shows_category       ON shows(category, recent DESC, latest DESC);
`;

const CREATE_FTS = `
CREATE VIRTUAL TABLE items_fts USING fts5(
    title, show, channel,
    content='items', content_rowid='rowid',
    tokenize="unicode61 remove_diacritics 2"
);
CREATE VIRTUAL TABLE shows_fts USING fts5(
    name, channel,
    content='shows', content_rowid='rowid',
    tokenize="unicode61 remove_diacritics 2"
);
INSERT INTO items_fts(items_fts, rank) VALUES ('rank', 'bm25(4.0, 2.0, 0.5)');
INSERT INTO shows_fts(shows_fts, rank) VALUES ('rank', 'bm25(4.0, 0.5)');
INSERT INTO items_fts(items_fts) VALUES ('rebuild');
INSERT INTO shows_fts(shows_fts) VALUES ('rebuild');
`;

module.exports = { SCHEMA_VERSION, CREATE_TABLES, CREATE_INDEXES, CREATE_FTS };
