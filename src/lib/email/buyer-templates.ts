import { fmt, type Locale } from "../i18n/config";
import { MESSAGES } from "../i18n/messages";
import { formatPrice, readableOn } from "../store-config";
import { escapeHtml } from "./resend";

/**
 * Courriels aux acheteurs (fonctions pures ; vérifiées par le test de bout en bout des courriels).
 * Toujours rédigés dans la langue de la boutique, avec ses couleurs.
 */

export type BuyerEmailKind = "confirmation" | "shipped" | "delivered";

export interface BuyerEmailData {
  store: { name: string; language: Locale; primaryColor: string; contactEmail: string | null; url: string };
  order: {
    number: string;
    customerName: string | null;
    currency: string;
    items: { title: string; quantity: number; unitPriceCents: number }[];
    subtotalCents: number;
    shippingCents: number;
    taxCents: number;
    totalCents: number;
    address: { line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; postal_code?: string | null } | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    carrier: string | null;
  };
}

export interface BuiltEmail {
  subject: string;
  text: string;
  html: string;
}

export function trackingPageUrl(storeUrl: string, orderNumber: string): string {
  return `${storeUrl}/suivi?commande=${encodeURIComponent(orderNumber)}`;
}

export function buildBuyerEmail(kind: BuyerEmailKind, { store, order }: BuyerEmailData): BuiltEmail {
  const m = MESSAGES[store.language].emails;
  const price = (cents: number) => formatPrice(cents, order.currency, store.language);
  const vars = { store: store.name, number: order.number };
  const firstName = order.customerName?.trim().split(/\s+/)[0];
  const greeting = firstName ? fmt(m.greeting, { name: firstName }) : m.greetingAnonymous;
  const trackUrl = trackingPageUrl(store.url, order.number);

  // Blocs de contenu : [texte brut, HTML]
  const blocks: [string, string][] = [];
  const para = (text: string) => blocks.push([text, `<p style="margin:0 0 14px">${escapeHtml(text)}</p>`]);
  const link = (label: string, url: string) =>
    blocks.push([`${label}`, `<p style="margin:0 0 14px"><a href="${escapeHtml(url)}" style="color:${store.primaryColor}">${escapeHtml(label.replace(url, "").replace(/[:\s]+$/, "") || url)}</a></p>`]);

  let subject: string;
  let title: string;
  if (kind === "confirmation") {
    const c = m.confirmation;
    subject = fmt(c.subject, vars);
    title = c.title;
    para(greeting);
    para(c.intro);
    const rows: [string, string][] = order.items.map((i) => [`${i.title} × ${i.quantity}`, price(i.unitPriceCents * i.quantity)]);
    const totals: [string, string][] = [
      [c.subtotal, price(order.subtotalCents)],
      [c.shipping, order.shippingCents === 0 ? c.free : price(order.shippingCents)],
      [c.taxes, price(order.taxCents)],
      [c.total, price(order.totalCents)],
    ];
    blocks.push([
      [`${fmt(m.orderNumber, vars)}`, ...rows.map(([a, b]) => `- ${a} : ${b}`), "", ...totals.map(([a, b]) => `${a} : ${b}`)].join("\n"),
      `<p style="margin:0 0 6px;font-weight:bold">${escapeHtml(fmt(m.orderNumber, vars))}</p>` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 16px">` +
        rows.map(([a, b]) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${escapeHtml(a)}</td><td align="right" style="padding:6px 0;border-bottom:1px solid #eee">${escapeHtml(b)}</td></tr>`).join("") +
        totals.map(([a, b], i) => `<tr><td style="padding:4px 0;${i === 3 ? "font-weight:bold" : "color:#555"}">${escapeHtml(a)}</td><td align="right" style="padding:4px 0;${i === 3 ? "font-weight:bold" : "color:#555"}">${escapeHtml(b)}</td></tr>`).join("") +
        `</table>`,
    ]);
    const a = order.address;
    if (a?.line1) {
      const lines = [order.customerName, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(" ")].filter((l): l is string => Boolean(l));
      blocks.push([`${c.shipTo} :\n${lines.join("\n")}`, `<p style="margin:0 0 14px"><strong>${escapeHtml(c.shipTo)}</strong><br>${lines.map(escapeHtml).join("<br>")}</p>`]);
    }
    link(fmt(m.trackLine, { url: trackUrl }), trackUrl);
  } else if (kind === "shipped") {
    const s = m.shipped;
    subject = fmt(s.subject, vars);
    title = s.title;
    para(greeting);
    para(s.intro);
    if (order.trackingNumber) para(fmt(s.tracking, { number: order.trackingNumber }));
    if (order.carrier) para(fmt(s.carrier, { carrier: order.carrier }));
    if (order.trackingUrl) link(fmt(s.follow, { url: order.trackingUrl }), order.trackingUrl);
    link(fmt(m.trackLine, { url: trackUrl }), trackUrl);
  } else {
    const d = m.delivered;
    subject = fmt(d.subject, vars);
    title = d.title;
    para(greeting);
    para(d.intro);
    para(d.problem);
  }
  if (store.contactEmail) para(fmt(m.contactLine, { email: store.contactEmail }));
  para(fmt(m.signature, { store: store.name }));

  const text = [title, "", ...blocks.map(([t]) => t)].join("\n\n").replace(/\n{3,}/g, "\n\n");
  const html =
    `<!doctype html><html lang="${store.language}"><body style="margin:0;background:#f6f6f4">` +
    `<div style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1c2127;font-size:15px;line-height:1.5">` +
    `<div style="background:${store.primaryColor};color:${readableOn(store.primaryColor)};padding:18px 22px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold">${escapeHtml(store.name)}</div>` +
    `<div style="background:#fff;padding:24px 22px;border-radius:0 0 12px 12px">` +
    `<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>` +
    blocks.map(([, h]) => h).join("") +
    `</div></div></body></html>`;
  return { subject, text, html };
}
