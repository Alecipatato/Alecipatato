"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { CjError, CjNotConfiguredError } from "@/lib/cj/client";
import { getUsdCadRate } from "@/lib/fx";
import { minimumPriceCents, usdToCadCents } from "@/lib/money";
import { addReplacement, advanceSourcing, type SourcingState, startSourcingJob } from "@/lib/products/sourcing";
import { getPlatformSettings } from "@/lib/settings";
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

/** Fait avancer la recherche de produits d'une étape (appelée en boucle par l'écran). */
export async function advanceSourcingAction(storeId: string, jobId: string): Promise<SourcingState | { error: string }> {
  const user = await requireUser();
  if (!(await ownedStore(storeId, user.id))) return { error: "Boutique introuvable." };
  const { data: job } = await createAdminClient().from("sourcing_jobs").select("id").eq("id", jobId).eq("store_id", storeId).maybeSingle();
  if (!job) return { error: "Recherche introuvable." };
  try {
    return await advanceSourcing(jobId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "La recherche a échoué." };
  }
}

/** Relance une recherche de produits (mots-clés en anglais, séparés par des virgules). */
export async function startNewSearch(_prev: ProductActionState, formData: FormData): Promise<ProductActionState> {
  const user = await requireUser();
  const storeId = String(formData.get("store_id") ?? "");
  if (!(await ownedStore(storeId, user.id))) return { error: "Boutique introuvable." };
  const keywords = String(formData.get("keywords") ?? "")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter((k) => /^[a-z0-9 \-]{2,40}$/.test(k))
    .slice(0, 6);
  if (keywords.length === 0) return { error: "Entrez au moins un mot-clé en anglais (ex. : coffee grinder, espresso cup)." };
  await startSourcingJob(storeId, keywords);
  revalidatePath(pagePath(storeId));
  return { message: "Nouvelle recherche lancée." };
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

/** Refuse un produit et, si demandé, le remplace par le prochain choix de l'IA. */
export async function rejectProduct(_prev: ProductActionState, formData: FormData): Promise<ProductActionState> {
  const user = await requireUser();
  const product = await ownedProduct(String(formData.get("product_id") ?? ""), user.id);
  if (!product) return { error: "Produit introuvable." };
  await createAdminClient().from("products").update({ status: "rejected" }).eq("id", product.id);

  let message = "Produit refusé.";
  if (formData.get("replace") === "1" && product.supplier === "cj") {
    try {
      message = (await addReplacement(product.store_id))
        ? "Produit remplacé : le nouveau produit vous attend dans « À valider »."
        : "Produit refusé. Plus de remplaçant disponible : lancez une nouvelle recherche.";
    } catch (err) {
      const reason = err instanceof CjNotConfiguredError || err instanceof CjError ? err.message : "le fournisseur ne répond pas";
      message = `Produit refusé, mais le remplacement a échoué (${reason}).`;
    }
  }
  revalidatePath(pagePath(product.store_id));
  return { message };
}

/** Modifie le prix de vente, sans jamais descendre sous la marge minimale. */
export async function updateProductPrice(_prev: ProductActionState, formData: FormData): Promise<ProductActionState> {
  const user = await requireUser();
  const product = await ownedProduct(String(formData.get("product_id") ?? ""), user.id);
  if (!product) return { error: "Produit introuvable." };

  const match = /^(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(String(formData.get("price") ?? "").trim().replace(/\s|\$/g, ""));
  if (!match) return { error: "Prix invalide (ex. : 24,99)." };
  const priceCents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));

  const settings = await getPlatformSettings();
  const fx = await getUsdCadRate(settings.usdCadFallbackRate);
  const costCad = usdToCadCents(Number(product.supplier_cost_usd_cents) + Number(product.shipping_cost_usd_cents), fx.rate);
  const minPrice = minimumPriceCents(costCad, settings.minMarginRate);
  if (priceCents < minPrice) {
    return { error: `Prix trop bas : minimum ${formatPrice(minPrice, "CAD")} pour garder ${Math.round(Number(settings.minMarginRate) * 100)} % de marge.` };
  }

  await createAdminClient().from("products").update({ price_cents: priceCents, sync_status: "ok", sync_note: null }).eq("id", product.id);
  revalidatePath(pagePath(product.store_id));
  return { message: "Prix enregistré." };
}
