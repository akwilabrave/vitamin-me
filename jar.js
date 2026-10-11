"use strict";
/* ================================================================
   Vitamin Me — the vitamin jar and collection celebration
   The jar holds one capsule per collection, oldest at the bottom, each in its
   vitamin's colour paired with the accent colour. Layout is deterministic
   (seeded), so a capsule always sits in the same spot.
   Loaded before app.js; uses its globals (getLedger, store, K, esc, nf, shortDate) at call time.
   ================================================================ */
const JAR_CAP = 60;                 // capsules that fit; beyond this the jar shows the newest 60
const JAR_COLS = 5, JAR_ROW_H = 7;
const CHEERS = ['Keep pushing', 'Great! I can do more', 'Bring on the next one', 'Into the jar it goes',
                'One more for the jar', "Let's keep going", 'On to the next run'];

function seeded(n){ let t = (n * 2654435761) >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ t >>> 15, 1 | t);
  r ^= r + Math.imul(r ^ r >>> 7, 61 | r); return ((r ^ r >>> 14) >>> 0) / 4294967296; }; }
function inkFor(hex){ const n = parseInt(hex.slice(1), 16), l = (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; return l > 0.62 ? '#1a1a1a' : '#ffffff'; }

/* Capsule centred on the origin: left half vitamin colour, right half accent. */
function pill(color, w = 14, h = 6.2){
  const r = h / 2, x = -w / 2, y = -h / 2;
  return `<path d="M${x + r} ${y}H0V${y + h}H${x + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z" fill="${color}"/>` +
         `<path d="M0 ${y}H${-x - r}A${r} ${r} 0 0 1 ${-x - r} ${y + h}H0Z" fill="var(--accent)"/>` +
         `<rect x="${x + r * .7}" y="${y + h * .18}" width="${w * .35}" height="${h * .22}" rx="${h * .11}" fill="#fff" opacity=".45"/>`;
}
function slot(i){
  const rnd = seeded(i + 1), row = Math.floor(i / JAR_COLS), col = i % JAR_COLS;
  const x = 22 + col * 14 + (row % 2 ? 6 : 0) + (rnd() - .5) * 3 - (row % 2 && col === JAR_COLS - 1 ? 12 : 0);
  const y = 115 - row * JAR_ROW_H + (rnd() - .5) * 1.8;
  return { x: x.toFixed(1), y: y.toFixed(1), r: ((rnd() - .5) * 70).toFixed(0) };
}

/* jarSvg(log, { fresh: Set of log indices to animate, cls }) */
function jarSvg(log, opt = {}){
  const colors = Object.fromEntries((getLedger().rec?.vitamins || []).map(v => [v.id, v.color]));
  const shown = log.slice(-JAR_CAP), offset = log.length - shown.length, fresh = opt.fresh || new Set();
  let drops = 0;
  const pills = shown.map((c, k) => {
    const i = k + offset, s = slot(k), g = `<g transform="translate(${s.x} ${s.y}) rotate(${s.r})">${pill(colors[c.id] || '#888')}</g>`;
    return fresh.has(i) ? `<g class="drop" style="animation-delay:${(0.55 + drops++ * 0.32).toFixed(2)}s">${g}</g>` : g;
  }).join('');
  const lidDur = drops ? (1.3 + drops * 0.32).toFixed(2) : 0;
  return `<svg class="jar ${opt.cls || ''}" viewBox="0 0 100 130" aria-hidden="true">
    <path d="M14 30 Q10 30 10 40 V112 Q10 126 26 126 H74 Q90 126 90 112 V40 Q90 30 86 30 Z" fill="var(--glass)"/>
    <g>${pills}</g>
    <path d="M14 30 Q10 30 10 40 V112 Q10 126 26 126 H74 Q90 126 90 112 V40 Q90 30 86 30 Z" fill="none" stroke="var(--glassline)" stroke-width="2.2"/>
    <path d="M17 44 V106" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".28"/>
    <path d="M23 40 V52" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".22"/>
    <rect x="27" y="22" width="46" height="9" rx="2" fill="var(--glass)" stroke="var(--glassline)" stroke-width="2"/>
    <g class="lid" ${drops ? `style="animation-duration:${lidDur}s"` : ''}>
      <rect x="22" y="7" width="56" height="16" rx="5" fill="var(--accent)"/>
      <path d="M30 11 V19 M38 11 V19 M46 11 V19 M54 11 V19 M62 11 V19 M70 11 V19" stroke="#000" stroke-opacity=".14" stroke-width="2"/>
    </g></svg>`;
}

/* Home-screen jar button */
function jarButtonHtml(){
  const R = getLedger().rec; if (!R) return '';
  const n = R.log.length;
  return `<a class="jarbtn" href="#/progress" aria-label="Vitamin jar: ${n} collected. Open progress">${jarSvg(R.log)}<span class="num">${nf(n)}</span></a>`;
}

/* Which collections haven't been celebrated yet. seenVit = { vitaminId: count already seen }. */
function unseen(){
  const R = getLedger().rec; if (!R) return { fresh: new Set(), list: [] };
  const meta = store.get(K.meta, {});
  const seen = Array.isArray(meta.seenVit) ? Object.fromEntries(meta.seenVit.map(id => [id, 1])) : (meta.seenVit || {});
  const fresh = new Set(), list = [];
  R.log.forEach((c, i) => { if (c.n > (seen[c.id] || 0)){ fresh.add(i); list.push(c); } });
  return { fresh, list };
}
function markSeen(){
  const R = getLedger().rec; if (!R) return;
  store.set(K.meta, { ...store.get(K.meta, {}), seenVit: Object.fromEntries(R.vitamins.map(v => [v.id, v.count])) });
}

let celebrating = false;
/* demo: replay with your latest collections without changing what's been seen */
function celebrate(demo = 0){
  if (celebrating) return;
  const R = getLedger().rec; if (!R) return;
  let fresh, list;
  if (demo){
    const n = Math.min(demo, R.log.length); if (!n){ toast('Collect your first vitamin to see it drop into the jar.'); return; }
    fresh = new Set(R.log.map((_, i) => i).slice(-n)); list = R.log.slice(-n);
  } else {
    ({ fresh, list } = unseen());
    if (!list.length){ markSeen(); return; }         // also absorbs decreases after parameter edits
    markSeen();
  }
  celebrating = true;

  const byId = Object.fromEntries(R.vitamins.map(v => [v.id, v]));
  // animate at most 10 drops; older new ones are simply already in the jar
  const animate = new Set([...fresh].slice(-10));
  const kinds = [...new Set(list.map(c => c.id))].map(id => ({ v: byId[id], n: list.filter(c => c.id === id).length }));
  const single = list.length === 1 ? byId[list[0].id] : null;
  const cheer = CHEERS[Math.floor(Math.random() * CHEERS.length)];

  const body = single
    ? `<div class="cel-one"><div class="capwrap">${capsuleSvg(single)}</div><div><div class="cel-name">${esc(single.name)}</div>
         <div class="m">${esc(single.desc)}</div>${single.count > 1 ? `<div class="m">That's ${single.count} in your jar.</div>` : ''}</div></div>`
    : `<p class="cel-sub">You collected ${list.length} vitamins.</p><div class="cel-chips">` +
      kinds.map(k => `<span class="vchip"><i style="background:${k.v.color}"></i>${esc(k.v.name)}${k.n > 1 ? ` ×${k.n}` : ''}</span>`).join('') + `</div>`;

  const el = document.createElement('div');
  el.className = 'celebrate';
  el.tabIndex = -1; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'celT');
  el.innerHTML = `<div class="cel-card">${jarSvg(R.log, { fresh: animate, cls: 'big' })}
    <h2 id="celT" class="cel-title">Congratulations!</h2>${body}
    <button class="btn go" id="celOk">${cheer}</button></div>`;
  document.body.appendChild(el);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 220); celebrating = false; document.removeEventListener('keydown', esc_); route(); };
  const esc_ = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc_);
  el.addEventListener('click', e => { if (e.target === el) close(); });
  $('celOk').onclick = close;
  el.focus({ preventScroll: true });
}
