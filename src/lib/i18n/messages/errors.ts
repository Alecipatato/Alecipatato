import { defineMessages } from "./define";

/** Erreurs de la génération par IA (codes de StoreGenerationError). */
export const errors = defineMessages({
  en: {
    generation: {
      unreadable: "The AI response couldn't be read. Try again.",
      refused_niche: "This niche can't be accepted: {reason}",
      no_products: "AI didn't suggest any products. Try again with a more specific description.",
      not_configured: "AI generation isn't configured on this server yet (missing ANTHROPIC_API_KEY).",
      invalid_key: "The AI access key is invalid (server configuration).",
      overloaded: "AI is very busy right now. Try again in a minute.",
      unreachable: "The AI service can't be reached. Try again in a moment.",
      refused: "AI declined this request. Rephrase your niche description.",
      incomplete: "The AI response was incomplete. Try again.",
      empty: "Empty AI response.",
    },
  },
  fr: {
    generation: {
      unreadable: "Réponse de l'IA illisible. Réessayez.",
      refused_niche: "Cette niche ne peut pas être acceptée : {reason}",
      no_products: "L'IA n'a proposé aucun produit. Réessayez avec une description plus précise.",
      not_configured: "La génération par IA n'est pas encore configurée sur ce serveur (clé ANTHROPIC_API_KEY manquante).",
      invalid_key: "La clé d'accès à l'IA est invalide (configuration du serveur).",
      overloaded: "L'IA est très sollicitée en ce moment. Réessayez dans une minute.",
      unreachable: "Impossible de joindre le service d'IA. Réessayez dans un instant.",
      refused: "L'IA a refusé cette demande. Reformulez votre description de niche.",
      incomplete: "La réponse de l'IA était incomplète. Réessayez.",
      empty: "Réponse de l'IA vide.",
    },
  },
});
