'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp, isValidTwilioSignature } = require('./server');

const BIZ = '+15145550100';
const OWNER = '+15145559999';
const CALLER = '+14385551234';
const TOKEN = 'test-token';
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

async function withApp(fn) {
  const sent = [];
  const eventsFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rappelpro-')), 'events.jsonl');
  const server = createApp({
    clients,
    sendSms: async (m) => sent.push(m),
    authToken: TOKEN,
    publicUrl: 'https://exemple.com',
    apiKey: 'secret',
    eventsFile,
    now: () => new Date('2026-09-15T12:00:00Z'),
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ base, sent });
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

test('signature Twilio : accepte la bonne, refuse une fausse', () => {
  const params = { From: CALLER, To: BIZ };
  const url = 'https://exemple.com/voice';
  assert.ok(isValidTwilioSignature(TOKEN, url, params, sign(url, params)));
  assert.ok(!isValidTwilioSignature(TOKEN, url, params, 'faux'));
  assert.ok(!isValidTwilioSignature(TOKEN, url, params, undefined));
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

test('demande d\'avis : exige la clé API puis envoie le lien', async () => {
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
