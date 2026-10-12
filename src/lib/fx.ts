/**
 * Taux de change USD → CAD (le fournisseur CJ facture en USD).
 * Source : taux quotidien officiel de la Banque du Canada. En cas d'échec,
 * on utilise le taux de secours configuré (platform_settings.usd_cad_fallback_rate).
 * Le taux utilisé est enregistré avec chaque commande.
 */

const VALET_URL = "https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1";

export async function getUsdCadRate(fallback: string): Promise<{ rate: string; source: "bank_of_canada" | "fallback" }> {
  try {
    const response = await fetch(VALET_URL, { signal: AbortSignal.timeout(3000) });
    if (response.ok) {
      const data = (await response.json()) as { observations?: { FXUSDCAD?: { v?: string } }[] };
      const value = data.observations?.[0]?.FXUSDCAD?.v;
      if (value && /^\d+(\.\d+)?$/.test(value) && Number(value) > 0.5 && Number(value) < 3) {
        return { rate: value, source: "bank_of_canada" };
      }
    }
  } catch {
    // Réseau indisponible : on utilise le taux de secours.
  }
  return { rate: fallback, source: "fallback" };
}
