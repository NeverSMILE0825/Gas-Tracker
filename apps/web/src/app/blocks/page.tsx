'use client'

import { formatGweiFixed, parseWei } from '@gasscope/shared'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { QueryNote } from '@/components/bits'
import { RangeBar } from '@/components/range-bar'
import { api } from '@/lib/api'
import { entityHref, useGasQuery } from '@/lib/query-state'

interface BlockRow {
  number: number
  timestamp: string
  baseFeeWei: string
  gasUsed: string
  gasTarget: string
  gasLimit: string
  utilTarget: number | null
  txCount: number
  receiptsComplete: boolean
  direction: 'up' | 'down' | 'flat'
}

export default function BlocksPage() {
  const { qs, search } = useGasQuery()
  const list = useQuery({
    queryKey: ['blocks', qs],
    queryFn: () => api<{ from: string; to: string; truncated: boolean; blocks: BlockRow[] }>(`/api/v1/blocks?${qs}`),
  })
  return (
    <div>
      <h1 className="mb-3 text-2xl">Block explorer</h1>
      <RangeBar />
      <QueryNote error={list.error} loading={list.isLoading} />
      {list.data ? (
        <section className="panel">
          {list.data.truncated ? <p className="mb-2 text-sm text-muted">Showing the latest 300 blocks in this interval.</p> : null}
          {list.data.blocks.length === 0 ? <div className="state">No indexed blocks in this interval.</div> : (
            <div className="overflow-auto">
              <table>
                <thead>
                  <tr><th>Block</th><th>Time (UTC)</th><th>Base fee gwei</th><th>Direction</th><th>Gas used</th><th>Target</th><th>Used / target</th><th>Txs</th><th>Receipts</th></tr>
                </thead>
                <tbody>
                  {[...list.data.blocks].reverse().map((block) => (
                    <tr key={block.number}>
                      <td><Link className="num text-cyan" href={entityHref('block', block.number, search)}>{block.number}</Link></td>
                      <td className="num">{block.timestamp}</td>
                      <td className="num">{formatGweiFixed(parseWei(block.baseFeeWei))}</td>
                      <td className={block.direction === 'up' ? 'up' : block.direction === 'down' ? 'down' : 'flat'}>{block.direction === 'up' ? 'Rising' : block.direction === 'down' ? 'Falling' : 'Flat'}</td>
                      <td className="num">{block.gasUsed}</td>
                      <td className="num">{block.gasTarget}</td>
                      <td className="num">{block.utilTarget === null ? 'n/a' : block.utilTarget.toFixed(4)}</td>
                      <td className="num">{block.txCount}</td>
                      <td>{block.receiptsComplete ? 'Complete' : 'Incomplete'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}
