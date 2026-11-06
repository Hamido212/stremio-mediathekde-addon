'use strict';

// Test-Hilfen: isoliertes Datenverzeichnis + Mini-Quelldatenbank im
// MediathekView-v2-Schema.

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mvw-test-'));
process.env.DATA_DIR = TMP;
process.env.NODE_ENV = 'test';

const Database = require('better-sqlite3');

const NOW = Math.floor(Date.now() / 1000);
const DAY = 24 * 3600;

const CHANNELS = [[1, '3Sat'], [2, 'ARD'], [3, 'ARTE.FR'], [4, 'KiKA'], [5, 'ZDF'], [6, 'SRF']];

// [id, idhash, channelId, show, title, airedOffsetDays, durationSec, desc, url_sub]
const FILMS = [
    [1, 'a1', 2, 'Tatort', 'Tatort: Wehrlos', 1, 5400, 'Ein Krimi aus Köln.', 'https://example.org/sub/a1.xml'],
    [2, 'a2', 2, 'Tatort', 'Tatort: Wehrlos (Audiodeskription)', 1, 5400, 'Hörfassung.', ''],
    [3, 'a3', 2, 'Tatort', 'Tatort: Ausgezählt', 8, 5300, 'Noch ein Krimi.', ''],
    [4, 'b1', 5, 'Filme', 'Das große Abenteuer', 2, 6000, 'Ein Spielfilm.', ''],
    [5, 'c1', 4, 'Die Sendung mit der Maus', 'Die Sendung mit der Maus vom 01.11.2026', 3, 1800, 'Lach- und Sachgeschichten.', ''],
    [6, 'c2', 4, 'Die Sendung mit der Maus', 'Die Sendung mit der Maus vom 25.10.2026', 10, 1800, 'Mehr Sachgeschichten.', ''],
    [7, 'd1', 2, 'tagesschau', 'tagesschau 20:00 Uhr', 0.5, 900, 'Nachrichten.', ''],
    [8, 'e1', 3, 'Cinéma - Films', 'Le grand film', 4, 5600, 'Un film.', ''],
    [9, 'f1', 1, 'Kulturzeit', 'Kulturzeit vom 05.11.2026', 1, 2400, 'Kultur.', ''],
    [10, 'g1', 6, 'Sport-Clip', 'Ski alpin: Highlights', 1, 120, 'Sport.', ''],
    [11, 'h1', 5, 'Die Bergretter', 'Folge 1: Absturz (S01/E01)', 30, 2700, 'Serie.', ''],
    [12, 'h2', 5, 'Die Bergretter', 'Folge 2: Lawine (S01/E02)', 20, 2700, 'Serie.', ''],
    [13, 'x1', 5, 'Zukunft', 'Ausstrahlung in der Zukunft', -400, 2700, 'Noch nicht gelaufen.', '']
];

function createSourceDb(file = path.join(TMP, 'source.db')) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    const db = new Database(file);
    db.exec(`
        CREATE TABLE channel (id INTEGER PRIMARY KEY, dtCreated INTEGER DEFAULT 0, touched INTEGER DEFAULT 1, channel TEXT NOT NULL);
        CREATE TABLE show (id INTEGER PRIMARY KEY, dtCreated INTEGER DEFAULT 0, touched INTEGER DEFAULT 1, channelid INTEGER, show TEXT NOT NULL, search TEXT NOT NULL);
        CREATE TABLE film (id INTEGER PRIMARY KEY, idhash TEXT NOT NULL, dtCreated INTEGER DEFAULT 0, touched INTEGER DEFAULT 1,
            channelid INTEGER NOT NULL, showid INTEGER NOT NULL, title TEXT NOT NULL, search TEXT NOT NULL, aired INTEGER,
            duration INTEGER, size INTEGER, description TEXT, website TEXT, url_sub TEXT, url_video TEXT, url_video_sd TEXT, url_video_hd TEXT);
    `);
    const insChannel = db.prepare('INSERT INTO channel (id, channel) VALUES (?, ?)');
    for (const [id, name] of CHANNELS) insChannel.run(id, name);

    const shows = new Map();
    const insShow = db.prepare('INSERT INTO show (channelid, show, search) VALUES (?, ?, ?)');
    const insFilm = db.prepare(`INSERT INTO film (id, idhash, channelid, showid, title, search, aired, duration, description, website, url_sub, url_video, url_video_sd, url_video_hd)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const [id, hash, channelId, show, title, days, duration, desc, sub] of FILMS) {
        const key = `${channelId}|${show}`;
        if (!shows.has(key)) shows.set(key, insShow.run(channelId, show, show.toLowerCase()).lastInsertRowid);
        const base = `https://cdn.example.org/videos/${hash}/video_1280x720.mp4`;
        insFilm.run(id, hash, channelId, shows.get(key), title, title.toLowerCase(), Math.round(NOW - days * DAY), duration, desc,
            `https://mediathek.example.org/${hash}`, sub, base,
            `https://cdn.example.org/videos/${hash}/video_640x360.mp4`,
            `https://cdn.example.org/videos/${hash}/video_1920x1080.mp4`);
    }
    db.close();
    return file;
}

function buildFixtureDb() {
    const { buildAppDb } = require('../src/mediathek/builder');
    const source = createSourceDb();
    const target = path.join(TMP, 'app', 'app-1.db');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const stats = buildAppDb({ sourcePath: source, targetPath: target, info: { source_url: 'fixture' } });
    return { target, stats };
}

module.exports = { TMP, NOW, DAY, createSourceDb, buildFixtureDb };
