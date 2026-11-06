#!/usr/bin/env node
'use strict';

// CLI: `npm run update` bzw. `npm run update -- --force`
// Wird auch vom Scheduler als Kindprozess gestartet (IPC-Nachricht mit Ergebnis).

const { runUpdate } = require('./update');

const force = process.argv.includes('--force');

runUpdate({ force })
    .then((result) => {
        if (process.send) process.send({ type: 'result', result });
        else console.log(JSON.stringify(result, null, 2));
        process.exit(0);
    })
    .catch((error) => {
        if (process.send) process.send({ type: 'error', error: error.message });
        else console.error(error);
        process.exit(1);
    });
