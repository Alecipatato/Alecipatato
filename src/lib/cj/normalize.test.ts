import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bestShippingOption,
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
        { pid: "P1", productNameEn: "Manual Coffee Grinder", productImage: "https://cf.cj.com/1.jpg", sellPrice: "8.20", categoryName: "Kitchen" },
        { pid: "P2", productNameEn: "Milk Pitcher", productImage: '["https://cf.cj.com/2.jpg"]', sellPrice: "3.10 -- 4.00" },
        { pid: "P1", productNameEn: "Doublon", sellPrice: "1" },
        { productNameEn: "Sans identifiant", sellPrice: "1" },
      ],
    });
    assert.deepEqual(items, [
      { pid: "P1", name: "Manual Coffee Grinder", image: "https://cf.cj.com/1.jpg", priceUsdCents: 820, category: "Kitchen" },
      { pid: "P2", name: "Milk Pitcher", image: "https://cf.cj.com/2.jpg", priceUsdCents: 310, category: null },
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
    assert.equal(normalizeStock([]), null);
  });
});
