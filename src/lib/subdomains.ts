import { DEMO_SUBDOMAINS } from "./demo-stores";
import { createAdminClient } from "./supabase/admin";
import { RESERVED_SUBDOMAINS, SUBDOMAIN_PATTERN } from "./tenant";

/** « Zen Atelier & Co » → « zen-atelier-co » */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

function isBlocked(subdomain: string) {
  return !SUBDOMAIN_PATTERN.test(subdomain) || RESERVED_SUBDOMAINS.has(subdomain) || DEMO_SUBDOMAINS.has(subdomain);
}

/** Trouve un sous-domaine libre à partir d'une suggestion (ajoute -2, -3… si nécessaire). */
export async function allocateSubdomain(...suggestions: string[]): Promise<string> {
  const base = suggestions.map(slugify).find((s) => s.length >= 3) ?? "boutique";
  const candidates = [base, ...Array.from({ length: 30 }, (_, i) => `${base}-${i + 2}`)].filter((c) => !isBlocked(c));

  const { data, error } = await createAdminClient().from("stores").select("subdomain").in("subdomain", candidates);
  if (error) throw new Error(`Vérification du sous-domaine impossible : ${error.message}`);
  const taken = new Set((data ?? []).map((r) => r.subdomain));

  const free = candidates.find((c) => !taken.has(c));
  return free ?? `${base}-${Date.now().toString(36)}`;
}
