'use strict';

// Exklusive Sperre für Update-Läufe (Scheduler-Kindprozess und `npm run update`
// dürfen nicht gleichzeitig laufen – sie teilen sich tmp- und app-Verzeichnis).

const fs = require('fs');
const path = require('path');
const config = require('../config');

const LOCK_FILE = () => path.join(config.DATA_DIR, 'update.lock');

function isAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error.code === 'EPERM';
    }
}

/** Liefert die PID des laufenden Updates oder null. Entfernt verwaiste Sperren. */
function lockHolder() {
    try {
        const pid = Number.parseInt(fs.readFileSync(LOCK_FILE(), 'utf8'), 10);
        if (Number.isFinite(pid) && pid !== process.pid && isAlive(pid)) return pid;
        if (pid === process.pid) return pid;
        fs.unlinkSync(LOCK_FILE());
    } catch { /* keine Sperre */ }
    return null;
}

/** Versucht die Sperre zu bekommen; gibt eine Freigabe-Funktion oder null zurück. */
function acquireLock() {
    fs.mkdirSync(config.DATA_DIR, { recursive: true });
    lockHolder(); // verwaiste Sperre aufräumen
    try {
        const fd = fs.openSync(LOCK_FILE(), 'wx');
        fs.writeSync(fd, String(process.pid));
        fs.closeSync(fd);
    } catch (error) {
        if (error.code === 'EEXIST') return null;
        throw error;
    }
    return () => {
        try {
            if (Number(fs.readFileSync(LOCK_FILE(), 'utf8')) === process.pid) fs.unlinkSync(LOCK_FILE());
        } catch { /* bereits entfernt */ }
    };
}

module.exports = { acquireLock, lockHolder };
