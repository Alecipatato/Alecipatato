import type { Locale } from "../i18n/config";
import { MESSAGES } from "../i18n/messages";
import { PLATFORM_NAME } from "../platform";
import { getPlatformSettings } from "../settings";
import type { PlatformPolicyContext } from "./policies";

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
    commission: pct(settings.commissionRate),
    reserveDays: settings.payoutReserveDays,
    minMargin: pct(settings.minMarginRate),
  };
}
