import { createAdminClient } from "../supabase/admin";
import { findViolation } from "./match";
import { encodeViolation, getModerationRules } from "./rules";

/**
 * Applique les règles actuelles à tous les produits en vente ou à valider.
 * Les produits concernés sont refusés et marqués (ils ne pourront plus être remis en vente).
 */
export async function rescanProducts(): Promise<{ checked: number; blocked: number }> {
  const admin = createAdminClient();
  const rules = await getModerationRules();
  let checked = 0;
  let blocked = 0;
  let lastId = "00000000-0000-0000-0000-000000000000";

  for (;;) {
    // Parcours par identifiant croissant : les produits bloqués sortent du filtre sans décaler la suite.
    const { data, error } = await admin
      .from("products")
      .select("id, title, description, highlights, category")
      .in("status", ["proposed", "active"])
      .is("moderation_reason", null)
      .gt("id", lastId)
      .order("id")
      .limit(500);
    if (error) throw new Error(`Lecture des produits impossible : ${error.message}`);
    if (!data || data.length === 0) break;

    for (const p of data) {
      checked++;
      const highlights = Array.isArray(p.highlights) ? p.highlights.filter((h): h is string => typeof h === "string") : [];
      const violation = findViolation(rules, [p.title, p.description, ...highlights], [p.category]);
      if (violation) {
        await admin.from("products").update({ status: "rejected", moderation_reason: encodeViolation(violation) }).eq("id", p.id);
        blocked++;
      }
    }
    lastId = data[data.length - 1].id;
  }
  return { checked, blocked };
}
