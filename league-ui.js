"use strict";
/* ================================================================
   Vitamin Me — XP, streak and league UI
   · xpIcon / streakIcon: inline icons used across the app
   · badgeSvg(league): 12 procedurally drawn badges that grow grander per league
   · rank hero (home), League page (#/league), pause weeks, rank celebrations
   Loaded before app.js; uses its globals (getLedger, store, cfg, setCfg, K, $, nf, esc, route, toast) at call time.
   ================================================================ */

/* ---------- icons ---------- */
let _uid = 0; const uid_ = p => `${p}${++_uid}`;
function xpIcon(size = 18){
  return `<svg class="ico xp" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 1.8 21 7v10l-9 5.2L3 17V7z" fill="#f5b400" stroke="#c98a00" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M13.4 5.5 8.2 13h3.6l-1.2 5.5 5.2-7.6h-3.6z" fill="#fff"/></svg>`;
}
function streakIcon(size = 18, lit = true){
  const g = uid_('fl');
  return `<svg class="ico streak" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
    <defs><linearGradient id="${g}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${lit ? '#ff4d2e' : '#7c8794'}"/><stop offset="1" stop-color="${lit ? '#ffb23b' : '#a9b3bd'}"/></linearGradient></defs>
    <path d="M12 22c-4.6 0-7.6-3-7.6-7 0-3.6 2.4-5.8 3.8-8.6.4 2 1.3 3.2 2.5 3.8C10.8 6.6 12.4 3.6 15 2c-.4 3.4 1 5.4 2.6 7.5 1.2 1.6 2 3.3 2 5.5 0 4-3 7-7.6 7z" fill="url(#${g})"/>
    <path d="M5.5 15h3l1.4-3 2.2 6 1.6-4.2 1 1.2h3.8" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/* ---------- badges ----------
   One family: every league uses the same shield, so badges read as ranks of one system.
   Grandeur builds gradually and cumulatively:
     metal colour (grey → bronze → silver → gold → platinum → prismatic) · bevel (1+) ·
     chevron (2+) · top gem (3+) · wings growing 2→4 feathers (4+) · laurels (7+) ·
     crown (9+) · glow (10+) · rays and shimmer (11) */
const METALS = ['#8d97a3', '#a97c50', '#c8763a', '#aab6c2', '#2f9e64', '#1fa2b3', '#3d73e0', '#8a4ff0', '#d6334f', '#e2a21c', '#d6e1ef', 'prism'];
const mixHex = (a, b, t) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const lum = h => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; };

const SHIELD = 'M60 22 92 32V58c0 22-14 36-32 44C42 94 28 80 28 58V32Z';
const SHIELD_IN = 'M60 29 86 37V58c0 18-11 30-26 37C45 88 34 76 34 58V37Z';
const EMBLEMS = [
  'M5 13v-2.5A2.5 2.5 0 0 1 7.5 8h9a2.5 2.5 0 0 1 2.5 2.5V13M3 13.5a2 2 0 0 1 4 0V15h10v-1.5a2 2 0 0 1 4 0V18H3zM5 18v2M19 18v2',  // Couch
  'M12 13c-3-4-8-4-8-1s5 3 8 1zm0 0c3-4 8-4 8-1s-5 3-8 1zM12 13l-3 7M12 13l3 7',                                                  // Starter: laces
  'M7 2.5c1.6 0 2.6 1.9 2.6 4.4 0 2.1-.8 3.6-2.3 3.6S4.6 9 4.6 6.9C4.6 4.3 5.5 2.5 7 2.5zM5.4 13.6a1.7 1.7 0 1 0 3.4 0 1.7 1.7 0 0 0-3.4 0zM16.6 8c1.6 0 2.6 1.9 2.6 4.4 0 2.1-.8 3.6-2.3 3.6s-2.7-1.5-2.7-3.6c0-2.6.9-4.4 2.4-4.4zM15 19.1a1.7 1.7 0 1 0 3.4 0 1.7 1.7 0 0 0-3.4 0z', // Jogger
  'M5 5l7 7-7 7M12 5l7 7-7 7',                                                                                                       // Strider
  'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 14V10M12 14l3 2M10 2h4M12 2v4',                                                          // Pacer: stopwatch
  'M8 21.5h8L13.6 3h-3.2zM12 16l4.5-8.5M9.2 12h5.6',                                                                                 // Tempo: metronome
  'M12 2.5c4 5 7 9 7 12.5a7 7 0 0 1-14 0c0-3.5 3-7.5 7-12.5zM9 15a3 3 0 0 0 3 3',                                                   // Threshold: drop
  'M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7',                                                                             // Harrier: wind
  null,                                                                                                                              // Marathoner: text
  'M2 20 9 8l4 6 3-4 6 10zM16 2v5M13.5 4.5 16 2l2.5 2.5',                                                                           // Ultra: mountain
  'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z',                                                    // Elite: star
  'M8.5 10.5h7l-2 11h-3zM12 1.8c2.4 2.4 3.6 4.3 3.6 6a3.6 3.6 0 0 1-7.2 0c0-1.7 1.2-3.6 3.6-6zM12 5.5c.9 1 1.3 1.7 1.3 2.3a1.3 1.3 0 0 1-2.6 0c0-.6.4-1.3 1.3-2.3z', // Legend: torch
];
const EMBLEM_TEXT = { 8: '42.2' };

function badgeSvg(li, opt = {}){
  const size = opt.size || 96, id = uid_('b'), t = li, locked = !!opt.locked;
  const prism = METALS[t] === 'prism', base = prism ? '#c9a8ff' : METALS[t];
  const light = prism ? '#ffe7a3' : mixHex(base, '#ffffff', .4), dark = prism ? '#5b3fd6' : mixHex(base, '#000000', .38);
  const ink = locked ? 'var(--muted)' : (prism ? '#fff' : (lum(base) > .62 ? '#25303c' : '#ffffff'));
  const fill = locked ? 'var(--line)' : `url(#${id}m)`, rim = locked ? 'var(--muted)' : dark, soft = locked ? 'var(--line)' : light;
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let defs = `<linearGradient id="${id}m" x1="0" y1="0" x2="0.35" y2="1">` +
    (prism ? `<stop offset="0" stop-color="#ffd36a"/><stop offset=".35" stop-color="#ff7ad9"/><stop offset=".7" stop-color="#7a8cff"/><stop offset="1" stop-color="#55e6ff"/>`
           : `<stop offset="0" stop-color="${light}"/><stop offset=".55" stop-color="${base}"/><stop offset="1" stop-color="${dark}"/>`) + `</linearGradient>
    <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="${id}c"><path d="${SHIELD}"/></clipPath>`;
  let back = '', front = '';

  if (t >= 11 && !locked){       // rays
    let r = ''; for (let i = 0; i < 16; i++){ const a = i * Math.PI / 8, b = a + .1;
      r += `M60 60L${(60 + 56 * Math.cos(a)).toFixed(1)} ${(60 + 56 * Math.sin(a)).toFixed(1)}L${(60 + 56 * Math.cos(b)).toFixed(1)} ${(60 + 56 * Math.sin(b)).toFixed(1)}Z`; }
    back += `<g opacity=".35"><path d="${r}" fill="#ffd36a">${reduce ? '' : '<animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="30s" repeatCount="indefinite"/>'}</path></g>`;
  }
  if (t >= 7){                   // laurels
    let leaves = `<path d="M${(60 + 44 * Math.cos(1.75)).toFixed(1)} ${(64 + 44 * Math.sin(1.75)).toFixed(1)}A44 44 0 0 1 ${(60 + 44 * Math.cos(3.35)).toFixed(1)} ${(64 + 44 * Math.sin(3.35)).toFixed(1)}" fill="none" stroke-width="2"/>`;
    const n = t >= 9 ? 7 : 5;
    for (let i = 0; i < n; i++){ const th = 1.8 + i * (1.5 / n), x = 60 + 44 * Math.cos(th), y = 64 + 44 * Math.sin(th), deg = th * 180 / Math.PI + 118;
      leaves += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="7" ry="3" transform="rotate(${deg.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`; }
    const col = locked ? 'var(--line)' : (t >= 9 ? '#e9c25a' : '#7fb069');
    back += `<g fill="${col}" stroke="${locked ? 'none' : mixHex(t >= 9 ? '#e9c25a' : '#7fb069', '#000000', .3)}" stroke-width=".8">${leaves}<g transform="translate(120 0) scale(-1 1)">${leaves}</g></g>`;
  }
  if (t >= 4){                   // wings, growing with rank
    const n = t >= 8 ? 4 : t >= 6 ? 3 : 2, reach = t >= 8 ? 30 : t >= 6 ? 26 : 22;
    let f = ''; for (let i = 0; i < n; i++){ const y = 40 + i * 9, len = reach - i * 5;
      f += `<path d="M30 ${y + 6}C${30 - len * .6} ${y - 2} ${30 - len} ${y + 2} ${30 - len} ${y + 6}C${30 - len * .7} ${y + 10} ${30 - len * .3} ${y + 12} 30 ${y + 12}Z"/>`; }
    back += `<g fill="${locked ? 'var(--line)' : (prism ? '#fff6e0' : light)}" stroke="${locked ? 'none' : dark}" stroke-width="1.2" stroke-linejoin="round">${f}<g transform="translate(120 0) scale(-1 1)">${f}</g></g>`;
  }
  if (t >= 9) back += `<path d="M40 27 45 12 52 21 60 8 68 21 75 12 80 27Z" fill="${fill}" stroke="${rim}" stroke-width="2" stroke-linejoin="round"/>` +
    (locked ? '' : `<circle cx="60" cy="13" r="2.6" fill="#fff"/>`);

  // the shield, identical for every league
  let plate = `<path d="${SHIELD}" fill="${fill}" stroke="${rim}" stroke-width="${3 + Math.min(t, 8) * 0.2}" stroke-linejoin="round"/>`;
  if (t >= 1) plate += `<path d="${SHIELD_IN}" fill="none" stroke="${locked ? 'var(--muted)' : '#fff'}" stroke-opacity="${locked ? .4 : .3}" stroke-width="1.5"/>`;
  if (t >= 2) plate += `<path d="M36 74 60 85 84 74" fill="none" stroke="${soft}" stroke-width="3" stroke-linecap="round" opacity=".75"/>`;

  let emblem;
  if (locked) emblem = `<text x="60" y="69" text-anchor="middle" font-size="32" font-weight="800" fill="${ink}" font-family="ui-rounded,system-ui,sans-serif">?</text>`;
  else if (EMBLEM_TEXT[t]) emblem = `<text x="60" y="66" text-anchor="middle" font-size="19" font-weight="800" fill="${ink}" font-family="ui-rounded,system-ui,sans-serif">${EMBLEM_TEXT[t]}</text>`;
  else emblem = `<g transform="translate(${60 - 12 * 1.35} ${55 - 12 * 1.35}) scale(1.35)" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${(EMBLEMS[t] || '').split(/(?=M)/).map(d => `<path d="${d}"/>`).join('')}</g>`;

  if (t >= 3 && !locked) front += `<path d="M60 18 64.5 24 60 30 55.5 24Z" fill="#fff" stroke="${dark}" stroke-width="1.2"/>`;
  if (t >= 10 && !locked && !reduce) front += `<rect x="-60" y="0" width="40" height="120" fill="url(#${id}g)" clip-path="url(#${id}c)" transform="skewX(-20)" opacity=".8">
      <animate attributeName="x" values="-60;160" dur="${prism ? 2.6 : 3.4}s" repeatCount="indefinite"/></rect>`;
  const glow = (t >= 10 && !locked) ? `filter:drop-shadow(0 0 ${prism ? 10 : 6}px ${prism ? '#ff9ae6' : mixHex(base, '#ffffff', .2)}88)` : '';
  return `<svg class="lbadge" width="${size}" height="${size}" viewBox="0 0 120 120" style="${glow}" role="img" aria-label="${locked ? 'Locked league' : esc(Leagues.LEAGUES[t].name) + ' badge'}">
    <defs>${defs}</defs>${back}${plate}${emblem}${front}</svg>`;
}

/* ---------- state helpers ---------- */
const LG = () => getLedger().lg;
const rankName = r => `${Leagues.LEAGUES[r.league].name} ${Leagues.roman(r.division)}`;
function streakInfo(){
  const L = getLedger(), wk = L.weeks[Scoring.weekKey(new Date())] || { n: 0, streakIn: 0, mult: 1 };
  const secured = (wk.n || 0) >= 3, weeks = (wk.streakIn || 0) + (secured ? 1 : 0);
  return { weeks, secured, n: wk.n || 0, boost: Math.round(((wk.mult || 1) - 1) * 100) };
}
function minimumText(c){
  if (!c) return '';
  if (c.safe) return 'No weekly minimum in this league';
  if (c.paused) return 'Paused week: no minimum';
  if (c.grace) return 'Grace week: no minimum in a new league';
  return c.earned >= c.need ? `Weekly minimum of ${nf(c.need)} XP met` : `${nf(c.need - c.earned)} XP to hold your league this week`;
}
const daysLeft = () => { const d = new Date().getDay(); return d === 0 ? 1 : 8 - d; };   // days until Sunday ends, today included

/* ---------- home hero ---------- */
function rankHeroHtml(){
  const G = LG(); if (!G) return '';
  const r = G.rank, pct = r.next ? (r.xp - r.levelStart) / (r.next - r.levelStart) * 100 : 100, s = streakInfo(), c = G.current;
  const wkXp = getLedger().weeks[Scoring.weekKey(new Date())]?.total || 0;
  return `<div class="rankhero">
      <a class="rbadge" href="#/league" aria-label="Your league">${badgeSvg(r.league, { size: 84 })}</a>
      <a class="rinfo" href="#/league">
        <div class="rname">${esc(rankName(r))}</div><div class="rlvl">Level ${r.level}${r.level === Leagues.MAX_LEVEL ? ', the top' : ''}</div>
        <div class="xpbar"><i style="width:${pct.toFixed(1)}%"></i></div>
        <div class="xpnums">${xpIcon(15)}<b>${nf(r.xp)}</b>${r.next ? ` / ${nf(r.next)} XP` : ' XP'}</div></a>
      ${jarButtonHtml()}
    </div>
    <div class="statrow">
      <div class="stat ${s.secured ? '' : 'dim'}" title="Weeks in a row with 3+ workouts">
        <div class="sv">${streakIcon(22, s.weeks > 0)}<b>${s.weeks}</b><span>week${s.weeks === 1 ? '' : 's'}</span>${s.boost ? `<em>+${s.boost}% XP</em>` : ''}</div>
        <div class="dots" aria-label="${Math.min(s.n, 3)} of 3 workouts this week">${[0, 1, 2].map(i => `<i class="${i < s.n ? 'on' : ''}"></i>`).join('')}
          <small>${s.secured ? 'Streak safe this week' : `${s.n}/3 this week`}</small></div>
      </div>
      <div class="stat">
        <div class="sv"><b>+${nf(wkXp)}</b>${xpIcon(22)}</div>
        <small>XP this week</small>
      </div>
    </div>
    ${c && !c.safe ? `<div class="minline ${c.earned >= c.need || c.paused || c.grace ? 'ok' : ''}">${minimumText(c)}${!(c.earned >= c.need || c.paused || c.grace) ? `, ${daysLeft()} day${daysLeft() > 1 ? 's' : ''} left` : ''}</div>` : ''}`;
}

/* ---------- League page ---------- */
function viewLeague(){
  const G = LG(); if (!G || !Object.keys(store.get(K.acts, {})).length)
    return `<h1 class="brand">League</h1><div class="empty">Sync your workouts first. Your league is worked out from your training history.</div>`;
  const r = G.rank, LGS = Leagues.LEAGUES, p = getLedger().params, c = G.current;
  const pct = r.next ? (r.xp - r.levelStart) / (r.next - r.levelStart) * 100 : 100;
  let html = `<h1 class="brand">League</h1>
    <div class="lghero">${badgeSvg(r.league, { size: 168 })}
      <div class="lgname">${esc(LGS[r.league].name)}</div>
      <div class="lgsub">Division ${Leagues.roman(r.division)}, level ${r.level} of ${Leagues.MAX_LEVEL}</div>
      <div class="lgblurb">${esc(LGS[r.league].blurb)}</div>
      <div class="xpbar big"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="xpnums">${xpIcon(16)}<b>${nf(r.xp)}</b> XP${r.next ? `<span>${nf(r.next - r.xp)} to level ${r.level + 1}</span>` : '<span>Maximum level</span>'}</div>
    </div>`;

  // this week
  if (c){
    const met = c.earned >= c.need, free = c.safe || c.paused || c.grace;
    html += `<h2>This week</h2><div class="card">
      <div class="wkrow"><span>${xpIcon(18)}<b>${nf(c.earned)}</b> XP earned</span><span class="muted">${daysLeft()} day${daysLeft() > 1 ? 's' : ''} left</span></div>
      ${!free ? `<div class="minbar"><i style="width:${Math.min(100, c.earned / Math.max(1, c.need) * 100).toFixed(0)}%" class="${met ? 'ok' : ''}"></i><span style="left:100%"></span></div>` : ''}
      <div class="muted">${minimumText(c)}.${!free && !met ? ` Miss it and you lose ${nf(c.need)} XP on Monday.` : ''}${!free && c.workouts === 0 ? ` A week with no workouts also costs ${p.detrainPct}% of your XP.` : ''}</div>
    </div>`;
  }

  // next league
  if (r.league + 1 < LGS.length){
    const n = r.league + 1, need = Leagues.START[n * Leagues.PER_LEAGUE + 1];
    html += `<h2>Next league</h2><div class="card nextlg">${badgeSvg(n, { size: 64 })}
      <div><div class="t">${esc(LGS[n].name)}</div><div class="muted">${esc(LGS[n].blurb)}</div>
      <div class="muted">Level ${n * Leagues.PER_LEAGUE + 1}, ${nf(need - r.xp)} XP away. Weekly minimum there: ${nf(Math.round(LGS[n].upkeep * (p.upkeepPct / 100)))} XP.</div></div></div>`;
  }

  // ladder
  const hidden = LGS.length - (r.league + 2);
  html += `<h2>The ladder</h2><div class="ladder">` + (hidden > 0 ? `<div class="rung locked">${badgeSvg(LGS.length - 1, { size: 44, locked: true })}
      <div><div class="t">${hidden} more league${hidden > 1 ? 's' : ''} to discover</div><div class="muted">Levels ${(r.league + 2) * 5 + 1}–${Leagues.MAX_LEVEL}. Each one is revealed when it's next.</div></div></div>` : '') +
    LGS.map((lg, i) => i).filter(i => i <= r.league + 1).reverse().map(i => {
    const known = true, here = i === r.league;
    return `<div class="rung ${here ? 'here' : ''} ${known ? '' : 'locked'}">${badgeSvg(i, { size: 44, locked: !known })}
      <div><div class="t">${known ? esc(LGS[i].name) : '???'}</div><div class="muted">Levels ${i * 5 + 1}–${i * 5 + 5}${known ? `, from ${nf(Leagues.START[i * 5 + 1])} XP` : ''}</div></div>
      ${here ? '<span class="chip">You</span>' : ''}</div>`;
  }).join('') + `</div>`;

  // history
  html += `<h2>XP over time</h2>${xpChart(G)}`;
  const recent = G.timeline.filter(w => w.week < Scoring.weekKey(new Date())).slice(-8).reverse();
  if (recent.length) html += `<div class="weeks">` + recent.map(w => {
    const ch = [`<span class="pos">+${nf(w.earned)}</span>`];
    if (w.upkeep) ch.push(`<span class="neg">−${nf(w.upkeep)} missed minimum</span>`);
    if (w.detrain) ch.push(`<span class="neg">−${nf(w.detrain)} detraining</span>`);
    if (w.paused) ch.push('<span class="tag">paused</span>'); else if (w.grace) ch.push('<span class="tag">grace</span>');
    return `<div class="wkhist"><span>${new Date(w.week + 'T12:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</span><span>${ch.join('')}</span><span class="muted">L${w.level}</span></div>`;
  }).join('') + `</div>`;

  // pauses
  const year = new Date().getFullYear(), pauses = cfg().pauses || [], used = pauses.filter(k => k.startsWith(String(year))).length;
  const cur = Scoring.weekKey(new Date()), prev = Scoring.addDays(cur, -7);
  const btn = (k, label) => pauses.includes(k)
    ? `<button class="btn" data-unpause="${k}">Unpause ${label}</button>`
    : `<button class="btn" data-pause="${k}" ${used >= p.pauseWeeks ? 'disabled' : ''}>Pause ${label}</button>`;
  html += `<h2>Pause weeks</h2><p class="hint">Injured, ill or writing exams? A paused week has no minimum and no detraining. You have ${Math.max(0, p.pauseWeeks - used)} of ${p.pauseWeeks} left this year. You can pause this week or last week.</p>
    ${btn(cur, 'this week')}${btn(prev, 'last week')}`;

  html += `<details class="how"><summary>How leagues work</summary>
    <p>Every workout earns XP. Each level costs more XP than the last, and every five levels is a new league: ${LGS.length} leagues, ${Leagues.MAX_LEVEL} levels.</p>
    <p>From Fartlek up, each league has a <b>weekly minimum</b>. Finish a week (Monday to Sunday) below it and you lose that minimum. A week with <b>no workouts at all</b> also costs ${p.detrainPct}% of your XP, the way fitness fades. Lose enough and you drop a level, and eventually a league.</p>
    <p>Protections: this week is never penalised until it's over; Lace-Up and Shuffler have no penalties; your first ${p.graceWeeks} weeks in a newly reached league are minimum-free; and up to ${p.pauseWeeks} weeks a year can be paused.</p>
    <p>Steady training settles you in the league whose minimum it can hold, so climbing means training more, not just training longer.</p></details>${poweredByStrava()}`;
  return html;
}

function xpChart(G){
  const T = G.timeline.slice(-52); if (T.length < 2) return '<p class="hint">Your XP history appears after a couple of weeks.</p>';
  const W = 600, H = 190, Lp = 46, R = 8, Tp = 10, B = 22, max = Math.max(...T.map(w => w.xp), 10), min = 0;
  const x = i => Lp + (W - Lp - R) * i / (T.length - 1), y = v => Tp + (H - Tp - B) * (1 - (v - min) / (max - min));
  const line = T.map((w, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(w.xp).toFixed(1)}`).join('');
  let bands = '';
  Leagues.LEAGUES.forEach((lg, i) => { const v = Leagues.START[i * 5 + 1]; if (i && v > min && v < max * 1.02)
    bands += `<line x1="${Lp}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-dasharray="4 4"/><text x="${Lp - 6}" y="${y(v) + 4}" text-anchor="end">${esc(lg.name.split(' ')[0])}</text>`; });
  let marks = '';
  T.forEach((w, i) => { if (i && w.league !== T[i - 1].league){ const up = w.league > T[i - 1].league;
    marks += `<path d="M${x(i)} ${y(w.xp) + (up ? -7 : 7)} l-5 ${up ? -8 : 8} h10z" fill="${up ? 'var(--accent)' : 'var(--hr)'}"/>`; } });
  const first = new Date(T[0].week + 'T12:00').toLocaleDateString('en-ZA', { month: 'short', year: '2-digit' });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="XP over the last ${T.length} weeks">
    ${bands}<path d="${line}L${x(T.length - 1)} ${y(0)}L${x(0)} ${y(0)}Z" fill="var(--accent)" opacity=".14"/>
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>${marks}
    <text x="${Lp}" y="${H - 5}">${first}</text><text x="${W - R}" y="${H - 5}" text-anchor="end">now</text></svg>
    <p class="hint">Dashed lines mark where leagues begin. Triangles mark promotions and drops.</p>`;
}

function bindLeague(){
  document.querySelectorAll('[data-pause]').forEach(b => b.onclick = () => {
    if (!confirm('Pause this week? No weekly minimum and no detraining. Use it for injury, illness or exams.')) return;
    setCfg({ pauses: [...new Set([...(cfg().pauses || []), b.dataset.pause])] }); invalidate(); route(); toast('Week paused.');
  });
  document.querySelectorAll('[data-unpause]').forEach(b => b.onclick = () => {
    setCfg({ pauses: (cfg().pauses || []).filter(k => k !== b.dataset.unpause) }); invalidate(); route(); toast('Pause removed.');
  });
}

/* ---------- rank celebrations ---------- */
function rankCelebrate(){
  if ((typeof celebrating !== 'undefined' && celebrating) || document.querySelector('.celebrate')) return;
  const G = LG(); if (!G) return;
  const meta = store.get(K.meta, {}), r = G.rank, seen = meta.seenRank;
  const save = () => store.set(K.meta, { ...store.get(K.meta, {}), seenRank: { level: r.level, league: r.league, best: Math.max(seen?.best ?? -1, r.league) } });
  if (seen && seen.level === r.level) return;
  save();
  const LGS = Leagues.LEAGUES;
  let cls, title, body, cta;
  if (!seen){
    cls = 'promo'; title = 'Your league'; cta = "Let's climb";
    body = `<div class="cel-rank">${esc(rankName(r))}</div><p class="cel-sub">Placed from your training history: level ${r.level}. ${esc(LGS[r.league].blurb)}</p>`;
  } else if (r.league > seen.league){
    const first = r.league > (seen.best ?? -1);
    cls = 'promo'; title = first ? 'Promoted!' : `Back in ${LGS[r.league].name}`; cta = first ? 'Keep climbing' : 'Stay here this time';
    body = `<div class="cel-rank">${esc(rankName(r))}</div><p class="cel-sub">${first ? esc(LGS[r.league].blurb) : 'You won your league back.'}${first && r.league >= Leagues.SAFE_LEAGUES ? ` Weekly minimum here: ${nf(Math.round(LGS[r.league].upkeep * getLedger().params.upkeepPct / 100))} XP, starting after ${getLedger().params.graceWeeks} grace weeks.` : ''}</p>`;
  } else if (r.level > seen.level){
    cls = 'lvl'; title = `Level ${r.level}`; cta = ['Keep pushing', 'On to the next', 'More where that came from'][r.level % 3];
    body = `<div class="cel-rank">${esc(rankName(r))}</div><p class="cel-sub">${r.next ? `${nf(r.next - r.xp)} XP to level ${r.level + 1}.` : 'The top level.'}</p>`;
  } else {
    const ev = [...G.events].reverse().find(e => e.to < e.from), why = ev?.reason;
    cls = 'drop'; title = r.league < seen.league ? `Down to ${LGS[r.league].name}` : `Level ${r.level}`; cta = 'Win it back';
    body = `<div class="cel-rank">${esc(rankName(r))}</div><p class="cel-sub">${why?.detrain ? `A week without workouts cost ${nf(why.detrain)} XP of detraining. ` : ''}${why?.upkeep ? `Missing the weekly minimum cost ${nf(why.upkeep)} XP. ` : ''}It's all recoverable: a solid week puts you back on track.</p>`;
  }
  const el = document.createElement('div');
  el.className = `celebrate rankcel ${cls}`; el.tabIndex = -1;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'rcT');
  el.innerHTML = `<div class="cel-card"><div class="rk-badge">${cls === 'promo' ? '<div class="burst"></div>' : ''}${badgeSvg(r.league, { size: cls === 'lvl' ? 110 : 150 })}</div>
    <h2 id="rcT" class="cel-title">${title}</h2>${body}
    ${cls === 'lvl' ? `<div class="xpbar"><i class="fill" style="--to:${(r.next ? (r.xp - r.levelStart) / (r.next - r.levelStart) * 100 : 100).toFixed(1)}%"></i></div>` : ''}
    <button class="btn go" id="rcOk">${cta}</button></div>`;
  document.body.appendChild(el); el.focus({ preventScroll: true });
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 220); route(); };
  $('rcOk').onclick = close; el.addEventListener('click', e => { if (e.target === el) close(); });
}
