// Konfiguration für das Stremio Add-on

module.exports = {
    // Basis-URL für öffentliche Erreichbarkeit
    BASE_URL: process.env.BASE_URL || 'http://localhost:7005',
    
    // Server Port
    PORT: process.env.PORT || 7005,
    
    // Cache-Einstellungen (in Sekunden)
    CACHE_TTL: {
        NEW_CONTENT: 10 * 60,        // 10 Minuten für neue Inhalte
        STABLE_CONTENT: 6 * 60 * 60,  // 6 Stunden für stabile Inhalte
        ITEM_CACHE: 3 * 60 * 60,      // 3 Stunden für Item-Details
        SEARCH_RESULTS: 30 * 60       // 30 Minuten für Suchergebnisse
    },
    
    // Pagination
    ITEMS_PER_PAGE: 20
};
