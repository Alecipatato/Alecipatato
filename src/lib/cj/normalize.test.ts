import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bestShippingOption,
  normalizeBalance,
  normalizeCreatedOrder,
  normalizeOrderDetail,
  orderStage,
  trackingUrl,
  normalizeListResponse,
  normalizeProductDetail,
  normalizeShippingOptions,
  normalizeStock,
  parseAging,
  parseImages,
  parseUsdCents,
  stripHtml,
} from "./normalize.ts";

describe("lecture des valeurs CJ", () => {
  it("prix sous toutes leurs formes", () => {
    assert.equal(parseUsdCents(3.49), 349);
    assert.equal(parseUsdCents("3.49"), 349);
    assert.equal(parseUsdCents("$12.5"), 1250);
    assert.equal(parseUsdCents("3.49 -- 5.10"), 349);
    assert.equal(parseUsdCents("5.10-3.49"), 349);
    assert.equal(parseUsdCents("abc"), null);
    assert.equal(parseUsdCents(-1), null);
  });

  it("délais de livraison", () => {
    assert.deepEqual(parseAging("7-15"), { min: 7, max: 15 });
    assert.deepEqual(parseAging("7~12 days"), { min: 7, max: 12 });
    assert.deepEqual(parseAging(12), { min: 12, max: 12 });
    assert.equal(parseAging(""), null);
  });

  it("images : uniquement des URL https", () => {
    assert.deepEqual(parseImages('["https://cf.cj.com/a.jpg","https://cf.cj.com/b.jpg"]'), ["https://cf.cj.com/a.jpg", "https://cf.cj.com/b.jpg"]);
    assert.deepEqual(parseImages("https://cf.cj.com/a.jpg,https://cf.cj.com/b.jpg"), ["https://cf.cj.com/a.jpg", "https://cf.cj.com/b.jpg"]);
    assert.deepEqual(parseImages(["//cf.cj.com/a.jpg", "http://x/y.jpg", "javascript:alert(1)"]), ["https://cf.cj.com/a.jpg"]);
  });

  it("nettoie le HTML des descriptions", () => {
    assert.equal(stripHtml("<p>Hello&nbsp;<b>world</b></p><script>x()</script><ul><li>A</li><li>B</li></ul>"), "Hello world\nA\nB");
  });
});

describe("réponses CJ", () => {
  it("liste de produits (format product/list)", () => {
    const items = normalizeListResponse({
      pageNum: 1, pageSize: 20, total: 2,
      list: [
        { pid: "P1", productNameEn: "Manual Coffee Grinder", productImage: "https://cf.cj.com/1.jpg", sellPrice: "8.20", categoryName: "Kitchen", listedNum: 1240 },
        { pid: "P2", productNameEn: "Milk Pitcher", productImage: '["https://cf.cj.com/2.jpg"]', sellPrice: "3.10 -- 4.00" },
        { pid: "P1", productNameEn: "Doublon", sellPrice: "1" },
        { productNameEn: "Sans identifiant", sellPrice: "1" },
      ],
    });
    assert.deepEqual(items, [
      { pid: "P1", name: "Manual Coffee Grinder", image: "https://cf.cj.com/1.jpg", priceUsdCents: 820, category: "Kitchen", listedCount: 1240 },
      { pid: "P2", name: "Milk Pitcher", image: "https://cf.cj.com/2.jpg", priceUsdCents: 310, category: null, listedCount: 0 },
    ]);
  });

  it("liste de produits (format listV2)", () => {
    const items = normalizeListResponse({ content: [{ productList: [{ id: "X9", nameEn: "Scale", bigImage: "https://cf.cj.com/s.jpg", nowPrice: 5 }] }] });
    assert.equal(items[0].pid, "X9");
    assert.equal(items[0].priceUsdCents, 500);
  });

  it("fiche produit avec variantes", () => {
    const p = normalizeProductDetail({
      pid: "P1",
      productNameEn: "Manual Coffee Grinder",
      productImageSet: ["https://cf.cj.com/1.jpg", "https://cf.cj.com/2.jpg"],
      description: "<p>Ceramic burr</p>",
      sellPrice: "8.20",
      variants: [
        { vid: "V1", variantNameEn: "Black", variantSellPrice: 8.2, variantImage: "https://cf.cj.com/v1.jpg", variantSku: "CJ-1" },
        { vid: "V2", variantNameEn: "Silver" },
        { variantNameEn: "Sans vid", variantSellPrice: 1 },
      ],
    });
    assert.ok(p);
    assert.equal(p.description, "Ceramic burr");
    assert.equal(p.images.length, 2);
    assert.deepEqual(p.variants.map((v) => [v.vid, v.priceUsdCents]), [["V1", 820], ["V2", 820]]);
    assert.equal(p.onSale, true); // statut absent : considéré en vente
  });

  it("fiche produit : statut de vente et image principale (doc CJ)", () => {
    const base = { pid: "P2", productNameEn: "Lamp", sellPrice: "3", variants: [{ vid: "V1" }], bigImage: "https://cf.cj.com/big.jpg" };
    assert.equal(normalizeProductDetail({ ...base, status: "3" })?.onSale, true);
    assert.equal(normalizeProductDetail({ ...base, status: "2" })?.onSale, false);
    assert.deepEqual(normalizeProductDetail(base)?.images, ["https://cf.cj.com/big.jpg"]);
  });

  it("options de livraison et choix sous 15 jours", () => {
    const options = normalizeShippingOptions([
      { logisticName: "CJPacket Ordinary", logisticPrice: 2.1, logisticAging: "15-25" },
      { logisticName: "CJPacket Sensitive", logisticPrice: "4.30", logisticAging: "8-12" },
      { logisticName: "DHL", logisticPrice: 18, logisticAging: "3-6" },
    ]);
    assert.equal(options.length, 3);
    assert.equal(bestShippingOption(options, 15)?.name, "CJPacket Sensitive");
    assert.equal(bestShippingOption(options, 5), null);
  });

  it("stock : somme des entrepôts", () => {
    assert.equal(normalizeStock([{ areaEn: "China", storageNum: 120 }, { areaEn: "US", storageNum: 30 }]), 150);
    // Format documenté : entrepôts avec pays ; seuls ceux de Chine comptent (livraison calculée depuis la Chine).
    assert.equal(normalizeStock([{ countryCode: "CN", totalInventoryNum: 80, storageNum: 1 }, { countryCode: "US", totalInventoryNum: 40 }]), 80);
    assert.equal(normalizeStock([{ countryCode: "US", totalInventoryNum: 40 }]), 0);
    assert.equal(normalizeStock([]), null);
  });
});

describe("commandes CJ", () => {
  it("lit l'identifiant de la commande créée (plusieurs formes)", () => {
    assert.deepEqual(normalizeCreatedOrder({ orderId: "2103221234567", orderAmount: "12.30" }), { orderId: "2103221234567", shipmentOrderId: null, amountUsdCents: 1230 });
    // Réponse documentée de createOrderV2 : montant réel et identifiant d'expédition (paiement V2).
    assert.deepEqual(
      normalizeCreatedOrder({ orderId: "CJ1", shipmentOrderId: "SH1", actualPayment: "15.80", orderAmount: "16.00", productAmount: "9.00" }),
      { orderId: "CJ1", shipmentOrderId: "SH1", amountUsdCents: 1580 },
    );
    assert.equal(normalizeCreatedOrder("2103221234567")?.orderId, "2103221234567");
    assert.equal(normalizeCreatedOrder({ id: 42 })?.orderId, "42");
    assert.equal(normalizeCreatedOrder({}), null);
    assert.equal(normalizeCreatedOrder(null), null);
  });

  it("traduit les statuts CJ", () => {
    assert.equal(orderStage("UNPAID"), "unpaid");
    assert.equal(orderStage("CREATED"), "unpaid");
    assert.equal(orderStage("UNSHIPPED"), "processing");
    assert.equal(orderStage("SHIPPED"), "shipped");
    assert.equal(orderStage("DELIVERED"), "delivered");
    assert.equal(orderStage("CANCELLED"), "cancelled");
    assert.equal(orderStage(null), "unknown");
  });

  it("détail : statut, suivi et transporteur", () => {
    const d = normalizeOrderDetail({ orderId: "1", orderStatus: "SHIPPED", trackNumber: "YT123", logisticName: "CJPacket" });
    assert.deepEqual(d, { orderId: "1", stage: "shipped", rawStatus: "SHIPPED", trackingNumber: "YT123", carrier: "CJPacket" });
    assert.equal(normalizeOrderDetail({ orderId: "1", orderStatus: "UNSHIPPED", trackNumber: "YT1" })?.stage, "shipped");
    assert.equal(normalizeOrderDetail({ orderId: "1", orderStatus: "UNSHIPPED" })?.stage, "processing");
    assert.equal(normalizeOrderDetail("x"), null);
  });

  it("lien de suivi", () => {
    assert.equal(trackingUrl("YT 1"), "https://t.17track.net/en#nums=YT%201");
  });
});

describe("solde du portefeuille CJ", () => {
  it("plusieurs formes de réponse", () => {
    assert.deepEqual(normalizeBalance({ amount: 152.3, freezeAmount: "10.00" }), { availableUsdCents: 15230, frozenUsdCents: 1000 });
    assert.deepEqual(normalizeBalance({ balance: "99.5" }), { availableUsdCents: 9950, frozenUsdCents: 0 });
    assert.deepEqual(normalizeBalance(12), { availableUsdCents: 1200, frozenUsdCents: 0 });
    assert.equal(normalizeBalance({}), null);
  });
});
