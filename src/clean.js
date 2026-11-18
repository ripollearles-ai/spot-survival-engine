const GPU_VRAM = Object.freeze({
  a100: 40,
  'a100-80gb': 80,
  h100: 80,
  l4: 24,
  t4: 16
});

function numberOr(value, fallback, flag, flags) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isFinite(n)) {
    flags.push(flag);
    return fallback;
  }
  return n;
}

function optionalNumber(value, flag, flags) {
  if (value === undefined || value === null || value === '') return null;
  return numberOr(value, null, flag, flags);
}

export function cleanObservation(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('observation must be a JSON object');
  }

  const flags = [];
  const provider = String(raw.provider || '').trim().toLowerCase();
  const region = String(raw.region || '').trim().toLowerCase();
  const instanceType = String(raw.instanceType || raw.instance_type || '').trim().toLowerCase();
  if (!provider || !region || !instanceType) throw new TypeError('provider, region and instanceType are required');

  let bandwidth = optionalNumber(raw.bandwidthMbps, 'bandwidth_invalid', flags);
  // 部分上游会用 -1 表示“未探测到”，不能让它污染均值。
  if (bandwidth !== null && bandwidth < 0) {
    bandwidth = null;
    flags.push('bandwidth_negative_sentinel');
  }

  const gpu = String(raw.gpu || '').trim().toLowerCase();
  let vram = optionalNumber(raw.vramGb, 'vram_invalid', flags);
  const knownVram = GPU_VRAM[gpu];
  // 某些供应商把 MiB 当成 GiB；只在型号与数值同时吻合时纠正。
  if (vram !== null && vram > 1024 && knownVram && Math.abs(vram / 1024 - knownVram) < 2) {
    vram /= 1024;
    flags.push('vram_mib_repaired');
  }
  if (knownVram && vram !== null && Math.abs(vram - knownVram) > knownVram * 0.5) {
    vram = knownVram;
    flags.push('vram_model_mismatch_repaired');
  }

  const suppliedTimestamp = raw.observedAt ?? raw.observed_at;
  let observedAt = suppliedTimestamp === undefined || suppliedTimestamp === null
    ? now
    : numberOr(suppliedTimestamp, now, 'timestamp_invalid', flags);
  if (observedAt < 10_000_000_000) observedAt *= 1000;
  if (Math.abs(observedAt - now) > 7 * 86_400_000) {
    observedAt = now;
    flags.push('timestamp_out_of_window');
  }

  const price = numberOr(raw.price, NaN, 'price_invalid', flags);
  if (!Number.isFinite(price) || price < 0) throw new TypeError('price must be a non-negative number');

  return {
    provider,
    region,
    instanceType,
    observedAt: Math.trunc(observedAt),
    price,
    bandwidthMbps: bandwidth,
    vramGb: vram,
    capacityScore: Math.min(1, Math.max(0, numberOr(raw.capacityScore, 0.5, 'capacity_defaulted', flags))),
    preempted: raw.preempted === true || raw.preempted === 1 ? 1 : 0,
    dirtyFlags: flags
  };
}
