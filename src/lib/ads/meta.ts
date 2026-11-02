/**
 * Client de l'API Marketing de Meta (Graph API, doc vérifiée le 2026-11-02 : v26.0).
 * Connexion du vendeur (Facebook Login), comptes publicitaires et pages, création d'une campagne « Ventes »
 * EN PAUSE (campagne → ensemble de publicités → visuel → publicité), lancement et pause, résultats.
 * Les dépenses sont facturées par Meta au compte publicitaire du vendeur : la plateforme ne touche jamais cet argent.
 * META_GRAPH_BASE / META_DIALOG_BASE : simulateur pour les tests locaux.
 */

export class MetaError extends Error {
  readonly code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}

const version = () => process.env.META_GRAPH_VERSION || "v26.0";
const graphBase = () => (process.env.META_GRAPH_BASE || "https://graph.facebook.com").replace(/\/$/, "");
const dialogBase = () => (process.env.META_DIALOG_BASE || "https://www.facebook.com").replace(/\/$/, "");

/** Permissions demandées au vendeur (gestion de ses publicités et de ses pages). */
export const META_SCOPES = ["ads_management", "ads_read", "business_management", "pages_show_list", "pages_read_engagement"];

export function isMetaConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

/** Adresse de la fenêtre de connexion Facebook. */
export function metaAuthUrl(state: string, redirectUri: string): string {
  const url = new URL(`${dialogBase()}/${version()}/dialog/oauth`);
  url.searchParams.set("client_id", process.env.META_APP_ID ?? "");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", META_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  return url.toString();
}

type Params = Record<string, string | number | boolean | object | undefined>;

/** Les objets (ciblage, visuel…) sont envoyés en JSON, comme dans la doc Meta. */
export function encodeParams(params: Params): URLSearchParams {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    body.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  return body;
}

async function graph<T = Record<string, unknown>>(method: "GET" | "POST", path: string, token: string | null, params: Params = {}): Promise<T> {
  const url = new URL(`${graphBase()}/${version()}/${path.replace(/^\//, "")}`);
  const body = encodeParams({ ...params, ...(token && { access_token: token }) });
  if (method === "GET") body.forEach((v, k) => url.searchParams.set(k, v));
  const response = await fetch(url, {
    method,
    ...(method === "POST" && { body, headers: { "content-type": "application/x-www-form-urlencoded" } }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const error = json.error as { message?: string; code?: number; error_user_msg?: string } | undefined;
  if (!response.ok || error) throw new MetaError(error?.error_user_msg || error?.message || `Meta HTTP ${response.status}`, error?.code);
  return json as T;
}

/** Échange le code de connexion contre un jeton longue durée (environ 60 jours). */
export async function exchangeMetaCode(code: string, redirectUri: string): Promise<{ accessToken: string; expiresAt: string | null }> {
  const app = { client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET };
  const short = await graph<{ access_token: string }>("GET", "oauth/access_token", null, { ...app, redirect_uri: redirectUri, code });
  const long = await graph<{ access_token: string; expires_in?: number }>("GET", "oauth/access_token", null, { ...app, grant_type: "fb_exchange_token", fb_exchange_token: short.access_token });
  return { accessToken: long.access_token, expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null };
}

export interface MetaAdAccount {
  id: string;
  name: string;
  currency: string;
  /** 1 = actif (statut de compte Meta). */
  active: boolean;
}

export async function listMetaAdAccounts(token: string): Promise<MetaAdAccount[]> {
  const res = await graph<{ data?: { id: string; name?: string; currency?: string; account_status?: number }[] }>("GET", "me/adaccounts", token, { fields: "id,name,currency,account_status", limit: 50 });
  return (res.data ?? []).map((a) => ({ id: a.id, name: a.name || a.id, currency: a.currency || "", active: a.account_status === 1 }));
}

export async function listMetaPages(token: string): Promise<{ id: string; name: string }[]> {
  const res = await graph<{ data?: { id: string; name?: string }[] }>("GET", "me/accounts", token, { fields: "id,name", limit: 50 });
  return (res.data ?? []).map((p) => ({ id: p.id, name: p.name || p.id }));
}

export interface MetaCampaignInput {
  adAccountId: string;
  pageId: string;
  pixelId: string;
  name: string;
  /** Budget quotidien en cents de la devise du compte publicitaire. */
  dailyBudgetCents: number;
  primaryText: string;
  headline: string;
  description: string;
  linkUrl: string;
  imageUrl: string;
}

/** Paramètres de chaque étape (purs, testés) : campagne Ventes, achats sur le site, Canada, 18 ans et plus, tout en pause. */
export function metaCampaignPayloads(input: MetaCampaignInput) {
  return {
    campaign: {
      name: input.name,
      objective: "OUTCOME_SALES",
      status: "PAUSED",
      special_ad_categories: [],
      // Budget défini sur l'ensemble de publicités (pas de budget de campagne).
      is_adset_budget_sharing_enabled: false,
    },
    adset: (campaignId: string) => ({
      name: `${input.name} — Canada`,
      campaign_id: campaignId,
      daily_budget: input.dailyBudgetCents,
      billing_event: "IMPRESSIONS",
      optimization_goal: "OFFSITE_CONVERSIONS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      promoted_object: { pixel_id: input.pixelId, custom_event_type: "PURCHASE" },
      targeting: { geo_locations: { countries: ["CA"] }, age_min: 18 },
      status: "PAUSED",
    }),
    creative: {
      name: input.name,
      object_story_spec: {
        page_id: input.pageId,
        link_data: {
          message: input.primaryText,
          link: input.linkUrl,
          name: input.headline,
          description: input.description,
          picture: input.imageUrl,
          call_to_action: { type: "SHOP_NOW", value: { link: input.linkUrl } },
        },
      },
    },
    ad: (adsetId: string, creativeId: string) => ({
      name: input.name,
      adset_id: adsetId,
      creative: { creative_id: creativeId },
      status: "PAUSED",
    }),
  };
}

export interface MetaCampaignIds {
  campaignId?: string;
  adsetId?: string;
  creativeId?: string;
  adId?: string;
}

/**
 * Crée la campagne complète en pause. En cas d'erreur, les identifiants déjà créés sont renvoyés avec l'erreur
 * (la campagne incomplète reste en pause chez Meta ; le vendeur peut la supprimer dans le Gestionnaire de publicités).
 */
export async function createPausedMetaCampaign(token: string, input: MetaCampaignInput): Promise<{ ids: MetaCampaignIds; error?: MetaError }> {
  const p = metaCampaignPayloads(input);
  const account = input.adAccountId.startsWith("act_") ? input.adAccountId : `act_${input.adAccountId}`;
  const ids: MetaCampaignIds = {};
  try {
    ids.campaignId = (await graph<{ id: string }>("POST", `${account}/campaigns`, token, p.campaign)).id;
    ids.adsetId = (await graph<{ id: string }>("POST", `${account}/adsets`, token, p.adset(ids.campaignId))).id;
    ids.creativeId = (await graph<{ id: string }>("POST", `${account}/adcreatives`, token, p.creative)).id;
    ids.adId = (await graph<{ id: string }>("POST", `${account}/ads`, token, p.ad(ids.adsetId, ids.creativeId))).id;
    return { ids };
  } catch (err) {
    return { ids, error: err instanceof MetaError ? err : new MetaError(String(err)) };
  }
}

/** Lance (ACTIVE) ou met en pause (PAUSED) la campagne, son ensemble de publicités et sa publicité. */
export async function setMetaCampaignStatus(token: string, ids: MetaCampaignIds, status: "ACTIVE" | "PAUSED"): Promise<void> {
  for (const id of [ids.adId, ids.adsetId, ids.campaignId]) {
    if (id) await graph("POST", id, token, { status });
  }
}

export interface MetaInsights {
  spendCents: number;
  impressions: number;
  clicks: number;
  purchases: number;
}

/** Résultats depuis le début (dépense en cents de la devise du compte). Null si aucune donnée. */
export async function getMetaInsights(token: string, campaignId: string): Promise<MetaInsights | null> {
  const res = await graph<{ data?: { spend?: string; impressions?: string; clicks?: string; actions?: { action_type: string; value: string }[] }[] }>(
    "GET",
    `${campaignId}/insights`,
    token,
    { fields: "spend,impressions,clicks,actions", date_preset: "maximum" },
  );
  const row = res.data?.[0];
  if (!row) return null;
  const spend = String(row.spend ?? "0").split(".");
  const spendCents = Number(spend[0] || 0) * 100 + Number((spend[1] ?? "").padEnd(2, "0").slice(0, 2) || 0);
  const purchases = (row.actions ?? []).filter((a) => a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase");
  return {
    spendCents,
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    purchases: purchases.length ? Math.max(...purchases.map((a) => Number(a.value) || 0)) : 0,
  };
}
