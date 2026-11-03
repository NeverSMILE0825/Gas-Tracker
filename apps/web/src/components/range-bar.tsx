'use client'

import { BUCKETS } from '@gasscope/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { PRESETS, ZONES, pinRange, useGasQuery, useUpdateQuery } from '@/lib/query-state'

export function RangeBar({ onExport }: { onExport?: (kind: 'csv' | 'json') => void }) {
  const query = useGasQuery()
  const update = useUpdateQuery()
  const client = useQueryClient()
  const [fromLocal, setFromLocal] = useState('')
  const [toLocal, setToLocal] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  return (
    <div className="toolbar" aria-label="Time range">
      {PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          className="pill"
          data-active={query.live && query.preset === preset}
          onClick={() => update({ preset, live: 'true', from: null, to: null })}
        >
          {preset}
        </button>
      ))}
      <label className="text-xs text-muted">
        Resolution
        <select
          className="ml-2 rounded-full border border-line bg-transparent px-2 py-1"
          aria-label="Chart resolution"
          value={query.bucket}
          onChange={(event) => update({ bucket: event.target.value })}
        >
          {BUCKETS.map((bucket) => (
            <option key={bucket} value={bucket}>{bucket === 'auto' ? 'auto' : bucket === 'block' ? 'per block' : bucket}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-muted">
        Zone
        <select
          className="ml-2 rounded-full border border-line bg-transparent px-2 py-1"
          aria-label="Time zone"
          value={query.tz}
          onChange={(event) => update({ tz: event.target.value })}
        >
          {ZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
        </select>
      </label>
      <button type="button" className="pill" data-active={query.compare} onClick={() => update({ compare: query.compare ? '0' : '1' })}>
        Compare previous window
      </button>
      <button type="button" className="pill" data-active={query.live} onClick={() => update({ live: 'true', from: null, to: null })}>
        Live window
      </button>
      <label className="text-xs text-muted">
        From
        <input className="ml-2 rounded-lg border border-line bg-transparent px-2 py-1" type="datetime-local" value={fromLocal} onChange={(event) => setFromLocal(event.target.value)} aria-label="Custom range start" />
      </label>
      <label className="text-xs text-muted">
        To
        <input className="ml-2 rounded-lg border border-line bg-transparent px-2 py-1" type="datetime-local" value={toLocal} onChange={(event) => setToLocal(event.target.value)} aria-label="Custom range end" />
      </label>
      <button
        type="button"
        className="btn btn-solid"
        onClick={() => {
          const pinned = pinRange(fromLocal, toLocal, query.tz)
          if (!pinned) {
            setPinError('Enter a start and end. The end is exclusive.')
            return
          }
          setPinError(null)
          update({ live: '0', from: pinned.from, to: pinned.to, preset: null })
        }}
      >
        Pin range
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          void navigator.clipboard.writeText(window.location.href).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          })
        }}
      >
        {copied ? 'Link copied' : 'Share URL'}
      </button>
      <button type="button" className="btn" onClick={() => void client.invalidateQueries()}>Refresh</button>
      {onExport ? (
        <>
          <button type="button" className="btn" onClick={() => onExport('csv')}>Export CSV</button>
          <button type="button" className="btn" onClick={() => onExport('json')}>Export JSON</button>
        </>
      ) : null}
      <span className="text-xs text-muted">{query.live ? `Sliding ${query.preset} on the server clock` : 'Fixed historical interval'}</span>
      {pinError ? <span className="text-xs text-[#fb7185]">{pinError}</span> : null}
    </div>
  )
}
