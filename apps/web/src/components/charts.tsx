'use client'

import type { ChartPointDto } from '@gasscope/shared'
import { formatGweiFixed, parseWei } from '@gasscope/shared'
import * as echarts from 'echarts'
import { useEffect, useRef } from 'react'

function gweiNumber(wei: string): number {
  return Number(parseWei(wei)) / 1e9
}

function tip(point: ChartPointDto, zone: string): string {
  const local = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(point.t))
  const direction = point.direction === 'up' ? 'Rising' : point.direction === 'down' ? 'Falling' : 'Flat'
  const lines = [
    `${point.t} UTC`,
    `${local} (${zone})`,
    `Blocks ${point.blockStart}${point.blockEnd === point.blockStart ? '' : `–${point.blockEnd}`}`,
    `Base fee close ${formatGweiFixed(parseWei(point.baseFeeCloseWei))} gwei`,
    `Exact close ${point.baseFeeCloseWei} wei`,
    `Open ${point.baseFeeOpenWei} wei · min ${point.baseFeeMinWei} · max ${point.baseFeeMaxWei}`,
    point.parentDeltaWei ? `Bucket base-fee change ${point.parentDeltaWei} wei (${direction})` : direction,
    `Gas used ${point.gasUsed}`,
    `Dynamic target ${point.gasTarget} · limit ${point.gasLimit}`,
    `Used / target ${point.utilTarget} · used / limit ${point.utilLimit}`,
    `Blocks above / below / at target ${point.blocksAbove} / ${point.blocksBelow} / ${point.blocksEqual}`,
    `Transactions ${point.txCount}`,
    `Burn ${point.burnWei} wei · tip ${point.tipWei} wei · blob fee ${point.blobFeeWei} wei`,
    point.tipP50Wei ? `Tip p50 ${formatGweiFixed(parseWei(point.tipP50Wei))} gwei (${point.tipP50Wei} wei)` : 'Tip percentiles withheld for this bucket',
    point.tipP90Wei ? `Tip p90 ${formatGweiFixed(parseWei(point.tipP90Wei))} gwei (${point.tipP90Wei} wei)` : '',
    point.blobBaseFeeCloseWei ? `Blob base fee ${point.blobBaseFeeCloseWei} wei` : 'No blob base fee on the close block',
    `Receipt coverage ${(point.receiptCoverage * 100).toFixed(1)}%`,
  ]
  return lines.filter(Boolean).join('<br/>')
}

export function ChartCanvas({
  points,
  prior,
  zone,
  onInspect,
}: {
  points: ChartPointDto[]
  prior: ChartPointDto[] | null
  zone: string
  onInspect: (point: ChartPointDto) => void
}) {
  const feeRef = useRef<HTMLDivElement>(null)
  const useRefBar = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const blobRef = useRef<HTMLDivElement>(null)
  const inspectRef = useRef(onInspect)
  inspectRef.current = onInspect

  useEffect(() => {
    const nodes = [feeRef.current, useRefBar.current, tipRef.current, blobRef.current].filter((node): node is HTMLDivElement => Boolean(node))
    const charts = nodes.map((node) => {
      const chart = echarts.init(node)
      chart.group = 'gasscope'
      return chart
    })
    const labels = points.map((point) => point.t.slice(5, 16).replace('T', ' '))
    const axis = {
      type: 'category' as const,
      data: labels,
      axisLabel: { color: '#93a0bd', hideOverlap: true },
      axisLine: { lineStyle: { color: 'rgba(148,163,196,0.2)' } },
    }
    const y = { scale: true, axisLabel: { color: '#93a0bd' }, splitLine: { lineStyle: { color: 'rgba(148,163,196,0.08)' } } }
    const tooltip = {
      trigger: 'axis' as const,
      backgroundColor: '#0d1324',
      borderColor: 'rgba(148,163,196,0.25)',
      textStyle: { color: '#e7edf8', fontSize: 12 },
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [params]
        const index = (list[0] as { dataIndex?: number } | undefined)?.dataIndex
        if (index === undefined) return ''
        const point = points[index]
        return point ? tip(point, zone) : ''
      },
    }
    charts[0]?.setOption({
      backgroundColor: 'transparent',
      tooltip,
      grid: { left: 56, right: 16, top: 24, bottom: 36 },
      xAxis: axis,
      yAxis: { ...y, name: 'gwei', nameTextStyle: { color: '#93a0bd' } },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 4 }],
      series: [
        {
          name: 'Base fee close',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: points.map((point) => gweiNumber(point.baseFeeCloseWei)),
          areaStyle: { color: 'rgba(139,92,246,0.18)' },
          lineStyle: { color: '#8b5cf6', width: 2 },
        },
        prior
          ? {
              name: 'Prior window',
              type: 'line',
              smooth: true,
              showSymbol: false,
              data: prior.map((point) => gweiNumber(point.baseFeeCloseWei)),
              lineStyle: { color: '#22d3ee', type: 'dashed', width: 1.4 },
            }
          : null,
      ].filter(Boolean),
    })
    charts[1]?.setOption({
      tooltip,
      grid: { left: 48, right: 16, top: 24, bottom: 28 },
      xAxis: axis,
      yAxis: { ...y, name: 'vs target' },
      series: [{
        type: 'bar',
        data: points.map((point) => ({
          value: Number(point.utilTarget),
          itemStyle: { color: Number(point.utilTarget) > 1 ? '#fb7185' : Number(point.utilTarget) < 1 ? '#34d399' : '#93a0bd' },
        })),
        markLine: {
          symbol: 'none',
          data: [{ yAxis: 1, label: { show: false }, lineStyle: { color: '#e7edf8', type: 'dashed' } }],
        },
      }],
    })
    charts[2]?.setOption({
      tooltip,
      grid: { left: 56, right: 16, top: 28, bottom: 28 },
      legend: { textStyle: { color: '#93a0bd' }, top: 0 },
      xAxis: axis,
      yAxis: { ...y, name: 'gwei' },
      series: [
        { name: 'Base fee', type: 'line', showSymbol: false, data: points.map((point) => gweiNumber(point.baseFeeCloseWei)), lineStyle: { color: '#8b5cf6' } },
        { name: 'Tip p50', type: 'line', showSymbol: false, data: points.map((point) => (point.tipP50Wei ? gweiNumber(point.tipP50Wei) : null)), lineStyle: { color: '#60a5fa' } },
        { name: 'Tip p90', type: 'line', showSymbol: false, data: points.map((point) => (point.tipP90Wei ? gweiNumber(point.tipP90Wei) : null)), lineStyle: { color: '#22d3ee' } },
      ],
    })
    charts[3]?.setOption({
      tooltip,
      grid: { left: 72, right: 16, top: 24, bottom: 28 },
      xAxis: axis,
      yAxis: { ...y, name: 'wei' },
      series: [{
        name: 'Blob base fee',
        type: 'line',
        showSymbol: false,
        data: points.map((point) => (point.blobBaseFeeCloseWei ? Number(parseWei(point.blobBaseFeeCloseWei)) : null)),
        lineStyle: { color: '#fbbf24' },
      }],
    })
    echarts.connect('gasscope')
    const onClick = (event: { dataIndex?: number }) => {
      if (event.dataIndex === undefined) return
      const point = points[event.dataIndex]
      if (point) inspectRef.current(point)
    }
    charts.forEach((chart) => chart.on('click', onClick))
    const observer = new ResizeObserver(() => charts.forEach((chart) => chart.resize()))
    nodes.forEach((node) => observer.observe(node))
    return () => {
      observer.disconnect()
      charts.forEach((chart) => chart.dispose())
    }
  }, [points, prior, zone])

  return (
    <div className="grid gap-3">
      <section className="panel">
        <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3>Execution base fee</h3>
          <span className="flex items-center gap-3 text-xs text-muted">
            <span>Axis is gwei for scale. Tooltip uses the server wei string.</span>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const chart = feeRef.current ? echarts.getInstanceByDom(feeRef.current) : null
                if (!chart) return
                const url = chart.getDataURL({ type: 'png', backgroundColor: '#080c18', pixelRatio: 2 })
                const link = document.createElement('a')
                link.href = url
                link.download = 'gasscope-base-fee.png'
                link.click()
              }}
            >
              Save PNG
            </button>
          </span>
        </header>
        <div ref={feeRef} className="chart" role="img" aria-label="Execution base fee chart" />
      </section>
      <section className="panel">
        <header className="mb-2 flex items-center justify-between">
          <h3>Gas used vs dynamic target</h3>
          <span className="text-xs text-muted">100% is the target, not the gas limit. Coral is above target. Green is below.</span>
        </header>
        <div ref={useRefBar} className="chart" role="img" aria-label="Block utilization versus target" />
      </section>
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="panel">
          <header className="mb-2">
            <h3>Priority tips, separate from base fee</h3>
            <p className="text-xs text-muted">p50 and p90 are observed tips per gas. They are not quotes.</p>
          </header>
          <div ref={tipRef} className="chart" role="img" aria-label="Priority fee percentiles" />
        </section>
        <section className="panel">
          <header className="mb-2">
            <h3>Blob base fee</h3>
            <p className="text-xs text-muted">Wei, not execution gas. A flat line at 1 wei means excess blob gas is zero.</p>
          </header>
          <div ref={blobRef} className="chart" role="img" aria-label="Blob base fee" />
        </section>
      </div>
      <details className="panel">
        <summary>Chart data table</summary>
        <div className="max-h-80 overflow-auto">
          <table>
            <thead>
              <tr>
                <th>Time (UTC)</th>
                <th>Blocks</th>
                <th>Base fee gwei</th>
                <th>Base fee wei</th>
                <th>Target util</th>
                <th>Limit util</th>
                <th>Direction</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={`${point.blockStart}-${point.t}`}>
                  <td className="num">{point.t}</td>
                  <td className="num">{point.blockStart === point.blockEnd ? point.blockStart : `${point.blockStart}–${point.blockEnd}`}</td>
                  <td className="num">{formatGweiFixed(parseWei(point.baseFeeCloseWei))}</td>
                  <td className="num">{point.baseFeeCloseWei}</td>
                  <td className="num">{point.utilTarget}</td>
                  <td className="num">{point.utilLimit}</td>
                  <td>{point.direction === 'up' ? 'Rising' : point.direction === 'down' ? 'Falling' : 'Flat'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
