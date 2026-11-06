'use strict';

require('./helpers');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseAddonPath } = require('../src/stremio/protocol');
const { parseUserConfig, encodeUserConfig, defaults } = require('../src/stremio/user-config');
const { buildManifest } = require('../src/stremio/manifest');
const { displayTitle, episodeTitle, parseSeasonEpisode, itemStreams, showMeta } = require('../src/mediathek/presenter');
const { ttmlToVtt, srtToVtt, parseTime } = require('../src/mediathek/subtitles');
const { renderArt, wrap } = require('../src/web/art');

test('protocol: manifest with and without config', () => {
    assert.deepEqual(parseAddonPath('/manifest.json'), { config: null, manifest: true });
    assert.deepEqual(parseAddonPath('/eyJkIjoxMH0/manifest.json'), { config: 'eyJkIjoxMH0', manifest: true });
    assert.equal(parseAddonPath('/favicon.ico'), null);
    assert.equal(parseAddonPath('/foo/bar/baz/qux/quux.json'), null);
});

test('protocol: catalog extras incl. spaces, ampersands and combined params', () => {
    const r = parseAddonPath('/catalog/movie/mvw.search/search=die%20maus%20%26%20co&skip=100.json');
    assert.equal(r.resource, 'catalog');
    assert.equal(r.id, 'mvw.search');
    assert.deepEqual(r.extra, { search: 'die maus & co', skip: '100' });

    const c = parseAddonPath('/abc123/catalog/movie/mvw.film/genre=ZDF&skip=200.json');
    assert.equal(c.config, 'abc123');
    assert.deepEqual(c.extra, { genre: 'ZDF', skip: '200' });

    const plain = parseAddonPath('/catalog/series/mvw.shows.json');
    assert.deepEqual(plain.extra, {});
});

test('protocol: meta/stream ids with colons are decoded', () => {
    const r = parseAddonPath('/stream/movie/mvw%3Aabc123.json');
    assert.equal(r.id, 'mvw:abc123');
    const s = parseAddonPath('/cfg/meta/series/mvw-show:abc.json');
    assert.equal(s.config, 'cfg');
    assert.equal(s.id, 'mvw-show:abc');
});

test('user config: defaults, round-trip, legacy v2 format and garbage', () => {
    assert.deepEqual(parseUserConfig(null), defaults());
    assert.equal(encodeUserConfig(defaults()), '', 'Standard braucht keine Konfiguration');

    const custom = { channels: ['ZDF', 'ARTE'], catalogs: ['film', 'live'], minDuration: 0 };
    const segment = encodeUserConfig(custom);
    assert.match(segment, /^[A-Za-z0-9_-]+$/, 'URL-sicher');
    assert.deepEqual(parseUserConfig(segment), custom);

    const legacy = Buffer.from(JSON.stringify({ senders: 'ARD,arte,HR', minDuration: '10' })).toString('base64');
    const parsed = parseUserConfig(legacy);
    assert.deepEqual(parsed.channels, ['ARD', 'ARTE', 'hr']);
    assert.equal(parsed.minDuration, 10);

    assert.deepEqual(parseUserConfig('%%%nonsense'), defaults());
    assert.deepEqual(parseUserConfig(encodeURIComponent(JSON.stringify({ c: ['ZDF'] }))).channels, ['ZDF']);
    assert.equal(parseUserConfig(encodeUserConfig({ minDuration: 999 })).minDuration, 180);
});

test('manifest: only enabled catalogs, genre options from config, valid structure', () => {
    const manifest = buildManifest({ ...defaults(), channels: ['ZDF', 'ARD'], catalogs: ['film', 'search', 'live'] }, 'https://x.example');
    assert.equal(manifest.id, 'de.hamido212.mediathek');
    assert.deepEqual(manifest.catalogs.map((c) => c.id), ['mvw.film', 'mvw.search', 'live.tv']);
    const film = manifest.catalogs[0];
    assert.deepEqual(film.extra.find((e) => e.name === 'genre').options, ['ZDF', 'ARD']);
    const search = manifest.catalogs[1];
    assert.equal(search.extra.find((e) => e.name === 'search').isRequired, true);
    assert.equal(manifest.logo, 'https://x.example/logo.png');
    assert.ok(manifest.behaviorHints.configurable);
    assert.ok(manifest.idPrefixes.includes('mvw:'));
});

test('presenter: titles and episode numbering', () => {
    assert.equal(displayTitle({ show: 'Sturm der Liebe', title: 'Folge 4668' }), 'Sturm der Liebe – Folge 4668');
    assert.equal(displayTitle({ show: 'Tatort', title: 'Tatort: Wehrlos' }), 'Tatort: Wehrlos');
    assert.equal(displayTitle({ show: 'Filme in der ARD', title: 'Das Piano' }), 'Das Piano');
    assert.equal(episodeTitle({ title: 'Tatort: Wehrlos' }, 'Tatort'), 'Wehrlos');
    assert.deepEqual(parseSeasonEpisode('Folge 168: Gefallene Götter (S11/E12)'), { season: 11, episode: 12 });
    assert.equal(parseSeasonEpisode('Folge 4668'), null);

    const now = Date.UTC(2026, 10, 6) / 1000;
    const meta = showMeta(
        { id: 's', name: 'Show', channel: 'ZDF', episodes: 3, first: now - 400 * 86400, latest: now },
        [
            { id: '3', title: 'C', aired: now, description: 'neu' },
            { id: '2', title: 'B', aired: now - 86400 },
            { id: '1', title: 'A', aired: now - 400 * 86400 }
        ],
        'https://x'
    );
    assert.deepEqual(meta.videos.map((v) => [v.id, v.season, v.episode]), [['mvw:3', 2026, 2], ['mvw:2', 2026, 1], ['mvw:1', 2025, 1]]);
});

test('presenter: streams in all qualities plus variants and web fallback', () => {
    const item = {
        id: 'a1', show_id: 's', channel: 'ARD', title: 'Tatort: Wehrlos', show: 'Tatort', duration: 5400,
        url: 'https://cdn/x_1280.mp4', url_hd: '12|x_1920.mp4', url_low: null, website: 'https://ard/x'
    };
    const variants = [{ ...item, id: 'a2', title: 'Tatort: Wehrlos (Audiodeskription)', variant: 'Audiodeskription', url: 'https://cdn/ad.mp4', url_hd: null }];
    const streams = itemStreams(item, variants, { subtitles: [{ id: 's', url: 'https://x/s.vtt', lang: 'ger' }] });
    assert.deepEqual(streams.map((s) => s.name.split('\n')[1]), ['HD', 'SD', 'Audiodeskription', 'Web']);
    assert.equal(streams[0].url, 'https://cdn/x_1920.mp4');
    assert.equal(streams[0].subtitles.length, 1);
    assert.equal(streams[3].externalUrl, 'https://ard/x');
});

test('subtitles: EBU-TT to WebVTT incl. 10h timecode offset and entities', () => {
    const xml = `<?xml version="1.0"?><tt:tt xmlns:tt="http://www.w3.org/ns/ttml"><tt:body><tt:div>
        <tt:p begin="10:00:01.000" end="10:00:03.500"><tt:span>Hallo &amp; willkommen</tt:span><tt:br/><tt:span>zweite Zeile</tt:span></tt:p>
        <tt:p begin="10:00:04:12" end="10:00:05:00"><tt:span>Frames</tt:span></tt:p>
    </tt:div></tt:body></tt:tt>`;
    const vtt = ttmlToVtt(xml);
    assert.match(vtt, /^WEBVTT/);
    assert.match(vtt, /00:00:01\.000 --> 00:00:03\.500\nHallo & willkommen\nzweite Zeile/);
    assert.match(vtt, /00:00:04\.480 --> 00:00:05\.000\nFrames/);
    assert.equal(parseTime('12.5s'), 12.5);
    assert.match(srtToVtt('1\n00:00:01,000 --> 00:00:02,000\nHi'), /00:00:01\.000 --> 00:00:02\.000/);
});

test('art: SVG output is escaped and wraps text', () => {
    const svg = renderArt({ title: 'Tom & Jerry <script>', badge: 'ZDF', color: '#e8740c' });
    assert.ok(svg.startsWith('<svg'));
    assert.ok(!svg.includes('<script>'));
    assert.ok(svg.includes('Tom &amp; Jerry'));
    const lines = wrap('Ein sehr langer Titel der auf mehrere Zeilen umbrechen muss weil er so lang ist', 15, 3);
    assert.equal(lines.length, 3);
    assert.ok(lines[2].endsWith('…'));
});

test('manifest id prefixes are unique to this add-on (no clash with other IPTV add-ons)', () => {
    const manifest = buildManifest(defaults(), 'https://x');
    for (const prefix of manifest.idPrefixes) assert.match(prefix, /^mvw/);
});

test('HLS master trimming: one CDN group, default audio, no subtitles, absolute URLs', () => {
    const { trimMasterPlaylist } = require('../src/live/hls');
    const master = [
        '#EXTM3U', '#EXT-X-INDEPENDENT-SEGMENTS',
        '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="A-1",NAME="TV Ton",LANGUAGE="deu",DEFAULT=YES,URI="/live/a/4.m3u8"',
        '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="A-1",NAME="Audio-Deskription",LANGUAGE="deu",URI="/live/a/6.m3u8"',
        '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="A-2",NAME="TV Ton",LANGUAGE="deu",DEFAULT=YES,URI="/live/b/4.m3u8"',
        '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="T-1",NAME="UT",URI="/live/a/7.m3u8"',
        '#EXT-X-STREAM-INF:BANDWIDTH=1000,AVERAGE-BANDWIDTH=900,AUDIO="A-1",SUBTITLES="T-1",RESOLUTION=640x360',
        '/live/a/1.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=1000,AVERAGE-BANDWIDTH=900,AUDIO="A-2",SUBTITLES="T-2",RESOLUTION=640x360',
        '/live/b/1.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=4000,AUDIO="A-1",SUBTITLES="T-1",RESOLUTION=1280x720',
        '3.m3u8'
    ].join('\n');
    const out = trimMasterPlaylist(master, 'https://cdn.example/live/master.m3u8');
    assert.ok(out.includes('URI="https://cdn.example/live/a/4.m3u8"'));
    assert.ok(!out.includes('/live/b/'), 'redundante CDN-Gruppe entfernt');
    assert.ok(!out.includes('Audio-Deskription'));
    assert.ok(!out.includes('SUBTITLES'));
    assert.ok(out.includes('https://cdn.example/live/a/1.m3u8'));
    assert.ok(out.includes('https://cdn.example/live/3.m3u8'), 'relative Pfade werden absolut');
    assert.equal(trimMasterPlaylist('#EXTM3U\n#EXTINF:2,\nseg.ts', 'https://x/'), null, 'Medien-Playlist bleibt unverändert');
});

test('HLS single mode keeps only the best variant up to 1080p', () => {
    const { trimMasterPlaylist } = require('../src/live/hls');
    const master = [
        '#EXTM3U',
        '#EXT-X-STREAM-INF:BANDWIDTH=1000,RESOLUTION=640x360', 'a.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=8000,RESOLUTION=1920x1080', 'b.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=20000,RESOLUTION=3840x2160', 'c.m3u8'
    ].join('\n');
    const out = trimMasterPlaylist(master, 'https://cdn.example/m.m3u8', { single: true });
    assert.ok(out.includes('https://cdn.example/b.m3u8'));
    assert.ok(!out.includes('a.m3u8') && !out.includes('c.m3u8'));
});
