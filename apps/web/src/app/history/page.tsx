'use client'

import dynamic from 'next/dynamic'
import { QueryNote, weiEth } from '@/components/bits'
import { RangeBar } from '@/components/range-bar'

const ChartCanvas = dynamic(() => import('@/components/charts').then((mod) => mod.ChartCanvas), {
  ssr: false,
  loading: () => <div className="skeleton h-64" />,
})
import { pct, useGasQuery } from '@/lib/query-state'
import { useAnalysis, useChart } from '@/lib/use-gas'

export default function HistoryPage() {
  const { tz } = useGasQuery()
  const analysis = useAnalysis()
  const chart = useChart()
  const data = analysis.data
  return (
    <div>
      <h1 className="mb-2 text-2xl">Historical analysis</h1>
      <p className="mb-3 max-w-3xl text-sm text-muted">Presets follow the server clock. Pin range stores an absolute start and end. The end is exclusive. Per-block charts stop at 3 hours. The longest range is 7 days.</p>
      <RangeBar />
      <QueryNote error={analysis.error ?? chart.error} loading={analysis.isLoading || chart.isLoading} />
      {data ? (
        <div className="grid gap-3">
          {data.synthetic ? <div className="banner">This history is synthetic.</div> : null}
          <section className="metrics">
            <article className="metric"><div className="label">Start base fee</div><div className="num text-xl">{data.bounds.startBaseFeeWei ?? '—'}</div><div className="text-xs text-muted">wei</div></article>
            <article className="metric"><div className="label">End base fee</div><div className="num text-xl">{data.bounds.endBaseFeeWei ?? '—'}</div><div className="text-xs text-muted">{data.bounds.zeroBaseline ? 'Zero baseline, percent withheld' : pct(data.bounds.pctDelta)}</div></article>
            <article className="metric"><div className="label">Above target</div><div className="num text-xl up">{data.bounds.blocksAboveTarget}</div></article>
            <article className="metric"><div className="label">Below target</div><div className="num text-xl down">{data.bounds.blocksBelowTarget}</div></article>
            <article className="metric"><div className="label">Burned</div><div className="num text-xl">{weiEth(data.bounds.burnWei)}</div></article>
            <article className="metric"><div className="label">Failed gas share</div><div className="num text-xl">{data.bounds.failedGasShare === null ? 'n/a' : `${(data.bounds.failedGasShare * 100).toFixed(2)}%`}</div></article>
          </section>
          {data.compare ? (
            <section className="panel">
              <h2>Compared with the previous equal-length window</h2>
              <p className="text-sm">{data.compare.startUtc} → {data.compare.endUtc}</p>
              <p className="text-sm">Base-fee percent {pct(data.compare.baseFeePct)} · occupancy delta {data.compare.occupancyDelta ?? 'n/a'} · tx count delta {data.compare.txCountDelta} · burn delta {weiEth(data.compare.burnWeiDelta)}</p>
              <p className="text-xs text-muted">{data.compare.estimatorNote}</p>
              <ul className="mt-2 text-sm">
                {data.compare.categoryDeltas.slice(0, 6).map((row) => (
                  <li key={row.category}>{row.label}: share delta {row.shareDelta === null ? 'n/a' : pct(row.shareDelta * 100)} · gas delta {row.gasDelta}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {chart.data && chart.data.points.length > 0 ? <ChartCanvas points={chart.data.points} prior={chart.data.prior} zone={tz} onInspect={() => undefined} /> : null}
          <section className="panel">
            <h2>Coverage</h2>
            <p className="text-sm">{data.coverage.blocks} blocks · receipts complete on {data.coverage.receiptsCompleteBlocks} · transactions {data.coverage.txCount}</p>
            <ul className="mt-2 text-sm text-muted">{data.coverage.notes.map((note) => <li key={note}>{note}</li>)}</ul>
            <p className="mt-2 text-sm">{data.rankingsNote}</p>
          </section>
        </div>
      ) : null}
    </div>
  )
}
