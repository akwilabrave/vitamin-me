/* ================================================================
   Doppel — territory (pure functions)
   The world is divided into Web-Mercator tiles at zoom 17 (≈ 300 m × cos(latitude),
   about 275 m in Pretoria). Running or riding through a tile claims it.
   Works anywhere on Earth with no map lookups.
   Loaded in the browser as globalThis.Territory; requireable in Node for tests.
   ================================================================ */
(function (root) {
  "use strict";
  const S = root.Scoring || (typeof require !== 'undefined' ? require('./scoring.js') : null);
  const Z = 17, N = 2 ** Z;

  const fx = lon => (lon + 180) / 360 * N;
  const fy = lat => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * N; };
  const key = (x, y) => x + ':' + y;
  const unkey = k => k.split(':').map(Number);
  function bounds(k){   // [[south, west], [north, east]]
    const [x, y] = unkey(k);
    const lat = t => Math.atan(Math.sinh(Math.PI * (1 - 2 * t / N))) * 180 / Math.PI;
    return [[lat(y + 1), x / N * 360 - 180], [lat(y), (x + 1) / N * 360 - 180]];
  }
  const tileSizeM = lat => 40075016.686 * Math.cos(lat * Math.PI / 180) / N;

  /* Every tile a route passes through. pts: [[lat, lng], …]. Segments are sampled at
     quarter-tile steps; jumps longer than 2 km (GPS dropouts, ferries) are not filled in. */
  function tilesFromPoints(pts){
    const out = new Set();
    for (let i = 0; i < pts.length; i++){
      const x1 = fx(pts[i][1]), y1 = fy(pts[i][0]);
      out.add(key(Math.floor(x1), Math.floor(y1)));
      if (!i) continue;
      const x0 = fx(pts[i - 1][1]), y0 = fy(pts[i - 1][0]), d = Math.hypot(x1 - x0, y1 - y0);
      if (d * tileSizeM(pts[i][0]) > 2000) continue;
      const steps = Math.ceil(d * 4);
      for (let s = 1; s < steps; s++) out.add(key(Math.floor(x0 + (x1 - x0) * s / steps), Math.floor(y0 + (y1 - y0) * s / steps)));
    }
    return [...out];
  }

  /* Largest k×k block of claimed tiles (dynamic programming), and the largest 4-connected area. */
  function maxSquare(owned){
    const dp = new Map(); let best = 0, at = null;
    const ks = [...owned].map(unkey).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const [x, y] of ks){
      const v = 1 + Math.min(dp.get(key(x - 1, y)) || 0, dp.get(key(x, y - 1)) || 0, dp.get(key(x - 1, y - 1)) || 0);
      dp.set(key(x, y), v);
      if (v > best){ best = v; at = [x, y]; }
    }
    return best ? { size: best, x0: at[0] - best + 1, y0: at[1] - best + 1 } : { size: 0 };
  }
  function areas(owned){
    const seen = new Set(), out = [];
    for (const k of owned){
      if (seen.has(k)) continue;
      const comp = [], stack = [k]; seen.add(k);
      while (stack.length){
        const c = stack.pop(); comp.push(c);
        const [x, y] = unkey(c);
        for (const n of [key(x + 1, y), key(x - 1, y), key(x, y + 1), key(x, y - 1)])
          if (owned.has(n) && !seen.has(n)){ seen.add(n); stack.push(n); }
      }
      out.push(comp);
    }
    return out.sort((a, b) => b.length - a.length);
  }
  const largestArea = owned => areas(owned)[0] || [];

  /* acts: [{id, start, type}]; tiles: {id: [keys]} */
  function compute(acts, tiles, params){
    const p = { ...S.DEFAULTS, ...params };
    const list = acts.slice().sort((a, b) => a.start.localeCompare(b.start));
    const owned = new Map(), byAct = {}, events = [];
    for (const a of list){
      const ks = tiles[a.id]; if (!ks || !ks.length) continue;
      const fresh = ks.filter(k => !owned.has(k));
      for (const k of fresh) owned.set(k, { actId: a.id, date: a.start });
      byAct[a.id] = { tiles: ks.length, fresh };
      if (fresh.length && p.tilePts) events.push({ date: a.start, actId: a.id, pts: Math.round(fresh.length * p.tilePts), tiles: fresh.length });
    }
    const set = new Set(owned.keys());
    const all = areas(set);
    return { owned, byAct, events, count: owned.size, square: maxSquare(set), area: all[0] || [], areas: all };
  }

  /* Exploration XP into the ledger (after the streak multiplier, like record bonuses). */
  function mergeIntoLedger(L, T){
    for (const e of T.events){
      const r = L.byAct[e.actId]; if (r){ r.explore = e; r.total += e.pts; }
      L.events.push({ date: e.date, actId: e.actId, pts: e.pts, explore: e.tiles });
      const w = L.weeks[S.weekKey(e.date)]; if (w) w.total += e.pts;
      L.total += e.pts;
    }
    L.events.sort((a, b) => b.date.localeCompare(a.date));
    return L;
  }

  const api = { Z, key, unkey, bounds, tileSizeM, tilesFromPoints, maxSquare, areas, largestArea, compute, mergeIntoLedger };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Territory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
