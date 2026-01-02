// Title Matcher - Intelligente Titel-Normalisierung für TMDB-Suche

class TitleMatcher {
    /**
     * Normalisiert Titel für besseres TMDB-Matching
     */
    static normalize(title, channel, topic) {
        if (!title) return null;

        let normalized = title;

        // 1. Bekannte Serien-Formate extrahieren
        normalized = this._extractSeriesName(normalized, channel);

        // 2. Episoden-Suffix entfernen
        normalized = this._removeEpisodeInfo(normalized);

        // 3. Datum/Uhrzeit entfernen
        normalized = this._removeDateInfo(normalized);

        // 4. Sender-Prefix entfernen
        normalized = this._removeSenderPrefix(normalized, channel);

        // 5. Sonderzeichen normalisieren
        normalized = this._cleanSpecialChars(normalized);

        // 6. Whitespace normalisieren
        normalized = normalized.trim().replace(/\s+/g, ' ');

        return normalized || null;
    }

    /**
     * Extrahiert Serie aus Titel (z.B. "Tatort: Der Maulwurf" -> "Tatort")
     */
    static _extractSeriesName(title, channel) {
        // Bekannte deutsche Serien
        const knownSeries = [
            'Tatort',
            'Polizeiruf 110',
            'Der Alte',
            'SOKO',
            'Die Rosenheim-Cops',
            'Notruf Hafenkante',
            'In aller Freundschaft',
            'Sturm der Liebe',
            'Lindenstraße',
            'Verbotene Liebe',
            'Gute Zeiten, schlechte Zeiten',
            'Unter uns',
            'Alles was zählt',
            'Babylon Berlin',
            'Dark',
            'Deutschland 83',
            'Charité',
            'Ku\'damm'
        ];

        for (const series of knownSeries) {
            const regex = new RegExp(`^${series}\\b`, 'i');
            if (regex.test(title)) {
                return series;
            }
        }

        // Trenne bei Doppelpunkt (oft: "Serie: Episode")
        if (title.includes(':')) {
            const parts = title.split(':');
            const firstPart = parts[0].trim();
            
            // Wenn erster Teil kurz ist (Serienname), nutze ihn
            if (firstPart.length > 3 && firstPart.length < 40) {
                return firstPart;
            }
        }

        return title;
    }

    /**
     * Entfernt Episoden-Informationen
     */
    static _removeEpisodeInfo(title) {
        // Episoden-Pattern: (1/5), (Folge 3), Episode 2, etc.
        const patterns = [
            /\s*\(\d+\/\d+\)\s*$/i,           // (1/5)
            /\s*\(Folge\s+\d+\)\s*$/i,        // (Folge 3)
            /\s*\(Teil\s+\d+\)\s*$/i,         // (Teil 2)
            /\s*-\s*Folge\s+\d+\s*$/i,        // - Folge 3
            /\s*-\s*Teil\s+\d+\s*$/i,         // - Teil 2
            /\s*Episode\s+\d+\s*$/i,          // Episode 2
            /\s*\|\s*Folge\s+\d+\s*$/i,       // | Folge 3
            /\s*Staffel\s+\d+.*$/i            // Staffel 2...
        ];

        for (const pattern of patterns) {
            title = title.replace(pattern, '');
        }

        return title;
    }

    /**
     * Entfernt Datum/Zeit-Informationen
     */
    static _removeDateInfo(title) {
        // Datum-Pattern: vom 01.01.2025, 2025, etc.
        const patterns = [
            /\s*vom\s+\d{1,2}\.\d{1,2}\.\d{4}\s*$/i,  // vom 01.01.2025
            /\s*\(\d{4}\)\s*$/,                        // (2025)
            /\s*-\s*\d{1,2}\.\d{1,2}\.\d{4}\s*$/,     // - 01.01.2025
            /\s*\d{1,2}\.\d{1,2}\.\d{4}\s*$/           // 01.01.2025
        ];

        for (const pattern of patterns) {
            title = title.replace(pattern, '');
        }

        return title;
    }

    /**
     * Entfernt Sender-Prefix
     */
    static _removeSenderPrefix(title, channel) {
        if (!channel) return title;

        // Entferne Sender am Anfang: "ARD: Titel"
        const pattern = new RegExp(`^${channel}\\s*[:-]\\s*`, 'i');
        return title.replace(pattern, '');
    }

    /**
     * Bereinigt Sonderzeichen
     */
    static _cleanSpecialChars(title) {
        // Behalte nur: Buchstaben, Zahlen, Leerzeichen, Bindestriche, Apostrophe
        title = title.replace(/[^\wäöüÄÖÜß\s\-']/g, ' ');
        
        // Mehrfache Leerzeichen entfernen
        title = title.replace(/\s+/g, ' ');

        return title;
    }

    /**
     * Prüft ob Titel zu generisch ist (nicht suchen)
     */
    static isGeneric(title) {
        const genericPatterns = [
            /^(tagesschau|heute|tagesthemen|morgenmagazin|mittagsmagazin)$/i,
            /^(nachrichten|wetter|börse)$/i,
            /^(live)$/i,  // Nur "live" alleine, nicht "Live at..."
            /^\d{1,2}\.\d{1,2}\.\d{4}$/,  // Nur Datum
            /^[A-Z]{2,5}$/                 // Nur Abkürzung (ARD, ZDF, etc.)
        ];

        return genericPatterns.some(pattern => pattern.test(title));
    }

    /**
     * Extrahiert Jahr aus Titel
     */
    static extractYear(title) {
        const yearMatch = title.match(/\((\d{4})\)/);
        if (yearMatch) {
            return yearMatch[1];
        }
        return null;
    }

    /**
     * Berechnet Match-Score zwischen zwei Titeln (0-1)
     */
    static calculateSimilarity(title1, title2) {
        if (!title1 || !title2) return 0;

        const t1 = title1.toLowerCase().trim();
        const t2 = title2.toLowerCase().trim();

        // Exakte Übereinstimmung
        if (t1 === t2) return 1.0;

        // Levenshtein-ähnlich (vereinfacht)
        const longer = t1.length > t2.length ? t1 : t2;
        const shorter = t1.length > t2.length ? t2 : t1;

        if (longer.length === 0) return 1.0;

        // Enthält-Check
        if (longer.includes(shorter)) {
            return shorter.length / longer.length;
        }

        // Wort-Übereinstimmung
        const words1 = t1.split(/\s+/);
        const words2 = t2.split(/\s+/);
        
        let matchingWords = 0;
        for (const word1 of words1) {
            if (words2.some(word2 => word2.includes(word1) || word1.includes(word2))) {
                matchingWords++;
            }
        }

        return matchingWords / Math.max(words1.length, words2.length);
    }
}

module.exports = TitleMatcher;
