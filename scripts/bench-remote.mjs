import { performance } from 'node:perf_hooks';

const endpoint = process.argv[2] || 'https://spot-survival-engine.northstar-gpu-rental.workers.dev/v1/spi';
const rounds = Math.max(20, Number(process.argv[3]) || 200);
const concurrency = Math.max(1, Math.min(50, Number(process.argv[4]) || 10));
const warmup = Math.min(50, Math.max(5, concurrency * 2));
const body = JSON.stringify({
  observation: {
    provider: 'benchmark',
    region: 'apac',
    instanceType: 'synthetic-read-only',
    price: 1.25,
    capacityScore: 0.5
  }
});

async function request() {
  const started = performance.now();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body
  });
  const payload = await response.json();
  if (!response.ok || typeof payload.spi !== 'number') {
    throw new Error(`unexpected response: ${response.status}`);
  }
  return performance.now() - started;
}

for (let i = 0; i < warmup; i += concurrency) {
  await Promise.all(Array.from({ length: Math.min(concurrency, warmup - i) }, request));
}

const samples = [];
const startedAt = new Date().toISOString();
for (let i = 0; i < rounds; i += concurrency) {
  samples.push(...await Promise.all(Array.from({ length: Math.min(concurrency, rounds - i) }, request)));
}
samples.sort((a, b) => a - b);
const percentile = (p) => samples[Math.min(samples.length - 1, Math.ceil(samples.length * p) - 1)];
const round = (n) => Math.round(n * 100) / 100;

console.log(JSON.stringify({
  scope: 'Worker + D1 end-to-end from client; POST /v1/spi',
  endpoint,
  runtime: process.version,
  startedAt,
  rounds,
  concurrency,
  warmup,
  p50Ms: round(percentile(0.50)),
  p95Ms: round(percentile(0.95)),
  p99Ms: round(percentile(0.99)),
  minMs: round(samples[0]),
  maxMs: round(samples.at(-1))
}, null, 2));
