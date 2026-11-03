'use client'

import type { BlockDetailDto } from '@gasscope/shared'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ExternalLinks, QueryNote, weiEth } from '@/components/bits'
import { entityHref, gwei, short, useGasQuery } from '@/lib/query-state'
import { api } from '@/lib/api'

export default function BlockPage() {
  const number = useSearchParams().get('n') ?? ''
  const { search } = useGasQuery()
  const block = useQuery({
    queryKey: ['block', number],
    enabled: number.length > 0,
    queryFn: () => api<BlockDetailDto>(`/api/v1/blocks/${number}`),
  })
  const data = block.data
  return (
    <div>
      <h1 className="mb-3 text-2xl">Block {number || '—'}</h1>
      <QueryNote error={block.error} loading={block.isLoading} />
      {data?.synthetic ? <div className="banner">Synthetic block. Etherscan links stay disabled.</div> : null}
      {data ? (
        <div className="grid gap-3">
          <section className="panel">
            <p className="num text-3xl">{gwei(data.baseFeeWei)} gwei</p>
            <p className="text-sm text-muted">{data.timestamp} · {data.txCount} transactions · receipts {data.receiptsComplete ? 'complete' : 'incomplete'} · {data.confirmation}</p>
            <p className="mt-2 text-sm">Gas used {data.gasUsed} · target {data.gasTarget} · limit {data.gasLimit}</p>
            <p className="text-sm">Blob base fee {data.blobBaseFeeWei ?? '—'} wei · blob gas used {data.blobGasUsed ?? '—'} · blob target {data.blobTarget ?? '—'}</p>
            <p className="mt-2 text-sm">Burn {weiEth(data.totals.burnWei)} · tip {weiEth(data.totals.tipWei)} · blob fee {weiEth(data.totals.blobFeeWei)} · failed gas {data.totals.failedGas}</p>
            <div className="mt-2"><ExternalLinks links={data.links} /></div>
          </section>
          <section className="grid gap-3 lg:grid-cols-2">
            <MathCard title="Why this base fee" math={data.parentMath} />
            <article className="panel">
              <h2>What this block does to the next fee</h2>
              {data.nextMath ? (
                <p className="mt-2 text-sm">
                  Predicted next base fee {gwei(data.nextMath.predictedWei)} gwei ({data.nextMath.predictedWei} wei).
                  Observed child {data.nextMath.observedWei ? `${gwei(data.nextMath.observedWei)} gwei` : 'not indexed yet'}.
                  {' '}{data.nextMath.direction === 'up' ? 'Rising' : data.nextMath.direction === 'down' ? 'Falling' : 'Flat'}.
                  Match {data.nextMath.match === null ? 'unknown' : data.nextMath.match ? 'yes' : 'no'}.
                </p>
              ) : <p className="text-sm text-muted">Next-fee math is unavailable.</p>}
            </article>
          </section>
          <section className="grid gap-3 lg:grid-cols-2">
            <Rank title="Top senders in this block" rows={data.topSenders} search={search} />
            <Rank title="Top called contracts in this block" rows={data.topContracts} search={search} />
          </section>
          <section className="panel">
            <h2>Transactions</h2>
            {data.transactions.length === 0 ? <div className="state">Receipts for this block were not stored.</div> : (
              <div className="overflow-auto">
                <table>
                  <thead><tr><th>Tx</th><th>From</th><th>To</th><th>Gas</th><th>Method</th><th>Status</th><th>Burn</th><th>Tip</th></tr></thead>
                  <tbody>
                    {data.transactions.map((tx) => (
                      <tr key={tx.hash}>
                        <td><Link className="num text-cyan" href={entityHref('tx', tx.hash, search)}>{short(tx.hash)}</Link></td>
                        <td><Link className="num" href={entityHref('address', tx.from, search)}>{short(tx.from)}</Link></td>
                        <td>{tx.to ? <Link className="num" href={entityHref('address', tx.to, search)}>{short(tx.to)}</Link> : 'Contract create'}</td>
                        <td className="num">{tx.gasUsed}</td>
                        <td>{tx.method ?? (tx.selector ? `Unidentified method ${tx.selector}` : 'No selector')}</td>
                        <td>{tx.status === 'reverted' ? 'Reverted' : 'Success'}</td>
                        <td className="num">{weiEth(tx.baseBurnWei)}</td>
                        <td className="num">{weiEth(tx.tipWei)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  )
}

function MathCard({ title, math }: { title: string; math: BlockDetailDto['parentMath'] }) {
  return (
    <article className="panel">
      <h2>{title}</h2>
      {math ? (
        <div className="mt-2 text-sm">
          <p>Parent {math.parentNumber} used {math.parentGasUsed} gas against target {math.parentTarget}.</p>
          <p>Parent base fee {gwei(math.parentBaseFeeWei)} gwei. Predicted {gwei(math.predictedWei)} gwei. Observed {gwei(math.observedWei)} gwei.</p>
          <p>{math.direction === 'up' ? 'Rising' : math.direction === 'down' ? 'Falling' : 'Flat'} · {math.match ? 'Formula matches the header' : 'Formula does not match the header'}</p>
          <p className="mt-2 text-xs text-muted">{math.formula}</p>
        </div>
      ) : <p className="mt-2 text-sm text-muted">The parent block is outside the indexed window, so this header is shown without a local proof.</p>}
    </article>
  )
}

function Rank({ title, rows, search }: { title: string; rows: { address: string; gasUsed: string; share: number | null; txCount: number }[]; search: string }) {
  return (
    <article className="panel">
      <h2>{title}</h2>
      <table>
        <thead><tr><th>Address</th><th>Gas</th><th>Share</th><th>Txs</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.address}>
              <td>{row.address.startsWith('0x') ? <Link className="num text-cyan" href={entityHref('address', row.address, search)}>{short(row.address)}</Link> : row.address}</td>
              <td className="num">{row.gasUsed}</td>
              <td className="num">{row.share === null ? 'n/a' : `${(row.share * 100).toFixed(2)}%`}</td>
              <td className="num">{row.txCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  )
}
