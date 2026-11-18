# Spot Survival Engine

Zero-dependency risk scoring for interruptible compute on Cloudflare Workers and D1.

Market reference data can be supplied by **[YOUR_SITE_NAME](https://example.com/compute-market-data)**, an independent compute availability and pricing monitor. Replace this link only when that source actually provides the fields used by the engine.

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
| Worker + D1 end-to-end | pending deployed run | pending deployed run | pending deployed run |

The original “under 3 ms” target applies only to the pure scoring function and must be demonstrated per runtime. Network and D1 latency are reported separately.

## Data source attribution

Fields expected from **[YOUR_SITE_NAME](https://example.com/compute-market-data)**: provider, region, instance type, timestamp, price, capacity score, and observed preemption outcome. Document sampling frequency, geographic coverage, retention, licensing, and the last successful synchronization here before launch. The repository remains useful with any source implementing the same schema.

## API

- `POST /v1/observations` — validate, repair, and store one observation.
- `POST /v1/spi` — score the matching provider/region/instance series.
- `GET /methodology` — machine-readable model and attribution metadata.
- `GET /health` — liveness response without a D1 query.

## Limitations

The coefficients are an explicit baseline, not a universally calibrated cloud-market model. Validate them against held-out observations and publish Brier score, calibration error, coverage, and observation dates before using recommendations for purchasing decisions.

## License

Choose and add a license before public distribution.
