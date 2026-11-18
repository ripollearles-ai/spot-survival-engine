import { cleanObservation } from './clean.js';
import { decide, evaluateRisk } from './model.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const PUBLIC_ORIGIN = 'https://spot-survival-engine.northstar-gpu-rental.workers.dev';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.pathname === '/') return landingPage();
      if (request.method === 'GET' && url.pathname === '/robots.txt') {
        return new Response(`User-agent: *\nAllow: /\nSitemap: ${PUBLIC_ORIGIN}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
      if (request.method === 'GET' && url.pathname === '/sitemap.xml') {
        return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${PUBLIC_ORIGIN}/</loc></url><url><loc>${PUBLIC_ORIGIN}/methodology</loc></url></urlset>`, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
      }
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

function landingPage() {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Spot Survival Engine — Preemption Risk Scoring</title>
  <meta name="description" content="An open, auditable survival-probability API for interruptible GPU and spot compute workloads, powered by Cloudflare Workers and D1.">
  <link rel="canonical" href="${PUBLIC_ORIGIN}/">
  <style>
    :root{color-scheme:dark;--bg:#080b10;--panel:#101722;--line:#263244;--text:#eaf0f8;--muted:#9aa9bb;--cyan:#4de3c1;--amber:#ffbf69}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 75% 0,#132a31 0,transparent 38%),var(--bg);color:var(--text);font:16px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace}main{max-width:980px;margin:auto;padding:72px 24px}header{border-left:4px solid var(--cyan);padding-left:24px;margin-bottom:48px}small{color:var(--cyan);letter-spacing:.16em;text-transform:uppercase}h1{font-size:clamp(2.4rem,7vw,5.4rem);line-height:.96;margin:.3em 0}p{color:var(--muted);max-width:760px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}.card{background:linear-gradient(145deg,#121b27,#0d131c);border:1px solid var(--line);padding:24px;border-radius:10px}h2{font-size:1rem;color:var(--amber);margin-top:0}.metric{font-size:2rem;color:var(--cyan)}code{color:#c8d7ea}a{color:var(--cyan);text-decoration-thickness:1px;text-underline-offset:4px}.links{display:flex;gap:20px;flex-wrap:wrap;margin-top:36px}footer{margin-top:64px;padding-top:24px;border-top:1px solid var(--line);color:var(--muted);font-size:.88rem}
  </style>
</head>
<body><main>
  <header><small>Open edge-compute model</small><h1>Spot Survival<br>Engine</h1><p>Estimate preemption risk for interruptible GPU and spot compute capacity. Every score exposes its sample size, confidence, and diagnostics—no black-box certainty.</p></header>
  <section class="grid">
    <article class="card"><h2>Survival Probability Index</h2><div class="metric">0—100</div><p>Beta-smoothed interruption history, Welford price statistics, and current capacity pressure.</p></article>
    <article class="card"><h2>Evidence gate</h2><div class="metric">≥ 20</div><p>Actionable advice is withheld until the series has enough clean observations.</p></article>
    <article class="card"><h2>Edge runtime</h2><div class="metric">2 ms</div><p>Measured Worker startup time. D1 stores compact observation history in APAC.</p></article>
  </section>
  <section class="links"><a href="/methodology">Methodology JSON</a><a href="/health">Health endpoint</a><a href="https://github.com/ripollearles-ai/spot-survival-engine">Source on GitHub</a></section>
  <footer>Research context: <a href="https://renderindex.biz/en/">Render Index</a>, independent analysis of real-world GPU configurations, performance, reliability, and cost. <a href="https://renderindex.biz/en/about">Read the research methodology →</a></footer>
</main></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
