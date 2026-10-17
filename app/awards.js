"use strict";
/* ================================================================
   Doppel — medals and trophies grids, award celebrations and the this-week vs Doppel card
   · Medals are repeatable: each one counts up and turns bronze → silver → gold.
   · Trophies are once-off and hard; locked ones show as silhouettes.
   · celebrate() shows new medals and trophies after a sync, then hands over to
     rankCelebrate() for level and league changes.
   Loaded before app.js; uses its globals (getLedger, store, K, esc, nf, shortDate, route, toast, $) at call time.
   ================================================================ */
const CHEERS = ['Keep pushing', 'Great! I can do more', 'On to the next one', 'Doppel never stood a chance',
                "Let's keep going", 'Again tomorrow?', 'Onwards'];

/* Doppel with a speech line: used for empty states and small moments */
function doppelSays(mood, html, size = 92){
  return `<div class="says">${mascotSvg(mood, size)}<div class="bubble">${html}</div></div>`;
}

/* ---------- home: trophy case button (top right of the rank hero) ---------- */
function caseButtonHtml(){
  const R = getLedger().rec; if (!R) return '';
  const won = R.trophies.filter(t => t.won), medals = R.medals.reduce((s, m) => s + m.count, 0);
  const show = won.length ? R.trophies.find(t => t.id === [...R.log].reverse().find(l => l.kind === 'trophy').id) : R.trophies[0];
  return `<a class="casebtn" href="#/progress" aria-label="${won.length} trophies and ${medals} medals. Open progress">
    ${trophySvg(show, { size: 54, locked: !won.length })}
    <span class="num">${won.length}<small>/${R.trophies.length}</small></span></a>`;
}

/* ---------- progress page sections ---------- */
const pctOf = (v, t) => Math.max(0, Math.min(100, v / t * 100));
const fmtUnit = (v, unit) => `${nf(v, unit === 'km' || unit === 'hours' || unit === '% faster' ? 1 : 0)}`;

function trophyShelfHtml(R){
  const won = R.trophies.filter(t => t.won).length;
  const order = [...R.trophies].sort((a, b) => (!!b.won - !!a.won) || (b.value / b.target - a.value / a.target));
  return `<h2>Trophies <span class="h2n">${won} of ${R.trophies.length}</span></h2>
    <div class="trogrid">${order.map(t => `
      <button class="tro ${t.won ? 'on' : ''}" data-award="t:${t.id}" aria-label="${esc(t.name)}">
        ${trophySvg(t, { size: 64, locked: !t.won, shine: !!t.won })}
        <span class="t">${esc(t.name)}</span>
        ${t.won ? `<span class="m">${shortDate(t.won.date)}</span>` : `<span class="tbar"><i style="width:${pctOf(t.value, t.target).toFixed(0)}%"></i></span>`}
      </button>`).join('')}</div>
    <p class="hint">Trophies are once-off and hard to win: each one is a line Doppel never crossed. Tap any to see what it takes.</p>`;
}

function medalWallHtml(R){
  const kinds = R.medals.filter(m => m.count).length, total = R.medals.reduce((s, m) => s + m.count, 0);
  const order = [...R.medals].sort((a, b) => (b.tier - a.tier) || (b.count - a.count));
  return `<h2>Medals <span class="h2n">${nf(total)} won</span></h2>
    <div class="medgrid">${order.map(m => `
      <button class="med ${m.count ? 'on' : ''}" data-award="m:${m.id}" aria-label="${esc(m.name)}">
        ${medalSvg(m, { size: 76, tier: m.tier, locked: !m.count })}
        ${m.count > 1 ? `<span class="cnt">×${m.count}</span>` : ''}
        <span class="t">${esc(m.name)}</span>
        <span class="m">${m.count ? TIER_NAMES[m.tier] : m.next ? `${Math.round(pctOf(m.next.value, m.next.target))}%` : 'Not yet'}</span>
      </button>`).join('')}</div>
    <p class="hint">${kinds} of ${R.medals.length} medals found. Medals can be won again and again: each turns silver, then gold, as the count climbs.</p>`;
}

/* Detail sheet when a medal or trophy is tapped */
function awardSheet(key){
  const R = getLedger().rec, [k, id] = key.split(':');
  let art, title, lines = [];
  if (k === 'm'){
    const m = R.medals.find(x => x.id === id);
    art = medalSvg(m, { size: 120, tier: m.tier, locked: !m.count }); title = m.name;
    lines.push(esc(m.desc) + '.');
    if (m.count) lines.push(`Won ${m.count} time${m.count > 1 ? 's' : ''}, first on ${shortDate(m.first.date)}${m.count > 1 ? `, most recently ${shortDate(m.last.date)}` : ''}.`);
    if (m.tier < 3) lines.push(`${TIER_NAMES[m.tier + 1]} at ${m.tiers[m.tier]}: ${m.toNextTier} to go.`);
    else lines.push('Gold. The top tier.');
    if (m.next) lines.push(`Next one: ${fmtUnit(m.next.value, m.unit)} of ${nf(m.next.target)} ${m.unit}.`);
  } else {
    const t = R.trophies.find(x => x.id === id);
    art = trophySvg(t, { size: 130, locked: !t.won, shine: !!t.won });
    title = t.name; lines.push(esc(t.desc) + '.');
    if (t.won) lines.push(`Won on ${shortDate(t.won.date)}. One of a kind: it's yours for good.`);
    else lines.push(`${fmtUnit(t.value, t.unit)} of ${nf(t.target)} ${t.unit} so far (${Math.round(pctOf(t.value, t.target))}%).`);
  }
  const link = k === 'm' ? R.medals.find(x => x.id === id).last?.actId : R.trophies.find(x => x.id === id).won?.actId;
  const el = document.createElement('div');
  el.className = 'celebrate sheet'; el.tabIndex = -1; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="cel-card"><div class="cel-art">${art}</div><h2 class="cel-title">${esc(title)}</h2>
    ${lines.map(l => `<p class="cel-sub">${l}</p>`).join('')}
    ${link ? `<a class="btn" href="#/a/${link}">See the workout</a>` : ''}<button class="btn go" data-x>Close</button></div>`;
  document.body.appendChild(el); el.focus({ preventScroll: true });
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  el.querySelector('[data-x]').onclick = close; el.querySelector('a.btn')?.addEventListener('click', close);
  el.addEventListener('click', e => { if (e.target === el) close(); });
}
function bindAwards(){ document.querySelectorAll('[data-award]').forEach(b => b.onclick = () => awardSheet(b.dataset.award)); }

/* ---------- celebrations ---------- */
function seenMap(){ return store.get(K.meta, {}).seenAch || null; }
function currentMap(R){ const m = {}; R.medals.forEach(x => m['m:' + x.id] = x.count); R.trophies.forEach(x => m['t:' + x.id] = x.won ? 1 : 0); return m; }
function markSeen(){ const R = getLedger().rec; if (R) store.set(K.meta, { ...store.get(K.meta, {}), seenAch: currentMap(R) }); }
function unseen(){
  const R = getLedger().rec, seen = seenMap() || {}, list = [];
  for (const m of R.medals) if (m.count > (seen['m:' + m.id] || 0)) list.push({ kind: 'medal', a: m, n: m.count - (seen['m:' + m.id] || 0), up: m.tier > Records.tierOf(m, seen['m:' + m.id] || 0) });
  for (const t of R.trophies) if (t.won && !seen['t:' + t.id]) list.push({ kind: 'trophy', a: t });
  return list.sort((x, y) => (y.kind === 'trophy') - (x.kind === 'trophy'));
}

let celebrating = false;
function overlay(inner, onClose){
  const el = document.createElement('div');
  el.className = 'celebrate'; el.tabIndex = -1; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'celT');
  el.innerHTML = `<div class="cel-card">${inner}</div>`;
  document.body.appendChild(el); celebrating = true;
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 220); celebrating = false; document.removeEventListener('keydown', k); onClose?.(); };
  const k = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', k);
  el.addEventListener('click', e => { if (e.target === el) close(); });
  el.querySelector('#celOk').onclick = close;
  el.focus({ preventScroll: true });
}

/* demo > 0 replays your latest awards without changing what's been seen */
function celebrate(demo = 0){
  if (celebrating || document.querySelector('.celebrate')) return;
  const R = getLedger().rec; if (!R) return;
  const cheer = CHEERS[Math.floor(Math.random() * CHEERS.length)];

  // First run with Doppel: an introduction instead of a flood of old awards
  if (!demo && !seenMap()){
    markSeen();
    const won = R.trophies.filter(t => t.won).length, medals = R.medals.reduce((s, m) => s + m.count, 0);
    overlay(`<div class="cel-art">${mascotSvg('wave', 150)}</div><h2 id="celT" class="cel-title">Meet Doppel</h2>
      <p class="cel-sub">Doppel is you, from every run you've ever done, waiting to be beaten. Your only rival is who you were yesterday.</p>
      ${medals || won ? `<p class="cel-sub">From your history you've already won <b>${nf(medals)} medal${medals === 1 ? '' : 's'}</b> and <b>${won} troph${won === 1 ? 'y' : 'ies'}</b>.</p>` : ''}
      <button class="btn go" id="celOk">Let's beat Doppel</button>`, () => { route(); setTimeout(rankCelebrate, 300); });
    return;
  }

  let list;
  if (demo){
    const recent = [...R.log].reverse().slice(0, 12), seen = new Set(); list = [];
    for (const l of recent){ const key = l.kind + l.id; if (seen.has(key)) continue; seen.add(key);
      list.push(l.kind === 'trophy' ? { kind: 'trophy', a: R.trophies.find(t => t.id === l.id) } : { kind: 'medal', a: R.medals.find(m => m.id === l.id), n: 1 });
      if (list.length >= demo) break; }
    if (!list.length){ toast('Win your first medal to see it here.'); return; }
  } else {
    list = unseen(); markSeen();
    if (!list.length){ rankCelebrate(); return; }
  }

  const one = list.length === 1 ? list[0] : null, trophy = list.find(x => x.kind === 'trophy');
  let inner;
  if (one && one.kind === 'trophy'){
    inner = `<div class="cel-art trophyrise"><div class="burst"></div>${trophySvg(one.a, { size: 150, shine: true })}<span class="peek">${mascotSvg('wow', 64)}</span></div>
      <div class="kicker">Trophy unlocked</div><h2 id="celT" class="cel-title">${esc(one.a.name)}</h2><p class="cel-sub">${esc(one.a.desc)}. Doppel never managed this.</p>`;
  } else if (one){
    const m = one.a;
    inner = `<div class="cel-art medalswing">${medalSvg(m, { size: 140, tier: m.tier })}</div>
      <div class="kicker">${one.up && m.count > 1 ? `Upgraded to ${TIER_NAMES[m.tier]}` : 'New medal'}</div>
      <h2 id="celT" class="cel-title">${esc(m.name)}</h2><p class="cel-sub">${esc(m.desc)}.${m.count > 1 ? ` That's ${m.count} so far.` : ''}</p>`;
  } else {
    const shown = list.slice(0, 6);
    inner = `<div class="cel-art">${mascotSvg('cheer', 110)}</div><h2 id="celT" class="cel-title">${trophy ? 'Trophy unlocked!' : 'New medals!'}</h2>
      <div class="cel-grid">${shown.map((x, i) => `<div style="animation-delay:${(.15 + i * .12).toFixed(2)}s">${x.kind === 'trophy'
        ? trophySvg(x.a, { size: 64, shine: true }) : medalSvg(x.a, { size: 60, tier: x.a.tier })}<span>${esc(x.a.name)}${x.n > 1 ? ` ×${x.n}` : ''}</span></div>`).join('')}</div>
      ${list.length > shown.length ? `<p class="cel-sub">and ${list.length - shown.length} more in Progress.</p>` : ''}`;
  }
  overlay(inner + `<button class="btn go" id="celOk">${cheer}</button>`, () => { route(); if (!demo) setTimeout(rankCelebrate, 300); });
}

/* ---------- home: this week vs Doppel from last week ---------- */
function pastYouHtml(acts){
  const now = new Date(), monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const lastMon = new Date(monday.getTime() - 7 * 864e5), lastNow = new Date(now.getTime() - 7 * 864e5);
  const sum = (a, b) => acts.filter(x => RUNS.has(x.type)).filter(x => { const t = new Date(x.start); return t >= a && t <= b; })
                            .reduce((s, x) => ({ km: s.km + x.dist / 1000, n: s.n + 1 }), { km: 0, n: 0 });
  const you = sum(monday, now), past = sum(lastMon, lastNow), diff = you.km - past.km;
  const day = now.toLocaleDateString('en-ZA', { weekday: 'long' });
  let mood, line;
  if (!you.km && !past.km){ mood = 'sleep'; line = `Neither of you had run by ${day} last week either. First one out wins.`; }
  else if (Math.abs(diff) < 0.05){ mood = 'wow'; line = `Dead level with Doppel from last week. One run settles it.`; }
  else if (diff > 0){ mood = 'sad'; line = `You're <b>${nf(diff, 1)} km ahead</b> of Doppel from last week.`; }
  else { mood = 'smug'; line = `Doppel from last week had run <b>${nf(-diff, 1)} km more</b> by this point. Catch up.`; }
  const max = Math.max(you.km, past.km, 1);
  const bar = (label, v, cls) => `<div class="pyrow ${cls}"><span>${label}</span><div class="pybar"><i style="width:${(v / max * 100).toFixed(1)}%"></i></div><b>${nf(v, 1)} km</b></div>`;
  return `<a class="pastyou" href="#/progress">${mascotSvg(mood, 70)}
    <div class="pybody"><div class="pyt">${line}</div>${bar('You', you.km, 'me')}${bar('Doppel', past.km, 'ghost')}</div></a>`;
}
