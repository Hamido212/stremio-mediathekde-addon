'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildFixtureDb } = require('./helpers');
const { MediathekRepository, toFtsQuery } = require('../src/mediathek/repository');
const { classify } = require('../src/mediathek/categories');
const { normalizeChannel } = require('../src/mediathek/channels');
const { encodeRelative, decodeRelative } = require('../src/mediathek/urls');
const { detectVariant } = require('../src/mediathek/variants');

const { target, stats } = buildFixtureDb();
const repo = new MediathekRepository();
repo.open(target);

test('builder imports all films and aggregates shows', () => {
    assert.equal(stats.items, 13);
    assert.equal(stats.variants, 1, 'AD-Fassung wird als Variante ausgeblendet');
    assert.ok(stats.shows >= 9);
});

test('channel names are normalized via the channel table (not hardcoded ids)', () => {
    assert.equal(normalizeChannel('3Sat'), '3sat');
    assert.equal(normalizeChannel('ARTE.DE'), 'ARTE');
    assert.equal(normalizeChannel('ZDF-tivi'), 'ZDFtivi');
    assert.equal(normalizeChannel('Neuer Sender'), 'Neuer Sender');
    assert.equal(repo.item('a1').channel, 'ARD');
    assert.equal(repo.item('f1').channel, '3sat');
    assert.equal(repo.item('e1').channel, 'ARTE (FR)');
});

test('categories', () => {
    assert.equal(repo.item('a1').category, 'Krimi');
    assert.equal(repo.item('b1').category, 'Film');
    assert.equal(repo.item('c1').category, 'Kinder');
    assert.equal(repo.item('d1').category, 'Nachrichten');
    assert.equal(classify({ channel: 'ZDF', show: 'Filme', title: 'Kurz', duration: 600 }), 'Sonstiges', 'Film braucht Mindestlänge');
    assert.equal(classify({ channel: 'ZDF', show: 'heute-show', title: 'heute-show vom 1.11.', duration: 1800 }), 'Unterhaltung');
    assert.equal(classify({ channel: 'ARD alpha', show: 'Irgendwas', title: 'x', duration: 100 }), 'Wissen');
});

test('relative url encoding round-trips', () => {
    const base = 'https://cdn.example.org/a/b/video_1280x720.mp4';
    for (const url of ['https://cdn.example.org/a/b/video_1920x1080.mp4', base, 'https://other.example.com/x.mp4', '//proto.example.org/y.mp4']) {
        const decoded = decodeRelative(base, encodeRelative(base, url));
        assert.equal(decoded, url.startsWith('//') ? `https:${url}` : url);
    }
    assert.equal(decodeRelative(base, null), null);
});

test('variant detection', () => {
    assert.deepEqual(detectVariant('Tatort: Wehrlos (Audiodeskription)'), { variant: 'Audiodeskription', baseTitle: 'Tatort: Wehrlos' });
    assert.equal(detectVariant('Film - mit Gebärdensprache').variant, 'Gebärdensprache');
    assert.equal(detectVariant('Le film (OV)').variant, 'Originalversion');
    assert.equal(detectVariant('Tatort: Wehrlos'), null);
    assert.equal(detectVariant('Zoogeschichten (F. 18)'), null);
});

test('latest excludes future items, variants and respects channel + duration filters', () => {
    const all = repo.latest({ limit: 100 });
    const ids = all.map((r) => r.id);
    assert.ok(!ids.includes('x1'), 'Zukunft ausgeschlossen');
    assert.ok(!ids.includes('a2'), 'Variante ausgeblendet');
    assert.deepEqual(ids.slice(0, 2), ['d1', 'a1']);

    const ard = repo.latest({ channels: ['ARD'], limit: 100 });
    assert.ok(ard.every((r) => r.channel === 'ARD'));

    const long = repo.latest({ minDuration: 3600, limit: 100 });
    assert.ok(long.every((r) => r.duration >= 3600));

    const noNews = repo.latest({ excludeCategories: ['Nachrichten'], limit: 100 });
    assert.ok(!noNews.some((r) => r.category === 'Nachrichten'));

    assert.equal(repo.latest({ limit: 2, skip: 2 }).length, 2);
});

test('search: exact first, prefix fallback, umlauts and FTS syntax are safe', () => {
    assert.deepEqual(repo.search('tatort', {}).map((r) => r.id).sort(), ['a1', 'a3']);
    assert.ok(repo.search('Sendung Maus', {}).length === 2);
    assert.ok(repo.search('tator', {}).length >= 2, 'Präfix-Fallback');
    assert.deepEqual(repo.search('"); DROP TABLE items; --', {}), []);
    assert.equal(toFtsQuery('  '), null);
    assert.equal(toFtsQuery('Größe "Test"'), '"Größe"* "Test"*');
});

test('shows, episodes and variants', () => {
    const shows = repo.shows({ minEpisodes: 2 });
    const names = shows.map((s) => s.name);
    assert.ok(names.includes('Tatort'));
    assert.ok(names.includes('Die Sendung mit der Maus'));
    const tatort = shows.find((s) => s.name === 'Tatort');
    assert.equal(tatort.episodes, 2, 'Variante zählt nicht als Folge');
    assert.equal(tatort.category, 'Krimi');

    assert.equal(repo.shows({ search: 'bergret' })[0].name, 'Die Bergretter');
    assert.ok(repo.shows({ category: 'Kinder' }).every((s) => s.category === 'Kinder'));

    const episodes = repo.episodes(tatort.id);
    assert.deepEqual(episodes.map((e) => e.id), ['a1', 'a3']);

    const variants = repo.variants(repo.item('a1'));
    assert.deepEqual(variants.map((v) => [v.id, v.variant]), [['a2', 'Audiodeskription']]);
    assert.deepEqual(repo.variants(repo.item('a2')).map((v) => v.id), ['a1']);
});

test('search prefix fallback keeps working on later pages', () => {
    const page1 = repo.search('tator', { limit: 1 });
    const page2 = repo.search('tator', { limit: 1, skip: 1 });
    assert.equal(page1.length, 1);
    assert.equal(page2.length, 1);
    assert.notEqual(page1[0].id, page2[0].id);
});
