import { config } from './config.js';
import * as alpaca from './alpaca.js';
import { computeSignal } from './indicators.js';
import { validateSignal } from './ai.js';

const state = {
  enabled: false,
  running: false,
  lastRun: null,
  nextRun: null,
  settings: {
    symbols: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN'],
    amount: 200,          // USD par trade
    slPct: 2,             // perte max %
    tpPct: 4,             // objectif %
    intervalMin: 5,
    allowShort: false,
    useClaude: true,
    minConfidence: 65,
  },
  logs: [],
  lastSignalBar: {},      // symbol -> horodatage de la bougie du dernier signal traité
};

let timer = null;

function log(level, message) {
  state.logs.unshift({ time: new Date().toISOString(), level, message });
  state.logs.length = Math.min(state.logs.length, 200);
  console.log(`[bot][${level}] ${message}`);
}

export function getBotState() {
  return {
    enabled: state.enabled,
    running: state.running,
    lastRun: state.lastRun,
    nextRun: state.nextRun,
    settings: state.settings,
    logs: state.logs.slice(0, 100),
    limits: config.limits,
    claudeAvailable: config.anthropicConfigured,
  };
}

export function updateSettings(input) {
  const s = { ...state.settings };
  if (Array.isArray(input.symbols)) {
    s.symbols = [...new Set(input.symbols.map((x) => String(x).trim().toUpperCase()).filter((x) => /^[A-Z.]{1,10}$/.test(x)))].slice(0, 20);
  }
  const num = (v, min, max) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    return Math.min(max, Math.max(min, n));
  };
  if (input.amount !== undefined) s.amount = num(input.amount, 1, config.limits.maxAmountPerTrade) ?? s.amount;
  if (input.slPct !== undefined) s.slPct = num(input.slPct, 0.2, 50) ?? s.slPct;
  if (input.tpPct !== undefined) s.tpPct = num(input.tpPct, 0.2, 200) ?? s.tpPct;
  if (input.intervalMin !== undefined) s.intervalMin = num(input.intervalMin, 1, 120) ?? s.intervalMin;
  if (input.minConfidence !== undefined) s.minConfidence = num(input.minConfidence, 0, 100) ?? s.minConfidence;
  if (input.allowShort !== undefined) s.allowShort = Boolean(input.allowShort);
  if (input.useClaude !== undefined) s.useClaude = Boolean(input.useClaude);
  state.settings = s;
  if (state.enabled) schedule(); // applique le nouvel intervalle
  return state.settings;
}

function schedule() {
  clearTimeout(timer);
  const ms = state.settings.intervalMin * 60 * 1000;
  state.nextRun = new Date(Date.now() + ms).toISOString();
  timer = setTimeout(async () => {
    await runCycle();
    if (state.enabled) schedule();
  }, ms);
}

export async function startBot() {
  if (state.enabled) return;
  state.enabled = true;
  log('info', `Robot démarré (${config.live ? 'ARGENT RÉEL' : 'compte test'}) sur ${state.settings.symbols.join(', ')}`);
  await runCycle();
  if (state.enabled) schedule();
}

export function stopBot(reason = 'Robot arrêté par l’utilisateur') {
  state.enabled = false;
  state.nextRun = null;
  clearTimeout(timer);
  log('info', reason);
}

/** trade=false : analyse seule (aucun ordre), utilisé par « Analyser maintenant » quand le robot est arrêté. */
export async function runCycle({ trade = state.enabled } = {}) {
  if (state.running) return;
  state.running = true;
  state.lastRun = new Date().toISOString();
  try {
    const [clock, account, positions, openOrders] = await Promise.all([
      alpaca.getClock(), alpaca.getAccount(), alpaca.getPositions(), alpaca.getOpenOrders(),
    ]);

    // Garde-fou : perte journalière maximum
    const equity = Number(account.equity);
    const lastEquity = Number(account.last_equity);
    const dayLossPct = lastEquity > 0 ? ((lastEquity - equity) / lastEquity) * 100 : 0;
    if (dayLossPct >= config.limits.maxDailyLossPct) {
      stopBot(`Arrêt de sécurité : perte du jour ${dayLossPct.toFixed(2)}% ≥ limite ${config.limits.maxDailyLossPct}%`);
      return;
    }

    if (!clock.is_open) {
      log('info', `Marché fermé. Prochaine ouverture : ${new Date(clock.next_open).toLocaleString('fr-FR')}`);
      return;
    }

    if (positions.length >= config.limits.maxBotPositions) {
      log('info', `Nombre maximum de positions atteint (${positions.length}/${config.limits.maxBotPositions}), pas de nouvel ordre`);
      return;
    }

    const busy = new Set([...positions.map((p) => p.symbol), ...openOrders.map((o) => o.symbol)]);
    let openCount = positions.length;
    const { symbols, amount, slPct, tpPct, allowShort, useClaude, minConfidence } = state.settings;
    const cappedAmount = Math.min(amount, config.limits.maxAmountPerTrade, Number(account.buying_power));

    const quiet = [];
    const held = symbols.filter((s) => busy.has(s));
    for (const symbol of symbols) {
      if (trade && !state.enabled) break; // robot arrêté pendant l'analyse
      if (openCount >= config.limits.maxBotPositions) break;
      if (busy.has(symbol)) continue;

      let bars;
      try {
        bars = await alpaca.getBars(symbol, '5Min', 200);
      } catch (err) {
        log('error', `${symbol} : impossible de lire les prix (${err.message})`);
        continue;
      }

      const signal = computeSignal(bars);
      if (!signal.side) {
        quiet.push(signal.rsi != null ? `${symbol} (RSI ${signal.rsi.toFixed(0)})` : `${symbol} (${signal.reason})`);
        continue;
      }
      if (signal.side === 'sell' && !allowShort) {
        log('info', `${symbol} : signal de baisse ignoré (vente à découvert désactivée)`);
        state.lastSignalBar[symbol] = signal.barTime;
        continue;
      }
      if (state.lastSignalBar[symbol] === signal.barTime) continue; // déjà traité
      state.lastSignalBar[symbol] = signal.barTime;

      log('signal', `${symbol} : ${signal.side === 'buy' ? 'ACHAT' : 'VENTE'} proposé — ${signal.reason}`);

      if (useClaude) {
        const verdict = await validateSignal({ symbol, signal, bars, slPct, tpPct });
        const ok = verdict.decision === 'approve' && verdict.confidence >= minConfidence;
        log(ok ? 'ai-ok' : 'ai-no',
          `${symbol} : Claude ${verdict.decision === 'approve' ? 'approuve' : 'rejette'} (confiance ${verdict.confidence}%) — ${verdict.reason}`);
        if (!ok) continue;
      }

      if (!trade) {
        log('info', `${symbol} : analyse seule (robot arrêté), aucun ordre passé`);
        continue;
      }

      try {
        const r = await alpaca.placeBracketOrder({ symbol, side: signal.side, amount: cappedAmount, slPct, tpPct });
        openCount++;
        busy.add(symbol);
        log('order', `${symbol} : ordre ${signal.side === 'buy' ? 'ACHAT' : 'VENTE'} ${r.qty} actions ~${r.price.toFixed(2)} $ | SL ${r.stopPrice} $ | TP ${r.takeProfit} $`);
      } catch (err) {
        log('error', `${symbol} : ordre refusé par Alpaca — ${err.message}`);
      }
    }
    if (quiet.length) log('info', `Pas de signal : ${quiet.join(', ')}`);
    if (held.length) log('info', `Déjà en position ou ordre en cours : ${held.join(', ')}`);
  } catch (err) {
    log('error', `Cycle interrompu : ${err.message}`);
  } finally {
    state.running = false;
  }
}
