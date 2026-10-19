import { cjRequest } from "./client";
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

export async function searchProducts(keyword: string, pageSize = 20): Promise<CjProductSummary[]> {
  const data = await cjRequest("GET", "/product/list", { query: { productNameEn: keyword, pageNum: 1, pageSize } });
  return normalizeListResponse(data);
}

export async function getProductDetail(pid: string): Promise<CjProductDetail | null> {
  const data = await cjRequest("GET", "/product/query", { query: { pid } });
  return normalizeProductDetail(data);
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
