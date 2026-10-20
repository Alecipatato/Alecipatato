import type { Locale } from "../i18n/config";

/**
 * Pages légales générées automatiquement (modèles en français et en anglais).
 * ⚠️ Modèles de départ, rédigés pour le Québec et le Canada : à faire valider par un juriste.
 * Une ligne qui commence par « - » est affichée comme un élément de liste.
 */

export type StorePolicyPage = "conditions" | "retours" | "livraison" | "confidentialite";
export const STORE_POLICY_PAGES: StorePolicyPage[] = ["conditions", "retours", "livraison", "confidentialite"];

export interface LegalSection {
  heading: string;
  body: string[];
}
export interface LegalDocument {
  title: string;
  intro?: string;
  sections: LegalSection[];
}

export interface StorePolicyContext {
  storeName: string;
  /** Nom légal (sinon le nom de la boutique). */
  legalName: string;
  address: string;
  email: string | null;
  privacyOfficer: string;
  returnDays: number;
  deliveryMin: number;
  deliveryMax: number;
  platformName: string;
  currency: string;
}

const contactFr = (c: StorePolicyContext) => (c.email ? `par courriel à ${c.email} ou ` : "") + "au moyen de la page « Nous joindre » de la boutique";
const contactEn = (c: StorePolicyContext) => (c.email ? `by email at ${c.email} or ` : "") + "through the store's “Contact us” page";

const identityFr = (c: StorePolicyContext) =>
  [`- Exploitant : ${c.legalName}`, ...(c.address ? [`- Adresse : ${c.address}`] : []), ...(c.email ? [`- Courriel : ${c.email}`] : [])];
const identityEn = (c: StorePolicyContext) =>
  [`- Operator: ${c.legalName}`, ...(c.address ? [`- Address: ${c.address}`] : []), ...(c.email ? [`- Email: ${c.email}`] : [])];

function storeFr(page: StorePolicyPage, c: StorePolicyContext): LegalDocument {
  switch (page) {
    case "conditions":
      return {
        title: "Conditions générales de vente",
        intro: `Les présentes conditions s'appliquent à toute commande passée sur la boutique ${c.storeName}. En passant commande, vous les acceptez.`,
        sections: [
          { heading: "Qui sommes-nous", body: [`La boutique ${c.storeName} est exploitée par :`, ...identityFr(c), `La boutique utilise la plateforme ${c.platformName}, qui fournit la technologie du site et le traitement des paiements.`] },
          { heading: "Produits", body: ["Nos produits sont expédiés directement par nos fournisseurs partenaires. Les photos proviennent des fournisseurs et sont présentées à titre indicatif ; de légères variations de couleur ou d'emballage peuvent exister.", "Les descriptions sont rédigées avec soin. En cas d'erreur manifeste sur un produit ou un prix, nous vous contacterons avant l'expédition et vous pourrez annuler la commande sans frais."] },
          { heading: "Prix et paiement", body: [`Les prix sont indiqués en ${c.currency}. Les taxes de vente applicables (TPS, TVQ ou TVH) sont calculées et ajoutées à l'étape du paiement. La livraison est gratuite.`, "Le paiement se fait en ligne par carte, de façon sécurisée, par l'intermédiaire de Stripe. Nous ne recevons ni ne conservons vos données de carte."] },
          { heading: "Commande", body: ["La commande est confirmée lorsque le paiement est accepté ; vous recevez alors un courriel de confirmation avec votre numéro de commande. Vous pouvez suivre votre commande en tout temps depuis la page « Suivre une commande »."] },
          { heading: "Livraison, retours et remboursements", body: ["Les délais et conditions de livraison sont décrits dans notre politique de livraison. Les retours et remboursements sont décrits dans notre politique de retour."] },
          { heading: "Garanties", body: ["Les produits bénéficient des garanties prévues par la loi, notamment la garantie légale de qualité prévue par la Loi sur la protection du consommateur du Québec : un bien doit pouvoir servir à l'usage auquel il est normalement destiné, pendant une durée raisonnable. Les présentes conditions ne limitent en rien vos droits prévus par la loi."] },
          { heading: "Renseignements personnels", body: ["Nous traitons vos renseignements personnels conformément à notre politique de confidentialité."] },
          { heading: "Droit applicable et contact", body: [`Les présentes conditions sont régies par les lois du Québec et du Canada applicables. Pour toute question ou réclamation, contactez-nous ${contactFr(c)}.`] },
        ],
      };
    case "retours":
      return {
        title: "Politique de retour et de remboursement",
        sections: [
          { heading: "Délai de retour", body: [`Vous pouvez retourner un article dans les ${c.returnDays} jours suivant sa réception, s'il est neuf, non utilisé et dans son emballage d'origine.`] },
          { heading: "Comment faire un retour", body: [`Contactez-nous ${contactFr(c)} en indiquant votre numéro de commande et l'article concerné. Nous vous indiquerons l'adresse de retour. Ne renvoyez aucun colis sans nous avoir contactés : l'adresse de retour n'est pas celle de l'expéditeur.`] },
          { heading: "Article défectueux, endommagé ou non conforme", body: ["Si un article arrive défectueux, endommagé ou ne correspond pas à la description, écrivez-nous avec une photo dans les meilleurs délais. Nous le remplaçons ou le remboursons, sans frais pour vous ; le renvoi de l'article n'est pas toujours exigé."] },
          { heading: "Frais de retour", body: ["Pour un retour par simple changement d'avis, les frais de retour sont à votre charge. Ils sont à notre charge si l'article est défectueux, endommagé ou non conforme."] },
          { heading: "Remboursement", body: ["Le remboursement est effectué sur le moyen de paiement utilisé lors de la commande, dans les 15 jours suivant la réception du retour (ou l'acceptation de la réclamation). Le délai d'affichage sur votre relevé dépend de votre banque (habituellement de 5 à 10 jours)."] },
          { heading: "Vos droits", body: ["Cette politique s'ajoute aux droits que vous accorde la loi, notamment la Loi sur la protection du consommateur du Québec, et ne les limite pas."] },
        ],
      };
    case "livraison":
      return {
        title: "Politique de livraison",
        sections: [
          { heading: "Zone de livraison", body: ["Nous livrons partout au Canada."] },
          { heading: "Frais et délais", body: [`La livraison est gratuite. Les commandes sont généralement livrées en ${c.deliveryMin} à ${c.deliveryMax} jours ouvrables après la confirmation du paiement. Ces délais sont indicatifs et peuvent varier selon le transporteur et la période de l'année.`, "Les colis sont expédiés depuis les entrepôts de nos fournisseurs, qui peuvent se trouver à l'extérieur du Canada."] },
          { heading: "Suivi", body: ["Vous recevez un courriel avec le numéro de suivi dès l'expédition. Vous pouvez aussi suivre votre commande avec votre numéro de commande et votre courriel sur la page « Suivre une commande »."] },
          { heading: "Adresse de livraison", body: ["Vérifiez votre adresse au moment du paiement. Si elle contient une erreur, contactez-nous immédiatement : nous ferons notre possible pour la corriger avant l'expédition."] },
          { heading: "Colis en retard ou perdu", body: [`Si votre colis n'est pas arrivé ${c.deliveryMax + 10} jours ouvrables après votre commande, contactez-nous ${contactFr(c)}. Après vérification auprès du transporteur, nous vous renverrons la commande ou vous rembourserons.`] },
        ],
      };
    case "confidentialite":
      return {
        title: "Politique de confidentialité",
        intro: `Cette politique explique comment ${c.legalName} (« nous ») recueille, utilise et protège vos renseignements personnels lorsque vous utilisez la boutique ${c.storeName}, conformément à la Loi sur la protection des renseignements personnels dans le secteur privé du Québec (Loi 25) et aux lois canadiennes applicables.`,
        sections: [
          { heading: "Responsable de la protection des renseignements personnels", body: [`${c.privacyOfficer}${c.email ? `, joignable à ${c.email}` : ""}${c.address ? `, ${c.address}` : ""}.`] },
          { heading: "Renseignements recueillis", body: ["- Lors d'une commande : nom, adresse courriel, numéro de téléphone, adresse de livraison, articles commandés et montants.", "- Lors d'un message : nom, adresse courriel, numéro de commande et contenu du message.", "- Les données de carte bancaire sont saisies directement chez Stripe : nous n'y avons pas accès."] },
          { heading: "Pourquoi nous les utilisons", body: ["- Traiter et livrer votre commande, et vous en informer par courriel (confirmation, expédition, livraison).", "- Répondre à vos questions et traiter les retours et remboursements.", "- Respecter nos obligations légales (comptabilité, taxes) et prévenir la fraude.", "Nous ne vendons pas vos renseignements et ne les utilisons pas à des fins publicitaires sans votre consentement."] },
          { heading: "Qui y a accès", body: ["Vos renseignements sont communiqués uniquement aux prestataires nécessaires au service :", `- ${c.platformName} (plateforme de la boutique) et ses hébergeurs ;`, "- Stripe (paiement) ;", "- notre fournisseur et ses transporteurs (préparation et livraison de la commande) ;", "- un service d'envoi de courriels.", "Certains de ces prestataires sont situés à l'extérieur du Québec (au Canada, aux États-Unis ou en Chine pour la préparation des colis). Avant toute communication hors du Québec, nous évaluons que les renseignements y bénéficient d'une protection adéquate, et nous limitons les renseignements transmis à ce qui est nécessaire (par exemple, nom, téléphone et adresse de livraison pour le transporteur)."] },
          { heading: "Témoins (cookies) et stockage", body: ["La boutique n'utilise que des éléments strictement nécessaires à son fonctionnement : votre panier est conservé dans votre navigateur. Aucun témoin publicitaire ou de mesure d'audience n'est utilisé sans votre consentement."] },
          { heading: "Conservation", body: ["Les renseignements liés aux commandes sont conservés pendant la durée exigée par les lois fiscales (habituellement 6 ans), puis détruits ou anonymisés. Les messages sont conservés le temps nécessaire pour y répondre."] },
          { heading: "Vos droits", body: [`Vous pouvez demander l'accès à vos renseignements, leur rectification, leur suppression lorsque la loi le permet, ou retirer votre consentement, en écrivant au responsable indiqué ci-dessus. Nous répondons dans un délai de 30 jours. Vous pouvez aussi porter plainte auprès de la Commission d'accès à l'information du Québec.`] },
          { heading: "Incident de confidentialité", body: ["En cas d'incident présentant un risque de préjudice sérieux, nous en avisons les personnes concernées et la Commission d'accès à l'information, comme l'exige la loi."] },
        ],
      };
  }
}

function storeEn(page: StorePolicyPage, c: StorePolicyContext): LegalDocument {
  switch (page) {
    case "conditions":
      return {
        title: "Terms of sale",
        intro: `These terms apply to every order placed on the ${c.storeName} store. By placing an order, you accept them.`,
        sections: [
          { heading: "Who we are", body: [`The ${c.storeName} store is operated by:`, ...identityEn(c), `The store runs on the ${c.platformName} platform, which provides the website technology and payment processing.`] },
          { heading: "Products", body: ["Our products are shipped directly by our partner suppliers. Photos come from the suppliers and are for illustration; slight variations in colour or packaging may exist.", "Descriptions are written with care. If there is an obvious error on a product or a price, we will contact you before shipping and you may cancel the order at no cost."] },
          { heading: "Prices and payment", body: [`Prices are shown in ${c.currency}. Applicable sales taxes (GST, QST or HST) are calculated and added at checkout. Shipping is free.`, "Payment is made online by card, securely, through Stripe. We never receive or store your card details."] },
          { heading: "Orders", body: ["Your order is confirmed once the payment is accepted; you then receive a confirmation email with your order number. You can track your order at any time from the “Track an order” page."] },
          { heading: "Shipping, returns and refunds", body: ["Delivery times and conditions are described in our shipping policy. Returns and refunds are described in our return policy."] },
          { heading: "Warranties", body: ["Products are covered by the warranties provided by law, including the legal warranty of quality under Québec's Consumer Protection Act: goods must be fit for the purpose for which they are ordinarily used, for a reasonable length of time. These terms do not limit any of your legal rights."] },
          { heading: "Personal information", body: ["We handle your personal information in accordance with our privacy policy."] },
          { heading: "Governing law and contact", body: [`These terms are governed by the applicable laws of Québec and Canada. For any question or complaint, contact us ${contactEn(c)}.`] },
        ],
      };
    case "retours":
      return {
        title: "Return and refund policy",
        sections: [
          { heading: "Return period", body: [`You may return an item within ${c.returnDays} days of receiving it, if it is new, unused and in its original packaging.`] },
          { heading: "How to return an item", body: [`Contact us ${contactEn(c)} with your order number and the item concerned. We will give you the return address. Please don't send anything back without contacting us first: the return address is not the sender's address.`] },
          { heading: "Defective, damaged or incorrect item", body: ["If an item arrives defective, damaged or doesn't match its description, write to us with a photo as soon as possible. We will replace or refund it at no cost to you; returning the item is not always required."] },
          { heading: "Return shipping costs", body: ["For a change-of-mind return, return shipping is at your expense. It is at our expense if the item is defective, damaged or incorrect."] },
          { heading: "Refunds", body: ["Refunds are issued to the original payment method within 15 days of receiving the return (or approving the claim). The time it takes to appear on your statement depends on your bank (usually 5 to 10 days)."] },
          { heading: "Your rights", body: ["This policy is in addition to your legal rights, including those under Québec's Consumer Protection Act, and does not limit them."] },
        ],
      };
    case "livraison":
      return {
        title: "Shipping policy",
        sections: [
          { heading: "Where we ship", body: ["We ship everywhere in Canada."] },
          { heading: "Costs and delivery times", body: [`Shipping is free. Orders are usually delivered within ${c.deliveryMin} to ${c.deliveryMax} business days after payment is confirmed. These times are estimates and may vary depending on the carrier and the time of year.`, "Packages are shipped from our suppliers' warehouses, which may be located outside Canada."] },
          { heading: "Tracking", body: ["You receive an email with the tracking number as soon as your order ships. You can also track it with your order number and email on the “Track an order” page."] },
          { heading: "Shipping address", body: ["Please check your address at checkout. If it contains an error, contact us right away: we will do our best to fix it before shipping."] },
          { heading: "Late or lost packages", body: [`If your package hasn't arrived ${c.deliveryMax + 10} business days after your order, contact us ${contactEn(c)}. After checking with the carrier, we will reship your order or refund you.`] },
        ],
      };
    case "confidentialite":
      return {
        title: "Privacy policy",
        intro: `This policy explains how ${c.legalName} (“we”) collects, uses and protects your personal information when you use the ${c.storeName} store, in accordance with Québec's Act respecting the protection of personal information in the private sector (Law 25) and applicable Canadian laws.`,
        sections: [
          { heading: "Person in charge of the protection of personal information", body: [`${c.privacyOfficer}${c.email ? `, reachable at ${c.email}` : ""}${c.address ? `, ${c.address}` : ""}.`] },
          { heading: "Information we collect", body: ["- When you order: name, email address, phone number, shipping address, items ordered and amounts.", "- When you send a message: name, email address, order number and message content.", "- Card details are entered directly with Stripe: we have no access to them."] },
          { heading: "Why we use it", body: ["- To process and deliver your order and keep you informed by email (confirmation, shipping, delivery).", "- To answer your questions and handle returns and refunds.", "- To meet our legal obligations (accounting, taxes) and prevent fraud.", "We do not sell your information or use it for advertising without your consent."] },
          { heading: "Who has access", body: ["Your information is shared only with the providers required for the service:", `- ${c.platformName} (the store platform) and its hosting providers;`, "- Stripe (payments);", "- our supplier and its carriers (order preparation and delivery);", "- an email delivery service.", "Some of these providers are located outside Québec (in Canada, the United States, or China for order preparation). Before any transfer outside Québec, we assess that the information will receive adequate protection, and we limit what is shared to what is necessary (for example, name, phone and shipping address for the carrier)."] },
          { heading: "Cookies and storage", body: ["The store only uses what is strictly necessary for it to work: your cart is kept in your browser. No advertising or analytics cookies are used without your consent."] },
          { heading: "Retention", body: ["Order information is kept for the period required by tax laws (usually 6 years), then destroyed or anonymized. Messages are kept as long as needed to answer them."] },
          { heading: "Your rights", body: ["You may request access to your information, its correction, its deletion where the law allows, or withdraw your consent by writing to the person named above. We respond within 30 days. You may also file a complaint with Québec's Commission d'accès à l'information."] },
          { heading: "Confidentiality incidents", body: ["If an incident presents a risk of serious injury, we notify the affected people and the Commission d'accès à l'information, as required by law."] },
        ],
      };
  }
}

export function storePolicy(page: StorePolicyPage, ctx: StorePolicyContext, locale: Locale): LegalDocument {
  return locale === "fr" ? storeFr(page, ctx) : storeEn(page, ctx);
}

// ---------------------------------------------------------------------------
// Plateforme : conditions d'utilisation (clients qui créent une boutique) et confidentialité
// ---------------------------------------------------------------------------

export type PlatformPolicyPage = "conditions" | "confidentialite";

export interface PlatformPolicyContext {
  platformName: string;
  legalName: string;
  address: string;
  email: string;
  privacyOfficer: string;
  /** Ex. « 15 % » / « 15% ». */
  commission: string;
  reserveDays: number;
  minMargin: string;
}

function platformFr(page: PlatformPolicyPage, c: PlatformPolicyContext): LegalDocument {
  const who = [`- Exploitant : ${c.legalName}`, ...(c.address ? [`- Adresse : ${c.address}`] : []), ...(c.email ? [`- Courriel : ${c.email}`] : [])];
  if (page === "conditions") {
    return {
      title: "Conditions d'utilisation",
      intro: `Ces conditions encadrent l'utilisation de ${c.platformName} par les personnes qui y créent une boutique en ligne (« vous »). En créant un compte, vous les acceptez.`,
      sections: [
        { heading: "Qui sommes-nous", body: [`${c.platformName} est exploitée par :`, ...who] },
        { heading: "Le service", body: [`${c.platformName} crée gratuitement une boutique de dropshipping à l'aide de l'intelligence artificielle (nom, design, textes, sélection de produits d'un fournisseur), l'héberge, encaisse les ventes et transmet les commandes au fournisseur.`, "Les textes, prix suggérés et sélections de produits sont générés automatiquement : vous devez les relire et êtes responsable de ce que votre boutique publie."] },
        { heading: "Commission", body: [`La création et l'hébergement sont gratuits. Pour chaque vente, ${c.platformName} prélève ${c.commission} de la marge brute, soit le prix de vente (hors taxes) moins le coût du produit chez le fournisseur et la livraison.`, `Les prix de vente doivent conserver une marge brute minimale de ${c.minMargin} ; un prix est relevé automatiquement si le coût du fournisseur augmente.`] },
        { heading: "Encaissement et versements", body: ["Les acheteurs paient sur le compte Stripe de la plateforme. La plateforme paie le fournisseur, perçoit et remet les taxes de vente, garde sa commission et vous verse le reste sur votre compte Stripe Express.", `Chaque versement est effectué ${c.reserveDays} jours après la vente (réserve couvrant les remboursements et litiges). Vous devez compléter votre inscription Stripe (identité, compte bancaire) pour recevoir vos versements.`] },
        { heading: "Remboursements et rétrofacturations", body: ["Vous pouvez rembourser un acheteur depuis votre tableau de bord. La répartition du coût d'un remboursement ou d'une rétrofacturation entre vous et la plateforme (dont la commission et les frais de litige) suit les règles en vigueur sur la plateforme ; un montant déjà versé peut être repris sur vos versements suivants ou sur le transfert concerné."] },
        { heading: "Vos responsabilités", body: ["- Fournir des informations exactes (identité, informations légales de la boutique, adresse de contact) et les tenir à jour.", "- Répondre aux questions des acheteurs et traiter les retours selon la politique affichée sur votre boutique.", "- Respecter les lois applicables (protection du consommateur, publicité, propriété intellectuelle) et vos obligations fiscales sur vos revenus.", "- Ne pas vendre de produits interdits : contrefaçons ou produits de marques sans autorisation, armes, drogues, tabac et vapotage, produits pour adultes, médicaments ou produits de santé avec allégations, ni tout produit interdit par Stripe ou par la loi."] },
        { heading: "Modération et suspension", body: ["Les produits et textes sont filtrés automatiquement. La plateforme peut retirer un produit, ou suspendre une boutique, notamment en cas de :", "- vente de produits interdits ou contrefaits ;", "- informations fausses ou trompeuses ;", "- taux anormal de plaintes, de remboursements ou de rétrofacturations ;", "- fraude ou utilisation abusive du service ;", "- non-respect de ces conditions ou de la loi.", "Pendant une suspension, la boutique est hors ligne, les paiements sont bloqués et les versements sont retenus. Le motif vous est indiqué dans votre tableau de bord."] },
        { heading: "Responsabilité", body: [`${c.platformName} fournit la technologie, le paiement et la transmission des commandes. Vous êtes le commerçant de votre boutique auprès des acheteurs. Dans la mesure permise par la loi, la responsabilité de la plateforme est limitée aux commissions perçues sur les 12 derniers mois ; elle n'est pas responsable des retards ou défauts imputables au fournisseur ou au transporteur, ni des pertes indirectes.`] },
        { heading: "Fin du service", body: ["Vous pouvez fermer votre boutique en tout temps. Les versements dus restent payés après la fin de la réserve, déduction faite des remboursements et litiges. Nous pouvons modifier ces conditions ; les changements importants vous sont annoncés au moins 30 jours à l'avance."] },
        { heading: "Droit applicable", body: ["Ces conditions sont régies par les lois du Québec et du Canada applicables. Les tribunaux du Québec sont compétents."] },
      ],
    };
  }
  return {
    title: "Politique de confidentialité",
    intro: `Cette politique explique comment ${c.legalName} traite les renseignements personnels des personnes qui créent un compte sur ${c.platformName}, conformément à la Loi 25 du Québec et aux lois canadiennes applicables. Les renseignements des acheteurs sont décrits dans la politique de chaque boutique.`,
    sections: [
      { heading: "Responsable de la protection des renseignements personnels", body: [`${c.privacyOfficer}${c.email ? `, joignable à ${c.email}` : ""}.`] },
      { heading: "Renseignements recueillis", body: ["- Compte : nom, adresse courriel, mot de passe (chiffré) ou connexion Google.", "- Boutique : description de votre idée, textes, réglages et informations légales.", "- Paiements : les informations d'identité et bancaires sont fournies directement à Stripe ; nous recevons l'état de votre compte de versement.", "- Utilisation : journal des générations par IA (pour les limites et les coûts) et statistiques de visites de vos boutiques (sans identifier les visiteurs)."] },
      { heading: "Utilisation", body: ["Fournir le service (création et hébergement de la boutique, paiements, versements, commandes), vous contacter au sujet de votre compte, prévenir la fraude et respecter nos obligations légales."] },
      { heading: "Prestataires", body: ["Hébergement et base de données (Supabase, Cloudflare), intelligence artificielle (Anthropic), paiements (Stripe), fournisseur (CJ Dropshipping), courriels (Resend). Certains sont situés hors du Québec, notamment aux États-Unis ; nous évaluons la protection offerte avant toute communication et limitons les renseignements transmis au nécessaire. Les descriptions envoyées à l'IA ne doivent pas contenir de renseignements personnels."] },
      { heading: "Témoins (cookies)", body: ["Nous utilisons uniquement des témoins nécessaires : session de connexion et choix de la langue."] },
      { heading: "Conservation", body: ["Les renseignements du compte sont conservés tant que le compte est actif, puis supprimés ; les données comptables et fiscales sont conservées pendant la durée exigée par la loi."] },
      { heading: "Vos droits", body: ["Accès, rectification, suppression, portabilité et retrait du consentement : écrivez au responsable indiqué ci-dessus (réponse sous 30 jours). Vous pouvez porter plainte auprès de la Commission d'accès à l'information du Québec."] },
    ],
  };
}

function platformEn(page: PlatformPolicyPage, c: PlatformPolicyContext): LegalDocument {
  const who = [`- Operator: ${c.legalName}`, ...(c.address ? [`- Address: ${c.address}`] : []), ...(c.email ? [`- Email: ${c.email}`] : [])];
  if (page === "conditions") {
    return {
      title: "Terms of use",
      intro: `These terms govern the use of ${c.platformName} by people who create an online store on it (“you”). By creating an account, you accept them.`,
      sections: [
        { heading: "Who we are", body: [`${c.platformName} is operated by:`, ...who] },
        { heading: "The service", body: [`${c.platformName} creates a dropshipping store for free using artificial intelligence (name, design, copy, selection of products from a supplier), hosts it, collects sales and sends orders to the supplier.`, "Copy, suggested prices and product selections are generated automatically: you must review them and you are responsible for what your store publishes."] },
        { heading: "Commission", body: [`Creating and hosting the store is free. On every sale, ${c.platformName} takes ${c.commission} of the gross margin, i.e. the sale price (before taxes) minus the supplier's product cost and shipping.`, `Sale prices must keep a minimum gross margin of ${c.minMargin}; a price is raised automatically if the supplier's cost increases.`] },
        { heading: "Collection and payouts", body: ["Buyers pay into the platform's Stripe account. The platform pays the supplier, collects and remits sales taxes, keeps its commission and pays the rest to your Stripe Express account.", `Each payout is made ${c.reserveDays} days after the sale (a reserve covering refunds and disputes). You must complete your Stripe sign-up (identity, bank account) to receive payouts.`] },
        { heading: "Refunds and chargebacks", body: ["You can refund a buyer from your dashboard. How the cost of a refund or chargeback is shared between you and the platform (including the commission and dispute fees) follows the rules in force on the platform; an amount already paid out may be recovered from your next payouts or from the related transfer."] },
        { heading: "Your responsibilities", body: ["- Provide accurate information (identity, store legal information, contact address) and keep it up to date.", "- Answer buyers' questions and handle returns according to the policy shown on your store.", "- Comply with applicable laws (consumer protection, advertising, intellectual property) and your tax obligations on your income.", "- Not sell prohibited products: counterfeits or branded goods without authorization, weapons, drugs, tobacco and vaping, adult products, medicines or health products with claims, or any product prohibited by Stripe or by law."] },
        { heading: "Moderation and suspension", body: ["Products and copy are filtered automatically. The platform may remove a product or suspend a store, in particular in case of:", "- sale of prohibited or counterfeit products;", "- false or misleading information;", "- an abnormal rate of complaints, refunds or chargebacks;", "- fraud or abuse of the service;", "- breach of these terms or of the law.", "During a suspension, the store is offline, payments are blocked and payouts are held. The reason is shown in your dashboard."] },
        { heading: "Liability", body: [`${c.platformName} provides the technology, payments and order transmission. You are the merchant of your store toward buyers. To the extent permitted by law, the platform's liability is limited to the commissions collected over the last 12 months; it is not liable for delays or defects attributable to the supplier or carrier, or for indirect losses.`] },
        { heading: "End of service", body: ["You may close your store at any time. Payouts owed are still paid after the reserve period, minus refunds and disputes. We may change these terms; significant changes are announced at least 30 days in advance."] },
        { heading: "Governing law", body: ["These terms are governed by the applicable laws of Québec and Canada. The courts of Québec have jurisdiction."] },
      ],
    };
  }
  return {
    title: "Privacy policy",
    intro: `This policy explains how ${c.legalName} handles the personal information of people who create an account on ${c.platformName}, in accordance with Québec's Law 25 and applicable Canadian laws. Buyers' information is covered by each store's own policy.`,
    sections: [
      { heading: "Person in charge of the protection of personal information", body: [`${c.privacyOfficer}${c.email ? `, reachable at ${c.email}` : ""}.`] },
      { heading: "Information we collect", body: ["- Account: name, email address, password (encrypted) or Google sign-in.", "- Store: description of your idea, copy, settings and legal information.", "- Payments: identity and bank details are provided directly to Stripe; we receive the status of your payout account.", "- Usage: log of AI generations (for limits and costs) and visit statistics for your stores (without identifying visitors)."] },
      { heading: "How we use it", body: ["To provide the service (store creation and hosting, payments, payouts, orders), contact you about your account, prevent fraud and meet our legal obligations."] },
      { heading: "Service providers", body: ["Hosting and database (Supabase, Cloudflare), artificial intelligence (Anthropic), payments (Stripe), supplier (CJ Dropshipping), email (Resend). Some are located outside Québec, notably in the United States; we assess the protection offered before any transfer and limit what is shared to what is necessary. Descriptions sent to the AI should not contain personal information."] },
      { heading: "Cookies", body: ["We only use necessary cookies: sign-in session and language choice."] },
      { heading: "Retention", body: ["Account information is kept while the account is active, then deleted; accounting and tax records are kept for the period required by law."] },
      { heading: "Your rights", body: ["Access, correction, deletion, portability and withdrawal of consent: write to the person named above (answer within 30 days). You may file a complaint with Québec's Commission d'accès à l'information."] },
    ],
  };
}

export function platformPolicy(page: PlatformPolicyPage, ctx: PlatformPolicyContext, locale: Locale): LegalDocument {
  return locale === "fr" ? platformFr(page, ctx) : platformEn(page, ctx);
}

/** Date de la version des modèles (affichée « Dernière mise à jour »). */
export const LEGAL_TEMPLATES_DATE = "2026-10-20";
