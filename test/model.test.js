import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanObservation } from '../src/clean.js';
import { decide, evaluateRisk } from '../src/model.js';
import { Welford } from '../src/stats.js';

test('Welford matches the sample variance', () => {
  const stats = new Welford();
  [2, 4, 4, 4, 5, 5, 7, 9].forEach((n) => stats.push(n));
  assert.equal(stats.mean, 5);
  assert.ok(Math.abs(stats.variance - 32 / 7) < 1e-12);
});

test('repairs upstream sentinels and VRAM unit confusion', () => {
  const row = cleanObservation({ provider: 'AWS', region: 'US-EAST-1', instanceType: 'p4d', gpu: 'a100-80gb', vramGb: 81920, bandwidthMbps: -1, price: 2, capacityScore: 0.2 }, 1_800_000_000_000);
  assert.equal(row.bandwidthMbps, null);
  assert.equal(row.vramGb, 80);
  assert.deepEqual(row.dirtyFlags, ['bandwidth_negative_sentinel', 'vram_mib_repaired', 'timestamp_invalid']);
});

test('high interruption history lowers SPI and can trigger a lock', () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ price: 1 + i / 100, preempted: i < 80 ? 1 : 0 }));
  const current = { price: 2, capacityScore: 0.05, dirtyFlags: [] };
  const risk = evaluateRisk(rows, current);
  assert.ok(risk.spi < 20);
  assert.equal(decide(risk, { interruptionLoss: 100, lockPremium: 10 }).action, 'LOCK_NOW');
});
