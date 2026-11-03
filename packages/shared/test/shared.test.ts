import { describe, expect, it } from 'vitest'
import { formatEth, formatGwei, formatGweiFixed, percentDelta } from '../src/format'
import { parseProbe } from '../src/search'
import { resolveInterval, zonedLocalToUtcMs } from '../src/time'

describe('format', () => {
  it('does not round tiny gwei values to zero', () => {
    expect(formatGwei(1n)).toBe('0.000000001')
    expect(formatGweiFixed(20_000_000n)).toBe('0.02')
    expect(formatGwei(2_500_000_000n)).toBe('2.5')
  })

  it('guards a zero base fee baseline', () => {
    expect(percentDelta(0n, 0n)).toEqual({ pct: 0, zeroBaseline: true })
    expect(percentDelta(0n, 10n).pct).toBeNull()
    expect(percentDelta(100n, 125n).pct).toBeCloseTo(25, 5)
  })

  it('formats sub-wei-scale ETH without collapsing to zero', () => {
    expect(formatEth(1n)).not.toBe('0')
  })
})

describe('time', () => {
  it('handles the 2026 New York spring-forward gap', () => {
    const before = zonedLocalToUtcMs('2026-03-08T01:30:00', 'America/New_York')
    const after = zonedLocalToUtcMs('2026-03-08T03:30:00', 'America/New_York')
    expect(before).toBe(Date.parse('2026-03-08T06:30:00Z'))
    expect(after).toBe(Date.parse('2026-03-08T07:30:00Z'))
    expect(after! - before!).toBe(3600_000)
  })

  it('rejects an inverted custom interval', () => {
    const result = resolveInterval({
      from: '2026-11-02T12:00:00Z',
      to: '2026-11-02T11:00:00Z',
      live: false,
      nowMs: Date.parse('2026-11-02T12:00:00Z'),
    })
    expect(result.ok).toBe(false)
  })

  it('resolves a live 15m preset against the server clock', () => {
    const now = Date.parse('2026-11-02T16:00:00Z')
    const result = resolveInterval({ preset: '15m', live: true, tz: 'America/New_York', nowMs: now })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.toMs - result.value.fromMs).toBe(15 * 60 * 1000)
      expect(result.value.bucket).toBe('block')
    }
  })
})

describe('search', () => {
  it('parses etherscan transaction URLs', () => {
    const hash = '0x' + 'ab'.repeat(32)
    const probe = parseProbe(`https://etherscan.io/tx/${hash}?utm=1`)
    expect(probe).toEqual({ kind: 'tx', hash })
  })

  it('parses a block number', () => {
    expect(parseProbe('26330059')).toEqual({ kind: 'block', number: 26330059 })
  })
})
