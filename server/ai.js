import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

const DECISION_SCHEMA = {
  type: 'object',
  properties: {
    decision: { type: 'string', enum: ['approve', 'reject'] },
    confidence: { type: 'integer', description: 'Confiance de 0 à 100' },
    reason: { type: 'string', description: 'Explication courte en français (2 phrases max)' },
  },
  required: ['decision', 'confidence', 'reason'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Tu es un analyste de risque pour un robot de trading d'actions américaines.
Un indicateur technique propose un ordre. Ton rôle est de l'approuver ou de le rejeter.
Sois prudent : en cas de doute, rejette. Rejette notamment si la tendance récente contredit le signal,
si la volatilité rend le stop-loss trop serré (risque d'être sorti par le bruit), si le volume est anormalement faible,
ou si le rapport gain/risque est défavorable. Tu ne disposes que des données fournies : ne suppose aucune actualité.
Réponds en français.`;

/**
 * Demande à Claude de valider un signal technique.
 * Retourne { decision, confidence, reason }. Toute erreur ou refus => 'reject' (aucun ordre).
 */
export async function validateSignal({ symbol, signal, bars, slPct, tpPct }) {
  if (!config.anthropicConfigured) {
    return { decision: 'reject', confidence: 0, reason: 'Clé ANTHROPIC_API_KEY absente : validation IA impossible.' };
  }

  const recent = bars.slice(-40).map((b) => ({
    t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v,
  }));

  const userContent = `Action : ${symbol}
Ordre proposé : ${signal.side === 'buy' ? 'ACHAT (pari à la hausse)' : 'VENTE À DÉCOUVERT (pari à la baisse)'}
Raison technique : ${signal.reason}
Prix actuel : ${signal.price.toFixed(2)} $
Moyenne mobile rapide : ${signal.smaFast.toFixed(2)} | lente : ${signal.smaSlow.toFixed(2)} | RSI(14) : ${signal.rsi.toFixed(1)}
Stop-loss : ${slPct}% | Objectif (take-profit) : ${tpPct}%

40 dernières bougies de 5 minutes (JSON, t=heure UTC, o/h/l/c=prix, v=volume) :
${JSON.stringify(recent)}`;

  try {
    const response = await getClient().beta.messages.create({
      model: config.claudeModel,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: DECISION_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });

    if (response.stop_reason === 'refusal') {
      return { decision: 'reject', confidence: 0, reason: 'L’IA a refusé d’analyser ce signal.' };
    }
    if (response.stop_reason === 'max_tokens') {
      return { decision: 'reject', confidence: 0, reason: 'Réponse de l’IA incomplète.' };
    }
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const parsed = JSON.parse(text);
    return {
      decision: parsed.decision === 'approve' ? 'approve' : 'reject',
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
      reason: String(parsed.reason || ''),
    };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { decision: 'reject', confidence: 0, reason: 'Clé API Anthropic invalide.' };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { decision: 'reject', confidence: 0, reason: 'Limite de requêtes Anthropic atteinte, réessai au prochain cycle.' };
    }
    if (err instanceof Anthropic.APIError) {
      return { decision: 'reject', confidence: 0, reason: `Erreur API Claude (${err.status ?? 'réseau'}) : ${err.message}` };
    }
    return { decision: 'reject', confidence: 0, reason: `Erreur IA : ${err.message}` };
  }
}
