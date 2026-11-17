import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sma, rsi, computeSignal } from './indicators.js';

test('sma', () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
});

test('rsi borné entre 0 et 100, 100 si uniquement des hausses', () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  assert.equal(rsi(up)[29], 100);
  const mixed = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i) * 5);
  for (const v of rsi(mixed).filter((x) => x !== null)) assert.ok(v >= 0 && v <= 100);
});

const bar = (c, i) => ({ t: new Date(Date.UTC(2026, 0, 1, 14, i * 5)).toISOString(), o: c, h: c + 0.1, l: c - 0.1, c, v: 1000 });

test('croisement haussier => achat', () => {
  // longue baisse puis remontée nette sur les dernières bougies
  const closes = [...Array.from({ length: 60 }, (_, i) => 120 - i * 0.3), ...Array.from({ length: 40 }, (_, i) => 102 + i * 0.5 + (i % 2 ? -0.9 : 0.9))];
  let found = null;
  for (let n = 55; n <= closes.length; n++) {
    const s = computeSignal(closes.slice(0, n).map(bar));
    if (s.side) { found = s; break; }
  }
  assert.equal(found?.side, 'buy');
});

test('croisement baissier => vente', () => {
  const closes = [...Array.from({ length: 60 }, (_, i) => 80 + i * 0.3), ...Array.from({ length: 40 }, (_, i) => 98 - i * 0.5 + (i % 2 ? 0.9 : -0.9))];
  let found = null;
  for (let n = 55; n <= closes.length; n++) {
    const s = computeSignal(closes.slice(0, n).map(bar));
    if (s.side) { found = s; break; }
  }
  assert.equal(found?.side, 'sell');
});

test('pas assez de données => aucun signal', () => {
  assert.equal(computeSignal([1, 2, 3].map(bar)).side, null);
});
