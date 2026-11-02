import assert from "node:assert/strict";
import { test } from "node:test";
import { decryptSecret, encryptSecret, hasEncryptionKey } from "./crypto.ts";

const KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER = Buffer.alloc(32, 9).toString("base64");

test("chiffre puis déchiffre ; chaque chiffrement est différent", async () => {
  const a = await encryptSecret("EAAB-jeton-secret", KEY);
  const b = await encryptSecret("EAAB-jeton-secret", KEY);
  assert.notEqual(a, b);
  assert.ok(a.startsWith("v1.") && !a.includes("EAAB"));
  assert.equal(await decryptSecret(a, KEY), "EAAB-jeton-secret");
});

test("mauvaise clé ou texte altéré : null", async () => {
  const sealed = await encryptSecret("secret", KEY);
  assert.equal(await decryptSecret(sealed, OTHER), null);
  const [p, iv, data] = sealed.split(".");
  const flipped = Buffer.from(data, "base64");
  flipped[0] ^= 1;
  assert.equal(await decryptSecret(`${p}.${iv}.${flipped.toString("base64")}`, KEY), null);
  assert.equal(await decryptSecret("n'importe quoi", KEY), null);
});

test("clé absente ou de mauvaise longueur : refusée", async () => {
  assert.equal(hasEncryptionKey(undefined), false);
  assert.equal(hasEncryptionKey(Buffer.alloc(16).toString("base64")), false);
  assert.equal(hasEncryptionKey(KEY), true);
  await assert.rejects(encryptSecret("x", undefined));
});
