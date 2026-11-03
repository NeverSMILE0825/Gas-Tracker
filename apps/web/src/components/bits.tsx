'use client'

import type { DriverRowDto } from '@gasscope/shared'
import { formatEth, parseWei } from '@gasscope/shared'
import Link from 'next/link'
import { ClassTag } from '@/components/ui'
import { gwei, pct, short, useGasQuery } from '@/lib/query-state'

export function QueryNote({ error, loading, empty }: { error: Error | null; loading: boolean; empty?: string }) {
  if (loading) {
    return (
      <div className="grid gap-2" aria-busy="true">
        <div className="skeleton h-8" />
        <div className="skeleton h-24" />
      </div>
    )
  }
  if (error) {
    return <div className="state" role="alert">The API did not return this view. {error.message}</div>
  }
  if (empty) return <div className="state">{empty}</div>
  return null
}

export function weiEth(value: string | null | undefined): string {
  if (!value) return '—'
  return `${formatEth(parseWei(value))} ETH`
}

export function ExternalLinks({ links }: { links: { label: string; href: string | null; disabledReason?: string }[] }) {
  if (links.length === 0) return <span className="text-xs text-muted">No external link</span>
  return (
    <span className="flex flex-wrap gap-2">
      {links.map((link) => link.href ? (
        <a key={link.label} className="text-cyan" href={link.href} target="_blank" rel="noreferrer">{link.label}</a>
      ) : (
        <span key={link.label} className="text-xs text-muted">{link.label} unavailable{link.disabledReason ? `: ${link.disabledReason}` : ''}</span>
      ))}
    </span>
  )
}

export function DriverTable({ rows, hrefFor }: { rows: DriverRowDto[]; hrefFor?: (row: DriverRowDto) => string | null }) {
  const { search } = useGasQuery()
  if (rows.length === 0) return <div className="state">No rows in this grouping for the selected interval.</div>
  return (
    <div className="overflow-auto">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Name</th>
            <th>Category</th>
            <th>Gas used</th>
            <th>Share</th>
            <th>Txs</th>
            <th>Avg gas</th>
            <th>Priority fees</th>
            <th>Base fee burned</th>
            <th>Failed gas</th>
            <th>First</th>
            <th>Last</th>
            <th>Trend</th>
            <th>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = hrefFor?.(row)
            return (
              <tr key={row.key}>
                <td className="num">{row.rank}</td>
                <td>
                  {href ? (
                    <Link className="text-cyan" href={`${href}${search}`}>
                      {row.label}
                      <div className="text-xs text-muted">{short(row.key)}</div>
                    </Link>
                  ) : (
                    <>
                      {row.label}
                      <div className="text-xs text-muted">{short(row.key)}</div>
                    </>
                  )}
                </td>
                <td>{row.categoryLabel}</td>
                <td className="num">{row.gasUsed}</td>
                <td className="num">{row.gasShare === null ? 'n/a' : `${(row.gasShare * 100).toFixed(2)}%`}</td>
                <td className="num">{row.txCount}</td>
                <td className="num">{row.avgGas}</td>
                <td className="num">{weiEth(row.tipWei)}</td>
                <td className="num">{weiEth(row.burnWei)}</td>
                <td className="num">{row.failedGas}{row.failedTxCount ? ` (${row.failedTxCount} reverted)` : ''}</td>
                <td className="num">{row.firstTimestamp ?? '—'}</td>
                <td className="num">{row.lastTimestamp ?? '—'}</td>
                <td className="num">{row.trendShareDelta === null ? '—' : pct(row.trendShareDelta * 100)}</td>
                <td><ClassTag value={row.classification} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function gweiLabel(wei: string | null | undefined): string {
  return wei ? `${gwei(wei)} gwei` : '—'
}
