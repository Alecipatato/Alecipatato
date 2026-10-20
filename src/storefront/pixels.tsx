"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { StorePixels } from "@/lib/marketing/settings";

/**
 * Pixels publicitaires Meta et TikTok, chargés SEULEMENT si le visiteur accepte (Loi 25).
 * Le choix est mémorisé dans le navigateur, par boutique ; « Gérer les témoins » permet de le changer.
 */

type Params = Record<string, unknown>;
type Queue = ((...args: unknown[]) => void) & { queue?: unknown[]; push?: unknown; loaded?: boolean; version?: string; callMethod?: (...a: unknown[]) => void };
type TikTok = unknown[] & { track?: (e: string, p?: Params) => void; page?: () => void; load?: (id: string) => void; [k: string]: unknown };
declare global {
  interface Window {
    fbq?: Queue;
    _fbq?: Queue;
    ttq?: TikTok;
    TiktokAnalyticsObject?: string;
  }
}

const OPEN_EVENT = "store-consent-open";
const consentKey = (storeId: string) => `consent:${storeId}`;

function addScript(src: string) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

/** Code de base du pixel Meta (file d'attente « fbq » + script officiel). */
function loadMeta(id: string) {
  if (window.fbq) return;
  const fbq: Queue = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue!.push(args);
  };
  fbq.queue = [];
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  window.fbq = window._fbq = fbq;
  addScript("https://connect.facebook.net/en_US/fbevents.js");
  fbq("init", id);
}

/** Code de base du pixel TikTok (file d'attente « ttq » + script officiel). */
function loadTikTok(id: string) {
  if (window.ttq) return;
  window.TiktokAnalyticsObject = "ttq";
  const ttq = [] as unknown as TikTok;
  for (const method of ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"]) {
    ttq[method] = (...args: unknown[]) => ttq.push([method, ...args]);
  }
  window.ttq = ttq;
  addScript(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(id)}&lib=ttq`);
}

const TIKTOK_EVENTS: Record<string, string> = { ViewContent: "ViewContent", AddToCart: "AddToCart", InitiateCheckout: "InitiateCheckout", Purchase: "CompletePayment" };

/** Envoie un événement aux pixels chargés (sans effet si le visiteur a refusé). */
export function track(event: "ViewContent" | "AddToCart" | "InitiateCheckout" | "Purchase", params: Params = {}) {
  if (typeof window === "undefined") return;
  window.fbq?.("track", event, params);
  window.ttq?.track?.(TIKTOK_EVENTS[event], params);
}

/** Déclenche un événement à l'affichage (fiche produit, achat). `onceKey` évite les doublons (rechargement). */
export function TrackEvent({ event, params, onceKey }: { event: Parameters<typeof track>[0]; params: Params; onceKey?: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    // Laisse le temps aux pixels de se charger si le consentement vient d'être donné.
    const timer = setTimeout(() => {
      if (onceKey) {
        try {
          if (sessionStorage.getItem(onceKey)) return;
          sessionStorage.setItem(onceKey, "1");
        } catch {
          // stockage indisponible : on envoie quand même
        }
      }
      track(event, params);
    }, 300);
    return () => clearTimeout(timer);
  }, [event, params, onceKey]);
  return null;
}

const CHANGE_EVENT = "store-consent-change";

function readConsent(storeId: string): "granted" | "denied" | "unknown" {
  try {
    const stored = localStorage.getItem(consentKey(storeId));
    return stored === "granted" || stored === "denied" ? stored : "unknown";
  } catch {
    return "unknown"; // navigation privée stricte : on redemandera
  }
}

function subscribeConsent(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function ConsentAndPixels({ storeId, pixels, base }: { storeId: string; pixels: StorePixels; base: string }) {
  // null côté serveur : le bandeau n'apparaît qu'une fois le choix mémorisé lu dans le navigateur.
  const choice = useSyncExternalStore(subscribeConsent, () => readConsent(storeId), () => null);
  const [reopened, setReopened] = useState(false);
  const t = useI18n().m.storefront.consent;
  const pathname = usePathname();

  useEffect(() => {
    const open = () => setReopened(true);
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  // Chargement des pixels et « page vue » à chaque changement de page.
  useEffect(() => {
    if (choice !== "granted") return;
    if (pixels.meta) loadMeta(pixels.meta);
    if (pixels.tiktok) loadTikTok(pixels.tiktok);
    window.fbq?.("track", "PageView");
    window.ttq?.page?.();
  }, [choice, pathname, pixels.meta, pixels.tiktok]);

  const decide = (value: "granted" | "denied") => {
    try {
      localStorage.setItem(consentKey(storeId), value);
    } catch {
      // ignoré
    }
    // Retrait du consentement : on recharge pour décharger les scripts déjà présents.
    if (value === "denied" && (window.fbq || window.ttq)) window.location.reload();
    setReopened(false);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  if (choice === null || (choice !== "unknown" && !reopened)) return null;
  return (
    <div role="dialog" aria-label={t.title} className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--store-bg)] p-4 text-sm text-[var(--store-text)] shadow-lg sm:p-5" data-consent>
      <p className="font-semibold">{t.title}</p>
      <p className="mt-1 text-[var(--sf-muted)]">
        {t.body} <Link href={`${base}/legal/confidentialite`} className="underline">{t.policy}</Link>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => decide("granted")} className="sf-btn px-4 py-2 text-sm">{t.accept}</button>
        <button type="button" onClick={() => decide("denied")} className="sf-btn-outline px-4 py-2 text-sm">{t.refuse}</button>
      </div>
    </div>
  );
}

/** Lien du pied de page pour revoir son choix. */
export function ManageConsentLink({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))} className="hover:underline">
      {label}
    </button>
  );
}
