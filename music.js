import * as sp from './spotify.js';

const $ = s => document.querySelector(s);
const E = {
  title: $('#title'), artist: $('#artist'), cover: $('#cover'), cur: $('#t-cur'), dur: $('#t-dur'),
  fill: $('#bar-fill'), bar: $('.bar'), play: $('#b-play'), prev: $('#b-prev'), next: $('#b-next'),
  shuf: $('#b-shuffle'), rep: $('#b-repeat'), chip: $('#sp-status'), conn: $('#sp-connect'),
  row: $('.status-row'), device: $('#sp-device'), playlist: $('#sp-playlist'),
  sheet: $('#dev-sheet'), list: $('#dev-list')
};
const COVER_EMPTY = E.cover.innerHTML;
const MSG = {
  nodev: { chip: 'Kein aktives Gerät', kind: 'warn', hint: 'Öffne Spotify auf dem iPhone und starte einen Titel.' },
  forbidden: { chip: 'Kein Zugriff', kind: 'err', hint: 'Prüfe Premium und den Eintrag unter „User Management“ im Spotify-Dashboard.' },
  rate: { chip: 'Spotify bremst kurz', kind: 'warn', hint: 'Zu viele Anfragen. Es geht gleich weiter.' },
  net: { chip: 'Keine Verbindung', kind: 'warn', hint: 'Prüfe deinen Mobilfunkempfang.' },
  http: { chip: 'Spotify-Fehler', kind: 'err', hint: 'Spotify hat nicht wie erwartet geantwortet.' }
};

let S = null, err = '', loginMsg = '', coverUrl = '', gen = 0, pollT = null;
const plCache = {};

const fmt = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const progressNow = () => { if (!S) return 0; const p = S.progress + (S.playing ? Date.now() - S.ts : 0); return Math.min(p, S.dur || p); };

function tick() {
  if (!S || !S.dur) { E.fill.style.width = '0'; E.cur.textContent = '0:00'; E.dur.textContent = '0:00'; return; }
  const p = progressNow();
  E.fill.style.width = (p / S.dur * 100).toFixed(1) + '%';
  E.cur.textContent = fmt(p); E.dur.textContent = fmt(S.dur);
  if (S.playing && p >= S.dur && !S.ended) { S.ended = true; setTimeout(poll, 800); }
}

function render() {
  const on = sp.isConnected();
  [E.play, E.prev, E.next, E.shuf, E.rep].forEach(b => { b.disabled = !on; });
  E.conn.hidden = on;
  let chip = 'Spotify: nicht verbunden', kind = 'warn';
  if (!on) { if (loginMsg) { chip = loginMsg; kind = 'err'; } }
  else if (err) { chip = (MSG[err] || MSG.http).chip; kind = (MSG[err] || MSG.http).kind; }
  else { chip = S ? 'Verbunden · ' + (S.device && S.device.name || 'Gerät') : 'Verbunden'; kind = 'ok'; }
  E.chip.textContent = chip; E.chip.dataset.kind = kind;
  E.row.classList.toggle('ok', on && !err);

  const it = S && S.item;
  if (it) {
    E.title.textContent = it.name;
    E.artist.textContent = (it.artists && it.artists.map(a => a.name).join(', ')) || (it.show && it.show.name) || '';
  } else {
    E.title.textContent = 'Keine Wiedergabe';
    E.artist.textContent = !on ? 'Verbinde dein Spotify-Konto' : ((MSG[err] && MSG[err].hint) || 'Starte einen Titel in der Spotify-App.');
  }
  const url = (it && ((it.album && it.album.images && it.album.images[0] && it.album.images[0].url) || (it.images && it.images[0] && it.images[0].url))) || '';
  if (url !== coverUrl) {
    coverUrl = url;
    if (url) { const img = new Image(); img.alt = ''; img.src = url; E.cover.replaceChildren(img); }
    else E.cover.innerHTML = COVER_EMPTY;
  }
  E.play.querySelector('use').setAttribute('href', S && S.playing ? '#i-pause' : '#i-play');
  E.shuf.classList.toggle('on', !!(S && S.shuffle));
  E.rep.classList.toggle('on', !!(S && S.repeat && S.repeat !== 'off'));
  E.rep.dataset.mode = (S && S.repeat) || 'off';
  E.device.textContent = (S && S.device && S.device.name) || '–';
  tick();
}

async function ctxName() {
  const c = S && S.context, it = S && S.item;
  let n = '–';
  if (c && c.type === 'playlist') {
    const id = c.uri.split(':').pop();
    if (plCache[id] === undefined) {
      plCache[id] = 'Wiedergabeliste';
      try { const r = await sp.api('/playlists/' + id + '?fields=name'); if (r.ok) plCache[id] = (await r.json()).name || plCache[id]; } catch (e) {}
    }
    n = plCache[id];
  } else if (c && c.type === 'album') n = (it && it.album && it.album.name) || 'Album';
  else if (c && c.type === 'artist') n = 'Künstler-Mix';
  else if (c && c.type === 'collection') n = 'Lieblingssongs';
  E.playlist.textContent = n;
}

function apply(j) {
  S = {
    playing: !!j.is_playing, progress: j.progress_ms || 0, ts: Date.now(), item: j.item,
    dur: (j.item && j.item.duration_ms) || 0, shuffle: j.shuffle_state, repeat: j.repeat_state || 'off',
    device: j.device, context: j.context
  };
  render(); ctxName();
}

async function poll() {
  clearTimeout(pollT);
  const my = ++gen;
  if (!sp.isConnected()) { render(); return; }
  let next = 3000;
  try {
    const r = await sp.api('/me/player?additional_types=episode');
    if (my !== gen) return;
    if (r.skipped || r.status === 429) { err = 'rate'; next = 8000; }
    else if (r.status === 200) { err = ''; apply(await r.json()); next = S.playing ? 2500 : 5000; }
    else if (r.status === 204) { S = null; err = 'nodev'; next = 5000; }
    else if (r.status === 403) { err = 'forbidden'; next = 15000; }
    else { err = 'http'; next = 8000; }
  } catch (e) {
    if (my !== gen) return;
    if (e.message === 'reauth') { S = null; err = ''; loginMsg = 'Anmeldung abgelaufen. Bitte neu verbinden.'; render(); return; }
    err = 'net'; next = 6000;
  }
  render();
  pollT = setTimeout(poll, next);
}

async function cmd(path, method = 'PUT', body) {
  try {
    const r = await sp.api(path, method, body);
    if (r.ok) { setTimeout(poll, 500); return true; }
    err = r.status === 404 ? 'nodev' : r.status === 403 ? 'forbidden' : r.status === 429 ? 'rate' : 'http';
  } catch (e) { err = e.message === 'reauth' ? '' : 'net'; }
  render(); setTimeout(poll, 1500);
  return false;
}

async function openDevices() {
  E.list.textContent = 'Lade …'; E.sheet.hidden = false;
  try {
    const r = await sp.api('/me/player/devices');
    if (!r.ok) throw new Error('x');
    const { devices } = await r.json();
    E.list.replaceChildren();
    if (!devices.length) { E.list.textContent = 'Keine Geräte gefunden. Öffne Spotify auf dem iPhone.'; return; }
    devices.forEach(d => {
      const b = document.createElement('button');
      b.className = 'dev' + (d.is_active ? ' on' : '');
      const a = document.createElement('span'); a.textContent = d.name;
      const t = document.createElement('small'); t.textContent = d.type;
      b.append(a, t);
      b.onclick = async () => { E.sheet.hidden = true; await cmd('/me/player', 'PUT', { device_ids: [d.id], play: !!(S && S.playing) }); };
      E.list.append(b);
    });
  } catch (e) { E.list.textContent = 'Geräte konnten nicht geladen werden.'; }
}

export async function init() {
  const res = await sp.handleRedirect();
  if (res && res.error) loginMsg = res.error;
  E.conn.onclick = () => sp.login();
  E.play.onclick = () => {
    const want = S ? !S.playing : true;
    if (S) { S.progress = progressNow(); S.ts = Date.now(); S.playing = want; render(); }
    cmd(want ? '/me/player/play' : '/me/player/pause');
  };
  E.next.onclick = () => cmd('/me/player/next', 'POST');
  E.prev.onclick = () => cmd('/me/player/previous', 'POST');
  E.shuf.onclick = () => { if (!S) return; S.shuffle = !S.shuffle; render(); cmd('/me/player/shuffle?state=' + S.shuffle); };
  E.rep.onclick = () => {
    if (!S) return;
    S.repeat = { off: 'context', context: 'track', track: 'off' }[S.repeat] || 'off';
    render(); cmd('/me/player/repeat?state=' + S.repeat);
  };
  E.bar.addEventListener('pointerdown', e => {
    if (!S || !S.dur) return;
    const r = E.bar.getBoundingClientRect();
    const ms = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * S.dur);
    S.progress = ms; S.ts = Date.now(); tick();
    cmd('/me/player/seek?position_ms=' + ms);
  });
  $('#sp-device-row').onclick = openDevices;
  $('#dev-close').onclick = () => { E.sheet.hidden = true; };
  $('#sp-disconnect').onclick = () => { sp.disconnect(); S = null; err = ''; loginMsg = ''; render(); };
  setInterval(tick, 500);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') poll(); else clearTimeout(pollT);
  });
  render(); poll();
}
