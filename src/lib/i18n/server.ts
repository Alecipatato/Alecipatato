import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getStoreBySite } from "../stores";
import { detectLocale, LOCALE_COOKIE, STORE_SITE_HEADER, type Locale } from "./config";
import { MESSAGES, type Messages } from "./messages";

/**
 * Langue de la page en cours :
 *  - vitrine d'une boutique : la langue de la boutique (ses textes sont rédigés dans cette langue) ;
 *  - plateforme : choix du visiteur, sinon sa région, sinon son navigateur, sinon l'anglais.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const h = await headers();
  const site = h.get(STORE_SITE_HEADER);
  if (site) {
    const data = await getStoreBySite(site);
    if (data) return data.store.language;
  }
  return detectLocale({
    cookie: (await cookies()).get(LOCALE_COOKIE)?.value,
    // Cloudflare (« Add visitor location headers ») ou Vercel.
    country: h.get("cf-ipcountry") ?? h.get("x-vercel-ip-country"),
    region: h.get("cf-region-code") ?? h.get("x-vercel-ip-country-region"),
    acceptLanguage: h.get("accept-language"),
  });
});

/** Textes dans la langue de la page en cours (ou dans une langue donnée). */
export async function getMessages(locale?: Locale): Promise<Messages> {
  return MESSAGES[locale ?? (await getLocale())];
}
