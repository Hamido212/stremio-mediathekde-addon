'use strict';

const { TMP } = require('./helpers');
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { acquireLock, lockHolder } = require('../src/updater/lock');
const { cleanupAppDbs } = require('../src/updater/update');

test('update lock is exclusive and stale locks are cleared', () => {
    const release = acquireLock();
    assert.ok(release);
    assert.equal(lockHolder(), process.pid);
    release();
    assert.equal(lockHolder(), null);

    fs.writeFileSync(path.join(TMP, 'update.lock'), '999999'); // Prozess existiert nicht
    const again = acquireLock();
    assert.ok(again, 'verwaiste Sperre wird übernommen');
    again();
});

test('cleanup keeps the active DB and skips while another update holds the lock', () => {
    const dir = path.join(TMP, 'app');
    fs.mkdirSync(dir, { recursive: true });
    for (const f of ['app-1.db', 'app-2.db', 'app-3.db.building']) fs.writeFileSync(path.join(dir, f), '');

    fs.writeFileSync(path.join(TMP, 'update.lock'), String(process.ppid)); // fremder, lebender Prozess
    cleanupAppDbs(['app-2.db']);
    assert.ok(fs.existsSync(path.join(dir, 'app-1.db')), 'während fremdem Update nichts löschen');
    fs.unlinkSync(path.join(TMP, 'update.lock'));

    cleanupAppDbs(['app-2.db']);
    assert.deepEqual(fs.readdirSync(dir).filter((f) => f.startsWith('app-')).sort(), ['app-2.db']);
});
