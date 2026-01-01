// Logger mit strukturiertem Output

const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'INFO'];

class Logger {
    log(level, message, data = {}) {
        if (LOG_LEVELS[level] > currentLevel) {
            return;
        }

        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            ...data
        };

        console.log(JSON.stringify(logEntry));
    }

    error(message, data) {
        this.log('ERROR', message, data);
    }

    warn(message, data) {
        this.log('WARN', message, data);
    }

    info(message, data) {
        this.log('INFO', message, data);
    }

    debug(message, data) {
        this.log('DEBUG', message, data);
    }
}

module.exports = new Logger();
