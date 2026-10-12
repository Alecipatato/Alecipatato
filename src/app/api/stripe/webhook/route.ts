import { NextResponse, type NextRequest } from "next/server";
import { handleStripeEvent } from "@/lib/payments/events";
import { getStripe } from "@/lib/stripe";

/**
 * Notifications envoyées par Stripe (paiement confirmé, remboursement, litige,
 * compte Connect mis à jour…). La signature est vérifiée : personne d'autre que
 * Stripe ne peut déclencher ces traitements.
 */
export async function POST(request: NextRequest) {
  // Plusieurs secrets possibles, séparés par des virgules : celui des événements de la plateforme
  // et celui des événements des comptes connectés (endpoint « Connect »).
  const secrets = (process.env.STRIPE_WEBHOOK_SECRET ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (secrets.length === 0) return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET manquant" }, { status: 500 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Signature absente" }, { status: 400 });

  const payload = await request.text();
  let event;
  for (const secret of secrets) {
    try {
      event = await getStripe().webhooks.constructEventAsync(payload, signature, secret);
      break;
    } catch {
      // Essaie le secret suivant.
    }
  }
  if (!event) return NextResponse.json({ error: "Signature invalide" }, { status: 400 });

  try {
    const processed = await handleStripeEvent(event);
    return NextResponse.json({ received: true, duplicate: !processed });
  } catch (err) {
    console.error(`Webhook Stripe ${event.type} (${event.id}) :`, err);
    // Code 500 : Stripe renverra l'événement plus tard.
    return NextResponse.json({ error: "Traitement impossible" }, { status: 500 });
  }
}
