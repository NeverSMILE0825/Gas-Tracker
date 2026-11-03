import { appendDemoBlock, buildDemoHistory, evaluateAlert, executionTarget, reorgWalkFrom, rollup } from '@gasscope/analytics'
import { GasRepository, loadRootEnv, type CheckpointMeta } from '@gasscope/db'

loadRootEnv()
import { Queue, Worker } from 'bullmq'
import IORedis from 'ioredis'
import { normalizeBlock } from './normalize'
import { redactHost, RpcClient } from './rpc'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for the worker')

const repo = GasRepository.connect(databaseUrl)
await repo.migrate()

if (!process.env.ETH_RPC_HTTP_URL) {
  await runDemo()
} else {
  await runLive()
}

async function runDemo() {
  const hours = Number(process.env.DEMO_HOURS ?? 12)
  const seed = Number(process.env.DEMO_SEED ?? 1559)
  const existing = await repo.indexedRange()
  if (existing.latest && !existing.latest.synthetic) {
    throw new Error('Database already holds mainnet blocks. Refusing to mix in synthetic demo blocks.')
  }
  let history = buildDemoHistory({ hours, seed, endSec: Math.floor(Date.now() / 1000) - 6 })
  if (!existing.latest) {
    console.log(`Seeding ${history.blocks.length} synthetic blocks`)
    for (const block of history.blocks) {
      const txs = history.txs.filter((tx) => tx.blockNumber === block.number)
      await repo.upsertBlock(block, txs)
    }
  } else {
    history = buildDemoHistory({ hours: 0.05, seed, endSec: existing.latest.timestamp })
    history.blocks.splice(0, history.blocks.length, existing.latest)
    history.seriesLength = Math.round((hours * 3600) / 12)
  }
  await writeMeta({ mode: 'demo', synthetic: true, chainId: null, networkName: 'Demo chain (synthetic)', ws: 'unused' })
  console.log('Demo worker is appending a synthetic block every 12s')
  setInterval(() => {
    void (async () => {
      const next = appendDemoBlock(history)
      history.blocks.push(next.block)
      history.txs.push(...next.txs)
      await repo.upsertBlock(next.block, next.txs)
      await repo.writeCheckpoint(next.block.number, next.block.hash, await meta({ mode: 'demo', synthetic: true, chainId: null, networkName: 'Demo chain (synthetic)', ws: 'unused' }))
      await checkAlerts(false)
    })().catch((error) => console.error(error instanceof Error ? error.message : error))
  }, 12_000)
}

async function runLive() {
  const publisher = process.env.REDIS_URL ? new IORedis(process.env.REDIS_URL) : null
  const urls = [process.env.ETH_RPC_HTTP_URL, process.env.ETH_RPC_HTTP_FALLBACK_URL].filter((url): url is string => Boolean(url))
  const rpc = new RpcClient(urls, Number(process.env.RPC_TIMEOUT_MS ?? 20_000), Number(process.env.RPC_MAX_CONCURRENCY ?? 3))
  const chainId = await rpc.chainId()
  if (chainId !== 1 && process.env.ALLOW_NON_MAINNET !== 'true') {
    throw new Error(`RPC chain id is ${chainId}, not Ethereum mainnet (1). Refusing to index.`)
  }
  await rpc.probe(process.env.TRACE_ENABLED === 'true')
  console.log(`Mainnet RPC hosts: ${urls.map(redactHost).join(', ')} receipts=${String(rpc.receiptsSupported)} feeHistory=${String(rpc.feeHistorySupported)}`)
  const hours = Number(process.env.BACKFILL_HOURS ?? 24)
  const head = await rpc.blockNumber()
  const lookback = Math.round((hours * 3600) / 12)
  console.warn(`Backfill target is about ${lookback} blocks (~${hours}h). That is one header plus receipts per block.`)
  const indexed = (await repo.indexedRange()).latest?.number ?? head - lookback
  let cursor = Math.max(1, Math.min(head, indexed + 1))
  const redisUrl = process.env.REDIS_URL
  let wsState: 'up' | 'down' | 'unused' = process.env.ETH_RPC_WS_URL ? 'down' : 'unused'

  const ingest = async (number: number, historical: boolean) => {
    const raw = await rpc.getBlock(number)
    if (!raw) return
    const receipts = (await rpc.getReceipts(number, raw.transactions.map((tx) => tx.hash))) as Parameters<typeof normalizeBlock>[1]
    const normalized = normalizeBlock(raw, receipts)
    const parent = await repo.blockByNumber(number - 1)
    const walk = reorgWalkFrom(parent ? { number: parent.number, hash: parent.hash } : null, {
      number: normalized.block.number,
      parentHash: normalized.block.parentHash,
    })
    if (walk !== null) {
      let ancestor = walk
      for (let n = walk; n >= walk - 64 && n > 0; n--) {
        const stored = await repo.blockByNumber(n)
        if (!stored) break
        const remote = await rpc.getBlock(n)
        if (remote && stored.hash === remote.hash.toLowerCase()) {
          ancestor = n
          break
        }
        ancestor = n - 1
      }
      console.warn(`Reorg detected. Dropping canonical blocks after ${ancestor}`)
      await repo.deleteFrom(ancestor + 1)
      cursor = ancestor + 1
      return
    }
    await repo.upsertBlock(normalized.block, normalized.txs)
    const safe = historical ? null : await rpc.taggedNumber('safe').catch(() => null)
    const finalized = historical ? null : await rpc.taggedNumber('finalized').catch(() => null)
    await repo.writeCheckpoint(normalized.block.number, normalized.block.hash, await meta({
      mode: 'live',
      synthetic: false,
      chainId,
      networkName: 'Ethereum Mainnet',
      ws: wsState,
      safeBlock: safe,
      finalizedBlock: finalized,
      httpConfigured: true,
      wsConfigured: Boolean(process.env.ETH_RPC_WS_URL),
      fallbackConfigured: Boolean(process.env.ETH_RPC_HTTP_FALLBACK_URL),
      backfillTarget: lookback,
      backfillCompleted: Math.max(0, normalized.block.number - (head - lookback)),
      backfillInProgress: normalized.block.number < head,
      lagSeconds: Math.max(0, Math.floor(Date.now() / 1000) - normalized.block.timestamp),
    }, rpc))
    if (!historical) await checkAlerts(false)
    if (publisher) {
      await publisher.publish('gasscope:block', JSON.stringify({ number: normalized.block.number, baseFee: normalized.block.baseFeePerGas.toString() }))
    }
  }

  async function addBlock(queue: Queue, number: number, historical: boolean) {
    try {
      await queue.add(
        'block',
        { number, historical },
        { jobId: `b-${number}`, removeOnComplete: 1000, attempts: 5, backoff: { type: 'exponential', delay: 1000 } },
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/already exists|Job is already/i.test(message)) return
      throw error
    }
  }

  if (redisUrl) {
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null })
    const workerConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null })
    const queue = new Queue('gasscope-blocks', { connection })
    new Worker('gasscope-blocks', async (job) => ingest(job.data.number as number, Boolean(job.data.historical)), {
      connection: workerConnection,
      concurrency: 1,
      limiter: { max: 4, duration: 1000 },
    })
    for (let number = cursor; number <= head; number++) {
      await addBlock(queue, number, number < head)
    }
    follow(async (number) => {
      await addBlock(queue, number, false)
    })
  } else {
    console.warn('REDIS_URL is unset. Live ingestion will run serially in this process instead of BullMQ.')
    for (let number = cursor; number <= head; number++) {
      await ingest(number, number < head)
      cursor = number + 1
    }
    follow(async (number) => {
      if (number >= cursor) {
        await ingest(number, false)
        cursor = number + 1
      }
    })
  }

  function follow(enqueue: (number: number) => Promise<void>) {
    const poll = async () => {
      const next = await rpc.blockNumber().catch(() => null)
      if (next && next >= cursor) await enqueue(next).catch((error) => console.error(error instanceof Error ? error.message : error))
    }
    setInterval(() => void poll(), 8000)
    const wsUrl = process.env.ETH_RPC_WS_URL
    if (!wsUrl || typeof WebSocket === 'undefined') return
    const connect = () => {
      const ws = new WebSocket(wsUrl)
      ws.addEventListener('open', () => {
        wsState = 'up'
        ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_subscribe', params: ['newHeads'] }))
      })
      ws.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as { params?: { result?: { number?: string } } }
        const hex = message.params?.result?.number
        if (!hex) return
        void enqueue(Number(BigInt(hex))).catch((error) => console.error(error instanceof Error ? error.message : error))
      })
      ws.addEventListener('close', () => {
        wsState = 'down'
        setTimeout(connect, 3000)
      })
    }
    connect()
  }
}

async function checkAlerts(synthetic: boolean) {
  const rules = await repo.listAlerts()
  if (rules.length === 0) return
  const latest = (await repo.indexedRange()).latest
  if (!latest) return
  const blocks = await repo.recentBlocks(40)
  const txs = await repo.txsBetween(blocks[0]?.timestamp ?? latest.timestamp, latest.timestamp + 1)
  const five = txs.filter((tx) => tx.timestamp >= latest.timestamp - 300)
  const rolled = rollup(blocks.filter((block) => block.timestamp >= latest.timestamp - 300), five)
  const total = rolled.totals.gasUsed
  const heavy = rolled.heavy[0]
  for (const rule of rules) {
    const active = await repo.activeFiring(rule.id)
    const wanted = String((rule.config as { address?: string }).address ?? '').toLowerCase()
    const match = rolled.rows.sender.find((row) => row.key.toLowerCase() === wanted)
    const decision = evaluateAlert(
      { id: rule.id, kind: rule.kind as never, enabled: rule.enabled, cooldownSec: rule.cooldownSec, config: rule.config as never },
      {
        nowSec: Math.floor(Date.now() / 1000),
        synthetic,
        blocks: blocks.map((block) => ({ number: block.number, timestamp: block.timestamp, baseFeePerGas: block.baseFeePerGas, aboveTarget: block.gasUsed > executionTarget(block.gasLimit) })),
        share: match && total > 0n ? { key: wanted, share: Number((match.gasUsed * 1_000_000n) / total) / 1_000_000, windowSec: 300 } : undefined,
        largeTx: heavy ? { hash: heavy.hash, gasUsed: heavy.gasUsed, blockNumber: heavy.blockNumber } : undefined,
        lagSeconds: Math.max(0, Math.floor(Date.now() / 1000) - latest.timestamp),
      },
      active ? { dedupeKey: active.dedupeKey, firedAtSec: Math.floor(Date.parse(active.firedAt) / 1000), resolvedAtSec: null } : null,
    )
    if (decision.action === 'fire') {
      await repo.insertFiring({
        id: crypto.randomUUID(),
        ruleId: rule.id,
        dedupeKey: decision.dedupeKey,
        firedAt: new Date().toISOString(),
        resolvedAt: null,
        payload: decision.payload,
        delivery: await deliver(rule.name, decision.payload),
      })
    } else if (decision.action === 'resolve') {
      await repo.resolveFiring(rule.id, decision.dedupeKey)
    }
  }
}

async function deliver(name: string, payload: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chat = process.env.TELEGRAM_CHAT_ID
  if (!token || !chat) return { telegram: 'skipped: not configured' }
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: `GasScope ${name}: ${JSON.stringify(payload)}` }),
  })
  return { telegram: response.ok ? 'sent' : `failed ${response.status}` }
}

async function meta(partial: Partial<CheckpointMeta> & Pick<CheckpointMeta, 'mode' | 'synthetic' | 'chainId' | 'networkName' | 'ws'>, rpc?: RpcClient): Promise<CheckpointMeta> {
  return {
    mode: partial.mode,
    chainId: partial.chainId,
    networkName: partial.networkName,
    synthetic: partial.synthetic,
    ws: partial.ws,
    lagSeconds: partial.lagSeconds ?? 0,
    capabilities: {
      eth_getBlockReceipts: rpc?.receiptsSupported ?? null,
      eth_feeHistory: rpc?.feeHistorySupported ?? null,
      trace: rpc?.traceSupported ?? null,
    },
    requestCount: rpc?.requestCount ?? 0,
    errorCount: rpc?.errorCount ?? 0,
    lastError: rpc?.lastError ?? null,
    backfillTarget: partial.backfillTarget ?? 0,
    backfillCompleted: partial.backfillCompleted ?? 0,
    backfillInProgress: partial.backfillInProgress ?? false,
    safeBlock: partial.safeBlock ?? null,
    finalizedBlock: partial.finalizedBlock ?? null,
    httpConfigured: partial.httpConfigured ?? false,
    wsConfigured: partial.wsConfigured ?? false,
    fallbackConfigured: partial.fallbackConfigured ?? false,
    warnings: partial.synthetic ? ['Synthetic demo data. Not Ethereum mainnet.'] : ['Execution gas comes from block headers and receipts. Explorer charts are not the source of truth.'],
    backfillRequest: null,
    heartbeatMs: Date.now(),
  }
}

async function writeMeta(partial: Parameters<typeof meta>[0]) {
  const latest = (await repo.indexedRange()).latest
  await repo.writeCheckpoint(latest?.number ?? null, latest?.hash ?? null, await meta(partial))
}
