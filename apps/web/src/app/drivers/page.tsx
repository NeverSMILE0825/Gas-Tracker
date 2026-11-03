'use client'

import type { DriversDto } from '@gasscope/shared'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { DriverTable, QueryNote } from '@/components/bits'
import { RangeBar } from '@/components/range-bar'
import { api } from '@/lib/api'
import { entityHref, useGasQuery, useUpdateQuery } from '@/lib/query-state'

const GROUPS: { id: DriversDto['groupBy']; label: string }[] = [
  { id: 'sender', label: 'Senders' },
  { id: 'contract', label: 'Called contracts' },
  { id: 'category', label: 'Categories' },
  { id: 'method', label: 'Methods' },
]
const SORTS: { id: DriversDto['sort']; label: string }[] = [
  { id: 'gasUsed', label: 'Gas used' },
  { id: 'fees', label: 'Execution fees' },
  { id: 'tip', label: 'Priority fees' },
  { id: 'txCount', label: 'Transactions' },
]

export default function DriversPage() {
  const { qs, search } = useGasQuery()
  const update = useUpdateQuery()
  const params = new URLSearchParams(search.slice(1))
  const groupBy = (params.get('groupBy') as DriversDto['groupBy']) || 'sender'
  const sort = (params.get('sort') as DriversDto['sort']) || 'gasUsed'
  const [cursor, setCursor] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const query = `${qs}&groupBy=${groupBy}&sort=${sort}&limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
  const drivers = useQuery({
    queryKey: ['drivers', query],
    queryFn: () => api<DriversDto>(`/api/v1/drivers?${query}`),
  })
  const rows = (drivers.data?.rows ?? []).filter((row) => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return true
    return row.label.toLowerCase().includes(needle) || row.key.toLowerCase().includes(needle) || row.categoryLabel.toLowerCase().includes(needle)
  })
  return (
    <div>
      <h1 className="mb-2 text-2xl">Top drivers</h1>
      <p className="mb-3 max-w-3xl text-sm text-muted">Each table is one exclusive grouping. A sender share and a contract share describe the same gas from different columns. Do not add them.</p>
      <RangeBar />
      <div className="toolbar">
        {GROUPS.map((group) => (
          <button key={group.id} type="button" className="pill" data-active={groupBy === group.id} onClick={() => { setCursor(null); update({ groupBy: group.id }) }}>{group.label}</button>
        ))}
        {SORTS.map((item) => (
          <button key={item.id} type="button" className="pill" data-active={sort === item.id} onClick={() => { setCursor(null); update({ sort: item.id }) }}>{item.label}</button>
        ))}
        <input className="rounded-full border border-line bg-transparent px-3 py-1" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter this page" aria-label="Filter leaderboard" />
      </div>
      {drivers.data?.synthetic ? <div className="banner">Synthetic demo rows. Names are demo labels, not protocol identities.</div> : null}
      {drivers.data ? <p className="mb-2 text-sm text-muted">{drivers.data.definitive ? 'Receipt coverage supports this ranking.' : 'Partial ranking.'} {drivers.data.note}</p> : null}
      <section className="panel">
        <QueryNote error={drivers.error} loading={drivers.isLoading} />
        {drivers.data ? (
          <DriverTable
            rows={rows}
            hrefFor={(row) => (groupBy === 'sender' || groupBy === 'contract') && row.key.startsWith('0x') ? entityHref('address', row.key, search) : null}
          />
        ) : null}
        <div className="mt-3 flex gap-2">
          <button type="button" className="btn" disabled={!cursor} onClick={() => setCursor(null)}>First page</button>
          <button type="button" className="btn" disabled={!drivers.data?.nextCursor} onClick={() => setCursor(drivers.data?.nextCursor ?? null)}>Next page</button>
        </div>
      </section>
    </div>
  )
}
