/** Budget quotidien saisi par le vendeur (« 25 », « 25,50 ») → cents ; null si hors de 1 $ à 1 000 $ ou invalide. */
export function parseDailyBudget(value: unknown): number | null {
  const match = String(value ?? "").trim().replace(",", ".").match(/^(\d{1,4})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents >= 100 && cents <= 100_000 ? cents : null;
}
