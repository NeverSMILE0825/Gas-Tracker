# Architecture

GasScope is a pnpm workspace. The browser talks only to the Fastify API. The API never proxies an arbitrary RPC URL from the client.

## Processes

- `apps/web` is a Next.js App Router UI. It reads `NEXT_PUBLIC_API_BASE_URL` or, when that is unset, `public/runtime-config.json`.
- `apps/api` serves `/api/v1/*`, `/healthz`, and `/readyz`. With `DATA_MODE=memory` (or `auto` and no `DATABASE_URL`) it holds a synthetic demo in process and appends a block about every 12 seconds. With Postgres it reads what the worker has stored. Migrations run when the API opens Postgres.
- `apps/worker` is a long-running process. It requires `DATABASE_URL`. An empty `ETH_RPC_HTTP_URL` seeds and extends the synthetic demo. A configured URL indexes Ethereum mainnet (chain id 1 unless `ALLOW_NON_MAINNET=true`). WebSocket `newHeads` is paired with an 8 second poll. BullMQ is used when `REDIS_URL` is set; otherwise blocks are ingested serially in the worker.
- Redis publishes `gasscope:block` after a live ingest. The API’s server-sent events are in-process and follow the store the API itself is reading. A Postgres deployment does not currently push those Redis messages into the API SSE stream; the UI also polls.

## Data

Postgres tables: `blocks`, `transactions`, `buckets`, `checkpoints`, `alert_rules`, `alert_firings`, `labels`, `schema_migrations`. Wei and gas are decimal text. Chart points are computed on read with `bucketize`. The `buckets` table is created and is not filled by the worker, so it is not a cache.

Receipts above 80,000 transactions in one request stay in SQL sums. Header math still uses every block. Per-transaction proof is withheld above that cap.

## Attribution

`packages/analytics` is pure TypeScript. A block’s base fee comes from its parent. Rankings are exclusive within one grouping (sender, top-level callee, category, or method). Categories and method names are inferred from a small local address book and known selectors. Missing matches stay unidentified. Counterfactuals are labelled `MODELLED`.

## Alerts

Rules and firings live in the API store (memory or Postgres). The worker evaluates enabled rules after a new head. The browser can display that history and can ask permission to show a notification for a firing the API already stored. Telegram sends only when `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set. `ALERT_EMAIL_WEBHOOK_URL` is not called by the worker or by the alert test.
