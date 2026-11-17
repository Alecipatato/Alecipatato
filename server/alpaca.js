import { config, assertAlpacaConfigured } from './config.js';

async function request(base, path, { method = 'GET', body, query } = {}) {
  assertAlpacaConfigured();
  const url = new URL(path, base);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url, {
    method,
    headers: {
      'APCA-API-KEY-ID': config.alpaca.keyId,
      'APCA-API-SECRET-KEY': config.alpaca.secretKey,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!res.ok) {
    const err = new Error(data?.message || `Alpaca HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const trading = (path, opts) => request(config.alpaca.tradingUrl, path, opts);
const market = (path, opts) => request(config.alpaca.dataUrl, path, opts);

export const getAccount = () => trading('/v2/account');
export const getClock = () => trading('/v2/clock');
export const getPositions = () => trading('/v2/positions');
export const getOpenOrders = () => trading('/v2/orders', { query: { status: 'open', limit: 500 } });
export const getClosedOrders = (limit = 50) =>
  trading('/v2/orders', { query: { status: 'closed', limit, direction: 'desc', nested: 'true' } });
export const getAsset = (symbol) => trading(`/v2/assets/${encodeURIComponent(symbol)}`);

export async function getSnapshots(symbols) {
  return market('/v2/stocks/snapshots', { query: { symbols: symbols.join(','), feed: config.alpaca.feed } });
}

export async function getLatestPrice(symbol) {
  const data = await market(`/v2/stocks/${encodeURIComponent(symbol)}/trades/latest`, {
    query: { feed: config.alpaca.feed },
  });
  return data.trade.p;
}

export async function getBars(symbol, timeframe = '5Min', limit = 200) {
  const start = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
  const data = await market(`/v2/stocks/${encodeURIComponent(symbol)}/bars`, {
    query: { timeframe, start, limit, sort: 'desc', feed: config.alpaca.feed, adjustment: 'raw' },
  });
  return (data.bars || []).reverse(); // ordre chronologique
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Ordre "bracket" : achat/vente au marché + stop-loss + take-profit
 * gérés directement par Alpaca (fonctionne même si cette app est fermée).
 */
export async function placeBracketOrder({ symbol, side, amount, slPct, tpPct }) {
  const price = await getLatestPrice(symbol);
  const qty = Math.floor(amount / price);
  if (qty < 1) {
    const err = new Error(`Montant trop faible : 1 action ${symbol} coûte ${price.toFixed(2)} $`);
    err.status = 400;
    throw err;
  }
  const long = side === 'buy';
  const stopPrice = round2(long ? price * (1 - slPct / 100) : price * (1 + slPct / 100));
  const takeProfit = round2(long ? price * (1 + tpPct / 100) : price * (1 - tpPct / 100));

  const order = await trading('/v2/orders', {
    method: 'POST',
    body: {
      symbol,
      qty: String(qty),
      side,
      type: 'market',
      time_in_force: 'gtc',
      order_class: 'bracket',
      take_profit: { limit_price: takeProfit.toFixed(2) },
      stop_loss: { stop_price: stopPrice.toFixed(2) },
    },
  });
  return { order, qty, price, stopPrice, takeProfit };
}

/** Ferme une position : annule d'abord ses ordres SL/TP, puis liquide. */
export async function closePosition(symbol) {
  const open = await getOpenOrders();
  await Promise.all(
    open.filter((o) => o.symbol === symbol)
      .map((o) => trading(`/v2/orders/${o.id}`, { method: 'DELETE' }).catch(() => {}))
  );
  // Laisse à Alpaca le temps de libérer les quantités bloquées par les ordres annulés
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await trading(`/v2/positions/${encodeURIComponent(symbol)}`, { method: 'DELETE' });
    } catch (err) {
      if (attempt === 4) throw err;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}
