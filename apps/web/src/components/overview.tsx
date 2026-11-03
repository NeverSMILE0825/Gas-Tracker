'use client'

import type { ChartDto, ChartPointDto } from '@gasscope/shared'
import { formatInZone, parseWei } from '@gasscope/shared'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useMemo } from 'react'
import { DriverTable, QueryNote, gweiLabel, weiEth } from '@/components/bits'

const ChartCanvas = dynamic(() => import('@/components/charts').then((mod) => mod.ChartCanvas), {
  ssr: false,
  loading: () => <div className="skeleton h-64" />,
})
import { RangeBar } from '@/components/range-bar'
import { ClassTag, Tip } from '@/components/ui'
import { download, entityHref, gwei, pct, useGasQuery, useUpdateQuery } from '@/lib/query-state'
import { useAnalysis, useChart, useCurrent, useDrivers, useStatus } from '@/lib/use-gas'

function tone(pctValue: number | null | undefined, zero: boolean | undefined): string {
  if (zero || pctValue === null || pctValue === undefined || pctValue === 0) return 'flat'
  return pctValue > 0 ? 'up' : 'down'
}

function arrow(pctValue: number | null | undefined, zero: boolean | undefined): string {
  const kind = tone(pctValue, zero)
  if (kind === 'up') return '↑ Rising'
  if (kind === 'down') return '↓ Falling'
  return '→ Stable'
}

export function Overview() {
  const { tz, search } = useGasQuery()
  const update = useUpdateQuery()
  const status = useStatus()
  const current = useCurrent()
  const analysis = useAnalysis()
  const chart = useChart()
  const consumers = useDrivers('sender', 'gasUsed', 8)
  const spenders = useDrivers('sender', 'fees', 8)
  const categories = useDrivers('category', 'gasUsed', 8)
  const gas = current.data
  const move = analysis.data
  const fifteen = gas?.deltas.find((delta) => delta.window === '15m')
  const heroTone = tone(fifteen?.baseFeePct, fifteen?.zeroBaseline)
  const selected = useMemo(() => {
    const block = new URLSearchParams(search.slice(1)).get('inspect')
    if (!block || !chart.data) return null
    return chart.data.points.find((point) => String(point.blockEnd) === block || String(point.blockStart) === block) ?? null
  }, [chart.data, search])

  return (
    <div className="grid gap-3">
      <StatusLine />
      {status.data?.synthetic || gas?.synthetic ? (
        <div className="banner" role="status">
          Demo data. {status.data?.networkName ?? 'Demo chain (synthetic)'}. These blocks are generated in-process and are not Ethereum mainnet.
        </div>
      ) : null}
      <RangeBar onExport={(kind) => exportChart(kind, chart.data)} />
      <section className="hero">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted">Gas right now</p>
            <p className={`hero-fee num ${heroTone}`}>{gas ? gwei(gas.baseFeeWei) : '—'}</p>
            <p className="mt-1 text-sm text-muted">execution base fee, gwei · {arrow(fifteen?.baseFeePct, fifteen?.zeroBaseline)} over 15m</p>
          </div>
          <div className="max-w-md text-sm text-muted">
            {gas?.asOf ? `As of block ${gas.blockNumber} · ${formatInZone(Date.parse(gas.asOf), tz)}` : 'Waiting for a block'}
            <div className="mt-2">{gas?.estimateMethodology}</div>
          </div>
        </div>
        <QueryNote error={current.error} loading={current.isLoading} />
        {gas ? (
          <div className="metrics">
            {gas.estimates.map((estimate) => (
              <Tip key={estimate.label} text={`${estimate.label} is latest base fee plus an observed priority percentile. ${estimate.totalWei ?? 'unavailable'} wei per gas. Estimate, not a quote.`}>
                <article className="metric">
                  <div className="label">{estimate.label} estimate</div>
                  <div className="num mt-1 text-xl">{gweiLabel(estimate.totalWei)}</div>
                  <div className="text-xs text-muted">includes tip {gweiLabel(estimate.priorityWei)}</div>
                </article>
              </Tip>
            ))}
            {gas.deltas.map((delta) => (
              <article key={delta.window} className="metric">
                <div className="label">{delta.window} base fee</div>
                <div className={`num mt-1 text-xl ${tone(delta.baseFeePct, delta.zeroBaseline)}`}>{arrow(delta.baseFeePct, delta.zeroBaseline)}</div>
                <div className="num text-xs">{delta.zeroBaseline ? 'Zero baseline' : pct(delta.baseFeePct)} · {gweiLabel(delta.baseFeeDeltaWei)}</div>
              </article>
            ))}
            <article className="metric">
              <div className="label">Latest block vs target</div>
              <div className="num mt-1 text-xl">{gas.utilizationTarget === null ? '—' : `${(gas.utilizationTarget * 100).toFixed(1)}%`}</div>
              <div className="text-xs text-muted">of limit {(gas.utilizationLimit === null ? '—' : `${(gas.utilizationLimit * 100).toFixed(1)}%`)} · target {gas.gasTarget}</div>
            </article>
            <article className="metric">
              <div className="label">Priority p50 / p90</div>
              <div className="num mt-1 text-xl">{gwei(gas.priority.p50Wei)}</div>
              <div className="text-xs text-muted">p90 {gweiLabel(gas.priority.p90Wei)} · {gas.priority.samples} samples</div>
            </article>
            <article className="metric">
              <div className="label">Simple transfer estimate</div>
              <div className="num mt-1 text-xl">{weiEth(gas.simpleTransferWei)}</div>
              <div className="text-xs text-muted">21,000 gas × Standard. No USD price feed.</div>
            </article>
            <article className="metric">
              <div className="label">Blob base fee</div>
              <div className="num mt-1 text-xl">{gas.blobBaseFeeWei ? `${gas.blobBaseFeeWei} wei` : '—'}</div>
              <div className="text-xs text-muted">{gas.blobSchedule ?? 'schedule unknown'} · not execution gas</div>
            </article>
          </div>
        ) : null}
      </section>
      {move ? <div className="ribbon" role="status"><strong>{move.ribbon}</strong></div> : null}
      <QueryNote error={chart.error ?? analysis.error} loading={chart.isLoading || analysis.isLoading} />
      {chart.data && chart.data.points.length > 0 ? (
        <ChartCanvas
          points={chart.data.points}
          prior={chart.data.prior}
          zone={tz}
          onInspect={(point) => update({ inspect: String(point.blockEnd) })}
        />
      ) : chart.data ? <div className="state">No blocks in this interval. Widen the range or wait for the next indexed block.</div> : null}
      {chart.data?.note ? <p className="text-xs text-muted">{chart.data.note} Coverage {(chart.data.coverage * 100).toFixed(1)}%.</p> : null}
      {selected ? <Inspect point={selected} search={search} /> : null}
      <section className="grid-2">
        <article className="panel">
          <header className="mb-2 flex items-center justify-between gap-3">
            <h2>Why did gas move?</h2>
            <Link className="text-sm text-cyan" href={`/why${search}`}>Open the full explanation</Link>
          </header>
          {move ? (
            <>
              <p className="text-lg leading-snug">{move.verdict}</p>
              <ul className="mt-3 grid gap-2 text-sm text-muted">
                {move.whatChanged.map((line) => <li key={line}>{line}</li>)}
              </ul>
              {move.causes.slice(0, 4).map((cause) => (
                <div key={cause.id} className="cause">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{cause.rank}. {cause.title}</strong>
                    <ClassTag value={cause.classification} />
                  </div>
                  <p className="mt-1 text-sm text-muted">{cause.summary}</p>
                </div>
              ))}
              {move.unknownGasShare !== null ? (
                <p className="mt-3 text-sm">Unclassified gas share {(move.unknownGasShare * 100).toFixed(2)}%. {move.rankingsNote}</p>
              ) : null}
            </>
          ) : null}
        </article>
        <article className="panel">
          <h2>How this block’s fee splits</h2>
          <p className="mt-1 text-sm text-muted">Fee paid is burned execution base fee, plus priority fee, plus blob fee when the receipt has blob gas. ETH transferred is not a gas fee.</p>
          {gas?.illustration ? (
            <FeeSplit burn={gas.illustration.burnWei} tip={gas.illustration.tipWei} blob={gas.illustration.blobFeeWei} note={gas.illustration.note} value={gas.illustration.valueWei} />
          ) : move ? (
            <FeeSplit burn={move.bounds.burnWei} tip={move.bounds.tipWei} blob={move.bounds.blobFeeWei} note="Window totals from receipts. Blob fee stays in its own column." />
          ) : null}
          <h3 className="mt-4">Category gas share</h3>
          <p className="text-xs text-muted">Exclusive category grouping for this window. Shares are not added to sender shares.</p>
          <div className="mt-3 grid gap-2">
            {(categories.data?.rows ?? []).map((row) => (
              <div key={row.key}>
                <div className="flex justify-between text-xs"><span>{row.label}</span><span className="num">{row.gasShare === null ? 'n/a' : `${(row.gasShare * 100).toFixed(1)}%`}</span></div>
                <div className="mt-1 h-2 rounded-full bg-white/5"><div className="h-2 rounded-full bg-violet" style={{ width: `${Math.min(100, (row.gasShare ?? 0) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </article>
      </section>
      <section className="grid-2">
        <article className="panel">
          <h2>Top gas consumers</h2>
          <p className="mb-2 text-xs text-muted">Ranked by execution gas used. {consumers.data?.note}</p>
          <QueryNote error={consumers.error} loading={consumers.isLoading} />
          {consumers.data ? <DriverTable rows={consumers.data.rows} hrefFor={(row) => row.key.startsWith('0x') ? entityHref('address', row.key, search) : null} /> : null}
        </article>
        <article className="panel">
          <h2>Top gas spenders</h2>
          <p className="mb-2 text-xs text-muted">Same senders, ranked by execution fees paid (burn + tip). Blob fees are a separate column on the drivers page.</p>
          <QueryNote error={spenders.error} loading={spenders.isLoading} />
          {spenders.data ? <DriverTable rows={spenders.data.rows} hrefFor={(row) => row.key.startsWith('0x') ? entityHref('address', row.key, search) : null} /> : null}
        </article>
      </section>
      {move && move.events.length > 0 ? (
        <section className="panel">
          <h2>Critical events</h2>
          <ul className="mt-2 grid gap-2">
            {move.events.slice(0, 8).map((event) => (
              <li key={event.id}>
                <button type="button" className="w-full rounded-xl border border-line px-3 py-2 text-left" onClick={() => update({ inspect: String(event.blockNumber) })}>
                  <span className="text-xs text-muted">{event.t} · block {event.blockNumber} · {event.severity}</span>
                  <div>{event.title}</div>
                  <div className="text-sm text-muted">{event.detail}</div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function StatusLine() {
  const status = useStatus()
  const data = status.data
  if (status.error) return <div className="state" role="alert">Status is unavailable. {status.error.message}</div>
  if (!data) return <div className="skeleton h-10" />
  const age = Math.max(0, Math.round((Date.now() - Date.parse(data.updatedAt)) / 1000))
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="tag exact">{data.networkName}</span>
      <span className="tag">{data.runState}</span>
      <span className="text-muted">Latest block <span className="num text-ink">{data.latestBlock ?? '—'}</span></span>
      <span className="text-muted">Updated {age}s ago</span>
      <span className="text-muted">15m receipt coverage {data.receiptCoverage15m === null ? 'n/a' : `${(data.receiptCoverage15m * 100).toFixed(1)}%`}</span>
      {data.warnings.slice(0, 2).map((warning) => <span key={warning} className="text-xs text-muted">{warning}</span>)}
    </div>
  )
}

function Inspect({ point, search }: { point: ChartPointDto; search: string }) {
  return (
    <section className="panel" id="inspect">
      <h2>Inspected bucket</h2>
      <p className="text-sm text-muted">{point.t} · blocks {point.blockStart}–{point.blockEnd} · {point.direction === 'up' ? 'Rising' : point.direction === 'down' ? 'Falling' : 'Flat'}</p>
      <p className="num mt-2">{gwei(point.baseFeeCloseWei)} gwei · {point.baseFeeCloseWei} wei · target util {point.utilTarget} · limit util {point.utilLimit}</p>
      <Link className="mt-2 inline-block text-cyan" href={entityHref('block', point.blockEnd, search)}>Open block {point.blockEnd}</Link>
    </section>
  )
}

function FeeSplit({ burn, tip, blob, note, value }: { burn: string; tip: string; blob: string; note: string; value?: string }) {
  const parts = [
    { label: 'Base fee burned', wei: burn, color: '#8b5cf6' },
    { label: 'Priority fee', wei: tip, color: '#22d3ee' },
    { label: 'Blob fee', wei: blob, color: '#fbbf24' },
  ]
  const amounts = parts.map((part) => {
    try { return parseWei(part.wei) } catch { return 0n }
  })
  const total = amounts.reduce((sum, amount) => sum + amount, 0n)
  return (
    <div className="mt-3">
      <div className="fee-stack" aria-hidden="true">
        {parts.map((part, index) => (
          <div key={part.label} style={{ width: total > 0n ? `${Number((amounts[index]! * 10_000n) / total) / 100}%` : '0%', background: part.color }} />
        ))}
      </div>
      <ul className="mt-2 grid gap-1 text-sm">
        {parts.map((part) => <li key={part.label}>{part.label}: {weiEth(part.wei)} <span className="num text-xs text-muted">{part.wei} wei</span></li>)}
        {value ? <li>ETH transferred, not a fee: {weiEth(value)}</li> : null}
      </ul>
      <p className="mt-2 text-xs text-muted">{note}</p>
    </div>
  )
}

function exportChart(kind: 'csv' | 'json', chart: ChartDto | undefined) {
  if (!chart) return
  if (kind === 'json') {
    download('gasscope-chart.json', JSON.stringify(chart, null, 2), 'application/json')
    return
  }
  const header = ['t', 'blockStart', 'blockEnd', 'baseFeeCloseWei', 'gasUsed', 'gasTarget', 'gasLimit', 'utilTarget', 'utilLimit', 'direction', 'burnWei', 'tipWei', 'blobFeeWei']
  const lines = [header.join(',')]
  for (const point of chart.points) {
    lines.push(header.map((key) => String(point[key as keyof ChartPointDto] ?? '')).join(','))
  }
  download('gasscope-chart.csv', lines.join('\n'), 'text/csv')
}
