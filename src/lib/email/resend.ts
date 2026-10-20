/**
 * Envoi de courriels avec Resend (API REST, compatible Cloudflare Workers).
 * Sans RESEND_API_KEY, le courriel est seulement écrit dans les journaux du serveur.
 */

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendEmail(params: { to: string; subject: string; text: string }): Promise<boolean> {
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
        from: process.env.EMAIL_FROM || "Kreo <onboarding@resend.dev>",
        to: [params.to],
        subject: params.subject,
        text: params.text,
        html: `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${escapeHtml(params.text)}</div>`,
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
