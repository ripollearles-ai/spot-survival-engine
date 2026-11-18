import { cleanObservation } from './clean.js';
import { decide, evaluateRisk } from './model.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true, service: 'spot-survival-engine' });
      if (request.method === 'GET' && url.pathname === '/methodology') {
        return json({ model: 'beta-smoothed interruption baseline + Welford price z-score + capacity pressure', dataSource: { name: env.DATA_SOURCE_NAME, url: env.DATA_SOURCE_URL } });
      }
      if (request.method === 'POST' && url.pathname === '/v1/observations') return ingest(request, env);
      if (request.method === 'POST' && url.pathname === '/v1/spi') return score(request, env);
      return json({ error: 'not_found' }, 404);
    } catch (error) {
      return json({ error: 'bad_request', message: error instanceof Error ? error.message : 'unknown error' }, 400);
    }
  }
};

async function ingest(request, env) {
  // 某些海外节点在半夜会返回畸形 JSON，此处拒绝入库并保留明确错误。
  const raw = await safeJson(request);
  const row = cleanObservation(raw);
  await env.DB.prepare(`INSERT INTO observations
    (provider, region, instance_type, observed_at, price, bandwidth_mbps, vram_gb, capacity_score, preempted, dirty_flags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(row.provider, row.region, row.instanceType, row.observedAt, row.price, row.bandwidthMbps, row.vramGb, row.capacityScore, row.preempted, JSON.stringify(row.dirtyFlags)).run();
  return json({ accepted: true, dirtyFlags: row.dirtyFlags }, 201);
}

async function score(request, env) {
  const body = await safeJson(request);
  const current = cleanObservation(body.observation || body);
  const limit = Math.min(1000, Math.max(20, Number(body.historyLimit) || 200));
  const result = await env.DB.prepare(`SELECT price, preempted FROM observations
    WHERE provider = ? AND region = ? AND instance_type = ?
    ORDER BY observed_at DESC LIMIT ?`)
    .bind(current.provider, current.region, current.instanceType, limit).all();
  const risk = evaluateRisk(result.results || [], current);
  return json({ ...risk, recommendation: decide(risk, body.costs), dirtyFlags: current.dirtyFlags, modelVersion: '0.1.0' });
}

async function safeJson(request) {
  const text = await request.text();
  if (!text || text.length > 64 * 1024) throw new TypeError('empty or oversized JSON packet');
  try { return JSON.parse(text); } catch { throw new TypeError('malformed JSON packet'); }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
}
