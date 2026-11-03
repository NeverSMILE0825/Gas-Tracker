import { GWEI, WEI_PER_ETH } from './constants'

export function parseWei(value: string | number | bigint | null | undefined): bigint {
  if (value === null || value === undefined || value === '') return 0n
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid wei number')
    return BigInt(Math.trunc(value))
  }
  const trimmed = value.trim()
  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) return BigInt(trimmed)
  if (!/^-?\d+$/.test(trimmed)) throw new Error(`Invalid wei decimal: ${value}`)
  return BigInt(trimmed)
}

export function weiToString(value: bigint): string {
  return value.toString(10)
}

/** Exact gwei string. Trailing zeros trimmed. Never rounds a non-zero wei amount to 0. */
export function formatGwei(wei: bigint, maxDecimals = 9): string {
  const neg = wei < 0n
  const v = neg ? -wei : wei
  const decimals = Math.min(9, Math.max(0, maxDecimals))
  const scale = 10n ** BigInt(9 - decimals)
  const rounded = decimals === 9 ? v : (v + scale / 2n) / scale * scale
  const whole = rounded / GWEI
  let frac = (rounded % GWEI).toString().padStart(9, '0')
  if (decimals < 9) frac = frac.slice(0, decimals)
  frac = frac.replace(/0+$/, '')
  const body = frac.length ? `${whole.toString()}.${frac}` : whole.toString()
  return neg ? `-${body}` : body
}

export function formatGweiFixed(wei: bigint): string {
  const abs = wei < 0n ? -wei : wei
  if (abs === 0n) return '0'
  if (abs >= 100n * GWEI) return formatGwei(wei, 4)
  if (abs >= GWEI) return formatGwei(wei, 6)
  if (abs >= GWEI / 1000n) return formatGwei(wei, 8)
  return formatGwei(wei, 9)
}

export function formatEth(wei: bigint, maxDecimals = 6): string {
  const neg = wei < 0n
  const v = neg ? -wei : wei
  const whole = v / WEI_PER_ETH
  const fracFull = (v % WEI_PER_ETH).toString().padStart(18, '0')
  let frac = fracFull.slice(0, maxDecimals).replace(/0+$/, '')
  if (whole === 0n && v > 0n && frac.length === 0) {
    const first = fracFull.search(/[1-9]/)
    frac = fracFull.slice(0, Math.min(18, first + 2))
  }
  const body = frac.length ? `${whole.toString()}.${frac}` : whole.toString()
  return neg ? `-${body}` : body
}

export function formatPct(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return 'n/a'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

export function percentDelta(start: bigint, end: bigint): { pct: number | null; zeroBaseline: boolean } {
  if (start === 0n) {
    return { pct: end === 0n ? 0 : null, zeroBaseline: true }
  }
  const diff = end - start
  const pct = Number((diff * 1_000_000n) / start) / 10_000
  return { pct, zeroBaseline: false }
}

export function shareRatio(part: bigint, total: bigint): number | null {
  if (total <= 0n) return null
  return Number((part * 1_000_000n) / total) / 1_000_000
}

export function formatShare(part: bigint, total: bigint): string {
  const ratio = shareRatio(part, total)
  if (ratio === null) return 'n/a'
  return `${(ratio * 100).toFixed(2)}%`
}

export function shortHash(value: string, lead = 6, tail = 4): string {
  if (value.length <= lead + tail + 2) return value
  return `${value.slice(0, lead)}…${value.slice(-tail)}`
}

export function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString(10)
  return value
}

export function directionOf(delta: bigint): 'up' | 'down' | 'flat' {
  if (delta > 0n) return 'up'
  if (delta < 0n) return 'down'
  return 'flat'
}
