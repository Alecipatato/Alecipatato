import type { Locale } from "../config";
import { auth } from "./auth";
import { common } from "./common";
import { dashboard } from "./dashboard";
import { errors } from "./errors";
import { marketing } from "./marketing";
import { sales } from "./sales";
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
  };
}

export type Messages = ReturnType<typeof build>;

export const MESSAGES: Record<Locale, Messages> = { en: build("en"), fr: build("fr") };
