// Facultatif : le serveur configure Stripe tout seul au premier démarrage.
// Ce script sert seulement si tu préfères fixer les identifiants dans des variables d'environnement :
//   STRIPE_SECRET_KEY=sk_... PUBLIC_URL=https://ton-serveur node setup-stripe.js
'use strict';

const { makeStripe } = require('./providers');
const { ensureStripeSetup } = require('./stripe-setup');

async function main() {
  const { STRIPE_SECRET_KEY, PUBLIC_URL, CURRENCY = 'cad' } = process.env;
  if (!STRIPE_SECRET_KEY || !PUBLIC_URL) {
    console.error('Définis STRIPE_SECRET_KEY et PUBLIC_URL avant de lancer ce script.');
    process.exit(1);
  }
  const config = await ensureStripeSetup({
    call: makeStripe({ secretKey: STRIPE_SECRET_KEY }).call,
    secretKey: STRIPE_SECRET_KEY,
    publicUrl: PUBLIC_URL.replace(/\/$/, ''),
    currency: CURRENCY,
  });

  console.log("\nAjoute ces variables d'environnement à ton serveur :\n");
  console.log(`STRIPE_PRICE_ID=${config.priceId}`);
  console.log(`STRIPE_COUPON_ID=${config.couponId}`);
  console.log(`STRIPE_PORTAL_CONFIG_ID=${config.portalConfigId}`);
  console.log(`STRIPE_WEBHOOK_SECRET=${config.webhookSecret}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
