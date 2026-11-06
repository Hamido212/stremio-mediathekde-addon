'use strict';

// Live-TV-Anbieter: kuratierte Senderliste + Abgleich mit iptv-org
// (nur offizielle CDN-Hosts) + Erreichbarkeitsprüfung der Streams.

const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../logger');
const { fetchJson, probeUrl } = require('../http');
const { LIVE_CHANNELS, LIVE_GROUPS, isOfficialUrl } = require('./channels');

const IPTV_STREAMS = 'https://iptv-org.github.io/api/streams.json';
const IPTV_LOGOS = 'https://iptv-org.github.io/api/logos.json';

async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index], index);
        }
    });
    await Promise.all(workers);
    return results;
}

function freshChannels() {
    return LIVE_CHANNELS.map((c) => ({
        ...c,
        logo: null,
        streams: c.streams.map((s) => ({ ...s, status: 'unknown' }))
    }));
}

class LiveTvProvider {
    constructor({ cacheFile = path.join(config.CACHE_DIR, 'live-tv.json'), fetchImpl } = {}) {
        this.cacheFile = cacheFile;
        this.channels = freshChannels();
        this.updatedAt = null;
        this.timer = null;
        this._loadCache();
    }

    _loadCache() {
        try {
            const cached = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
            if (Array.isArray(cached.channels) && cached.channels.length) {
                const known = new Map(cached.channels.map((c) => [c.id, c]));
                // Kuratierte Liste ist maßgeblich (neue/entfernte Sender), Cache liefert Streams + Logos
                this.channels = freshChannels().map((c) => {
                    const hit = known.get(c.id);
                    return hit ? { ...c, logo: hit.logo, streams: hit.streams.length ? hit.streams : c.streams } : c;
                });
                this.updatedAt = cached.updatedAt || null;
            }
        } catch { /* kein Cache vorhanden */ }
    }

    _saveCache() {
        try {
            fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
            fs.writeFileSync(this.cacheFile, JSON.stringify({ updatedAt: this.updatedAt, channels: this.channels }));
        } catch (error) {
            logger.warn('Live-TV-Cache konnte nicht gespeichert werden', { error: error.message });
        }
    }

    start({ intervalHours = config.LIVE_REFRESH_HOURS } = {}) {
        const age = this.updatedAt ? Date.now() - Date.parse(this.updatedAt) : Infinity;
        if (age > intervalHours * 3600 * 1000) this.refresh();
        this.timer = setInterval(() => this.refresh(), intervalHours * 3600 * 1000);
        this.timer.unref();
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
    }

    async refresh() {
        const channels = freshChannels();
        try {
            const [streams, logos] = await Promise.all([
                fetchJson(IPTV_STREAMS, { timeoutMs: 60000 }),
                fetchJson(IPTV_LOGOS, { timeoutMs: 60000 }).catch(() => [])
            ]);
            const byIptv = new Map();
            for (const channel of channels) {
                for (const id of [channel.iptv, ...(channel.alsoIptv || [])]) byIptv.set(id, channel);
            }
            for (const entry of streams) {
                const channel = byIptv.get(entry.channel);
                if (!channel || !isOfficialUrl(entry.url)) continue;
                if (channel.streams.some((s) => s.url === entry.url)) continue;
                if (entry.user_agent || entry.referrer) continue; // braucht Spezial-Header → im Player unzuverlässig
                const label = [entry.feed && entry.feed !== 'SD' && entry.feed !== 'HD' ? entry.feed : null, entry.quality]
                    .filter(Boolean).join(' · ') || 'Live';
                channel.streams.push({ label, url: entry.url, status: 'unknown' });
            }
            for (const channel of channels) {
                const candidates = logos.filter((l) => l.channel === channel.iptv && !l.feed && /^https:/.test(l.url));
                candidates.sort((a, b) => (a.format === 'PNG' ? -1 : 0) - (b.format === 'PNG' ? -1 : 0) || (b.width || 0) - (a.width || 0));
                channel.logo = candidates[0]?.url || null;
            }
        } catch (error) {
            logger.warn('iptv-org nicht erreichbar – nutze kuratierte Stream-Liste', { error: error.message });
        }

        // Erreichbarkeit prüfen: tote Streams entfernen, funktionierende nach vorne
        const all = channels.flatMap((c) => c.streams.map((s) => ({ channel: c, stream: s })));
        await mapLimit(all, 8, async ({ stream }) => { stream.status = await probeUrl(stream.url); });
        const rank = { ok: 0, unknown: 1, dead: 2 };
        for (const channel of channels) {
            const alive = channel.streams.filter((s) => s.status !== 'dead');
            channel.streams = (alive.length ? alive : channel.streams)
                .map((s, i) => ({ s, i }))
                .sort((a, b) => rank[a.s.status] - rank[b.s.status] || a.i - b.i)
                .map(({ s }) => s);
        }

        this.channels = channels;
        this.updatedAt = new Date().toISOString();
        this._saveCache();
        const total = channels.reduce((n, c) => n + c.streams.length, 0);
        const ok = channels.reduce((n, c) => n + c.streams.filter((s) => s.status === 'ok').length, 0);
        logger.info('Live-TV aktualisiert', { channels: channels.length, streams: total, reachable: ok });
    }

    list({ group, search } = {}) {
        let list = this.channels.filter((c) => c.streams.length);
        if (group) list = list.filter((c) => c.group === group);
        if (search) {
            const q = search.toLowerCase();
            list = list.filter((c) => c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
        }
        return list;
    }

    get(id) {
        return this.channels.find((c) => c.id === id) || null;
    }

    stats() {
        return {
            channels: this.channels.filter((c) => c.streams.length).length,
            updatedAt: this.updatedAt
        };
    }
}

module.exports = { LiveTvProvider, LIVE_GROUPS, mapLimit };
