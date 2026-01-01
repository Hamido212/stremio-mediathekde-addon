// Sender-Logo Mapping

const LOGO_BASE_URL = 'https://raw.githubusercontent.com/jnk22/kodinerds-iptv/master/logos/tv';

const SENDER_LOGOS = {
    // ARD Familie
    'ARD': `${LOGO_BASE_URL}/ard.png`,
    'Das Erste': `${LOGO_BASE_URL}/ard.png`,
    'tagesschau24': `${LOGO_BASE_URL}/tagesschau24.png`,
    'ARD-alpha': `${LOGO_BASE_URL}/ardalpha.png`,
    'ONE': `${LOGO_BASE_URL}/one.png`,
    
    // Dritte Programme
    'BR': `${LOGO_BASE_URL}/br.png`,
    'HR': `${LOGO_BASE_URL}/hr.png`,
    'MDR': `${LOGO_BASE_URL}/mdr.png`,
    'NDR': `${LOGO_BASE_URL}/ndr.png`,
    'RBB': `${LOGO_BASE_URL}/rbb.png`,
    'SR': `${LOGO_BASE_URL}/sr.png`,
    'SWR': `${LOGO_BASE_URL}/swr.png`,
    'WDR': `${LOGO_BASE_URL}/wdr.png`,
    
    // ZDF Familie
    'ZDF': `${LOGO_BASE_URL}/zdf.png`,
    'ZDFneo': `${LOGO_BASE_URL}/zdfneo.png`,
    'ZDFinfo': `${LOGO_BASE_URL}/zdfinfo.png`,
    'phoenix': `${LOGO_BASE_URL}/phoenix.png`,
    
    // Weitere
    'arte': `${LOGO_BASE_URL}/arte.png`,
    'ARTE': `${LOGO_BASE_URL}/arte.png`,
    'Arte': `${LOGO_BASE_URL}/arte.png`,
    '3sat': `${LOGO_BASE_URL}/3sat.png`,
    'KiKA': `${LOGO_BASE_URL}/kika.png`,
    
    // Fallback
    'default': 'https://via.placeholder.com/300x450/1a1a1a/ffffff?text=Mediathek'
};

class SenderLogos {
    /**
     * Gibt das Logo-URL für einen Sender zurück
     * @param {string} channel - Sender-Name
     * @returns {string} - Logo URL
     */
    static getLogo(channel) {
        if (!channel) {
            return SENDER_LOGOS['default'];
        }

        // Exakte Übereinstimmung
        if (SENDER_LOGOS[channel]) {
            return SENDER_LOGOS[channel];
        }

        // Teilweise Übereinstimmung (case-insensitive)
        const channelLower = channel.toLowerCase();
        for (const [key, value] of Object.entries(SENDER_LOGOS)) {
            if (key.toLowerCase() === channelLower) {
                return value;
            }
        }

        // Teilstring-Match
        for (const [key, value] of Object.entries(SENDER_LOGOS)) {
            if (channelLower.includes(key.toLowerCase()) || key.toLowerCase().includes(channelLower)) {
                return value;
            }
        }

        return SENDER_LOGOS['default'];
    }

    /**
     * Gibt ein Kategorie-Poster zurück
     * @param {string} catalogId - Katalog-ID
     * @returns {string} - Poster URL
     */
    static getCatalogPoster(catalogId) {
        const posters = {
            'de_new': 'https://via.placeholder.com/300x450/2563eb/ffffff?text=Neu',
            'de_docs': 'https://via.placeholder.com/300x450/16a34a/ffffff?text=Dokus',
            'de_news': 'https://via.placeholder.com/300x450/dc2626/ffffff?text=News',
            'de_knowledge': 'https://via.placeholder.com/300x450/9333ea/ffffff?text=Wissen',
            'de_crime': 'https://via.placeholder.com/300x450/1f2937/ffffff?text=Krimi',
            'de_kids': 'https://via.placeholder.com/300x450/f59e0b/ffffff?text=Kinder',
            'de_arte': 'https://via.placeholder.com/300x450/e11d48/ffffff?text=Arte',
            'de_search': 'https://via.placeholder.com/300x450/6b7280/ffffff?text=Suche'
        };

        return posters[catalogId] || SENDER_LOGOS['default'];
    }

    /**
     * Formatiert den Titel für die Anzeige
     * @param {Object} item - MVW Item
     * @returns {string} - Formatierter Titel
     */
    static formatTitle(item) {
        let title = item.title || 'Unbekannt';

        // Füge Datum hinzu wenn verfügbar
        if (item.timestamp) {
            const date = new Date(item.timestamp * 1000);
            const dateStr = date.toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
            title = `${title} (${dateStr})`;
        }

        return title;
    }

    /**
     * Formatiert die Beschreibung für die Meta-Preview
     * @param {Object} item - MVW Item
     * @returns {string} - Formatierte Beschreibung
     */
    static formatDescription(item) {
        const parts = [];

        if (item.topic && item.topic !== item.title) {
            parts.push(item.topic);
        }

        if (item.channel) {
            parts.push(item.channel);
        }

        if (item.timestamp) {
            const date = new Date(item.timestamp * 1000);
            const dateStr = date.toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
            parts.push(dateStr);
        }

        if (item.duration) {
            const minutes = Math.floor(item.duration / 60);
            parts.push(`${minutes} Min`);
        }

        return parts.join(' • ');
    }
}

module.exports = SenderLogos;
