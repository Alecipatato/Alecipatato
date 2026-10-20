import type { Locale } from "../config";
import { admin } from "./admin";
import { auth } from "./auth";
import { common } from "./common";
import { dashboard } from "./dashboard";
import { domains } from "./domains";
import { emails } from "./emails";
import { errors } from "./errors";
import { legal } from "./legal";
import { marketing } from "./marketing";
import { marketingTools } from "./marketing-tools";
import { sales } from "./sales";
import { stats } from "./stats";
import { storefront } from "./storefront";

function build(locale: Locale) {
  return {
    common: common[locale],
    auth: auth[locale],
    marketing: marketing[locale],
    dashboard: dashboard[locale],
    sales: sales[locale],
    storefront: storefront[locale],
    errors: errors[locale],
    emails: emails[locale],
    legal: legal[locale],
    stats: stats[locale],
    marketingTools: marketingTools[locale],
    domains: domains[locale],
    moderation: admin[locale].moderation,
    admin: admin[locale].admin,
  };
}

export type Messages = ReturnType<typeof build>;

export const MESSAGES: Record<Locale, Messages> = { en: build("en"), fr: build("fr") };
