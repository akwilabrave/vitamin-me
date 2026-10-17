"use strict";
/* ================================================================
   Doppel — race UI (racing Doppel, your past self)
   Workout detail gets a "Race Doppel" card when you've run the same route before.
   #/ghost/<id>?vs=prev|best shows the verdict, a gap-over-distance chart, km splits,
   and a replay: you and your ghost moving along today's route at 1 s ≈ 1.5 min.
   Loaded before app.js; uses its globals at call time.
   ================================================================ */
const GHOST_SVG = mascotSvg('run', 40, { animate: false, label: 'Doppel' });
const ghostFace = mood => mascotSvg(mood, 52, { label: 'Doppel' });
const signed = s => `${s >= 0 ? '+' : '−'}${dur(Math.abs(s))}`;

function ghostCardHtml(a){
  const g = getLedger().ghost?.byAct[a.id]; if (!g) return '';
  const pa = a.moving / (a.dist / 1000), diff = g.prev.pace - pa;
  const n = g.matches.length;
  const verdict = Math.abs(diff) < 1 ? `Same pace as ${shortDate(g.prev.date)}`
    : diff > 0 ? `${dur(diff)} /km faster than ${shortDate(g.prev.date)}` : `${dur(-diff)} /km slower than ${shortDate(g.prev.date)}`;
  return `<h2>Race Doppel</h2><a class="ghostcard" href="#/ghost/${a.id}">
      <span class="gicon">${ghostFace(diff > 0 ? 'sad' : 'smug')}</span>
      <span><span class="t">${verdict}</span>
      <span class="m">You've run this route ${n} time${n > 1 ? 's' : ''} before${g.best.id !== g.prev.id ? `. Your best here was ${shortDate(g.best.date)}` : ''}.</span></span>${chevron}</a>`;
}

let raceMap = null, raceAnim = null;
function stopRace(){ if (raceAnim) cancelAnimationFrame(raceAnim); raceAnim = null; if (raceMap){ raceMap.remove(); raceMap = null; } }

async function viewGhost(arg){
  stopRace();
  const [idStr, q] = arg.split('?'), id = idStr, vs = new URLSearchParams(q || '').get('vs') === 'best' ? 'best' : 'prev';
  const acts = store.get(K.acts, {}), a = acts[id], g = getLedger().ghost?.byAct[id];
  const back = backTo(`#/a/${id}`, 'Workout');
  if (!a || !g){ $('view').innerHTML = `${back}<div class="empty">No earlier run on this route to race.</div>`; return; }
  const ghostRef = g[vs], ga = acts[ghostRef.id];
  $('view').innerHTML = `${back}<h1 class="brand">Race Doppel</h1><div class="status">Loading both runs from Strava…</div>`;

  let you, gh;
  try { [you, gh] = await Promise.all([raceStream(id), raceStream(ghostRef.id)]); }
  catch(e){ $('view').innerHTML = `${back}<h1 class="brand">Race Doppel</h1><div class="empty">${esc(e.message)}</div>`; return; }
  if (location.hash !== '#/ghost/' + arg) return;
  if (!you.d.length || !gh.d.length){ $('view').innerHTML = `${back}<h1 class="brand">Race Doppel</h1><div class="empty">Strava has no distance data for one of these runs.</div>`; return; }

  const C = Ghost.compare(you, gh);
  const win = C.final >= 0, km = (C.end / 1000);
  const verdict = Math.abs(C.final) < 1 ? 'Dead heat with Doppel' : win ? `You beat Doppel by ${dur(C.final)}` : `Doppel won by ${dur(-C.final)}`;
  const story = [];
  if (C.maxBehind < -5 && win) story.push(`You were ${dur(-C.maxBehind)} behind at worst and came back.`);
  if (C.maxLead > 5 && !win) story.push(`You led by up to ${dur(C.maxLead)} but faded.`);
  if (win && C.maxLead - C.final > 5) story.push(`Your biggest lead was ${dur(C.maxLead)}.`);
  if (C.decidedAt) story.push(`The lead changed for the last time at ${nf(C.decidedAt / 1000, 1)} km.`);

  $('view').innerHTML = `${back}<h1 class="brand">Race Doppel</h1>
    <div class="status">${esc(a.name)}, ${shortDate(a.start)}, against ${vs === 'best' ? 'your best here' : 'last time'} (${shortDate(ga.start)})</div>
    ${g.best.id !== g.prev.id ? `<div class="seg" role="group" aria-label="Which Doppel">
      <button data-vs="prev" aria-pressed="${vs === 'prev'}">Last time</button><button data-vs="best" aria-pressed="${vs === 'best'}">Your best here</button></div>` : ''}
    <div class="verdict ${win ? 'win' : 'lose'}"><span class="gicon">${ghostFace(win ? 'sad' : 'smug')}</span><div><div class="vt">${verdict}</div>
      <div class="m">${C.end >= 0.97 * you.d[you.d.length - 1] ? `Over the full ${nf(km, 2)} km.` : `Over the first ${nf(km, 2)} km, the distance you both covered.`}${story.length ? ' ' + story.join(' ') : ''}</div></div></div>
    <div id="rmap"></div>
    <div class="racebar"><button class="btn go" id="raceGo">Play the race</button>
      <div class="racelive" id="raceLive" aria-live="off"></div></div>
    <h2>Gap over the run</h2>${gapChart(C)}
    <h2>Kilometre by kilometre</h2>
    <table><thead><tr><th>Km</th><th>You</th><th>Doppel</th><th>Split</th><th>Gap</th></tr></thead><tbody>
      ${C.splits.map(s => `<tr><td>${s.km}</td><td>${dur(s.you)}</td><td>${dur(s.ghost)}</td>
        <td class="${s.diff >= 0 ? 'ahead' : 'behind'}">${signed(s.diff)}</td><td class="${s.gap >= 0 ? 'ahead' : 'behind'}">${signed(s.gap)}</td></tr>`).join('')}
    </tbody></table>
    <p class="hint">Split: how much faster (+) or slower (−) that kilometre was than Doppel's. Gap: your total lead (+) or deficit (−) at that point. Uses elapsed time, so stops count, as in a real race.</p>${poweredByStrava()}`;

  document.querySelectorAll('[data-vs]').forEach(b => b.onclick = () => { location.hash = `#/ghost/${id}?vs=${b.dataset.vs}`; });
  drawRace(you, gh);
}

function gapChart(C){
  const W = 600, H = 180, L = 40, R = 8, T = 12, B = 24, pts = C.pts;
  if (pts.length < 2) return '<p class="hint">Not enough data to chart.</p>';
  const m = Math.max(10, ...pts.map(p => Math.abs(p.gap))), lim = Math.ceil(m / 10) * 10;
  const x = d => L + (W - L - R) * d / C.end, y = v => T + (H - T - B) * (1 - (v + lim) / (2 * lim));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)} ${y(p.gap).toFixed(1)}`).join('');
  const area = `M${x(pts[0].d).toFixed(1)} ${y(0)}${line.replace(/^M/, 'L')}L${x(pts[pts.length - 1].d).toFixed(1)} ${y(0)}Z`;
  const ticks = [-lim, 0, lim].map(v => `<text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v ? signed(v) : '0'}</text>`).join('');
  const kms = []; for (let k = 1; k * 1000 <= C.end; k++) kms.push(`<text x="${x(k * 1000)}" y="${H - 6}" text-anchor="middle">${k}</text>`);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Lead over your ghost by distance; final ${signed(C.final)}">
    <defs><clipPath id="gAbove"><rect x="0" y="0" width="${W}" height="${y(0)}"/></clipPath><clipPath id="gBelow"><rect x="0" y="${y(0)}" width="${W}" height="${H}"/></clipPath></defs>
    <path d="${area}" fill="var(--accent)" opacity=".3" clip-path="url(#gAbove)"/><path d="${area}" fill="var(--hr)" opacity=".3" clip-path="url(#gBelow)"/>
    <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--muted)"/>
    <path d="${line}" fill="none" stroke="var(--text)" stroke-width="2" stroke-linejoin="round"/>
    <text x="${W - R}" y="${T + 10}" text-anchor="end" style="fill:var(--accent)">ahead</text>
    <text x="${W - R}" y="${H - B - 6}" text-anchor="end" style="fill:var(--hr)">behind</text>${ticks}${kms.join('')}</svg>`;
}

function drawRace(you, gh){
  const el = $('rmap'); if (!el || typeof L === 'undefined') return;
  if (!you.ll.length){ el.className = 'nomap'; el.textContent = 'No GPS route for this run, so there is no replay.'; $('raceGo').hidden = true; return; }
  raceMap = L.map(el, { zoomControl: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(raceMap);
  const route = L.polyline(you.ll, { color: css('--accent'), weight: 4, opacity: .5 }).addTo(raceMap);
  raceMap.fitBounds(route.getBounds(), { padding: [24, 24] });
  const youM = L.circleMarker(you.ll[0], { radius: 8, color: css('--bg'), weight: 3, fillColor: css('--accent'), fillOpacity: 1 }).addTo(raceMap);
  const ghostM = L.marker(you.ll[0], { icon: L.divIcon({ html: GHOST_SVG, className: 'ghostpin', iconSize: [40, 40], iconAnchor: [20, 36] }) }).addTo(raceMap);

  // position on YOUR route at distance x (the ghost runs your line)
  const posAt = x => {
    const d = you.d; if (x <= 0) return you.ll[0]; if (x >= d[d.length - 1]) return you.ll[you.ll.length - 1];
    let lo = 0, hi = d.length - 1; while (hi - lo > 1){ const m = (lo + hi) >> 1; if (d[m] < x) lo = m; else hi = m; }
    const f = d[hi] === d[lo] ? 0 : (x - d[lo]) / (d[hi] - d[lo]), a = you.ll[lo], b = you.ll[hi];
    return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])];
  };
  const tEnd = Math.max(you.t[you.t.length - 1], Ghost.timeAt(gh.t, gh.d, you.d[you.d.length - 1]) ?? gh.t[gh.t.length - 1]);
  const live = $('raceLive'), btn = $('raceGo');
  const show = T => {
    const dy = Ghost.distAt(you.t, you.d, T), dg = Math.min(Ghost.distAt(gh.t, gh.d, T), you.d[you.d.length - 1]);
    youM.setLatLng(posAt(dy)); ghostM.setLatLng(posAt(dg));
    const gap = dy - dg;
    live.innerHTML = `<span class="num">${dur(T)}</span><span>You ${nf(dy / 1000, 2)} km</span><span>Doppel ${nf(dg / 1000, 2)} km</span>
      <b class="${gap >= 0 ? 'ahead' : 'behind'}">${Math.abs(gap) < 5 ? 'Level' : `${nf(Math.abs(gap))} m ${gap > 0 ? 'ahead' : 'behind'}`}</b>`;
  };
  show(0);
  const SPEED = 90;   // race seconds per real second
  btn.onclick = () => {
    if (raceAnim){ cancelAnimationFrame(raceAnim); raceAnim = null; btn.textContent = 'Play the race'; return; }
    btn.textContent = 'Pause';
    const t0 = performance.now(), start = btn.dataset.at ? +btn.dataset.at : 0;
    const step = now => {
      const T = Math.min(tEnd, start + (now - t0) / 1000 * SPEED);
      btn.dataset.at = T >= tEnd ? 0 : T; show(T);
      if (T < tEnd && location.hash.startsWith('#/ghost/')) raceAnim = requestAnimationFrame(step);
      else { raceAnim = null; btn.textContent = 'Play again'; }
    };
    raceAnim = requestAnimationFrame(step);
  };
}
