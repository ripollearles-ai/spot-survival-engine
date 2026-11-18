import { performance } from 'node:perf_hooks';
import { evaluateRisk } from '../src/model.js';

const rounds = Math.max(1000, Number(process.argv[2]) || 100000);
const rows = Array.from({ length: 200 }, (_, i) => ({ price: 1 + (i % 17) / 10, preempted: i % 9 === 0 ? 1 : 0 }));
const input = { price: 2.2, capacityScore: 0.35, dirtyFlags: [] };
const samples = new Float64Array(rounds);

for (let i = 0; i < rounds; i += 1) {
  const start = performance.now();
  evaluateRisk(rows, input);
  samples[i] = performance.now() - start;
}
samples.sort();
const percentile = (p) => samples[Math.min(rounds - 1, Math.floor(rounds * p))];
const output = { scope: 'model-only; excludes Worker, network and D1', runtime: process.version, rounds, p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99) };
console.log(JSON.stringify(output, null, 2));
