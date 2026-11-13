import { initMap, startGps, stopGps, resizeMap } from './map.js?v=5';
import { init as initMusic } from './music.js?v=5';

const app = document.getElementById('app');
const VIEWS = ['dashboard', 'karte', 'musik'];

function setView(v) {
  if (!VIEWS.includes(v)) v = 'dashboard';
  app.dataset.view = v;
  document.querySelectorAll('.nbtn').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  try { localStorage.setItem('view', v); } catch (e) {}
  requestAnimationFrame(() => requestAnimationFrame(resizeMap));
  window.dispatchEvent(new CustomEvent('viewchange', { detail: v }));
}
document.querySelectorAll('.nbtn').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
let saved = 'dashboard';
try { saved = localStorage.getItem('view') || 'dashboard'; } catch (e) {}
setView(saved);

initMap();
startGps();
initMusic();

// Display wach halten (iOS 16.4+; endet beim App-Wechsel, wird automatisch erneuert)
let lock = null;
async function wake() {
  try { if ('wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen'); } catch (e) {}
}
wake();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { wake(); startGps(); resizeMap(); }
  else stopGps();
});
window.addEventListener('orientationchange', () => setTimeout(resizeMap, 300));

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// Versionsanzeige (hilft zu erkennen, ob alle Dateien aktuell sind)
const css = getComputedStyle(document.documentElement).getPropertyValue('--build').replace(/["' ]/g, '') || 'alt';
const ver = document.getElementById('ver');
if (ver) ver.textContent = 'Seite ' + (document.documentElement.dataset.v || 'alt') + ' · Stil ' + css + ' · Code 5';
