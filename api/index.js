'use strict';

// Vercel-Funktion: alle Anfragen werden per Rewrite (vercel.json) hierher geleitet.
// Die beim Build erzeugten Daten liegen unter .data/ (includeFiles in vercel.json).

const path = require('path');

process.env.DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '.data');
process.env.READ_ONLY = '1';

module.exports = require('../src/serverless');
