'use strict';

const { buildFixtureDb, TMP } = require('./helpers');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { enrichArtwork, similarity } = require('../src/artwork/enrich');
const { MediathekRepository } = require('../src/mediathek/repository');

function fakeTmdb(calls) {
    return async (url) => {
        calls.push(url);
        const query = new URL(url).searchParams.get('query');
        const results = query === 'Tatort'
            ? [{ id: 1, name: 'Tatort', original_name: 'Tatort', poster_path: '/tatort.jpg', backdrop_path: '/tatort-bg.jpg' }]
            : [{ id: 2, title: 'Etwas ganz anderes', poster_path: '/x.jpg' }];
        return { ok: true, status: 200, json: async () => ({ results }) };
    };
}

test('similarity', () => {
    assert.equal(similarity('Tatort', 'tatort'), 1);
    assert.ok(similarity('Die Bergretter', 'Bergretter, Die') > 0.6);
    assert.ok(similarity('Das große Abenteuer', 'Etwas ganz anderes') < 0.3);
});

test('enrichArtwork sets posters for confident matches and caches lookups', async () => {
    const { target } = buildFixtureDb();
    const cacheFile = path.join(TMP, 'cache', 'artwork-test.db');
    const calls = [];
    const first = await enrichArtwork(target, { apiKey: 'test', fetchImpl: fakeTmdb(calls), cacheFile, delayMs: 0 });
    assert.ok(first.lookups >= 2);
    assert.equal(first.withPoster, 1);

    const repo = new MediathekRepository();
    repo.open(target);
    const tatort = repo.shows({ search: 'tatort' })[0];
    assert.equal(tatort.poster, 'https://image.tmdb.org/t/p/w500/tatort.jpg');
    assert.equal(tatort.background, 'https://image.tmdb.org/t/p/w1280/tatort-bg.jpg');
    assert.equal(repo.item('b1').poster, null, 'unsicherer Treffer wird verworfen');
    repo.close();

    const before = calls.length;
    const second = await enrichArtwork(target, { apiKey: 'test', fetchImpl: fakeTmdb(calls), cacheFile, delayMs: 0 });
    assert.equal(calls.length, before, 'zweiter Lauf nutzt nur den Cache');
    assert.equal(second.lookups, 0);
});

test('enrichArtwork without key is a no-op', async () => {
    assert.deepEqual(await enrichArtwork('unused', { apiKey: '' }), { skipped: true });
});
