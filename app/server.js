// RappelPro: texte automatiquement les appelants manqués, envoie des demandes d'avis Google
// et gère les inscriptions en libre-service (paiement Stripe, numéro Twilio attribué automatiquement).
// Aucune dépendance : Node 18+ uniquement.
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createStore } = require('./store');
const { makeTwilioSender, makeTwilioNumbers, makeStripe, isValidStripeSignature } = require('./providers');

const MAX_BODY_BYTES = 64 * 1024;
const PHONE_RE = /^\+\d{8,15}$/;
const DEFAULT_MISSED_CALL_MESSAGE =
  "Bonjour, ici {business}. Désolé d'avoir manqué votre appel ! Répondez à ce texto avec votre besoin, on vous revient rapidement.";
const DEFAULT_REVIEW_MESSAGE =
  "Bonjour {name}, merci d'avoir choisi {business} ! Votre avis nous aide beaucoup : {link} (Répondez ARRÊT pour ne plus recevoir de textos)";
const SITE_PAGES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/bienvenue.html': 'bienvenue.html',
  '/conditions.html': 'conditions.html',
  '/confidentialite.html': 'confidentialite.html',
};
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

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

// Accepte « 514 555-1234 », « 1-514-555-1234 » ou « +15145551234 » (numéros nord-américains).
function normalizePhone(input) {
  const s = String(input || '').trim();
  const digits = s.replace(/\D/g, '');
  if (s.startsWith('+')) return PHONE_RE.test('+' + digits) ? '+' + digits : null;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return null;
}

function formatPhone(e164) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : e164;
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

function createApp({
  store,
  sendSms,
  numbers,
  stripe,
  stripeWebhookSecret,
  stripePriceId,
  stripeCouponId,
  stripePortalConfigId,
  authToken,
  publicUrl = '',
  apiKey,
  eventsFile,
  siteDir,
  business = {},
  now = () => new Date(),
}) {
  const contactEmail = business.email;
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

  async function sendReviewRequest(number, client, phone, name) {
    await sendSms({
      from: number,
      to: phone,
      body: fill(client.reviewMessage || DEFAULT_REVIEW_MESSAGE, { name: name || '', business: client.name, link: client.reviewLink })
        .replace(/\s+,/, ','),
    });
    logEvent(number, 'review_request', { customer: phone });
  }

  // Appel transféré vers le numéro RappelPro = appel manqué par le commerce.
  async function onVoice(req, res) {
    const p = await twilioParams(req);
    const client = store.get(p.To);
    if (!client) return send(res, 404, 'text/xml', twiml('<Hangup/>'));

    const caller = p.From;
    if (caller && PHONE_RE.test(caller)) {
      // Un échec d'envoi (ligne fixe, numéro invalide) ne doit ni couper l'appel ni priver le propriétaire de l'alerte.
      let texted = true;
      try {
        await sendSms({ from: p.To, to: caller, body: fill(client.missedCallMessage || DEFAULT_MISSED_CALL_MESSAGE, { business: client.name }) });
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

  // Texto reçu. Du propriétaire : commande « AVIS <numéro> <prénom> ». D'un appelant : transféré au propriétaire.
  async function onSms(req, res) {
    const p = await twilioParams(req);
    const client = store.get(p.To);
    const body = (p.Body || '').trim();
    if (client && p.From === client.ownerPhone) {
      if (/^(compte|annuler|abonnement|facture)s?$/i.test(body)) {
        return send(res, 200, 'text/xml', twiml(`<Message>${escapeXml(await accountReply(client))}</Message>`));
      }
      const m = /^avis\s+([+\d][\d\s().-]{8,})(?:\s+(.+))?$/i.exec(body);
      const phone = m && normalizePhone(m[1]);
      let reply;
      if (!m) reply = 'Pour demander un avis Google, textez : AVIS 514-555-1234 Prénom. Pour gérer ou annuler votre abonnement, textez : COMPTE';
      else if (!phone) reply = `Numéro non reconnu : « ${m[1].trim()} ». Exemple : AVIS 514-555-1234 Julie`;
      else if (!client.reviewLink) reply = "Aucun lien d'avis Google n'est configuré pour votre compte. Répondez avec votre lien pour qu'on l'ajoute.";
      else {
        try {
          await sendReviewRequest(p.To, client, phone, m[2] && m[2].trim());
          reply = `Demande d'avis envoyée à ${formatPhone(phone)}.`;
        } catch (err) {
          console.error('Demande d\'avis impossible :', err.message);
          reply = `Impossible de texter ${formatPhone(phone)} (ligne fixe ?).`;
        }
      }
      return send(res, 200, 'text/xml', twiml(`<Message>${escapeXml(reply)}</Message>`));
    }
    if (client && body) {
      await sendSms({ from: p.To, to: client.ownerPhone, body: `RappelPro, message de ${p.From} : ${body}` });
      logEvent(p.To, 'sms_reply', { caller: p.From });
    }
    send(res, 200, 'text/xml', twiml(''));
  }

  // Lien vers le portail Stripe : carte, factures, annulation (effective à la fin du mois payé).
  async function accountReply(client) {
    if (!stripe || !client.customerId) {
      return `Pour gérer ou annuler votre abonnement, écrivez-nous à ${contactEmail || 'notre adresse de contact'}.`;
    }
    try {
      const portal = await stripe.createPortalSession({
        customer: client.customerId,
        configuration: stripePortalConfigId,
        return_url: `${publicUrl}/`,
      });
      return `Gérez votre abonnement RappelPro (carte, factures, annulation) ici : ${portal.url} Ce lien est personnel et expire bientôt.`;
    } catch (err) {
      console.error('Portail Stripe impossible :', err.message);
      return `Le lien n'a pas pu être créé. Réessayez dans quelques minutes ou écrivez-nous à ${contactEmail || 'notre adresse de contact'}.`;
    }
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
    const client = store.get(data.client);
    if (!client || !client.reviewLink) return send(res, 404, 'application/json', '{"error":"client inconnu ou sans lien d\'avis"}');
    if (!PHONE_RE.test(data.phone || '')) return send(res, 400, 'application/json', '{"error":"numéro au format +15145550123 requis"}');
    await sendReviewRequest(data.client, client, data.phone, data.name);
    send(res, 200, 'application/json', '{"ok":true}');
  }

  // GET /report?client=+1514...&month=2026-09 : chiffres du rapport mensuel envoyé au client.
  function onReport(req, res, url) {
    if (!hasApiKey(req)) return send(res, 401, 'application/json', '{"error":"non autorisé"}');
    const client = url.searchParams.get('client');
    const month = url.searchParams.get('month') || now().toISOString().slice(0, 7);
    send(res, 200, 'application/json', JSON.stringify({ client, month, ...countEvents(month).get(client) }));
  }

  // Compteurs du mois (« 2026-09 ») pour chaque numéro RappelPro.
  function countEvents(month) {
    const byClient = new Map();
    const countsFor = (c) => {
      if (!byClient.has(c)) byClient.set(c, { missed_call: 0, sms_reply: 0, review_request: 0 });
      return byClient.get(c);
    };
    if (eventsFile && fs.existsSync(eventsFile)) {
      for (const line of fs.readFileSync(eventsFile, 'utf8').split('\n')) {
        if (!line) continue;
        const e = JSON.parse(line);
        if (e.at.startsWith(month) && ['missed_call', 'sms_reply', 'review_request'].includes(e.type)) countsFor(e.client)[e.type]++;
      }
    }
    return { get: countsFor };
  }

  // Bilan du mois précédent texté à chaque abonné, une seule fois, à partir du 1er du mois à 14 h UTC (10 h à Montréal).
  // Appelée toutes les heures : si le serveur était arrêté le 1er, le bilan part au redémarrage.
  async function sendMonthlyReports() {
    const t = now();
    const monthStart = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
    if (t < new Date(monthStart.getTime() + 14 * 3600 * 1000)) return 0;
    const prev = new Date(monthStart.getTime() - 1);
    const month = prev.toISOString().slice(0, 7);
    const counts = countEvents(month);
    let sent = 0;
    for (const [number, client] of store.active()) {
      if (client.lastReport === month) continue;
      if (client.createdAt && new Date(client.createdAt) >= monthStart) continue;
      const c = counts.get(number);
      const label = `${MONTHS_FR[prev.getUTCMonth()]} ${prev.getUTCFullYear()}`;
      const body =
        c.missed_call > 0
          ? `RappelPro, bilan de ${label} : ${c.missed_call} appel(s) manqué(s) ont reçu un texto automatique, ` +
            `${c.sms_reply} client(s) ont répondu et ${c.review_request} demande(s) d'avis sont parties. Merci de votre confiance !`
          : `RappelPro, bilan de ${label} : aucun appel manqué ce mois-ci, bravo ! ${c.review_request} demande(s) d'avis sont parties. ` +
            'Rappel : textez AVIS 514-555-1234 Prénom après chaque service.';
      try {
        await sendSms({ from: number, to: client.ownerPhone, body });
        store.set(number, { ...client, lastReport: month });
        logEvent(number, 'monthly_report', { month });
        sent++;
      } catch (err) {
        console.error(`Bilan de ${number} impossible :`, err.message);
      }
    }
    return sent;
  }

  // Formulaire d'inscription du site → page de paiement Stripe (premier mois -50 % via le coupon).
  async function onSignup(req, res) {
    if (!stripe) return sendError(res, 503, "L'inscription en ligne n'est pas encore ouverte.");
    const f = Object.fromEntries(new URLSearchParams(await readBody(req)));
    const business = (f.business || '').trim();
    const ownerPhone = normalizePhone(f.ownerPhone);
    const email = (f.email || '').trim();
    const reviewLink = (f.reviewLink || '').trim();

    if (!business || business.length > 80) return sendError(res, 400, 'Indiquez le nom de votre commerce (80 caractères au maximum).');
    if (!ownerPhone) return sendError(res, 400, 'Indiquez un numéro de cellulaire valide, par exemple 514-555-1234.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendError(res, 400, 'Indiquez une adresse courriel valide.');
    if (reviewLink && (!/^https:\/\/\S+$/.test(reviewLink) || reviewLink.length > 400)) {
      return sendError(res, 400, "Le lien d'avis Google doit commencer par https://. Vous pouvez aussi laisser ce champ vide.");
    }
    if (f.accept !== 'oui') return sendError(res, 400, "Pour continuer, acceptez les conditions d'utilisation et la politique de confidentialité.");

    const metadata = { business, ownerPhone, reviewLink };
    const session = await stripe.createCheckout({
      mode: 'subscription',
      line_items: [{ price: stripePriceId, quantity: 1 }],
      discounts: stripeCouponId ? [{ coupon: stripeCouponId }] : undefined,
      customer_email: email,
      locale: 'fr-CA',
      metadata,
      subscription_data: { metadata },
      success_url: `${publicUrl}/bienvenue.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicUrl}/#inscription`,
    });
    res.writeHead(303, { Location: session.url });
    res.end();
  }

  async function onStripeWebhook(req, res) {
    const raw = await readBody(req);
    if (!isValidStripeSignature(stripeWebhookSecret, raw, req.headers['stripe-signature'], Math.floor(now().getTime() / 1000))) {
      return send(res, 400, 'text/plain', 'signature Stripe invalide');
    }
    const event = JSON.parse(raw);
    if (event.type === 'checkout.session.completed') await provision(event.data.object);
    if (event.type === 'customer.subscription.deleted') await cancel(event.data.object);
    send(res, 200, 'application/json', '{"received":true}');
  }

  // Paiement confirmé : achat d'un numéro, ajout de l'abonné, texto de bienvenue.
  async function provision(session) {
    // Stripe peut renvoyer le même événement : on n'achète jamais deux numéros pour un abonnement.
    if (store.find((c) => c.subscriptionId === session.subscription)) return;
    const m = session.metadata || {};
    if (!PHONE_RE.test(m.ownerPhone || '')) throw new Error(`Session ${session.id} sans numéro de propriétaire`);

    const { phoneNumber, sid } = await numbers.buy({
      areaCode: m.ownerPhone.startsWith('+1') ? m.ownerPhone.slice(2, 5) : undefined,
      voiceUrl: `${publicUrl}/voice`,
      smsUrl: `${publicUrl}/sms`,
      friendlyName: `RappelPro - ${m.business}`,
    });
    store.set(phoneNumber, {
      name: m.business,
      ownerPhone: m.ownerPhone,
      email: (session.customer_details && session.customer_details.email) || session.customer_email,
      reviewLink: m.reviewLink || undefined,
      subscriptionId: session.subscription,
      customerId: session.customer,
      numberSid: sid,
      createdAt: now().toISOString(),
      active: true,
    });
    logEvent(phoneNumber, 'signup', { subscription: session.subscription });

    // Le numéro est acheté et enregistré : un échec ici ne doit pas faire rejouer l'événement par Stripe.
    try {
      await sendSms({
        from: phoneNumber,
        to: m.ownerPhone,
        body:
          `Bienvenue chez RappelPro, ${m.business} ! Votre numéro RappelPro : ${formatPhone(phoneNumber)}. ` +
          `Pour l'activer, composez **004*${phoneNumber}# sur le cellulaire du commerce, puis appuyez sur Appeler. ` +
          `Guide complet : ${publicUrl}/bienvenue.html. ` +
          'Pour demander un avis Google à un client, textez à ce numéro : AVIS 514-555-1234 Prénom. ' +
          'Pour gérer ou annuler votre abonnement : COMPTE',
      });
    } catch (err) {
      console.error('Texto de bienvenue impossible :', err.message);
    }
  }

  // Abonnement terminé : le numéro est libéré pour ne plus payer Twilio.
  async function cancel(subscription) {
    const found = store.find((c) => c.subscriptionId === subscription.id);
    if (!found || found[1].active === false) return;
    const [number, client] = found;
    try {
      await numbers.release(client.numberSid);
    } catch (err) {
      console.error(`Libération du numéro ${number} impossible :`, err.message);
    }
    store.set(number, { ...client, active: false, canceledAt: now().toISOString() });
    logEvent(number, 'cancel', { subscription: subscription.id });
  }

  // Les pages du site contiennent des marqueurs {{CONTACT_EMAIL}}, {{LEGAL_NAME}} et {{LEGAL_ADDRESS}},
  // remplacés par les variables d'environnement du même nom.
  function serveSite(res, file) {
    if (!siteDir) return send(res, 404, 'text/plain', 'introuvable');
    const values = { CONTACT_EMAIL: business.email, LEGAL_NAME: business.legalName, LEGAL_ADDRESS: business.address };
    const html = fs
      .readFileSync(path.join(siteDir, file), 'utf8')
      .replace(/\{\{(CONTACT_EMAIL|LEGAL_NAME|LEGAL_ADDRESS)\}\}/g, (m, k) => escapeXml(values[k] || `[à configurer : ${k}]`));
    send(res, 200, 'text/html', html);
  }

  function send(res, status, type, body) {
    res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` });
    res.end(body);
  }

  function sendError(res, status, message) {
    send(
      res,
      status,
      'text/html',
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>RappelPro</title>` +
        `<body style="font:17px/1.6 system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px">` +
        `<p>${escapeXml(message)}</p><p><a href="/#inscription">Revenir au formulaire</a></p></body>`
    );
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, 'text/plain', 'ok');
      if (req.method === 'GET' && url.pathname in SITE_PAGES) return serveSite(res, SITE_PAGES[url.pathname]);
      if (req.method === 'POST' && url.pathname === '/voice') return await onVoice(req, res);
      if (req.method === 'POST' && url.pathname === '/sms') return await onSms(req, res);
      if (req.method === 'POST' && url.pathname === '/signup') return await onSignup(req, res);
      if (req.method === 'POST' && url.pathname === '/stripe/webhook') return await onStripeWebhook(req, res);
      if (req.method === 'POST' && url.pathname === '/review-request') return await onReviewRequest(req, res);
      if (req.method === 'GET' && url.pathname === '/report') return onReport(req, res, url);
      send(res, 404, 'text/plain', 'introuvable');
    } catch (err) {
      console.error(err);
      if (res.headersSent) return;
      if (url.pathname === '/signup') return sendError(res, 502, "Le paiement n'a pas pu démarrer. Réessayez dans quelques minutes.");
      send(res, err.status || 500, 'text/plain', err.status ? err.message : 'erreur interne');
    }
  });
  server.sendMonthlyReports = sendMonthlyReports;
  return server;
}

module.exports = { createApp, isValidTwilioSignature, normalizePhone };

if (require.main === module) {
  const env = process.env;
  const publicUrl = (env.PUBLIC_URL || '').replace(/\/$/, '');
  if (env.TWILIO_AUTH_TOKEN && !publicUrl) {
    console.error('PUBLIC_URL est requis pour valider les signatures Twilio.');
    process.exit(1);
  }
  if (env.STRIPE_SECRET_KEY && !(env.STRIPE_WEBHOOK_SECRET && env.STRIPE_PRICE_ID && publicUrl)) {
    console.error('Avec STRIPE_SECRET_KEY, il faut aussi STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID et PUBLIC_URL (voir setup-stripe.js).');
    process.exit(1);
  }
  const twilioCreds = { accountSid: env.TWILIO_ACCOUNT_SID, authToken: env.TWILIO_AUTH_TOKEN };
  const store = createStore(env.CLIENTS_FILE || path.join(__dirname, 'clients.json'));
  const app = createApp({
    store,
    sendSms: makeTwilioSender(twilioCreds),
    numbers: makeTwilioNumbers({ ...twilioCreds, country: env.TWILIO_COUNTRY || 'CA' }),
    stripe: env.STRIPE_SECRET_KEY ? makeStripe({ secretKey: env.STRIPE_SECRET_KEY }) : null,
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
    stripePriceId: env.STRIPE_PRICE_ID,
    stripeCouponId: env.STRIPE_COUPON_ID,
    stripePortalConfigId: env.STRIPE_PORTAL_CONFIG_ID,
    authToken: env.TWILIO_AUTH_TOKEN,
    publicUrl,
    apiKey: env.API_KEY,
    eventsFile: env.EVENTS_FILE || path.join(__dirname, 'events.jsonl'),
    siteDir: env.SITE_DIR || path.join(__dirname, '..', 'site'),
    business: { email: env.CONTACT_EMAIL, legalName: env.LEGAL_NAME, address: env.LEGAL_ADDRESS },
  });
  const reports = () => app.sendMonthlyReports().then((n) => n && console.log(`${n} bilan(s) mensuel(s) envoyé(s)`), console.error);
  reports();
  setInterval(reports, 3600 * 1000).unref();
  const port = Number(env.PORT) || 3000;
  app.listen(port, () => console.log(`RappelPro écoute sur le port ${port} (${store.count()} abonné(s) actif(s))`));
}
