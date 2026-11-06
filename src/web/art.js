'use strict';

// Generiert Poster/Hintergründe als SVG (Sender-Farbe + Titel), da
// MediathekView keine Vorschaubilder liefert. Dazu ein PNG-Logo für das
// Manifest (Stremio-Apps erwarten dort ein Rasterbild).

const zlib = require('zlib');

const FONT = "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const SHAPES = {
    poster: { w: 600, h: 900 },
    landscape: { w: 1280, h: 720 },
    square: { w: 600, h: 600 }
};

function escapeXml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

function shade(hex, factor) {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!match) return '#111827';
    const n = Number.parseInt(match[1], 16);
    const channel = (shift) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * factor)));
    return `#${[channel(16), channel(8), channel(0)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Bricht Text in Zeilen um (Schätzung über mittlere Zeichenbreite). */
function wrap(text, maxChars, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (candidate.length <= maxChars) {
            line = candidate;
            continue;
        }
        if (line) lines.push(line);
        line = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
        if (lines.length === maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
        const last = lines[maxLines - 1];
        lines[maxLines - 1] = `${last.slice(0, Math.max(1, maxChars - 1)).replace(/[\s,.;:–-]+$/, '')}…`;
    }
    return lines;
}

/**
 * @param {object} o
 * @param {string} o.title
 * @param {string} [o.kicker]   kleine Zeile über dem Titel (z.B. Sendungsname)
 * @param {string} [o.badge]    Sendername oben links
 * @param {string} [o.tag]      Kategorie oben rechts
 * @param {string} [o.footer]   Datum/Dauer unten
 * @param {string} [o.color]    Grundfarbe (#rrggbb)
 * @param {'poster'|'landscape'|'square'} [o.shape]
 * @param {'live'|'radio'} [o.mode]
 * @param {boolean} [o.minimal]  nur Farbverlauf + dezenter Sendername (für Hintergründe)
 */
function renderArt({ title, kicker, badge, tag, footer, color = '#2d3a8c', shape = 'poster', mode, minimal = false } = {}) {
    const { w, h } = SHAPES[shape] || SHAPES.poster;
    const pad = Math.round(w * 0.067);
    const dark = shade(color, 0.45);
    const parts = [];

    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="${FONT}">`);
    parts.push(`<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${escapeXml(color)}"/><stop offset="1" stop-color="${dark}"/></linearGradient>`);
    parts.push('<radialGradient id="r" cx="0.9" cy="0.05" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>');
    parts.push(`<rect width="${w}" height="${h}" fill="url(#g)"/><rect width="${w}" height="${h}" fill="url(#r)"/>`);
    parts.push(`<circle cx="${w * 0.88}" cy="${h * 0.86}" r="${Math.min(w, h) * 0.42}" fill="#fff" fill-opacity="0.05"/>`);
    parts.push(`<circle cx="${w * 0.88}" cy="${h * 0.86}" r="${Math.min(w, h) * 0.26}" fill="#fff" fill-opacity="0.05"/>`);

    if (minimal) {
        if (badge) {
            parts.push(`<text x="${w - pad}" y="${h - pad}" text-anchor="end" font-size="${Math.round(h * 0.3)}" font-weight="900" fill="#fff" fill-opacity="0.07">${escapeXml(badge)}</text>`);
        }
        parts.push('</svg>');
        return parts.join('');
    }

    const badgeSize = shape === 'landscape' ? 34 : 30;
    if (badge) {
        const bw = Math.round(String(badge).length * badgeSize * 0.62 + badgeSize * 1.1);
        parts.push(`<rect x="${pad}" y="${pad}" rx="10" width="${bw}" height="${badgeSize * 1.8}" fill="#fff" fill-opacity="0.95"/>`);
        parts.push(`<text x="${pad + badgeSize * 0.55}" y="${pad + badgeSize * 1.27}" font-size="${badgeSize}" font-weight="800" fill="${escapeXml(color)}">${escapeXml(badge)}</text>`);
    }
    if (tag) {
        parts.push(`<text x="${w - pad}" y="${pad + badgeSize * 1.27}" text-anchor="end" font-size="${Math.round(badgeSize * 0.8)}" font-weight="600" fill="#fff" fill-opacity="0.8">${escapeXml(tag)}</text>`);
    }

    if (mode === 'live' || mode === 'radio') {
        // Zentrierter Name + LIVE/RADIO-Kennzeichnung
        const label = mode === 'live' ? 'LIVE' : 'RADIO';
        const fontSize = title.length > 14 ? 54 : title.length > 9 ? 68 : 86;
        const lines = wrap(title, Math.floor((w - 2 * pad) / (fontSize * 0.56)), 3);
        const startY = h / 2 - ((lines.length - 1) * fontSize * 1.1) / 2 + fontSize * 0.2;
        lines.forEach((line, i) => {
            parts.push(`<text x="${w / 2}" y="${startY + i * fontSize * 1.1}" text-anchor="middle" font-size="${fontSize}" font-weight="800" fill="#fff">${escapeXml(line)}</text>`);
        });
        const pillW = 150;
        const pillY = h - pad - 54;
        parts.push(`<rect x="${(w - pillW) / 2}" y="${pillY}" rx="27" width="${pillW}" height="54" fill="#000" fill-opacity="0.35"/>`);
        parts.push(`<circle cx="${(w - pillW) / 2 + 30}" cy="${pillY + 27}" r="9" fill="${mode === 'live' ? '#ff3b30' : '#34c759'}"/>`);
        parts.push(`<text x="${(w - pillW) / 2 + 48}" y="${pillY + 37}" font-size="28" font-weight="700" fill="#fff" letter-spacing="2">${label}</text>`);
        parts.push('</svg>');
        return parts.join('');
    }

    const isLandscape = shape === 'landscape';
    const maxWidth = isLandscape ? w * 0.62 : w - 2 * pad;
    const length = String(title || '').length;
    let fontSize = isLandscape ? 64 : length > 70 ? 40 : length > 40 ? 46 : 54;
    const maxLines = isLandscape ? 3 : 6;
    const lines = wrap(title, Math.floor(maxWidth / (fontSize * 0.55)), maxLines);
    const lineHeight = fontSize * 1.12;

    const footerY = h - pad;
    let y = footerY - (footer ? 56 : 0) - (lines.length - 1) * lineHeight;
    if (isLandscape) y = h / 2 - ((lines.length - 1) * lineHeight) / 2 + 20;

    if (kicker) {
        const kickerLines = wrap(String(kicker).toUpperCase(), Math.floor(maxWidth / 15), 2);
        const ky = y - fontSize - 8 - (kickerLines.length - 1) * 30;
        kickerLines.forEach((line, i) => {
            parts.push(`<text x="${pad}" y="${ky + i * 30}" font-size="24" font-weight="700" fill="#fff" fill-opacity="0.75" letter-spacing="1.5">${escapeXml(line)}</text>`);
        });
    }
    lines.forEach((line, i) => {
        parts.push(`<text x="${pad}" y="${y + i * lineHeight}" font-size="${fontSize}" font-weight="800" fill="#fff">${escapeXml(line)}</text>`);
    });
    if (footer) {
        parts.push(`<text x="${pad}" y="${footerY}" font-size="26" font-weight="500" fill="#fff" fill-opacity="0.8">${escapeXml(footer)}</text>`);
    }
    parts.push('</svg>');
    return parts.join('');
}

// ---------------------------------------------------------------------------
// PNG-Logo (256×256): Farbverlauf, abgerundete Ecken, Play-Symbol.

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(buffer) {
    let c = 0xffffffff;
    for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
}

function renderLogoPng(size = 256) {
    const raw = Buffer.alloc(size * (size * 4 + 1));
    const radius = size * 0.22;
    const from = [0x1f, 0x3c, 0x88];
    const to = [0xe8, 0x74, 0x0c];
    // Play-Dreieck
    const ax = size * 0.4, ay = size * 0.3, bx = size * 0.4, by = size * 0.7, cx = size * 0.72, cy = size * 0.5;
    const sign = (px, py, x1, y1, x2, y2) => (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);

    for (let y = 0; y < size; y++) {
        const row = y * (size * 4 + 1);
        raw[row] = 0;
        for (let x = 0; x < size; x++) {
            const i = row + 1 + x * 4;
            // Abgerundete Ecken
            const dx = Math.max(radius - x, x - (size - 1 - radius), 0);
            const dy = Math.max(radius - y, y - (size - 1 - radius), 0);
            const outside = dx * dx + dy * dy > radius * radius;
            if (outside) continue; // transparent
            const t = (x + y) / (2 * size);
            let r = from[0] + (to[0] - from[0]) * t;
            let g = from[1] + (to[1] - from[1]) * t;
            let b = from[2] + (to[2] - from[2]) * t;
            const d1 = sign(x, y, ax, ay, bx, by), d2 = sign(x, y, bx, by, cx, cy), d3 = sign(x, y, cx, cy, ax, ay);
            const inTriangle = !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
            if (inTriangle) r = g = b = 255;
            raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = 255;
        }
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(size, 0);
    header.writeUInt32BE(size, 4);
    header[8] = 8; header[9] = 6; header[10] = 0; header[11] = 0; header[12] = 0;
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk('IHDR', header),
        pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        pngChunk('IEND', Buffer.alloc(0))
    ]);
}

module.exports = { renderArt, renderLogoPng, escapeXml, wrap };
