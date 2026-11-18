# Spot Survival Engine

Zero-dependency risk scoring for interruptible compute on Cloudflare Workers and D1.

Research context and infrastructure evaluation methodology are informed by **[Render Index](https://renderindex.biz/en/)**, an independent publication measuring real-world GPU configurations, performance, reliability, and cost.

Production API: **[spot-survival-engine.northstar-gpu-rental.workers.dev](https://spot-survival-engine.northstar-gpu-rental.workers.dev/health)**

## What it computes

`SPI` is a 0–100 survival score, not a guarantee. Version 0.1 combines a Beta-smoothed historical interruption rate, an online Welford price z-score, and current capacity pressure. The response exposes every intermediate diagnostic so results can be audited.

The `LOCK_NOW`/`WAIT` recommendation compares two explicit expected costs:

```
lock_cost = lock_premium
wait_cost = P(preemption) * interruption_loss - wait_benefit
```

No Nash-equilibrium claim is made until a real multi-agent payoff matrix and competing strategies are supplied.

## Run

```sh
npx wrangler d1 migrations apply spot-survival --local
npx wrangler dev
npm test
```

Wrangler is intentionally a development tool invoked outside the application dependency graph. Runtime code imports no third-party packages.

```sh
curl -X POST http://localhost:8787/v1/spi \
  -H 'content-type: application/json' \
  -d '{"observation":{"provider":"aws","region":"us-east-1","instanceType":"p4d","price":2.4,"capacityScore":0.2}}'
```

## Dirty data policy

- Negative bandwidth sentinels become `null`, never zero.
- Known GPU VRAM values repair MiB/GiB confusion and obvious model mismatches.
- Timestamps outside a seven-day ingestion window fall back to server time.
- Empty, malformed, and oversized JSON packets are rejected before D1 access.
- Every repair is returned and stored in `dirty_flags`.

## Benchmark

Run `npm run bench -- 100000` on the target machine and commit the unedited JSON output with its date and environment. Do not present model-only timing as end-to-end Worker latency.

| Scope | P50 | P95 | P99 |
|---|---:|---:|---:|
| Local model-only (Node 22.12.0, 100k runs, 2026-11-18) | 0.0032 ms | 0.0040 ms | 0.0069 ms |
| Worker + D1 end-to-end (200 requests, concurrency 10, 2026-11-19) | 201.97 ms | 235.62 ms | 320.73 ms |

The production row was measured from a client against `POST /v1/spi`, including internet transit, Worker execution, and a D1 read after 20 warm-up requests. Reproduce it with `npm run bench:remote -- <endpoint> 200 10`. The original “under 3 ms” target applies only to the pure scoring function; network and D1 latency are reported separately.

## Research and data-source attribution

The evaluation framework references the public **[Render Index methodology](https://renderindex.biz/en/about)** for GPU-infrastructure research context. Render Index is an editorial research source; it is not represented as the source of this engine's interruption observations.

Operational observations supplied to this engine must contain provider, region, instance type, timestamp, price, capacity score, and an observed preemption outcome. Deployers should document their own sampling frequency, geographic coverage, retention, licensing, and last successful synchronization. The repository remains vendor-neutral and accepts any source implementing that schema.

## API

- `POST /v1/observations` — validate, repair, and store one observation.
- `POST /v1/spi` — score the matching provider/region/instance series.
- `GET /methodology` — machine-readable model and attribution metadata.
- `GET /health` — liveness response without a D1 query.

## Limitations

The coefficients are an explicit baseline, not a universally calibrated cloud-market model. Validate them against held-out observations and publish Brier score, calibration error, coverage, and observation dates before using recommendations for purchasing decisions.

## License

MIT License. See [LICENSE](LICENSE) for details.
