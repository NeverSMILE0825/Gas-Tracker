import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config'
import { createMemoryData } from '../src/memory'
import { buildServer } from '../src/server'

const end = 1_762_200_000
const data = createMemoryData({ hours: 2, seed: 1559, endSec: end, tick: false })
const app = await buildServer(loadConfig({ ALLOW_INSECURE_MUTATIONS: 'true', DATA_MODE: 'memory', DEMO_TICK: '0' }), data)
const from = new Date((end - 15 * 60) * 1000).toISOString()
const to = new Date((end + 1) * 1000).toISOString()
const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&live=false&tz=America/New_York`

describe('API', () => {
  it('serves status, current gas, analysis, chart, and drivers from the demo chain', async () => {
    const status = await app.inject({ method: 'GET', url: '/api/v1/status' })
    expect(status.statusCode).toBe(200)
    expect(status.json().runState).toBe('DEMO')
    expect(status.json().networkName).not.toMatch(/Mainnet/)

    const current = await app.inject({ method: 'GET', url: '/api/v1/gas/current' })
    expect(current.json().baseFeeWei).toMatch(/^\d+$/)
    expect(current.json().estimateMethodology).toMatch(/estimate/i)

    const analysis = await app.inject({ method: 'GET', url: `/api/v1/analysis?${query}&compare=true` })
    expect(analysis.statusCode).toBe(200)
    const body = analysis.json()
    expect(body.synthetic).toBe(true)
    expect(body.protocol.mismatchCount).toBe(0)
    expect(body.verdict.length).toBeGreaterThan(40)
    expect(body.ribbon.startsWith('DEMO')).toBe(true)

    const chart = await app.inject({ method: 'GET', url: `/api/v1/chart?${query}&bucket=block` })
    expect(chart.json().points.length).toBeGreaterThan(10)

    const drivers = await app.inject({ method: 'GET', url: `/api/v1/drivers?${query}&groupBy=sender&sort=gasUsed` })
    expect(drivers.json().rows.length).toBeGreaterThan(0)
    expect(drivers.json().rows[0].gasShare).toBeGreaterThan(0)
  })

  it('rejects an inverted interval and models a counterfactual', async () => {
    const bad = await app.inject({ method: 'GET', url: '/api/v1/analysis?from=2026-01-02T00:00:00Z&to=2026-01-01T00:00:00Z&live=false' })
    expect(bad.statusCode).toBe(400)
    const sender = '0x1111111111111111111111111111111111111111'
    const model = await app.inject({
      method: 'POST',
      url: '/api/v1/sensitivity',
      payload: { from, to, live: false, sender },
    })
    expect(model.statusCode).toBe(200)
    expect(model.json().classification).toBe('MODELLED')
  })

  it('stores an alert and returns the historical fixture', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/alerts',
      payload: { name: 'High base fee', kind: 'basefee_above', config: { gwei: 50, minutes: 5 }, enabled: true, cooldownSec: 300 },
    })
    expect(created.statusCode).toBe(200)
    const test = await app.inject({ method: 'POST', url: `/api/v1/alerts/${created.json().id}/test` })
    expect(test.json().payload.test).toBe(true)
    const fixture = await app.inject({ method: 'GET', url: '/api/v1/fixture' })
    expect(fixture.json().flippedBelowTarget).toBe(true)
    expect(fixture.json().method).toContain('Unidentified method')
  })
})
