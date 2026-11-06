'use strict';

// Wandelt Datenbank-Zeilen in Stremio-Objekte (MetaPreview, Meta, Stream) um.

const { decodeRelative } = require('./urls');
const { getChannel } = require('./channels');
const { GENERIC_SHOW } = require('./shows');

const ITEM_PREFIX = 'mvw:';
const SHOW_PREFIX = 'mvw-show:';
const TIME_ZONE = 'Europe/Berlin';

const dateFormat = new Intl.DateTimeFormat('de-DE', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('de-DE', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });
const yearFormat = new Intl.DateTimeFormat('de-DE', { timeZone: TIME_ZONE, year: 'numeric' });

const fold = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function formatDate(ts) {
    return ts ? dateFormat.format(new Date(ts * 1000)) : null;
}

function formatDateTime(ts) {
    if (!ts) return null;
    const d = new Date(ts * 1000);
    return `${dateFormat.format(d)}, ${timeFormat.format(d)} Uhr`;
}

function formatDuration(seconds) {
    if (!seconds) return null;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${Math.max(minutes, 1)} Min.`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

/** Titel inkl. Sendungsname, wenn der Titel allein nicht aussagekräftig ist. */
function displayTitle(item) {
    const { title, show } = item;
    if (!show || GENERIC_SHOW.test(show.trim())) return title;
    if (fold(title).includes(fold(show))) return title;
    return `${show} – ${title}`;
}

/** Folgentitel ohne vorangestellten Sendungsnamen ("Tatort: Wehrlos" → "Wehrlos"). */
function episodeTitle(item, showName) {
    let title = item.title;
    if (showName && title.toLowerCase().startsWith(showName.toLowerCase())) {
        const rest = title.slice(showName.length).replace(/^\s*[:\-–|,]\s*/, '').trim();
        if (rest.length >= 2) title = rest;
    }
    return title;
}

function parseSeasonEpisode(title) {
    const match = /\(S(\d{1,4})\s*\/\s*E(\d{1,4})\)|\bS(\d{1,2})\s*E(\d{1,3})\b/i.exec(title || '');
    if (!match) return null;
    return { season: Number(match[1] ?? match[3]), episode: Number(match[2] ?? match[4]) };
}

function infoLines(item) {
    const lines = [];
    const channel = getChannel(item.channel);
    lines.push(`📺 ${item.channel}${item.show && !GENERIC_SHOW.test(item.show) ? ` · ${item.show}` : ''}`);
    if (item.aired) lines.push(`📅 ${formatDateTime(item.aired)}`);
    if (item.duration) lines.push(`⏱ ${formatDuration(item.duration)}`);
    if (channel?.geo) lines.push(`🌍 Evtl. nur in ${channel.geo === 'AT' ? 'Österreich' : 'der Schweiz'} abrufbar`);
    return lines.join('\n');
}

function itemArt(item, origin) {
    return {
        poster: item.poster || `${origin}/art/item/${item.id}.svg`,
        background: `${origin}/art/item/${item.id}.svg?shape=landscape`
    };
}

function itemPreview(item, origin) {
    const art = itemArt(item, origin);
    return {
        id: ITEM_PREFIX + item.id,
        type: 'movie',
        name: displayTitle(item),
        poster: art.poster,
        posterShape: 'poster',
        description: item.description ? truncate(item.description, 300) : undefined,
        releaseInfo: formatDate(item.aired) || undefined,
        genres: [item.category, item.channel]
    };
}

function itemMeta(item, origin) {
    const art = itemArt(item, origin);
    const description = [item.description, infoLines(item)].filter(Boolean).join('\n\n');
    return {
        id: ITEM_PREFIX + item.id,
        type: 'movie',
        name: displayTitle(item),
        poster: art.poster,
        posterShape: 'poster',
        background: art.background,
        description,
        releaseInfo: formatDate(item.aired) || undefined,
        released: item.aired ? new Date(item.aired * 1000).toISOString() : undefined,
        runtime: formatDuration(item.duration) || undefined,
        genres: [item.category, item.channel],
        website: item.website || undefined,
        links: item.website ? [{ name: 'In der Mediathek öffnen', category: 'Website', url: item.website }] : undefined,
        behaviorHints: { defaultVideoId: ITEM_PREFIX + item.id }
    };
}

function showArt(show, origin) {
    return {
        poster: show.poster || `${origin}/art/show/${show.id}.svg`,
        background: show.background || `${origin}/art/show/${show.id}.svg?shape=landscape`
    };
}

function showPreview(show, origin) {
    return {
        id: SHOW_PREFIX + show.id,
        type: 'series',
        name: show.name,
        poster: showArt(show, origin).poster,
        posterShape: 'poster',
        description: `${show.channel} · ${show.episodes} Folgen`,
        releaseInfo: yearRange(show) || undefined,
        genres: [show.category, show.channel].filter(Boolean)
    };
}

function yearRange(show) {
    const first = show.first ? yearFormat.format(new Date(show.first * 1000)) : null;
    const last = show.latest ? yearFormat.format(new Date(show.latest * 1000)) : null;
    if (!first || !last) return first || last;
    return first === last ? first : `${first}–${last}`;
}

/**
 * Sendung als Serie. Staffel/Folge kommen aus "(S03/E07)" im Titel, falls
 * alle Folgen so nummeriert sind; sonst Staffel = Jahr der Ausstrahlung.
 */
function showMeta(show, episodes, origin) {
    const art = showArt(show, origin);
    const parsed = episodes.map((ep) => parseSeasonEpisode(ep.title));
    const useParsed = episodes.length > 0 && parsed.every(Boolean)
        && new Set(parsed.map((p) => `${p.season}:${p.episode}`)).size === parsed.length;

    const counters = new Map();
    const chronological = episodes.map((ep, index) => ({ ep, index })).reverse();
    const numbering = new Array(episodes.length);
    for (const { ep, index } of chronological) {
        if (useParsed) {
            numbering[index] = parsed[index];
        } else {
            const season = ep.aired ? Number(yearFormat.format(new Date(ep.aired * 1000))) : 0;
            const next = (counters.get(season) || 0) + 1;
            counters.set(season, next);
            numbering[index] = { season, episode: next };
        }
    }

    const latest = episodes[0];
    const summary = `${show.channel} · ${show.episodes} ${show.episodes === 1 ? 'Folge' : 'Folgen'} in der Mediathek`;

    return {
        id: SHOW_PREFIX + show.id,
        type: 'series',
        name: show.name,
        poster: art.poster,
        posterShape: 'poster',
        background: art.background,
        description: [latest?.description ? `Neueste Folge: ${truncate(latest.description, 500)}` : null, summary]
            .filter(Boolean).join('\n\n'),
        releaseInfo: yearRange(show) || undefined,
        genres: [show.category, show.channel].filter(Boolean),
        videos: episodes.map((ep, i) => ({
            id: ITEM_PREFIX + ep.id,
            title: episodeTitle(ep, show.name),
            released: ep.aired ? new Date(ep.aired * 1000).toISOString() : new Date(0).toISOString(),
            season: numbering[i].season,
            episode: numbering[i].episode,
            overview: [ep.description, infoLines(ep)].filter(Boolean).join('\n\n'),
            thumbnail: ep.poster || undefined
        }))
    };
}

/** Streams in allen verfügbaren Qualitäten + barrierefreie Fassungen. */
function itemStreams(item, variants = [], { subtitles = [] } = {}) {
    const streams = [];
    const title = displayTitle(item);
    const duration = formatDuration(item.duration);
    const details = [`📺 ${item.channel}`, duration ? `⏱ ${duration}` : null].filter(Boolean).join(' · ');
    const binge = `mvw-${item.show_id}`;

    const qualities = [
        ['HD', decodeRelative(item.url, item.url_hd)],
        ['SD', item.url],
        ['Mobil', decodeRelative(item.url, item.url_low)]
    ];
    const seen = new Set();
    for (const [label, url] of qualities) {
        if (!url || seen.has(url)) continue;
        seen.add(url);
        streams.push({
            name: `${item.channel}\n${label}`,
            description: `${title}\n${details}`,
            url,
            subtitles: subtitles.length ? subtitles : undefined,
            behaviorHints: { notWebReady: false, bingeGroup: `${binge}-${label}` }
        });
    }

    for (const variant of variants) {
        const url = decodeRelative(variant.url, variant.url_hd) || variant.url;
        if (!url || seen.has(url)) continue;
        seen.add(url);
        streams.push({
            name: `${variant.channel}\n${variant.variant || 'Fassung'}`,
            description: `${variant.title}\n${details}`,
            url,
            behaviorHints: { notWebReady: false, bingeGroup: `${binge}-${variant.variant}` }
        });
    }

    if (item.website) {
        streams.push({
            name: `${item.channel}\nWeb`,
            description: 'In der Mediathek des Senders öffnen',
            externalUrl: item.website
        });
    }
    return streams;
}

/** Texte für das generierte Poster eines Eintrags. */
function posterText(item) {
    const showUseful = item.show && !GENERIC_SHOW.test(item.show.trim()) && !fold(item.title).includes(fold(item.show));
    const footer = [formatDate(item.aired), formatDuration(item.duration)].filter(Boolean).join(' · ');
    return { title: item.title, kicker: showUseful ? item.show : null, footer };
}

function truncate(text, max) {
    if (!text || text.length <= max) return text;
    const cut = text.slice(0, max);
    const space = cut.lastIndexOf(' ');
    return `${cut.slice(0, space > max * 0.6 ? space : max).trimEnd()}…`;
}

module.exports = {
    ITEM_PREFIX,
    SHOW_PREFIX,
    displayTitle,
    episodeTitle,
    parseSeasonEpisode,
    formatDate,
    formatDuration,
    posterText,
    itemPreview,
    itemMeta,
    itemStreams,
    showPreview,
    showMeta
};
