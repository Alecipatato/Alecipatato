'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp, isValidTwilioSignature, normalizePhone } = require('./server');
const { createStore } = require('./store');
const { isValidStripeSignature, flatten } = require('./providers');

const BIZ = '+15145550100';
const OWNER = '+15145559999';
const CALLER = '+14385551234';
const TOKEN = 'test-token';
const WHSEC = 'whsec_test';
const NOW = new Date('2026-09-15T12:00:00Z');
const clients = {
  [BIZ]: {
    name: 'Plomberie Tremblay',
    ownerPhone: OWNER,
    missedCallMessage: 'Bonjour, ici {business}. Désolé !',
    reviewLink: 'https://g.page/r/abc/review',
  },
};

function sign(url, params) {
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  return crypto.createHmac('sha1', TOKEN).update(data).digest('base64');
}

function stripeSignature(body, t = Math.floor(NOW.getTime() / 1000)) {
  return `t=${t},v1=${crypto.createHmac('sha256', WHSEC).update(`${t}.${body}`).digest('hex')}`;
}

let current;
const server = () => current;

async function withApp(fn, overrides = {}) {
  const sent = [];
  const bought = [];
  const released = [];
  const checkouts = [];
  const portals = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rappelpro-'));
  const storeFile = path.join(dir, 'clients.json');
  const store = createStore(storeFile, clients);
  const server = createApp({
    store,
    sendSms: async (m) => sent.push(m),
    numbers: {
      async buy(opts) {
        bought.push(opts);
        return { phoneNumber: `+1${opts.areaCode}5550200`, sid: 'PN123' };
      },
      async release(sid) {
        released.push(sid);
      },
    },
    stripe: {
      async createCheckout(params) {
        checkouts.push(params);
        return { url: 'https://checkout.stripe.com/c/pay/cs_test_1' };
      },
      async createPortalSession(params) {
        portals.push(params);
        return { url: 'https://billing.stripe.com/p/session/test_1' };
      },
    },
    stripeWebhookSecret: WHSEC,
    stripePriceId: 'price_123',
    stripeCouponId: 'coupon_50',
    stripePortalConfigId: 'bpc_1',
    authToken: TOKEN,
    publicUrl: 'https://exemple.com',
    apiKey: 'secret',
    eventsFile: path.join(dir, 'events.jsonl'),
    siteDir: path.join(__dirname, '..', 'site'),
    business: { email: 'bonjour@exemple.ca', legalName: 'Services Exemple inc.' },
    now: () => NOW,
    ...overrides,
  });
  current = server;
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ base, sent, bought, released, checkouts, portals, store, storeFile });
  } finally {
    server.close();
  }
}

function twilioPost(base, route, params, signature = sign('https://exemple.com' + route, params)) {
  return fetch(base + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': signature },
    body: new URLSearchParams(params),
  });
}

function stripePost(base, event, signature) {
  const body = JSON.stringify(event);
  return fetch(base + '/stripe/webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': signature || stripeSignature(body) },
    body,
  });
}

const checkoutCompleted = {
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_1',
      subscription: 'sub_1',
      customer: 'cus_1',
      customer_details: { email: 'marie@garagelavoie.ca' },
      metadata: { business: 'Garage Lavoie', ownerPhone: '+18195554321', reviewLink: 'https://g.page/r/xyz/review' },
    },
  },
};

test('signature Twilio : accepte la bonne, refuse une fausse', () => {
  const params = { From: CALLER, To: BIZ };
  const url = 'https://exemple.com/voice';
  assert.ok(isValidTwilioSignature(TOKEN, url, params, sign(url, params)));
  assert.ok(!isValidTwilioSignature(TOKEN, url, params, 'faux'));
  assert.ok(!isValidTwilioSignature(TOKEN, url, params, undefined));
});

test('signature Stripe : accepte la bonne, refuse fausse ou périmée', () => {
  const t = 1_800_000_000;
  const good = stripeSignature('{"a":1}', t);
  assert.ok(isValidStripeSignature(WHSEC, '{"a":1}', good, t));
  assert.ok(!isValidStripeSignature(WHSEC, '{"a":2}', good, t));
  assert.ok(!isValidStripeSignature(WHSEC, '{"a":1}', good, t + 600));
  assert.ok(!isValidStripeSignature(WHSEC, '{"a":1}', undefined, t));
});

test('paramètres Stripe imbriqués', () => {
  assert.deepStrictEqual(flatten({ line_items: [{ price: 'p', quantity: 1 }], discounts: undefined, metadata: { a: 'b' } }), {
    'line_items[0][price]': 'p',
    'line_items[0][quantity]': '1',
    'metadata[a]': 'b',
  });
});

test('numéros de téléphone : formats courants acceptés', () => {
  assert.strictEqual(normalizePhone('514 555-1234'), '+15145551234');
  assert.strictEqual(normalizePhone('1 (514) 555-1234'), '+15145551234');
  assert.strictEqual(normalizePhone('+15145551234'), '+15145551234');
  assert.strictEqual(normalizePhone('555-1234'), null);
  assert.strictEqual(normalizePhone(''), null);
});

test('appel manqué : texte l\'appelant et prévient le propriétaire', async () => {
  await withApp(async ({ base, sent }) => {
    const res = await twilioPost(base, '/voice', { From: CALLER, To: BIZ });
    assert.strictEqual(res.status, 200);
    assert.match(await res.text(), /<Say language="fr-CA">.*Plomberie Tremblay.*<\/Say><Hangup\/>/);
    assert.deepStrictEqual(sent[0], { from: BIZ, to: CALLER, body: 'Bonjour, ici Plomberie Tremblay. Désolé !' });
    assert.strictEqual(sent[1].to, OWNER);
    assert.match(sent[1].body, new RegExp(`\\${CALLER}`));
  });
});

test('appelant sur ligne fixe : l\'appel se termine proprement et le propriétaire est prévenu', async () => {
  const sent = [];
  const sendSms = async (m) => {
    if (m.to === CALLER) throw new Error('Twilio 400: 21614 not a mobile number');
    sent.push(m);
  };
  await withApp(
    async ({ base }) => {
      const res = await twilioPost(base, '/voice', { From: CALLER, To: BIZ });
      assert.strictEqual(res.status, 200);
      assert.match(await res.text(), /<Hangup\/>/);
      assert.strictEqual(sent.length, 1);
      assert.strictEqual(sent[0].to, OWNER);
      assert.match(sent[0].body, /rappelez-le/);
    },
    { sendSms }
  );
});

test('appel sans numéro affiché : aucun texto', async () => {
  await withApp(async ({ base, sent }) => {
    const res = await twilioPost(base, '/voice', { From: 'anonymous', To: BIZ });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(sent.length, 0);
  });
});

test('requête Twilio mal signée : refusée', async () => {
  await withApp(async ({ base, sent }) => {
    const res = await twilioPost(base, '/voice', { From: CALLER, To: BIZ }, 'faux');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(sent.length, 0);
  });
});

test('réponse texto de l\'appelant : transférée au propriétaire', async () => {
  await withApp(async ({ base, sent }) => {
    const res = await twilioPost(base, '/sms', { From: CALLER, To: BIZ, Body: 'Fuite sous l\'évier' });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(sent, [{ from: BIZ, to: OWNER, body: `RappelPro, message de ${CALLER} : Fuite sous l'évier` }]);
  });
});

test('commande AVIS du propriétaire : envoie la demande et confirme', async () => {
  await withApp(async ({ base, sent }) => {
    const res = await twilioPost(base, '/sms', { From: OWNER, To: BIZ, Body: 'avis 438 555-1234 Julie' });
    assert.match(await res.text(), /<Message>Demande d&apos;avis envoyée à 438-555-1234\.<\/Message>/);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].to, CALLER);
    assert.match(sent[0].body, /^Bonjour Julie, merci d'avoir choisi Plomberie Tremblay ! .*g\.page\/r\/abc\/review/);
  });
});

test('texto du propriétaire sans commande : explique la commande AVIS', async () => {
  await withApp(async ({ base, sent }) => {
    const res = await twilioPost(base, '/sms', { From: OWNER, To: BIZ, Body: 'Allo?' });
    assert.match(await res.text(), /AVIS 514-555-1234 Prénom/);
    assert.strictEqual(sent.length, 0);
  });
});

test('demande d\'avis par API : exige la clé puis envoie le lien', async () => {
  await withApp(async ({ base, sent }) => {
    const body = JSON.stringify({ client: BIZ, phone: CALLER, name: 'Julie' });
    const denied = await fetch(base + '/review-request', { method: 'POST', body });
    assert.strictEqual(denied.status, 401);

    const ok = await fetch(base + '/review-request', { method: 'POST', body, headers: { Authorization: 'Bearer secret' } });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(sent.length, 1);
    assert.match(sent[0].body, /^Bonjour Julie, merci d'avoir choisi Plomberie Tremblay ! .*https:\/\/g\.page\/r\/abc\/review/);
  });
});

test('rapport mensuel : compte les événements du client', async () => {
  await withApp(async ({ base }) => {
    await twilioPost(base, '/voice', { From: CALLER, To: BIZ });
    await twilioPost(base, '/voice', { From: '+14385550000', To: BIZ });
    await twilioPost(base, '/sms', { From: CALLER, To: BIZ, Body: 'Allo' });
    const res = await fetch(`${base}/report?client=${encodeURIComponent(BIZ)}&month=2026-09`, {
      headers: { Authorization: 'Bearer secret' },
    });
    assert.deepStrictEqual(await res.json(), { client: BIZ, month: '2026-09', missed_call: 2, sms_reply: 1, review_request: 0 });
  });
});

test('inscription : redirige vers Stripe avec le prix, le coupon et les infos du commerce', async () => {
  await withApp(async ({ base, checkouts }) => {
    const res = await fetch(base + '/signup', {
      method: 'POST',
      redirect: 'manual',
      body: new URLSearchParams({ business: ' Garage Lavoie ', ownerPhone: '819 555-4321', email: 'marie@garagelavoie.ca', reviewLink: '', accept: 'oui' }),
    });
    assert.strictEqual(res.status, 303);
    assert.strictEqual(res.headers.get('location'), 'https://checkout.stripe.com/c/pay/cs_test_1');
    const c = checkouts[0];
    assert.strictEqual(c.mode, 'subscription');
    assert.deepStrictEqual(c.line_items, [{ price: 'price_123', quantity: 1 }]);
    assert.deepStrictEqual(c.discounts, [{ coupon: 'coupon_50' }]);
    assert.deepStrictEqual(c.metadata, { business: 'Garage Lavoie', ownerPhone: '+18195554321', reviewLink: '' });
    assert.strictEqual(c.success_url, 'https://exemple.com/bienvenue.html?session_id={CHECKOUT_SESSION_ID}');
  });
});

test('inscription invalide : message clair, pas de paiement', async () => {
  await withApp(async ({ base, checkouts }) => {
    const res = await fetch(base + '/signup', {
      method: 'POST',
      body: new URLSearchParams({ business: 'Garage Lavoie', ownerPhone: '555', email: 'marie@garagelavoie.ca' }),
    });
    assert.strictEqual(res.status, 400);
    assert.match(await res.text(), /numéro de cellulaire valide/);
    assert.strictEqual(checkouts.length, 0);
  });
});

test('paiement confirmé : achète un numéro, enregistre l\'abonné et lui texte la bienvenue', async () => {
  await withApp(async ({ base, sent, bought, store, storeFile }) => {
    const res = await stripePost(base, checkoutCompleted);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(bought.length, 1);
    assert.strictEqual(bought[0].areaCode, '819');
    assert.strictEqual(bought[0].voiceUrl, 'https://exemple.com/voice');

    const client = store.get('+18195550200');
    assert.strictEqual(client.name, 'Garage Lavoie');
    assert.strictEqual(client.subscriptionId, 'sub_1');
    assert.strictEqual(client.email, 'marie@garagelavoie.ca');
    assert.ok(JSON.parse(fs.readFileSync(storeFile, 'utf8'))['+18195550200'], 'abonné écrit sur disque');

    assert.strictEqual(sent[0].to, '+18195554321');
    assert.match(sent[0].body, /Votre numéro RappelPro : 819-555-0200.*\*\*004\*\+18195550200#/);

    // Stripe renvoie parfois le même événement : pas de second numéro.
    await stripePost(base, checkoutCompleted);
    assert.strictEqual(bought.length, 1);
  });
});

test('webhook Stripe mal signé : refusé, rien n\'est acheté', async () => {
  await withApp(async ({ base, bought }) => {
    const res = await stripePost(base, checkoutCompleted, 't=1,v1=faux');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(bought.length, 0);
  });
});

test('abonnement annulé : numéro libéré et appels ignorés', async () => {
  await withApp(async ({ base, sent, released }) => {
    await stripePost(base, checkoutCompleted);
    sent.length = 0;
    await stripePost(base, { type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } });
    assert.deepStrictEqual(released, ['PN123']);

    const res = await twilioPost(base, '/voice', { From: CALLER, To: '+18195550200' });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(sent.length, 0);
  });
});

test('le serveur publie le site avec les coordonnées configurées', async () => {
  await withApp(async ({ base }) => {
    const home = await (await fetch(base + '/')).text();
    assert.match(home, /action="\/signup"/);
    assert.match(home, /bonjour@exemple\.ca/);
    assert.match(home, /© 2026 Services Exemple inc\./);
    assert.doesNotMatch(home, /\{\{/);
    const privacy = await (await fetch(base + '/confidentialite.html')).text();
    assert.match(privacy, /La personne responsable est Services Exemple inc\./);
    assert.match(privacy, /\[à configurer : LEGAL_ADDRESS\]/, 'une valeur manquante reste visible');
    assert.strictEqual((await fetch(base + '/conditions.html')).status, 200);
    assert.strictEqual((await fetch(base + '/bienvenue.html')).status, 200);
    assert.strictEqual((await fetch(base + '/../server.js')).status, 404);
  });
});

test('inscription sans accepter les conditions : refusée', async () => {
  await withApp(async ({ base, checkouts }) => {
    const res = await fetch(base + '/signup', {
      method: 'POST',
      body: new URLSearchParams({ business: 'Garage Lavoie', ownerPhone: '819 555-4321', email: 'marie@garagelavoie.ca' }),
    });
    assert.strictEqual(res.status, 400);
    assert.match(await res.text(), /acceptez les conditions/);
    assert.strictEqual(checkouts.length, 0);
  });
});

test('commande COMPTE : le propriétaire reçoit un lien vers le portail Stripe', async () => {
  await withApp(async ({ base, portals }) => {
    await stripePost(base, checkoutCompleted);
    const res = await twilioPost(base, '/sms', { From: '+18195554321', To: '+18195550200', Body: 'Compte' });
    assert.match(await res.text(), /<Message>Gérez votre abonnement.*https:\/\/billing\.stripe\.com\/p\/session\/test_1/);
    assert.deepStrictEqual(portals, [{ customer: 'cus_1', configuration: 'bpc_1', return_url: 'https://exemple.com/' }]);
  });
});

test('commande COMPTE sans abonnement Stripe (client ajouté à la main) : renvoie au courriel', async () => {
  await withApp(async ({ base, portals }) => {
    const res = await twilioPost(base, '/sms', { From: OWNER, To: BIZ, Body: 'annuler' });
    assert.match(await res.text(), /écrivez-nous à bonjour@exemple\.ca/);
    assert.strictEqual(portals.length, 0);
  });
});

test('bilan mensuel : envoyé une seule fois le 1er du mois, avec les chiffres du mois précédent', async () => {
  let clock = new Date('2026-09-20T12:00:00Z');
  await withApp(
    async ({ base, sent, store }) => {
      await twilioPost(base, '/voice', { From: CALLER, To: BIZ });
      await twilioPost(base, '/sms', { From: CALLER, To: BIZ, Body: 'Allo' });
      sent.length = 0;
      store.set('+15145550111', { name: 'Nouveau client', ownerPhone: '+15145550112', createdAt: '2026-10-01T09:00:00Z' });

      clock = new Date('2026-10-01T09:00:00Z');
      assert.strictEqual(await server().sendMonthlyReports(), 0, 'trop tôt le matin');

      clock = new Date('2026-10-01T15:00:00Z');
      assert.strictEqual(await server().sendMonthlyReports(), 1, 'le client inscrit en octobre attend novembre');
      assert.strictEqual(sent[0].to, OWNER);
      assert.match(sent[0].body, /bilan de septembre 2026 : 1 appel\(s\) manqué\(s\).*1 client\(s\) ont répondu/);

      clock = new Date('2026-10-02T15:00:00Z');
      assert.strictEqual(await server().sendMonthlyReports(), 0, 'pas de doublon');
    },
    { now: () => clock }
  );
});

test('configuration Stripe automatique : une seule fois par mode, sans webhook en double', async () => {
  const { ensureStripeSetup } = require('./stripe-setup');
  const stateFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rappelpro-')), 'stripe.json');
  const calls = [];
  const call = async (p, params, method = 'POST') => {
    calls.push(`${method} ${p}`);
    if (p.startsWith('/webhook_endpoints?')) {
      return { data: [{ id: 'we_old', url: 'https://exemple.com/stripe/webhook' }, { id: 'we_autre', url: 'https://autre.com/stripe/webhook' }] };
    }
    if (p === '/prices') {
      assert.strictEqual(params.unit_amount, 8999);
      assert.deepStrictEqual(params.recurring, { interval: 'month' });
    }
    if (p === '/coupons') assert.deepStrictEqual(params, { name: 'Premier mois -50 %', percent_off: 50, duration: 'once' });
    return { id: `${p.split('/')[1]}_${calls.length}`, secret: 'whsec_nouveau' };
  };
  const opts = { call, secretKey: 'sk_test_abc', publicUrl: 'https://exemple.com', stateFile, log: () => {} };

  const config = await ensureStripeSetup(opts);
  assert.strictEqual(config.webhookSecret, 'whsec_nouveau');
  assert.ok(calls.includes('DELETE /webhook_endpoints/we_old'), 'ancien webhook remplacé');
  assert.ok(!calls.includes('DELETE /webhook_endpoints/we_autre'), 'webhook d\'une autre adresse conservé');

  const before = calls.length;
  assert.deepStrictEqual(await ensureStripeSetup(opts), config, 'deuxième démarrage : rien de recréé');
  assert.strictEqual(calls.length, before);

  const live = await ensureStripeSetup({ ...opts, secretKey: 'sk_live_abc' });
  assert.ok(calls.length > before, 'le mode réel a sa propre configuration');
  const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.deepStrictEqual(Object.keys(saved).sort(), ['live', 'test']);
  assert.strictEqual(saved.live.priceId, live.priceId);
});
