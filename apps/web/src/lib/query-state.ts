'use client'

import { useQueryClient } from '@tanstack/react-query'
import { formatGweiFixed, formatPct, parseWei, shortHash, zonedLocalToUtcMs, type Preset } from '@gasscope/shared'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMemo } from 'react'

const PRESETS: Preset[] = ['5m', '15m', '30m', '1h', '3h', '6h', '12h', '24h', '7d']
export const ZONES = ['America/New_York', 'UTC', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Singapore', 'Asia/Tokyo']

export function useGasQuery() {
  const sp = useSearchParams()
  const preset = (sp.get('preset') ?? '15m') as Preset
  const live = sp.get('live') !== '0'
  const tz = sp.get('tz') ?? 'America/New_York'
  const bucket = sp.get('bucket') ?? 'auto'
  const compare = sp.get('compare') !== '0'
  const from = sp.get('from')
  const to = sp.get('to')
  const qs = useMemo(() => {
    const params = new URLSearchParams()
    params.set('tz', tz)
    params.set('bucket', bucket)
    params.set('compare', compare ? 'true' : 'false')
    if (!live && from && to) {
      params.set('from', from)
      params.set('to', to)
      params.set('live', 'false')
    } else {
      params.set('preset', preset)
      params.set('live', 'true')
    }
    return params.toString()
  }, [preset, live, tz, bucket, compare, from, to])
  const full = sp.toString()
  return { preset, live, tz, bucket, compare, from, to, qs, search: full ? `?${full}` : '' }
}

export function useUpdateQuery() {
  const router = useRouter()
  const pathname = usePathname()
  const current = useSearchParams()
  return (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(current.toString())
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) params.delete(key)
      else params.set(key, value)
    }
    const next = params.toString()
    router.replace(next ? `${pathname}?${next}` : pathname)
  }
}

export function gwei(wei: string | null | undefined): string {
  if (!wei) return '—'
  return formatGweiFixed(parseWei(wei))
}

export function pct(value: number | null | undefined): string {
  return formatPct(value ?? null)
}

export function short(value: string): string {
  return shortHash(value)
}

export function pinRange(fromLocal: string, toLocal: string, tz: string) {
  const fromMs = zonedLocalToUtcMs(fromLocal, tz)
  const toMs = zonedLocalToUtcMs(toLocal, tz)
  if (fromMs === null || toMs === null) return null
  return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() }
}

export function download(filename: string, body: string, type: string) {
  const blob = new Blob([body], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function entityHref(kind: 'block' | 'tx' | 'address', id: string | number, search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  params.set(kind === 'block' ? 'n' : kind === 'tx' ? 'h' : 'a', String(id))
  const path = kind === 'block' ? '/block' : kind === 'tx' ? '/tx' : '/address'
  return `${path}?${params.toString()}`
}

export function useRefresh() {
  const client = useQueryClient()
  return () => client.invalidateQueries()
}

export { PRESETS }
