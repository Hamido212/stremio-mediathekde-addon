'use strict';

// Bereinigt HLS-Master-Playlists der Sender für einen schnellen Start.
//
// Die Original-Playlists (z.B. ZDF) enthalten jede Qualität doppelt (zwei
// redundante CDN-Gruppen), mehrere Tonspuren (Klare Sprache, Audiodeskription)
// und eine Live-Untertitelspur. Player wie mpv (Stremio Desktop/Android) öffnen
// beim Start ALLE davon – das dauert mehrere Sekunden und führt teils zu
// schwarzem Bild. Die bereinigte Playlist enthält nur eine CDN-Gruppe, die
// Standard-Tonspur und keine Untertitel; alle Adressen zeigen weiterhin direkt
// auf das Sender-CDN (Video/Ton laufen nicht über das Add-on).

const config = require('../config');

function ATTR(line, key) {
    const match = new RegExp(`(?:^|[:,])${key}=("([^"]*)"|[^,]*)`).exec(line);
    return match ? (match[2] ?? match[1]) : undefined;
}

/**
 * @param {string} text     Inhalt der Master-Playlist
 * @param {string} baseUrl  URL der Playlist (für relative Pfade)
 * @param {{ single?: boolean }} [opts]  single = nur die beste Qualität (≤ 1080p)
 * @returns {string|null}   bereinigte Playlist oder null (keine Master-Playlist)
 */
function trimMasterPlaylist(text, baseUrl, { single = false } = {}) {
    if (!text || !text.startsWith('#EXTM3U')) return null;
    const lines = text.split(/\r?\n/);
    const abs = (uri) => new URL(uri, baseUrl).toString();

    const media = [];
    const variants = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('#EXT-X-MEDIA:')) media.push(line);
        else if (line.startsWith('#EXT-X-STREAM-INF:')) {
            let j = i + 1;
            while (j < lines.length && (!lines[j] || lines[j].startsWith('#'))) j++;
            if (lines[j]) variants.push({ inf: line, uri: lines[j] });
            i = j;
        }
    }
    if (!variants.length) return null; // bereits eine Medien-Playlist

    // Nur die erste Tonspur-Gruppe (= erste CDN-Gruppe) behalten
    const audioGroup = variants.map((v) => ATTR(v.inf, 'AUDIO')).find(Boolean) || null;
    let kept = audioGroup ? variants.filter((v) => ATTR(v.inf, 'AUDIO') === audioGroup) : variants;

    // Doppelte Qualitäten (gleiche Auflösung + Bandbreite) entfernen
    const seen = new Set();
    kept = kept.filter((v) => {
        const key = `${ATTR(v.inf, 'RESOLUTION')}|${ATTR(v.inf, 'BANDWIDTH')}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // mpv (Stremio Desktop/Android-TV) nimmt ohnehin die höchste Qualität und
    // prüft beim Start jede Variante – eine einzige Variante startet am schnellsten.
    if (single && kept.length > 1) {
        const height = (v) => Number((ATTR(v.inf, 'RESOLUTION') || '0x0').split('x')[1]) || 0;
        const bandwidth = (v) => Number(ATTR(v.inf, 'BANDWIDTH')) || 0;
        const candidates = kept.filter((v) => height(v) <= 1080);
        const pool = candidates.length ? candidates : kept;
        kept = [pool.reduce((best, v) => (bandwidth(v) > bandwidth(best) ? v : best))];
    }

    const out = ['#EXTM3U'];
    const version = lines.find((l) => l.startsWith('#EXT-X-VERSION:'));
    if (version) out.push(version);
    if (lines.includes('#EXT-X-INDEPENDENT-SEGMENTS')) out.push('#EXT-X-INDEPENDENT-SEGMENTS');

    if (audioGroup) {
        const audio = media.filter((m) => /TYPE=AUDIO/.test(m) && ATTR(m, 'GROUP-ID') === audioGroup);
        const preferred = audio.find((m) => /DEFAULT=YES/.test(m)) || audio[0];
        if (preferred) out.push(preferred.replace(/URI="([^"]*)"/, (_, uri) => `URI="${abs(uri)}"`));
    }
    for (const variant of kept) {
        out.push(variant.inf.replace(/,SUBTITLES="[^"]*"/, '').replace(/,CLOSED-CAPTIONS=("[^"]*"|NONE)/, ''));
        out.push(abs(variant.uri));
    }
    return out.join('\n') + '\n';
}

const cache = new Map();
const CACHE_MS = 10 * 60 * 1000;

/** Lädt eine Master-Playlist und gibt die bereinigte Fassung zurück (mit Kurzzeit-Cache). */
async function fetchTrimmedPlaylist(url, { single = false } = {}) {
    const key = `${single ? 's' : 'a'}|${url}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.body;
    const response = await fetch(url, {
        headers: { 'User-Agent': config.HTTP_USER_AGENT },
        signal: AbortSignal.timeout(8000),
        redirect: 'follow'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = trimMasterPlaylist(await response.text(), response.url || url, { single });
    cache.set(key, { at: Date.now(), body });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return body;
}

module.exports = { trimMasterPlaylist, fetchTrimmedPlaylist };
