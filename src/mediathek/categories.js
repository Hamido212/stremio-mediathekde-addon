'use strict';

// Kategorisierung von Mediathek-Einträgen.
//
// Die Regeln werden in der angegebenen Reihenfolge geprüft – die erste
// passende Kategorie gewinnt. Geprüft werden Sender, Sendungsname ("show"),
// Titel und Dauer. Die Regeln sind bewusst konservativ: lieber "Sonstiges"
// als eine falsche Einordnung.

const re = (source) => new RegExp(source, 'i');

const CATEGORIES = [
    {
        id: 'Kinder',
        channels: ['KiKA', 'ZDFtivi'],
        show: re('sendung mit der maus|löwenzahn|sesamstraße|\\blogo!|checker |sandmännchen|kikaninchen|schloss einstein|pur\\+|wissen macht ah|pfefferkörner|tigerenten|\\bkinder|\\bkika\\b|kinderfilm|märchen')
    },
    {
        id: 'Sport',
        show: re('sportschau|sportstudio|\\bsport|bundesliga|fußball|olympi|wintersport|biathlon|ski alpin|formel 1|handball|tennis|radsport|tour de france|leichtathletik|champions league|boxen')
    },
    {
        id: 'Unterhaltung',
        show: re('heute-show|extra 3|die anstalt|magazin royale|kabarett|comedy|satire|\\bquiz|nuhr|ladies night|fastnacht|karneval|mainz bleibt mainz|verstehen sie spaß|wer weiß denn sowas|gefragt – gejagt|gefragt - gejagt|das große|die großen|schlager|fernsehgarten|late night|talkshow|nachtcafé|riverboat|kölner treff|3nach9|tietjen und|inas nacht|hirschhausen|schlachthof|\\bshow\\b'),
        title: re('kabarett|comedy|satire')
    },
    {
        id: 'Nachrichten',
        channels: ['tagesschau24'],
        show: re('tagesschau|tagesthemen|heute journal|^heute\\b|^heute \\d|heute in |nachrichten|\\baktuell|journal\\b|morgenmagazin|mittagsmagazin|brennpunkt|bericht aus|berlin direkt|report mainz|report münchen|panorama|monitor|frontal|kontraste|\\bfakt\\b|plusminus|presseclub|maischberger|hart aber fair|markus lanz|maybrit illner|caren miosga|\\bzib\\b|10 vor 10|phoenix vor ort|phoenix parlament|phoenix runde|phoenix plus|regionalmagazin|landesschau|abendschau|hessenschau|nordmagazin|hallo niedersachsen|sachsenspiegel|\\bbr24|ndr info|sr info|buten un binnen|politik|zur sache|lokalzeit|frankenschau|schleswig-holstein magazin|hamburg journal|der tag in|\\bheute\\b|wetter|brisant|zdfheute|volle kanne|\\bum6\\b|konkret|frau tv|beiträge|tagesgespräch|international|weltspiegel|auslandsjournal|börse|wirtschaft')
    },
    {
        id: 'Krimi',
        show: re('tatort|polizeiruf|\\bsoko\\b|der alte|ein fall für zwei|die chefin|kommissar|wilsberg|rosenheim-cops|notruf hafenkante|großstadtrevier|morden im norden|der staatsanwalt|nord bei nordwest|bozen-krimi|krimi|thriller|\\bmord|inspector|detektiv|ermittl|crime|der bulle|hubert (und|ohne) staller|die toten vom|steirer|kroatien-krimi|kreuzfahrt|der zürich-krimi|in the line of'),
        title: re('^tatort|^polizeiruf|krimi\\b|thriller')
    },
    {
        id: 'Film',
        minDuration: 60 * 60,
        show: re('^film|filme|spielfilm|fernsehfilm|kinofilm|\\bkino\\b|cinema|cinéma|filmmittwoch|herzkino|der fernsehfilm|debüt im ersten|kleines fernsehspiel|komödie|drama|liebesfilm|familienfilm|heimatfilm|abenteuerfilm|film im|im ersten$|samstagskrimi|freitagsfilm|montagskino|sommerkino|shooting stars|filmdebüt')
    },
    {
        id: 'Serien',
        show: re('sturm der liebe|in aller freundschaft|rote rosen|um himmels willen|dahoam is dahoam|lindenstraße|rentnercops|bergretter|bergdoktor|watzmann|praxis mit meerblick|lena lorenz|traumschiff|rosamunde pilcher|inga lindström|katie fforde|marienhof|familie dr\\. kleist|großstadtrevier|hotel heidelberg|der landarzt|die kanzlei|serie|\\bstaffel')
    },
    {
        id: 'Doku',
        channels: ['ZDFinfo'],
        show: re('doku|dokumentation|reportage|dokumentarfilm|terra x|37 grad|die story|exclusiv im ersten|\\bre:|\\bgeo\\b|planet e|expedition|universum|360°|history|zeitreise|abenteuer|reisen|\\breise|länder|menschen hautnah|die spur|zdfzeit|zdf zeit|die reportage|team wallraff|story|y-kollektiv|strg_f|vollbild|wild|tiere|natur|unter unserem himmel|die nordstory|zoogeschichten|giraffe|erdmännchen|elefant|entdeckung der welt|zu tisch|nordseereport|expeditionen'),
        title: re('\\bdoku\\b|dokumentation|reportage')
    },
    {
        id: 'Wissen',
        channels: ['ARD alpha'],
        show: re('quarks|\\bnano\\b|wissen|alpha|lesch|w wie wissen|odysso|xenius|scobel|einfach genial|visite|\\bmarkt\\b|servicezeit|gut zu wissen|hitec|wissenschaft|gesundheit|kosmos|planet schule|telekolleg|ratgeber|verbraucher|abenteuer forschung|terra|mai thi|maithink')
    },
    {
        id: 'Kultur',
        show: re('kultur|ttt|titel, thesen|titel thesen|aspekte|concert|konzert|musik|oper|theater|literatur|\\bkunst|druckfrisch|philosoph|klassik|jazz|festival|lesenswert|buch')
    }
];

const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
const FALLBACK_CATEGORY = 'Sonstiges';

/**
 * Ordnet einem Eintrag eine Kategorie zu.
 * @param {{channel: string, show?: string, title?: string, duration?: number}} item
 * @returns {string}
 */
function classify(item) {
    const show = item.show || '';
    const title = item.title || '';
    const duration = Number(item.duration) || 0;

    for (const category of CATEGORIES) {
        if (category.minDuration && duration < category.minDuration) continue;
        if (category.channels && category.channels.includes(item.channel)) return category.id;
        if (category.show && category.show.test(show)) return category.id;
        if (category.title && category.title.test(title)) return category.id;
    }
    return FALLBACK_CATEGORY;
}

module.exports = { classify, CATEGORY_IDS, FALLBACK_CATEGORY };
