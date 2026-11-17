'use strict';

const $ = (id) => document.getElementById(id);
const fmt = (n, d = 2) => Number.isFinite(n)
  ? n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const usd = (n) => (Number.isFinite(n) ? fmt(n) + ' $' : '—');
const signed = (n, suffix = ' $') => (n >= 0 ? '+' : '') + fmt(n) + suffix;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ui = {
  status: null,
  state: null,
  bars: [],
  price: null,
  symbol: 'AAPL',
  timeframe: '5Min',
  botFormDirty: false,
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

/* ---------- Statut & configuration ---------- */

async function loadStatus() {
  ui.status = await api('/api/status');
  const badge = $('modeBadge');
  badge.textContent = ui.status.live ? 'ARGENT RÉEL' : 'COMPTE TEST';
  badge.className = 'mode ' + (ui.status.live ? 'live' : 'paper');

  const problems = [];
  if (!ui.status.alpacaConfigured) problems.push('clés Alpaca absentes (<code>ALPACA_KEY_ID</code>, <code>ALPACA_SECRET_KEY</code>)');
  if (!ui.status.claudeConfigured) problems.push('clé Claude absente (<code>ANTHROPIC_API_KEY</code>) : le robot ne passera aucun ordre avec la validation IA activée');
  if (problems.length) {
    $('setupBanner').innerHTML = '⚠️ Configuration incomplète : ' + problems.join(' — ') + '. Remplissez le fichier <code>.env</code> puis redémarrez.';
    $('setupBanner').classList.remove('hidden');
  }
}

/* ---------- Compte & positions ---------- */

async function refreshState() {
  let s;
  try {
    s = await api('/api/state');
  } catch (err) {
    $('marketStatus').textContent = 'Hors ligne';
    $('marketStatus').className = 'feed-status';
    return;
  }
  ui.state = s;
  $('cash').textContent = usd(s.account.cash);
  $('equity').textContent = usd(s.account.equity);
  const day = s.account.equity - s.account.lastEquity;
  $('dayPnl').textContent = signed(day);
  $('dayPnl').className = day >= 0 ? 'up' : 'down';

  $('marketStatus').textContent = s.clock.is_open ? 'Marché ouvert' : 'Marché fermé';
  $('marketStatus').className = 'feed-status ' + (s.clock.is_open ? 'live' : 'sim');

  const tbody = $('positions');
  tbody.innerHTML = s.positions.map((p) => `
    <tr>
      <td><b>${esc(p.symbol)}</b></td>
      <td><span class="tag ${p.side === 'long' ? 'long' : 'short'}">${p.side === 'long' ? 'ACHAT' : 'VENTE'}</span></td>
      <td>${fmt(Math.abs(p.qty), 0)}</td>
      <td>${usd(p.entry)}</td>
      <td>${usd(p.current)}</td>
      <td class="down">${p.stopLoss ? usd(p.stopLoss) : '—'}</td>
      <td class="up">${p.takeProfit ? usd(p.takeProfit) : '—'}</td>
      <td class="${p.pnl >= 0 ? 'up' : 'down'}">${signed(p.pnl)} (${signed(p.pnlPct, ' %')})</td>
      <td><button class="close-btn" data-close="${esc(p.symbol)}">Fermer</button></td>
    </tr>`).join('');
  $('noPositions').style.display = s.positions.length ? 'none' : 'block';
  $('pendingOrders').textContent = s.pendingOrders.length
    ? 'Ordres en attente d’exécution : ' + s.pendingOrders.map((o) => `${o.symbol} (${o.side === 'buy' ? 'achat' : 'vente'} ${o.qty})`).join(', ')
    : '';

  updatePreview();
  drawChart();
}

$('positions').addEventListener('click', async (e) => {
  const sym = e.target.dataset.close;
  if (!sym) return;
  if (!confirm(`Fermer la position ${sym} au prix du marché ?`)) return;
  e.target.disabled = true;
  try {
    await api(`/api/close/${encodeURIComponent(sym)}`, { method: 'POST' });
    toast(`Position ${sym} fermée`);
    setTimeout(() => { refreshState(); refreshHistory(); }, 1000);
  } catch (err) {
    toast(err.message, 'loss');
    e.target.disabled = false;
  }
});

async function refreshHistory() {
  try {
    const rows = await api('/api/history');
    $('history').innerHTML = rows.slice(0, 50).map((h) => `
      <tr>
        <td>${new Date(h.time).toLocaleString('fr-FR')}</td>
        <td><b>${esc(h.symbol)}</b></td>
        <td><span class="tag ${h.side === 'buy' ? 'long' : 'short'}">${h.side === 'buy' ? 'ACHAT' : 'VENTE'}</span></td>
        <td>${fmt(h.qty, 0)}</td>
        <td>${usd(h.price)}</td>
        <td>${esc(h.kind)}</td>
      </tr>`).join('');
    $('noHistory').style.display = rows.length ? 'none' : 'block';
  } catch { /* ignoré : affiché par la bannière */ }
}
$('refreshHistory').addEventListener('click', refreshHistory);

/* ---------- Prix & graphique ---------- */

async function loadBars() {
  try {
    ui.bars = await api(`/api/bars?symbol=${encodeURIComponent(ui.symbol)}&timeframe=${ui.timeframe}`);
  } catch (err) {
    ui.bars = [];
    toast(`${ui.symbol} : ${err.message}`, 'loss');
  }
  drawChart();
}

async function refreshQuote() {
  try {
    const q = (await api(`/api/quotes?symbols=${encodeURIComponent(ui.symbol)}`))[ui.symbol];
    if (!q) return;
    ui.price = q.price;
    $('price').textContent = usd(q.price);
    if (q.changePct !== null) {
      $('change').textContent = signed(q.changePct, ' %');
      $('change').className = 'change ' + (q.changePct >= 0 ? 'up' : 'down');
    }
    const last = ui.bars[ui.bars.length - 1];
    if (last) {
      last.c = q.price;
      last.h = Math.max(last.h, q.price);
      last.l = Math.min(last.l, q.price);
    }
    updatePreview();
    drawChart();
  } catch { /* réseau */ }
}

function drawChart() {
  const canvas = $('chart');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const bars = ui.bars.slice(-120);
  if (!bars.length) {
    ctx.fillStyle = '#8b949e';
    ctx.font = '14px sans-serif';
    ctx.fillText('Pas de données de prix', 20, 30);
    return;
  }

  const pos = ui.state?.positions.find((p) => p.symbol === ui.symbol);
  const levels = [];
  if (pos) {
    levels.push({ v: pos.entry, c: '#3b82f6', label: 'Entrée' });
    if (pos.stopLoss) levels.push({ v: pos.stopLoss, c: '#ef4444', label: 'SL' });
    if (pos.takeProfit) levels.push({ v: pos.takeProfit, c: '#22c55e', label: 'TP' });
  } else if (ui.preview) {
    levels.push({ v: ui.preview.slLong, c: '#ef4444', label: 'SL achat', dash: true });
    levels.push({ v: ui.preview.tpLong, c: '#22c55e', label: 'TP achat', dash: true });
  }

  let lo = Math.min(...bars.map((b) => b.l), ...levels.map((l) => l.v));
  let hi = Math.max(...bars.map((b) => b.h), ...levels.map((l) => l.v));
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad; hi += pad;

  const left = 10, right = 70, top = 10, bottom = 24;
  const cw = w - left - right, ch = h - top - bottom;
  const y = (v) => top + (1 - (v - lo) / (hi - lo)) * ch;
  const step = cw / bars.length;

  // grille
  ctx.strokeStyle = '#1f252e';
  ctx.fillStyle = '#8b949e';
  ctx.font = '11px sans-serif';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = lo + ((hi - lo) * i) / 4;
    ctx.beginPath(); ctx.moveTo(left, y(v)); ctx.lineTo(left + cw, y(v)); ctx.stroke();
    ctx.fillText(fmt(v), left + cw + 6, y(v) + 4);
  }

  // bougies
  bars.forEach((b, i) => {
    const x = left + i * step + step / 2;
    const up = b.c >= b.o;
    ctx.strokeStyle = ctx.fillStyle = up ? '#22c55e' : '#ef4444';
    ctx.beginPath(); ctx.moveTo(x, y(b.h)); ctx.lineTo(x, y(b.l)); ctx.stroke();
    const bw = Math.max(1, step * 0.6);
    const yo = y(b.o), yc = y(b.c);
    ctx.fillRect(x - bw / 2, Math.min(yo, yc), bw, Math.max(1, Math.abs(yc - yo)));
  });

  // niveaux
  levels.forEach((l) => {
    ctx.strokeStyle = l.c;
    ctx.setLineDash(l.dash ? [6, 4] : []);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(left, y(l.v)); ctx.lineTo(left + cw, y(l.v)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = l.c;
    ctx.fillRect(left + cw + 2, y(l.v) - 8, right - 4, 16);
    ctx.fillStyle = '#fff';
    ctx.fillText(fmt(l.v), left + cw + 6, y(l.v) + 4);
  });

  // dates
  ctx.fillStyle = '#8b949e';
  const daily = ui.timeframe === '1Day';
  for (let i = 0; i < bars.length; i += Math.ceil(bars.length / 6)) {
    const d = new Date(bars[i].t);
    const label = daily ? d.toLocaleDateString('fr-FR') : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    ctx.fillText(label, left + i * step, h - 6);
  }
}
window.addEventListener('resize', drawChart);

function changeSymbol() {
  const sym = $('symbol').value.trim().toUpperCase();
  if (!/^[A-Z.]{1,10}$/.test(sym) || sym === ui.symbol) return;
  ui.symbol = sym;
  ui.price = null;
  $('price').textContent = '—';
  $('change').textContent = '';
  loadBars();
  refreshQuote();
}
$('symbol').addEventListener('change', changeSymbol);
$('symbol').addEventListener('keydown', (e) => { if (e.key === 'Enter') changeSymbol(); });
$('timeframe').addEventListener('change', (e) => { ui.timeframe = e.target.value; loadBars(); });

/* ---------- Ordre manuel ---------- */

function readOrder() {
  const amount = Number($('amount').value);
  const slRaw = Number($('sl').value), tpRaw = Number($('tp').value);
  const slPct = $('slUnit').value === 'usd' ? (slRaw / amount) * 100 : slRaw;
  const tpPct = $('tpUnit').value === 'usd' ? (tpRaw / amount) * 100 : tpRaw;
  return { amount, slPct, tpPct };
}

function updatePreview() {
  const { amount, slPct, tpPct } = readOrder();
  const p = ui.price;
  const el = $('preview');
  if (!p || !(amount > 0)) { el.innerHTML = 'En attente du prix…'; ui.preview = null; return; }
  const qty = Math.floor(amount / p);
  const invested = qty * p;
  ui.preview = { slLong: p * (1 - slPct / 100), tpLong: p * (1 + tpPct / 100) };
  const maxLoss = (invested * slPct) / 100;
  const gain = (invested * tpPct) / 100;
  const ratio = slPct > 0 ? tpPct / slPct : 0;
  el.innerHTML = `
    <div class="row"><span>Quantité</span><b>${qty} action${qty > 1 ? 's' : ''} (${usd(invested)})</b></div>
    <div class="row"><span>Perte maximum</span><b class="down">−${usd(maxLoss)} (${fmt(slPct)} %)</b></div>
    <div class="row"><span>Gain visé</span><b class="up">+${usd(gain)} (${fmt(tpPct)} %)</b></div>
    <div class="row"><span>Si achat : SL / TP</span><span>${usd(p * (1 - slPct / 100))} / ${usd(p * (1 + tpPct / 100))}</span></div>
    <div class="row"><span>Si vente : SL / TP</span><span>${usd(p * (1 + slPct / 100))} / ${usd(p * (1 - tpPct / 100))}</span></div>
    <div class="row"><span>Rapport gain / risque</span><b>${fmt(ratio, 1)}</b></div>
    ${qty < 1 ? '<div class="down">Montant insuffisant pour acheter 1 action.</div>' : ''}`;
  const disabled = qty < 1 || !(slPct > 0) || !(tpPct > 0);
  $('buyBtn').disabled = $('sellBtn').disabled = disabled;
}
['amount', 'sl', 'tp', 'slUnit', 'tpUnit'].forEach((id) => $(id).addEventListener('input', () => { updatePreview(); drawChart(); }));

document.querySelectorAll('.quick button').forEach((b) => b.addEventListener('click', () => {
  const bp = ui.state?.account.buyingPower ?? 0;
  const max = ui.status?.limits.maxAmountPerTrade ?? Infinity;
  $('amount').value = Math.floor(Math.min(bp * Number(b.dataset.pct) / 100, max));
  updatePreview();
}));

async function placeOrder(side) {
  const { amount, slPct, tpPct } = readOrder();
  const label = side === 'buy' ? 'ACHETER' : 'VENDRE (à découvert)';
  const msg = `${label} ${ui.symbol} pour ${usd(amount)}\nPerte max ${fmt(slPct)} % — Objectif ${fmt(tpPct)} %`;
  if (ui.status?.live && !confirm('⚠️ ARGENT RÉEL ⚠️\n\n' + msg + '\n\nConfirmer ?')) return;
  $('buyBtn').disabled = $('sellBtn').disabled = true;
  try {
    const r = await api('/api/order', { method: 'POST', body: { symbol: ui.symbol, side, amount, slPct, tpPct } });
    toast(`Ordre envoyé : ${r.qty} ${ui.symbol} — SL ${usd(r.stopPrice)} / TP ${usd(r.takeProfit)}`, 'win');
    setTimeout(() => { refreshState(); refreshHistory(); }, 1500);
  } catch (err) {
    toast('Ordre refusé : ' + err.message, 'loss');
  } finally {
    updatePreview();
  }
}
$('buyBtn').addEventListener('click', () => placeOrder('buy'));
$('sellBtn').addEventListener('click', () => placeOrder('sell'));

/* ---------- Robot IA ---------- */

function fillBotForm(s) {
  $('botSymbols').value = s.symbols.join(', ');
  $('botAmount').value = s.amount;
  $('botSl').value = s.slPct;
  $('botTp').value = s.tpPct;
  $('botInterval').value = s.intervalMin;
  $('botConfidence').value = s.minConfidence;
  $('botClaude').checked = s.useClaude;
  $('botShort').checked = s.allowShort;
}

function renderBot(b) {
  if (!ui.botFormDirty) fillBotForm(b.settings);
  $('botState').textContent = b.enabled
    ? (b.running ? 'Analyse en cours…' : `Actif — prochaine analyse ${b.nextRun ? new Date(b.nextRun).toLocaleTimeString('fr-FR') : ''}`)
    : 'Arrêté';
  $('botState').className = 'bot-state ' + (b.enabled ? 'on' : '');
  $('botToggle').textContent = b.enabled ? 'Arrêter le robot' : 'Démarrer le robot';
  $('botToggle').className = 'toggle ' + (b.enabled ? 'on' : '');
  $('botLimits').textContent =
    `Garde-fous : ${usd(b.limits.maxAmountPerTrade)} max par trade · ${b.limits.maxBotPositions} positions max · ` +
    `arrêt automatique si perte du jour ≥ ${b.limits.maxDailyLossPct} %. ` +
    `Stratégie : croisement des moyennes mobiles 20/50 (bougies 5 min) filtré par le RSI, puis validation par Claude.`;
  $('botLogs').innerHTML = b.logs.length
    ? b.logs.map((l) => `<div class="${esc(l.level)}"><span class="t">${new Date(l.time).toLocaleTimeString('fr-FR')}</span>${esc(l.message)}</div>`).join('')
    : '<div class="t">Aucune activité. Démarrez le robot pour qu’il analyse le marché.</div>';
}

async function refreshBot() {
  try { renderBot(await api('/api/bot')); } catch { /* serveur indisponible */ }
}

['botSymbols', 'botAmount', 'botSl', 'botTp', 'botInterval', 'botConfidence', 'botClaude', 'botShort']
  .forEach((id) => $(id).addEventListener('input', () => { ui.botFormDirty = true; }));

async function saveBotSettings() {
  const settings = await api('/api/bot/settings', {
    method: 'POST',
    body: {
      symbols: $('botSymbols').value.split(','),
      amount: Number($('botAmount').value),
      slPct: Number($('botSl').value),
      tpPct: Number($('botTp').value),
      intervalMin: Number($('botInterval').value),
      minConfidence: Number($('botConfidence').value),
      useClaude: $('botClaude').checked,
      allowShort: $('botShort').checked,
    },
  });
  ui.botFormDirty = false;
  fillBotForm(settings);
  return settings;
}

$('botSave').addEventListener('click', async () => {
  try { await saveBotSettings(); toast('Réglages du robot enregistrés'); } catch (err) { toast(err.message, 'loss'); }
});

$('botToggle').addEventListener('click', async () => {
  try {
    const enabled = $('botToggle').classList.contains('on');
    if (!enabled) {
      if (ui.botFormDirty) await saveBotSettings();
      if (ui.status?.live && !confirm('⚠️ Le robot va passer des ordres en ARGENT RÉEL sans vous demander. Continuer ?')) return;
      if (!$('botClaude').checked && !confirm('La validation par Claude est désactivée : le robot suivra uniquement les indicateurs. Continuer ?')) return;
    }
    renderBot(await api(enabled ? '/api/bot/stop' : '/api/bot/start', { method: 'POST' }));
  } catch (err) { toast(err.message, 'loss'); }
});

$('botRunBtn').addEventListener('click', async () => {
  $('botRunBtn').disabled = true;
  try {
    if (ui.botFormDirty) await saveBotSettings();
    renderBot(await api('/api/bot/run', { method: 'POST' }));
    refreshState();
  } catch (err) { toast(err.message, 'loss'); } finally { $('botRunBtn').disabled = false; }
});

/* ---------- Démarrage ---------- */

(async function init() {
  try { await loadStatus(); } catch (err) { toast('Serveur injoignable : ' + err.message, 'loss'); }
  await Promise.all([refreshState(), loadBars(), refreshQuote(), refreshBot(), refreshHistory()]);
  setInterval(refreshQuote, 3000);
  setInterval(refreshState, 5000);
  setInterval(refreshBot, 4000);
  setInterval(loadBars, 60000);
  setInterval(refreshHistory, 30000);
})();
