/**
 * Chaque fichier de textes définit l'anglais (référence) et le français côte à côte.
 * TypeScript vérifie que la version française a exactement les mêmes clés.
 */
export function defineMessages<T>(messages: { en: T; fr: NoInfer<T> }) {
  return messages;
}
