'use strict';

// Kuratierte Liste der frei empfangbaren öffentlich-rechtlichen Live-Sender.
// Die Stream-URLs sind die offiziellen CDN-Adressen der Sender. Sie dienen als
// Fallback; beim Refresh werden sie mit iptv-org abgeglichen (nur offizielle
// Hosts, siehe OFFICIAL_HOSTS) und tote Streams aussortiert.

const LIVE_GROUPS = ['Hauptprogramme', 'Nachrichten & Spartenkanäle', 'Regionalprogramme', 'Kinder', 'Österreich'];

const LIVE_CHANNELS = [
    { id: 'daserste', iptv: 'DasErste.de', name: 'Das Erste', group: 'Hauptprogramme', color: '#00326e', streams: [
        { label: 'International', url: 'https://daserste-live.ard-mcdn.de/daserste/live/hls/int/master.m3u8' },
        { label: 'Deutschland', url: 'https://daserste-live.ard-mcdn.de/daserste/live/hls/de/master.m3u8' }
    ] },
    { id: 'zdf', iptv: 'ZDF.de', name: 'ZDF', group: 'Hauptprogramme', color: '#e8740c', streams: [
        { label: 'Live', url: 'https://zdf-hls-15.akamaized.net/hls/live/2016498/de/high/master.m3u8' }
    ] },
    { id: '3sat', iptv: '3sat.de', name: '3sat', group: 'Hauptprogramme', color: '#b4002d', streams: [
        { label: 'Live', url: 'https://zdf-hls-18.akamaized.net/hls/live/2016501/dach/high/master.m3u8' }
    ] },
    { id: 'arte', iptv: 'arte.de', name: 'ARTE', group: 'Hauptprogramme', color: '#e0531a', streams: [
        { label: 'Deutsch', url: 'https://artesimulcast.akamaized.net/hls/live/2030993/artelive_de/index.m3u8' }
    ] },
    { id: 'phoenix', iptv: 'phoenix.de', name: 'phoenix', group: 'Nachrichten & Spartenkanäle', color: '#1f5e8c', streams: [
        { label: 'Live', url: 'https://zdf-hls-19.akamaized.net/hls/live/2016502/de/high/master.m3u8' }
    ] },
    { id: 'tagesschau24', iptv: 'tagesschau24.de', name: 'tagesschau24', group: 'Nachrichten & Spartenkanäle', color: '#0a2a5e', streams: [
        { label: 'Live', url: 'https://tagesschau.akamaized.net/hls/live/2020115/tagesschau/tagesschau_1/master.m3u8' }
    ] },
    { id: 'zdfinfo', iptv: 'ZDFinfo.de', name: 'ZDFinfo', group: 'Nachrichten & Spartenkanäle', color: '#33608c', streams: [
        { label: 'Live', url: 'https://zdf-hls-17.akamaized.net/hls/live/2016500/de/high/master.m3u8' }
    ] },
    { id: 'zdfneo', iptv: 'ZDFneo.de', name: 'ZDFneo', group: 'Nachrichten & Spartenkanäle', color: '#3a7d44', streams: [
        { label: 'Live', url: 'https://zdf-hls-16.akamaized.net/hls/live/2016499/de/high/master.m3u8' }
    ] },
    { id: 'ardalpha', iptv: 'ARDalpha.de', name: 'ARD alpha', group: 'Nachrichten & Spartenkanäle', color: '#1b6f8a', streams: [
        { label: 'Live', url: 'https://mcdn.br.de/br/fs/ard_alpha/hls/de/master.m3u8' }
    ] },
    { id: 'dw', iptv: 'DW.de', name: 'DW', group: 'Nachrichten & Spartenkanäle', color: '#05141f', streams: [
        { label: 'English', url: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/master.m3u8' }
    ] },
    { id: 'kika', iptv: 'KiKA.de', name: 'KiKA', group: 'Kinder', color: '#6cb32c', streams: [
        { label: 'Live', url: 'https://kikahls.akamaized.net/hls/live/2022690/livetvkika_ww/master.m3u8' }
    ] },
    { id: 'br', iptv: 'BRFernsehen.de', name: 'BR Fernsehen', group: 'Regionalprogramme', color: '#0068b4', streams: [
        { label: 'Süd', url: 'https://mcdn.br.de/br/fs/bfs_sued/hls/de/master.m3u8' },
        { label: 'Nord', url: 'https://mcdn.br.de/br/fs/bfs_nord/hls/de/master.m3u8' }
    ] },
    { id: 'hr', iptv: 'hrfernsehen.de', name: 'hr-fernsehen', group: 'Regionalprogramme', color: '#005ca9', streams: [
        { label: 'Live', url: 'https://hrhls.akamaized.net/hls/live/2024525/hrhls/index.m3u8' }
    ] },
    { id: 'mdr', iptv: 'MDRFernsehen.de', name: 'MDR Fernsehen', group: 'Regionalprogramme', color: '#003d7d', streams: [
        { label: 'Sachsen', url: 'https://mdrtvsnhls.akamaized.net/hls/live/2016928/mdrtvsn/index.m3u8' },
        { label: 'Sachsen-Anhalt', url: 'https://mdrtvsahls.akamaized.net/hls/live/2016879/mdrtvsa/index.m3u8' },
        { label: 'Thüringen', url: 'https://mdrtvthhls.akamaized.net/hls/live/2016880/mdrtvth/index.m3u8' }
    ] },
    { id: 'ndr', iptv: 'NDRFernsehen.de', name: 'NDR Fernsehen', group: 'Regionalprogramme', color: '#0c4a95', streams: [
        { label: 'Hamburg', url: 'https://mcdn.ndr.de/ndr/hls/ndr_fs/ndr_hh/master.m3u8' },
        { label: 'Niedersachsen', url: 'https://mcdn.ndr.de/ndr/hls/ndr_fs/ndr_nds/master.m3u8' },
        { label: 'Schleswig-Holstein', url: 'https://mcdn.ndr.de/ndr/hls/ndr_fs/ndr_sh/master.m3u8' },
        { label: 'Mecklenburg-Vorpommern', url: 'https://mcdn.ndr.de/ndr/hls/ndr_fs/ndr_mv/master.m3u8' },
        { label: 'International', url: 'https://ndrint.akamaized.net/hls/live/2020766/ndr_int/index.m3u8' }
    ] },
    { id: 'radiobremen', iptv: 'RadioBremenFernsehen.de', name: 'Radio Bremen', group: 'Regionalprogramme', color: '#d20a11', streams: [
        { label: 'Live', url: 'https://rbhlslive.akamaized.net/hls/live/2020435/rbfs/master.m3u8' }
    ] },
    { id: 'rbb', iptv: 'rbbFernsehen.de', name: 'rbb Fernsehen', group: 'Regionalprogramme', color: '#c4002b', streams: [
        { label: 'Berlin', url: 'https://rbb-hls-berlin.akamaized.net/hls/live/2017824/rbb_berlin/index.m3u8' },
        { label: 'Brandenburg', url: 'https://rbb-hls-brandenburg.akamaized.net/hls/live/2017825/rbb_brandenburg/master.m3u8' }
    ] },
    { id: 'sr', iptv: 'SRFernsehen.de', name: 'SR Fernsehen', group: 'Regionalprogramme', color: '#00579c', streams: [
        { label: 'Live', url: 'https://srfs.akamaized.net/hls/live/689649/srfsgeo/index.m3u8' }
    ] },
    { id: 'swr', iptv: 'SWRFernsehenBadenWurttemberg.de', name: 'SWR Fernsehen', group: 'Regionalprogramme', color: '#2b2e83', alsoIptv: ['SWRFernsehenRheinlandPfalz.de', 'SWRFernsehenHD.de'], streams: [
        { label: 'Baden-Württemberg', url: 'https://swrbwd-hls.akamaized.net/hls/live/2018672/swrbwd/master.m3u8' },
        { label: 'Rheinland-Pfalz', url: 'https://swrrpd-hls.akamaized.net/hls/live/2018676/swrrpd/master.m3u8' }
    ] },
    { id: 'wdr', iptv: 'WDRFernsehen.de', name: 'WDR Fernsehen', group: 'Regionalprogramme', color: '#00345e', streams: [
        { label: 'Live', url: 'https://wdr-live.ard-mcdn.de/wdr/live/hls/de/master.m3u8' }
    ] },
    { id: 'orf1', iptv: 'ORF1.at', name: 'ORF 1', group: 'Österreich', color: '#c8102e', geo: 'AT', streams: [] },
    { id: 'orf2', iptv: 'ORF2.at', name: 'ORF 2', group: 'Österreich', color: '#c8102e', geo: 'AT', streams: [
        { label: 'Live', url: 'https://orf2-247.mdn.ors.at/orf/orf2/qxa-247/manifest.m3u8' }
    ] },
    { id: 'orf3', iptv: 'ORFIII.at', name: 'ORF III', group: 'Österreich', color: '#c8102e', geo: 'AT', streams: [
        { label: 'Live', url: 'https://orf3.mdn.ors.at/orf/orf3/qxa/manifest.m3u8' }
    ] }
];

// Nur Streams von offiziellen Sender-CDNs werden aus iptv-org übernommen.
const OFFICIAL_HOSTS = /(^|\.)(akamaized\.net|akamaihd\.net|ard-mcdn\.de|br\.de|ndr\.de|wdr\.de|swr\.de|hr\.de|mdr\.de|rbb-online\.de|sr\.de|radiobremen\.de|zdf\.de|arte\.tv|kika\.de|dw\.com|phoenix\.de|tagesschau\.de|mdn\.ors\.at|orf\.at)$/i;

function isOfficialUrl(url) {
    try {
        const { protocol, hostname } = new URL(url);
        return protocol === 'https:' && OFFICIAL_HOSTS.test(hostname);
    } catch {
        return false;
    }
}

module.exports = { LIVE_CHANNELS, LIVE_GROUPS, isOfficialUrl };
