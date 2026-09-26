// Configuration Stripe de RappelPro : produit, prix de 89,99 $/mois, coupon « premier mois -50 % »,
// portail client (annulation en libre-service) et webhook.
// Le résultat est enregistré dans un fichier, séparément pour le mode test et le mode réel :
// le serveur ne configure donc Stripe qu'une fois par mode, au premier démarrage.
'use strict';

const fs = require('node:fs');

function readState(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

async function ensureStripeSetup({ call, secretKey, publicUrl, stateFile, currency = 'cad', log = console.log }) {
  const mode = secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_') ? 'live' : 'test';
  const state = stateFile ? readState(stateFile) : {};
  const webhookUrl = `${publicUrl}/stripe/webhook`;
  if (state[mode] && state[mode].webhookUrl === webhookUrl) return state[mode];

  log(`Configuration de Stripe (mode ${mode === 'live' ? 'réel' : 'test'})…`);
  const product = await call('/products', {
    name: 'RappelPro',
    description: "Texto automatique aux appels manqués, demandes d'avis Google et bilan mensuel",
  });
  const price = await call('/prices', {
    product: product.id,
    currency,
    unit_amount: 8999,
    recurring: { interval: 'month' },
  });
  const coupon = await call('/coupons', { name: 'Premier mois -50 %', percent_off: 50, duration: 'once' });
  // Portail client : le commerçant y change sa carte, voit ses factures et annule (à la fin du mois payé).
  const portal = await call('/billing_portal/configurations', {
    business_profile: { headline: 'RappelPro : gérez votre abonnement' },
    default_return_url: `${publicUrl}/`,
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
    },
  });
  // Un ancien webhook vers la même adresse signerait avec un autre secret : on le remplace.
  const existing = await call('/webhook_endpoints?limit=100', null, 'GET');
  for (const w of existing.data.filter((w) => w.url === webhookUrl)) {
    await call(`/webhook_endpoints/${w.id}`, null, 'DELETE');
  }
  const webhook = await call('/webhook_endpoints', {
    url: webhookUrl,
    enabled_events: ['checkout.session.completed', 'customer.subscription.deleted'],
  });

  const config = {
    priceId: price.id,
    couponId: coupon.id,
    portalConfigId: portal.id,
    webhookSecret: webhook.secret,
    webhookUrl,
  };
  if (stateFile) {
    fs.writeFileSync(stateFile, JSON.stringify({ ...state, [mode]: config }, null, 2), { mode: 0o600 });
  }
  log('Stripe est configuré.');
  return config;
}

module.exports = { ensureStripeSetup };
