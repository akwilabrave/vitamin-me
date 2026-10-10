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

  /* The collection. value(st) reads the running state; unlock when value ≥ target. */
  const VITAMINS = [
    { id: 'A',   sym: 'A',   name: 'Vitamin A',   desc: 'Set a new personal record',                 target: 1,    unit: 'record',     v: s => s.prs },
    { id: 'B1',  sym: 'B1',  name: 'Vitamin B1',  desc: 'Complete 10 workouts',                      target: 10,   unit: 'workouts',   v: s => s.workouts },
    { id: 'B6',  sym: 'B6',  name: 'Vitamin B6',  desc: 'Complete 50 workouts',                      target: 50,   unit: 'workouts',   v: s => s.workouts },
    { id: 'B12', sym: 'B12', name: 'Vitamin B12', desc: 'Complete 100 workouts',                     target: 100,  unit: 'workouts',   v: s => s.workouts },
    { id: 'C',   sym: 'C',   name: 'Vitamin C',   desc: 'Hold a 4-week streak of 3+ workouts a week', target: 4,   unit: 'weeks',      v: s => s.bestStreak },
    { id: 'D',   sym: 'D',   name: 'Vitamin D',   desc: 'Run 10 km in one go',                       target: 10,   unit: 'km',         v: s => s.longestKm },
    { id: 'D3',  sym: 'D3',  name: 'Vitamin D3',  desc: 'Run a half marathon (21.1 km)',             target: 21.1, unit: 'km',         v: s => s.longestKm },
    { id: 'E',   sym: 'E',   name: 'Vitamin E',   desc: 'Hold one 60-minute effort block',           target: 60,   unit: 'min',        v: s => s.longestBlock },
    { id: 'K',   sym: 'K',   name: 'Vitamin K',   desc: 'Run 100 km in total',                       target: 100,  unit: 'km',         v: s => s.runKm },
    { id: 'K2',  sym: 'K2',  name: 'Vitamin K2',  desc: 'Run 500 km in total',                       target: 500,  unit: 'km',         v: s => s.runKm },
    { id: 'Fe',  sym: 'Fe',  name: 'Iron',        desc: 'Spend 30 vigorous minutes in one workout',  target: 30,   unit: 'min',        v: s => s.maxVig },
    { id: 'Zn',  sym: 'Zn',  name: 'Zinc',        desc: 'Spend 150 minutes in your effort zone in one week', target: 150, unit: 'min', v: s => s.maxWeekZone },
    { id: 'Mg',  sym: 'Mg',  name: 'Magnesium',   desc: 'Start 10 workouts before 07:00',            target: 10,   unit: 'workouts',   v: s => s.mornings },
    { id: 'Ca',  sym: 'Ca',  name: 'Calcium',     desc: 'Climb 1,000 m in total',                    target: 1000, unit: 'm',          v: s => s.climb },
    { id: 'O3',  sym: 'Ω3',  name: 'Omega-3',     desc: 'Earn 5 rest-day bonuses',                   target: 5,    unit: 'rest days',  v: s => s.rests },
  ];

  function compute(acts, L, params) {
    const p = { ...S.DEFAULTS, ...params };
    const list = acts.slice().sort((a, b) => a.start.localeCompare(b.start));
    const restDates = L.events.filter(e => e.rest).map(e => e.date).sort();

    const best = {};                // effort key → { t, actId, date, prev }
    let longest = null;             // { km, actId, date, prev }
    const prEvents = [], unlocks = {}, vitaminEvents = [];
    const weekCount = {}, weekZone = {}, weekKm = {};
    const st = { prs: 0, workouts: 0, bestStreak: 0, longestKm: 0, longestBlock: 0, runKm: 0, maxVig: 0, maxWeekZone: 0, mornings: 0, climb: 0, rests: 0 };

    const streakEnding = wk => { let n = 0, k = wk; while ((weekCount[k] || 0) >= 3){ n++; k = S.addDays(k, -7); } return n; };
    const checkUnlocks = (date, actId) => {
      for (const v of VITAMINS) if (!unlocks[v.id] && v.v(st) >= v.target - 1e-9) {
        unlocks[v.id] = { date, actId };
        if (p.vitaminPts) vitaminEvents.push({ date, actId, vitamin: v.id, pts: p.vitaminPts });
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
        st.bestStreak = Math.max(st.bestStreak, streakEnding(wk));
        if (new Date(a.start).getHours() < 7) st.mornings++;
      }
      weekZone[wk] = (weekZone[wk] || 0) + (r.zoneMin || 0);
      st.maxWeekZone = Math.max(st.maxWeekZone, weekZone[wk]);
      st.maxVig = Math.max(st.maxVig, r.vigMin || 0);
      for (const b of r.blocks || []) st.longestBlock = Math.max(st.longestBlock, b.min);
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
      }
      checkUnlocks(a.start, a.id);
    }
    flushRests('9999');

    const records = [];
    for (const [key, label] of EFFORTS) if (best[key]) records.push({ key, label, kind: 'time', ...best[key] });
    if (longest) records.push({ key: 'longest', label: 'Longest run', kind: 'km', value: longest.km, actId: longest.actId, date: longest.date, prev: longest.prev });
    const bestWeek = Object.entries(weekKm).sort((a, b) => b[1] - a[1])[0];
    if (bestWeek) records.push({ key: 'week', label: 'Most running in a week', kind: 'km', value: bestWeek[1], date: bestWeek[0] + 'T12:00:00' });
    if (st.bestStreak) records.push({ key: 'streak', label: 'Longest streak', kind: 'weeks', value: st.bestStreak });

    const vitamins = VITAMINS.map(v => ({ id: v.id, sym: v.sym, name: v.name, desc: v.desc, target: v.target, unit: v.unit,
                                         value: Math.min(v.v(st), v.target), unlocked: unlocks[v.id] || null }));
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
