/* ================================================================
   Vitamin Me — personal records and vitamin collection (pure functions)
   Input:  activities (with Strava best efforts), the scoring ledger, params.
   Output: current records, PR bonus events, vitamins with unlock date or progress,
           and vitamin bonus events. Everything is re-derived from history, so
           editing parameters re-evaluates records and unlocks consistently.
   Loaded in the browser as globalThis.Records; requireable in Node for tests.
   ================================================================ */
(function (root) {
  "use strict";
  const S = root.Scoring || (typeof require !== 'undefined' ? require('./scoring.js') : null);

  const RUN = new Set(['Run', 'TrailRun', 'VirtualRun']);
  /* Strava best-effort names we track → display label */
  const EFFORTS = [['1k', '1 km'], ['5k', '5 km'], ['10k', '10 km'], ['Half-Marathon', 'Half marathon']];

  /* The collection.
     n(st)    → how many times collected so far (re-evaluated after every workout / rest day)
     next(st) → [value, target] progress toward the next collection, or null for event-type vitamins
     once     → a milestone that can only be collected one time */
  const fl = (x, k) => Math.floor(x / k + 1e-9);
  const VITAMINS = [
    { id: 'A',   sym: 'A',   name: 'Vitamin A',   desc: 'Every new personal record', noPts: true,             n: s => s.prs,               next: () => null, unit: '' },
    { id: 'B1',  sym: 'B1',  name: 'Vitamin B1',  desc: 'Every 10 workouts',                                 n: s => fl(s.workouts, 10),  next: s => [s.workouts % 10, 10], unit: 'workouts' },
    { id: 'B6',  sym: 'B6',  name: 'Vitamin B6',  desc: 'Complete 50 workouts', once: true,                  n: s => +(s.workouts >= 50), next: s => [Math.min(s.workouts, 50), 50], unit: 'workouts' },
    { id: 'B12', sym: 'B12', name: 'Vitamin B12', desc: 'Complete 100 workouts', once: true,                 n: s => +(s.workouts >= 100),next: s => [Math.min(s.workouts, 100), 100], unit: 'workouts' },
    { id: 'C',   sym: 'C',   name: 'Vitamin C',   desc: 'Every 4 weeks of streak (3+ workouts a week)',      n: s => s.streak4,           next: s => [s.curStreak % 4, 4], unit: 'weeks' },
    { id: 'D',   sym: 'D',   name: 'Vitamin D',   desc: 'Every run of 10 km or more',                        n: s => s.runs10,            next: s => s.runs10 ? null : [s.longestKm, 10], unit: 'km' },
    { id: 'D3',  sym: 'D3',  name: 'Vitamin D3',  desc: 'Every half marathon (21.1 km)',                     n: s => s.runsHalf,          next: s => s.runsHalf ? null : [s.longestKm, 21.1], unit: 'km' },
    { id: 'E',   sym: 'E',   name: 'Vitamin E',   desc: 'Every 60-minute effort block',                      n: s => s.blocks60,          next: s => s.blocks60 ? null : [s.longestBlock, 60], unit: 'min' },
    { id: 'K',   sym: 'K',   name: 'Vitamin K',   desc: 'Every 100 km of running',                           n: s => fl(s.runKm, 100),    next: s => [s.runKm % 100, 100], unit: 'km' },
    { id: 'K2',  sym: 'K2',  name: 'Vitamin K2',  desc: 'Run 500 km in total', once: true,                   n: s => +(s.runKm >= 500),   next: s => [Math.min(s.runKm, 500), 500], unit: 'km' },
    { id: 'Fe',  sym: 'Fe',  name: 'Iron',        desc: 'Every workout with 30+ vigorous minutes',           n: s => s.vig30,             next: s => s.vig30 ? null : [s.maxVig, 30], unit: 'min' },
    { id: 'Zn',  sym: 'Zn',  name: 'Zinc',        desc: 'Every week with 150+ minutes in your effort zone',  n: s => s.weeks150,          next: s => s.zoneThisWeek >= 150 ? null : [s.zoneThisWeek, 150], unit: 'min this week' },
    { id: 'Mg',  sym: 'Mg',  name: 'Magnesium',   desc: 'Every 10 workouts started before 07:00',            n: s => fl(s.mornings, 10),  next: s => [s.mornings % 10, 10], unit: 'early workouts' },
    { id: 'Ca',  sym: 'Ca',  name: 'Calcium',     desc: 'Every 1,000 m climbed',                             n: s => fl(s.climb, 1000),   next: s => [s.climb % 1000, 1000], unit: 'm' },
    { id: 'O3',  sym: 'Ω3',  name: 'Omega-3',     desc: 'Every 5 rest-day bonuses',                          n: s => fl(s.rests, 5),      next: s => [s.rests % 5, 5], unit: 'rest days' },
  ];

  function compute(acts, L, params, today = new Date()) {
    const p = { ...S.DEFAULTS, ...params };
    const list = acts.slice().sort((a, b) => a.start.localeCompare(b.start));
    const restDates = L.events.filter(e => e.rest).map(e => e.date).sort();

    const best = {};                // effort key → { t, actId, date, prev }
    let longest = null;             // { km, actId, date, prev }
    const prEvents = [], got = {}, vitaminEvents = [];
    const weekCount = {}, weekZone = {}, weekKm = {};
    const st = { prs: 0, workouts: 0, bestStreak: 0, curStreak: 0, streak4: 0, longestKm: 0, longestBlock: 0, runKm: 0, maxVig: 0,
                 runs10: 0, runsHalf: 0, blocks60: 0, vig30: 0, weeks150: 0, zoneThisWeek: 0, mornings: 0, climb: 0, rests: 0 };

    const streakEnding = wk => { let n = 0, k = wk; while ((weekCount[k] || 0) >= 3){ n++; k = S.addDays(k, -7); } return n; };
    const checkUnlocks = (date, actId) => {
      for (const v of VITAMINS) {
        const list = got[v.id] ||= [];
        for (let n = v.n(st); list.length < n; ) {
          list.push({ date, actId });
          if (p.vitaminPts && !v.noPts) vitaminEvents.push({ date, actId, vitamin: v.id, pts: p.vitaminPts });
        }
      }
    };
    let ri = 0;
    const flushRests = upTo => { while (ri < restDates.length && restDates[ri] <= upTo){ st.rests++; checkUnlocks(restDates[ri], null); ri++; } };

    for (const a of list) {
      flushRests(a.start);
      const r = L.byAct[a.id] || {}, wk = S.weekKey(a.start), km = (a.dist || 0) / 1000;
      const counts = (a.moving || 0) >= p.minWorkoutMin * 60;

      if (counts){
        st.workouts++;
        weekCount[wk] = (weekCount[wk] || 0) + 1;
        if (weekCount[wk] === 3){                       // week just qualified: extend the streak
          const n = streakEnding(wk);
          st.bestStreak = Math.max(st.bestStreak, n);
          if (n % 4 === 0) st.streak4++;
        }
        if (new Date(a.start).getHours() < 7) st.mornings++;
      }
      const before = weekZone[wk] || 0;
      weekZone[wk] = before + (r.zoneMin || 0);
      if (before < 150 && weekZone[wk] >= 150) st.weeks150++;
      if ((r.vigMin || 0) >= 30) st.vig30++;
      st.maxVig = Math.max(st.maxVig, r.vigMin || 0);
      for (const b of r.blocks || []){ st.longestBlock = Math.max(st.longestBlock, b.min); if (b.min >= 60) st.blocks60++; }
      st.climb += a.elev || 0;

      if (RUN.has(a.type)) {
        st.runKm += km;
        weekKm[wk] = (weekKm[wk] || 0) + km;
        // best efforts: a PR bonus only when an existing record is beaten
        for (const [key, label] of EFFORTS) {
          const t = a.be?.[key];
          if (!t) continue;
          const cur = best[key];
          if (!cur || t < cur.t) {
            if (cur && p.prPts) { prEvents.push({ date: a.start, actId: a.id, pts: p.prPts, label: `${label} record`, t, prev: cur.t }); st.prs++; }
            best[key] = { t, actId: a.id, date: a.start, prev: cur?.t ?? null };
          }
        }
        if (km >= 1 && (!longest || km > longest.km + 0.001)) {
          if (longest && p.longestPts) { prEvents.push({ date: a.start, actId: a.id, pts: p.longestPts, label: 'Longest run', km, prevKm: longest.km }); st.prs++; }
          longest = { km, actId: a.id, date: a.start, prev: longest?.km ?? null };
        }
        st.longestKm = Math.max(st.longestKm, km);
        if (km >= 10) st.runs10++;
        if (km >= 21.0975) st.runsHalf++;
      }
      checkUnlocks(a.start, a.id);
    }
    flushRests('9999');
    // state "as of now" for progress toward the next collection
    const nowWk = S.weekKey(today);
    st.curStreak = (weekCount[nowWk] || 0) >= 3 ? streakEnding(nowWk) : streakEnding(S.addDays(nowWk, -7));
    st.zoneThisWeek = weekZone[nowWk] || 0;

    const records = [];
    for (const [key, label] of EFFORTS) if (best[key]) records.push({ key, label, kind: 'time', ...best[key] });
    if (longest) records.push({ key: 'longest', label: 'Longest run', kind: 'km', value: longest.km, actId: longest.actId, date: longest.date, prev: longest.prev });
    const bestWeek = Object.entries(weekKm).sort((a, b) => b[1] - a[1])[0];
    if (bestWeek) records.push({ key: 'week', label: 'Most running in a week', kind: 'km', value: bestWeek[1], date: bestWeek[0] + 'T12:00:00' });
    if (st.bestStreak) records.push({ key: 'streak', label: 'Longest streak', kind: 'weeks', value: st.bestStreak });

    const vitamins = VITAMINS.map(v => {
      const list = got[v.id] || [], nx = v.once && list.length ? null : v.next(st);
      return { id: v.id, sym: v.sym, name: v.name, desc: v.desc, once: !!v.once, unit: v.unit,
               count: list.length, first: list[0] || null, last: list[list.length - 1] || null,
               next: nx ? { value: nx[0], target: nx[1] } : null };
    });
    return { records, prEvents, vitamins, vitaminEvents };
  }

  /* Fold PR and vitamin bonuses into a ledger (mutates and returns it). */
  function mergeIntoLedger(L, R) {
    for (const e of R.prEvents) {
      const r = L.byAct[e.actId];
      if (r){ (r.prs ||= []).push(e); r.total += e.pts; }
      L.events.push(e);
    }
    for (const e of R.vitaminEvents) L.events.push({ date: e.date, actId: e.actId, vitamin: e.vitamin, pts: e.pts });
    for (const e of [...R.prEvents, ...R.vitaminEvents]) {
      const w = L.weeks[S.weekKey(e.date)]; if (w) w.total += e.pts;
      L.total += e.pts;
    }
    L.events.sort((a, b) => b.date.localeCompare(a.date));
    return L;
  }

  const api = { VITAMINS, EFFORTS, compute, mergeIntoLedger };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Records = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
