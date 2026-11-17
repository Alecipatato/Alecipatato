import 'dotenv/config';

export const LIVE_CONFIRM_PHRASE = "J'ACCEPTE LES RISQUES";

const mode = (process.env.TRADING_MODE || 'paper').toLowerCase();
const liveConfirmed = process.env.LIVE_CONFIRM === LIVE_CONFIRM_PHRASE;

if (mode === 'live' && !liveConfirmed) {
  console.error(
    `\n[ERREUR] TRADING_MODE=live demande aussi LIVE_CONFIRM="${LIVE_CONFIRM_PHRASE}" dans le fichier .env.\n` +
    'Le serveur refuse de démarrer en argent réel sans cette confirmation.\n'
  );
  process.exit(1);
}

// Pour les tests uniquement : rediriger vers un faux serveur Alpaca local
function testOverride(name) {
  const v = process.env[name];
  if (!v) return null;
  const host = new URL(v).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    console.error(`[ERREUR] ${name} n'est autorisé que vers localhost.`);
    process.exit(1);
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  appPassword: process.env.APP_PASSWORD || '',

  live: mode === 'live',
  alpaca: {
    keyId: process.env.ALPACA_KEY_ID || '',
    secretKey: process.env.ALPACA_SECRET_KEY || '',
    tradingUrl: testOverride('TEST_ALPACA_URL') || (mode === 'live' ? 'https://api.alpaca.markets' : 'https://paper-api.alpaca.markets'),
    dataUrl: testOverride('TEST_ALPACA_URL') || 'https://data.alpaca.markets',
    feed: process.env.ALPACA_DATA_FEED || 'iex',
  },

  anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  claudeModel: process.env.CLAUDE_MODEL || 'claude-opus-5-5',

  // Garde-fous non modifiables depuis l'interface
  limits: {
    maxAmountPerTrade: Number(process.env.MAX_AMOUNT_PER_TRADE || 1000),
    maxDailyLossPct: Number(process.env.MAX_DAILY_LOSS_PCT || 3),
    maxBotPositions: Number(process.env.MAX_BOT_POSITIONS || 3),
  },
};

export function assertAlpacaConfigured() {
  if (!config.alpaca.keyId || !config.alpaca.secretKey) {
    const err = new Error('Clés Alpaca manquantes : renseignez ALPACA_KEY_ID et ALPACA_SECRET_KEY dans .env');
    err.status = 503;
    throw err;
  }
}
