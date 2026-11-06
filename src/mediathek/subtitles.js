'use strict';

// Untertitel der Sender liegen meist als EBU-TT/TTML (XML) vor, das Stremio
// nicht darstellen kann. Wir wandeln sie bei Bedarf in WebVTT um.

const config = require('../config');

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
        if (code[0] === '#') {
            const n = code[1] === 'x' || code[1] === 'X' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
            return Number.isFinite(n) ? String.fromCodePoint(n) : match;
        }
        return ENTITIES[code.toLowerCase()] ?? match;
    });
}

/** "00:01:02.500", "00:01:02:12" (Frames), "62.5s", "625000000t" → Sekunden */
function parseTime(value, { frameRate = 25, tickRate = 10000000 } = {}) {
    if (!value) return null;
    value = value.trim();
    let match = /^(\d+):(\d{2}):(\d{2})(?:[.,](\d+))?$/.exec(value);
    if (match) return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + (match[4] ? Number(`0.${match[4]}`) : 0);
    match = /^(\d+):(\d{2}):(\d{2}):(\d{2})$/.exec(value);
    if (match) return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / frameRate;
    match = /^([\d.]+)(h|m|s|ms|t)$/.exec(value);
    if (match) {
        const n = Number(match[1]);
        return { h: n * 3600, m: n * 60, s: n, ms: n / 1000, t: n / tickRate }[match[2]];
    }
    return null;
}

function formatTime(seconds) {
    const ms = Math.max(0, Math.round(seconds * 1000));
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const rest = ms % 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(rest).padStart(3, '0')}`;
}

function ttmlToVtt(xml) {
    const frameRate = Number(/ttp:frameRate="(\d+)"/.exec(xml)?.[1]) || 25;
    const tickRate = Number(/ttp:tickRate="(\d+)"/.exec(xml)?.[1]) || 10000000;
    const cues = [];
    const paragraph = /<(?:[\w-]+:)?p\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?p>/g;
    let match;
    while ((match = paragraph.exec(xml))) {
        const attrs = match[1];
        const begin = parseTime(/\bbegin="([^"]+)"/.exec(attrs)?.[1], { frameRate, tickRate });
        let end = parseTime(/\bend="([^"]+)"/.exec(attrs)?.[1], { frameRate, tickRate });
        const dur = parseTime(/\bdur="([^"]+)"/.exec(attrs)?.[1], { frameRate, tickRate });
        if (end == null && begin != null && dur != null) end = begin + dur;
        if (begin == null || end == null) continue;
        const text = decodeEntities(
            match[2]
                .replace(/<(?:[\w-]+:)?br\s*\/?>/g, '\n')
                .replace(/<[^>]+>/g, '')
        ).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
        if (text) cues.push({ begin, end, text });
    }
    // Manche Sender nutzen Sendezeit-Timecodes ab 10:00:00 → auf 0 normalisieren
    if (cues.length && cues[0].begin >= 36000) {
        const offset = 36000;
        for (const cue of cues) { cue.begin -= offset; cue.end -= offset; }
    }
    return 'WEBVTT\n\n' + cues.map((c, i) => `${i + 1}\n${formatTime(c.begin)} --> ${formatTime(c.end)}\n${c.text}\n`).join('\n');
}

function srtToVtt(srt) {
    return 'WEBVTT\n\n' + srt.replace(/\r/g, '').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2').trim() + '\n';
}

/** Lädt eine Untertiteldatei und liefert WebVTT (oder null, wenn unbekanntes Format). */
async function fetchAsVtt(url) {
    const response = await fetch(url, {
        headers: { 'User-Agent': config.HTTP_USER_AGENT },
        signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.text()).replace(/^﻿/, '');
    const head = body.trimStart().slice(0, 200);
    if (head.startsWith('WEBVTT')) return body;
    if (head.startsWith('<') && /<(?:[\w-]+:)?tt\b/.test(body)) return ttmlToVtt(body);
    if (/^\d+\s*\n\d{2}:\d{2}:\d{2},\d{3} -->/.test(body.trimStart())) return srtToVtt(body);
    return null;
}

module.exports = { ttmlToVtt, srtToVtt, parseTime, fetchAsVtt };
