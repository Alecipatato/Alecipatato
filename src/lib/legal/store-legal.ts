/** Informations légales d'une boutique (colonne stores.legal_info), toujours validées. */

export interface StoreLegalInfo {
  /** Nom légal de l'entreprise ou de la personne qui exploite la boutique. */
  legalName: string;
  /** Adresse postale (exigée pour la vente à distance au Québec). */
  address: string;
  /** Responsable de la protection des renseignements personnels (Loi 25). */
  privacyOfficer: string;
  /** Délai de retour, en jours après la réception. */
  returnDays: number;
}

export const DEFAULT_RETURN_DAYS = 30;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parseLegalInfo(raw: unknown): StoreLegalInfo {
  const o = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const days = Number(o.return_days);
  return {
    legalName: text(o.legal_name, 120),
    address: text(o.address, 300),
    privacyOfficer: text(o.privacy_officer, 120),
    returnDays: Number.isInteger(days) && days >= 14 && days <= 90 ? days : DEFAULT_RETURN_DAYS,
  };
}

/** Champs manquants pour des pages légales complètes. */
export function missingLegalFields(info: StoreLegalInfo): ("legalName" | "address")[] {
  return [...(info.legalName ? [] : ["legalName" as const]), ...(info.address ? [] : ["address" as const])];
}
