import { DateTime } from 'luxon'
import { BUCKETS, DEFAULT_TIMEZONE, MAX_RANGE_SEC, PRESETS, type BucketName, type Preset } from './constants'

const PRESET_MINUTES: Record<Preset, number> = {
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '3h': 180,
  '6h': 360,
  '12h': 720,
  '24h': 1440,
  '7d': 7 * 1440,
}

export function isPreset(value: string): value is Preset {
  return (PRESETS as readonly string[]).includes(value)
}

export function isValidZone(zone: string): boolean {
  return DateTime.now().setZone(zone).isValid
}

export function presetWindow(preset: Preset, nowMs: number, zone = DEFAULT_TIMEZONE): { fromMs: number; toMs: number } {
  const end = DateTime.fromMillis(nowMs, { zone: 'utc' }).setZone(zone)
  const start = end.minus({ minutes: PRESET_MINUTES[preset] })
  return { fromMs: start.toUTC().toMillis(), toMs: end.toUTC().toMillis() }
}

/**
 * Interpret a datetime-local value (no offset) in an IANA zone.
 * Nonexistent civil times (spring-forward gap) are shifted forward by Luxon.
 * Ambiguous civil times (fall-back) use Luxon's earlier offset.
 */
export function zonedLocalToUtcMs(local: string, zone: string): number | null {
  const dt = DateTime.fromISO(local, { zone })
  if (!dt.isValid) return null
  return dt.toUTC().toMillis()
}

export function formatInZone(ms: number, zone: string, fmt = 'yyyy-LL-dd HH:mm:ss ZZZZ'): string {
  return DateTime.fromMillis(ms, { zone: 'utc' }).setZone(zone).toFormat(fmt)
}

export function toIsoUtc(ms: number): string {
  return DateTime.fromMillis(ms, { zone: 'utc' }).toUTC().toISO({ suppressMilliseconds: true }) ?? new Date(ms).toISOString()
}

export function autoBucket(fromMs: number, toMs: number): Exclude<BucketName, 'auto'> {
  const span = Math.max(0, toMs - fromMs)
  if (span <= 45 * 60 * 1000) return 'block'
  if (span <= 6 * 3600 * 1000) return '1m'
  if (span <= 48 * 3600 * 1000) return '5m'
  return '1h'
}

export function bucketSeconds(bucket: Exclude<BucketName, 'auto' | 'block'>): number {
  switch (bucket) {
    case '1m':
      return 60
    case '5m':
      return 300
    case '15m':
      return 900
    case '1h':
      return 3600
  }
}

export interface ResolvedInterval {
  fromMs: number
  toMs: number
  fromIso: string
  toIso: string
  preset: Preset | null
  bucket: Exclude<BucketName, 'auto'>
  live: boolean
  tz: string
}

export function resolveInterval(input: {
  from?: string
  to?: string
  preset?: string
  bucket?: string
  live?: boolean
  tz?: string
  nowMs: number
}): { ok: true; value: ResolvedInterval } | { ok: false; error: string; status: number } {
  const tz = input.tz && input.tz.length > 0 ? input.tz : DEFAULT_TIMEZONE
  if (!isValidZone(tz)) {
    return { ok: false, status: 400, error: `Unknown time zone "${tz}". Use an IANA name such as America/New_York.` }
  }
  const live = input.live !== false
  let fromMs: number
  let toMs: number
  let preset: Preset | null = null
  if (input.preset && isPreset(input.preset) && (live || (!input.from && !input.to))) {
    preset = input.preset
    const w = presetWindow(preset, input.nowMs, tz)
    fromMs = w.fromMs
    toMs = w.toMs
  } else if (input.from && input.to) {
    const from = DateTime.fromISO(input.from, { setZone: true })
    const to = DateTime.fromISO(input.to, { setZone: true })
    if (!from.isValid || !to.isValid) {
      return { ok: false, status: 400, error: 'from and to must be ISO-8601 timestamps.' }
    }
    fromMs = from.toUTC().toMillis()
    toMs = to.toUTC().toMillis()
    if (input.preset && isPreset(input.preset)) preset = input.preset
  } else if (input.preset && isPreset(input.preset)) {
    preset = input.preset
    const w = presetWindow(preset, input.nowMs, tz)
    fromMs = w.fromMs
    toMs = w.toMs
  } else {
    const w = presetWindow('15m', input.nowMs, tz)
    preset = '15m'
    fromMs = w.fromMs
    toMs = w.toMs
  }
  if (!(toMs > fromMs)) {
    return { ok: false, status: 400, error: 'Interval end must be after the start. Boundaries are half-open [start, end).' }
  }
  if (toMs - fromMs > MAX_RANGE_SEC * 1000) {
    return {
      ok: false,
      status: 400,
      error: 'Ranges longer than 7 days are outside this deployment’s indexed window. Narrow the interval or request a backfill within 7 days.',
    }
  }
  const requested = input.bucket && (BUCKETS as readonly string[]).includes(input.bucket) ? (input.bucket as BucketName) : 'auto'
  const bucket = requested === 'auto' ? autoBucket(fromMs, toMs) : requested
  if (bucket === 'block' && toMs - fromMs > 3 * 3600 * 1000) {
    return {
      ok: false,
      status: 400,
      error: 'Per-block resolution is limited to 3 hours so charts stay readable. Choose 1m, 5m, 15m, 1h, or auto.',
    }
  }
  return {
    ok: true,
    value: {
      fromMs,
      toMs,
      fromIso: toIsoUtc(fromMs),
      toIso: toIsoUtc(toMs),
      preset,
      bucket,
      live,
      tz,
    },
  }
}
