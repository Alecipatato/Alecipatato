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

async function withApp(fn, overrides = {}) {
  const sent = [];
  const bought = [];
  const released = [];
  const checkouts = [];
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
    },
    stripeWebhookSecret: WHSEC,
    stripePriceId: 'price_123',
    stripeCouponId: 'coupon_50',
    authToken: TOKEN,
    publicUrl: 'https://exemple.com',
    apiKey: 'secret',
    eventsFile: path.join(dir, 'events.jsonl'),
    siteDir: path.join(__dirname, '..', 'site'),
    now: () => NOW,
    ...overrides,
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ base, sent, bought, released, checkouts, store, storeFile });
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
      body: new URLSearchParams({ business: ' Garage Lavoie ', ownerPhone: '819 555-4321', email: 'marie@garagelavoie.ca', reviewLink: '' }),
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

test('le serveur publie aussi le site', async () => {
  await withApp(async ({ base }) => {
    const home = await fetch(base + '/');
    assert.strictEqual(home.status, 200);
    assert.match(await home.text(), /action="\/signup"/);
    assert.strictEqual((await fetch(base + '/bienvenue.html')).status, 200);
    assert.strictEqual((await fetch(base + '/../server.js')).status, 404);
  });
});
