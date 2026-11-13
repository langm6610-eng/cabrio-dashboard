import { CONFIG } from './config.js';

const $ = s => document.querySelector(s);
let map, marker, arrow, watchId = null;
let follow = true, ready = false, centered = false, last = null;

function circle(lng, lat, r) {
  const pts = [], d = r / 6371000;
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * 2 * Math.PI;
    const la = Math.asin(Math.sin(lat * Math.PI / 180) * Math.cos(d) + Math.cos(lat * Math.PI / 180) * Math.sin(d) * Math.cos(a));
    const lo = lng * Math.PI / 180 + Math.atan2(Math.sin(a) * Math.sin(d) * Math.cos(lat * Math.PI / 180), Math.cos(d) - Math.sin(lat * Math.PI / 180) * Math.sin(la));
    pts.push([lo * 180 / Math.PI, la * 180 / Math.PI]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] } };
}

function showMsg(text) { $('#gps-text').textContent = text; $('#gps-msg').hidden = false; }
function hideMsg() { $('#gps-msg').hidden = true; }

export function resizeMap() { if (map) map.resize(); }

export function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: `https://api.maptiler.com/maps/${CONFIG.mapStyle}/style.json?key=${CONFIG.maptilerKey}`,
    center: [10.45, 51.16], zoom: 5, attributionControl: { compact: true }
  });
  map.on('load', () => {
    ready = true;
    map.addSource('acc', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'acc-fill', type: 'fill', source: 'acc', paint: { 'fill-color': '#4a9dff', 'fill-opacity': 0.15 } });
    if (last) updateAcc();
  });
  map.on('error', e => { if (e && e.error && /40[13]/.test(String(e.error.status))) showMsg('Der Kartenschlüssel wurde abgelehnt. Prüfe den MapTiler-Key und die erlaubten Adressen.'); });

  const el = document.createElement('div');
  el.className = 'me';
  el.innerHTML = '<i class="cone"></i><i class="dot"></i>';
  arrow = el.querySelector('.cone');
  marker = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([10.45, 51.16]);

  map.on('dragstart', () => { follow = false; $('#recenter').hidden = false; });
  $('#zoom-in').onclick = () => map.zoomIn({ duration: 250 });
  $('#zoom-out').onclick = () => map.zoomOut({ duration: 250 });
  $('#recenter').onclick = () => { follow = true; $('#recenter').hidden = true; if (last) map.easeTo({ center: last, zoom: Math.max(map.getZoom(), 15), duration: 500 }); };
  $('#gps-retry').onclick = () => { hideMsg(); startGps(); };
  new ResizeObserver(() => map.resize()).observe($('#map'));
}

function updateAcc() {
  const s = map.getSource('acc');
  if (s && last) s.setData(circle(last[0], last[1], last.acc || 20));
}

function onPos(p) {
  const { latitude, longitude, accuracy, speed, heading } = p.coords;
  last = [longitude, latitude]; last.acc = accuracy;
  hideMsg();
  if (!marker._added) { marker.addTo(map); marker._added = true; }
  marker.setLngLat(last);
  const kmh = speed != null && !isNaN(speed) ? Math.round(speed * 3.6) : null;
  $('#speed').textContent = kmh == null ? '–' : (kmh < 3 ? 0 : kmh);
  $('#acc').textContent = `GPS ±${Math.round(accuracy)} m`;
  $('#acc').className = 'acc ' + (accuracy <= 20 ? 'good' : accuracy <= 60 ? 'mid' : 'bad');
  if (heading != null && !isNaN(heading) && (speed || 0) > 1.5) {
    arrow.style.transform = `rotate(${heading}deg)`; arrow.classList.add('on');
  }
  if (ready) updateAcc();
  if (!centered) { map.jumpTo({ center: last, zoom: CONFIG.startZoom }); centered = true; }
  else if (follow) map.easeTo({ center: last, duration: 900, easing: t => t });
}

function onErr(err) {
  if (err.code === 1) showMsg('Standortzugriff ist blockiert. iPhone: Einstellungen → Datenschutz & Sicherheit → Ortungsdienste → Safari-Websites (oder „Cabrio“) → „Beim Verwenden“.');
  else if (err.code === 2) showMsg('Position nicht verfügbar. Prüfe, ob Ortungsdienste aktiv sind und du Empfang hast.');
  else $('#acc').textContent = 'GPS sucht …';
}

export function startGps() {
  if (!('geolocation' in navigator)) { showMsg('Dieses Gerät unterstützt keine Standortbestimmung.'); return; }
  stopGps();
  watchId = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
}
export function stopGps() { if (watchId != null) navigator.geolocation.clearWatch(watchId); watchId = null; }
