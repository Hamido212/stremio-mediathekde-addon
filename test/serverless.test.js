'use strict';

// Testet den Vercel-Einstiegspunkt: Daten liegen fertig im Datenverzeichnis,
// zur Laufzeit wird nichts geschrieben.

const { buildFixtureDb, TMP } = require('./helpers');
const fs = require('fs');
const path = require('path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

let server;
let base;

before(async () => {
    const { target } = buildFixtureDb();
    fs.renameSync(target, path.join(TMP, 'app', 'app.db'));
    fs.mkdirSync(path.join(TMP, 'cache'), { recursive: true });
    fs.writeFileSync(path.join(TMP, 'cache', 'live-tv.json'), JSON.stringify({
        updatedAt: new Date().toISOString(),
        channels: [{ id: 'zdf', logo: null, streams: [{ label: 'Live', url: 'https://zdf.example/live.m3u8', status: 'ok' }] }]
    }));
    fs.writeFileSync(path.join(TMP, 'cache', 'radio.json'), JSON.stringify({
        updatedAt: new Date().toISOString(),
        stations: [{ id: 'r1', name: 'Deutschlandfunk', url: 'https://dlf.example/s.mp3', tags: ['news'], public: true, group: 'Deutschlandradio', clicks: 1 }]
    }));
    const before = new Set(fs.readdirSync(TMP, { recursive: true }));

    process.env.READ_ONLY = '1';
    const app = require('../src/serverless');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    server.filesBefore = before;
});

after(() => server?.close());

test('serverless app serves catalogs, live TV and radio from bundled data', async () => {
    const manifest = await (await fetch(`${base}/manifest.json`)).json();
    assert.equal(manifest.id, 'de.hamido212.mediathek');

    const krimi = await fetch(`${base}/catalog/movie/mvw.krimi.json`);
    assert.match(krimi.headers.get('cache-control'), /s-maxage=\d+/, 'CDN-Caching aktiv');
    assert.deepEqual((await krimi.json()).metas.map((m) => m.id), ['mvw:a1', 'mvw:a3']);

    const live = await (await fetch(`${base}/catalog/tv/live.tv.json`)).json();
    assert.ok(live.metas.some((m) => m.id === 'mvw-live:zdf'), 'kuratierte Senderliste + gebaute Streams');
    const zdf = await (await fetch(`${base}/stream/tv/mvw-live:zdf.json`)).json();
    assert.equal(zdf.streams.at(-1).url, 'https://zdf.example/live.m3u8', 'Stream aus dem Build-Cache');

    const radio = await (await fetch(`${base}/catalog/tv/radio.public.json`)).json();
    assert.deepEqual(radio.metas.map((m) => m.name), ['Deutschlandfunk']);

    const health = await (await fetch(`${base}/health`)).json();
    assert.equal(health.status, 'ok');
    assert.equal(health.update, null, 'kein Scheduler im serverlosen Betrieb');
});

test('serverless app does not write to the data directory', () => {
    const after = new Set(fs.readdirSync(TMP, { recursive: true }));
    const created = [...after].filter((f) => !server.filesBefore.has(f));
    assert.deepEqual(created, []);
});
