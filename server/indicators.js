export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** RSI de Wilder */
export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

/**
 * Signal technique : croisement de moyennes mobiles (rapide/lente)
 * sur les `lookback` dernières bougies, filtré par le RSI.
 * Retourne { side: 'buy' | 'sell' | null, ... }.
 */
export function computeSignal(bars, { fast = 20, slow = 50, rsiPeriod = 14, lookback = 3 } = {}) {
  const closes = bars.map((b) => b.c);
  if (closes.length < slow + lookback + 1) {
    return { side: null, reason: 'Pas assez d’historique' };
  }
  const f = sma(closes, fast);
  const s = sma(closes, slow);
  const r = rsi(closes, rsiPeriod);
  const n = closes.length - 1;

  let crossUpAt = null, crossDownAt = null;
  for (let i = n - lookback + 1; i <= n; i++) {
    if (f[i - 1] <= s[i - 1] && f[i] > s[i]) crossUpAt = i;
    if (f[i - 1] >= s[i - 1] && f[i] < s[i]) crossDownAt = i;
  }

  const ind = {
    price: closes[n],
    smaFast: f[n],
    smaSlow: s[n],
    rsi: r[n],
  };

  if (crossUpAt !== null && f[n] > s[n] && r[n] < 70) {
    return { side: 'buy', barTime: bars[crossUpAt].t, reason: `MM${fast} croise au-dessus de MM${slow}, RSI ${r[n].toFixed(0)}`, ...ind };
  }
  if (crossDownAt !== null && f[n] < s[n] && r[n] > 30) {
    return { side: 'sell', barTime: bars[crossDownAt].t, reason: `MM${fast} croise en dessous de MM${slow}, RSI ${r[n].toFixed(0)}`, ...ind };
  }
  return { side: null, reason: 'Aucun croisement', ...ind };
}
