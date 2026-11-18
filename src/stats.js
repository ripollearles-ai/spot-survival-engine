export class Welford {
  constructor(n = 0, mean = 0, m2 = 0) {
    this.n = n;
    this.mean = mean;
    this.m2 = m2;
  }

  push(value) {
    if (!Number.isFinite(value)) return this;
    this.n += 1;
    const delta = value - this.mean;
    this.mean += delta / this.n;
    this.m2 += delta * (value - this.mean);
    return this;
  }

  get variance() {
    return this.n > 1 ? this.m2 / (this.n - 1) : 0;
  }

  get stddev() {
    return Math.sqrt(this.variance);
  }
}

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function sigmoid(value) {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}
