"use strict";
/* ================================================================
   Vitamin Me — encrypted cloud backup
   Shop + settings → JSON → AES-256-GCM → private GitHub repo (via fine-grained token).
   Key: PBKDF2-SHA256, 600k iterations, random 16-byte salt. Fresh 12-byte IV per write.
   The passphrase is never stored; the derived key is kept in IndexedDB as a
   non-extractable CryptoKey (usable for encrypt/decrypt, cannot be exported).
   Strava secret and GitHub token are never included in the backup.
   Loaded before app.js; uses its globals (store, idb, cfg, setCfg, toast) at call time.
   ================================================================ */
const BK_KEY = 'vm.bk';                       // { owner, repo, token, lastBackup, lastError }
const BK_PATH = 'vitamin-me-backup.enc.json';
const KDF_ITER = 600000;

const bkCfg = () => store.get(BK_KEY, {});
const setBk = patch => store.set(BK_KEY, { ...bkCfg(), ...patch });
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64utf8 = s => btoa(unescape(encodeURIComponent(s)));
const unb64utf8 = s => decodeURIComponent(escape(atob(s.replace(/\s/g, ''))));

async function deriveKey(passphrase, salt){
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: KDF_ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptJson(obj, key, salt){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return { format: 'vitamin-me-backup', v: 1, kdf: 'PBKDF2-SHA256', iter: KDF_ITER, cipher: 'AES-256-GCM',
           salt: b64(salt), iv: b64(iv), ct: b64(ct), updated: new Date().toISOString() };
}
async function decryptJson(file, key){
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(file.iv) }, key, unb64(file.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch(e){ throw new Error('Wrong passphrase, or the backup file was modified.'); }
}

/* ---------- GitHub contents API (CORS-enabled) ---------- */
async function gh(method, body){
  const b = bkCfg();
  let r;
  try {
    r = await fetch(`https://api.github.com/repos/${b.owner}/${b.repo}/contents/${BK_PATH}`, {
      method, headers: { Authorization: 'Bearer ' + b.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: body ? JSON.stringify(body) : undefined, cache: 'no-store'
    });
  } catch(e){ throw new Error('Could not reach GitHub. Check your connection.'); }
  if (r.status === 404 && method === 'GET') return null;
  if (r.status === 401) throw new Error('GitHub rejected the token. It may have expired; create a new one.');
  if (r.status === 403 || r.status === 404) throw new Error(`The token can't access ${b.owner}/${b.repo}. Check the repo name and that the token has Contents read and write.`);
  if (r.status === 409 || r.status === 422) throw Object.assign(new Error('Backup changed elsewhere.'), { conflict: true });
  if (!r.ok) throw new Error('GitHub returned error ' + r.status + '.');
  return r.json();
}
async function readRemote(){
  const f = await gh('GET');
  return f ? { sha: f.sha, file: JSON.parse(unb64utf8(f.content)) } : null;
}

/* ---------- payload ---------- */
function backupPayload(){
  const { clientSecret, ...safeCfg } = cfg();
  return { app: 'vitamin-me', version: 1, exported: new Date().toISOString(), cfg: safeCfg, shop: shop() };
}
async function applyPayload(p){
  if (p.app !== 'vitamin-me' || !p.shop) throw new Error('This is not a Vitamin Me backup.');
  store.set(SHOP_KEY, p.shop);   // direct write: don't trigger an immediate re-backup
  const keep = cfg();
  store.set(K.cfg, { ...p.cfg, clientId: keep.clientId || p.cfg.clientId, clientSecret: keep.clientSecret });
  applyTheme(); await rescoreAll(); invalidate();
}

/* ---------- key handling ---------- */
async function storedKey(){ return idb.get('bkkey'); }      // { key: CryptoKey, salt: Uint8Array }
const backupReady = () => { const b = bkCfg(); return !!(b.token && b.owner && b.repo); };

/* Connect: validate access, set up the key. If a backup already exists, the passphrase must open it. */
async function connectBackup(owner, repo, token, passphrase){
  if (passphrase.length < 12) throw new Error('Use a passphrase of at least 12 characters, e.g. four random words.');
  setBk({ owner, repo, token, lastError: null });
  const remote = await readRemote();
  let salt, key, restored = null;
  if (remote){
    salt = unb64(remote.file.salt);
    key = await deriveKey(passphrase, salt);
    restored = await decryptJson(remote.file, key);          // throws on wrong passphrase
  } else {
    salt = crypto.getRandomValues(new Uint8Array(16));
    key = await deriveKey(passphrase, salt);
  }
  await idb.set('bkkey', { key, salt });
  return restored;   // existing backup contents, or null for a fresh one
}

let bkTimer = null, bkBusy = false;
function scheduleBackup(){
  if (!backupReady()) return;
  clearTimeout(bkTimer);
  bkTimer = setTimeout(() => backupNow().catch(() => {}), 3000);
}
async function backupNow(){
  if (bkBusy){ scheduleBackup(); return; }
  bkBusy = true;
  try {
    const k = await storedKey();
    if (!k) throw new Error('Set up cloud backup again: the encryption key is missing on this device.');
    const file = await encryptJson(backupPayload(), k.key, k.salt);
    const put = async sha => gh('PUT', { message: `Backup ${file.updated}`, content: b64utf8(JSON.stringify(file)), ...(sha ? { sha } : {}) });
    const remote = await readRemote();
    try { await put(remote?.sha); }
    catch(e){ if (!e.conflict) throw e; await put((await readRemote())?.sha); }   // one retry on a stale sha
    setBk({ lastBackup: file.updated, lastError: null });
    return file.updated;
  } catch(e){ setBk({ lastError: e.message }); throw e; }
  finally { bkBusy = false; }
}
async function restoreNow(){
  const k = await storedKey();
  if (!k) throw new Error('Set up cloud backup on this device first.');
  const remote = await readRemote();
  if (!remote) throw new Error('No backup found in the repo yet.');
  await applyPayload(await decryptJson(remote.file, k.key));
  return remote.file.updated;
}
async function disconnectBackup(){ clearTimeout(bkTimer); store.del(BK_KEY); await idb.set('bkkey', null); }
