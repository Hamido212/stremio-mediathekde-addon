'use strict';

// Einstiegspunkt: verdrahtet Datenquellen, Scheduler und HTTP-Server.

const config = require('./src/config');
const logger = require('./src/logger');
const pkg = require('./package.json');
const { createApp } = require('./src/app');
const { Addon } = require('./src/stremio/addon');
const { MediathekRepository } = require('./src/mediathek/repository');
const { LiveTvProvider } = require('./src/live/livetv');
const { RadioProvider } = require('./src/live/radio');
const { UpdateScheduler } = require('./src/updater/scheduler');

const repository = new MediathekRepository();
const live = new LiveTvProvider();
const radio = new RadioProvider();
const scheduler = new UpdateScheduler(repository);
const addon = new Addon({ repository, live, radio });
const app = createApp({ addon, repository, live, radio, scheduler });

const server = app.listen(config.PORT, () => {
    const base = config.BASE_URL || `http://localhost:${config.PORT}`;
    logger.info(`Mediathek DE v${pkg.version} läuft`, { configure: `${base}/configure`, manifest: `${base}/manifest.json` });
    scheduler.start();
    live.start();
    radio.start();
});

function shutdown(signal) {
    logger.info(`${signal} empfangen – fahre herunter`);
    scheduler.stop();
    live.stop();
    radio.stop();
    server.close(() => {
        repository.close();
        process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
