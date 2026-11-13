import { CONFIG } from './config.js';

const LS = { tok: 'sp_tokens', ver: 'sp_verifier', st: 'sp_state' };
const API = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private';

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rand = n => b64url(crypto.getRandomValues(new Uint8Array(n)));

function tokens() { try { return JSON.parse(localStorage.getItem(LS.tok)); } catch (e) { return null; } }
function save(j) {
  const old = tokens() || {};
  localStorage.setItem(LS.tok, JSON.stringify({
    access: j.access_token,
    refresh: j.refresh_token || old.refresh,
    exp: Date.now() + (j.expires_in - 60) * 1000
  }));
}
export const isConnected = () => !!tokens();
export function disconnect() { localStorage.removeItem(LS.tok); }

export async function login() {
  const verifier = rand(64);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = rand(16);
  localStorage.setItem(LS.ver, verifier);
  localStorage.setItem(LS.st, state);
  const p = new URLSearchParams({
    client_id: CONFIG.spotifyClientId, response_type: 'code', redirect_uri: CONFIG.spotifyRedirectUri,
    scope: SCOPES, state, code_challenge_method: 'S256', code_challenge: challenge
  });
  location.href = 'https://accounts.spotify.com/authorize?' + p;
}

// Wird beim Start aufgerufen: verarbeitet die Rückkehr von Spotify
export async function handleRedirect() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return null;
  const code = q.get('code'), err = q.get('error'), state = q.get('state');
  history.replaceState({}, '', location.pathname);
  if (err) return { error: 'Spotify-Login wurde abgebrochen.' };
  if (!state || state !== localStorage.getItem(LS.st) || !localStorage.getItem(LS.ver))
    return { error: 'Login nicht abgeschlossen. Bitte erneut verbinden.' };
  try {
    const r = await fetch(TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CONFIG.spotifyClientId, grant_type: 'authorization_code', code,
        redirect_uri: CONFIG.spotifyRedirectUri, code_verifier: localStorage.getItem(LS.ver)
      })
    });
    if (!r.ok) return { error: 'Spotify-Anmeldung fehlgeschlagen (' + r.status + ').' };
    save(await r.json());
    localStorage.removeItem(LS.ver); localStorage.removeItem(LS.st);
    return { ok: true };
  } catch (e) { return { error: 'Keine Verbindung zu Spotify.' }; }
}

let refreshing = null;
function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const t = tokens();
    if (!t || !t.refresh) { disconnect(); throw new Error('reauth'); }
    const r = await fetch(TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: CONFIG.spotifyClientId })
    });
    if (r.status === 400 || r.status === 401) { disconnect(); throw new Error('reauth'); }
    if (!r.ok) throw new Error('net');
    save(await r.json());
  })().finally(() => { refreshing = null; });
  return refreshing;
}
async function accessToken(force) {
  let t = tokens();
  if (!t) throw new Error('reauth');
  if (force || Date.now() > t.exp) { await refresh(); t = tokens(); }
  return t.access;
}

let backoffUntil = 0;
export async function api(path, method = 'GET', body) {
  if (Date.now() < backoffUntil) return { ok: false, status: 429, skipped: true };
  let tok = await accessToken();
  const go = () => fetch(API + path, {
    method,
    headers: Object.assign({ Authorization: 'Bearer ' + tok }, body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  let r = await go();
  if (r.status === 401) { tok = await accessToken(true); r = await go(); }
  if (r.status === 429) backoffUntil = Date.now() + (parseInt(r.headers.get('Retry-After') || '5', 10) || 5) * 1000;
  return r;
}
