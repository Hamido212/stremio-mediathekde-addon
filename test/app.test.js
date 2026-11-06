'use strict';

// Integrationstest der HTTP-Schicht gegen eine Fixture-Datenbank.
// Live-TV/Radio laufen mit festen Testdaten (kein Netzwerk).

const { buildFixtureDb } = require('./helpers');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { MediathekRepository } = require('../src/mediathek/repository');
const { LiveTvProvider } = require('../src/live/livetv');
const { RadioProvider } = require('../src/live/radio');
const { Addon } = require('../src/stremio/addon');
const { createApp } = require('../src/app');
const { encodeUserConfig } = require('../src/stremio/user-config');

let server;
let base;

before(async () => {
    const { target } = buildFixtureDb();
    const repository = new MediathekRepository();
    repository.open(target);

    const live = new LiveTvProvider();
    live.channels = [{ id: 'zdf', name: 'ZDF', group: 'Hauptprogramme', color: '#e8740c', logo: null, streams: [{ label: 'Live', url: 'https://zdf.example/live.m3u8', status: 'ok' }] }];
    const radio = new RadioProvider();
    radio.stations = [
        { id: 'r1', name: '1LIVE', url: 'http://wdr.example/1live.mp3', tags: ['pop'], public: true, group: 'ARD', codec: 'MP3', bitrate: 128, clicks: 10 },
        { id: 'r2', name: 'Privatradio', url: 'https://priv.example/stream', tags: ['rock'], public: false, group: null, codec: 'AAC', bitrate: 64, clicks: 5 }
    ];

    const addon = new Addon({ repository, live, radio });
    const app = createApp({ addon, repository, live, radio });
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server?.close());

async function get(path) {
    const res = await fetch(base + path);
    const type = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, body: type.includes('json') ? await res.json() : await res.text() };
}

test('manifest + CORS', async () => {
    const { status, headers, body } = await get('/manifest.json');
    assert.equal(status, 200);
    assert.equal(headers.get('access-control-allow-origin'), '*');
    assert.equal(body.id, 'de.hamido212.mediathek');
    assert.ok(body.catalogs.length > 5);
    assert.equal(body.logo, `${base}/logo.png`);
});

test('configured manifest uses config for catalogs and genre options', async () => {
    const cfg = encodeUserConfig({ channels: ['ZDF'], catalogs: ['film', 'live'], minDuration: 0 });
    const { body } = await get(`/${cfg}/manifest.json`);
    assert.deepEqual(body.catalogs.map((c) => c.id), ['mvw.film', 'live.tv']);
    assert.deepEqual(body.catalogs[0].extra.find((e) => e.name === 'genre').options, ['ZDF']);
});

test('catalogs: category, genre filter, search, shows, cache headers', async () => {
    const krimi = await get('/catalog/movie/mvw.krimi.json');
    assert.deepEqual(krimi.body.metas.map((m) => m.id), ['mvw:a1', 'mvw:a3']);
    assert.match(krimi.headers.get('cache-control'), /max-age=\d+/);
    assert.ok(krimi.body.metas[0].poster.endsWith('/art/item/a1.svg'));

    const film = await get('/catalog/movie/mvw.film/genre=ZDF.json');
    assert.deepEqual(film.body.metas.map((m) => m.id), ['mvw:b1']);

    const search = await get('/catalog/movie/mvw.search/search=sendung%20maus.json');
    assert.equal(search.body.metas.length, 2);

    const shows = await get('/catalog/series/mvw.shows/search=tatort.json');
    assert.equal(shows.body.metas[0].name, 'Tatort');
    assert.equal(shows.body.metas[0].type, 'series');

    const unknown = await get('/catalog/movie/does.not.exist.json');
    assert.deepEqual(unknown.body.metas, []);
});

test('minimum duration from config hides short clips', async () => {
    const cfg = encodeUserConfig({ channels: ['SRF'], minDuration: 0 });
    const all = await get(`/${cfg}/catalog/movie/mvw.sport.json`);
    assert.equal(all.body.metas.length, 1);
    const cfg5 = encodeUserConfig({ channels: ['SRF'], minDuration: 5 });
    const filtered = await get(`/${cfg5}/catalog/movie/mvw.sport.json`);
    assert.equal(filtered.body.metas.length, 0);
});

test('meta + streams for an item and a show', async () => {
    const meta = await get('/meta/movie/mvw:a1.json');
    assert.equal(meta.body.meta.name, 'Tatort: Wehrlos');
    assert.match(meta.body.meta.description, /Köln/);

    const streams = await get('/stream/movie/mvw:a1.json');
    const names = streams.body.streams.map((s) => s.name.split('\n')[1]);
    assert.deepEqual(names, ['HD', 'SD', 'Mobil', 'Audiodeskription', 'Web']);
    assert.equal(streams.body.streams[0].url, 'https://cdn.example.org/videos/a1/video_1920x1080.mp4');
    assert.equal(streams.body.streams[0].subtitles[0].url, `${base}/subtitles/a1.vtt`);

    const shows = await get('/catalog/series/mvw.shows/search=bergretter.json');
    const show = await get(`/meta/series/${encodeURIComponent(shows.body.metas[0].id)}.json`);
    assert.deepEqual(show.body.meta.videos.map((v) => [v.season, v.episode]), [[1, 2], [1, 1]]);

    const missing = await get('/meta/movie/mvw:nope.json');
    assert.equal(missing.body.meta, null);
});

test('live TV and radio', async () => {
    const live = await get('/catalog/tv/live.tv.json');
    assert.deepEqual(live.body.metas.map((m) => m.id), ['mvw-live:zdf']);
    const liveStreams = await get('/stream/tv/mvw-live:zdf.json');
    assert.equal(liveStreams.body.streams[0].url, `${base}/live/zdf/0.m3u8`);
    assert.equal(liveStreams.body.streams.at(-1).url, 'https://zdf.example/live.m3u8', 'Original als Alternative');

    const radio = await get('/catalog/tv/radio.public.json');
    assert.deepEqual(radio.body.metas.map((m) => m.name), ['1LIVE']);
    const top = await get('/catalog/tv/radio.top/genre=Rock.json');
    assert.deepEqual(top.body.metas.map((m) => m.name), ['Privatradio']);
    const stream = await get('/stream/tv/mvw-radio:r1.json');
    assert.equal(stream.body.streams[0].behaviorHints.notWebReady, true, 'http-Stream über Streaming-Server');
});

test('images, configure page, health and 404', async () => {
    const svg = await get('/art/item/a1.svg');
    assert.equal(svg.status, 200);
    assert.match(svg.headers.get('content-type'), /svg/);
    assert.match(svg.body, /Wehrlos/);
    assert.equal((await get('/art/item/nope.svg')).status, 404);
    assert.equal((await get('/art/live/zdf.svg?shape=landscape')).status, 200);

    const logo = await fetch(`${base}/logo.png`);
    assert.equal(logo.headers.get('content-type'), 'image/png');

    const page = await get('/configure');
    assert.match(page.body, /Mediathek DE/);
    assert.match(page.body, /In Stremio installieren/);
    // stremio.io ist eine geparkte Domain mit Betrugs-Weiterleitungen – nur die offizielle Domain verlinken
    assert.match(page.body, /https:\/\/web\.stremio\.com\/#\/addons\?addon=/);
    assert.doesNotMatch(page.body, /stremio\.io/);

    const health = await get('/health');
    assert.equal(health.body.status, 'ok');
    assert.equal(health.body.mediathek.items, 13);

    assert.equal((await get('/does/not/exist')).status, 404);
});

test('review fixes: manifest background resolves, proxy headers build public URLs', async () => {
    const { body } = await get('/manifest.json');
    const bg = await fetch(body.background);
    assert.equal(bg.status, 200, 'Hintergrundbild des Manifests existiert');

    const res = await fetch(`${base}/manifest.json`, {
        headers: { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'mediathek.example.de' }
    });
    const proxied = await res.json();
    assert.equal(proxied.logo, 'https://mediathek.example.de/logo.png');

    const pre = await fetch(`${base}/manifest.json`, { method: 'OPTIONS', headers: { 'Access-Control-Request-Private-Network': 'true' } });
    assert.equal(pre.headers.get('access-control-allow-private-network'), 'true');
});

test('legacy live:/radio: ids from v3.0.0 installs still resolve, foreign live: ids do not', async () => {
    const meta = await get('/meta/tv/live:zdf.json');
    assert.equal(meta.body.meta.id, 'live:zdf', 'Antwort-ID entspricht der Anfrage');
    assert.equal(meta.body.meta.behaviorHints.defaultVideoId, 'live:zdf');
    const streams = await get('/stream/tv/live:zdf.json');
    assert.equal(streams.body.streams.at(-1).url, 'https://zdf.example/live.m3u8');
    const radio = await get('/stream/tv/radio:r1.json');
    assert.equal(radio.body.streams.length, 1);
    const foreign = await get('/meta/tv/live:pluto_tv_animals.json');
    assert.equal(foreign.body.meta, null);
});
