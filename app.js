"use strict";
/* ================================================================
   Vitamin Me — personal Strava client (static PWA, no backend)
   Data flow: Huawei watch → Huawei Health → Strava → Strava API → this page
   Storage:   localStorage = config, tokens, activity summaries, effort cache
              IndexedDB    = per-activity detail + HR streams
   Scoring lives in scoring.js (pure functions).
   ================================================================ */

const K = { cfg:'vm.cfg', tok:'vm.tok', acts:'vm.acts', meta:'vm.meta', fx:'vm.fx' };
const API = 'https://www.strava.com/api/v3';
const FIRST_SYNC_DAYS = 365;
const REQUEST_BUDGET = 40;            // detail/stream requests per sync (Strava allows 100 reads / 15 min)
try { localStorage.removeItem('vitaminme.v1'); } catch(e){}

/* ---------------- storage ---------------- */
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){ toast('Storage is full: ' + e.message, true); } },
  del(k){ try { localStorage.removeItem(k); } catch(e){} }
};
const idb = (() => {
  let p;
  const db = () => p ??= new Promise((res, rej) => {
    const r = indexedDB.open('vitamin-me', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const run = (mode, fn) => db().then(d => new Promise((res, rej) => {
    const t = d.transaction('kv', mode), req = fn(t.objectStore('kv'));
    t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error);
  }));
  return {
    get: k => run('readonly', s => s.get(k)).catch(() => undefined),
    set: (k, v) => run('readwrite', s => s.put(v, k)).catch(() => {}),
    clear: () => run('readwrite', s => s.clear()).catch(() => {})
  };
})();
const cfg = () => store.get(K.cfg, {});
const setCfg = patch => store.set(K.cfg, { ...cfg(), ...patch });
const params = () => ({ ...Scoring.DEFAULTS, ...(cfg().params || {}) });

/* ---------------- theme ---------------- */
const ACCENTS = [
  ['Vitamin orange', '#ff8a1f'], ['Teal', '#20b2a6'], ['Berry', '#e0457b'],
  ['Sky', '#3d8bfd'], ['Violet', '#8b5cf6'], ['Gold', '#e2b13c']
];
function hexRgb(h){ const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function luminance(h){ return hexRgb(h).map(c => { c /= 255; return c <= .03928 ? c/12.92 : ((c+.055)/1.055) ** 2.4; })
                         .reduce((s, c, i) => s + c * [.2126,.7152,.0722][i], 0); }
function hueDist(a, b){
  const hue = h => { const [r,g,bb] = hexRgb(h).map(x => x/255), mx = Math.max(r,g,bb), mn = Math.min(r,g,bb), d = mx - mn;
    if (!d) return 0; const x = mx === r ? ((g-bb)/d) % 6 : mx === g ? (bb-r)/d + 2 : (r-g)/d + 4; return (x*60 + 360) % 360; };
  const d = Math.abs(hue(a) - hue(b)); return Math.min(d, 360 - d);
}
function applyTheme(){
  const t = cfg().theme || {}, mode = t.mode || 'system', accent = t.accent || '#ff8a1f';
  const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-ink', luminance(accent) > .35 ? '#16110a' : '#ffffff');
  root.style.setProperty('--accent2', hueDist(accent, '#20b2a6') < 40 ? '#ff8a1f' : '#20b2a6');   // second capsule colour
  document.querySelector('meta[name=theme-color]').content = dark ? '#10151c' : '#f2f5f8';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { applyTheme(); if (location.hash.startsWith('#/a/')) route(); });
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

/* ---------------- Strava auth ---------------- */
const redirectUri = () => location.origin + location.pathname;

async function tokenRequest(extra){
  const c = cfg();
  if (!c.clientId || !c.clientSecret) throw new Error('Add your Strava Client ID and Secret in Settings first.');
  let r;
  try {
    r = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST', body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...extra })
    });
  } catch(e){ throw new Error('Could not reach Strava. Check your connection.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Strava rejected the request: ' + (j.message || r.status) + '. Check Client ID/Secret.');
  const prev = store.get(K.tok, {});
  const tok = { access: j.access_token, refresh: j.refresh_token, expires: j.expires_at,
                athlete: j.athlete ? { id: j.athlete.id, name: `${j.athlete.firstname} ${j.athlete.lastname}`.trim() } : prev.athlete };
  store.set(K.tok, tok);
  return tok;
}
async function accessToken(){
  let t = store.get(K.tok, null);
  if (!t) throw new Error('Connect Strava in Settings first.');
  if (t.expires * 1000 < Date.now() + 120000) t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh });
  return t.access;
}
class RateLimit extends Error {}
async function api(path){
  const token = await accessToken();
  let r;
  try { r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + token } }); }
  catch(e){ throw new Error('Could not reach Strava. Check your connection.'); }
  if (r.status === 401) throw new Error('Strava access was revoked or expired. Reconnect in Settings.');
  if (r.status === 429) throw new RateLimit('Strava rate limit reached. The rest will load on a later sync.');
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Strava returned error ' + r.status + '.');
  return r.json();
}
function connectStrava(){
  const c = cfg();
  if (!c.clientId || !c.clientSecret){ toast('Save your Client ID and Secret first.', true); return; }
  location.href = 'https://www.strava.com/oauth/authorize?' + new URLSearchParams({
    client_id: c.clientId, response_type: 'code', redirect_uri: redirectUri(),
    approval_prompt: 'auto', scope: 'read,activity:read_all'
  });
}
async function exchangeCode(code){
  await tokenRequest({ code: code.trim(), grant_type: 'authorization_code' });
  toast('Connected to Strava. Syncing…');
  location.hash = '#/';
  await sync();
}
let pendingCode = null;
(function handleReturn(){
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return;
  history.replaceState(null, '', location.pathname + location.hash);
  if (q.get('error')){ setTimeout(() => toast('Strava access was not granted.', true), 50); return; }
  if (!/activity:read/.test(q.get('scope') || '')){
    setTimeout(() => toast('Tick "View data about your activities" on the Strava screen, then connect again.', true), 50);
    return;
  }
  // Credentials present → finish here. Otherwise this is Safari (separate storage from the home-screen app).
  if (cfg().clientSecret) setTimeout(() => exchangeCode(q.get('code')).catch(e => toast(e.message, true)), 0);
  else pendingCode = q.get('code');
})();

/* ---------------- data: activities, details, HR ---------------- */
function slim(a, prev = {}){
  return {
    id: a.id, name: a.name, type: a.sport_type || a.type, start: a.start_date,
    dist: a.distance || 0, moving: a.moving_time || 0, elapsed: a.elapsed_time || 0,
    elev: a.total_elevation_gain || 0, avgHr: a.average_heartrate ?? null, maxHr: a.max_heartrate ?? null,
    hasHr: !!a.has_heartrate, poly: a.map?.summary_polyline || '',
    kcal: prev.kcal,  // undefined = not fetched yet, null = Strava has none
    be: prev.be, beFetched: prev.beFetched   // best efforts (runs), from the detail endpoint
  };
}
const DETAIL_V = 2;   // v2 adds best efforts
async function detail(id){
  let d = await idb.get('d' + id);
  const isRun = RUNS.has(store.get(K.acts, {})[id]?.type);
  if (!d || (isRun && d.v !== DETAIL_V)){
    const a = await api(`/activities/${id}`);
    const keep = new Set(Records.EFFORTS.map(e => e[0]));
    d = { v: DETAIL_V, calories: a?.calories ?? null, splits: a?.splits_metric || [], poly: a?.map?.polyline || a?.map?.summary_polyline || '',
          device: a?.device_name || '', description: a?.description || '',
          be: Object.fromEntries((a?.best_efforts || []).filter(e => keep.has(e.name)).map(e => [e.name, e.elapsed_time])) };
    await idb.set('d' + id, d);
    const acts = store.get(K.acts, {});
    if (acts[id]){ acts[id].kcal = d.calories; acts[id].be = d.be; acts[id].beFetched = true; store.set(K.acts, acts); invalidate(); }
  }
  return d;
}
async function hrStream(id){
  let s = await idb.get('h' + id);
  if (!s){
    const old = await idb.get('s' + id);           // cache format from the first Strava version
    if (old) s = { t: old.time?.data || [], hr: old.heartrate?.data || [] };
    else {
      const r = await api(`/activities/${id}/streams?keys=time,heartrate&key_by_type=true`);
      s = { t: r?.time?.data || [], hr: r?.heartrate?.data || [] };
    }
    await idb.set('h' + id, s);
  }
  return s;
}

/* ---------------- effort cache ----------------
   Effort blocks depend only on the HR stream + zone params, so they are cached per activity
   and recomputed from IndexedDB when those params change. Everything else in the ledger
   is cheap and computed on every render. */
const FX_KEYS = ['age','restHr','maxHr','modPct','vigPct','vigMult','dipSec'];
const fxSig = () => { const p = params(); return FX_KEYS.map(k => p[k]).join('|'); };
function fxGet(){ const f = store.get(K.fx, null); return f && f.sig === fxSig() ? f.data : null; }
function fxSet(data){ store.set(K.fx, { sig: fxSig(), data }); }
function computeFx(s){ const r = Scoring.effortBlocks(s.t, s.hr, params()); return { blocks: r.blocks.map(b => +b.toFixed(3)), zoneMin: +r.zoneMin.toFixed(2), vigMin: +r.vigMin.toFixed(2) }; }
async function rescoreAll(){
  const acts = store.get(K.acts, {}), data = {};
  for (const id of Object.keys(acts)){
    const s = await idb.get('h' + id);
    if (s) data[id] = computeFx(s);
  }
  fxSet(data);
}
let ledgerCache = null;
function getLedger(){
  if (ledgerCache) return ledgerCache;
  const acts = Object.values(store.get(K.acts, {}));
  ledgerCache = Scoring.ledger(acts, fxGet() || {}, cfg().params || {});
  ledgerCache.rec = Records.compute(acts, ledgerCache, cfg().params || {});
  Records.mergeIntoLedger(ledgerCache, ledgerCache.rec);
  return ledgerCache;
}
const invalidate = () => { ledgerCache = null; };

/* ---------------- sync ---------------- */
let syncing = false;
async function sync(){
  if (syncing) return;
  if (!store.get(K.tok, null)){ toast('Connect Strava in Settings first.', true); location.hash = '#/settings'; return; }
  syncing = true; setSyncBtn(true);
  let msg = null, err = false;
  try {
    const acts = store.get(K.acts, {}), meta = store.get(K.meta, {});
    const after = meta.latest ? meta.latest - 3600 : Math.floor(Date.now()/1000) - FIRST_SYNC_DAYS*86400;
    let newest = meta.latest || 0, added = 0;
    for (let page = 1; page <= 10; page++){
      const list = await api(`/athlete/activities?after=${after}&per_page=100&page=${page}`) || [];
      for (const a of list){
        if (!acts[a.id]) added++;
        acts[a.id] = slim(a, acts[a.id]);
        newest = Math.max(newest, Math.floor(Date.parse(a.start_date)/1000));
      }
      if (list.length < 100) break;
    }
    store.set(K.acts, acts);
    store.set(K.meta, { ...meta, latest: newest, lastSync: Date.now() });

    // Fill in details (calories, splits) and HR for scoring, newest first, within the request budget.
    if (!fxGet()) await rescoreAll();
    const fx = fxGet() || {};
    let budget = REQUEST_BUDGET;
    const todo = Object.values(acts).sort((x,y) => y.start.localeCompare(x.start));
    try {
      for (const a of todo){
        if (budget <= 0) break;
        if (!fx[a.id]){
          if (!(await idb.get('h' + a.id)) && !(await idb.get('s' + a.id))){
            if (!(a.hasHr ?? a.avgHr != null)){ await idb.set('h' + a.id, { t: [], hr: [] }); }   // older records lack hasHr
            else budget--;
          }
          fx[a.id] = computeFx(await hrStream(a.id));
        }
        if ((a.kcal === undefined || (RUNS.has(a.type) && !a.beFetched)) && budget > 0){ budget--; await detail(a.id); }
      }
    } catch(e){ if (!(e instanceof RateLimit)) throw e; msg = e.message; }
    fxSet(fx); invalidate();

    const pending = Object.values(store.get(K.acts, {})).filter(a => !fx[a.id]).length;
    msg ??= (added ? `Synced ${added} new workout${added > 1 ? 's' : ''}.` : 'Up to date.') +
            (pending ? ` ${pending} older workout${pending > 1 ? 's' : ''} still to score on the next sync.` : '');
  } catch(e){ msg = e.message; err = true; }
  finally { syncing = false; setSyncBtn(false); invalidate(); route(); if (msg) toast(msg, err); }
}

/* ---------------- formatting ---------------- */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf = (n, dp = 0) => Number(n).toLocaleString('en-ZA', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const km = m => m >= 50 ? nf(m/1000, 2) : null;
function dur(s){
  s = Math.round(s); const h = Math.floor(s/3600), m = Math.floor(s%3600/60), x = s%60;
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}` : `${m}:${String(x).padStart(2,'0')}`;
}
const PACED = new Set(['Run','TrailRun','VirtualRun','Walk','Hike']);
const RUNS = new Set(['Run','TrailRun','VirtualRun']);
function paceOrSpeed(a){
  if (!a.dist || !a.moving) return null;
  if (PACED.has(a.type)) return `${dur(a.moving / (a.dist/1000))} /km`;
  return `${(a.dist/a.moving*3.6).toFixed(1)} km/h`;
}
const typeName = t => ({ WeightTraining:'Strength', HighIntensityIntervalTraining:'HIIT', TrailRun:'Trail run', VirtualRun:'Treadmill run' }[t])
                      || String(t || 'Workout').replace(/([a-z])([A-Z])/g, '$1 $2');
const when = iso => new Date(iso).toLocaleString('en-ZA', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });

function decodePoly(str){
  const pts = []; let i = 0, lat = 0, lng = 0;
  while (i < str.length){
    for (const which of [0,1]){
      let b, shift = 0, res = 0;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 31) << shift; shift += 5; } while (b >= 32);
      const d = (res & 1) ? ~(res >> 1) : (res >> 1);
      if (which === 0) lat += d; else lng += d;
    }
    pts.push([lat/1e5, lng/1e5]);
  }
  return pts;
}
function routeSvg(poly, size = 52){
  const pts = decodePoly(poly); if (pts.length < 2) return null;
  const k = Math.cos(pts[0][0] * Math.PI/180);
  const xs = pts.map(p => p[1]*k), ys = pts.map(p => -p[0]);
  const minX = Math.min(...xs), minY = Math.min(...ys), w = Math.max(...xs)-minX, h = Math.max(...ys)-minY, span = Math.max(w, h) || 1;
  const pad = 4, sc = (size - 2*pad) / span, ox = pad + (size - 2*pad - w*sc)/2, oy = pad + (size - 2*pad - h*sc)/2;
  const d = xs.map((x,i) => `${i ? 'L' : 'M'}${(ox + (x-minX)*sc).toFixed(1)} ${(oy + (ys[i]-minY)*sc).toFixed(1)}`).join('');
  return `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/* ---------------- views ---------------- */
let map = null;
function teardownMap(){ if (map){ map.remove(); map = null; } }
const sorted = () => Object.values(store.get(K.acts, {})).sort((x,y) => y.start.localeCompare(x.start));

function viewHome(){
  const acts = sorted(), meta = store.get(K.meta, {}), tok = store.get(K.tok, null), c = cfg();
  const status = tok
    ? (meta.lastSync ? `Synced ${new Date(meta.lastSync).toLocaleString('en-ZA', { dateStyle:'medium', timeStyle:'short' })}` : 'Connected, not synced yet')
    : 'Not connected to Strava';
  let html = `<h1 class="brand">Vitamin <i>Me</i></h1><div class="status">${esc(status)}</div>`;

  if (!acts.length){
    html += tok
      ? `<div class="empty">No workouts yet.<button class="btn go" onclick="sync()">Sync from Strava</button></div>`
      : `<div class="empty">Connect your Strava account to pull in your workouts.<button class="btn go" onclick="location.hash='#/settings'">${c.clientId ? 'Connect Strava' : 'Set up Strava'}</button></div>`;
    return html;
  }

  const L = getLedger(), wk = L.weeks[Scoring.weekKey(new Date())] || { total: 0, n: 0, mult: 1, streakIn: 0 };
  const streak = wk.streakIn ? `<span class="chip">${wk.streakIn}-week streak, +${Math.round((wk.mult-1)*100)}%</span>` : '';
  html += `<div class="points"><span class="bal">${nf(balance())}</span><span class="unit">points</span></div>
    <div class="pointsub"><span>This week <b>+${nf(wk.total)}</b></span><span>${wk.n >= 3 ? `Streak secured, <b>${wk.n}</b> workouts` : `<b>${wk.n}</b> of 3 workouts for the streak`}</span>${streak}</div>` + goalCardHtml() + backupBannerHtml();

  const now = new Date(), monday = new Date(now); monday.setHours(0,0,0,0); monday.setDate(monday.getDate() - (monday.getDay()+6)%7);
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const runKm = from => acts.filter(a => new Date(a.start) >= from && RUNS.has(a.type)).reduce((s,a) => s + a.dist, 0) / 1000;
  const wkKm = runKm(monday), moKm = runKm(month), moN = acts.filter(a => new Date(a.start) >= month).length;
  const goal = c.weeklyKm || 20;
  html += `<div class="period">
      <div><div class="lbl">Running this week</div><div class="big">${wkKm.toFixed(1)}<small>km</small></div>
        <div class="capsule" role="img" aria-label="${Math.round(wkKm/goal*100)}% of ${goal} km goal"><i style="width:${Math.min(100, wkKm/goal*100)}%"></i></div>
        <div class="lbl" style="margin-top:6px">Goal ${goal} km</div></div>
      <div><div class="lbl">Running in ${now.toLocaleString('en-ZA', { month:'long' })}</div><div class="big">${moKm.toFixed(1)}<small>km</small></div>
        <div class="lbl" style="margin-top:22px">${moN} workout${moN === 1 ? '' : 's'} this month</div></div>
    </div>`;

  html += `<h2>Workouts</h2>`;
  html += acts.slice(0, 60).map(a => {
    const svg = a.poly ? routeSvg(a.poly) : null, d = km(a.dist), r = L.byAct[a.id];
    const sub = [a.moving ? dur(a.moving) : null, paceOrSpeed(a), a.avgHr ? `${Math.round(a.avgHr)} bpm` : null]
                  .filter(Boolean).map(x => `<span>${x}</span>`).join('');
    const pts = r ? (r.pending ? `<div>scoring…</div>` : `<div class="pts">+${nf(r.total)}</div>`) : '';
    return `<a class="act" href="#/a/${a.id}">
      <div class="thumb">${svg || esc(typeName(a.type))}</div>
      <div style="min-width:0"><div class="t">${esc(a.name)}</div><div class="m">${when(a.start)}</div><div class="m">${sub}</div></div>
      <div class="r"><b>${d ? d + ' km' : '-'}</b><div>${a.kcal ? Math.round(a.kcal) + ' kcal' : a.kcal === undefined ? '' : '- kcal'}</div>${pts}</div>
    </a>`;
  }).join('');
  return html;
}

async function viewDetail(id){
  const a = store.get(K.acts, {})[id];
  if (!a){ $('view').innerHTML = `<button class="back" onclick="location.hash='#/'">Workouts</button><div class="empty">Workout not found.</div>`; return; }
  $('view').innerHTML = detailHtml(a, null, null);
  let d = null, s = null;
  try { d = await detail(id); } catch(e){ toast(e.message, true); }
  try { s = await hrStream(id); } catch(e){}
  if (s && !(fxGet() || {})[id]){ const fx = fxGet() || {}; fx[id] = computeFx(s); fxSet(fx); invalidate(); }
  if (location.hash !== '#/a/' + id) return;
  $('view').innerHTML = detailHtml(store.get(K.acts, {})[id], d, s);
  drawMap(d?.poly || a.poly);
}

function pointsHtml(a){
  const r = getLedger().byAct[a.id];
  if (!r) return '';
  if (r.pending) return `<h2>Points</h2><p class="hint">Heart-rate data for this workout hasn't loaded yet. It will be scored on the next sync.</p>`;
  const p = getLedger().params, rows = [];
  if (!r.blocks.length) rows.push(['Effort', `No continuous time in your effort zone (≥ ${Math.round(getLedger().zones.mod)} bpm)`, 0]);
  r.blocks.forEach((b, i) => {
    const capped = b.counted < b.min - 0.01;
    rows.push([`Effort block${r.blocks.length > 1 ? ' ' + (i+1) : ''}`,
      `${nf(b.min, 1)} effective min${capped ? `, ${nf(b.counted, 1)} counted (daily cap)` : ''}`, b.pts]);
  });
  if (r.km >= 0.05) rows.push(['Distance', `${nf(r.km, 2)} km`, r.dist]);
  if (r.mult > 1){ const boost = Math.round((r.effort + r.dist) * r.mult) - (r.effort + r.dist); rows.push(['Streak boost', `+${Math.round((r.mult-1)*100)}%`, boost]); }
  if (r.bonus) rows.push(['Consistency', r.bonusLabel, r.bonus]);
  for (const e of r.prs || []) rows.push([e.label, e.t ? `${dur(e.t)}, beating ${dur(e.prev)} by ${dur(e.prev - e.t)}` : `${nf(e.km, 2)} km, beating ${nf(e.prevKm, 2)} km`, e.pts]);
  return `<h2>Points</h2><table class="ledger"><tbody>` +
    rows.map(([k, sub, v]) => `<tr><td>${k}<small>${sub}</small></td><td class="p">+${nf(v)}</td></tr>`).join('') +
    `<tr class="total"><td>Total</td><td class="p">+${nf(r.total)}</td></tr></tbody></table>
    <p class="hint">${nf(r.zoneMin, 0)} min in your effort zone, ${nf(r.vigMin, 0)} of them vigorous (≥ ${Math.round(getLedger().zones.vig)} bpm, counted ×${p.vigMult}).</p>`;
}

function detailHtml(a, d, s){
  const dk = km(a.dist), pace = paceOrSpeed(a);
  const kcal = d ? (d.calories ? Math.round(d.calories) : '-') : '…';
  const stat = (k, v) => `<div><div class="v">${v}</div><div class="k">${k}</div></div>`;
  const hasRoute = a.poly || d?.poly;
  let html = `<button class="back" onclick="location.hash='#/'">Workouts</button>
    <div class="title">${esc(a.name)}</div>
    <div class="status">${esc(typeName(a.type))}, ${when(a.start)}${d?.device ? ', ' + esc(d.device) : ''}</div>
    <div id="map" class="${hasRoute ? '' : 'nomap'}">${hasRoute ? '' : 'No GPS route for this workout.'}</div>
    <div class="stats">
      <div class="hero"><div class="v">${dk ? dk + ' <span style="font-size:20px;color:var(--muted)">km</span>' : '-'}</div><div class="k">Distance</div></div>
      ${stat('Moving time', dur(a.moving))}
      ${stat(PACED.has(a.type) ? 'Avg pace' : 'Avg speed', pace || '-')}
      ${stat('Calories', kcal)}
      ${stat('Avg HR', a.avgHr ? Math.round(a.avgHr) : '-')}
      ${stat('Max HR', a.maxHr ? Math.round(a.maxHr) : '-')}
      ${stat('Elevation', a.elev ? Math.round(a.elev) + ' m' : '-')}
    </div>`;
  if (d?.description) html += `<p class="hint">${esc(d.description)}</p>`;
  html += pointsHtml(a);

  if (s?.hr?.length > 1) html += `<h2>Heart rate</h2>${hrChart(s.t, s.hr, a.avgHr)}`;
  else if (s) html += `<h2>Heart rate</h2><div class="hint">No heart-rate data recorded for this workout.</div>`;

  const splits = (d?.splits || []).filter(x => x.distance > 100);
  if (splits.length > 1 && PACED.has(a.type)){
    const paces = splits.map(x => x.moving_time / (x.distance/1000)), fastest = Math.min(...paces), slowest = Math.max(...paces);
    html += `<h2>Splits</h2><table><thead><tr><th>Km</th><th>Pace</th><th>HR</th><th>Elev</th></tr></thead><tbody>` +
      splits.map((x,i) => {
        const p = paces[i], w = slowest > fastest ? 20 + 60*(slowest - p)/(slowest - fastest) : 60;
        return `<tr><td>${x.distance < 950 ? (x.distance/1000).toFixed(2) : i+1}</td>
          <td><span class="splitbar" style="width:${w.toFixed(0)}px"></span>${dur(p)}</td>
          <td>${x.average_heartrate ? Math.round(x.average_heartrate) : '-'}</td>
          <td>${x.elevation_difference != null ? (x.elevation_difference > 0 ? '+' : '') + Math.round(x.elevation_difference) + ' m' : '-'}</td></tr>`;
      }).join('') + `</tbody></table>`;
  }
  return html;
}

function hrChart(t, hr, avg){
  const W = 600, H = 170, L = 34, R = 8, T = 10, B = 22, z = getLedger().zones;
  const step = Math.max(1, Math.floor(hr.length / 300));
  const pts = []; for (let i = 0; i < hr.length; i += step) pts.push([t[i], hr[i]]);
  const tMax = t[t.length-1] || 1;
  const lo = Math.floor((Math.min(...hr) - 5)/10)*10, hi = Math.ceil((Math.max(...hr, z.vig) + 5)/10)*10;
  const x = v => L + (W-L-R) * v / tMax, y = v => T + (H-T-B) * (1 - (v-lo)/(hi-lo));
  const line = pts.map((p,i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join('');
  const area = `${line}L${x(pts[pts.length-1][0]).toFixed(1)} ${H-B}L${x(pts[0][0]).toFixed(1)} ${H-B}Z`;
  let grid = '';
  for (let v = lo; v <= hi; v += (hi-lo > 60 ? 20 : 10))
    grid += `<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${v}</text>`;
  // effort zone band: shows where points are earned
  const band = z.mod < hi ? `<rect x="${L}" width="${W-L-R}" y="${y(Math.min(hi, 260))}" height="${Math.max(0, y(Math.max(lo, z.mod)) - y(Math.min(hi, 260)))}" fill="var(--accent)" opacity=".08"/>
    <line x1="${L}" x2="${W-R}" y1="${y(z.mod)}" y2="${y(z.mod)}" stroke="var(--accent)" stroke-width="1" opacity=".6"/>` : '';
  const ticks = [0, tMax/2, tMax].map(v => `<text x="${x(v)}" y="${H-5}" text-anchor="${v === 0 ? 'start' : v === tMax ? 'end' : 'middle'}">${dur(v)}</text>`).join('');
  const avgLine = avg ? `<line x1="${L}" x2="${W-R}" y1="${y(avg)}" y2="${y(avg)}" stroke="var(--muted)" stroke-dasharray="5 5"/>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Heart rate over time, average ${Math.round(avg || 0)} bpm">
    <defs><linearGradient id="hrg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ef476f" stop-opacity=".35"/><stop offset="1" stop-color="#ef476f" stop-opacity="0"/></linearGradient></defs>
    ${band}${grid}<path d="${area}" fill="url(#hrg)"/><path d="${line}" fill="none" stroke="var(--hr)" stroke-width="2" stroke-linejoin="round"/>${avgLine}${ticks}</svg>
    <p class="hint">Shaded area: your effort zone (≥ ${Math.round(z.mod)} bpm), where points are earned. Dashed line: average.</p>`;
}

function drawMap(poly){
  teardownMap();
  const el = $('map'); if (!poly || !el || typeof L === 'undefined') return;
  const pts = decodePoly(poly); if (pts.length < 2) return;
  map = L.map(el, { zoomControl: false, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  const line = L.polyline(pts, { color: css('--accent'), weight: 4, opacity: .95 }).addTo(map);
  const ring = css('--bg');
  L.circleMarker(pts[0], { radius: 6, color: ring, weight: 2, fillColor: css('--accent2'), fillOpacity: 1 }).addTo(map);
  L.circleMarker(pts[pts.length-1], { radius: 6, color: ring, weight: 2, fillColor: css('--hr'), fillOpacity: 1 }).addTo(map);
  map.fitBounds(line.getBounds(), { padding: [22, 22] });
}

/* ---------------- progress: records + vitamins ---------------- */
const shortDate = iso => new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
function recordValue(r){
  if (r.kind === 'time') return dur(r.t);
  if (r.kind === 'km') return `${nf(r.value, r.key === 'week' ? 1 : 2)} km`;
  return `${r.value} week${r.value === 1 ? '' : 's'}`;
}
function capsuleSvg(v){
  const done = v.count > 0, pct = done ? 100 : v.next ? Math.max(0, Math.min(100, v.next.value / v.next.target * 100)) : 0;
  return `<svg class="cap ${done ? 'on' : ''}" viewBox="0 0 120 52" role="img" aria-label="${esc(v.name)}${done ? ', collected' : `, ${Math.round(pct)}% progress`}">
    <defs><clipPath id="cp-${v.id}"><rect x="2" y="2" width="116" height="48" rx="24"/></clipPath></defs>
    ${done ? `<rect x="2" y="2" width="58" height="48" fill="var(--accent)" clip-path="url(#cp-${v.id})"/><rect x="60" y="2" width="58" height="48" fill="var(--accent2)" clip-path="url(#cp-${v.id})"/>
              <rect x="10" y="9" width="40" height="7" rx="3.5" fill="#fff" opacity=".35"/>`
           : `<rect x="2" y="2" width="${(116 * pct / 100).toFixed(1)}" height="48" fill="var(--accent)" opacity=".22" clip-path="url(#cp-${v.id})"/>`}
    <rect x="2" y="2" width="116" height="48" rx="24" fill="none" stroke="${done ? 'none' : 'var(--line)'}" stroke-width="2"/>
    <text x="60" y="34" text-anchor="middle" class="capsym">${esc(v.sym)}</text></svg>${v.count > 1 ? `<span class="badge">×${v.count}</span>` : ''}`;
}
function viewProgress(){
  const R = getLedger().rec;
  if (!R || !Object.keys(store.get(K.acts, {})).length)
    return `<h1 class="brand">Progress</h1><div class="empty">Sync your workouts first. Records and vitamins are worked out from your history.</div>`;
  const types = R.vitamins.filter(v => v.count).length, total = R.vitamins.reduce((s, v) => s + v.count, 0);
  let html = `<h1 class="brand">Progress</h1><h2>Records</h2>`;
  html += R.records.length ? `<div class="recs">` + R.records.map(r => {
    const tag = r.actId ? 'a' : 'div', href = r.actId ? ` href="#/a/${r.actId}"` : '';
    const sub = r.kind === 'time' && r.prev ? `${shortDate(r.date)}, ${dur(r.prev - r.t)} faster than before`
              : r.kind === 'km' && r.prev ? `${shortDate(r.date)}, up from ${nf(r.prev, 2)} km`
              : r.date ? (r.key === 'week' ? `Week of ${shortDate(r.date)}` : shortDate(r.date)) : '3+ workouts every week';
    return `<${tag} class="rec"${href}><div><div class="t">${esc(r.label)}</div><div class="m">${sub}</div></div><div class="rv">${recordValue(r)}</div></${tag}>`;
  }).join('') + `</div>` : `<p class="hint">Records appear once you've synced runs.</p>`;
  html += `<p class="hint">Beating a 1 km, 5 km, 10 km or half-marathon time earns +${getLedger().params.prPts}, a new longest run +${getLedger().params.longestPts}. Times are Strava's best efforts within your runs.</p>`;

  const nextTxt = v => v.next ? `${nf(v.next.value, v.unit === 'km' ? 1 : 0)} of ${nf(v.next.target, v.next.target % 1 ? 1 : 0)} ${v.unit}` : '';
  html += `<h2>Vitamins <span class="count">${total} collected, ${types} of ${R.vitamins.length} kinds</span></h2><div class="vits">` +
    R.vitamins.map(v => {
      const status = v.count ? (v.count === 1 ? `Collected ${shortDate(v.last.date)}` : `Collected ${v.count} times, last ${shortDate(v.last.date)}`) : '';
      const next = v.once && v.count ? 'Milestone reached' : v.next ? (v.count ? `Next: ${nextTxt(v)}` : nextTxt(v)) : (v.count ? '' : 'Not collected yet');
      return `<div class="vit ${v.count ? 'on' : ''}"><div class="capwrap">${capsuleSvg(v)}</div>
        <div class="t">${esc(v.name)}${v.once ? ' <span class="chip">Once</span>' : ''}</div><div class="m">${esc(v.desc)}</div>
        ${status ? `<div class="m s">${status}</div>` : ''}${next ? `<div class="m">${next}</div>` : ''}</div>`;
    }).join('') + `</div>
    <p class="hint">Every collection earns +${getLedger().params.vitaminPts} points, except Vitamin A, because records already earn their own bonus.</p>`;
  return html;
}
/* Toast newly collected vitamins once. On first run, history unlocks are summarised. */
function announceVitamins(){
  const R = getLedger().rec; if (!R) return;
  const meta = store.get(K.meta, {});
  const seen = Array.isArray(meta.seenVit) ? Object.fromEntries(meta.seenVit.map(id => [id, 1])) : (meta.seenVit || {});
  const fresh = R.vitamins.filter(v => v.count > (seen[v.id] || 0));
  if (!fresh.length) return;
  const n = fresh.reduce((s, v) => s + v.count - (seen[v.id] || 0), 0);
  store.set(K.meta, { ...meta, seenVit: Object.fromEntries(R.vitamins.map(v => [v.id, v.count])) });
  setTimeout(() => toast(n === 1 ? `Vitamin collected: ${fresh[0].name}${fresh[0].count > 1 ? ` (×${fresh[0].count})` : ''}. ${fresh[0].desc}.`
                                 : `You've collected ${n} vitamins. See them under Progress.`), 3200);
}

/* ---------------- settings ---------------- */
function viewSettings(){
  const c = cfg(), tok = store.get(K.tok, null), t = c.theme || {}, mode = t.mode || 'system', accent = (t.accent || '#ff8a1f').toLowerCase();
  const p = params();
  let html = `<h1 class="brand">Settings</h1>`;
  if (pendingCode){
    html += `<h2>Finish connecting</h2>
      <p class="hint">Strava sent you back to Safari instead of the app. Copy this code, open Vitamin Me from your home screen, and paste it under Settings.</p>
      <div class="field"><input id="codeOut" readonly value="${esc(pendingCode)}"></div>
      <button class="btn go" id="copyCode">Copy code</button>`;
  }

  html += `<h2>Appearance</h2>
    <div class="seg" role="group" aria-label="Theme">
      ${[['system','System'],['light','Light'],['dark','Dark']].map(([k,l]) => `<button data-mode="${k}" aria-pressed="${mode === k}">${l}</button>`).join('')}
    </div>
    <div class="swatches" role="group" aria-label="Accent colour">
      ${ACCENTS.map(([n,h]) => `<button class="sw" data-accent="${h}" style="background:${h}" aria-label="${n}" aria-pressed="${accent === h}"></button>`).join('')}
      <label class="sw custom" aria-label="Custom colour" aria-pressed="${!ACCENTS.some(a => a[1] === accent)}"><input type="color" id="customAccent" value="${esc(accent)}"></label>
    </div>`;

  html += `<h2>Strava</h2>`;
  html += tok
    ? `<p>Connected as <b>${esc(tok.athlete?.name || 'your account')}</b>.</p>
       <button class="btn" id="disconnect">Disconnect Strava</button>`
    : `<p class="hint">One-time setup. At <code>strava.com/settings/api</code>, create an application with Authorization Callback Domain <code>${esc(location.hostname)}</code>. Paste its Client ID and Client Secret here. They are stored only on this phone.</p>
       <div class="field"><label for="cid">Client ID</label><input id="cid" inputmode="numeric" autocomplete="off" value="${esc(c.clientId || '')}"></div>
       <div class="field"><label for="csec">Client Secret</label><input id="csec" type="password" autocomplete="off" value="${esc(c.clientSecret || '')}"></div>
       <button class="btn go" id="connect">Save and connect Strava</button>
       <div class="field" style="margin-top:22px"><label for="codeIn">Got a code from Safari? Paste it here</label><input id="codeIn" autocomplete="off"></div>
       <button class="btn" id="useCode">Use code</button>`;

  html += `<h2>Goals</h2>
    <div class="param"><label for="goal">Weekly running goal</label><input id="goal" type="number" inputmode="decimal" step="1" value="${esc(c.weeklyKm || 20)}"><span>km</span></div>`;

  const z = Scoring.zones(p);
  html += `<h2>Scoring</h2>
    <p class="hint">Changes re-score all your workouts. Your zones now: effort from ${Math.round(z.mod)} bpm, vigorous from ${Math.round(z.vig)} bpm, max ${Math.round(z.hrMax)} bpm.</p>`;
  let grp = '';
  for (const [key, def, label, unit, group, step] of Scoring.PARAMS){
    if (group !== grp){ html += `<div class="grp">${group}</div>`; grp = group; }
    html += `<div class="param"><label for="p_${key}">${label}</label>
      <input id="p_${key}" data-param="${key}" type="number" inputmode="decimal" step="${step}" value="${p[key]}" class="${p[key] !== def ? 'changed' : ''}"><span>${unit}</span></div>`;
  }
  html += `<button class="btn" id="resetParams">Reset scoring to defaults</button>`;

  const lastExp = store.get(K.meta, {}).lastExport;
  html += `<h2>Your data</h2>
    <p class="hint">Everything is stored only on this phone: ${Object.keys(store.get(K.acts, {})).length} workouts, your shop and your settings. Nothing is sent anywhere except your own requests to Strava.</p>
    <p class="hint">${persisted === true ? 'Storage is protected: iOS won\'t clear it to free up space.'
       : persisted === false ? 'Storage isn\'t protected yet. iOS may clear it if the phone runs very low on space, so keep a backup.' : ''}
       Deleting the app from your home screen deletes its data.</p>
    <h2>Backup</h2>
    <p class="hint">A backup file holds your shop, redemptions, scoring settings and appearance. Workouts aren't included; they re-sync from Strava.
       Last backup: <b>${lastExp ? new Date(lastExp).toLocaleString('en-ZA', { dateStyle:'medium', timeStyle:'short' }) : 'never'}</b>.</p>
    <button class="btn go" id="exportBk">Save backup</button>
    <button class="btn" id="importBk">Restore from backup file</button><input type="file" id="bkFile" accept="application/json,.json" hidden>
    <h2>Maintenance</h2>
    <button class="btn" id="resync">Re-sync last 12 months</button>
    <button class="btn danger" id="wipe">Delete all data on this phone</button>`;
  return html;
}

function bindSettings(){
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  const setTheme = patch => { setCfg({ theme: { ...(cfg().theme || {}), ...patch } }); applyTheme();
    const sc = scrollY; $('view').innerHTML = viewSettings(); bindSettings(); scrollTo(0, sc); };
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setTheme({ mode: b.dataset.mode }));
  document.querySelectorAll('[data-accent]').forEach(b => b.onclick = () => setTheme({ accent: b.dataset.accent }));
  const ca = $('customAccent'); if (ca) ca.onchange = () => setTheme({ accent: ca.value });

  on('copyCode', async () => { try { await navigator.clipboard.writeText(pendingCode); toast('Code copied.'); } catch(e){ $('codeOut').select(); } });
  on('connect', () => {
    const clientId = $('cid').value.trim(), clientSecret = $('csec').value.trim();
    if (!/^\d+$/.test(clientId) || clientSecret.length < 20){ toast('Check the Client ID (a number) and the 40-character Client Secret.', true); return; }
    setCfg({ clientId, clientSecret });
    connectStrava();
  });
  on('useCode', async () => {
    const code = $('codeIn').value.trim(); if (!code){ toast('Paste the code first.', true); return; }
    const clientId = $('cid').value.trim(), clientSecret = $('csec').value.trim();
    if (clientId && clientSecret) setCfg({ clientId, clientSecret });
    try { await exchangeCode(code); } catch(e){ toast(e.message, true); }
  });
  on('disconnect', () => { if (confirm('Disconnect Strava? Your stored workouts stay on this phone.')){ store.del(K.tok); route(); toast('Disconnected.'); } });
  on('resync', () => { const m = store.get(K.meta, {}); delete m.latest; store.set(K.meta, m); sync(); });
  on('wipe', async () => {
    if (!confirm('Delete all workouts, tokens and settings from this phone?')) return;
    Object.values(K).forEach(store.del); store.del(SHOP_KEY); await idb.clear(); invalidate(); applyTheme(); route(); toast('All data deleted.');
  });
  on('exportBk', exportBackup);
  on('importBk', () => $('bkFile').click());
  const bf = $('bkFile'); if (bf) bf.onchange = async () => {
    const f = bf.files[0]; if (!f) return;
    try {
      const b = JSON.parse(await f.text());
      if (b.app !== 'vitamin-me' || !b.shop) throw new Error('This is not a Vitamin Me backup.');
      if (!confirm(`Restore the shop (${b.shop.items.length} rewards, ${b.shop.redemptions.length} redemptions) and settings from ${new Date(b.exported).toLocaleDateString('en-ZA')}?`)) return;
      setShop(b.shop);
      const keep = cfg(); setCfg({ ...b.cfg, clientId: keep.clientId || b.cfg.clientId, clientSecret: keep.clientSecret });
      store.set(K.meta, { ...store.get(K.meta, {}), lastExport: Date.parse(b.exported) || Date.now() });
      applyTheme(); await rescoreAll(); invalidate(); route(); toast('Backup restored.');
    } catch(e){ toast('Import failed: ' + e.message, true); }
  };
  const g = $('goal'); if (g) g.onchange = () => { const v = parseFloat(g.value); if (v > 0){ setCfg({ weeklyKm: v }); toast('Goal saved.'); } };

  document.querySelectorAll('[data-param]').forEach(inp => inp.onchange = async () => {
    const key = inp.dataset.param, v = parseFloat(inp.value);
    if (!Number.isFinite(v) || v < 0){ inp.value = params()[key]; toast('Enter a number of 0 or more.', true); return; }
    const before = fxSig();
    setCfg({ params: { ...(cfg().params || {}), [key]: v } });
    if (fxSig() !== before) await rescoreAll();
    invalidate();
    const sc = scrollY; $('view').innerHTML = viewSettings(); bindSettings(); scrollTo(0, sc);   // refresh zone summary
    toast(`Points recalculated: ${nf(getLedger().total)} total.`);
  });
  on('resetParams', async () => {
    if (!confirm('Reset all scoring parameters to their defaults?')) return;
    setCfg({ params: {} }); await rescoreAll(); invalidate(); route(); toast(`Defaults restored: ${nf(getLedger().total)} points.`);
  });
}

/* ---------------- on-device storage & backup file ----------------
   All data lives only on this phone (localStorage + IndexedDB). Two protections:
   1. Persistent storage: asks iOS not to evict it under storage pressure.
   2. A backup file the user saves via the share sheet (e.g. to iCloud Drive), with a reminder. */
const BACKUP_REMIND_DAYS = 7;
let persisted = null;
async function ensurePersistent(){
  try {
    if (!navigator.storage?.persisted) return;
    persisted = await navigator.storage.persisted();
    if (!persisted && navigator.storage.persist) persisted = await navigator.storage.persist();
  } catch(e){}
}
function backupPayload(){
  const { clientSecret, ...safeCfg } = cfg();
  return { app: 'vitamin-me', version: 1, exported: new Date().toISOString(), cfg: safeCfg, shop: shop() };
}
async function exportBackup(){
  const name = `vitamin-me-backup-${Scoring.dayKey(new Date())}.json`;
  const file = new File([JSON.stringify(backupPayload(), null, 1)], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Vitamin Me backup' });
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click(); }
    store.set(K.meta, { ...store.get(K.meta, {}), lastExport: Date.now() });
    route(); toast('Backup saved.');
  } catch(e){ if (e.name !== 'AbortError') toast('Backup failed: ' + e.message, true); }
}
function backupDue(){
  const s = shop(), last = store.get(K.meta, {}).lastExport || 0;
  if (!s.items.length && !s.redemptions.length) return false;
  return (s.updated || 1) > last && Date.now() - last > BACKUP_REMIND_DAYS * 86400000;
}
function backupBannerHtml(){
  if (!backupDue()) return '';
  const last = store.get(K.meta, {}).lastExport;
  const ago = last ? `${Math.floor((Date.now() - last) / 86400000)} days ago` : 'never';
  return `<div class="goal"><div class="goalrow"><span><b>Back up your shop</b></span><span class="lbl" style="margin:0">Last backup: ${ago}</span></div>
    <div class="lbl">Your rewards and redemptions only exist on this phone. Save a backup file, for example to iCloud Drive.</div>
    <button class="btn go" data-backup>Save backup</button></div>`;
}

/* ---------------- router & chrome ---------------- */
function route(){
  teardownMap();
  const h = location.hash || '#/';
  if (h.startsWith('#/a/')) viewDetail(h.slice(4));
  else if (h === '#/settings'){ $('view').innerHTML = viewSettings(); bindSettings(); }
  else if (h.startsWith('#/shop') && routeShop(h)){}
  else if (h === '#/progress'){ $('view').innerHTML = viewProgress(); }
  else { $('view').innerHTML = viewHome(); announceVitamins(); const bb = document.querySelector('[data-backup]'); if (bb) bb.onclick = exportBackup; }
  markNav();
}
function markNav(){
  const h = location.hash || '#/', cur = h.startsWith('#/shop') ? 'navShop' : h === '#/settings' ? 'navSettings' : h === '#/progress' ? 'navProgress' : 'navHome';
  ['navHome','navProgress','navShop','navSettings'].forEach(id => $(id).toggleAttribute('aria-current', id === cur));
}
function setSyncBtn(busy){ const b = $('navSync'); b.disabled = busy; b.classList.toggle('spin', busy); b.setAttribute('aria-label', busy ? 'Syncing' : 'Sync from Strava'); }
let toastTimer;
function toast(msg, err = false){
  const el = $('toast'); el.textContent = msg; el.className = 'toast on' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = 'toast', err ? 5000 : 3000);
}
$('navHome').onclick = () => { location.hash = '#/'; };
$('navSettings').onclick = () => { location.hash = '#/settings'; };
$('navShop').onclick = () => { location.hash = '#/shop'; };
$('navProgress').onclick = () => { location.hash = '#/progress'; };
$('navSync').onclick = () => { if (!syncing && confirm('Sync your latest workouts from Strava?')) sync(); };
window.addEventListener('hashchange', () => { route(); scrollTo(0, 0); });

applyTheme();
ensurePersistent();
if (pendingCode) location.hash = '#/settings';
(async () => {
  if (store.get(K.acts, null) && !fxGet()) { await rescoreAll(); invalidate(); }
  route();
  if (store.get(K.tok, null) && Date.now() - (store.get(K.meta, {}).lastSync || 0) > 600000) sync();
})();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
