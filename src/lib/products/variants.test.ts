import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { freightRepresentatives, pickVariants, weightBucket } from "./variants.ts";

const v = (vid: string, key: string | null, price: number, weightG: number | null, stock: number | null, image: string | null = null) => ({ vid, key, priceUsdCents: price, weightG, stock, image });

describe("choix des variantes", () => {
  it("écarte les ruptures, garde les moins chères, une par combinaison", () => {
    const picked = pickVariants([
      v("a", "Brown 50cm", 900, 1500, 10),
      v("b", "Olive 40cm", 470, 1085, 0), // rupture
      v("c", "Grey 40cm", 470, 1085, null, "img"),
      v("d", "grey 40cm", 480, 1085, 5), // même combinaison
      v("e", "Pink 40cm", 500, 1090, 3),
    ], 3);
    assert.deepEqual(picked.map((x) => x.vid), ["c", "e", "a"]);
  });

  it("au plus 6 par défaut", () => {
    assert.equal(pickVariants(Array.from({ length: 10 }, (_, i) => v(`v${i}`, `k${i}`, 100 + i, 500, 1))).length, 6);
  });

  it("livraison : un calcul par tranche de 100 g, avec la variante la plus lourde", () => {
    assert.equal(weightBucket(1085), "11");
    assert.equal(weightBucket(1100), "11");
    assert.equal(weightBucket(null), "?");
    const reps = freightRepresentatives([v("a", "x", 1, 1085, 1), v("b", "y", 1, 1100, 1), v("c", "z", 1, 1536, 1), v("d", "w", 1, null, 1)]);
    assert.deepEqual(Object.fromEntries(reps), { "11": "b", "16": "c", "?": "d" });
  });
});
