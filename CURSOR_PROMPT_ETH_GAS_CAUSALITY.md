# CURSOR MASTER BUILD PROMPT — ETHEREUM GAS CAUSALITY INTELLIGENCE

You are a principal Ethereum protocol engineer, senior backend/data engineer, product designer, visualization expert, and QA lead. Build a complete, production-minded, usable application called **GasScope — Ethereum Gas Intelligence**. Do not merely plan it; implement working end-to-end code, database schema, backend workers, frontend, charts, tests, documentation, and a reproducible local run setup. Make sensible implementation decisions autonomously. Avoid placeholder buttons, fabricated live metrics, nonfunctional tabs, or static fake explanations.

## 0. Core goal and non-negotiable truthfulness

A user must be able to choose a time window (5m, 15m, 30m, 1h, 3h, 6h, 12h, 24h, or arbitrary custom date-time range) and immediately understand:
- How much Ethereum execution gas BASE FEE changed (absolute and percent), including direction, peak, trough, and exact start/end timestamps.
- Which BLOCKS caused that change via the EIP-1559 parent-block algorithm, including dynamic gas target, usage vs target, and precise next-block impact.
- Which WALLETS, CALLED CONTRACTS, METHODS, and APPLICATION CATEGORIES actually consumed gas in those blocks, with shares, tx counts, success/failure, links to original transactions, and evidence.
- Whether a change in the displayed **estimated total transaction price** came from execution base fee, priority-tip conditions, or the estimator's sampling methodology.
- How much of the observed demand came from identified vs unknown activity, including uncertainty and missing data.
- What observable changes coincide with the gas price FALLING, e.g., lower gas usage, fewer target-exceeding blocks, reduced particular categories of activity.

DO NOT PROMISE ACCESS TO PEOPLE'S PRIVATE MOTIVES OR CLAIM A SINGLE USER "EXACTLY CAUSED" A NETWORK-WIDE GAS MOVE when evidence only shows contribution. Mathematical base-fee causation is exact and deterministic; classifying intents (bots, NFT campaign, MEV, attacks, token launch, arbitrage) is inferential unless supported by decoded on-chain data. Label findings **PROTOCOL-EXACT**, **OBSERVED ON-CHAIN**, **INFERRED (confidence and method)**, or **UNVERIFIED / UNKNOWN**. Show complete source/evidence and coverage. Never hallucinate explanation text, protocol identity, wallet ownership, value or volume. No unsupported 'AI says...' claims.

## 1. UX/product — beautiful, instantly understandable

Create a premium, ultra-polished Ethereum dark-mode monitoring terminal, **not a generic admin template**. Palette: near-black/navy background (#080C18), dark graphite surfaces, vivid Ethereum electric violet (#8B5CF6), icy/cyan blue (#60A5FA / #22D3EE), neutral text, muted accents, semantic green for falling costs and coral/red for rising costs (make labels clear even without color). Typography: crisp modern sans for UI, tabular monospaced numeric data; deliberate typography and spacing; attractive skeleton loading and subtle micro-interactions; high-quality empty/error states; excellent responsive desktop and mobile experience. No wallet connection, trading, crypto token promotions, or auto-trading.

Layout:
A. Persistent header: brand GasScope, **Ethereum Mainnet** network status, live/paused/reconnecting indicator, latest block, data last updated (seconds ago), provider/data coverage, time-zone selector (default **America/New_York**), theme and settings.
B. Clear navigation: **Overview**, **Why Gas Changed**, **Top Drivers**, **Block Explorer**, **Historical Analysis**, **Alerts**, **Sources & Methodology**, **Settings**. All pages functional and URL-shareable with selected intervals and filters.
C. Large HERO "Gas Right Now" with live execution base fee (gwei), estimated Standard/Fast/High priority total price (gwei), 5m/15m/1h delta and arrows, average utilization relative to the dynamic gas **target**, recent block fullness, priority fees, estimated simple ETH transfer cost, and optional separate blob gas price. Every tile has timestamp, definition tooltip, and change vs comparable previous window. Mark estimates as estimates.
D. A full-width intelligent status ribbon: examples "Base fee ↑ 38% over last 15m | 42/75 blocks above target | verified top driver: [wallet] | 96% receipt coverage" or "Base fee ↓ | below-target blocks dominate | previous NFT order burst has subsided". Text derived from actual analytics, never preset values.
E. **Range toolbar** with one-click presets 5m, 15m, 30m, 1h, 3h, 6h, 12h, 24h, 7d (7d may use aggregates), custom absolute start/end date + time, timezone, sliding/live vs fixed historical interval, data resolution selectors (per-block, 1m, 5m, 15m, auto), compare previous equal-length interval, share URL, refresh, export CSV/JSON/PNG if implemented correctly. Distinguish WINDOW length from CHART BUCKET resolution. Handle UTC internally and DST correctly.
F. Main synchronized visualization canvas:
   1. Executed BASE FEE line/area chart with time axis, auto scale, tooltip per block, colored rise/fall segments, current price, prior comparable-window overlay, annotations at meaningful events, zoom/brush and click-to-inspect block.
   2. Synced BLOCK GAS USAGE chart as bars showing `gasUsed / blockGasTarget` with a clear 100%-of-target line and separately `gasUsed / gasLimit`; allow dynamic gas limit; color blocks over/under target; avoid labeling a block at 60% of maximum limit as 'below target'.
   3. Priority-tip percentiles chart and estimated total-fee chart, separate from base fee.
   4. Optional blob base fee/blob utilization chart in its own panel; do NOT conflate blob gas with execution gas.
   5. Activity heatmap by minute x category or time x address, real top drivers not fake.
   Crosshair tooltip shows UTC/local timestamp, block #, base fee, previous/next-base-fee changes, gas used, target, percentages, tx count, tips p10/p50/p90, main contributing categories and data coverage. Chart must remain readable at low fees (e.g. 0.02 gwei), large spikes, and dense historical ranges.
G. Directly beneath charts, a large **"WHY DID GAS MOVE?"** analysis with one-sentence plain-English verdict, 3–6 ranked evidence-backed causes, plus "what changed compared with previous window". For each driver show category/wallet/contract, % of ACTUAL execution gas used, number and kinds of transactions, timing, its connection to above-target vs below-target blocks, fee share where relevant, exact Etherscan and trace links, **PROTOCOL-EXACT / OBSERVED / INFERRED** confidence labels, and a "View proof" expandable transaction list. If total contribution does not fully explain demand, display Unknown/Unclassified prominently.
H. "Top Gas CONSUMERS" leaderboard ranked by **gas used** separately from "Top Gas SPENDERS" ranked by **ETH transaction fees paid**. Both have columns: rank, sender/address (public name if verified), category, gas used, share, txs, avg gas/tx, priority fees paid, burnt execution fees, failed gas consumption, newest/earliest transaction, trend vs preceding window, and external links. Add **Top Called Contracts**, **Top Methods**, **Top Activity Categories** separately. NEVER confuse `from` transaction sender with called contract `to`, and never double-count a transaction across multiple contracts in an exclusive gas-use chart.
I. "Critical Events" activity feed ordered by time: gas spike, gas drop, an unusually gas-heavy tx, repeated method burst, large failed transaction batch, block-gas-target crossing, top wallet suddenly appearing, protocol/activity shift, receipt gaps/reorg. Selecting an event jumps all charts and opens evidence.
J. "Investigate any wallet / tx / block" search field supporting Ethereum address, tx hash, block number and selected time span. Give an actual transaction breakdown; display method signature and decoded method only when ABI/4byte evidence supports; when unknown say "Unidentified method 0x..."; surface reverted transactions as gas consuming. Search bar must work with pasted Etherscan address or tx URL too.
K. "How fees work" educational drilldown showing base fee mechanism and current block examples, with clear explanation for nontechnical users. An intuitive stacked visual shows **fee paid = execution base fee burned + priority fee paid + blob fee (when applicable)**, while noting ETH transferred in transaction is NOT a gas fee.
L. Optional alerts with threshold and event-type rules, notifications in app/browser (permission required), Telegram webhook/bot/email integration only if configured. Alerts must be persistent, deduplicated and testable. No real credentials in code.

Make high-density yet spacious layouts at ≥1440px, correctly flow for 1024px tablets and 390px phones. Accessible color contrast, keyboard navigation, meaningful tooltips, reduced-motion support, click/hover/focus states, reusable components. Avoid cropped content, overlapping charts, broken route links, horizontal-scroll bugs, or imaginary stats.

## 2. Exactly how to calculate gas fee change

Use real Ethereum L1 mainnet JSON-RPC. Sources of truth are actual canonical block headers, full block transactions, and receipts. Required calls:
- `eth_chainId` verify chain 1, `eth_blockNumber`, `eth_getBlockByNumber` or hash with full tx objects, `eth_getBlockReceipts` if provider supports it; fall back to batched `eth_getTransactionReceipt` calls safely with rate limits; optionally `eth_feeHistory` for percentile corroboration.
- `eth_subscribe` / `newHeads` via WebSocket with polling fallback; websockets reconnect and backfill missed blocks; never equate a new-header event with a complete indexed block.
- Optional third-party explorer/label APIs for enrichment only (Etherscan v2, Blockscout), ABI for verified contracts, curated signatures/protocol registry and optional trace APIs. Explorer gas-spender charts are NOT the authoritative source of execution gas or block causality.
- Optional traces (`trace_block`, `debug_traceBlockByNumber`, etc.) only if the configured provider actually supports them, and only for user-requested/high-impact transactions. Disable gracefully when unsupported. Do NOT assume tracing is cheap, ubiquitous, or available on free RPC.

EIP-1559 derivation **MUST match Ethereum integer math**, not a rounded floating approximation:
For each **parent** block P, target = `P.gasLimit / 2` with integer division (protocol upgrade exceptions determined by actual fork rules if analyzing pre-London/hard-fork boundaries; modern windows use EIP-1559 standard). `P.baseFeePerGas` in wei, `P.gasUsed` in integer units.
- If gasUsed == target, next base fee = parent base fee.
- If gasUsed > target, `delta = max(1 wei, floor(floor(parentBaseFeeWei * (gasUsed-target) / target) / 8))`; next base fee = parent base fee + delta.
- If gasUsed < target, `delta = floor(floor(parentBaseFeeWei * (target-gasUsed) / target) / 8)`; next base fee = parent base fee - delta.
Use **BigInt** for wei, all fee totals, and integer math; do not serialize BigInt directly into JSON—serialize as decimal strings. Verify calculated child block fee equals on-chain child `baseFeePerGas` and surface discrepancies or fork-boundary caveats.
Use *parent's target*, not a hardcoded 15M/30M/60M. Modern Ethereum blocks can have ~60M gas **limit** with ~30M gas **target**, but query live dynamic limits; these are NOT interchangeable. A parent block's usage affects the NEXT block's execution base fee, never that parent's already-determined base fee.

Fee math for transaction T in block B:
- `executionFeeWei = receipt.gasUsed * receipt.effectiveGasPrice`.
- `baseBurnWei = receipt.gasUsed * block.baseFeePerGas`.
- `tipWei = receipt.gasUsed * max(receipt.effectiveGasPrice - block.baseFeePerGas, 0)` (legacy txs still need consistent effective-fee handling).
- For blob txs where receipt fields available, `blobFeeWei = receipt.blobGasUsed * receipt.blobGasPrice`, displayed SEPARATELY (and do not count blob gas in execution block gasUsed or count its burn twice).
- Failed/reverted transactions DO consume actual gas and must be included.
- A `gasLimit` is the upper bound, NOT actual gas used; use receipt `gasUsed`.
- `maxFeePerGas` is the cap, NOT necessarily actual price paid; use `effectiveGasPrice`.
- Priority-tip estimates and Standard/Fast/High fee suggestions must be labeled as estimates with documented percentile/window methodology, and distinguish them from directly observed historical effective prices.
- Support type 0/1/2/3/4 modern transaction types without assuming all have the same fields. If novel fields appear, handle them safely and mark unsupported types as partial classification rather than crash.

Window statistics:
- base fee at first/last observed canonical block and absolute delta (gwei) and relative delta %, with zero-baseline protection.
- maximum/minimum, volatility, largest per-block increase/decrease, time above specified fee threshold, blocks above/under dynamic target, target-weighted occupancy `(sum gasUsed)/(sum target)`, full `gasUsed/gasLimit` separately, cumulative burned ETH, cumulative tips ETH, realized fee distribution, tx counts, failure and revert gas share.
- Compare current window to immediately preceding equal-length window with precisely defined [start,end) boundaries. Distinguish block timestamp from receipt update/ingestion time. Never silently include out-of-window blocks.
- Gaps/missing receipts, incomplete historical indexing, and stale provider data must be called out with a coverage percentage. Disable definitive "top driver" rankings if less than comprehensive receipt coverage; mark partial results accordingly. Show data freshness and indexing progress for custom historic intervals.

## 3. Attribution engine: why fees rose/fell

Build a separate, independently testable analytics package that returns structured JSON evidence. It should perform:

A. **Exact protocol explanation per block**: determine if parent above or below target; gas used and target; integer formula; exact predicted next-base-fee change in wei/gwei/%; show verifiable parent/child block links. Aggregate the exact sequence over the chosen time window. The structural primary reason for an increasing base fee is above-target execution gas in preceding blocks; for decreasing, below-target blocks.

B. **Measurable contributors**: from receipts, attribute each transaction's execution gas to the actual `from` wallet **exactly once**. Rank accounts by gas used in the target time window, with count, fees, failed gas. Separately, aggregate by direct `to` contract, known protocol/app label and method signature. Unknown category remains Unknown. When internal traces are absent, never claim you know an internal callee's actual gas share. For contract paths with traces, either use disjoint exclusive attribution or explicitly label multi-touch interaction counts and do NOT sum them as gas fractions. Build a category registry and adapters for common protocol fingerprints (DEX swaps including Uniswap v2/v3/v4, NFT marketplace/Seaport, bridge, ERC-20 transfers, ERC-4337 bundlers, contract deployment, ERC-7702 authorization-related transactions, token mint, lending, stablecoin, infrastructure, unknown). Recognize confirmed category from verified contract address+function ABI/event patterns; a single selector collision is not full proof. MEV/arbitrage, liquidations, phishing and spam require evidence and cautious classifications.

C. **Contextual contributions**: relate high gas-consuming wallets/protocols to the time blocks were ABOVE target; show `gasUsed`, share of each block's used gas, and share of selected window's total execution gas. Contrast previous equal-length window by category, address and method. Treat "largest gas spender in ETH" differently from "largest gas consumer in gas units" and from "top priority fee payer".

D. **Counterfactual sensitivity (explicitly modeled, NOT exact-world certainty)**: for selected wallet/transaction in a specific block, calculate how removing its `receipt.gasUsed` while holding other observed gas usage fixed would alter the deterministic NEXT block base fee; show `observedNextBaseFee` and `modeledNextBaseFee`, with note that exclusion could change which other transactions are included. For a custom interval optionally simulate a static-demand counterfactual across all blocks by replaying basefee from interval start with selected sender's gas removed per block, holding the other included gas usage unchanged. Label results **MODELLED / NOT REAL-WORLD CAUSAL PROOF**. Never add independently calculated wallet counterfactual savings as though additive; overlap and substitution matter. Include a "could this tx have flipped the block from >target to <target?" exact fixed-block check.

E. **Fee-estimator decomposition**: if the displayed suggested gas price rose while base fee remained flat, explain that priority-tip estimates/percentiles or the chosen estimator changed. Never assert gas-price rise always means higher on-chain base fee. For blob fee moves, calculate blob dynamics separately according to the correct current-fork parameters obtained from chain specs (not old 2024 constants), or mark unavailable.

F. **Human-readable explanation** generated DETERMINISTICALLY from structured evidence. E.g. "Execution base fee rose 22.4% because 37 of 61 preceding blocks consumed more gas than the dynamic target. Verified NFT order cancellations consumed 14.2% of the interval's gas; 26.0% remains unclassified. These activities contributed to congestion, but no single wallet can be proven solely responsible." For a falling period say what activity declined with evidence; do not fabricate cause if classification is weak.

The API analysis response includes `startUtc`, `endUtc`, block ranges, `coverage`, raw metrics, an ordered list of `evidence` objects with block/tx hashes, severity, classification/confidence, provenance source and time, verdict text, per-block exact math checks, rankings, and chart buckets. Every explanation statement must have traceable evidence IDs.

## 4. Architecture and data ingestion (real implementation)

Build a pnpm monorepo with:
- `apps/web`: latest stable **Next.js App Router + React + TypeScript**, Tailwind CSS + shadcn/ui + Lucide icons, responsive, accessible, dark default, Apache ECharts (client-only wrapper) or similarly performant interactive chart engine, TanStack Query.
- `apps/api`: **Fastify TypeScript** backend for typed REST APIs + Server-Sent Events for realtime stream; REST input validation using Zod / OpenAPI docs; API versioning; CORS only trusted origins; share normalized types with web.
- `apps/worker`: persistent Node.js/TypeScript Ethereum indexer and alert worker, connected to RPC/WebSocket, BullMQ + Redis for retries/backfills, robust checkpoints and reorg handling. Worker MUST keep running independently of browser and serverless request lifecycle. Queue retries/backoff, rate limiting, duplicate suppression, concurrent receipt batches with bounds.
- `packages/analytics`: pure TypeScript protocol math and attribution engine, well-tested with real on-chain fixtures.
- `packages/shared`: schemas, types, RPC adapters, useful utilities.
- PostgreSQL + Drizzle ORM and migrations for canonical blocks, transactions/receipt summary, gas category tags, sender metadata, alert rules/firings, ingestion checkpoints and coverage, analysis snapshots/time buckets. Indices on block number/hash, timestamp, `from`, `to`, method signature, gas used and categories. Use efficient range pagination and summary materialization; document retention/backfill tradeoffs.
- Redis for ingestion queues/caches/live invalidation; Docker Compose for local `web`, `api`, `worker`, `postgres`, `redis`; health probes and proper startup migration.

Backend pipeline:
1. On startup, verify Ethereum mainnet chain ID and RPC capabilities (`eth_getBlockReceipts`, `eth_feeHistory`, WebSocket). Show actual capability status in Sources settings. Do not embed credentials in browser.
2. Backfill a configurable lookback (default at least last 24 hours at **full transaction/receipt coverage** if provider permits); display progress and expected API cost warning rather than claim "instant" unavailable history. For 7d+ support indexed aggregates, and explicit on-demand deeper backfills. Never claim complete custom history without data.
3. Connect `newHeads`, fetch canonical full block, receipts, validate number/hash and gas consistency, calculate per-tx stats and categorized activity, store with idempotent upserts, build 1m/5m/15m/hour buckets, publish SSE events.
4. On WebSocket downtime, switch to safe polling; on reconnection, fill every missing block by height. Reconcile parent hash; handle chain reorganizations by rolling back orphaned blocks and their transactions/buckets and recomputing metrics. Mark latest unsafe vs safe/finalized confirmation status.
5. Use configurable backpressure, bounded jobs and batches, 429/5xx exponential retries with jitter, request timeouts, provider failover, sane CPU/memory and DB retention. Never make 1 RPC per tx when `eth_getBlockReceipts` is available. Limit rate according to service capabilities and expose current request counts, errors, delayed head and completeness.
6. Maintain *source-of-truth facts* separately from enrichment labels. Labels cached with TTL, chain/version attribution, and verified provenance. Avoid reliance on scraping Etherscan website. Etherscan/Blockscout integrations are optional for public labels only, not the sole route to core functionality.
7. All historical and live output uses actual data, except an explicit **Demo data** mode from labelled fixtures if RPC is not configured. Demo mode banner MUST remain visible and never mislead users into thinking fake data is live.
8. Provide `.env.example` for `ETH_RPC_HTTP_URL`, `ETH_RPC_WS_URL`, optional fallback HTTP RPC, optional explorer API keys, `DATABASE_URL`, `REDIS_URL`, `INTERNAL_API_SECRET`, optional alert credentials and `NEXT_PUBLIC_API_BASE_URL`. Include clear security instructions and ensure keys never leak to HTML bundles or git.
9. Handle BigInt storage/JSON serialization and gwei formatting exactly. UTC storage, configurable UI timezone.

APIs (actually implement, document and test):
- `GET /api/v1/status` — chain, latest block, indexed height, provider health/capabilities, ingestion lag, completeness, demo vs live.
- `GET /api/v1/gas/current` — execution basefee, observed recent priority fees, Standard/Fast estimate metadata, blob separate.
- `GET /api/v1/analysis?from=ISO&to=ISO&bucket=block|1m|5m|15m|auto&compare=true` — metrics + exact protocol explanation + attribution/ranked evidence.
- `GET /api/v1/chart?from=...&to=...&resolution=...&metric=...` — bucket data and data quality.
- `GET /api/v1/drivers?from=...&to=...&groupBy=sender|contract|category|method&sort=gasUsed|fees|txCount&cursor=...`.
- `GET /api/v1/blocks/:number` and `GET /api/v1/transactions/:hash` — evidence, references and details.
- `GET /api/v1/address/:address?from=...&to=...` — wallet activity breakdown.
- `POST /api/v1/sensitivity` — bounded static-usage counterfactual with assumption banners.
- CRUD for alerts and notification settings (use secure server-side configuration) and `GET /api/v1/events/stream` via SSE.
- `GET /api/v1/methodology` — definitions, formula version, coverage.
- Validate intervals and limits; cap expensive arbitrary ranges; provide actionable errors and backfill requests if data unavailable.

## 5. Drilldowns and forensic workflow

Selecting any chart spike should open a side panel with:
- Exact rise/fall start/end in gwei and percent, previous and next blocks.
- Top 10 blocks by excess-over-target usage and exact impact on NEXT block base fee.
- Top gas consuming senders and top direct contracts for that spike; gas share, fee share and time.
- What those transactions **did** based on verified ABI/method, not wallet labels alone; inspect event logs and optional traces.
- Reverted/failed activity and suspected repeated automation flagged by cadence but without claims of identity.
- One-click "Open Etherscan" tx/block/address URLs and "Copy evidence" structured summary.
- Comparison to preceding baseline.
- Non-technical summary, technical formula expansion, coverage/unknowns.

Include a regression/demo investigation fixture from a real prior block:
Ethereum block **26330059**, observed block gasUsed **32,928,976**, block gasLimit **60,000,000**, baseFeePerGas **48,571,925 wei**. A recorded transaction `0xa45a0cfe5f4be90bb22d9d772cee7e3ceda55853c859b502529e713e0a412ecb` from `0x062f05CD6c835677B05a8658A351969476861316` consumed **9,480,430** gas and called `0xF3E54a1FDA3d4351C8BD5065678c0F5DDD0D7BCB` selector `0x6ceef480`. This transaction consumed about 28.79% of the block's used gas; removing it in a static counterfactual would leave 23,448,546 gas, below the 30M target. Another wallet `0x33AAEC8F773a0023f929eb075dc68053B6C4F5ED` was observed making repeated Seaport contract `cancel` calls to `0x0000000000000068F116a894984e2DB1123eB395`. These are evidence examples/fixtures, NOT live data and NOT full causal proof. Verify the RPC values independently when connected. Fixture must test high single-transaction gas usage, next-block base-fee math and the difference between gas spent vs activity semantics. Do not hardcode these examples in the live headline or as recurring events.

## 6. Design system / screen implementation details

Use a sophisticated asymmetric desktop grid with left navigation and content width ~1400–1700px. Put absolute gas-price information at top, a two-row highly readable synchronized chart workspace, and the explanation beside or directly below it. Dashboard should communicate "rising / falling / stable" in under two seconds. Build modular cards, chart legends, segmented metric controls, data-quality chips (not confusing success status), deep linkable incident panels, progressive disclosure for forensic detail, and a real Settings / Providers / Methodology page. Include searchable/filterable leaderboard tables with client/server pagination, column labels and accurate units. Format small gwei values with adequate precision (NOT rounded to zero); tooltips with exact wei; ETH totals and USD only when timestamped ETH/USD price provider exists, and stale USD quotes clearly marked. Avoid fake fiat prices.

Charts must support mouse wheel/drag zoom, reset, synced vertical crosshair, comparison overlay, event annotations, keyboard accessible data table alternative, snapshot export if available, fluid updates without jitter, and adaptive bucketing so 24h or 7d doesn't attempt to render millions of raw transaction markers.

## 7. Alerting

Implement configurable alert types: execution basefee >/< specified gwei continuously for specified minutes; rise/fall > chosen percent over selected interval; N consecutive above/below-target blocks; a wallet/category consumes > chosen percentage of gas in last 5m; unexpectedly large individual gas transaction; indexing stale. Provide one event per qualifying episode, dedupe, reset/hysteresis, cooldown, confirm delivery only after success, event history, alert test mode. Optional Web Push/browser notification (with user permission) and Telegram/email through configured provider; credentials server-side. Implement durable scheduling/checks in worker, not client browser timers.

## 8. Performance, security, observability and QA

Performance: reasonable first meaningful paint on cached queries; design p95 query goal < 2 s for indexed 24h interval and responsive chart interactions on a modern desktop. Stream updates per indexed block (~12s on mainnet), avoid re-fetching all txs every 5s. Use DB indices, materialized buckets, partitioning/retention and explain cost. Correctness is more important than impressive fake speed.

Security: read-only on-chain analysis, no transaction signing/wallet access, strong Zod validation and max query-window/counterfactual limits, API rate limits, SSRF-safe URL handling, environment-only provider secrets, no public arbitrary RPC proxy, no explorer HTML scraping as core pipeline, sanitized text labels, secrets excluded from logs, CORS/CSRF protections where necessary. Add basic app abuse controls for public deployments.

Testing with Vitest plus integration tests and Playwright browser E2E:
- EIP-1559 exact BigInt base-fee transitions: below/equal/above target, full/empty blocks, extremely low basefee 1-wei minimum upward step, non-default gas limit, integer rounding and observed child-fee equality.
- Fee decomposition and ETH burn vs tips; failed transactions charged; blob fees separated; type 0/2/3/4 normalization; no gasLimit mistaken for gasUsed.
- Aggregate percentages sum correctly only in exclusive sender/category views; direct contract views clearly independent; no double counting.
- Reorg rollback, duplicate block notifications, missing receipts, rate limits, websocket outage, backfill, incomplete data coverage, invalid custom intervals, DST handling and 0%/negative/basefee zero division guards.
- Alert dedup/reset and threshold persistence.
- End-to-end switch from live to custom 15m and back, inspect a chart point, click wallet, open proof link, analyze a falling period, and verify responsive layout at 390px/1024px/1440px.
- At least one end-to-end working case without credentials via obviously labelled Demo fixture; live works when a user supplies valid RPC URLs.

Provide useful structured logging, request and ingestion error metrics, clear provider-error messages, `/healthz`, `/readyz`, and dashboard ingestion/data coverage status. Never silently show outdated data as "LIVE".

## 9. Build plan — execute, don't stop at proposal

1. Create full monorepo, lockfile, apps/packages, config, docker-compose, .env.example, migrations, schema, docs.
2. Implement pure protocol math + tests, Ethereum data adapter, ingestion, receipts, database, reconnection/reorg/backfill and analyzer.
3. Implement REST API and SSE with validated request/response schemas and actual data quality metadata.
4. Build polished, fully functioning interface, all navigation screens, charts, analysis, drilldowns, responsive mobile, input controls, keyboard UX.
5. Implement enrichment, documented category classifier, optional traces, contextual explanations and modeled counterfactual, robust coverage behavior.
6. Add alert engine, settings, source transparency, demo mode.
7. Add real tests/fixtures, fix errors and run lint, typecheck, unit tests, integration tests, E2E, production build; inspect screenshots in browser if browser automation exists; repair visual problems.
8. Finish with exact local commands (`cp .env.example .env`, configure RPC, `docker compose up --build`, migrations if not automatic, app URLs), service deployment instructions (API and persistent worker must not live solely in ephemeral serverless functions), architecture summary, API/provider cost caveat, and an honest checklist of **working** vs **not implemented / requires paid provider** features. Do not claim tests passed unless actually run. Never paste fake test results.

## 10. Completion acceptance criteria

- With a real mainnet RPC, the dashboard indexes new blocks and updates live, detects gas fee rise AND fall, and explains them using exact EIP-1559 parent block calculations and observed real tx consumption.
- Every interval preset and custom interval actually queries/filter data; charts and explanations update consistently and are not hardcoded.
- A user can click the most important change, identify the top actual gas-consuming wallets/contract interactions, see exact tx and block evidence, and distinguish proven data from suspected intent.
- Gas consumers and gas spenders are visibly separate; base fee, tip, and blob fee are visibly distinct.
- Missing provider API capability, insufficient backfill, gaps, stale data or low-confidence labels are transparent.
- The UI looks like a premium real-time intelligence product, not a default CRUD dashboard, and it works on mobile.
- Demo and live data are unambiguously distinguishable. No broken buttons, fake links or unresolved placeholder controls.

Official technical references to follow (check current live spec/provider details rather than hardcoding obsolete constants):
- EIP-1559: https://eips.ethereum.org/EIPS/eip-1559
- Ethereum gas technical overview: https://ethereum.org/developers/docs/gas/
- Ethereum Execution API `eth_getBlockReceipts`: https://ethereum.github.io/execution-apis/api/methods/eth_getBlockReceipts/
- Ethereum Execution API `eth_feeHistory`: https://ethereum.github.io/execution-apis/api/methods/eth_feeHistory/
- EIP-4844 blob fee accounting: https://eips.ethereum.org/EIPS/eip-4844
- Ethereum protocol upgrades: https://ethereum.org/roadmap/fusaka/
- Etherscan API v2 documentation: https://docs.etherscan.io/

Now implement the entire application. Work autonomously through all stages. Start by creating a concrete file structure and critical working data path; continue with implementation and verification. Do not stop at a plan or ask for UI preferences that are already specified. Produce production-quality code with integrity and excellent UX.
