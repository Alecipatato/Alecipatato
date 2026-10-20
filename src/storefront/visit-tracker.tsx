"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { recordVisit } from "./actions";

/** Mesure d'audience anonyme : une page vue par affichage, un visiteur par session de navigation. */
export function VisitTracker({ site, storeId }: { site: string; storeId: string }) {
  const pathname = usePathname();
  useEffect(() => {
    const key = `visit:${storeId}`;
    let isNew = false;
    try {
      isNew = !sessionStorage.getItem(key);
      sessionStorage.setItem(key, "1");
    } catch {
      // Stockage indisponible : la visite compte comme une page vue seulement.
    }
    recordVisit(site, isNew).catch(() => {});
  }, [pathname, site, storeId]);
  return null;
}
