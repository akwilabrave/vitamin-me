/* ================================================================
   Doppel token Worker (Cloudflare Workers, free plan)
   Holds the Strava client secret so it never ships in the app. OAuth only:
   it never requests, stores or relays activity data (Strava API Policy 5.16).

   GET  /start?state=K.C   → redirect to Strava's consent screen
   GET  /callback          → Strava redirects here; swap the code for tokens and
                             park them in KV for 2 minutes under K, locked to C
   POST /claim {k, v}      → the app collects the parked tokens; sha256(v) must equal C;
                             the parked copy is deleted at once
   POST /refresh {refresh_token} → new access token (every ~6 h)
   POST /revoke  {token}   → revoke access (Disconnect in the app)
   GET/POST /webhook       → Strava webhook subscription check + event acknowledgement

   K = random key, C = base64url(sha256(v)), v = a random verifier that never leaves the phone
   until the claim. Nothing else is stored: no names, emails or workouts.
   ================================================================ */
const STRAVA = 'https://www.strava.com';
const SCOPE = 'read,activity:read';
const TTL = 120;                                  // seconds a hand-off may wait
const STATE_RE = /^([A-Za-z0-9_-]{16,64})\.([A-Za-z0-9_-]{43})$/;

export default {
  async fetch(req, env){
    const url = new URL(req.url), origin = new URL(env.APP_URL).origin;
    const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
                   'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      switch (url.pathname){
        case '/start':    return start(url, env);
        case '/callback': return await callback(url, env);
        case '/claim':    return req.method === 'POST' ? await claim(await body(req), env, json) : json({ error: 'method' }, 405);
        case '/refresh':  return req.method === 'POST' ? await refresh(await body(req), env, json) : json({ error: 'method' }, 405);
        case '/revoke':   return req.method === 'POST' ? await revoke(await body(req), env, json) : json({ error: 'method' }, 405);
        case '/webhook':  return await webhook(req, url, env);
        case '/':         return new Response('Doppel auth: ok', { headers: { 'Content-Type': 'text/plain' } });
        default:          return json({ error: 'not_found' }, 404);
      }
    } catch (e){
      return json({ error: 'server', message: String(e && e.message || e) }, 500);
    }
  }
};

const body = req => req.json().catch(() => ({}));

function start(url, env){
  const state = url.searchParams.get('state') || '';
  if (!STATE_RE.test(state)) return page('Something went wrong', 'Open Doppel and tap Connect with Strava again.', env, false);
  const to = `${STRAVA}/oauth/authorize?` + new URLSearchParams({
    client_id: env.CLIENT_ID, response_type: 'code', approval_prompt: 'auto', scope: SCOPE, state,
    redirect_uri: new URL('/callback', url).toString()
  });
  return Response.redirect(to, 302);
}

async function callback(url, env){
  const q = url.searchParams, m = STATE_RE.exec(q.get('state') || '');
  if (q.get('error')) return page('Not connected', 'Strava access was not granted. You can try again from Doppel any time.', env, true);
  if (!m || !q.get('code')) return page('Something went wrong', 'Open Doppel and tap Connect with Strava again.', env, true);
  if (!/activity:read/.test(q.get('scope') || ''))
    return page('One more tick needed', 'Doppel needs "View data about your activities". Go back to Doppel, connect again and leave that box ticked.', env, true);

  const r = await fetch(`${STRAVA}/oauth/token`, { method: 'POST', body: new URLSearchParams({
    client_id: env.CLIENT_ID, client_secret: env.CLIENT_SECRET, code: q.get('code'), grant_type: 'authorization_code' }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) return page('Strava said no', 'The sign-in code was rejected or expired. Go back to Doppel and connect again.', env, true);

  const tok = { access: j.access_token, refresh: j.refresh_token, expires: j.expires_at, scope: q.get('scope'),
                athlete: j.athlete ? { id: j.athlete.id, name: j.athlete.firstname || '' } : null };
  await env.HANDOFF.put('h:' + m[1], JSON.stringify({ c: m[2], tok }), { expirationTtl: TTL });
  return page('Strava is connected', 'Switch back to Doppel. It picks this up by itself within a few seconds.', env, true);
}

async function claim(b, env, json){
  if (typeof b.k !== 'string' || typeof b.v !== 'string' || b.v.length < 32) return json({ error: 'bad_request' }, 400);
  const raw = await env.HANDOFF.get('h:' + b.k);
  if (!raw) return json({ error: 'pending' }, 404);                     // not approved yet, or expired
  const { c, tok } = JSON.parse(raw);
  if (await sha256url(b.v) !== c) return json({ error: 'forbidden' }, 403);
  await env.HANDOFF.delete('h:' + b.k);
  return json(tok);
}

async function refresh(b, env, json){
  if (!b.refresh_token) return json({ error: 'bad_request' }, 400);
  const r = await fetch(`${STRAVA}/oauth/token`, { method: 'POST', body: new URLSearchParams({
    client_id: env.CLIENT_ID, client_secret: env.CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: b.refresh_token }) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 400 || r.status === 401) return json({ error: 'revoked' }, 401);   // athlete removed access
  if (!r.ok) return json({ error: 'strava', status: r.status }, 502);
  return json({ access: j.access_token, refresh: j.refresh_token, expires: j.expires_at });
}

async function revoke(b, env, json){
  if (!b.token) return json({ error: 'bad_request' }, 400);
  await fetch(`${STRAVA}/oauth/revoke`, { method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${env.CLIENT_ID}:${env.CLIENT_SECRET}`) },
    body: new URLSearchParams({ token: b.token }) });
  return json({ ok: true });                                            // Strava answers 200 even for unknown tokens
}

/* Strava requires a webhook subscription so apps learn about deauthorizations.
   Doppel keeps no server-side data, so events only need acknowledging: the phone
   notices the revoked token on its next refresh and wipes its Strava data itself. */
async function webhook(req, url, env){
  if (req.method === 'GET'){
    if (url.searchParams.get('hub.verify_token') !== env.VERIFY_TOKEN) return new Response('forbidden', { status: 403 });
    return new Response(JSON.stringify({ 'hub.challenge': url.searchParams.get('hub.challenge') }), { headers: { 'Content-Type': 'application/json' } });
  }
  return new Response('ok');
}

async function sha256url(s){
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return btoa(String.fromCharCode(...d)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function page(title, text, env, back){
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Doppel</title><style>
:root{color-scheme:light dark;--bg:#f2f5f8;--panel:#fff;--text:#132030;--muted:#5d6b7a}
@media (prefers-color-scheme:dark){:root{--bg:#10151c;--panel:#18202a;--text:#eef2f6;--muted:#8c99a8}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:16px/1.5 -apple-system,system-ui,sans-serif;padding:24px;box-sizing:border-box}
.c{max-width:340px;text-align:center;background:var(--panel);border-radius:24px;padding:28px 24px}
h1{font:800 24px/1.2 ui-rounded,-apple-system,system-ui,sans-serif;margin:0 0 8px}p{color:var(--muted);margin:0 0 18px}
a{display:block;background:#7c5cff;color:#fff;text-decoration:none;font-weight:700;border-radius:14px;padding:13px}
</style></head><body><div class="c"><h1>${esc(title)}</h1><p>${esc(text)}</p>${back ? `<a href="${esc(env.APP_URL)}#/connected">Back to Doppel</a>` : ''}</div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
