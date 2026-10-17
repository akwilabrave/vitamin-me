"use strict";
/* ================================================================
   Doppel — the art system
   Everything drawn in the app follows the same few rules, so the mascot,
   medals, trophies and league badges read as one family:
     · material  one three-stop vertical gradient (light → base → dark)
     · rim       a solid outline in the material's dark shade, round joins
     · shine     a single soft white highlight, top left
     · emblems   24-unit line icons, 2 px round strokes, drawn in "ink"
     · type      ui-rounded, heavy weight
   Doppel, the mascot, is past-you: a ghost in a sweatband who has run every
   run you have ever run, and is always waiting to race you again.
   Loaded before app.js; pure string builders, no app state needed.
   ================================================================ */

let _aid = 0; const aid = p => `${p}${++_aid}`;
const mix = (a, b, t) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const luma = h => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; };
const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* The shared material: returns { defs, fill, rim, light, dark, ink } for a base colour. */
function material(base, id){
  const light = mix(base, '#ffffff', .42), dark = mix(base, '#000000', .38);
  return { light, dark, rim: dark, fill: `url(#${id})`, ink: luma(base) > .62 ? '#2a3140' : '#ffffff',
    defs: `<linearGradient id="${id}" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="${light}"/><stop offset=".55" stop-color="${base}"/><stop offset="1" stop-color="${dark}"/></linearGradient>` };
}
/* A 24-unit line icon placed at (cx, cy) with scale s. */
const iconAt = (d, cx, cy, s, ink, w = 2) => `<g transform="translate(${cx - 12 * s} ${cy - 12 * s}) scale(${s})" fill="none" stroke="${ink}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d.split(/(?=M)/).map(p => `<path d="${p}"/>`).join('')}</g>`;
const textAt = (t, cx, cy, size, ink) => `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${size}" font-weight="800" fill="${ink}" font-family="ui-rounded,'SF Pro Rounded',system-ui,sans-serif" letter-spacing="-.5">${t}</text>`;

/* ---------------- Doppel, the mascot ----------------
   mood: run · cheer · smug · wow · sleep · sad · wave
   The body is pale "ectoplasm" with the shared material rules; the sweatband
   takes the accent colour, so Doppel always matches your theme. */
const GHOST = '#eef0ff', GHOST_RIM = '#5a5f93', INK = '#232842';

function mascotSvg(mood = 'run', size = 120, opt = {}){
  const id = aid('g'), band = opt.band || 'var(--accent)', anim = opt.animate !== false && !reduceMotion();
  const run = mood === 'run';
  // Body: a dome that melts into a flowing tail. Running leans forward and streams the tail back.
  const body = run
    ? 'M40 50C40 30 53 19 69 19C86 19 98 32 97 51C96 69 88 82 73 89C62 94 50 95 36 99C26 102 17 104 8 101C17 98 23 94 25 89C17 90 11 89 6 86C17 83 27 79 32 72C37 65 40 59 40 50Z'
    : 'M31 52C31 32 44 20 60 20C76 20 89 32 89 52V84C89 90 86 95 81 95C76 95 74 90 70 90C66 90 65 97 60 97C55 97 54 90 50 90C46 90 44 95 39 95C34 95 31 90 31 84Z';
  const cx = run ? 69 : 60;                               // face centre
  const tilt = run ? 'rotate(-6 69 50)' : mood === 'sad' ? 'rotate(4 60 52)' : '';

  // eyes
  const ex = [cx - 11, cx + 11], ey = run ? 47 : 50;
  let eyes = '';
  if (mood === 'sleep') eyes = ex.map(x => `<path d="M${x - 5} ${ey}q5 4 10 0" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`).join('');
  else if (mood === 'smug') eyes = ex.map(x => `<ellipse cx="${x}" cy="${ey + 1}" rx="4.6" ry="5.4" fill="${INK}"/><path d="M${x - 6} ${ey - 2.5}h12v-5h-12z" fill="${GHOST}"/><path d="M${x - 5.5} ${ey - 2.4}h11" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`).join('');
  else if (mood === 'cheer') eyes = ex.map(x => `<path d="M${x - 5} ${ey + 2}q5 -7 10 0" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>`).join('');
  else {
    const ry = mood === 'wow' ? 7.2 : 6.2, rx = mood === 'wow' ? 5.6 : 4.8;
    eyes = ex.map(x => `<ellipse cx="${x + (run ? 1.5 : 0)}" cy="${ey}" rx="${rx}" ry="${ry}" fill="${INK}"/><circle cx="${x + (run ? 3 : 1.6)}" cy="${ey - 2.6}" r="1.9" fill="#fff"/>`).join('');
    if (mood === 'sad') eyes += ex.map((x, i) => `<path d="M${x - 5} ${ey - 9 + (i ? -2 : 2)}L${x + 5} ${ey - 9 + (i ? 2 : -2)}" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`).join('');
  }
  // mouth
  const my = ey + 12;
  const mouth = {
    run:   `<path d="M${cx - 4} ${my}q5 5 10 -1" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
    cheer: `<path d="M${cx - 7} ${my - 2}h14q0 9 -7 9t-7 -9z" fill="${INK}"/><path d="M${cx - 4} ${my + 4.5}q4 -3 8 0q-1 2.3 -4 2.3t-4 -2.3z" fill="#ff7d9a"/>`,
    smug:  `<path d="M${cx - 5} ${my}q7 3 11 -3" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
    wow:   `<ellipse cx="${cx}" cy="${my + 1}" rx="4" ry="5" fill="${INK}"/>`,
    sleep: `<ellipse cx="${cx}" cy="${my}" rx="2.6" ry="2" fill="${INK}"/>`,
    sad:   `<path d="M${cx - 5} ${my + 3}q5 -5 10 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
    wave:  `<path d="M${cx - 6} ${my - 1}q6 7 12 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  }[mood] || '';
  const cheeks = mood === 'sleep' || mood === 'sad' ? '' : ex.map(x => `<ellipse cx="${x + (x < cx ? -4 : 4) + (run ? 1 : 0)}" cy="${ey + 8}" rx="4" ry="2.4" fill="#ff8fab" opacity=".55"/>`).join('');

  // sweatband: a stripe across the dome and two tails that flutter behind
  const bandY = run ? 33 : 35;
  const bandPath = run ? `M44 ${bandY + 6}C58 ${bandY - 1} 80 ${bandY - 3} 95 ${bandY + 3}L96 ${bandY + 10}C81 ${bandY + 4} 59 ${bandY + 6} 42 ${bandY + 14}Z`
                       : `M34 ${bandY + 4}C48 ${bandY - 2} 72 ${bandY - 2} 86 ${bandY + 4}L87.5 ${bandY + 11}C73 ${bandY + 5} 47 ${bandY + 5} 32.5 ${bandY + 11}Z`;
  const kx = run ? 44 : 34, ky = run ? bandY + 9 : bandY + 7;
  const tails = `<g class="m-tails">
      <path d="M${kx} ${ky}C${kx - 9} ${ky - 6} ${kx - 16} ${ky - 3} ${kx - 22} ${ky - 7}C${kx - 19} ${ky + 1} ${kx - 10} ${ky + 3} ${kx} ${ky + 2}Z" fill="${band}" stroke="${INK}" stroke-opacity=".35" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M${kx} ${ky + 1}C${kx - 8} ${ky + 4} ${kx - 13} ${ky + 10} ${kx - 20} ${ky + 10}C${kx - 15} ${ky + 15} ${kx - 7} ${ky + 9} ${kx} ${ky + 4}Z" fill="${band}" stroke="${INK}" stroke-opacity=".35" stroke-width="1.2" stroke-linejoin="round"/>
      ${anim ? `<animateTransform attributeName="transform" type="rotate" values="0 ${kx} ${ky};${run ? 7 : 4} ${kx} ${ky};0 ${kx} ${ky}" dur="${run ? .5 : 1.6}s" repeatCount="indefinite"/>` : ''}</g>`;

  // arms: little rounded nubs in the body material
  const arm = (x, y, r) => `<ellipse cx="${x}" cy="${y}" rx="7.5" ry="5" transform="rotate(${r} ${x} ${y})" fill="url(#${id})" stroke="${GHOST_RIM}" stroke-width="2.6"/>`;
  const arms = {
    run:   arm(50, 70, 35) + arm(95, 60, -30),
    cheer: arm(27, 40, 60) + arm(93, 40, -60),
    wave:  arm(28, 68, 20) + arm(94, 42, -55),
    smug:  arm(30, 70, 15) + arm(90, 70, -15),
    wow:   arm(27, 58, 40) + arm(93, 58, -40),
    sleep: '', sad: arm(31, 76, 70) + arm(89, 76, -70),
  }[mood] || '';
  // sneakers: Doppel floats, but never runs without shoes
  const shoe = (x, y, r) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(1.25)">
      <path d="M-8 1C-8 -3 -6 -5 -3 -5H0C1 -2 4 -1 7 0C9 .6 9.5 4 7.5 4H-7C-8 4 -8 3 -8 1Z" fill="${band}" stroke="${INK}" stroke-opacity=".55" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M-7.6 2.4H8.6" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><path d="M-2 -3l2 1.5M0 -4l2 1.5" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".8"/></g>`;
  const shoes = mood === 'sleep' ? shoe(48, 104, 0) + shoe(70, 104, 0)
    : run ? shoe(30, 104, -18) + shoe(84, 100, 12)
    : mood === 'cheer' ? shoe(47, 103, -10) + shoe(73, 103, 10)
    : shoe(48, 104, 0) + shoe(71, 104, 0);

  // extras: speed lines, sparkles, zzz, sweat
  let extra = '';
  if (run) extra += `<g stroke="${GHOST_RIM}" stroke-width="2.4" stroke-linecap="round" opacity=".55" class="m-speed">
      <path d="M14 60h12M6 72h14M18 84h8"/>${anim ? '<animateTransform attributeName="transform" type="translate" values="4 0;-4 0;4 0" dur=".5s" repeatCount="indefinite"/>' : ''}</g>`;
  if (mood === 'cheer') extra += ['M20 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2z', 'M98 18l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z', 'M104 50l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z']
    .map(d => `<path d="${d}" fill="#ffc83d" stroke="#d69a00" stroke-width="1" stroke-linejoin="round"/>`).join('');
  if (mood === 'sleep') extra += `<g fill="none" stroke="${GHOST_RIM}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity=".7"><path d="M92 18h8l-8 9h8M103 6h6l-6 7h6"/></g>`;
  if (mood === 'sad') extra += `<path d="M93 40c0 4 -3 6 -5 6s-4 -2 -4 -5c0 -2 2 -5 4 -8 2 3 5 5 5 7z" fill="#7cc4ff" stroke="#3a8fd6" stroke-width="1.2"/>`;
  if (mood === 'wow') extra += `<g stroke="#ffc83d" stroke-width="2.6" stroke-linecap="round"><path d="M22 34l7 4M18 50h8M98 34l-7 4M102 50h-8"/></g>`;

  const bob = anim && !run && mood !== 'sad' ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0" dur="${mood === 'sleep' ? 3.2 : 2.2}s" repeatCount="indefinite"/>` : '';
  const shadow = mood === 'sleep' ? '' : `<ellipse cx="${run ? 62 : 60}" cy="113" rx="${run ? 26 : 22}" ry="3.6" fill="#000" opacity=".12"/>`;
  return `<svg class="mascot m-${mood} ${opt.cls || ''}" width="${size}" height="${size}" viewBox="0 0 120 120" role="img" aria-label="${opt.label || 'Doppel the ghost'}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="${GHOST}"/><stop offset="1" stop-color="#cfd3f5"/></linearGradient></defs>
    ${shadow}<g>${bob}${extra}${shoes}${tails}
      <g transform="${tilt}">
        <path d="${body}" fill="url(#${id})" stroke="${GHOST_RIM}" stroke-width="3" stroke-linejoin="round"/>
        <path d="${run ? 'M50 40C52 32 58 27 64 26' : 'M40 44C41 36 46 30 52 28'}" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" opacity=".9"/>
        <path d="${bandPath}" fill="${band}" stroke="${INK}" stroke-opacity=".35" stroke-width="1.2" stroke-linejoin="round"/>
        <path d="${bandPath}" fill="#fff" opacity=".18" transform="translate(0 -1.5) scale(1 .5)" transform-origin="60 ${bandY}"/>
        ${eyes}${cheeks}${mouth}
      </g>${arms}
    </g></svg>`;
}

/* ---------------- medals ----------------
   Repeatable achievements. A round medal on a ribbon: the ribbon carries the
   medal's own colour, the disc carries its tier metal. */
const TIER_METALS = [null, '#c27c45', '#a9b4c0', '#e3ac24'];          // 1 bronze · 2 silver · 3 gold
const TIER_NAMES = ['', 'Bronze', 'Silver', 'Gold'];

function medalSvg(m, opt = {}){
  const size = opt.size || 72, tier = opt.tier ?? 1, locked = !!opt.locked || !tier, id = aid('md');
  const M = material(locked ? '#9aa3ad' : TIER_METALS[tier], id + 'm'), R = material(locked ? '#9aa3ad' : m.color, id + 'r');
  const fill = locked ? 'var(--line)' : M.fill, rim = locked ? 'var(--muted)' : M.rim, ink = locked ? 'var(--muted)' : (tier === 3 ? '#5a3c00' : tier === 2 ? '#2a3442' : '#ffffff');
  const rf = locked ? 'var(--line)' : R.fill, rr = locked ? 'var(--muted)' : R.rim;
  // ribbon: two crossing straps, V-cut at the top
  const ribbon = `<path d="M34 6H52L68 52H50Z" fill="${rf}" stroke="${rr}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M86 6H68L52 52H70Z" fill="${rf}" stroke="${rr}" stroke-width="2.2" stroke-linejoin="round"/>
    ${locked ? '' : `<path d="M42 6l12 36M78 6L66 42" stroke="#fff" stroke-opacity=".35" stroke-width="2.4"/>`}`;
  const disc = `<circle cx="60" cy="76" r="34" fill="${fill}" stroke="${rim}" stroke-width="3"/>
    <circle cx="60" cy="76" r="27" fill="none" stroke="${locked ? 'var(--muted)' : '#fff'}" stroke-opacity="${locked ? .35 : .4}" stroke-width="1.6" ${tier >= 2 && !locked ? 'stroke-dasharray="2.5 3"' : ''}/>
    ${locked ? '' : `<path d="M38 64a26 26 0 0 1 16-14" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" opacity=".55"/>`}`;
  const stars = !locked && tier >= 2 ? Array.from({ length: tier - 1 }, (_, i) => {
      const x = 60 + (i - (tier - 2) / 2) * 12;
      return `<path d="M${x} 103l1.8 3.6 4 .6-2.9 2.8.7 4L${x} 112.1l-3.6 1.9.7-4-2.9-2.8 4-.6z" fill="#fff" stroke="${rim}" stroke-width="1.1" stroke-linejoin="round"/>`; }).join('') : '';
  const em = locked && opt.hideEmblem ? textAt('?', 60, 77, 30, ink) : m.text ? textAt(m.text, 60, 77, m.text.length > 3 ? 15 : 19, ink) : iconAt(m.icon, 60, 76, 1.45, ink, 2.2);
  return `<svg class="medal ${locked ? 'locked' : ''}" width="${size}" height="${size}" viewBox="0 0 120 120" role="img" aria-label="${esc_(m.name)}${locked ? ', not yet earned' : `, ${TIER_NAMES[tier]}`}">
    <defs>${M.defs}${R.defs}</defs>${ribbon}${disc}${em}${stars}</svg>`;
}

/* ---------------- trophies ----------------
   Once-off grand achievements. Every trophy is the same gold cup on a plinth;
   each carries its own emblem on the bowl and its own gem colour on the base. */
const TROPHY_GOLD = '#e8b021';
function trophySvg(t, opt = {}){
  const size = opt.size || 96, locked = !!opt.locked, id = aid('tr');
  const G = material(TROPHY_GOLD, id + 'g'), B = material('#3b3f55', id + 'b'), J = material(t.color, id + 'j');
  const fill = locked ? 'var(--line)' : G.fill, rim = locked ? 'var(--muted)' : G.rim, ink = locked ? 'var(--muted)' : '#6a4700';
  const anim = !locked && opt.shine && !reduceMotion();
  const cup = 'M30 18H90V40C90 60 77 72 60 74C43 72 30 60 30 40Z';
  return `<svg class="trophy ${locked ? 'locked' : ''}" width="${size}" height="${size}" viewBox="0 0 120 130" role="img" aria-label="${esc_(t.name)} trophy${locked ? ', locked' : ''}">
    <defs>${G.defs}${B.defs}${J.defs}<clipPath id="${id}c"><path d="${cup}"/></clipPath>
      <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <path d="M31 25H20C14 25 12 31 13 36C15 46 22 52 33 54" fill="none" stroke="${rim}" stroke-width="7" stroke-linecap="round"/>
    <path d="M31 25H20C14 25 12 31 13 36C15 46 22 52 33 54" fill="none" stroke="${locked ? 'var(--line)' : G.light}" stroke-width="3" stroke-linecap="round"/>
    <path d="M89 25H100C106 25 108 31 107 36C105 46 98 52 87 54" fill="none" stroke="${rim}" stroke-width="7" stroke-linecap="round"/>
    <path d="M89 25H100C106 25 108 31 107 36C105 46 98 52 87 54" fill="none" stroke="${locked ? 'var(--line)' : G.light}" stroke-width="3" stroke-linecap="round"/>
    <path d="M53 73H67L65 90H55Z" fill="${fill}" stroke="${rim}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M42 90H78L82 98H38Z" fill="${fill}" stroke="${rim}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="${cup}" fill="${fill}" stroke="${rim}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M30 18H90" stroke="${rim}" stroke-width="5" stroke-linecap="round"/>
    ${locked ? '' : `<path d="M38 26V40C38 50 43 58 50 63" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" opacity=".55"/>`}
    ${anim ? `<rect x="-40" y="10" width="26" height="70" fill="url(#${id}s)" clip-path="url(#${id}c)" transform="skewX(-18)"><animate attributeName="x" values="-40;140;140" keyTimes="0;.45;1" dur="3.6s" repeatCount="indefinite"/></rect>` : ''}
    ${t.text ? textAt(t.text, 60, 44, t.text.length > 3 ? 14 : 18, ink) : iconAt(t.icon, 60, 44, 1.15, ink, 2.4)}
    <rect x="32" y="98" width="56" height="22" rx="4" fill="${locked ? 'var(--line)' : B.fill}" stroke="${locked ? 'var(--muted)' : B.rim}" stroke-width="2.4"/>
    <path d="M60 103l5 5.5-5 5.5-5-5.5z" fill="${locked ? 'var(--muted)' : J.fill}" stroke="${locked ? 'none' : J.rim}" stroke-width="1.2" stroke-linejoin="round" opacity="${locked ? .5 : 1}"/>
  </svg>`;
}

/* Brand wordmark: the ghost peeking out of the "o"-less word, kept simple and legible */
function wordmark(){
  return `<span class="wordmark">${mascotSvg('run', 34, { animate: false, label: '' })}<span>Doppel</span></span>`;
}

const esc_ = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
if (typeof module !== 'undefined' && module.exports) module.exports = { mascotSvg, medalSvg, trophySvg, material, mix };
