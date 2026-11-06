'use strict';

// Landing- und Konfigurationsseite (eine Seite, serverseitig gerendert,
// ohne externe Abhängigkeiten).

const pkg = require('../../package.json');
const { CHANNELS } = require('../mediathek/channels');
const { CATALOGS } = require('../stremio/catalogs');
const { defaults, MAX_MIN_DURATION } = require('../stremio/user-config');
const { escapeXml: esc } = require('./art');

const CHANNEL_GROUPS = ['ARD', 'ZDF', 'Weitere', 'Kinder', 'Österreich & Schweiz', 'ARTE fremdsprachig'];

function renderConfigurePage({ userConfig, status, donationUrl, repoUrl }) {
    const def = defaults();
    const channelGroups = CHANNEL_GROUPS.map((group) => {
        const items = CHANNELS.filter((c) => c.group === group).map((c) => `
            <label class="chip">
                <input type="checkbox" name="channel" value="${esc(c.name)}" ${userConfig.channels.includes(c.name) ? 'checked' : ''}>
                <span style="--c:${esc(c.color)}">${esc(c.name)}</span>
            </label>`).join('');
        return `<div class="group"><h4>${esc(group)}</h4><div class="chips">${items}</div></div>`;
    }).join('');

    const catalogItems = (filter) => CATALOGS.filter(filter).map((c) => `
        <label class="row">
            <input type="checkbox" name="catalog" value="${esc(c.key)}" ${userConfig.catalogs.includes(c.key) ? 'checked' : ''}>
            <span>${esc(c.name.replace(/^Mediathek · /, ''))}</span>
            <small>${c.type === 'series' ? 'Serien' : c.type === 'tv' ? 'TV' : 'Filme'}${c.kind === 'search' ? ' · nur Suche' : ''}</small>
        </label>`).join('');

    const statusRows = [
        ['Mediathek', status.mediathek ? `${status.mediathek.items.toLocaleString('de-DE')} Videos · ${status.mediathek.shows.toLocaleString('de-DE')} Sendungen` : (status.updating ? 'Erster Import läuft …' : 'Noch keine Daten')],
        ['Stand', status.mediathek?.builtAt ? new Date(status.mediathek.builtAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : '–'],
        ['Live-TV', `${status.live.channels} Sender`],
        ['Radio', `${status.radio.stations.toLocaleString('de-DE')} Sender`]
    ].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');

    return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mediathek DE – Stremio Add-on</title>
<link rel="icon" href="/logo.png">
<style>
:root { --bg:#0f1020; --card:#181a2e; --line:#2a2d48; --text:#e9eaf5; --muted:#9a9cb8; --accent:#7b5bf5; --accent2:#e8740c; }
* { box-sizing:border-box; }
body { margin:0; font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; background:radial-gradient(1200px 600px at 80% -10%, #2b1f5c 0%, transparent 60%), var(--bg); color:var(--text); line-height:1.5; }
main { max-width:920px; margin:0 auto; padding:32px 20px 64px; }
header { display:flex; gap:18px; align-items:center; margin-bottom:28px; }
header img { width:64px; height:64px; border-radius:16px; }
h1 { margin:0; font-size:28px; } h1 small { font-size:14px; color:var(--muted); font-weight:400; margin-left:8px; }
header p { margin:4px 0 0; color:var(--muted); }
section { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:22px; margin-bottom:18px; }
h2 { margin:0 0 14px; font-size:18px; } h4 { margin:14px 0 8px; font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
dl { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin:0; }
dt { color:var(--muted); font-size:13px; } dd { margin:0; font-weight:600; }
.chips { display:flex; flex-wrap:wrap; gap:8px; }
.chip input { display:none; }
.chip span { display:inline-block; padding:6px 12px; border-radius:999px; border:1px solid var(--line); cursor:pointer; user-select:none; transition:.15s; }
.chip span::before { content:''; display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--c); margin-right:7px; vertical-align:1px; }
.chip input:checked + span { background:#2b2552; border-color:var(--accent); }
.rows { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:6px 18px; }
.row { display:flex; gap:10px; align-items:center; padding:6px 0; cursor:pointer; }
.row small { color:var(--muted); margin-left:auto; }
input[type=checkbox] { accent-color:var(--accent); width:17px; height:17px; }
.tools { display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }
button, .btn { font:inherit; border:1px solid var(--line); background:#22243c; color:var(--text); padding:8px 14px; border-radius:10px; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; gap:8px; }
button:hover, .btn:hover { border-color:var(--accent); }
.primary { background:linear-gradient(135deg,var(--accent),#5b3fd0); border:none; font-weight:600; padding:12px 18px; }
.secondary { background:linear-gradient(135deg,var(--accent2),#b8560a); border:none; font-weight:600; padding:12px 18px; }
.range { display:flex; align-items:center; gap:14px; } .range input { flex:1; accent-color:var(--accent); } .range output { min-width:70px; font-weight:600; }
.install { display:flex; flex-direction:column; gap:12px; }
.install .buttons { display:flex; flex-wrap:wrap; gap:10px; }
.url { display:flex; gap:8px; } .url input { flex:1; background:#0f1020; color:var(--text); border:1px solid var(--line); border-radius:10px; padding:10px; font-family:ui-monospace,monospace; font-size:13px; }
.donate { border-color:#5b3fd0; background:linear-gradient(135deg,#1d1a3a,#181a2e); }
footer { color:var(--muted); font-size:13px; text-align:center; margin-top:28px; } footer a { color:var(--muted); }
.hint { color:var(--muted); font-size:13px; margin:8px 0 0; }
</style>
</head>
<body>
<main>
<header>
  <img src="/logo.png" alt="">
  <div>
    <h1>Mediathek DE <small>v${esc(pkg.version)}</small></h1>
    <p>ARD, ZDF, ARTE, 3sat &amp; Co. – Mediatheken, Live-TV und Radio direkt in Stremio. Kostenlos und aus offiziellen Quellen.</p>
  </div>
</header>

<section><h2>Status</h2><dl>${statusRows}</dl></section>

<form id="form">
<section>
  <h2>Kataloge</h2>
  <h4>Mediathek</h4>
  <div class="rows">${catalogItems((c) => c.key !== 'live' && !c.key.startsWith('radio'))}</div>
  <h4>Live &amp; Radio</h4>
  <div class="rows">${catalogItems((c) => c.key === 'live' || c.key.startsWith('radio'))}</div>
</section>

<section>
  <h2>Sender</h2>
  ${channelGroups}
  <div class="tools">
    <button type="button" data-select="all">Alle</button>
    <button type="button" data-select="none">Keine</button>
    <button type="button" data-select="default">Standard</button>
  </div>
  <p class="hint">ORF- und SRF-Inhalte sind teilweise nur in Österreich bzw. der Schweiz abrufbar.</p>
</section>

<section>
  <h2>Mindestlänge</h2>
  <div class="range">
    <input type="range" id="minDuration" min="0" max="${MAX_MIN_DURATION}" step="5" value="${Number(userConfig.minDuration)}">
    <output id="minDurationOut"></output>
  </div>
  <p class="hint">Kurze Clips ausblenden. Gilt für alle Mediathek-Kataloge (der Katalog „Neu" zeigt immer erst ab 15 Minuten).</p>
</section>
</form>

<section class="install">
  <h2>Installieren</h2>
  <div class="buttons">
    <a class="btn primary" id="installApp" href="#">▶ In Stremio installieren</a>
    <a class="btn secondary" id="installWeb" href="#" target="_blank" rel="noopener">🌐 In Stremio Web installieren</a>
  </div>
  <div class="url"><input id="manifestUrl" readonly><button type="button" id="copy">Kopieren</button></div>
  <p class="hint">Änderungen an der Auswahl? Einfach erneut installieren – die bisherige Installation wird ersetzt.</p>
</section>

${donationUrl ? `<section class="donate"><h2>❤️ Unterstützen</h2><p>Das Add-on ist kostenlos und werbefrei. Wenn es dir gefällt, freue ich mich über einen Kaffee – damit bezahle ich Server und Weiterentwicklung.</p><a class="btn primary" href="${esc(donationUrl)}" target="_blank" rel="noopener">Projekt unterstützen</a></section>` : ''}

<footer>
  Daten: <a href="https://mediathekview.de" target="_blank" rel="noopener">MediathekView</a> ·
  <a href="https://github.com/iptv-org/iptv" target="_blank" rel="noopener">iptv-org</a> ·
  <a href="https://www.radio-browser.info" target="_blank" rel="noopener">radio-browser.info</a><br>
  Dieses Projekt steht in keiner Verbindung zu den Rundfunkanstalten. Alle Inhalte werden direkt von den Servern der Sender abgespielt.<br>
  <a href="${esc(repoUrl)}" target="_blank" rel="noopener">Quellcode auf GitHub</a> · <a href="/health">Status (JSON)</a>
</footer>
</main>
<script>
const DEFAULTS = ${JSON.stringify(def)};
const form = document.getElementById('form');
const minDuration = document.getElementById('minDuration');
const out = document.getElementById('minDurationOut');

function values(name) { return [...form.querySelectorAll('input[name="' + name + '"]:checked')].map((i) => i.value); }
function sameSet(a, b) { return a.length === b.length && a.every((x) => b.includes(x)); }
function b64url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
}
function encodeConfig() {
  const cfg = {};
  const channels = values('channel');
  const catalogs = values('catalog');
  const d = Number(minDuration.value);
  if (channels.length && !sameSet(channels, DEFAULTS.channels)) cfg.c = channels;
  if (catalogs.length && !sameSet(catalogs, DEFAULTS.catalogs)) cfg.k = catalogs;
  if (d !== DEFAULTS.minDuration) cfg.d = d;
  return Object.keys(cfg).length ? b64url(JSON.stringify(cfg)) : '';
}
function update() {
  out.textContent = minDuration.value === '0' ? 'alles' : minDuration.value + ' Min.';
  const cfg = encodeConfig();
  const manifest = location.origin + (cfg ? '/' + cfg : '') + '/manifest.json';
  document.getElementById('manifestUrl').value = manifest;
  document.getElementById('installApp').href = manifest.replace(/^https?:/, 'stremio:');
  document.getElementById('installWeb').href = 'https://web.stremio.com/#/addons?addon=' + encodeURIComponent(manifest);
}
form.addEventListener('change', update);
minDuration.addEventListener('input', update);
document.querySelectorAll('[data-select]').forEach((btn) => btn.addEventListener('click', () => {
  const mode = btn.dataset.select;
  form.querySelectorAll('input[name="channel"]').forEach((i) => { i.checked = mode === 'all' || (mode === 'default' && DEFAULTS.channels.includes(i.value)); });
  update();
}));
document.getElementById('copy').addEventListener('click', async () => {
  const input = document.getElementById('manifestUrl');
  try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
  document.getElementById('copy').textContent = 'Kopiert ✓';
  setTimeout(() => { document.getElementById('copy').textContent = 'Kopieren'; }, 1500);
});
update();
</script>
</body>
</html>`;
}

module.exports = { renderConfigurePage };
