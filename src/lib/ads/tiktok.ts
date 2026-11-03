/**
 * Client de l'API Marketing de TikTok (API for Business v1.3, doc vérifiée le 2026-11-03).
 * Depuis le 2027-01-01, les campagnes Ventes « manuelles » (/campaign/create/…) ne peuvent plus être créées :
 * on utilise les API « Upgraded Smart+ » (/smart_plus/campaign|adgroup|ad/create/).
 * Sur TikTok, les publicités d'un nouveau compte doivent être des Spark Ads : une vidéo publiée sur le compte TikTok
 * du vendeur (identité TT_USER), mise en avant. Tout est créé DÉSACTIVÉ ; le vendeur lance la campagne.
 * Les dépenses sont facturées par TikTok au compte annonceur du vendeur : la plateforme ne touche jamais cet argent.
 * TIKTOK_API_BASE / TIKTOK_AUTH_BASE : simulateur pour les tests locaux.
 */

export class TiktokError extends Error {
  readonly code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}

const apiBase = () => (process.env.TIKTOK_API_BASE || "https://business-api.tiktok.com").replace(/\/$/, "");
const authBase = () => (process.env.TIKTOK_AUTH_BASE || "https://business-api.tiktok.com").replace(/\/$/, "");

/** Canada (identifiant de lieu TikTok = identifiant GeoNames ; liste : /tool/region/). */
export const TIKTOK_CANADA_LOCATION_ID = "6251999";
/** Événement de conversion « Achat terminé » du pixel TikTok. */
export const TIKTOK_PURCHASE_EVENT = "SHOPPING";

export function isTiktokConfigured(): boolean {
  return Boolean(process.env.TIKTOK_APP_ID && process.env.TIKTOK_APP_SECRET);
}

/** Adresse d'autorisation de l'annonceur (le vendeur relie son compte publicitaire TikTok). */
export function tiktokAuthUrl(state: string, redirectUri: string): string {
  const url = new URL(`${authBase()}/portal/auth`);
  url.searchParams.set("app_id", process.env.TIKTOK_APP_ID ?? "");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);
  return url.toString();
}

type Query = Record<string, string | number | boolean | string[] | undefined>;

async function call<T = Record<string, unknown>>(method: "GET" | "POST", path: string, token: string | null, params: Query | Record<string, unknown> = {}): Promise<T> {
  const url = new URL(`${apiBase()}/open_api/v1.3/${path.replace(/^\//, "")}`);
  if (method === "GET") {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      url.searchParams.set(k, Array.isArray(v) ? JSON.stringify(v) : String(v));
    }
  }
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json", ...(token && { "Access-Token": token }) },
    ...(method === "POST" && { body: JSON.stringify(params) }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await response.json().catch(() => ({}))) as { code?: number; message?: string; data?: unknown };
  if (!response.ok || json.code !== 0) throw new TiktokError(json.message || `TikTok HTTP ${response.status}`, json.code);
  return (json.data ?? {}) as T;
}

/** Échange le code d'autorisation (valable 1 h, une seule fois) contre un jeton longue durée. */
export async function exchangeTiktokCode(authCode: string): Promise<{ accessToken: string; advertiserIds: string[] }> {
  const data = await call<{ access_token: string; advertiser_ids?: string[] }>("POST", "oauth2/access_token/", null, {
    app_id: process.env.TIKTOK_APP_ID,
    secret: process.env.TIKTOK_APP_SECRET,
    auth_code: authCode,
  });
  return { accessToken: data.access_token, advertiserIds: (data.advertiser_ids ?? []).map(String) };
}

export interface TiktokAdvertiser {
  id: string;
  name: string;
  currency: string;
}

/** Comptes annonceurs accessibles avec le jeton, avec leur devise. */
export async function listTiktokAdvertisers(token: string): Promise<TiktokAdvertiser[]> {
  const list = await call<{ list?: { advertiser_id: string; advertiser_name?: string }[] }>("GET", "oauth2/advertiser/get/", token, {
    app_id: process.env.TIKTOK_APP_ID,
    secret: process.env.TIKTOK_APP_SECRET,
  });
  const ids = (list.list ?? []).map((a) => String(a.advertiser_id));
  if (ids.length === 0) return [];
  const info = await call<{ list?: { advertiser_id: string; name?: string; currency?: string }[] }>("GET", "advertiser/info/", token, {
    advertiser_ids: ids,
    fields: ["advertiser_id", "name", "currency"],
  });
  const byId = new Map((info.list ?? []).map((a) => [String(a.advertiser_id), a]));
  return (list.list ?? []).map((a) => ({
    id: String(a.advertiser_id),
    name: byId.get(String(a.advertiser_id))?.name || a.advertiser_name || String(a.advertiser_id),
    currency: byId.get(String(a.advertiser_id))?.currency || "",
  }));
}

/** Comptes TikTok (identités « TT_USER ») liés au compte annonceur : ils publient les Spark Ads. */
export async function listTiktokIdentities(token: string, advertiserId: string): Promise<{ id: string; name: string }[]> {
  const data = await call<{ identity_list?: { identity_id: string; display_name?: string }[] }>("GET", "identity/get/", token, {
    advertiser_id: advertiserId,
    identity_type: "TT_USER",
  });
  return (data.identity_list ?? []).map((i) => ({ id: String(i.identity_id), name: i.display_name || String(i.identity_id) }));
}

/** Vidéos publiées sur le compte TikTok (les 20 plus récentes). */
export async function listTiktokPosts(token: string, advertiserId: string, identityId: string): Promise<{ itemId: string; text: string; public: boolean }[]> {
  const data = await call<{ video_list?: { item_id: string; text?: string; status?: string; item_type?: string }[] }>("GET", "identity/video/get/", token, {
    advertiser_id: advertiserId,
    identity_type: "TT_USER",
    identity_id: identityId,
    item_type: "VIDEO",
    count: 20,
  });
  return (data.video_list ?? []).map((v) => ({ itemId: String(v.item_id), text: v.text ?? "", public: v.status === "ITEM_STATUS_HESITATE_RECOMMEND" }));
}

export interface TiktokCampaignInput {
  advertiserId: string;
  identityId: string;
  pixelId: string;
  name: string;
  /** Budget quotidien en cents de la devise du compte (TikTok attend des unités : 25,00). */
  dailyBudgetCents: number;
  adText: string;
  linkUrl: string;
  /** Vidéo publiée sur le compte TikTok du vendeur (Spark Ad). */
  tiktokItemId: string;
  /** Identifiant unique (chiffres) : TikTok ignore une seconde demande portant le même identifiant. */
  requestId: string;
  /** Début de diffusion, « AAAA-MM-JJ HH:MM:SS » (UTC). */
  startTime: string;
}

/** Cents → unités avec deux décimales (2500 → 25), sans calcul en virgule flottante sur les montants. */
export function centsToUnits(cents: number): number {
  return Number(`${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`);
}

/** Date TikTok (UTC) : « 2026-11-03 14:05:00 ». */
export function tiktokTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Paramètres de chaque étape (purs, testés) : campagne Smart+ « Ventes » sur le site (budget de campagne quotidien),
 * groupe d'annonces optimisé pour les achats mesurés par le pixel, Canada 18+, ciblage automatique, Spark Ad.
 * TOUT est créé désactivé (operation_status DISABLE).
 */
export function tiktokCampaignPayloads(input: TiktokCampaignInput) {
  const base = { advertiser_id: input.advertiserId };
  return {
    campaign: {
      ...base,
      request_id: input.requestId,
      campaign_name: input.name.slice(0, 512),
      objective_type: "WEB_CONVERSIONS",
      sales_destination: "WEBSITE",
      budget_optimize_on: true,
      budget_mode: "BUDGET_MODE_DYNAMIC_DAILY_BUDGET",
      budget: centsToUnits(input.dailyBudgetCents),
      operation_status: "DISABLE",
    },
    adgroup: (campaignId: string) => ({
      ...base,
      campaign_id: campaignId,
      request_id: `${input.requestId}1`,
      adgroup_name: `${input.name} — Canada`.slice(0, 512),
      promotion_type: "WEBSITE",
      optimization_goal: "CONVERT",
      pixel_id: input.pixelId,
      optimization_event: TIKTOK_PURCHASE_EVENT,
      billing_event: "OCPM",
      bid_type: "BID_TYPE_NO_BID",
      schedule_type: "SCHEDULE_FROM_NOW",
      schedule_start_time: input.startTime,
      targeting_optimization_mode: "AUTOMATIC",
      targeting_spec: { location_ids: [TIKTOK_CANADA_LOCATION_ID], spc_audience_age: "OVER_EIGHTEEN" },
      operation_status: "DISABLE",
    }),
    ad: (adgroupId: string, ctaPortfolioId: string) => ({
      ...base,
      adgroup_id: adgroupId,
      ad_name: input.name.slice(0, 512),
      operation_status: "DISABLE",
      creative_list: [
        { creative_info: { ad_format: "SINGLE_VIDEO", tiktok_item_id: input.tiktokItemId, identity_type: "TT_USER", identity_id: input.identityId } },
      ],
      ad_text_list: [{ ad_text: input.adText }],
      landing_page_url_list: [{ landing_page_url: input.linkUrl }],
      // Spark Ad (TT_USER) vers un site : bouton d'action « dynamique » obligatoire.
      call_to_action_id: ctaPortfolioId,
    }),
  };
}

export interface TiktokCampaignIds {
  campaignId?: string;
  adgroupId?: string;
  ctaPortfolioId?: string;
  adId?: string;
}

/** Bouton d'action dynamique recommandé par TikTok pour une campagne de ventes sur un site (portefeuille « CTA »). */
async function createCtaPortfolio(token: string, advertiserId: string, language: string): Promise<string> {
  const rec = await call<{ recommend_assets?: { asset_ids: string[]; asset_content: string }[] }>("GET", "creative/cta/recommend/", token, {
    advertiser_id: advertiserId,
    new_version: true,
    objective_type: "WEB_CONVERSIONS",
    promotion_type: "WEBSITE",
    language,
  });
  const assets = (rec.recommend_assets ?? []).filter((a) => a.asset_ids?.length);
  if (assets.length === 0) throw new TiktokError("TikTok n'a proposé aucun bouton d'action.");
  const portfolio = await call<{ creative_portfolio_id: string }>("POST", "creative/portfolio/create/", token, {
    advertiser_id: advertiserId,
    creative_portfolio_type: "CTA",
    portfolio_content: assets.map((a) => ({ asset_content: a.asset_content, asset_ids: a.asset_ids })),
  });
  return String(portfolio.creative_portfolio_id);
}

/** Crée la campagne complète, désactivée. En cas d'erreur, renvoie les identifiants déjà créés avec l'erreur. */
export async function createDisabledTiktokCampaign(token: string, input: TiktokCampaignInput, language = "en"): Promise<{ ids: TiktokCampaignIds; error?: TiktokError }> {
  const p = tiktokCampaignPayloads(input);
  const ids: TiktokCampaignIds = {};
  try {
    ids.campaignId = String((await call<{ campaign_id: string }>("POST", "smart_plus/campaign/create/", token, p.campaign)).campaign_id);
    ids.adgroupId = String((await call<{ adgroup_id: string }>("POST", "smart_plus/adgroup/create/", token, p.adgroup(ids.campaignId))).adgroup_id);
    ids.ctaPortfolioId = await createCtaPortfolio(token, input.advertiserId, language);
    const ad = await call<{ smart_plus_ad_id?: string; ad_id?: string }>("POST", "smart_plus/ad/create/", token, p.ad(ids.adgroupId, ids.ctaPortfolioId));
    ids.adId = String(ad.smart_plus_ad_id ?? ad.ad_id);
    return { ids };
  } catch (err) {
    return { ids, error: err instanceof TiktokError ? err : new TiktokError(String(err)) };
  }
}

/** Active ou désactive la campagne (l'ensemble et l'annonce ont été créés désactivés : on les active aussi). */
export async function setTiktokCampaignStatus(token: string, advertiserId: string, ids: TiktokCampaignIds, status: "ENABLE" | "DISABLE"): Promise<void> {
  if (status === "ENABLE") {
    if (ids.adId) await call("POST", "smart_plus/ad/status/update/", token, { advertiser_id: advertiserId, smart_plus_ad_ids: [ids.adId], operation_status: status });
    if (ids.adgroupId) await call("POST", "smart_plus/adgroup/status/update/", token, { advertiser_id: advertiserId, adgroup_ids: [ids.adgroupId], operation_status: status });
  }
  if (ids.campaignId) await call("POST", "smart_plus/campaign/status/update/", token, { advertiser_id: advertiserId, campaign_ids: [ids.campaignId], operation_status: status });
}

export interface TiktokInsights {
  spendCents: number;
  clicks: number;
  purchases: number;
}

/** Résultats depuis le début de la campagne (rapport de base). Null si aucune donnée. */
export async function getTiktokInsights(token: string, advertiserId: string, campaignId: string): Promise<TiktokInsights | null> {
  const data = await call<{ list?: { metrics?: Record<string, string> }[] }>("GET", "report/integrated/get/", token, {
    advertiser_id: advertiserId,
    report_type: "BASIC",
    data_level: "AUCTION_CAMPAIGN",
    dimensions: ["campaign_id"],
    metrics: ["spend", "clicks", "complete_payment"],
    filtering: JSON.stringify([{ field_name: "campaign_ids", filter_type: "IN", filter_value: JSON.stringify([campaignId]) }]),
    query_lifetime: true,
  });
  const m = data.list?.[0]?.metrics;
  if (!m) return null;
  const [whole, frac = ""] = String(m.spend ?? "0").split(".");
  return {
    spendCents: Number(whole || 0) * 100 + Number(frac.padEnd(2, "0").slice(0, 2) || 0),
    clicks: Number(m.clicks ?? 0),
    purchases: Number(m.complete_payment ?? 0),
  };
}
