import { createAdminClient } from "../supabase/admin";
import { platformUrl } from "../tenant";
import { decryptSecret, encryptSecret, hasEncryptionKey } from "./crypto";
import { isMetaConfigured } from "./meta";

/** Connexion publicitaire d'une boutique (jeton déchiffré, côté serveur seulement). */
export interface AdConnection {
  storeId: string;
  platform: "meta" | "tiktok";
  accessToken: string;
  tokenExpiresAt: string | null;
  adAccountId: string | null;
  adAccountName: string | null;
  adAccountCurrency: string | null;
  pageId: string | null;
  pageName: string | null;
}

/** Les campagnes Meta sont disponibles si l'application Meta et la clé de chiffrement sont configurées. */
export function metaCampaignsAvailable(): boolean {
  return isMetaConfigured() && hasEncryptionKey();
}

/** Adresse de retour de la connexion Facebook (à déclarer dans l'application Meta). */
export const metaRedirectUri = () => `${platformUrl()}/api/ads/meta/callback`;

export async function getAdConnection(storeId: string, platform: "meta" | "tiktok"): Promise<AdConnection | null> {
  const { data } = await createAdminClient()
    .from("ad_connections")
    .select("access_token_enc, token_expires_at, ad_account_id, ad_account_name, ad_account_currency, page_id, page_name")
    .eq("store_id", storeId)
    .eq("platform", platform)
    .maybeSingle();
  if (!data) return null;
  const accessToken = await decryptSecret(data.access_token_enc);
  if (!accessToken) return null; // clé changée : il faut se reconnecter
  return {
    storeId,
    platform,
    accessToken,
    tokenExpiresAt: data.token_expires_at,
    adAccountId: data.ad_account_id,
    adAccountName: data.ad_account_name,
    adAccountCurrency: data.ad_account_currency,
    pageId: data.page_id,
    pageName: data.page_name,
  };
}

export async function saveAdConnection(storeId: string, platform: "meta" | "tiktok", accessToken: string, tokenExpiresAt: string | null) {
  const { error } = await createAdminClient()
    .from("ad_connections")
    .upsert(
      { store_id: storeId, platform, access_token_enc: await encryptSecret(accessToken), token_expires_at: tokenExpiresAt, ad_account_id: null, ad_account_name: null, ad_account_currency: null, page_id: null, page_name: null, connected_at: new Date().toISOString() },
      { onConflict: "store_id,platform" },
    );
  if (error) throw new Error(`Connexion publicitaire non enregistrée : ${error.message}`);
}
