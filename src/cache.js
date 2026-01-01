// Cache mit Stale-While-Revalidate Support

const config = require('./config');
const logger = require('./logger');

class Cache {
    constructor() {
        // In-Memory LRU Cache
        this.store = new Map();
        this.maxSize = 1000; // Max Anzahl Einträge
        this.revalidating = new Set(); // Tracking für laufende Revalidierungen
    }

    /**
     * Holt einen Wert aus dem Cache
     * @param {string} key - Cache-Key
     * @param {Function} fetchFn - Funktion zum Abrufen bei Cache-Miss
     * @param {number} ttl - TTL in Sekunden
     * @param {boolean} staleWhileRevalidate - Stale-While-Revalidate aktivieren
     * @returns {Promise<any>} - Cached oder frischer Wert
     */
    async get(key, fetchFn, ttl, staleWhileRevalidate = true) {
        const cached = this.store.get(key);
        const now = Date.now();

        if (cached) {
            const age = (now - cached.timestamp) / 1000; // in Sekunden
            
            // Cache ist noch frisch
            if (age < ttl) {
                logger.debug('Cache HIT (fresh)', { key, age: `${age.toFixed(1)}s` });
                return cached.value;
            }

            // Cache ist abgelaufen
            if (staleWhileRevalidate) {
                // Sofort stale value zurückgeben
                logger.debug('Cache HIT (stale)', { key, age: `${age.toFixed(1)}s` });
                
                // Async revalidieren (nur wenn nicht bereits läuft)
                if (!this.revalidating.has(key)) {
                    this._revalidateAsync(key, fetchFn, ttl);
                }
                
                return cached.value;
            }
        }

        // Cache-Miss oder kein Stale-While-Revalidate
        logger.debug('Cache MISS', { key });
        return await this._fetchAndCache(key, fetchFn, ttl);
    }

    /**
     * Setzt einen Wert im Cache
     * @param {string} key - Cache-Key
     * @param {any} value - Wert
     * @param {number} ttl - TTL in Sekunden (optional)
     */
    set(key, value, ttl = null) {
        // LRU: Wenn zu groß, ältesten Eintrag löschen
        if (this.store.size >= this.maxSize) {
            const firstKey = this.store.keys().next().value;
            this.store.delete(firstKey);
        }

        this.store.set(key, {
            value,
            timestamp: Date.now(),
            ttl
        });

        logger.debug('Cache SET', { key, size: this.store.size });
    }

    /**
     * Löscht einen Wert aus dem Cache
     * @param {string} key - Cache-Key
     */
    delete(key) {
        this.store.delete(key);
        logger.debug('Cache DELETE', { key });
    }

    /**
     * Leert den gesamten Cache
     */
    clear() {
        this.store.clear();
        logger.info('Cache CLEAR', { size: 0 });
    }

    /**
     * Gibt Cache-Statistiken zurück
     */
    getStats() {
        return {
            size: this.store.size,
            maxSize: this.maxSize,
            keys: Array.from(this.store.keys())
        };
    }

    // === Private Methoden ===

    async _fetchAndCache(key, fetchFn, ttl) {
        try {
            const value = await fetchFn();
            this.set(key, value, ttl);
            return value;
        } catch (error) {
            logger.error('Cache fetch error', { key, error: error.message });
            throw error;
        }
    }

    async _revalidateAsync(key, fetchFn, ttl) {
        this.revalidating.add(key);
        
        try {
            const value = await fetchFn();
            this.set(key, value, ttl);
            logger.debug('Cache REVALIDATE success', { key });
        } catch (error) {
            logger.warn('Cache REVALIDATE failed', { key, error: error.message });
        } finally {
            this.revalidating.delete(key);
        }
    }

    /**
     * Erstellt einen Cache-Key für eine Catalog-Query
     */
    static makeCatalogKey(catalogId, genre, search, skip) {
        const parts = ['catalog', catalogId];
        if (genre) parts.push(`genre:${genre}`);
        if (search) parts.push(`search:${search}`);
        if (skip) parts.push(`skip:${skip}`);
        return parts.join('|');
    }

    /**
     * Erstellt einen Cache-Key für ein Item
     */
    static makeItemKey(id) {
        return `item|${id}`;
    }
}

// Singleton Instance
const cache = new Cache();

module.exports = cache;
