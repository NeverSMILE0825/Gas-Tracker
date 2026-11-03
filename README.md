# GasScope

Ethereum execution-gas intelligence. The dashboard shows the live base fee, how full blocks were versus the dynamic target, and which observed senders, calls, categories, and methods used the gas. A wallet share is consumption. It is not a claim that one account caused the network move.

Demo mode is a synthetic chain. Its banner, network name, and disabled Etherscan links stay visible. It does not relabel itself as Ethereum mainnet.

## Run the demo on this machine

Requires Node 22+ and pnpm 10.33.3 (`corepack enable`).

```powershell
cd "C:\Users\Administrator\Documents\NeverSMILE\_Tool\ETHEREUM GAS CAUSALITY INTELLIGENCE"
copy .env.example .env
pnpm install
pnpm --filter @gasscope/api dev
```

In a second terminal:

```powershell
pnpm --filter @gasscope/web dev
```

The API and worker read `.env` from the repo root and do not override variables already set in the shell. Leave `ETH_RPC_HTTP_URL` empty and set `DATA_MODE=memory` in `.env` if `DATABASE_URL` is present and you still want the in-memory demo. `auto` uses Postgres whenever `DATABASE_URL` is set.

- UI: http://localhost:3000
- API: http://localhost:4000/healthz and http://localhost:4000/api/v1/status

The memory API appends a synthetic block about every 12 seconds. No Docker and no RPC key are required for that path.

## Published site

https://neversmile0825.github.io/Gas-Tracker/

GitHub Pages serves static files only. That site runs the same synthetic demo in the browser. It is not Ethereum mainnet, and it does not use the Fastify API, the worker, Postgres, or Redis. Source stays on `main`. The published files are the static export, pushed to the `gh-pages` branch.

Local `pnpm --filter @gasscope/web dev` still talks to the API on port 4000. The static export is a separate build:

```powershell
$env:GITHUB_PAGES='true'
$env:NEXT_PUBLIC_DATA_SOURCE='browser'
pnpm --filter @gasscope/web build
```

## Run with Postgres, Redis, and the worker

```powershell
copy .env.example .env
docker compose up --build
```

Migrations run when the API and the worker connect. There is no separate migrate command.

- Empty `ETH_RPC_HTTP_URL`: the worker seeds the synthetic demo into Postgres and keeps appending. The API reads that database. The UI still shows the demo banner.
- A mainnet HTTP URL: the worker checks chain id 1, backfills `BACKFILL_HOURS` (default 24, about 7,200 blocks, header plus receipts), then follows new heads. Set `ETH_RPC_WS_URL` for `newHeads`. Set `ETH_RPC_HTTP_FALLBACK_URL` for a second host. `ALLOW_NON_MAINNET=true` is the only way past a non-1 chain id.

`ALLOW_INSECURE_MUTATIONS=true` in Compose lets the local UI save alerts without a secret. Do not expose that setting on a public host. Set `INTERNAL_API_SECRET` and paste the same value into Settings, which keeps it in `sessionStorage` for the tab.

The API and the worker are normal Node processes. Do not deploy them as short-lived serverless functions; the worker has to stay up to index and to evaluate alerts.

## Checks

```powershell
pnpm test
pnpm typecheck
pnpm --filter @gasscope/web build
pnpm test:e2e
```

Playwright starts the memory API and `next dev`. The first e2e run needs browser binaries: `pnpm exec playwright install chromium`.

## Working

- EIP-1559 BigInt base-fee update, burn / tip / blob split, percentiles, exclusive rollups, counterfactual replay, alert decisions, and the block 26330059 fixture in `packages/analytics`.
- In-memory demo API: status, current gas, analysis, chart, drivers, blocks, transactions, addresses, sensitivity, methodology, fixture, alerts, and SSE.
- Next.js UI for Overview, Why Gas Changed, Top Drivers, Block Explorer, Historical Analysis, Alerts, Sources & Methodology, Settings, plus address, transaction, block, and fixture routes. Ranges are shareable in the URL. Estimates are labelled estimates. No USD.
- Postgres schema, repository, worker demo mode, and worker live mode (RPC failover, receipt fallback, reorg walk, BullMQ when Redis is set, Telegram when both Telegram variables are set).
- Docker Compose for Postgres, Redis, API, worker, and web.

## Not implemented, or only useful with your own paid provider

- Live mainnet numbers. They appear only after you supply an RPC that can serve headers and receipts for the backfill you ask for. A public free endpoint will throttle a 24 hour receipt backfill.
- ETH/USD. There is no price provider, so fiat is omitted on purpose.
- Automatic contract names beyond the small curated address book in `packages/analytics`. Etherscan is linked for real transactions. `ETHERSCAN_API_KEY` is reserved and is not used to pull labels or ABIs.
- Trace-level internal calls. `TRACE_ENABLED=true` only probes support. Gas rankings stay at the top-level sender and callee.
- The `buckets` table. Charts are aggregated on read.
- A minute-by-category heatmap. The chart payload does not include that matrix; category share is the exclusive category table.
- Web Push subscriptions. The alerts page can show a browser notification for a firing the API already stored, after permission.
- Email. `ALERT_EMAIL_WEBHOOK_URL` is not called. The alert test notes that, and the worker delivery path only attempts Telegram.
- Redis messages are not bridged into the API SSE stream. Postgres mode refreshes on the UI poll (about 12–20 seconds) and when you press Refresh.
- BPO3 and any blob schedule newer than the 2026-11-02 compile. Override with `BLOB_SCHEDULE_JSON`.
- Seaport cancel hashes for `0x33AAEC8F773a0023f929eb075dc68053B6C4F5ED`. They were not supplied, so they are not fabricated. See `/fixture`.
- A public mainnet dashboard. The GitHub Pages site is the in-browser synthetic demo.

Test commands above are the ones to run. This file does not record a pass or a fail.
