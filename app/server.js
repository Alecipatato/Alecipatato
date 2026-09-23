// RappelPro: texte automatiquement les appelants manqués et envoie des demandes d'avis Google.
// Aucune dépendance : Node 18+ uniquement.
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');

const MAX_BODY_BYTES = 64 * 1024;

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
}

function twiml(inner) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
}

// https://www.twilio.com/docs/usage/security#validating-requests
function isValidTwilioSignature(authToken, url, params, signature) {
  if (!signature) return false;
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  const expected = crypto.createHmac('sha1', authToken).update(data).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

function makeTwilioSender({ accountSid, authToken }) {
  if (!accountSid || !authToken) {
    return async (msg) => console.log('[DRY_RUN] SMS', JSON.stringify(msg));
  }
  const auth = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  return async ({ from, to, body }) => {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: from, To: to, Body: body }),
    });
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Corps trop volumineux'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function createApp({ clients, sendSms, authToken, publicUrl, apiKey, eventsFile, now = () => new Date() }) {
  function logEvent(clientNumber, type, extra = {}) {
    if (!eventsFile) return;
    const line = JSON.stringify({ at: now().toISOString(), client: clientNumber, type, ...extra });
    fs.appendFileSync(eventsFile, line + '\n');
  }

  function hasApiKey(req) {
    const header = req.headers.authorization || '';
    const given = Buffer.from(header.replace(/^Bearer\s+/i, ''));
    const expected = Buffer.from(apiKey || '');
    return expected.length > 0 && given.length === expected.length && crypto.timingSafeEqual(given, expected);
  }

  async function twilioParams(req) {
    const params = Object.fromEntries(new URLSearchParams(await readBody(req)));
    if (authToken && !isValidTwilioSignature(authToken, publicUrl + req.url, params, req.headers['x-twilio-signature'])) {
      throw Object.assign(new Error('Signature Twilio invalide'), { status: 403 });
    }
    return params;
  }

  // Appel transféré vers le numéro RappelPro = appel manqué par le commerce.
  async function onVoice(req, res) {
    const p = await twilioParams(req);
    const client = clients[p.To];
    if (!client) return send(res, 404, 'text/xml', twiml('<Hangup/>'));

    const caller = p.From;
    if (caller && /^\+\d{8,15}$/.test(caller)) {
      // Un échec d'envoi (ligne fixe, numéro invalide) ne doit ni couper l'appel ni priver le propriétaire de l'alerte.
      let texted = true;
      try {
        await sendSms({ from: p.To, to: caller, body: fill(client.missedCallMessage, { business: client.name }) });
      } catch (err) {
        texted = false;
        console.error(`Texto à ${caller} impossible :`, err.message);
      }
      const note = texted ? 'Un texto lui a été envoyé.' : 'Texto impossible (ligne fixe ?), rappelez-le.';
      try {
        await sendSms({ from: p.To, to: client.ownerPhone, body: `RappelPro : appel manqué de ${caller}. ${note}` });
      } catch (err) {
        console.error('Alerte au propriétaire impossible :', err.message);
      }
      logEvent(p.To, 'missed_call', { caller, texted });
    }
    const voice = client.voiceMessage || `Merci d'avoir appelé ${client.name}. Nous vous envoyons un texto à l'instant.`;
    send(res, 200, 'text/xml', twiml(`<Say language="fr-CA">${escapeXml(voice)}</Say><Hangup/>`));
  }

  // Réponse texto d'un appelant : on la transfère au propriétaire.
  async function onSms(req, res) {
    const p = await twilioParams(req);
    const client = clients[p.To];
    if (client && p.From !== client.ownerPhone && p.Body) {
      await sendSms({ from: p.To, to: client.ownerPhone, body: `RappelPro, message de ${p.From} : ${p.Body}` });
      logEvent(p.To, 'sms_reply', { caller: p.From });
    }
    send(res, 200, 'text/xml', twiml(''));
  }

  // POST { client: "+1514...", phone: "+1438...", name: "Julie" } avec Authorization: Bearer API_KEY
  async function onReviewRequest(req, res) {
    if (!hasApiKey(req)) return send(res, 401, 'application/json', '{"error":"non autorisé"}');
    let data;
    try {
      data = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, 'application/json', '{"error":"JSON invalide"}');
    }
    const client = clients[data.client];
    if (!client || !client.reviewLink) return send(res, 404, 'application/json', '{"error":"client inconnu ou sans lien d\'avis"}');
    if (!/^\+\d{8,15}$/.test(data.phone || '')) return send(res, 400, 'application/json', '{"error":"numéro au format +15145550123 requis"}');

    const template = client.reviewMessage ||
      'Bonjour {name}, merci d\'avoir choisi {business} ! Votre avis nous aide beaucoup : {link} (Répondez ARRÊT pour ne plus recevoir de textos)';
    await sendSms({
      from: data.client,
      to: data.phone,
      body: fill(template, { name: data.name || '', business: client.name, link: client.reviewLink }).replace(/\s+,/, ','),
    });
    logEvent(data.client, 'review_request', { customer: data.phone });
    send(res, 200, 'application/json', '{"ok":true}');
  }

  // GET /report?client=+1514...&month=2026-09 : chiffres du rapport mensuel envoyé au client.
  function onReport(req, res, url) {
    if (!hasApiKey(req)) return send(res, 401, 'application/json', '{"error":"non autorisé"}');
    const client = url.searchParams.get('client');
    const month = url.searchParams.get('month') || now().toISOString().slice(0, 7);
    const counts = { missed_call: 0, sms_reply: 0, review_request: 0 };
    if (eventsFile && fs.existsSync(eventsFile)) {
      for (const line of fs.readFileSync(eventsFile, 'utf8').split('\n')) {
        if (!line) continue;
        const e = JSON.parse(line);
        if (e.client === client && e.at.startsWith(month) && e.type in counts) counts[e.type]++;
      }
    }
    send(res, 200, 'application/json', JSON.stringify({ client, month, ...counts }));
  }

  function send(res, status, type, body) {
    res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` });
    res.end(body);
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, 'text/plain', 'ok');
      if (req.method === 'POST' && url.pathname === '/voice') return await onVoice(req, res);
      if (req.method === 'POST' && url.pathname === '/sms') return await onSms(req, res);
      if (req.method === 'POST' && url.pathname === '/review-request') return await onReviewRequest(req, res);
      if (req.method === 'GET' && url.pathname === '/report') return onReport(req, res, url);
      send(res, 404, 'text/plain', 'introuvable');
    } catch (err) {
      console.error(err);
      if (!res.headersSent) send(res, err.status || 500, 'text/plain', err.status ? err.message : 'erreur interne');
    }
  });
}

module.exports = { createApp, isValidTwilioSignature, makeTwilioSender };

if (require.main === module) {
  const env = process.env;
  const clientsFile = env.CLIENTS_FILE || `${__dirname}/clients.json`;
  const clients = JSON.parse(fs.readFileSync(clientsFile, 'utf8'));
  if (env.TWILIO_AUTH_TOKEN && !env.PUBLIC_URL) {
    console.error('PUBLIC_URL est requis pour valider les signatures Twilio.');
    process.exit(1);
  }
  const app = createApp({
    clients,
    sendSms: makeTwilioSender({ accountSid: env.TWILIO_ACCOUNT_SID, authToken: env.TWILIO_AUTH_TOKEN }),
    authToken: env.TWILIO_AUTH_TOKEN,
    publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''),
    apiKey: env.API_KEY,
    eventsFile: env.EVENTS_FILE || `${__dirname}/events.jsonl`,
  });
  const port = Number(env.PORT) || 3000;
  app.listen(port, () => console.log(`RappelPro écoute sur le port ${port} (${Object.keys(clients).length} client(s))`));
}
