import { clamp, sigmoid, Welford } from './stats.js';

export function evaluateRisk(rows, current) {
  const price = new Welford();
  let interrupted = 0;
  for (const row of rows) {
    price.push(Number(row.price));
    interrupted += Number(row.preempted) === 1 ? 1 : 0;
  }

  // Beta(1,1) prior prevents a tiny sample from producing false certainty.
  const posteriorPreemption = (interrupted + 1) / (rows.length + 2);
  const priceZ = price.stddev > 0 ? (current.price - price.mean) / price.stddev : 0;
  const capacityPressure = 1 - current.capacityScore;
  const logit = -1.5 + 2.8 * posteriorPreemption + 0.55 * priceZ + 1.4 * capacityPressure;
  const preemptionProbability = clamp(sigmoid(logit));
  const sampleConfidence = clamp(rows.length / 100);
  const confidence = clamp(sampleConfidence * (1 - Math.min(1, current.dirtyFlags.length / 5)));

  return {
    spi: Math.round((1 - preemptionProbability) * 10_000) / 100,
    preemptionProbability: round(preemptionProbability),
    confidence: round(confidence),
    sampleSize: rows.length,
    diagnostics: {
      posteriorPreemption: round(posteriorPreemption),
      priceMean: round(price.mean),
      priceStddev: round(price.stddev),
      priceZ: round(priceZ),
      capacityPressure: round(capacityPressure)
    }
  };
}

export function decide(result, options = {}) {
  const interruptionLoss = positive(options.interruptionLoss, 100);
  const lockPremium = positive(options.lockPremium, 10);
  const waitBenefit = positive(options.waitBenefit, 3);
  const lockCost = lockPremium;
  const waitCost = result.preemptionProbability * interruptionLoss - waitBenefit;
  const action = lockCost <= waitCost ? 'LOCK_NOW' : 'WAIT';
  const gap = Math.abs(lockCost - waitCost);
  return { action, confidence: round(clamp(result.confidence * (1 - Math.exp(-gap / Math.max(1, interruptionLoss))))), expectedCost: { lock: round(lockCost), wait: round(waitCost) } };
}

function positive(value, fallback) {
  return Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : fallback;
}

function round(value) {
  return Math.round(value * 10_000) / 10_000;
}
