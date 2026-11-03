import { GWEI } from '@gasscope/shared'

export type AlertKind =
  | 'basefee_above'
  | 'basefee_below'
  | 'basefee_change_pct'
  | 'consecutive_target'
  | 'wallet_share'
  | 'large_tx'
  | 'index_stale'

export interface AlertRuleInput {
  id: string
  kind: AlertKind
  enabled: boolean
  cooldownSec: number
  config: {
    gwei?: number
    minutes?: number
    percent?: number
    intervalMinutes?: number
    direction?: 'above' | 'below'
    count?: number
    address?: string
    category?: string
    share?: number
    gas?: number
    staleSeconds?: number
  }
}

export interface AlertContext {
  nowSec: number
  synthetic: boolean
  blocks: { number: number; timestamp: number; baseFeePerGas: bigint; aboveTarget: boolean }[]
  share?: { key: string; share: number; windowSec: number }
  largeTx?: { hash: string; gasUsed: bigint; blockNumber: number }
  lagSeconds: number | null
}

export interface ActiveFiring {
  dedupeKey: string
  firedAtSec: number
  resolvedAtSec: number | null
}

export interface AlertDecision {
  action: 'none' | 'fire' | 'resolve'
  dedupeKey: string
  payload: Record<string, string | number | boolean | null>
}

function gweiToWei(gwei: number): bigint {
  const [whole, frac = ''] = gwei.toString().split('.')
  const digits = (frac + '000000000').slice(0, 9)
  return BigInt(whole || '0') * GWEI + BigInt(digits)
}

function inCooldown(rule: AlertRuleInput, active: ActiveFiring | null, nowSec: number): boolean {
  if (!active?.resolvedAtSec) return false
  return nowSec - active.resolvedAtSec < rule.cooldownSec
}

export function evaluateAlert(rule: AlertRuleInput, ctx: AlertContext, active: ActiveFiring | null): AlertDecision {
  const none = (dedupeKey = active?.dedupeKey ?? 'none'): AlertDecision => ({ action: 'none', dedupeKey, payload: {} })
  if (!rule.enabled) return none()
  const blocks = [...ctx.blocks].sort((a, b) => a.timestamp - b.timestamp)
  const latest = blocks[blocks.length - 1]

  if (rule.kind === 'index_stale') {
    const stale = rule.config.staleSeconds ?? 90
    const key = `${rule.id}:stale`
    if (ctx.synthetic) return none(key)
    const lag = ctx.lagSeconds
    if (lag !== null && lag >= stale) {
      if (active && !active.resolvedAtSec && active.dedupeKey === key) return none(key)
      if (inCooldown(rule, active, ctx.nowSec)) return none(key)
      return { action: 'fire', dedupeKey: key, payload: { lagSeconds: lag, staleSeconds: stale } }
    }
    if (active && !active.resolvedAtSec && lag !== null && lag < Math.floor(stale / 2)) {
      return { action: 'resolve', dedupeKey: key, payload: { lagSeconds: lag } }
    }
    return none(key)
  }

  if (!latest) return none()

  if (rule.kind === 'basefee_above' || rule.kind === 'basefee_below') {
    const threshold = gweiToWei(rule.config.gwei ?? 0)
    const minutes = rule.config.minutes ?? 5
    const since = latest.timestamp - minutes * 60
    const window = blocks.filter((b) => b.timestamp >= since)
    const above = rule.kind === 'basefee_above'
    const held = window.length > 0 && window.every((b) => (above ? b.baseFeePerGas >= threshold : b.baseFeePerGas <= threshold))
    const runStart = window[0]?.number ?? latest.number
    const key = `${rule.id}:${above ? 'above' : 'below'}:${runStart}`
    if (held) {
      if (active && !active.resolvedAtSec) return none(active.dedupeKey)
      if (inCooldown(rule, active, ctx.nowSec)) return none(key)
      return {
        action: 'fire',
        dedupeKey: key,
        payload: { block: latest.number, baseFeeWei: latest.baseFeePerGas.toString(), minutes, gwei: rule.config.gwei ?? 0 },
      }
    }
    if (active && !active.resolvedAtSec) {
      const hysteresis = above ? (threshold * 98n) / 100n : (threshold * 102n) / 100n
      const released = above ? latest.baseFeePerGas < hysteresis : latest.baseFeePerGas > hysteresis
      if (released) return { action: 'resolve', dedupeKey: active.dedupeKey, payload: { block: latest.number, baseFeeWei: latest.baseFeePerGas.toString() } }
    }
    return none(key)
  }

  if (rule.kind === 'basefee_change_pct') {
    const minutes = rule.config.intervalMinutes ?? 15
    const percent = rule.config.percent ?? 10
    const targetTs = latest.timestamp - minutes * 60
    const prior = [...blocks].reverse().find((b) => b.timestamp <= targetTs)
    const keyBase = `${rule.id}:pct:${prior?.number ?? 'na'}`
    if (!prior || prior.baseFeePerGas === 0n) return none(keyBase)
    const pct = Number(((latest.baseFeePerGas - prior.baseFeePerGas) * 1_000_000n) / prior.baseFeePerGas) / 10_000
    const hit = Math.abs(pct) >= percent
    if (hit) {
      if (active && !active.resolvedAtSec) return none(active.dedupeKey)
      if (inCooldown(rule, active, ctx.nowSec)) return none(keyBase)
      return { action: 'fire', dedupeKey: keyBase, payload: { pct, fromBlock: prior.number, toBlock: latest.number } }
    }
    if (active && !active.resolvedAtSec && Math.abs(pct) < percent / 2) {
      return { action: 'resolve', dedupeKey: active.dedupeKey, payload: { pct } }
    }
    return none(keyBase)
  }

  if (rule.kind === 'consecutive_target') {
    const count = rule.config.count ?? 5
    const direction = rule.config.direction ?? 'above'
    const tail = blocks.slice(-count)
    const held = tail.length >= count && tail.every((b) => (direction === 'above' ? b.aboveTarget : !b.aboveTarget))
    const start = tail[0]?.number ?? latest.number
    const key = `${rule.id}:run:${direction}:${start}`
    if (held) {
      if (active && !active.resolvedAtSec) return none(active.dedupeKey)
      if (inCooldown(rule, active, ctx.nowSec)) return none(key)
      return { action: 'fire', dedupeKey: key, payload: { direction, count, block: latest.number } }
    }
    if (active && !active.resolvedAtSec) return { action: 'resolve', dedupeKey: active.dedupeKey, payload: { block: latest.number } }
    return none(key)
  }

  if (rule.kind === 'wallet_share') {
    const needed = rule.config.share ?? 0.15
    const keyName = (rule.config.address ?? rule.config.category ?? '').toLowerCase()
    const key = `${rule.id}:share:${keyName}`
    const hit = ctx.share && ctx.share.key.toLowerCase() === keyName && ctx.share.share >= needed
    if (hit && ctx.share) {
      if (active && !active.resolvedAtSec) return none(active.dedupeKey)
      if (inCooldown(rule, active, ctx.nowSec)) return none(key)
      return { action: 'fire', dedupeKey: key, payload: { share: ctx.share.share, key: ctx.share.key } }
    }
    if (active && !active.resolvedAtSec) return { action: 'resolve', dedupeKey: active.dedupeKey, payload: {} }
    return none(key)
  }

  if (rule.kind === 'large_tx') {
    const gas = BigInt(rule.config.gas ?? 5_000_000)
    if (!ctx.largeTx || ctx.largeTx.gasUsed < gas) return none(`${rule.id}:large`)
    const key = `${rule.id}:tx:${ctx.largeTx.hash}`
    if (active && active.dedupeKey === key) return none(key)
    return {
      action: 'fire',
      dedupeKey: key,
      payload: { hash: ctx.largeTx.hash, gasUsed: ctx.largeTx.gasUsed.toString(), block: ctx.largeTx.blockNumber },
    }
  }

  return none()
}
