import type { Locale } from "../i18n/config";
import { MESSAGES } from "../i18n/messages";
import { PLATFORM_NAME } from "../platform";
import type { CommissionTier } from "../money";
import { getPlatformSettings } from "../settings";
import { formatPrice } from "../store-config";
import type { PlatformPolicyContext } from "./policies";

/** « 15 %, puis 12 % à partir de 1 000 $ de marge brute sur 30 jours… » (paliers en vigueur). */
function describeTiers(tiers: CommissionTier[], locale: Locale, pct: (rate: string) => string): string {
  const money = (cents: number) => formatPrice(cents, "CAD", locale).replace(/[,.]00(?=\s|$|\u00a0)/, "");
  const [first, ...rest] = tiers;
  if (rest.length === 0) return pct(first.rate);
  const steps = rest.map((t) => (locale === "fr" ? `${pct(t.rate)} à partir de ${money(t.fromMarginCents)}` : `${pct(t.rate)} from ${money(t.fromMarginCents)}`));
  const list = steps.length > 1 ? `${steps.slice(0, -1).join(", ")}${locale === "fr" ? " et " : " and "}${steps.at(-1)}` : steps[0];
  return locale === "fr" ? `${pct(first.rate)}, puis ${list} de marge brute sur les 30 derniers jours` : `${pct(first.rate)}, then ${list} of gross margin over the last 30 days`;
}

/** Contexte des pages légales de la plateforme : identité (platform_settings.legal_identity) et tarifs en vigueur. */
export async function platformPolicyContext(locale: Locale): Promise<PlatformPolicyContext> {
  const settings = await getPlatformSettings();
  const id = settings.legalIdentity;
  const missing = MESSAGES[locale].legal.toComplete;
  const pct = (rate: string) => {
    const n = Math.round(Number(rate) * 100);
    return locale === "fr" ? `${n} %` : `${n}%`;
  };
  return {
    platformName: PLATFORM_NAME,
    legalName: id.legalName || `${PLATFORM_NAME} ${missing}`,
    address: id.address,
    email: id.email,
    privacyOfficer: id.privacyOfficer || missing,
    commission: describeTiers(settings.commissionTiers, locale, pct),
    tieredCommission: settings.commissionTiers.length > 1,
    reserveDays: settings.payoutReserveDays,
    minMargin: pct(settings.minMarginRate),
  };
}
