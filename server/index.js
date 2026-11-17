import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import * as alpaca from './alpaca.js';
import { getBotState, startBot, stopBot, updateSettings, runCycle } from './bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// Mot de passe optionnel (authentification HTTP Basic, n'importe quel identifiant)
if (config.appPassword) {
  app.use((req, res, next) => {
    const header = req.headers.authorization || '';
    const [, b64] = header.split(' ');
    const pass = b64 ? Buffer.from(b64, 'base64').toString().split(':').slice(1).join(':') : '';
    if (pass === config.appPassword) return next();
    res.set('WWW-Authenticate', 'Basic realm="EasyTrade"').status(401).send('Mot de passe requis');
  });
}

app.use(express.static(path.join(__dirname, '..', 'public')));

const wrap = (fn) => async (req, res) => {
  try {
    res.json(await fn(req, res));
  } catch (err) {
    res.status(err.status && err.status < 600 ? err.status : 500).json({ error: err.message });
  }
};

app.get('/api/status', wrap(async () => ({
  live: config.live,
  alpacaConfigured: Boolean(config.alpaca.keyId && config.alpaca.secretKey),
  claudeConfigured: config.anthropicConfigured,
  limits: config.limits,
})));

app.get('/api/state', wrap(async () => {
  const [account, positions, openOrders, clock] = await Promise.all([
    alpaca.getAccount(), alpaca.getPositions(), alpaca.getOpenOrders(), alpaca.getClock(),
  ]);
  // Associe à chaque position ses ordres stop-loss (stop) et take-profit (limit)
  const enriched = positions.map((p) => {
    const legs = openOrders.filter((o) => o.symbol === p.symbol);
    const sl = legs.find((o) => o.type === 'stop' || o.type === 'stop_limit');
    const tp = legs.find((o) => o.type === 'limit');
    return {
      symbol: p.symbol,
      side: p.side,
      qty: Number(p.qty),
      entry: Number(p.avg_entry_price),
      current: Number(p.current_price),
      marketValue: Number(p.market_value),
      pnl: Number(p.unrealized_pl),
      pnlPct: Number(p.unrealized_plpc) * 100,
      stopLoss: sl ? Number(sl.stop_price) : null,
      takeProfit: tp ? Number(tp.limit_price) : null,
    };
  });
  return {
    account: {
      cash: Number(account.cash),
      equity: Number(account.equity),
      lastEquity: Number(account.last_equity),
      buyingPower: Number(account.buying_power),
      shortingEnabled: account.shorting_enabled,
      status: account.status,
    },
    clock,
    positions: enriched,
    pendingOrders: openOrders.filter((o) => !enriched.some((p) => p.symbol === o.symbol)).map((o) => ({
      symbol: o.symbol, side: o.side, type: o.type, qty: o.qty, status: o.status,
    })),
  };
}));

app.get('/api/quotes', wrap(async (req) => {
  const symbols = String(req.query.symbols || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 30);
  if (!symbols.length) return {};
  const snaps = await alpaca.getSnapshots(symbols);
  const out = {};
  for (const [sym, s] of Object.entries(snaps)) {
    if (!s) continue;
    const price = s.latestTrade?.p ?? s.minuteBar?.c;
    const prev = s.prevDailyBar?.c;
    out[sym] = { price, changePct: prev ? ((price - prev) / prev) * 100 : null };
  }
  return out;
}));

app.get('/api/bars', wrap(async (req) => {
  const symbol = String(req.query.symbol || '').toUpperCase();
  const timeframe = ['1Min', '5Min', '15Min', '1Hour', '1Day'].includes(req.query.timeframe) ? req.query.timeframe : '5Min';
  return alpaca.getBars(symbol, timeframe, 200);
}));

app.get('/api/history', wrap(async () => {
  const orders = await alpaca.getClosedOrders(100);
  const flat = [];
  for (const o of orders) {
    flat.push({ ...o, _kind: o.order_class === 'bracket' ? 'Ouverture' : 'Fermeture manuelle' });
    for (const leg of o.legs || []) {
      flat.push({ ...leg, _kind: leg.type === 'limit' ? 'Objectif atteint' : 'Stop-loss' });
    }
  }
  return flat
    .filter((o) => o.status === 'filled')
    .map((o) => ({
      time: o.filled_at,
      symbol: o.symbol,
      side: o.side,
      qty: Number(o.filled_qty),
      price: Number(o.filled_avg_price),
      kind: o._kind,
    }))
    .sort((a, b) => new Date(b.time) - new Date(a.time));
}));

app.post('/api/order', wrap(async (req) => {
  const { symbol, side, amount, slPct, tpPct } = req.body || {};
  const sym = String(symbol || '').toUpperCase();
  if (!/^[A-Z.]{1,10}$/.test(sym)) throw Object.assign(new Error('Symbole invalide'), { status: 400 });
  if (!['buy', 'sell'].includes(side)) throw Object.assign(new Error('Sens invalide'), { status: 400 });
  const amt = Number(amount), sl = Number(slPct), tp = Number(tpPct);
  if (!(amt > 0)) throw Object.assign(new Error('Montant invalide'), { status: 400 });
  if (amt > config.limits.maxAmountPerTrade) {
    throw Object.assign(new Error(`Montant limité à ${config.limits.maxAmountPerTrade} $ par ordre (MAX_AMOUNT_PER_TRADE)`), { status: 400 });
  }
  if (!(sl >= 0.1 && sl <= 50)) throw Object.assign(new Error('Perte max entre 0,1 % et 50 %'), { status: 400 });
  if (!(tp >= 0.1 && tp <= 200)) throw Object.assign(new Error('Objectif entre 0,1 % et 200 %'), { status: 400 });
  return alpaca.placeBracketOrder({ symbol: sym, side, amount: amt, slPct: sl, tpPct: tp });
}));

app.post('/api/close/:symbol', wrap(async (req) => {
  await alpaca.closePosition(String(req.params.symbol).toUpperCase());
  return { ok: true };
}));

app.get('/api/bot', wrap(async () => getBotState()));
app.post('/api/bot/settings', wrap(async (req) => updateSettings(req.body || {})));
app.post('/api/bot/start', wrap(async () => { startBot(); return getBotState(); }));
app.post('/api/bot/stop', wrap(async () => { stopBot(); return getBotState(); }));
app.post('/api/bot/run', wrap(async () => { await runCycle(); return getBotState(); }));

app.listen(config.port, config.host, () => {
  console.log(`\nEasyTrade démarré : http://${config.host}:${config.port}`);
  console.log(`Mode : ${config.live ? '⚠️  ARGENT RÉEL' : 'compte test (paper trading)'}`);
  if (!config.alpaca.keyId) console.log('⚠️  Clés Alpaca absentes : copiez .env.example vers .env et remplissez-le.');
  if (!config.anthropicConfigured) console.log('ℹ️  Pas de clé Anthropic : la validation par Claude sera désactivée (aucun ordre IA ne passera).');
});
