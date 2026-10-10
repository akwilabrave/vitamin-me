"use strict";
/* ================================================================
   Vitamin Me — reward shop
   Balance = points earned (scoring ledger, recomputed live) − points spent (stored redemptions).
   Costs of suggested rewards are expressed in "weeks of training" and converted using
   your recent weekly average, so suggestions stay meaningful whatever the scoring parameters.
   Loaded before app.js; uses its globals (store, getLedger, $, esc, nf, toast, route) at call time.
   ================================================================ */
const SHOP_KEY = 'vm.shop';

const SUGGESTIONS = [
  // group, weeks of training, name
  ['Small treats',   0.5,  'Coffee at your favourite spot'],
  ['Small treats',   0.5,  'Takeaway meal of your choice'],
  ['Small treats',   0.5,  'Guilt-free gaming or series night'],
  ['Small treats',   0.75, 'New pair of running socks'],
  ['Small treats',   1,    'A lie-in with no alarm'],
  ['Bigger rewards', 2,    'Movie night out'],
  ['Bigger rewards', 2,    'Sit-down meal at a restaurant'],
  ['Bigger rewards', 2.5,  'New running cap or race belt'],
  ['Bigger rewards', 3,    'A new game or album'],
  ['Big goals',      6,    'Entry to a 10 km or half-marathon race'],
  ['Big goals',      8,    'Sports massage'],
  ['Big goals',      12,   'New running shoes'],
  ['Big goals',      16,   'Weekend away'],
];

const shop = () => store.get(SHOP_KEY, { items: [], redemptions: [], goalId: null });
const setShop = s => { store.set(SHOP_KEY, s); if (typeof scheduleBackup === 'function') scheduleBackup(); };
const spent = () => shop().redemptions.reduce((s, r) => s + r.cost, 0);
const balance = () => getLedger().total - spent();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* Average points per week over the last 4 completed weeks; 300 until there is real data. */
function weeklyRate(){
  const cur = Scoring.weekKey(new Date());
  const ws = Object.values(getLedger().weeks).filter(w => w.key < cur).sort((a, b) => b.key.localeCompare(a.key)).slice(0, 4);
  const avg = ws.length ? ws.reduce((s, w) => s + w.total, 0) / ws.length : 0;
  return avg >= 50 ? Math.round(avg) : 300;
}
const costFor = weeks => Math.max(50, Math.round(weeks * weeklyRate() / 50) * 50);
function weeksText(pts){
  const w = pts / weeklyRate();
  if (w < 0.25) return 'a few days of training';
  if (w < 0.75) return 'about half a week of training';
  if (w < 1.5) return 'about a week of training';
  return `about ${Math.round(w)} weeks of training`;
}
const visibleItems = s => s.items.filter(i => i.repeatable || !s.redemptions.some(r => r.itemId === i.id));

/* ---------------- home-screen goal card (used by app.js) ---------------- */
function goalCardHtml(){
  const s = shop(), g = s.items.find(i => i.id === s.goalId);
  if (!g || !visibleItems(s).includes(g)) return '';
  const bal = balance(), pct = Math.max(0, Math.min(100, bal / g.cost * 100)), left = g.cost - bal;
  return `<a class="goal" href="#/shop">
      <div class="goalrow"><span>Saving for <b>${esc(g.name)}</b></span><span class="num">${nf(Math.max(0, bal))} / ${nf(g.cost)}</span></div>
      <div class="capsule"><i style="width:${pct}%"></i></div>
      <div class="lbl">${left <= 0 ? 'Ready to redeem' : `${nf(left)} to go, ${weeksText(left)}`}</div>
    </a>`;
}

/* ---------------- views ---------------- */
function viewShop(){
  const s = shop(), L = getLedger(), bal = balance(), items = visibleItems(s).sort((a, b) => a.cost - b.cost);
  let html = `<h1 class="brand">Shop</h1>
    <div class="points"><span class="bal">${nf(bal)}</span><span class="unit">points to spend</span></div>
    <div class="pointsub"><span>Earned <b>${nf(L.total)}</b></span><span>Spent <b>${nf(spent())}</b></span><span>About <b>${nf(weeklyRate())}</b> a week</span></div>`;

  if (!s.items.length){
    return html + `<div class="empty">Your shop is empty. Pick rewards you'd genuinely work for, and spend your points on them.
      <button class="btn go" data-go="#/shop/suggest">Set up your shop</button>
      <button class="btn" data-go="#/shop/edit/new">Add your own reward</button></div>`;
  }

  html += goalCardHtml();
  html += `<h2>Rewards</h2>` + (items.length ? items.map(i => {
    const ok = bal >= i.cost;
    return `<div class="item">
      <a href="#/shop/edit/${i.id}" class="iname"><div class="t">${esc(i.name)}${s.goalId === i.id ? ' <span class="chip">Goal</span>' : ''}</div>
        <div class="m">${ok ? 'You can redeem this now' : `${nf(i.cost - bal)} more, ${weeksText(i.cost - bal)}`}${i.repeatable ? '' : ', one-off'}</div></a>
      <div class="icost num">${nf(i.cost)}</div>
      <button class="redeem ${ok ? 'go' : ''}" data-redeem="${i.id}" ${ok ? '' : 'disabled'} aria-label="Redeem ${esc(i.name)}">Redeem</button>
    </div>`;
  }).join('') : `<p class="hint">Every reward has been redeemed. Add new ones below.</p>`);

  html += `<button class="btn go" data-go="#/shop/edit/new">Add your own reward</button>
    <button class="btn" data-go="#/shop/suggest">Browse suggestions</button>`;

  if (s.redemptions.length){
    html += `<h2>Redeemed</h2>` + s.redemptions.slice().reverse().map(r => `<div class="item hist">
      <div><div class="t">${esc(r.name)}</div><div class="m">${new Date(r.at).toLocaleString('en-ZA', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</div></div>
      <div class="icost num">−${nf(r.cost)}</div>
      <button class="redeem" data-undo="${r.id}">Undo</button></div>`).join('');
  }
  return html;
}

function viewSuggest(){
  const s = shop(), have = new Set(s.items.map(i => i.name.toLowerCase()));
  const avail = SUGGESTIONS.filter(x => !have.has(x[2].toLowerCase()));
  let html = `<button class="back" data-go="#/shop">Shop</button><h1 class="brand">Suggested rewards</h1>
    <p class="hint">Costs are based on your recent average of about ${nf(weeklyRate())} points a week. Tick the ones you want and change any cost before adding.</p>`;
  if (!avail.length) return html + `<div class="empty">You've added every suggestion. Add your own rewards from the shop.</div>`;
  let grp = '';
  avail.forEach((x, n) => {
    if (x[0] !== grp){ html += `<div class="grp">${x[0]}</div>`; grp = x[0]; }
    const c = costFor(x[1]);
    html += `<label class="sug"><input type="checkbox" data-sug="${n}" ${x[0] === 'Small treats' ? 'checked' : ''}>
      <span><span class="t">${esc(x[2])}</span><small>${weeksText(c)}</small></span>
      <input type="number" inputmode="numeric" class="sugcost" data-sugcost="${n}" value="${c}" aria-label="Cost in points"></label>`;
  });
  html += `<button class="btn go" id="addSug">Add selected rewards</button>`;
  viewSuggest.avail = avail;
  return html;
}

function viewEdit(id){
  const s = shop(), isNew = id === 'new', i = isNew ? { name: '', cost: costFor(1), repeatable: true } : s.items.find(x => x.id === id);
  if (!i) return `<button class="back" data-go="#/shop">Shop</button><div class="empty">Reward not found.</div>`;
  return `<button class="back" data-go="#/shop">Shop</button>
    <h1 class="brand">${isNew ? 'New reward' : 'Edit reward'}</h1>
    <div class="field"><label for="rName">Reward</label><input id="rName" maxlength="80" value="${esc(i.name)}" placeholder="e.g. New running shoes"></div>
    <div class="field"><label for="rCost">Cost in points</label><input id="rCost" type="number" inputmode="numeric" value="${i.cost}"></div>
    <p class="hint" id="rHint">${weeksText(i.cost)} at your current pace.</p>
    <label class="check"><input type="checkbox" id="rRep" ${i.repeatable ? 'checked' : ''}> Can be redeemed more than once</label>
    <label class="check"><input type="checkbox" id="rGoal" ${!isNew && s.goalId === i.id ? 'checked' : ''}> Show as my savings goal on the home screen</label>
    <button class="btn go" id="rSave">${isNew ? 'Add reward' : 'Save changes'}</button>
    ${isNew ? '' : '<button class="btn danger" id="rDel">Delete reward</button>'}`;
}

/* ---------------- actions ---------------- */
function bindShop(view, id){
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { location.hash = b.dataset.go; });

  document.querySelectorAll('[data-redeem]').forEach(b => b.onclick = () => {
    const s = shop(), i = s.items.find(x => x.id === b.dataset.redeem);
    if (!i || balance() < i.cost) return;
    if (!confirm(`Redeem "${i.name}" for ${nf(i.cost)} points?`)) return;
    s.redemptions.push({ id: uid(), itemId: i.id, name: i.name, cost: i.cost, at: new Date().toISOString() });
    if (!i.repeatable && s.goalId === i.id) s.goalId = null;
    setShop(s); route();
    toast(`Redeemed: ${i.name}. You earned it.`);
  });
  document.querySelectorAll('[data-undo]').forEach(b => b.onclick = () => {
    const s = shop(), r = s.redemptions.find(x => x.id === b.dataset.undo);
    if (!r || !confirm(`Undo "${r.name}" and refund ${nf(r.cost)} points?`)) return;
    s.redemptions = s.redemptions.filter(x => x !== r);
    setShop(s); route(); toast(`Refunded ${nf(r.cost)} points.`);
  });

  if (view === 'suggest'){
    const add = $('addSug'); if (add) add.onclick = () => {
      const s = shop(); let n = 0;
      document.querySelectorAll('[data-sug]').forEach(cb => {
        if (!cb.checked) return;
        const x = viewSuggest.avail[+cb.dataset.sug], c = parseInt(document.querySelector(`[data-sugcost="${cb.dataset.sug}"]`).value, 10);
        s.items.push({ id: uid(), name: x[2], cost: c > 0 ? c : costFor(x[1]), repeatable: x[0] !== 'Big goals' });
        n++;
      });
      if (!n){ toast('Tick at least one reward.', true); return; }
      setShop(s); location.hash = '#/shop'; toast(`Added ${n} reward${n > 1 ? 's' : ''}.`);
    };
  }

  if (view === 'edit'){
    const cost = $('rCost'); if (cost) cost.oninput = () => { const v = parseInt(cost.value, 10); $('rHint').textContent = v > 0 ? `${weeksText(v)} at your current pace.` : ''; };
    const save = $('rSave'); if (save) save.onclick = () => {
      const name = $('rName').value.trim(), c = parseInt($('rCost').value, 10);
      if (!name){ toast('Give the reward a name.', true); return; }
      if (!(c > 0)){ toast('Set a cost of at least 1 point.', true); return; }
      const s = shop();
      let item = s.items.find(x => x.id === id);
      if (!item){ item = { id: uid() }; s.items.push(item); }
      Object.assign(item, { name, cost: c, repeatable: $('rRep').checked });
      if ($('rGoal').checked) s.goalId = item.id; else if (s.goalId === item.id) s.goalId = null;
      setShop(s); location.hash = '#/shop'; toast(id === 'new' ? 'Reward added.' : 'Reward saved.');
    };
    const del = $('rDel'); if (del) del.onclick = () => {
      if (!confirm('Delete this reward? Past redemptions stay in your history.')) return;
      const s = shop(); s.items = s.items.filter(x => x.id !== id); if (s.goalId === id) s.goalId = null;
      setShop(s); location.hash = '#/shop'; toast('Reward deleted.');
    };
  }
}

function routeShop(h){
  if (h === '#/shop/suggest'){ $('view').innerHTML = viewSuggest(); bindShop('suggest'); return true; }
  if (h.startsWith('#/shop/edit/')){ const id = h.slice(12); $('view').innerHTML = viewEdit(id); bindShop('edit', id); return true; }
  if (h === '#/shop'){ $('view').innerHTML = viewShop(); bindShop('shop'); return true; }
  return false;
}
