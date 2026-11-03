import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { compareFixture, FIXTURE_26330059 } from '@gasscope/analytics'
import { alertWriteSchema, parseProbe } from '@gasscope/shared'
import { randomUUID } from 'node:crypto'
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import type { ApiConfig } from './config'
import type { GasData } from './data'
import { addressDetail, analysis, blockDetail, blockList, chart, current, docs, drivers, evidence, fixture, httpError, sensitivity, transactionDetail } from './service'

export async function buildServer(config: ApiConfig, data: GasData): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: false })
  await app.register(cors, { origin: config.corsOrigins, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] })
  await app.register(rateLimit, { max: 180, timeWindow: '1 minute' })

  app.setErrorHandler((error, request, reply) => {
    const status = (error as { statusCode?: number }).statusCode ?? 500
    if (status >= 500) request.log.error(error)
    const message = error instanceof Error ? error.message : 'Request failed'
    reply.status(status).send({ error: status >= 500 ? 'Internal error' : message })
  })

  app.get('/healthz', async () => ({ ok: true }))
  app.get('/readyz', async () => {
    const status = await data.getStatus()
    return { ok: true, indexedBlock: status.indexedBlock, mode: status.mode }
  })

  app.get('/api/v1/status', async () => data.getStatus())
  app.get('/api/v1/gas/current', async () => current(data))
  app.get('/api/v1/analysis', async (request) => analysis(data, request.query as Record<string, unknown>))
  app.get('/api/v1/chart', async (request) => chart(data, request.query as Record<string, unknown>))
  app.get('/api/v1/drivers', async (request) => drivers(data, request.query as Record<string, unknown>))
  app.get('/api/v1/blocks', async (request) => blockList(data, request.query as Record<string, unknown>))
  app.get('/api/v1/blocks/:number', async (request) => {
    const number = Number((request.params as { number: string }).number)
    if (!Number.isInteger(number) || number < 0) throw httpError(400, 'Block number must be a non-negative integer.')
    return blockDetail(data, number)
  })
  app.get('/api/v1/transactions/:hash', async (request) => transactionDetail(data, (request.params as { hash: string }).hash))
  app.get('/api/v1/address/:address', async (request) => addressDetail(data, (request.params as { address: string }).address, request.query as Record<string, unknown>))
  app.post('/api/v1/sensitivity', async (request) => sensitivity(data, request.body))
  app.get('/api/v1/methodology', async () => docs())
  app.get('/api/v1/fixture', async () => fixture())
  app.post('/api/v1/fixture/verify', async () => verifyFixture(config.rpcUrl))
  app.get('/api/v1/search', async (request) => {
    const q = String((request.query as { q?: string }).q ?? '')
    const probe = parseProbe(q)
    if (probe.kind === 'invalid') return { kind: 'invalid', href: null, message: probe.reason }
    const href = probe.kind === 'tx' ? `/tx?h=${probe.hash}` : probe.kind === 'address' ? `/address?a=${probe.address}` : `/block?n=${probe.number}`
    return { kind: probe.kind, href, message: 'Open the indexed record. A miss means it is outside the current history.' }
  })
  app.post('/api/v1/backfill', async (request) => {
    const body = (request.body ?? {}) as { from?: string; to?: string }
    const fromMs = body.from ? Date.parse(body.from) : Date.now() - 3600_000
    const toMs = body.to ? Date.parse(body.to) : Date.now()
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) throw httpError(400, 'Provide a valid from/to range.')
    return data.requestBackfill(Math.floor(fromMs / 1000), Math.ceil(toMs / 1000))
  })
  app.get('/api/v1/evidence', async (request) => evidence(await analysis(data, request.query as Record<string, unknown>)))

  app.get('/api/v1/alerts', async () => ({ rules: await data.alerts() }))
  app.post('/api/v1/alerts', async (request) => {
    assertMutation(config, request)
    const parsed = alertWriteSchema.safeParse(request.body)
    if (!parsed.success) throw httpError(400, parsed.error.issues.map((issue) => issue.message).join('; '))
    const alert = { id: randomUUID(), ...parsed.data, config: parsed.data.config, createdAt: new Date().toISOString() }
    await data.saveAlert(alert)
    return alert
  })
  app.patch('/api/v1/alerts/:id', async (request) => {
    assertMutation(config, request)
    const id = (request.params as { id: string }).id
    const existing = (await data.alerts()).find((alert) => alert.id === id)
    if (!existing) throw httpError(404, 'Alert not found.')
    const parsed = alertWriteSchema.partial().safeParse(request.body)
    if (!parsed.success) throw httpError(400, parsed.error.issues.map((issue) => issue.message).join('; '))
    const next = { ...existing, ...parsed.data, config: { ...existing.config, ...(parsed.data.config ?? {}) } }
    await data.saveAlert(next)
    return next
  })
  app.delete('/api/v1/alerts/:id', async (request, reply) => {
    assertMutation(config, request)
    const ok = await data.deleteAlert((request.params as { id: string }).id)
    if (!ok) throw httpError(404, 'Alert not found.')
    reply.status(204).send()
  })
  app.post('/api/v1/alerts/:id/test', async (request) => {
    assertMutation(config, request)
    const id = (request.params as { id: string }).id
    const existing = (await data.alerts()).find((alert) => alert.id === id)
    if (!existing) throw httpError(404, 'Alert not found.')
    const firing = {
      id: randomUUID(),
      ruleId: id,
      dedupeKey: `${id}:test:${Date.now()}`,
      firedAt: new Date().toISOString(),
      resolvedAt: new Date().toISOString(),
      payload: { test: true, name: existing.name, kind: existing.kind },
      delivery: await deliverTest(),
    }
    await data.addFiring(firing)
    return firing
  })
  app.get('/api/v1/alerts/firings', async () => ({ firings: await data.firings() }))

  app.get('/api/v1/events/stream', async (request, reply) => {
    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`)
    const unsubscribe = data.subscribe((event) => {
      reply.raw.write(`event: block\ndata: ${JSON.stringify(event)}\n\n`)
    })
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 15_000)
    request.raw.on('close', () => {
      clearInterval(ping)
      unsubscribe()
    })
  })

  app.get('/api/v1/openapi.json', async () => openapi())
  return app
}

function assertMutation(config: ApiConfig, request: FastifyRequest) {
  if (config.allowInsecureMutations) return
  const header = request.headers['x-gasscope-secret']
  if (config.secret && header === config.secret) return
  const ip = request.ip
  if (!config.secret && (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1')) return
  throw httpError(401, 'Alert changes require the x-gasscope-secret header, or ALLOW_INSECURE_MUTATIONS=true on a private local deployment.')
}

async function deliverTest(): Promise<Record<string, unknown>> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chat = process.env.TELEGRAM_CHAT_ID
  if (!token || !chat) return { telegram: 'skipped: not configured', email: process.env.ALERT_EMAIL_WEBHOOK_URL ? 'not sent on test without explicit call' : 'skipped: not configured' }
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: 'GasScope alert test' }),
  })
  return { telegram: response.ok ? 'sent' : `failed ${response.status}` }
}

async function verifyFixture(rpcUrl?: string) {
  if (!rpcUrl) return compareFixture(null)
  const block = await rpc(rpcUrl, 'eth_getBlockByNumber', ['0x' + FIXTURE_26330059.blockNumber.toString(16), true]) as {
    gasUsed: string
    gasLimit: string
    baseFeePerGas: string
    transactions: { hash: string; from: string; to: string | null; input: string }[]
  }
  const tx = block.transactions.find((item) => item.hash.toLowerCase() === FIXTURE_26330059.txHash)
  const receipt = await rpc(rpcUrl, 'eth_getTransactionReceipt', [FIXTURE_26330059.txHash]) as { gasUsed: string }
  if (!tx) return compareFixture(null)
  return compareFixture({
    gasUsed: BigInt(block.gasUsed),
    gasLimit: BigInt(block.gasLimit),
    baseFeePerGas: BigInt(block.baseFeePerGas),
    txGas: BigInt(receipt.gasUsed),
    from: tx.from,
    to: tx.to,
    selector: tx.input?.slice(0, 10) ?? null,
  })
}

async function rpc(url: string, method: string, params: unknown[]) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const body = await response.json() as { result?: unknown; error?: { message?: string } }
  if (body.error) throw httpError(502, body.error.message ?? 'RPC error')
  return body.result
}

function openapi() {
  return {
    openapi: '3.0.3',
    info: { title: 'GasScope API', version: '1.0.0' },
    paths: {
      '/api/v1/status': { get: { summary: 'Indexer and provider status' } },
      '/api/v1/gas/current': { get: { summary: 'Latest execution base fee and labelled estimates' } },
      '/api/v1/analysis': { get: { summary: 'Window metrics, EIP-1559 explanation, and evidence' } },
      '/api/v1/chart': { get: { summary: 'Chart buckets' } },
      '/api/v1/drivers': { get: { summary: 'Exclusive gas rankings' } },
      '/api/v1/blocks/{number}': { get: { summary: 'Block evidence and parent base-fee math' } },
      '/api/v1/transactions/{hash}': { get: { summary: 'Transaction fee decomposition' } },
      '/api/v1/address/{address}': { get: { summary: 'Sender activity in a window' } },
      '/api/v1/sensitivity': { post: { summary: 'Static gas-removal counterfactual' } },
      '/api/v1/alerts': { get: { summary: 'List alert rules' }, post: { summary: 'Create an alert rule' } },
      '/api/v1/events/stream': { get: { summary: 'Server-sent block events' } },
      '/api/v1/methodology': { get: { summary: 'Definitions and formula version' } },
    },
  }
}
