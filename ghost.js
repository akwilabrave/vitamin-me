/* ================================================================
   Doppel — ghost runner (pure functions)
   Same-route detection: two runs match when their territory tiles overlap
   (Jaccard ≥ SIM) and their distances are within ±DIST_TOL. Direction doesn't matter.
   Comparison works on time-at-distance from Strava streams (elapsed time, so stops count).
   Loaded in the browser as globalThis.Ghost; requireable in Node for tests.
   ================================================================ */
(function (root) {
  "use strict";
  const SIM = 0.6, DIST_TOL = 0.15;
  const RUN = new Set(['Run', 'TrailRun']);

  function jaccard(a, b){
    if (!a.size || !b.size) return 0;
    let inter = 0; const [s, l] = a.size < b.size ? [a, b] : [b, a];
    for (const k of s) if (l.has(k)) inter++;
    return inter / (a.size + b.size - inter);
  }
  const pace = a => a.moving / (a.dist / 1000);        // s per km

  /* For every run: earlier runs on the same route, the previous one and the fastest one. */
  function index(acts, tiles){
    const runs = acts.filter(a => RUN.has(a.type) && a.dist >= 1000 && tiles[a.id]?.length)
                     .sort((a, b) => a.start.localeCompare(b.start));
    const sets = Object.fromEntries(runs.map(a => [a.id, new Set(tiles[a.id])]));
    const byAct = {};
    runs.forEach((a, i) => {
      const matches = [];
      for (let j = i - 1; j >= 0; j--){
        const b = runs[j];
        if (Math.abs(a.dist - b.dist) > DIST_TOL * Math.max(a.dist, b.dist)) continue;
        const sim = jaccard(sets[a.id], sets[b.id]);
        if (sim >= SIM) matches.push({ id: b.id, sim, date: b.start, pace: pace(b) });
      }
      if (!matches.length) return;
      const best = matches.reduce((x, y) => y.pace < x.pace ? y : x);
      byAct[a.id] = { matches, prev: matches[0], best, beatPrev: pace(a) < matches[0].pace, beatBest: pace(a) < best.pace };
    });
    return { byAct };
  }

  /* Time at distance by linear interpolation (d must be non-decreasing). */
  function timeAt(t, d, x){
    if (x <= d[0]) return t[0];
    if (x >= d[d.length - 1]) return null;
    let lo = 0, hi = d.length - 1;
    while (hi - lo > 1){ const m = (lo + hi) >> 1; if (d[m] < x) lo = m; else hi = m; }
    const f = d[hi] === d[lo] ? 0 : (x - d[lo]) / (d[hi] - d[lo]);
    return t[lo] + f * (t[hi] - t[lo]);
  }
  /* Distance at time (t increasing). */
  function distAt(t, d, x){
    if (x <= t[0]) return d[0];
    if (x >= t[t.length - 1]) return d[d.length - 1];
    let lo = 0, hi = t.length - 1;
    while (hi - lo > 1){ const m = (lo + hi) >> 1; if (t[m] < x) lo = m; else hi = m; }
    const f = (x - t[lo]) / (t[hi] - t[lo]);
    return d[lo] + f * (d[hi] - d[lo]);
  }

  /* gap > 0 means you are AHEAD of the ghost (the ghost needed longer to reach that distance). */
  function compare(you, ghost, step = 100){
    const end = Math.min(you.d[you.d.length - 1], ghost.d[ghost.d.length - 1]);
    const pts = [];
    for (let x = step; x <= end; x += step){
      const ty = timeAt(you.t, you.d, x), tg = timeAt(ghost.t, ghost.d, x);
      if (ty == null || tg == null) break;
      pts.push({ d: x, ty, tg, gap: tg - ty });
    }
    const splits = [];
    for (let k = 1; k * 1000 <= end; k++){
      const y0 = timeAt(you.t, you.d, (k - 1) * 1000) ?? 0, y1 = timeAt(you.t, you.d, k * 1000);
      const g0 = timeAt(ghost.t, ghost.d, (k - 1) * 1000) ?? 0, g1 = timeAt(ghost.t, ghost.d, k * 1000);
      if (y1 == null || g1 == null) break;
      splits.push({ km: k, you: y1 - y0, ghost: g1 - g0, diff: (g1 - g0) - (y1 - y0), gap: g1 - y1 });
    }
    const last = pts[pts.length - 1];
    let lead = 0, maxLead = 0, maxBehind = 0;
    for (const p of pts){ maxLead = Math.max(maxLead, p.gap); maxBehind = Math.min(maxBehind, p.gap); }
    // first point where the lead changed hands for good
    for (let i = pts.length - 1; i > 0; i--) if (Math.sign(pts[i].gap) !== Math.sign(pts[i - 1].gap)){ lead = pts[i].d; break; }
    return { pts, splits, end, final: last ? last.gap : 0, maxLead, maxBehind, decidedAt: lead };
  }

  const api = { SIM, DIST_TOL, jaccard, index, timeAt, distAt, compare };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Ghost = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
