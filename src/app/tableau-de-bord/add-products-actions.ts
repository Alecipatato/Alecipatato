"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { StoreBrief } from "@/lib/ai/store-generator";
import { requireUser } from "@/lib/auth";
import { isCjConfigured } from "@/lib/cj/client";
import { isLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/server";
import { startSourcingJob } from "@/lib/products/sourcing";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTrendingProducts, type TrendProduct } from "@/lib/trends/catalog";
import { trendSampleRows } from "@/lib/trends/sample-rows";
import { MAX_SELECTION } from "@/lib/trends/score";
import { isTrendTheme, TREND_THEMES } from "@/lib/trends/themes";

/**
 * Ajout de produits à une boutique existante : le vendeur les choisit dans la liste des produits
 * tendance, ou laisse l'IA les choisir. L'IA rédige toujours la fiche ; les produits sont mis en vente.
 */

export type AddProductsState = { error?: string };

const AI_COUNTS = [3, 5, 10];

async function loadStore(storeId: string) {
  const user = await requireUser();
  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id, status, language, niche_description, generation_brief")
    .eq("id", storeId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!store || store.status === "suspended") return null;
  const [{ data: products }, { data: job }] = await Promise.all([
    admin.from("products").select("supplier, supplier_product_id, position, status").eq("store_id", store.id),
    admin.from("sourcing_jobs").select("status").eq("store_id", store.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const owned = new Set((products ?? []).map((p) => p.supplier_product_id));
  const busy = Boolean(job && job.status !== "done" && job.status !== "failed");
  const nextPosition = Math.max(-1, ...(products ?? []).map((p) => p.position ?? 0)) + 1;
  // Même décompte que la recherche CJ (produits du fournisseur proposés ou en vente) : sert de cible.
  const onSale = (products ?? []).filter((p) => p.supplier === "cj" && (p.status === "proposed" || p.status === "active")).length;
  return { store, owned, busy, nextPosition, onSale, language: isLocale(store.language) ? store.language : ("en" as const) };
}

const productsPage = (storeId: string) => `/tableau-de-bord/boutiques/${storeId}/produits`;

/** Produits de la liste qui ne sont pas encore dans la boutique. */
export async function availableTrends(storeId: string): Promise<TrendProduct[] | null> {
  const ctx = await loadStore(storeId);
  if (!ctx) return null;
  return (await getTrendingProducts(ctx.language)).filter((p) => !ctx.owned.has(p.supplierProductId));
}

async function insertSamples(storeId: string, products: TrendProduct[], nextPosition: number) {
  const { error } = await createAdminClient().from("products").insert(await trendSampleRows(storeId, products, nextPosition));
  if (error) throw new Error(`Ajout des produits impossible : ${error.message}`);
  revalidatePath(productsPage(storeId));
  redirect(`${productsPage(storeId)}?ajoutes=${products.length}`);
}

/** « Choisir dans la liste » : 1 à 20 produits, tous thèmes. */
export async function addChosenProducts(storeId: string, _prev: AddProductsState, formData: FormData): Promise<AddProductsState> {
  const m = await getMessages();
  const ctx = await loadStore(storeId);
  if (!ctx) return { error: m.dashboard.actions.notFound };
  if (ctx.busy) return { error: m.trends.add.busy };

  const ids = [...new Set(formData.getAll("product_ids").map(String))];
  if (ids.length < 1) return { error: m.trends.add.chooseFirst };
  if (ids.length > MAX_SELECTION) return { error: m.trends.errors.too_many };
  const catalogue = new Map((await getTrendingProducts(ctx.language)).map((p) => [p.id, p]));
  const chosen = ids.map((id) => catalogue.get(id));
  if (chosen.some((p) => !p)) return { error: m.trends.errors.unknown_product };
  const fresh = (chosen as TrendProduct[]).filter((p) => !ctx.owned.has(p.supplierProductId));
  if (fresh.length === 0) return { error: m.trends.add.noneLeft };

  if (fresh[0].source === "cj") {
    // Fiches vérifiées chez CJ et rédigées par l'IA sur l'écran « Produits », par petits lots.
    await startSourcingJob(storeId, [], ctx.onSale + fresh.length, { pids: fresh.map((p) => p.supplierProductId), autoAccept: true });
    redirect(`${productsPage(storeId)}?ajout=1`);
  }
  await insertSamples(storeId, fresh, ctx.nextPosition);
  return {};
}

/** « Laisser l'IA choisir » : l'IA cherche N produits adaptés à la boutique. */
export async function addProductsByAi(storeId: string, _prev: AddProductsState, formData: FormData): Promise<AddProductsState> {
  const m = await getMessages();
  const ctx = await loadStore(storeId);
  if (!ctx) return { error: m.dashboard.actions.notFound };
  if (ctx.busy) return { error: m.trends.add.busy };
  const count = Number(formData.get("count"));
  if (!AI_COUNTS.includes(count)) return { error: m.trends.errors.too_few };

  const brief = (ctx.store.generation_brief ?? {}) as Partial<StoreBrief>;
  const theme = isTrendTheme(brief.trendTheme) ? brief.trendTheme : null;

  if (isCjConfigured()) {
    // Mots-clés de la dernière recherche, sinon ceux du thème, sinon la niche.
    const { data: last } = await createAdminClient()
      .from("sourcing_jobs")
      .select("keywords")
      .eq("store_id", storeId)
      .neq("keywords", "[]")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const keywords = (Array.isArray(last?.keywords) && last.keywords.length ? (last.keywords as string[])
      : theme ? [...TREND_THEMES.find((t) => t.id === theme)!.keywords]
      : [String(ctx.store.niche_description ?? "").slice(0, 40)]).filter(Boolean);
    await startSourcingJob(storeId, keywords, ctx.onSale + count, { autoAccept: true });
    redirect(`${productsPage(storeId)}?ajout=1`);
  }

  // Sans CJ : les produits d'exemple les plus demandés du thème de la boutique.
  const catalogue = (await getTrendingProducts(ctx.language)).filter((p) => !ctx.owned.has(p.supplierProductId));
  const ownedThemes = (await getTrendingProducts(ctx.language)).filter((p) => ctx.owned.has(p.supplierProductId)).map((p) => p.theme);
  const storeTheme = theme ?? ownedThemes.sort((a, b) => ownedThemes.filter((x) => x === b).length - ownedThemes.filter((x) => x === a).length)[0] ?? null;
  const picks = catalogue.filter((p) => !storeTheme || p.theme === storeTheme).slice(0, count);
  if (picks.length === 0) return { error: m.trends.add.noneLeft };
  await insertSamples(storeId, picks, ctx.nextPosition);
  return {};
}
