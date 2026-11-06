'use strict';

// Plant Updates im Server-Prozess. Der eigentliche Import läuft in einem
// Kindprozess (CPU-/RAM-intensiv), damit der Server währenddessen schnell
// antwortet. Danach wird die neue Datenbank ohne Neustart eingebunden.

const path = require('path');
const { fork } = require('child_process');
const config = require('../config');
const logger = require('../logger');
const { readState, currentDbPath } = require('./state');
const { cleanupAppDbs } = require('./update');
const { lockHolder } = require('./lock');

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const RETRY_MS = 30 * 60 * 1000;

class UpdateScheduler {
    /**
     * @param {import('../mediathek/repository').MediathekRepository} repository
     */
    constructor(repository, { intervalHours = config.UPDATE_INTERVAL_HOURS, updateOnStart = config.UPDATE_ON_START } = {}) {
        this.repository = repository;
        this.intervalMs = Math.max(intervalHours, 1) * 3600 * 1000;
        this.updateOnStart = updateOnStart;
        this.child = null;
        this.timer = null;
        this.lastRunError = null;
        this.lastTriggerAt = 0;
    }

    get running() {
        return this.child !== null || lockHolder() !== null;
    }

    start() {
        const opened = this.syncWithState();
        if (!opened) {
            logger.warn('Noch keine Mediathek-Datenbank vorhanden – starte ersten Import (dauert 1–3 Minuten)');
            this.trigger({ force: true });
        } else if (this.updateOnStart && this.isStale()) {
            this.trigger();
        }
        this.timer = setInterval(() => this.tick(), CHECK_INTERVAL_MS);
        this.timer.unref();
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        if (this.child) this.child.kill();
    }

    tick() {
        this.syncWithState();
        // Zusätzliche Bremse im Speicher: falls state.json nicht schreibbar ist,
        // würde isStale() sonst dauerhaft true liefern.
        if (this.isStale() && Date.now() - this.lastTriggerAt >= RETRY_MS) this.trigger();
    }

    isStale() {
        const { lastSuccess, lastAttempt } = readState();
        const now = Date.now();
        const sinceSuccess = now - (Date.parse(lastSuccess) || 0);
        const sinceAttempt = now - (Date.parse(lastAttempt) || 0);
        // Nach Fehlschlägen frühestens nach RETRY_MS erneut versuchen
        return sinceSuccess >= this.intervalMs && sinceAttempt >= RETRY_MS;
    }

    /** Öffnet die in state.json eingetragene DB, falls sie noch nicht aktiv ist. */
    syncWithState() {
        const file = currentDbPath();
        if (!file) return this.repository.ready;
        if (this.repository.file && path.resolve(this.repository.file) === path.resolve(file)) return true;
        try {
            this.repository.open(file);
            cleanupAppDbs([file]);
            return true;
        } catch (error) {
            logger.error('App-Datenbank konnte nicht geöffnet werden', { file, error: error.message });
            return this.repository.ready;
        }
    }

    /** Startet einen Update-Lauf im Kindprozess (no-op, wenn bereits einer läuft). */
    trigger({ force = false } = {}) {
        if (this.child || lockHolder()) return false;
        this.lastTriggerAt = Date.now();
        const args = force ? ['--force'] : [];
        const child = fork(path.join(__dirname, 'cli.js'), args, { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
        this.child = child;
        logger.info('Update-Prozess gestartet', { pid: child.pid, force });

        child.on('message', (message) => {
            if (message?.type === 'error') this.lastRunError = message.error;
            if (message?.type === 'result') this.lastRunError = null;
        });
        child.on('exit', (code) => {
            this.child = null;
            logger.info('Update-Prozess beendet', { code });
            this.syncWithState();
        });
        child.on('error', (error) => {
            this.child = null;
            this.lastRunError = error.message;
            logger.error('Update-Prozess konnte nicht gestartet werden', { error: error.message });
        });
        return true;
    }

    status() {
        const state = readState();
        return {
            running: this.running,
            lastRunError: this.lastRunError,
            intervalHours: this.intervalMs / 3600000,
            lastSuccess: state.lastSuccess,
            lastAttempt: state.lastAttempt,
            lastError: state.lastError,
            stats: state.stats
        };
    }
}

module.exports = { UpdateScheduler };
