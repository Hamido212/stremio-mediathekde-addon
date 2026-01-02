// Poster Fetcher - Lädt Poster von TMDB mit intelligentem Matching

const TMDBClient = require('./tmdb-client');
const TitleMatcher = require('./title-matcher');
const logger = require('../logger');

class PosterFetcher {
    constructor(apiKey, options = {}) {
        this.tmdb = new TMDBClient(apiKey);
        this.minSimilarity = options.minSimilarity || 0.6; // Minimale Titel-Ähnlichkeit (reduziert für mehr Treffer)
        this.cache = new Map(); // In-Memory Cache
        this.stats = {
            requests: 0,
            hits: 0,
            misses: 0,
            skipped: 0
        };
    }

    /**
     * Lädt Poster für ein Item
     */
    async fetchPoster(item) {
        if (!this.tmdb.enabled) {
            return null;
        }

        const { title, channel, topic, date_ts } = item;

        // Normalisiere Titel
        const normalizedTitle = TitleMatcher.normalize(title, channel, topic);
        
        // Überspringe zu generische Titel
        if (!normalizedTitle || TitleMatcher.isGeneric(normalizedTitle)) {
            this.stats.skipped++;
            return null;
        }

        // Cache-Check
        const cacheKey = normalizedTitle.toLowerCase();
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            return cached;
        }

        try {
            this.stats.requests++;

            // Extrahiere Jahr (falls vorhanden)
            const year = date_ts 
                ? new Date(date_ts * 1000).getFullYear().toString()
                : null;

            // Suche auf TMDB
            const result = await this.tmdb.search(normalizedTitle, { year });

            if (result && result.poster) {
                // Prüfe Titel-Ähnlichkeit
                const similarity = TitleMatcher.calculateSimilarity(
                    normalizedTitle,
                    result.title
                );

                if (similarity >= this.minSimilarity) {
                    this.stats.hits++;
                    
                    // Cache speichern
                    this.cache.set(cacheKey, result.poster);
                    
                    logger.info('TMDB Poster gefunden', {
                        original: title,
                        normalized: normalizedTitle,
                        matched: result.title,
                        similarity: similarity.toFixed(2),
                        poster: result.poster
                    });

                    return result.poster;
                } else {
                    logger.debug('TMDB Match zu ungenau', {
                        original: title,
                        matched: result.title,
                        similarity: similarity.toFixed(2)
                    });
                }
            }

            this.stats.misses++;
            
            // Auch "kein Ergebnis" cachen (um wiederholte Anfragen zu vermeiden)
            this.cache.set(cacheKey, null);
            
            return null;

        } catch (error) {
            logger.warn('Poster fetch failed', {
                title: normalizedTitle,
                error: error.message
            });
            return null;
        }
    }

    /**
     * Batch-Fetch für mehrere Items
     */
    async fetchPosters(items, options = {}) {
        const delay = options.delay || 250; // Rate-Limiting: 4 Anfragen/Sekunde
        const results = [];

        for (const item of items) {
            const poster = await this.fetchPoster(item);
            results.push({ item, poster });

            // Rate-Limiting
            if (delay > 0) {
                await this._sleep(delay);
            }
        }

        return results;
    }

    /**
     * Gibt Statistiken zurück
     */
    getStats() {
        const total = this.stats.requests;
        const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(1) : 0;

        return {
            ...this.stats,
            hitRate: `${hitRate}%`,
            cacheSize: this.cache.size
        };
    }

    /**
     * Leert Cache
     */
    clearCache() {
        this.cache.clear();
        logger.info('TMDB Cache geleert');
    }

    /**
     * Sleep Helper
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = PosterFetcher;
