// Handler für Stremio Add-on (lokale SQLite Queries)

const LocalQueryBuilder = require('./local-query-builder');
const IdGenerator = require('./id-generator');
const cache = require('./cache');
const config = require('./config');
const logger = require('./logger');

const queryBuilder = new LocalQueryBuilder();

class Handlers {
    /**
     * Catalog Handler - Liefert Listen von MetaPreviews
     */
    static async handleCatalog(args) {
        const { type, id: catalogId, extra = {} } = args;
        
        logger.info('Catalog Request', { catalogId, genre: extra.genre, search: extra.search, skip: extra.skip });

        try {
            // Cache-Key erstellen
            const cacheKey = cache.constructor.makeCatalogKey(
                catalogId,
                extra.genre,
                extra.search,
                extra.skip
            );

            // TTL basierend auf Katalog
            const ttl = catalogId === 'de_new' 
                ? config.CACHE_TTL.NEW_CONTENT 
                : config.CACHE_TTL.STABLE_CONTENT;

            // Cache-Lookup mit Stale-While-Revalidate
            const metas = await cache.get(
                cacheKey,
                async () => {
                    return await Handlers._fetchCatalogMetas(catalogId, extra);
                },
                ttl,
                true // staleWhileRevalidate
            );

            return { metas };
            
        } catch (error) {
            logger.error('Catalog Handler Error', { catalogId, error: error.message });
            return { metas: [] };
        }
    }

    /**
     * Meta Handler - Liefert Details zu einem Item
     */
    static async handleMeta(args) {
        const { type, id } = args;
        
        logger.info('Meta Request', { id });

        try {
            // Validiere ID
            if (!IdGenerator.isValid(id)) {
                logger.warn('Invalid ID', { id });
                return { meta: null };
            }

            // Cache-Lookup
            const cacheKey = cache.constructor.makeItemKey(id);
            
            const meta = await cache.get(
                cacheKey,
                async () => {
                    return await Handlers._fetchMetaDetails(id);
                },
                config.CACHE_TTL.ITEM_CACHE,
                true
            );

            return { meta };
            
        } catch (error) {
            logger.error('Meta Handler Error', { id, error: error.message });
            return { meta: null };
        }
    }

    /**
     * Stream Handler - Liefert Stream-URLs
     */
    static async handleStream(args) {
        const { type, id } = args;
        
        logger.info('Stream Request', { id });

        try {
            // Validiere ID
            if (!IdGenerator.isValid(id)) {
                logger.warn('Invalid ID', { id });
                return { streams: [] };
            }

            // Cache-Lookup für Item-Details
            const item = queryBuilder.queryMeta(id);

            if (!item || !item.url_video) {
                logger.warn('No stream found', { id });
                return { streams: [] };
            }

            // Stream-Objekt erstellen
            const streams = [{
                name: item.channel || 'Mediathek',
                title: item.title,
                url: item.url_video,
                behaviorHints: {
                    notWebReady: false
                }
            }];

            return { streams };
            
        } catch (error) {
            logger.error('Stream Handler Error', { id, error: error.message });
            return { streams: [] };
        }
    }

    // === Private Helper Methods ===

    /**
     * Fetcht Catalog Metas aus lokaler DB
     */
    static async _fetchCatalogMetas(catalogId, extra) {
        const filters = {
            genre: extra.genre,
            search: extra.search,
            skip: parseInt(extra.skip) || 0,
            limit: 20
        };

        let items = [];

        // Query basierend auf Katalog-ID
        switch (catalogId) {
            case 'de_new':
                items = queryBuilder.queryCatalogNew(filters);
                break;

            case 'de_docs':
                items = queryBuilder.queryCatalogByCategory('Doku', filters);
                break;

            case 'de_news':
                items = queryBuilder.queryCatalogByCategory('News', filters);
                break;

            case 'de_knowledge':
                items = queryBuilder.queryCatalogByCategory('Wissen', filters);
                break;

            case 'de_crime':
                items = queryBuilder.queryCatalogByCategory('Krimi', filters);
                break;

            case 'de_kids':
                items = queryBuilder.queryCatalogByCategory('Kinder', filters);
                break;

            case 'de_arte':
                items = queryBuilder.queryCatalogBySender('arte', filters);
                break;

            case 'de_search':
                if (filters.search) {
                    items = queryBuilder.querySearch(filters.search, filters);
                }
                break;

            default:
                logger.warn('Unknown catalog', { catalogId });
                return [];
        }

        // In MetaPreviews konvertieren
        const metas = items.map(item => this._itemToMetaPreview(item));

        logger.info('Catalog fetched', { catalogId, count: metas.length });
        
        return metas;
    }

    /**
     * Fetcht Meta-Details für ein Item
     */
    static async _fetchMetaDetails(id) {
        const item = queryBuilder.queryMeta(id);

        if (!item) {
            logger.warn('Item not found', { id });
            return null;
        }

        // Meta-Objekt erstellen
        const meta = {
            id,
            type: 'movie',
            name: item.title || 'Unbekannt',
            description: this._buildFullDescription(item),
            poster: item.poster,
            background: item.poster,
            releaseInfo: item.date_ts 
                ? new Date(item.date_ts * 1000).toLocaleDateString('de-DE')
                : null,
            runtime: item.duration_sec ? `${Math.floor(item.duration_sec / 60)} Min` : null,
            website: item.url_website || null
        };

        return meta;
    }

    /**
     * Konvertiert DB-Item zu MetaPreview
     */
    static _itemToMetaPreview(item) {
        return {
            id: item.id,
            type: 'movie',
            name: item.title || 'Unbekannt',
            poster: item.poster,
            description: item.description ? item.description.substring(0, 200) + '...' : null,
            releaseInfo: item.date_ts 
                ? new Date(item.date_ts * 1000).getFullYear().toString()
                : null
        };
    }

    /**
     * Baut eine vollständige Beschreibung
     */
    static _buildFullDescription(item) {
        const parts = [];

        if (item.description) {
            parts.push(item.description);
            parts.push('\n\n');
        }

        if (item.topic && item.topic !== item.title) {
            parts.push(`📁 ${item.topic}\n`);
        }

        if (item.channel) {
            parts.push(`📺 ${item.channel}\n`);
        }

        if (item.date_ts) {
            const date = new Date(item.date_ts * 1000);
            const dateStr = date.toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            parts.push(`📅 ${dateStr}\n`);
        }

        if (item.duration_sec) {
            const hours = Math.floor(item.duration_sec / 3600);
            const minutes = Math.floor((item.duration_sec % 3600) / 60);
            const durationStr = hours > 0 
                ? `${hours}h ${minutes}m`
                : `${minutes} Min`;
            parts.push(`⏱️ ${durationStr}\n`);
        }

        return parts.join('');
    }
}

module.exports = Handlers;
