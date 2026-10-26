import { CjError, cjRequest } from "./client";
import {
  type CjProductDetail,
  type CjProductSummary,
  type CjShippingOption,
  normalizeListResponse,
  normalizeProductDetail,
  normalizeShippingOptions,
  normalizeStock,
} from "./normalize";

/**
 * Catalogue CJ : recherche, fiche produit, frais de livraison, stock.
 * Lecture seule : aucune commande ni aucun paiement n'est effectué ici.
 */

/**
 * Recherche dans le catalogue (Product List V2 ; l'ancienne /product/list est dépréciée et limitée à
 * 1000 appels/jour). `byPopularity` : les produits les plus importés par les boutiques CJ en premier.
 */
export async function searchProducts(keyword: string, pageSize = 20, options: { byPopularity?: boolean } = {}): Promise<CjProductSummary[]> {
  const data = await cjRequest("GET", "/product/listV2", {
    query: {
      keyWord: keyword,
      page: 1,
      size: Math.min(pageSize, 100),
      features: ["enable_category"],
      ...(options.byPopularity && { orderBy: 1, sort: "desc" }), // 1 = nombre d'importations (listedNum)
    },
  });
  return normalizeListResponse(data);
}

/**
 * Réponse de CJ indiquant qu'un produit n'existe plus ou n'est plus en vente.
 * (Formulation à confirmer avec l'API réelle : seules ces erreurs explicites masquent un produit ;
 * toute autre erreur est considérée comme passagère.)
 */
const PRODUCT_GONE = /not\s*(found|exist)|does\s*not\s*exist|offline|removed|delisted|unavailable|下架|不存在/i;

/** Fiche produit, ou null si le produit n'existe plus chez CJ ou n'est plus en vente. */
export async function getProductDetail(pid: string): Promise<CjProductDetail | null> {
  try {
    const detail = normalizeProductDetail(await cjRequest("GET", "/product/query", { query: { pid } }));
    return detail?.onSale === false ? null : detail;
  } catch (err) {
    if (err instanceof CjError && err.code !== undefined && PRODUCT_GONE.test(err.message)) return null;
    throw err;
  }
}

/** Options de livraison d'une variante vers un pays (Canada par défaut), depuis la Chine. */
export async function getShippingOptions(vid: string, countryCode = "CA", quantity = 1): Promise<CjShippingOption[]> {
  const data = await cjRequest("POST", "/logistic/freightCalculate", {
    body: { startCountryCode: "CN", endCountryCode: countryCode, products: [{ quantity, vid }] },
  });
  return normalizeShippingOptions(data);
}

export async function getVariantStock(vid: string): Promise<number | null> {
  const data = await cjRequest("GET", "/product/stock/queryByVid", { query: { vid } });
  return normalizeStock(data);
}
