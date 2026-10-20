"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getUsdCadRate } from "@/lib/fx";
import { minimumPriceCents, usdToCadCents } from "@/lib/money";
import { addReplacement, startSourcingJob } from "@/lib/products/sourcing";
import { getPlatformSettings } from "@/lib/settings";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { formatPrice } from "@/lib/store-config";
import { createAdminClient } from "@/lib/supabase/admin";

export type ProductActionState = { error?: string; message?: string };

const pagePath = (storeId: string) => `/tableau-de-bord/boutiques/${storeId}/produits`;

/** Boutique du client connecté (sinon null). Une boutique suspendue ne peut pas être modifiée. */
async function ownedStore(storeId: string, userId: string) {
  const { data } = await createAdminClient().from("stores").select("id, status").eq("id", storeId).eq("owner_id", userId).maybeSingle();
  return data && data.status !== "suspended" ? data : null;
}

async function ownedProduct(productId: string, userId: string) {
  const { data } = await createAdminClient()
    .from("products")
    .select("id, store_id, status, supplier, supplier_cost_usd_cents, shipping_cost_usd_cents, stores!inner(owner_id, status)")
    .eq("id", productId)
    .maybeSingle();
  const store = data?.stores as unknown as { owner_id: string; status: string } | undefined;
  return data && store?.owner_id === userId && store.status !== "suspended" ? data : null;
}


/** Relance une recherche de produits (mots-clés en anglais, séparés par des virgules). */
export async function startNewSearch(_prev: ProductActionState, formData: FormData): Promise<ProductActionState> {
  const user = await requireUser();
  const t = (await getMessages()).sales.products.actions;
  const storeId = String(formData.get("store_id") ?? "");
  if (!(await ownedStore(storeId, user.id))) return { error: t.storeNotFound };
  const keywords = String(formData.get("keywords") ?? "")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter((k) => /^[a-z0-9 \-]{2,40}$/.test(k))
    .slice(0, 6);
  if (keywords.length === 0) return { error: t.keywordsRequired };
  await startSourcingJob(storeId, keywords);
  revalidatePath(pagePath(storeId));
  return { message: t.searchStarted };
}

/** Accepte un produit proposé : il apparaît dans la boutique. */
export async function acceptProduct(formData: FormData) {
  const user = await requireUser();
  const product = await ownedProduct(String(formData.get("product_id") ?? ""), user.id);
  if (!product) return;
  await createAdminClient().from("products").update({ status: "active" }).eq("id", product.id);
  revalidatePath(pagePath(product.store_id));
}

/** Accepte tous les produits proposés d'une boutique. */
export async function acceptAllProducts(formData: FormData) {
  const user = await requireUser();
  const storeId = String(formData.get("store_id") ?? "");
  if (!(await ownedStore(storeId, user.id))) return;
  await createAdminClient().from("products").update({ status: "active" }).eq("store_id", storeId).eq("status", "proposed");
  revalidatePath(pagePath(storeId));
}

/** Retire un produit de la vente (il redevient « à valider »). */
export async function unpublishProduct(formData: FormData) {
  const user = await requireUser();
  const product = await ownedProduct(String(formData.get("product_id") ?? ""), user.id);
  if (!product) return;
  await createAdminClient().from("products").update({ status: "proposed" }).eq("id", product.id);
  revalidatePath(pagePath(product.store_id));
}

/**
 * Refuse un produit et, si demandé, le remplace par le prochain choix de l'IA.
 * Le résultat s'affiche en haut de la page (le formulaire du produit refusé disparaît).
 */
export async function rejectProduct(formData: FormData) {
  const user = await requireUser();
  const product = await ownedProduct(String(formData.get("product_id") ?? ""), user.id);
  if (!product) return;
  await createAdminClient().from("products").update({ status: "rejected" }).eq("id", product.id);

  let result = "refuse";
  if (formData.get("replace") === "1" && product.supplier === "cj") {
    try {
      result = (await addReplacement(product.store_id)) ? "remplace" : "plus-de-remplacant";
    } catch (err) {
      console.error("Remplacement de produit :", err);
      result = "echec-remplacement";
    }
  }
  revalidatePath(pagePath(product.store_id));
  redirect(`${pagePath(product.store_id)}?resultat=${result}`);
}

/** Modifie le prix de vente, sans jamais descendre sous la marge minimale. */
export async function updateProductPrice(_prev: ProductActionState, formData: FormData): Promise<ProductActionState> {
  const user = await requireUser();
  const locale = await getLocale();
  const t = (await getMessages(locale)).sales.products.actions;
  const product = await ownedProduct(String(formData.get("product_id") ?? ""), user.id);
  if (!product) return { error: t.productNotFound };

  const match = /^(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(String(formData.get("price") ?? "").trim().replace(/\s|\$/g, ""));
  if (!match) return { error: t.invalidPrice };
  const priceCents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));

  const settings = await getPlatformSettings();
  const fx = await getUsdCadRate(settings.usdCadFallbackRate);
  const costCad = usdToCadCents(Number(product.supplier_cost_usd_cents) + Number(product.shipping_cost_usd_cents), fx.rate);
  const minPrice = minimumPriceCents(costCad, settings.minMarginRate);
  if (priceCents < minPrice) {
    return { error: fmt(t.priceTooLow, { min: formatPrice(minPrice, "CAD", locale), pct: Math.round(Number(settings.minMarginRate) * 100) }) };
  }

  await createAdminClient().from("products").update({ price_cents: priceCents, sync_status: "ok", sync_note: null }).eq("id", product.id);
  revalidatePath(pagePath(product.store_id));
  return { message: t.priceSaved };
}
