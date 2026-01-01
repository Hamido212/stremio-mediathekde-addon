// ID-Generator für stabile und deterministische IDs

const crypto = require('crypto');

class IdGenerator {
    /**
     * Generiert eine stabile ID für einen MediathekView-Eintrag
     * @param {Object} item - MediathekView Item
     * @returns {string} - Stremio-kompatible ID (de-mvw:<hash>)
     */
    static generate(item) {
        let idBase;

        // Strategie 1: channel + url_website (bevorzugt)
        if (item.url_website && item.url_website.trim()) {
            idBase = `${item.channel}|${item.url_website}`;
        }
        // Strategie 2: channel + url_video
        else if (item.url_video && item.url_video.trim()) {
            idBase = `${item.channel}|${item.url_video}`;
        }
        // Fallback: channel + title + timestamp
        else {
            idBase = `${item.channel}|${item.title}|${item.timestamp}`;
        }

        // SHA1 Hash (deterministisch)
        const hash = crypto
            .createHash('sha1')
            .update(idBase, 'utf8')
            .digest('hex');

        return `de-mvw:${hash}`;
    }

    /**
     * Parst eine ID zurück (nur für Debugging/Logging)
     * @param {string} id - Stremio ID
     * @returns {Object} - Parsed ID Info
     */
    static parse(id) {
        if (!id || !id.startsWith('de-mvw:')) {
            return null;
        }

        const hash = id.substring('de-mvw:'.length);
        
        return {
            prefix: 'de-mvw',
            hash,
            valid: /^[a-f0-9]{40}$/i.test(hash)
        };
    }

    /**
     * Validiert ob eine ID gültig ist
     * @param {string} id
     * @returns {boolean}
     */
    static isValid(id) {
        const parsed = IdGenerator.parse(id);
        return parsed && parsed.valid;
    }
}

module.exports = IdGenerator;
