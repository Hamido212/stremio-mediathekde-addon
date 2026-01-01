// Classifier - Kategorisiert Einträge basierend auf categories.json

const fs = require('fs');
const path = require('path');

class Classifier {
    constructor(configPath) {
        this.config = this._loadConfig(configPath);
    }

    /**
     * Lädt categories.json
     */
    _loadConfig(configPath) {
        const fullPath = configPath || path.join(__dirname, 'categories.json');
        const data = fs.readFileSync(fullPath, 'utf-8');
        return JSON.parse(data);
    }

    /**
     * Klassifiziert einen Eintrag
     * @param {Object} item - { title, channel, topic, description }
     * @returns {string|null} - Kategorie oder null
     */
    classify(item) {
        const categories = this.config.categories;

        // Sortiere nach Priority (höchste zuerst)
        const sortedCategories = Object.entries(categories)
            .sort((a, b) => b[1].priority - a[1].priority);

        for (const [categoryName, categoryDef] of sortedCategories) {
            if (this._matchesCategory(item, categoryDef.rules)) {
                return categoryName;
            }
        }

        return null; // Keine Kategorie
    }

    /**
     * Prüft ob Item einer Kategorie entspricht
     */
    _matchesCategory(item, rules) {
        for (const rule of rules) {
            const fieldValue = item[rule.field];
            if (!fieldValue) continue;

            const valueNormalized = fieldValue.toString().toLowerCase();

            for (const matchPattern of rule.match) {
                const patternNormalized = matchPattern.toLowerCase();
                
                if (valueNormalized.includes(patternNormalized)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Gibt Liste der Sender zurück
     */
    getSenders() {
        return this.config.senders || [];
    }

    /**
     * Gibt Liste der Kategorien zurück
     */
    getCategories() {
        return Object.keys(this.config.categories || {});
    }
}

module.exports = Classifier;
