'use strict';

// Barrierefreie bzw. alternative Fassungen ("(Audiodeskription)",
// "(mit Gebärdensprache)", "(Originalversion)", …) werden nicht als eigene
// Kachel angezeigt, sondern als zusätzlicher Stream der Hauptfassung.

const LABELS = [
    [/^(?:mit\s+)?(?:audiodeskription|ad|hörfilm)$/i, 'Audiodeskription'],
    [/^(?:mit\s+|in\s+)?(?:gebärdensprache|dgs)$/i, 'Gebärdensprache'],
    [/^(?:originalversion|originalfassung|ov|omu|original\s+mit\s+untertitel)$/i, 'Originalversion'],
    [/^(?:mit\s+)?(?:deutschen?\s+)?(?:untertiteln?|ut)$/i, 'Untertitel'],
    [/^(?:in\s+)?(?:einfacher|klarer?)\s+sprache$/i, 'Klare Sprache'],
    [/^hörfassung$/i, 'Hörfassung']
];

// "Titel (Audiodeskription)", "Titel - Audiodeskription", "Titel | AD", "Titel [OV]"
const SUFFIX = /\s*(?:\(([^()]{2,40})\)|\[([^[\]]{2,40})\]|\s[-–|]\s+([^-–|()]{2,40}))\s*$/;

function detectVariant(title) {
    if (!title) return null;
    const match = SUFFIX.exec(title);
    if (!match) return null;
    const candidate = (match[1] || match[2] || match[3] || '').trim();
    for (const [pattern, label] of LABELS) {
        if (pattern.test(candidate)) {
            return { variant: label, baseTitle: title.slice(0, match.index).trim() };
        }
    }
    return null;
}

module.exports = { detectVariant };
