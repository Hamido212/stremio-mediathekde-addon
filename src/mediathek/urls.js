'use strict';

// Die drei Qualitätsstufen eines Videos teilen sich meist einen langen
// gemeinsamen URL-Präfix. Wir speichern HD/Low daher relativ zur
// Standard-URL ("<präfixlänge>|<rest>") – das spart ~30 % Datenbankgröße.

const RELATIVE = /^(\d{1,4})\|/;

function encodeRelative(base, url) {
    if (!url) return null;
    url = normalizeUrl(url);
    if (!base) return url;
    if (url === base) return '=';
    let n = 0;
    const max = Math.min(base.length, url.length, 9999);
    while (n < max && base.charCodeAt(n) === url.charCodeAt(n)) n++;
    return n >= 12 ? `${n}|${url.slice(n)}` : url;
}

function decodeRelative(base, value) {
    if (!value) return null;
    if (value === '=') return base;
    const match = RELATIVE.exec(value);
    if (!match) return value;
    const n = Number(match[1]);
    return base.slice(0, n) + value.slice(match[0].length);
}

/** Protokoll-relative URLs ("//host/…") und Leerstrings bereinigen. */
function normalizeUrl(url) {
    if (!url) return null;
    url = String(url).trim();
    if (!url) return null;
    if (url.startsWith('//')) return 'https:' + url;
    return url;
}

module.exports = { encodeRelative, decodeRelative, normalizeUrl };
