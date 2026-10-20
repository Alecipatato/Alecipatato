/**
 * Envoi de courriels avec Resend (API REST, compatible Cloudflare Workers).
 * Sans RESEND_API_KEY, le courriel est seulement écrit dans les journaux du serveur.
 */

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Expéditeur : l'adresse de EMAIL_FROM, avec un nom d'affichage optionnel
 * (ex. le nom de la boutique : « Zen Atelier <noreply@mondomaine.com> »).
 */
export function senderAddress(displayName?: string): string {
  const configured = process.env.EMAIL_FROM || "Kreo <onboarding@resend.dev>";
  if (!displayName) return configured;
  const address = /<([^>]+)>/.exec(configured)?.[1] ?? configured.trim();
  const name = displayName.replace(/["<>\r\n]/g, "").trim().slice(0, 60);
  return name ? `"${name}" <${address}>` : configured;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Version HTML ; sinon le texte est repris tel quel. */
  html?: string;
  /** Nom d'expéditeur affiché (ex. nom de la boutique). */
  fromName?: string;
  /** Adresse qui reçoit les réponses (ex. contact de la boutique). */
  replyTo?: string | null;
}

export async function sendEmail(params: EmailMessage): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[courriel non envoyé : RESEND_API_KEY manquante] À : ${params.to} — ${params.subject}\n${params.text}`);
    return false;
  }
  try {
    const response = await fetch(`${process.env.RESEND_API_BASE || "https://api.resend.com"}/emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: senderAddress(params.fromName),
        to: [params.to],
        subject: params.subject.replace(/[\r\n]+/g, " "),
        text: params.text,
        html: params.html ?? `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${escapeHtml(params.text)}</div>`,
        ...(params.replyTo && { reply_to: params.replyTo }),
      }),
    });
    if (!response.ok) console.error(`Resend : HTTP ${response.status} ${await response.text()}`);
    return response.ok;
  } catch (err) {
    console.error("Resend :", err);
    return false;
  }
}

/** Alerte à l'administrateur de la plateforme (ADMIN_ALERT_EMAIL). */
export async function alertAdmin(subject: string, text: string): Promise<boolean> {
  const to = process.env.ADMIN_ALERT_EMAIL;
  if (!to) {
    console.error(`[alerte admin sans destinataire : ADMIN_ALERT_EMAIL manquante] ${subject}\n${text}`);
    return false;
  }
  return sendEmail({ to, subject: `[Alerte] ${subject}`, text });
}
