'use strict';

// Manche "Sendungen" in MediathekView sind nur Rubriken ("Filme in der ARD",
// bei ARTE "Kultur und Pop - Kunst"). Sie taugen nicht als Serie im Katalog
// und werden nicht vor Titel gesetzt.

const GENERIC_SHOW = /^(?:filme?|spielfilme?|fernsehfilme?|kinofilme?|kino(?: - filme)?|cinéma - films|filme? (?:im|in der|in) .+|film im .+|beiträge|clips?|videos?|dokus?|dokumentation(?:en)?|reportagen?|sendungen?|serien?|highlights|ganze folgen|mediathek|komplette folgen|spielfilm-highlights|kurzfilme?(?: im .+)?|krimi und thriller|politik|sport-clip|news-clip)$/i;

function isGenericShow(channel, name) {
    if (!name) return true;
    const trimmed = String(name).trim();
    if (GENERIC_SHOW.test(trimmed)) return true;
    // ARTE: Rubriken der Form "Oberkategorie - Unterkategorie"
    if (String(channel || '').startsWith('ARTE') && /\S - \S/.test(trimmed)) return true;
    return false;
}

module.exports = { GENERIC_SHOW, isGenericShow };
