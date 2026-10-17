/* ================================================================
   Doppel — levels and leagues (pure functions)
   XP is earned by the scoring ledger (weekly totals). This module replays every
   week of history and applies the league rules, so rank is always derived:

     level cost   XP(L → L+1) = 50 + 5.5 (L−1)^1.75, rounded to 10      (60 levels)
     leagues      12, five levels each (divisions I–V)
     minimum      a completed week below your league's weekly minimum loses that minimum
                  (so steady training settles in the league whose minimum it can hold)
     detraining   a completed week with zero workouts also loses detrainPct % of total XP
     protections  current week never penalised · Couch and Starter never penalised ·
                  first graceWeeks weeks in a newly reached league are upkeep-free ·
                  paused weeks (injury, illness, exams) skip both penalties · floor 0 XP
   Loaded in the browser as globalThis.Leagues; requireable in Node for tests.
   ================================================================ */
(function (root) {
  "use strict";
  const S = root.Scoring || (typeof require !== 'undefined' ? require('./scoring.js') : null);

  const LEAGUES = [
    { name: 'Couch',      blurb: 'Everyone starts here. The first step is the hardest.',    upkeep: 0 },
    { name: 'Starter',    blurb: 'Laces tied, habit forming.',                              upkeep: 0 },
    { name: 'Jogger',     blurb: 'Running regularly, at your own pace.',                    upkeep: 40 },
    { name: 'Strider',    blurb: 'Smooth and steady. Form is arriving.',                    upkeep: 70 },
    { name: 'Pacer',      blurb: 'You know your paces, and you hold them.',                 upkeep: 100 },
    { name: 'Tempo',      blurb: 'Comfortably hard, week after week.',                      upkeep: 140 },
    { name: 'Threshold',  blurb: 'Living right at the edge of your limits.',                upkeep: 190 },
    { name: 'Harrier',    blurb: 'Fast, relentless and built for distance.',                upkeep: 250 },
    { name: 'Marathoner', blurb: '42.2 km is within reach, or already behind you.',         upkeep: 320 },
    { name: 'Ultra',      blurb: 'Beyond the marathon. Few come this far.',                 upkeep: 400 },
    { name: 'Elite',      blurb: 'Training like it is your job.',                           upkeep: 500 },
    { name: 'Legend',     blurb: 'The top. Few reach it, fewer hold it.',                   upkeep: 600 },
  ];
  const PER_LEAGUE = 5, MAX_LEVEL = LEAGUES.length * PER_LEAGUE;   // 60
  const SAFE_LEAGUES = 2;                                           // no penalties below this index

  const levelCost = L => Math.round((50 + 5.5 * Math.pow(L - 1, 1.75)) / 10) * 10;
  const START = [0, 0];                                             // START[L] = XP needed to be at level L
  for (let L = 1; L < MAX_LEVEL; L++) START.push(START[L] + levelCost(L));

  function rankOf(xp){
    let L = 1; while (L < MAX_LEVEL && xp >= START[L + 1]) L++;
    const li = Math.floor((L - 1) / PER_LEAGUE);
    return { level: L, league: li, division: (L - 1) % PER_LEAGUE + 1, xp,
             levelStart: START[L], next: L < MAX_LEVEL ? START[L + 1] : null,
             leagueStart: START[li * PER_LEAGUE + 1], nextLeague: li + 1 < LEAGUES.length ? START[(li + 1) * PER_LEAGUE + 1] : null };
  }
  const roman = n => ['I', 'II', 'III', 'IV', 'V'][n - 1];

  /* weeks: ledger weeks {key: {total, n}}, today: Date, pauses: [weekKey] */
  function replay(weeks, params, today = new Date(), pauses = []){
    const p = { ...S.DEFAULTS, ...params };
    const scale = (p.upkeepPct ?? 100) / 100, dPct = (p.detrainPct ?? 2) / 100, grace = p.graceWeeks ?? 2;
    const paused = new Set(pauses), cur = S.weekKey(today);
    const keys = Object.keys(weeks).sort();
    const out = { xp: 0, timeline: [], events: [], current: null };
    if (!keys.length){ out.rank = rankOf(0); return out; }

    let xp = 0, promoIdx = -99, i = 0;
    for (let k = keys[0]; k <= cur; k = S.addDays(k, 7), i++){
      const w = weeks[k] || { total: 0, n: 0 };
      const before = rankOf(xp);
      xp = Math.max(0, xp + (w.total || 0));
      let after = rankOf(xp);
      if (after.league > before.league) promoIdx = i;      // reaching a league (again) starts its grace period
      const row = { week: k, earned: w.total || 0, workouts: w.n || 0, upkeep: 0, detrain: 0, paused: paused.has(k), grace: false };

      if (k < cur){                                          // completed week: apply league rules
        const li = after.league, need = Math.round(LEAGUES[li].upkeep * scale);
        row.need = need;
        if (li >= SAFE_LEAGUES && !row.paused){
          row.grace = i - promoIdx < grace;
          if (!row.grace && (w.total || 0) < need) row.upkeep = need;      // miss the minimum, lose the minimum
          if (!(w.n > 0)) row.detrain = Math.round(xp * dPct);
          xp = Math.max(0, xp - row.upkeep - row.detrain);
        }
      } else {                                                // current week: status only
        const li = after.league, need = Math.round(LEAGUES[li].upkeep * scale);
        out.current = { week: k, earned: w.total || 0, workouts: w.n || 0, need, safe: li < SAFE_LEAGUES,
                        paused: paused.has(k), grace: i - promoIdx < grace };
      }
      after = rankOf(xp);
      row.xp = xp; row.level = after.level; row.league = after.league;
      if (after.level !== before.level)
        out.events.push({ week: k, from: before.level, to: after.level, fromLeague: before.league, toLeague: after.league,
                          reason: after.level < before.level ? { upkeep: row.upkeep, detrain: row.detrain } : null });
      out.timeline.push(row);
    }
    out.xp = xp; out.rank = rankOf(xp);
    return out;
  }

  const api = { LEAGUES, PER_LEAGUE, MAX_LEVEL, SAFE_LEAGUES, START, levelCost, rankOf, roman, replay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Leagues = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
