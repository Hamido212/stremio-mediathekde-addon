    // Stremio Add-on für Deutsche Mediatheken (lokale SQLite DB)

const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const { manifest } = require('./src/manifest');
const Handlers = require('./src/handlers');
const ConfigHandler = require('./src/config-handler');
const config = require('./src/config');
const logger = require('./src/logger');
const cache = require('./src/cache');
const LocalQueryBuilder = require('./src/local-query-builder');
const path = require('path');

// Query Builder für Health/Debug
const queryBuilder = new LocalQueryBuilder();

// Add-on Builder erstellen
const builder = new addonBuilder(manifest);

// Catalog Handler
builder.defineCatalogHandler(async (args) => {
    return await Handlers.handleCatalog(args);
});

// Meta Handler
builder.defineMetaHandler(async (args) => {
    return await Handlers.handleMeta(args);
});

// Stream Handler
builder.defineStreamHandler(async (args) => {
    return await Handlers.handleStream(args);
});

// Stremio Add-on Interface
const addonInterface = builder.getInterface();

// Express App erstellen
const app = express();
const PORT = config.PORT;

// CORS Middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

const landingHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>DE Mediatheken - Stremio Add-on</title>
    <style>
        body { font-family: sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        h1 { color: #333; }
        a { color: #667eea; }
        .button { display: inline-block; padding: 12px 24px; background: #667eea; color: white; 
                  text-decoration: none; border-radius: 6px; margin: 10px 5px; }
    </style>
</head>
<body>
    <h1>🎬 DE Mediatheken - Stremio Add-on</h1>
    <p>Willkommen zum deutschen Mediatheken Add-on für Stremio!</p>
    
    <h2>Installation</h2>
    <a href="${config.BASE_URL}/manifest.json" class="button">Add-on installieren</a>
    <a href="${config.BASE_URL}/configure" class="button">Konfigurieren</a>
    
    <h2>Features</h2>
    <ul>
        <li>8 kuratierte Kataloge (Neu, Dokus, News, Wissen, Krimis, Kinder, Arte, Suche)</li>
        <li>Filter nach Sender und Kategorie</li>
        <li>Volltextsuche</li>
        <li>Intelligentes Caching</li>
    </ul>
    
    <h2>API Endpoints</h2>
    <ul>
        <li><a href="${config.BASE_URL}/manifest.json">Manifest</a></li>
        <li><a href="${config.BASE_URL}/health">Health Check (inkl. DB Stats)</a></li>
        <li><a href="${config.BASE_URL}/configure">Konfiguration</a></li>
        <li><a href="${config.BASE_URL}/debug/db">Debug DB Query</a></li>
        <li><a href="${config.BASE_URL}/metrics">Metrics</a></li>
    </ul>
    
    <h2>Update</h2>
    <p>Um die Filmliste zu aktualisieren, führe aus:</p>
    <pre>npm run update</pre>
</body>
</html>
`;

// Express Routes

// Landing Page
app.get('/', (req, res) => {
    res.send(landingHTML);
});

// Health Check
app.get('/health', (req, res) => {
    try {
        const cacheStats = cache.getStats();
        const dbStats = queryBuilder.queryStats();
        const StateManager = require('./src/updater/state-manager');
        const stateManager = new StateManager(path.join(process.cwd(), 'data', 'meta', 'state.json'));
        const state = stateManager.getState();

        res.json({
            status: 'ok',
            uptime: process.uptime(),
            cache: {
                size: cacheStats.size,
                maxSize: cacheStats.maxSize
            },
            database: {
                totalItems: dbStats.totalCount,
                lastUpdate: dbStats.lastUpdate,
                source: state.source || 'unknown',
                lastUpdateSuccess: state.lastUpdateSuccess 
                    ? new Date(state.lastUpdateSuccess).toISOString()
                    : null
            },
            memory: {
                heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
                heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'error',
            error: error.message
        });
    }
});

// Konfiguration
app.get('/configure', (req, res) => {
    res.type('html').send(ConfigHandler.getConfigHTML());
});

// Debug DB Query
app.get('/debug/db', (req, res) => {
    try {
        const testQuery = {
            limit: 5
        };
        
        const startTime = Date.now();
        const results = queryBuilder.queryCatalogNew(testQuery);
        const duration = Date.now() - startTime;
        
        res.json({
            status: 'ok',
            dbPath: queryBuilder.dbPath,
            testQuery,
            results: results.length,
            duration: `${duration}ms`,
            sampleItems: results.slice(0, 2).map(item => ({
                id: item.id,
                title: item.title,
                channel: item.channel,
                category: item.category,
                date_ts: item.date_ts
            }))
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message,
            stack: error.stack
        });
    }
});

// Metrics
app.get('/metrics', (req, res) => {
    const cacheStats = cache.getStats();
    const dbStats = queryBuilder.queryStats();
    
    res.json({
        uptime: process.uptime(),
        memory: {
            heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
        },
        cache: {
            size: cacheStats.size,
            maxSize: cacheStats.maxSize
        },
        database: dbStats,
        timestamp: new Date().toISOString()
    });
});

// Manifest
app.get('/manifest.json', (req, res) => {
    res.json(manifest);
});

// Konfiguriertes Manifest
app.get('/:config/manifest.json', (req, res) => {
    try {
        const userConfig = ConfigHandler.parseConfig(req.params.config);
        
        // Erstelle angepasstes Manifest (gleiche Struktur, aber mit Config in ID)
        const customManifest = {
            ...manifest,
            id: `${manifest.id}.${req.params.config.substring(0, 8)}`,
            behaviorHints: {
                ...manifest.behaviorHints,
                configurationRequired: false
            }
        };
        
        res.json(customManifest);
    } catch (error) {
        logger.error('Config Manifest Error', { error: error.message });
        res.status(400).json({ error: 'Invalid configuration' });
    }
});

// Konfigurierte Stremio Routes (mit Wildcard für komplexe IDs)
// WICHTIG: MUSS VOR der nicht-konfigurierten Route stehen!
app.get('/:config/:resource/:type/*.json', async (req, res) => {
    try {
        const { config, resource, type } = req.params;
        const idWithPath = req.params[0];
        
        // Parse User Config
        const userConfig = ConfigHandler.parseConfig(config);
        
        // Parse extra from ID (nur für catalog, nicht für meta/stream)
        let catalogId = idWithPath;
        let extra = { userConfig };
        
        if (resource === 'catalog') {
            // Nur bei Katalog-Requests extra parsen
            if (idWithPath.includes(':')) {
                // Base64-encoded JSON (z.B. "de_kids:eyJza2lwIjoyMH0")
                const parts = idWithPath.split(':');
                catalogId = parts[0];
                try {
                    const decoded = Buffer.from(parts[1], 'base64').toString('utf8');
                    extra = { ...extra, ...JSON.parse(decoded) };
                } catch (e) {
                    logger.warn('Failed to parse base64 extra', { id: idWithPath, error: e.message });
                }
            } else if (idWithPath.includes('/')) {
                // Key=value pairs (z.B. "de_kids/skip=20")
                const parts = idWithPath.split('/');
                catalogId = parts[0];
                for (let i = 1; i < parts.length; i++) {
                    const [key, value] = parts[i].split('=');
                    if (key && value !== undefined) {
                        extra[key] = isNaN(value) ? value : Number(value);
                    }
                }
            }
            
            // Fallback: Query-Parameter
            if (req.query.search) extra.search = req.query.search;
            if (req.query.genre) extra.genre = req.query.genre;
            if (req.query.skip) extra.skip = Number(req.query.skip);
            
            // User-Config Parameter hinzufügen
            extra.minDuration = userConfig.minDuration;
        }
        
        const args = { resource, type, id: catalogId, extra };
        let result;
        
        if (resource === 'catalog') {
            result = await Handlers.handleCatalog(args);
        } else if (resource === 'meta') {
            result = await Handlers.handleMeta(args);
        } else if (resource === 'stream') {
            result = await Handlers.handleStream(args);
        } else {
            return res.status(404).json({ error: 'Resource not found' });
        }
        
        res.json(result);
    } catch (error) {
        logger.error('Configured Request error', { error: error.message, stack: error.stack });
        res.status(500).json({ error: error.message });
    }
});

// Stremio Add-on Routes ohne Config (catalog, meta, stream)
// Verwendet wildcard (*) für id, um Pfade wie "de_kids/skip=20.json" zu unterstützen
app.get('/:resource/:type/*.json', async (req, res) => {
    try {
        const { resource, type } = req.params;
        // params[0] enthält den wildcard-Teil (alles zwischen type/ und .json)
        const idWithPath = req.params[0];
        
        // Parse extra from ID (nur für catalog, nicht für meta/stream)
        let catalogId = idWithPath;
        let extra = {};
        
        if (resource === 'catalog') {
            // Nur bei Katalog-Requests extra parsen
            if (idWithPath.includes(':')) {
                // Base64-encoded JSON (z.B. "de_kids:eyJza2lwIjoyMH0")
                const parts = idWithPath.split(':');
                catalogId = parts[0];
                try {
                    const decoded = Buffer.from(parts[1], 'base64').toString('utf8');
                    extra = JSON.parse(decoded);
                } catch (e) {
                    logger.warn('Failed to parse base64 extra', { id: idWithPath, error: e.message });
                }
            } else if (idWithPath.includes('/')) {
                // Key=value pairs (z.B. "de_kids/skip=20")
                const parts = idWithPath.split('/');
                catalogId = parts[0];
                for (let i = 1; i < parts.length; i++) {
                    const [key, value] = parts[i].split('=');
                    if (key && value !== undefined) {
                        extra[key] = isNaN(value) ? value : Number(value);
                    }
                }
            }
            
            // Fallback: Query-Parameter (für manuelles Testen)
            if (Object.keys(extra).length === 0) {
                extra = {
                    search: req.query.search,
                    genre: req.query.genre,
                    skip: Number(req.query.skip || 0)
                };
            }
        }
        
        const args = { resource, type, id: catalogId, extra };
        let result;
        
        if (resource === 'catalog') {
            result = await Handlers.handleCatalog(args);
        } else if (resource === 'meta') {
            result = await Handlers.handleMeta(args);
        } else if (resource === 'stream') {
            result = await Handlers.handleStream(args);
        } else {
            return res.status(404).json({ error: 'Resource not found' });
        }
        
        res.json(result);
    } catch (error) {
        logger.error('Request error', { error: error.message, stack: error.stack });
        res.status(500).json({ error: error.message });
    }
});

// Server starten
const server = app.listen(PORT, () => {
    logger.info('Server gestartet', {
        port: PORT,
        manifestUrl: `${config.BASE_URL}/manifest.json`,
        healthUrl: `${config.BASE_URL}/health`,
        configUrl: `${config.BASE_URL}/configure`
    });

    console.log('\n🎬 DE Mediatheken Stremio Add-on');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📍 Home:      ${config.BASE_URL}/`);
    console.log(`📍 Manifest:  ${config.BASE_URL}/manifest.json`);
    console.log(`🔧 Config:    ${config.BASE_URL}/configure`);
    console.log(`❤️  Health:    ${config.BASE_URL}/health`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});

// Graceful Shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM empfangen, fahre herunter...');
    server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
    logger.info('SIGINT empfangen, fahre herunter...');
    server.close(() => process.exit(0));
});

module.exports = server;
