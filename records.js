/* ================================================================
   Doppel — personal records, medals and trophies (pure functions)
   Input:  activities (with Strava best efforts), the scoring ledger, params.
   Output: current records, PR bonus events, medals (repeatable, bronze/silver/gold by count),
           trophies (once-off, hard) and a chronological log. Medals and trophies never affect XP. Everything is re-derived from history, so
           editing parameters re-evaluates records and unlocks consistently.
   Loaded in the browser as globalThis.Records; requireable in Node for tests.
   ================================================================ */
(function (root) {
  "use strict";
  const S = root.Scoring || (typeof require !== 'undefined' ? require('./scoring.js') : null);

  const RUN = new Set(['Run', 'TrailRun', 'VirtualRun']);
  /* Strava best-effort names we track → display label */
  const EFFORTS = [['1k', '1 km'], ['5k', '5 km'], ['10k', '10 km'], ['Half-Marathon', 'Half marathon']];

  /* ---- line icons (24-unit, drawn by art.js) ---- */
  const I = {
    up:      'M3 17l6-6 4 4 8-8M15 7h6v6',
    compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z',
    ghost:   'M6 20V10a6 6 0 0 1 12 0v10l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5zM10 10v1M14 10v1',
    flame:   'M12 21c-3.6 0-6-2.4-6-5.6 0-3 2-4.6 3-6.8.4 1.6 1 2.6 2 3 0-3.2 1.4-5.6 3.6-7.6-.2 2.8.8 4.4 2 6 1 1.4 1.4 2.8 1.4 4.4 0 3.2-2.4 5.6-6 5.6z',
    clock:   'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    pulse:   'M20.8 8.6a5 5 0 0 0-8.8-3.2 5 5 0 0 0-8.8 3.2c0 5.4 8.8 11 8.8 11s8.8-5.6 8.8-11zM6 11h3l1.5-2.5 2.5 5 1.5-2.5H18',
    gauge:   'M4 17a8 8 0 1 1 16 0M12 17l4-5M7.5 12.5l1 .8M12 9v1.2M16.5 12.5l-1 .8',
    sunrise: 'M3 18h18M7 18a5 5 0 0 1 10 0M12 6v3M5.6 10.6l1.6 1.4M18.4 10.6 16.8 12M2 14h2M20 14h2',
    mountain:'M2 20 9 8l4 6 3-4 6 10z',
    moon:    'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
    chevrons:'M5 5l7 7-7 7M12 5l7 7-7 7',
    calendar:'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h3v3H8z',
  };

  /* MEDALS: repeatable. n(st) = how many earned so far; next(st) = [value, target] toward the next one
     (null for event medals). tiers = counts at which the medal turns bronze, silver, gold. */
  const fl = (x, k) => Math.floor(x / k + 1e-9);
  const MEDALS = [
    { id: 'pr',       color: '#df4985', icon: I.up,       name: 'Record Breaker', desc: 'Every new personal record',                       tiers: [1, 10, 25], n: s => s.prs,              next: () => null, unit: '' },
    { id: 'overtake', color: '#7f93ab', icon: I.ghost,    name: 'Overtaker',      desc: 'Every time you beat Doppel on a repeated route', tiers: [1, 10, 25], n: s => s.ghostWins,        next: () => null, unit: '' },
    { id: 'tenk',     color: '#f3bf16', text: '10K',      name: 'Ten K',          desc: 'Every run of 10 km or more',                      tiers: [1, 10, 25], n: s => s.runs10,           next: s => s.runs10 ? null : [s.longestKm, 10], unit: 'km' },
    { id: 'half',     color: '#b5cc24', text: '21.1',     name: 'Half Marathon',  desc: 'Every half marathon (21.1 km)',                   tiers: [1, 5, 12],  n: s => s.runsHalf,         next: s => s.runsHalf ? null : [s.longestKm, 21.1], unit: 'km' },
    { id: 'century',  color: '#39ac43', text: '100',      name: 'Century',        desc: 'Every 100 km of running',                         tiers: [1, 5, 10],  n: s => fl(s.runKm, 100),   next: s => [s.runKm % 100, 100], unit: 'km' },
    { id: 'tenner',   color: '#8e62da', text: '10',       name: 'Ten Pack',       desc: 'Every 10 workouts',                               tiers: [1, 5, 10],  n: s => fl(s.workouts, 10), next: s => [s.workouts % 10, 10], unit: 'workouts' },
    { id: 'streak',   color: '#ee7f2b', icon: I.flame,    name: 'Streak Keeper',  desc: 'Every 4 weeks of streak (3+ workouts a week)',    tiers: [1, 3, 6],   n: s => s.streak4,          next: s => [s.curStreak % 4, 4], unit: 'weeks' },
    { id: 'hour',     color: '#6dba36', icon: I.clock,    name: 'Hour of Power',  desc: 'Every 60-minute effort block',                    tiers: [1, 10, 25], n: s => s.blocks60,         next: s => s.blocks60 ? null : [s.longestBlock, 60], unit: 'min' },
    { id: 'redzone',  color: '#e03e3e', icon: I.pulse,    name: 'Red Zone',       desc: 'Every workout with 30+ vigorous minutes',         tiers: [1, 10, 30], n: s => s.vig30,            next: s => s.vig30 ? null : [s.maxVig, 30], unit: 'min' },
    { id: 'engine',   color: '#6266da', icon: I.gauge,    name: 'Engine Week',    desc: 'Every week with 150+ minutes in your effort zone',tiers: [1, 8, 20],  n: s => s.weeks150,         next: s => s.zoneThisWeek >= 150 ? null : [s.zoneThisWeek, 150], unit: 'min this week' },
    { id: 'explorer', color: '#b5835a', icon: I.compass,  name: 'Explorer',       desc: 'Every 100 new territory tiles',                   tiers: [1, 5, 15],  n: s => fl(s.tiles, 100),   next: s => [s.tiles % 100, 100], unit: 'tiles' },
    { id: 'climber',  color: '#25a5d0', icon: I.mountain, name: 'Climber',        desc: 'Every 1,000 m climbed',                           tiers: [1, 5, 15],  n: s => fl(s.climb, 1000),  next: s => [s.climb % 1000, 1000], unit: 'm' },
    { id: 'early',    color: '#29a393', icon: I.sunrise,  name: 'Early Bird',     desc: 'Every 10 workouts started before 07:00',          tiers: [1, 5, 10],  n: s => fl(s.mornings, 10), next: s => [s.mornings % 10, 10], unit: 'early workouts' },
    { id: 'rest',     color: '#3b81e3', icon: I.moon,     name: 'Recovery',       desc: 'Every 5 rest-day bonuses',                        tiers: [1, 5, 12],  n: s => fl(s.rests, 5),     next: s => [s.rests % 5, 5], unit: 'rest days' },
  ];
  const tierOf = (m, n) => n >= m.tiers[2] ? 3 : n >= m.tiers[1] ? 2 : n >= m.tiers[0] ? 1 : 0;

  /* TROPHIES: once-off and hard. prog(st) = [value, target]; earned when value ≥ target. */
  const TROPHIES = [
    { id: 'marathon',  color: '#d6334f', text: '42.2',     name: 'Marathon',        desc: 'Run 42.2 km in one go',                                     prog: s => [s.longestKm, 42.195], unit: 'km' },
    { id: 'thenyou',   color: '#8a4ff0', icon: I.chevrons, name: 'Faster Than Then', desc: 'Run 5 km at least 10% faster than your first 5 km on record', prog: s => [s.fiveKGain, 10], unit: '% faster' },
    { id: 'thousand',  color: '#e2a21c', text: '1000',     name: 'Thousand Club',   desc: 'Run 1,000 km in total',                                     prog: s => [s.runKm, 1000], unit: 'km' },
    { id: 'unbroken',  color: '#ff6b2e', icon: I.flame,    name: 'Unbroken',        desc: 'Hold your streak for 26 weeks in a row',                    prog: s => [s.bestStreak, 26], unit: 'weeks' },
    { id: 'hunter',    color: '#7f93ab', icon: I.ghost,    name: 'Ghost Hunter',    desc: 'Beat Doppel on 10 different routes',                      prog: s => [s.routesBeaten, 10], unit: 'routes' },
    { id: 'bigweek',   color: '#2f9e64', icon: I.calendar, name: 'Big Week',        desc: 'Run 75 km in a single week',                                prog: s => [s.bestWeekKm, 75], unit: 'km' },
    { id: 'everest',   color: '#25a5d0', icon: I.mountain, name: 'Everest',         desc: 'Climb 8,849 m in total, the height of Everest',             prog: s => [s.climb, 8849], unit: 'm' },
    { id: 'carto',     color: '#b5835a', icon: I.compass,  name: 'Cartographer',    desc: 'Explore 2,500 territory tiles',                             prog: s => [s.tiles, 2500], unit: 'tiles' },
    { id: 'dawn',      color: '#f3bf16', icon: I.sunrise,  name: 'Dawn Patrol',     desc: 'Start 50 workouts before 07:00',                            prog: s => [s.mornings, 50], unit: 'early workouts' },
    { id: 'hours',     color: '#3d73e0', icon: I.pulse,    name: 'Hundred Hours',   desc: 'Spend 100 hours in your effort zone',                       prog: s => [s.zoneTotal / 60, 100], unit: 'hours' },
  ];

  function compute(acts, L, params, today = new Date()) {
    const p = { ...S.DEFAULTS, ...params };
    const list = acts.slice().sort((a, b) => a.start.localeCompare(b.start));
    const restDates = L.events.filter(e => e.rest).map(e => e.date).sort();

    const best = {};                // effort key → { t, actId, date, prev }
    let longest = null;             // { km, actId, date, prev }
    const prEvents = [], got = {}, won = {}, log = [];
    const weekCount = {}, weekZone = {}, weekKm = {};
    const st = { prs: 0, workouts: 0, bestStreak: 0, curStreak: 0, streak4: 0, longestKm: 0, longestBlock: 0, runKm: 0, maxVig: 0,
                 runs10: 0, runsHalf: 0, blocks60: 0, vig30: 0, weeks150: 0, zoneThisWeek: 0, mornings: 0, climb: 0, rests: 0, tiles: 0, ghostWins: 0,
                 zoneTotal: 0, bestWeekKm: 0, routesBeaten: 0, fiveKGain: 0 };
    const routeOf = {}, beatRoutes = new Set();
    let firstFive = null;

    const streakEnding = wk => { let n = 0, k = wk; while ((weekCount[k] || 0) >= 3){ n++; k = S.addDays(k, -7); } return n; };
    const checkUnlocks = (date, actId) => {
      for (const m of MEDALS) {
        const list = got[m.id] ||= [];
        for (let n = m.n(st); list.length < n; ) {
          list.push({ date, actId });
          log.push({ kind: 'medal', id: m.id, n: list.length, tier: tierOf(m, list.length), date, actId });   // chronological log
        }
      }
      for (const t of TROPHIES) {
        if (won[t.id]) continue;
        const [v, target] = t.prog(st);
        if (v >= target - 1e-9){ won[t.id] = { date, actId }; log.push({ kind: 'trophy', id: t.id, n: 1, date, actId }); }
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
      st.zoneTotal += r.zoneMin || 0;
      st.climb += a.elev || 0;
      st.tiles += L.terr?.byAct[a.id]?.fresh.length || 0;
      const gh = L.ghost?.byAct[a.id];
      if (gh){                                            // a route is identified by its first run
        const oldest = gh.matches[gh.matches.length - 1].id;
        routeOf[a.id] = routeOf[oldest] || oldest;
        if (gh.beatPrev){ st.ghostWins++; beatRoutes.add(routeOf[a.id]); st.routesBeaten = beatRoutes.size; }
      }

      if (RUN.has(a.type)) {
        st.runKm += km;
        weekKm[wk] = (weekKm[wk] || 0) + km;
        st.bestWeekKm = Math.max(st.bestWeekKm, weekKm[wk]);
        const t5 = a.be?.['5k'];
        if (t5){ if (firstFive == null) firstFive = t5; else st.fiveKGain = Math.max(st.fiveKGain, (firstFive - t5) / firstFive * 100); }
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

    const medals = MEDALS.map(m => {
      const list = got[m.id] || [], nx = m.next(st), count = list.length, tier = tierOf(m, count);
      return { id: m.id, name: m.name, desc: m.desc, color: m.color, icon: m.icon, text: m.text, unit: m.unit, tiers: m.tiers,
               count, tier, toNextTier: tier < 3 ? m.tiers[tier] - count : 0,
               first: list[0] || null, last: list[list.length - 1] || null, next: nx ? { value: nx[0], target: nx[1] } : null };
    });
    const trophies = TROPHIES.map(t => {
      const [v, target] = t.prog(st);
      return { id: t.id, name: t.name, desc: t.desc, color: t.color, icon: t.icon, text: t.text, unit: t.unit,
               won: won[t.id] || null, value: Math.min(v, target), target };
    });
    return { records, prEvents, medals, trophies, log };
  }

  /* Fold record bonuses into a ledger (mutates and returns it). Medals and trophies never score. */
  function mergeIntoLedger(L, R) {
    for (const e of R.prEvents) {
      const r = L.byAct[e.actId];
      if (r){ (r.prs ||= []).push(e); r.total += e.pts; }
      L.events.push(e);
      const w = L.weeks[S.weekKey(e.date)]; if (w) w.total += e.pts;
      L.total += e.pts;
    }
    L.events.sort((a, b) => b.date.localeCompare(a.date));
    return L;
  }

  const api = { MEDALS, TROPHIES, EFFORTS, tierOf, compute, mergeIntoLedger };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Records = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
