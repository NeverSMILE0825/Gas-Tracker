'use client'

import type { SensitivityDto } from '@gasscope/shared'
import { gwei } from '@/lib/query-state'

export function SensitivityView({ data }: { data: SensitivityDto }) {
  return (
    <div className="mt-3">
      <div className="banner">{data.banner}</div>
      <p className="text-sm">Observed end {gwei(data.observedEndBaseFeeWei)} gwei · modelled end {gwei(data.modelledEndBaseFeeWei)} gwei · blocks flipped across target {data.flippedCount}{data.stepsTruncated ? ' · step list truncated' : ''}</p>
      <ul className="mt-2 grid gap-1 text-sm text-muted">{data.assumptions.map((line) => <li key={line}>{line}</li>)}</ul>
    </div>
  )
}
