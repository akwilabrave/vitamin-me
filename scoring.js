/* ================================================================
   Vitamin Me — scoring engine (pure functions, no DOM, no storage)
   Loaded in the browser as globalThis.Scoring; also requireable in Node for tests.
   ================================================================ */
(function (root) {
  "use strict";

  /* Every tunable number lives here. The Settings screen is generated from this list. */
  const PARAMS = [
    // key, default, label, unit, group, step
    ['age',          22,  'Age',                               'yrs',  'Heart-rate zones', 1],
    ['restHr',       60,  'Resting heart rate',                'bpm',  'Heart-rate zones', 1],
    ['maxHr',         0,  'Max heart rate (0 = estimate from age)', 'bpm', 'Heart-rate zones', 1],
    ['modPct',       40,  'Effort zone starts at',             '% HRR','Heart-rate zones', 1],
    ['vigPct',       60,  'Vigorous zone starts at',           '% HRR','Heart-rate zones', 1],

    ['blockMin',     10,  'Block length',                      'min',  'Effort points', 1],
    ['blockPts',     10,  'Points per block',                  'pts',  'Effort points', 1],
    ['bonusMin',     30,  'Bonus block length',                'min',  'Effort points', 1],
    ['bonusPts',     25,  'Bonus points',                      'pts',  'Effort points', 1],
    ['vigMult',     1.5,  'Vigorous minutes count as',         '×',    'Effort points', 0.1],
    ['dipSec',       60,  'Allowed dip below zone',            'sec',  'Effort points', 5],
    ['dailyCapMin',  90,  'Daily effort cap',                  'min',  'Effort points', 5],

    ['kmRun',         4,  'Running',                           'pts/km','Distance points', 0.5],
    ['kmWalk',        2,  'Walking and hiking',                'pts/km','Distance points', 0.5],
    ['kmRide',        1,  'Cycling',                           'pts/km','Distance points', 0.5],
    ['kmOther',       2,  'Other',                             'pts/km','Distance points', 0.5],

    ['minWorkoutMin',15,  'Counts as a workout from',          'min',  'Consistency', 1],
    ['wk3Bonus',     15,  '3rd workout of the week',           'pts',  'Consistency', 1],
    ['wk4Bonus',     25,  '4th workout of the week',           'pts',  'Consistency', 1],
    ['streakPct',     5,  'Streak boost per 3-workout week',   '%',    'Consistency', 1],
    ['streakCapPct', 25,  'Maximum streak boost',              '%',    'Consistency', 1],
    ['restBonus',    10,  'Rest day after 3 active days',      'pts',  'Consistency', 1],

    ['prPts',        50,  'New 1 km, 5 km, 10 km or half record', 'pts', 'Records', 5],
    ['longestPts',   30,  'New longest run',                   'pts',  'Records', 5],
  ];
  const DEFAULTS = Object.fromEntries(PARAMS.map(p => [p[0], p[1]]));

  const RUN = new Set(['Run', 'TrailRun', 'VirtualRun']);
  const WALK = new Set(['Walk', 'Hike']);
  const RIDE = new Set(['Ride', 'VirtualRide', 'EBikeRide', 'MountainBikeRide', 'GravelRide']);

  function zones(p) {
    const hrMax = p.maxHr > 0 ? p.maxHr : 208 - 0.7 * p.age;          // Tanaka
    const hrr = hrMax - p.restHr;
    return { hrMax, mod: p.restHr + p.modPct / 100 * hrr, vig: p.restHr + p.vigPct / 100 * hrr };
  }

  /* Continuous effort blocks from an HR stream.
     t: seconds since start, hr: bpm (same length).
     A block runs while HR ≥ effort threshold; a dip below lasting ≤ dipSec does not end it
     (dip time itself earns nothing). Vigorous seconds are weighted by vigMult.
     Returns effective minutes per block, plus raw zone minutes for display. */
  function effortBlocks(t, hr, p) {
    const z = zones(p), blocks = [];
    let inBlock = false, eff = 0, dip = 0, zoneSec = 0, vigSec = 0;
    const close = () => { if (inBlock && eff > 0) blocks.push(eff / 60); inBlock = false; eff = 0; dip = 0; };
    for (let i = 0; i < hr.length; i++) {
      const dt = i + 1 < t.length ? Math.min(Math.max(t[i + 1] - t[i], 0), 15) : 1;   // gaps (auto-pause) capped at 15 s
      const h = hr[i];
      if (h >= z.mod) {
        inBlock = true; dip = 0;
        const vig = h >= z.vig;
        eff += dt * (vig ? p.vigMult : 1);
        zoneSec += dt; if (vig) vigSec += dt;
      } else if (inBlock) {
        dip += dt;
        if (dip > p.dipSec) close();
      }
    }
    close();
    return { blocks, zoneMin: zoneSec / 60, vigMin: vigSec / 60 };
  }

  function blockPoints(effMin, p) {
    return p.blockPts * Math.floor(effMin / p.blockMin + 1e-9) + p.bonusPts * Math.floor(effMin / p.bonusMin + 1e-9);
  }
  function kmRate(type, p) {
    return RUN.has(type) ? p.kmRun : WALK.has(type) ? p.kmWalk : RIDE.has(type) ? p.kmRide : p.kmOther;
  }

  /* Local calendar helpers (dates as 'YYYY-MM-DD' in the phone's timezone) */
  const dayKey = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  function weekKey(d) { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return dayKey(x); }
  function addDays(key, n) { const x = new Date(key + 'T12:00:00'); x.setDate(x.getDate() + n); return dayKey(x); }

  /* Full ledger from all activities.
     acts: [{id, type, start (ISO), dist (m), moving (s)}]
     fx:   {id: effortBlocks result} — missing entry = HR not loaded yet (effort pending)
     today: Date used to decide which days are complete (for rest bonus)
     Returns per-activity breakdowns, weekly summaries, a flat event list and the total. */
  function ledger(acts, fx, params, today = new Date()) {
    const p = { ...DEFAULTS, ...params };
    const list = acts.slice().sort((a, b) => a.start.localeCompare(b.start));
    const byAct = {}, weeks = {}, events = [];
    const capLeft = {};                       // day → effort minutes still allowed
    const activeDays = new Set();

    for (const a of list) {
      const day = dayKey(a.start), wk = weekKey(a.start);
      const w = weeks[wk] ??= { key: wk, n: 0, base: 0, bonus: 0, mult: 1, total: 0, streakIn: 0 };
      const r = { effort: 0, blocks: [], dist: 0, km: (a.dist || 0) / 1000, bonus: 0, bonusLabel: '', pending: !fx[a.id], zoneMin: 0, vigMin: 0 };

      const f = fx[a.id];
      if (f) {
        r.zoneMin = f.zoneMin; r.vigMin = f.vigMin;
        capLeft[day] ??= p.dailyCapMin;
        for (const b of f.blocks) {
          const counted = Math.min(b, capLeft[day]);
          capLeft[day] -= counted;
          const pts = blockPoints(counted, p);
          r.blocks.push({ min: b, counted, pts });
          r.effort += pts;
        }
      }
      r.dist = Math.round(r.km * kmRate(a.type, p));

      if ((a.moving || 0) >= p.minWorkoutMin * 60) {
        w.n++; activeDays.add(day);
        if (w.n === 3 && p.wk3Bonus) { r.bonus = p.wk3Bonus; r.bonusLabel = '3rd workout this week'; }
        if (w.n === 4 && p.wk4Bonus) { r.bonus = p.wk4Bonus; r.bonusLabel = '4th workout this week'; }
      }
      w.base += r.effort + r.dist;
      w.bonus += r.bonus;
      byAct[a.id] = r;
    }

    // Streak multiplier: consecutive previous weeks with ≥3 workouts boost this week's workout points.
    const keys = Object.keys(weeks).sort();
    if (keys.length) {
      let k = keys[0], streak = 0;
      const last = weekKey(today) > keys[keys.length - 1] ? weekKey(today) : keys[keys.length - 1];
      while (k <= last) {
        const w = weeks[k] ??= { key: k, n: 0, base: 0, bonus: 0, mult: 1, total: 0, streakIn: 0 };
        w.streakIn = streak;
        w.mult = 1 + Math.min(p.streakCapPct, streak * p.streakPct) / 100;
        w.total = Math.round(w.base * w.mult) + w.bonus;
        const done = k < weekKey(today);
        streak = w.n >= 3 ? streak + 1 : (done ? 0 : streak);
        k = addDays(k, 7);
      }
    }
    for (const a of list) {
      const r = byAct[a.id], w = weeks[weekKey(a.start)];
      r.mult = w.mult;
      r.total = Math.round((r.effort + r.dist) * w.mult) + r.bonus;
      events.push({ date: a.start, actId: a.id, pts: r.total });
    }

    // Rest-day bonus: a completed day with no workout, after 3 consecutive active days.
    let restTotal = 0;
    if (p.restBonus && list.length) {
      const todayK = dayKey(today);
      for (let d = addDays(dayKey(list[0].start), 3); d < todayK; d = addDays(d, 1)) {
        if (!activeDays.has(d) && activeDays.has(addDays(d, -1)) && activeDays.has(addDays(d, -2)) && activeDays.has(addDays(d, -3))) {
          events.push({ date: d + 'T20:00:00', rest: true, pts: p.restBonus });
          const w = weeks[weekKey(d + 'T12:00:00')]; if (w) { w.bonus += p.restBonus; w.total += p.restBonus; }
          restTotal += p.restBonus;
        }
      }
    }
    events.sort((a, b) => b.date.localeCompare(a.date));
    for (const w of Object.values(weeks)) w.total = 0;                 // weekly totals = exact sum of events
    for (const e of events) { const w = weeks[weekKey(e.date)]; if (w) w.total += e.pts; }
    const total = events.reduce((s, e) => s + e.pts, 0);
    return { byAct, weeks, events, total, zones: zones(p), params: p };
  }

  const api = { PARAMS, DEFAULTS, zones, effortBlocks, blockPoints, ledger, weekKey, dayKey, addDays };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Scoring = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
