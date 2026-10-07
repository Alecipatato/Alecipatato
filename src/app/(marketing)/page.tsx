import { headers } from "next/headers";
import Link from "next/link";
import { buttonClasses } from "@/components/styles";
import { DEMO_STORES } from "@/lib/demo-stores";
import { PLATFORM_NAME } from "@/lib/platform";
import { formatPrice, THEME_LABELS } from "@/lib/store-config";
import { baseDomainForHost, getRootDomain, storeUrl } from "@/lib/tenant";

/** Exemple de calcul affiché dans la section Tarif (mêmes règles que la plateforme). */
const EXAMPLE = { price: 5000, supplier: 1800, shipping: 700 };
const exampleMargin = EXAMPLE.price - EXAMPLE.supplier - EXAMPLE.shipping;
const exampleCommission = Math.round(exampleMargin * 0.15);

const STEPS = [
  {
    title: "Décrivez votre idée",
    body: "Votre niche, le type de produits, le style et les couleurs que vous aimez. Deux ou trois phrases suffisent.",
  },
  {
    title: "L'IA crée votre boutique",
    body: "Nom, identité visuelle, textes de vente, catégories et fiches produits : tout est généré en moins d'une minute.",
  },
  {
    title: "Personnalisez et vendez",
    body: "Ajustez les couleurs, les polices et les textes, puis partagez votre adresse. Vous êtes payé à chaque vente.",
  },
];

const FEATURES = [
  { title: "Une vraie vitrine de vente", body: "Page d'accueil avec tous les produits, recherche, catégories, tri et fiche détaillée pour chaque article." },
  { title: "Votre identité, pas un gabarit", body: "Trois styles de base, vos couleurs et vos polices : deux boutiques ne se ressemblent jamais." },
  { title: "Textes rédigés pour vendre", body: "Titres, descriptions et points forts écrits en français pour votre clientèle." },
  { title: "Votre adresse en ligne", body: "Chaque boutique reçoit son adresse : votreboutique.mondomaine.com. Domaine personnalisé bientôt disponible." },
  { title: "Fournisseur intégré", body: "Les produits viennent d'un fournisseur de dropshipping : pas de stock, pas d'entrepôt, pas d'expédition à gérer." },
  { title: "Paiements automatiques", body: "Les ventes sont encaissées pour vous et votre part est versée sur votre compte, sans facture à faire." },
];

const FAQ = [
  {
    q: "Est-ce vraiment gratuit ?",
    a: "Oui. La création de la boutique et l'hébergement sont gratuits. La plateforme prélève seulement 15 % de la marge brute de chaque vente, c'est-à-dire du prix de vente moins le coût du fournisseur et la livraison. Pas de vente, pas de frais.",
  },
  {
    q: "Ai-je besoin de connaissances techniques ?",
    a: "Non. Vous remplissez un court formulaire, l'IA s'occupe du reste. Vous pouvez ensuite tout modifier depuis votre tableau de bord, sans code.",
  },
  {
    q: "Qui expédie les commandes ?",
    a: "Le fournisseur expédie directement à vos clients, avec un numéro de suivi. Nous sélectionnons des produits livrables au Canada en moins de 15 jours.",
  },
  {
    q: "Comment suis-je payé ?",
    a: "Vous connectez un compte de paiement sécurisé (Stripe). Après chaque vente, votre part est versée automatiquement, après un délai de réserve de 7 jours qui couvre les éventuels remboursements.",
  },
  {
    q: "Puis-je régénérer ou modifier ma boutique ?",
    a: "Oui. Vous pouvez demander à l'IA de régénérer votre boutique avec de nouvelles consignes, ou modifier vous-même les textes, les couleurs, les polices et le style.",
  },
];

export default async function HomePage() {
  // En local, on reprend le port réellement utilisé (3000, 3001…) pour les liens des démos.
  const demoBase = baseDomainForHost((await headers()).get("host"));
  const preview = DEMO_STORES.demo;

  return (
    <>
      {/* Accroche */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-40 right-[-10%] h-[28rem] w-[28rem] rounded-full bg-marigold/25 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pt-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-strong">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Gratuit · Sans abonnement · Propulsé par l&apos;IA
            </p>
            <h1 className="mt-5 font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl">
              Décrivez votre idée.<br />
              <span className="text-brand">L&apos;IA construit votre boutique.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              {PLATFORM_NAME} crée une boutique de dropshipping complète en moins d&apos;une minute : nom, design, textes et
              catalogue de produits. Vous ne payez qu&apos;une petite commission quand vous vendez.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/inscription" className={`${buttonClasses.primary} px-6 py-3.5 text-base`}>Créer ma boutique gratuitement</Link>
              <a href="#demos" className={`${buttonClasses.secondary} px-6 py-3.5 text-base`}>Voir des exemples</a>
            </div>
            <p className="mt-4 text-sm text-muted">Aucune carte de crédit requise.</p>
          </div>

          {/* Aperçu : un brief devient une boutique */}
          <div className="relative">
            <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Votre description</p>
              <p className="mt-2 text-sm leading-relaxed">
                « Accessoires de yoga et de méditation naturels, style épuré, tons verts et beiges. »
              </p>
            </div>
            <div aria-hidden className="mx-auto my-2 h-8 w-px bg-gradient-to-b from-line to-brand" />
            <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-xl shadow-ink/5">
              <div className="flex items-center gap-1.5 border-b border-line bg-paper px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#e5e5e0]" /><span className="h-2.5 w-2.5 rounded-full bg-[#e5e5e0]" /><span className="h-2.5 w-2.5 rounded-full bg-[#e5e5e0]" />
                <span className="ml-3 truncate rounded-md bg-white px-2 py-0.5 text-xs text-muted">zenatelier.{getRootDomain().split(":")[0]}</span>
              </div>
              <div style={{ background: preview.store.config.colors.background, color: preview.store.config.colors.text }}>
                <div className="flex items-center gap-3 border-b border-black/5 px-4 py-3">
                  <span className="font-semibold" style={{ fontFamily: "Georgia, serif" }}>{preview.store.name}</span>
                  <span className="h-7 flex-1 rounded-md border border-black/10 bg-white" />
                  <span className="text-xs">Panier</span>
                </div>
                <div className="grid grid-cols-3 gap-3 p-4">
                  {preview.products.slice(0, 3).map((p) => (
                    <div key={p.id}>
                      <div className="aspect-square rounded-lg" style={{ background: `linear-gradient(135deg, ${preview.store.config.colors.primary}33, ${preview.store.config.colors.accent}33)` }} />
                      <p className="mt-1.5 line-clamp-1 text-[11px]">{p.title}</p>
                      <p className="text-xs font-semibold" style={{ color: preview.store.config.colors.accent }}>{formatPrice(p.priceCents, "CAD")}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Fonctionnement */}
      <section id="fonctionnement" className="scroll-mt-20 border-y border-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="font-display text-4xl font-bold tracking-tight">Trois étapes, une boutique en ligne</h2>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="rounded-2xl border border-line bg-paper p-6">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand font-display text-sm font-bold text-white">{i + 1}</span>
                <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Ce que l'IA crée */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="font-display text-4xl font-bold tracking-tight">Tout ce qu&apos;il faut pour vendre, dès le premier jour</h2>
          <p className="mt-4 text-lg text-muted">Chaque boutique fonctionne comme les grands sites marchands : vos clients trouvent, comparent et achètent facilement.</p>
        </div>
        <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="border-t-2 border-brand pt-4">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Démos */}
      <section id="demos" className="scroll-mt-20 bg-ink text-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="font-display text-4xl font-bold tracking-tight">Des boutiques créées par l&apos;IA</h2>
          <p className="mt-4 max-w-2xl text-lg text-white/70">Même fonctionnement, trois styles très différents. Cliquez pour visiter.</p>
          <ul className="mt-12 grid gap-5 md:grid-cols-3">
            {Object.values(DEMO_STORES).map(({ store, products }) => (
              <li key={store.id}>
                <a
                  href={storeUrl(store.subdomain, demoBase)}
                  className="group block overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10 transition hover:ring-white/40"
                >
                  <div className="p-5" style={{ background: store.config.colors.background, color: store.config.colors.text }}>
                    <p className="text-lg font-semibold">{store.name}</p>
                    <p className="text-xs opacity-70">{store.config.content.tagline}</p>
                    <div className="mt-4 grid grid-cols-4 gap-2">
                      {products.slice(0, 4).map((p) => (
                        <span key={p.id} className="aspect-square rounded-md" style={{ background: `linear-gradient(135deg, ${store.config.colors.primary}, ${store.config.colors.accent})`, opacity: 0.35 }} />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-5 py-4 text-sm">
                    <span>Style {THEME_LABELS[store.theme].name.toLowerCase()}</span>
                    <span className="text-white/60 transition group-hover:text-white">Visiter →</span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Tarif */}
      <section id="tarif" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="font-display text-4xl font-bold tracking-tight">Un seul tarif : vous gagnez, nous gagnons</h2>
            <p className="mt-4 text-lg leading-relaxed text-muted">
              Création, hébergement et mises à jour gratuits. Nous prélevons <strong className="text-ink">15 % de la marge brute</strong> de
              chaque vente, soit le prix de vente moins le coût du fournisseur et la livraison. Si vous ne vendez pas, vous ne payez rien.
            </p>
            <Link href="/inscription" className={`${buttonClasses.primary} mt-8 px-6 py-3.5`}>Commencer gratuitement</Link>
          </div>
          <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold">Exemple pour une vente</p>
            <dl className="mt-4 space-y-3 text-sm tabular-nums">
              <div className="flex justify-between"><dt>Prix payé par votre client</dt><dd>{formatPrice(EXAMPLE.price, "CAD")}</dd></div>
              <div className="flex justify-between text-muted"><dt>Coût du produit chez le fournisseur</dt><dd>− {formatPrice(EXAMPLE.supplier, "CAD")}</dd></div>
              <div className="flex justify-between text-muted"><dt>Livraison</dt><dd>− {formatPrice(EXAMPLE.shipping, "CAD")}</dd></div>
              <div className="flex justify-between border-t border-line pt-3 font-medium"><dt>Marge brute</dt><dd>{formatPrice(exampleMargin, "CAD")}</dd></div>
              <div className="flex justify-between text-muted"><dt>Commission {PLATFORM_NAME} (15 %)</dt><dd>− {formatPrice(exampleCommission, "CAD")}</dd></div>
              <div className="flex justify-between rounded-xl bg-brand-soft px-3 py-3 text-base font-semibold text-brand-strong">
                <dt>Votre profit</dt><dd>{formatPrice(exampleMargin - exampleCommission, "CAD")}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted">Taxes de vente perçues en plus du prix et reversées selon la loi. Frais de traitement du paiement non inclus.</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 border-t border-line bg-white">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <h2 className="font-display text-4xl font-bold tracking-tight">Questions fréquentes</h2>
          <div className="mt-10 divide-y divide-line border-y border-line">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {item.q}
                  <span aria-hidden className="text-xl text-muted transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 leading-relaxed text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Appel final */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-brand px-8 py-14 text-center text-white sm:px-14">
          <div aria-hidden className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-marigold/30 blur-3xl" />
          <h2 className="relative font-display text-4xl font-bold tracking-tight">Votre boutique est à une description près</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lg text-white/80">Créez votre compte et laissez l&apos;IA faire le gros du travail.</p>
          <Link href="/inscription" className="relative mt-8 inline-flex rounded-xl bg-white px-7 py-3.5 font-semibold text-brand-strong transition hover:bg-marigold-soft">
            Créer ma boutique gratuitement
          </Link>
        </div>
      </section>
    </>
  );
}
