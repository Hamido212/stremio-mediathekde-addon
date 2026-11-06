'use strict';

// Minimaler strukturierter Logger (JSON-Zeilen in Produktion, lesbar in der Konsole).

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const configured = (process.env.LOG_LEVEL || 'info').toLowerCase();
const threshold = LEVELS[configured] ?? LEVELS.info;
const pretty = process.env.LOG_FORMAT === 'pretty' || (process.stdout.isTTY && process.env.NODE_ENV !== 'production');
const silent = process.env.NODE_ENV === 'test' && !process.env.LOG_LEVEL;

function write(level, message, data) {
    if (silent || LEVELS[level] > threshold) return;
    const ts = new Date().toISOString();
    if (pretty) {
        const extra = data && Object.keys(data).length ? ' ' + JSON.stringify(data) : '';
        const line = `${ts.slice(11, 19)} ${level.toUpperCase().padEnd(5)} ${message}${extra}`;
        (level === 'error' ? console.error : console.log)(line);
        return;
    }
    const entry = JSON.stringify({ ts, level, msg: message, ...data });
    (level === 'error' ? console.error : console.log)(entry);
}

module.exports = {
    error: (msg, data) => write('error', msg, data),
    warn: (msg, data) => write('warn', msg, data),
    info: (msg, data) => write('info', msg, data),
    debug: (msg, data) => write('debug', msg, data)
};
