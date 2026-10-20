import { cache } from "react";
import type { Messages } from "../i18n/messages";
import { fmt } from "../i18n/config";
import { createAdminClient } from "../supabase/admin";
import { findViolation, type ModerationKind, type ModerationRule, type Violation } from "./match";

/** Règles actives (table moderation_rules), lues une fois par requête. */
export const getModerationRules = cache(async (): Promise<ModerationRule[]> => {
  const { data, error } = await createAdminClient().from("moderation_rules").select("kind, term").eq("active", true);
  if (error) throw new Error(`Lecture des règles de modération impossible : ${error.message}`);
  return (data ?? []) as ModerationRule[];
});

/** Vérifie des textes avec les règles actives. */
export async function moderate(texts: (string | null | undefined)[], categories: (string | null | undefined)[] = []): Promise<Violation | null> {
  return findViolation(await getModerationRules(), texts, categories);
}

/** Motif enregistré dans products.moderation_reason : « kind:terme » (traduit à l'affichage). */
export function encodeViolation(v: Violation): string {
  return `${v.kind}:${v.term}`;
}

const KINDS: ModerationKind[] = ["brand", "counterfeit", "prohibited", "category"];

/** Motif lisible dans la langue de la page. */
export function describeViolation(reason: string | Violation, m: Messages): string {
  const v = typeof reason === "string" ? decode(reason) : reason;
  if (!v) return reason as string;
  return fmt(m.moderation.reasons[v.kind], { term: v.term });
}

function decode(reason: string): Violation | null {
  const i = reason.indexOf(":");
  const kind = reason.slice(0, i) as ModerationKind;
  return i > 0 && KINDS.includes(kind) ? { kind, term: reason.slice(i + 1) } : null;
}
