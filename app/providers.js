// Appels aux API Twilio et Stripe, sans SDK (fetch natif).
'use strict';

const crypto = require('node:crypto');

function twilioClient({ accountSid, authToken }) {
  const base = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;
  const auth = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  return async (method, path, params) => {
    const res = await fetch(base + path, {
      method,
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params ? new URLSearchParams(params) : undefined,
    });
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  };
}

function makeTwilioSender({ accountSid, authToken }) {
  if (!accountSid || !authToken) {
    return async (msg) => console.log('[DRY_RUN] SMS', JSON.stringify(msg));
  }
  const call = twilioClient({ accountSid, authToken });
  return async ({ from, to, body }) => {
    await call('POST', '/Messages.json', { From: from, To: to, Body: body });
  };
}

// Achat et libération des numéros attribués à chaque abonné.
function makeTwilioNumbers({ accountSid, authToken, country = 'CA' }) {
  if (!accountSid || !authToken) {
    let n = 0;
    return {
      async buy({ areaCode }) {
        const phoneNumber = `+1${areaCode || '514'}555${String(100 + n++).padStart(4, '0')}`;
        console.log('[DRY_RUN] achat du numéro', phoneNumber);
        return { phoneNumber, sid: `PN_DRY_${n}` };
      },
      async release(sid) {
        console.log('[DRY_RUN] libération du numéro', sid);
      },
    };
  }
  const call = twilioClient({ accountSid, authToken });
  return {
    async buy({ areaCode, voiceUrl, smsUrl, friendlyName }) {
      const search = async (extra) => {
        const q = new URLSearchParams({ SmsEnabled: 'true', VoiceEnabled: 'true', PageSize: '1', ...extra });
        const data = await call('GET', `/AvailablePhoneNumbers/${country}/Local.json?${q}`);
        return data.available_phone_numbers[0];
      };
      // Un numéro dans l'indicatif du commerce inspire confiance ; sinon n'importe quel numéro local du pays.
      const available = (areaCode && (await search({ AreaCode: areaCode }))) || (await search({}));
      if (!available) throw new Error(`Aucun numéro Twilio disponible (${country})`);
      const bought = await call('POST', '/IncomingPhoneNumbers.json', {
        PhoneNumber: available.phone_number,
        VoiceUrl: voiceUrl,
        SmsUrl: smsUrl,
        FriendlyName: friendlyName.slice(0, 64),
      });
      return { phoneNumber: bought.phone_number, sid: bought.sid };
    },
    async release(sid) {
      await call('DELETE', `/IncomingPhoneNumbers/${sid}.json`);
    },
  };
}

// Stripe attend des paramètres imbriqués : line_items[0][price]=...
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v !== null && typeof v === 'object') flatten(v, key, out);
    else if (v !== undefined) out[key] = String(v);
  }
  return out;
}

function makeStripe({ secretKey }) {
  const call = async (path, params) => {
    const res = await fetch(`https://api.stripe.com/v1${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(flatten(params)),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Stripe ${res.status}: ${data.error && data.error.message}`);
    return data;
  };
  return {
    call,
    createCheckout: (params) => call('/checkout/sessions', params),
    createPortalSession: (params) => call('/billing_portal/sessions', params),
  };
}

// https://docs.stripe.com/webhooks#verify-manually
function isValidStripeSignature(secret, rawBody, header, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300) {
  if (!secret || !header) return false;
  const parts = header.split(',').map((p) => p.split('='));
  const t = (parts.find(([k]) => k === 't') || [])[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex'));
  return sigs.some((s) => {
    const given = Buffer.from(s);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

module.exports = { makeTwilioSender, makeTwilioNumbers, makeStripe, flatten, isValidStripeSignature };
