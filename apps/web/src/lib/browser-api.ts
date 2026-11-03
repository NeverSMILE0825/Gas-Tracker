import {
  addressDetail,
  analysis,
  blockDetail,
  blockList,
  chart,
  createMemoryData,
  current,
  docs,
  drivers,
  fixture,
  sensitivity,
  transactionDetail,
} from '@gasscope/api/browser'
import { compareFixture } from '@gasscope/analytics'
import { alertWriteSchema, type AlertRuleDto } from '@gasscope/shared'

const data = createMemoryData({ hours: 6, seed: 1559, tick: typeof window !== 'undefined' })

function queryOf(path: string): Record<string, string> {
  const query = path.includes('?') ? path.slice(path.indexOf('?') + 1) : ''
  return Object.fromEntries(new URLSearchParams(query))
}

function routeOf(path: string): string {
  const bare = path.split('?')[0] ?? path
  return bare.replace(/\/$/, '') || '/'
}

export async function browserApi<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const route = routeOf(path)
  const query = queryOf(path)
  const body = init?.body ? JSON.parse(String(init.body)) : undefined
  try {
    if (method === 'GET' && route === '/api/v1/status') return (await data.getStatus()) as T
    if (method === 'GET' && route === '/api/v1/gas/current') return (await current(data)) as T
    if (method === 'GET' && route === '/api/v1/analysis') return (await analysis(data, query)) as T
    if (method === 'GET' && route === '/api/v1/chart') return (await chart(data, query)) as T
    if (method === 'GET' && route === '/api/v1/drivers') return (await drivers(data, query)) as T
    if (method === 'GET' && route === '/api/v1/blocks') return (await blockList(data, query)) as T
    if (method === 'GET' && route === '/api/v1/methodology') return docs() as T
    if (method === 'GET' && route === '/api/v1/fixture') return fixture() as T
    if (method === 'POST' && route === '/api/v1/fixture/verify') return compareFixture(null) as T
    if (method === 'POST' && route === '/api/v1/sensitivity') return (await sensitivity(data, body)) as T
    if (method === 'GET' && route === '/api/v1/alerts') return { rules: await data.alerts() } as T
    if (method === 'GET' && route === '/api/v1/alerts/firings') return { firings: await data.firings() } as T
    const block = route.match(/^\/api\/v1\/blocks\/(\d+)$/)
    if (method === 'GET' && block) return (await blockDetail(data, Number(block[1]))) as T
    const tx = route.match(/^\/api\/v1\/transactions\/(0x[0-9a-fA-F]{64})$/)
    if (method === 'GET' && tx) return (await transactionDetail(data, tx[1]!.toLowerCase())) as T
    const address = route.match(/^\/api\/v1\/address\/(0x[0-9a-fA-F]{40})$/)
    if (method === 'GET' && address) return (await addressDetail(data, address[1]!, query)) as T
    if (method === 'POST' && route === '/api/v1/alerts') return (await saveAlert(body, null)) as T
    const alert = route.match(/^\/api\/v1\/alerts\/([^/]+)$/)
    if (alert && method === 'PATCH') return (await saveAlert(body, decodeURIComponent(alert[1]!))) as T
    if (alert && method === 'DELETE') {
      const ok = await data.deleteAlert(decodeURIComponent(alert[1]!))
      if (!ok) throw new Error('Alert not found.')
      return undefined as T
    }
    const test = route.match(/^\/api\/v1\/alerts\/([^/]+)\/test$/)
    if (test && method === 'POST') return (await testAlert(decodeURIComponent(test[1]!))) as T
    throw new Error(`This published demo does not serve ${method} ${route}.`)
  } catch (error) {
    if (error instanceof Error) throw error
    throw new Error('Request failed')
  }
}

async function saveAlert(body: unknown, id: string | null): Promise<AlertRuleDto> {
  const existing = id ? (await data.alerts()).find((alert) => alert.id === id) : null
  if (id && !existing) throw new Error('Alert not found.')
  const parsed = (id ? alertWriteSchema.partial() : alertWriteSchema).safeParse(body)
  if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join('; '))
  const next: AlertRuleDto = {
    id: existing?.id ?? crypto.randomUUID(),
    name: parsed.data.name ?? existing?.name ?? 'Alert',
    kind: parsed.data.kind ?? existing?.kind ?? 'basefee_above',
    config: { ...(existing?.config ?? {}), ...(parsed.data.config ?? {}) },
    enabled: parsed.data.enabled ?? existing?.enabled ?? true,
    cooldownSec: parsed.data.cooldownSec ?? existing?.cooldownSec ?? 300,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  }
  await data.saveAlert(next)
  return next
}

async function testAlert(id: string) {
  const existing = (await data.alerts()).find((alert) => alert.id === id)
  if (!existing) throw new Error('Alert not found.')
  const firing = {
    id: crypto.randomUUID(),
    ruleId: id,
    dedupeKey: `${id}:test:${Date.now()}`,
    firedAt: new Date().toISOString(),
    resolvedAt: new Date().toISOString(),
    payload: { test: true, name: existing.name, kind: existing.kind },
    delivery: { browser: 'stored in this tab' },
  }
  await data.addFiring(firing)
  return firing
}
