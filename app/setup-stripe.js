// Crée dans Stripe le produit, le prix de 89,99 $/mois, le coupon « premier mois -50 % »,
// le portail client (annulation en libre-service) et le webhook. À lancer une seule fois :
//   STRIPE_SECRET_KEY=sk_... PUBLIC_URL=https://ton-serveur node setup-stripe.js
'use strict';

const { makeStripe } = require('./providers');

async function main() {
  const { STRIPE_SECRET_KEY, PUBLIC_URL, CURRENCY = 'cad' } = process.env;
  if (!STRIPE_SECRET_KEY || !PUBLIC_URL) {
    console.error('Définis STRIPE_SECRET_KEY et PUBLIC_URL avant de lancer ce script.');
    process.exit(1);
  }
  const { call } = makeStripe({ secretKey: STRIPE_SECRET_KEY });

  const product = await call('/products', {
    name: 'RappelPro',
    description: "Texto automatique aux appels manqués, demandes d'avis Google et rapport mensuel",
  });
  const price = await call('/prices', {
    product: product.id,
    currency: CURRENCY,
    unit_amount: 8999,
    recurring: { interval: 'month' },
  });
  const coupon = await call('/coupons', { name: 'Premier mois -50 %', percent_off: 50, duration: 'once' });
  // Portail client : le commerçant y change sa carte, voit ses factures et annule (à la fin du mois payé).
  const portal = await call('/billing_portal/configurations', {
    business_profile: { headline: 'RappelPro : gérez votre abonnement' },
    default_return_url: `${PUBLIC_URL.replace(/\/$/, '')}/`,
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
    },
  });
  const webhook = await call('/webhook_endpoints', {
    url: `${PUBLIC_URL.replace(/\/$/, '')}/stripe/webhook`,
    enabled_events: ['checkout.session.completed', 'customer.subscription.deleted'],
  });

  console.log('Ajoute ces variables d\'environnement à ton serveur :\n');
  console.log(`STRIPE_PRICE_ID=${price.id}`);
  console.log(`STRIPE_COUPON_ID=${coupon.id}`);
  console.log(`STRIPE_PORTAL_CONFIG_ID=${portal.id}`);
  console.log(`STRIPE_WEBHOOK_SECRET=${webhook.secret}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
