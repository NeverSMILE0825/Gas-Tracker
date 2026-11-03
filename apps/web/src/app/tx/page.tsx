'use client'

import type { SensitivityDto, TxDetailDto } from '@gasscope/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ExternalLinks, QueryNote, weiEth } from '@/components/bits'
import { SensitivityView } from '@/components/sensitivity'
import { ClassTag } from '@/components/ui'
import { api } from '@/lib/api'
import { entityHref, gwei, useGasQuery } from '@/lib/query-state'

export default function TxPage() {
  const hash = useSearchParams().get('h') ?? ''
  const { search, qs } = useGasQuery()
  const tx = useQuery({
    queryKey: ['tx', hash],
    enabled: hash.length > 0,
    queryFn: () => api<TxDetailDto>(`/api/v1/transactions/${hash}`),
  })
  const model = useMutation({
    mutationFn: () => api<SensitivityDto>('/api/v1/sensitivity', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...Object.fromEntries(new URLSearchParams(qs)), txHash: hash }),
    }),
  })
  const data = tx.data
  return (
    <div>
      <h1 className="mb-3 text-2xl">Transaction</h1>
      <QueryNote error={tx.error} loading={tx.isLoading} />
      {data ? (
        <div className="grid gap-3">
          {data.synthetic ? <div className="banner">Synthetic transaction. It is not on Ethereum mainnet.</div> : null}
          <section className="panel">
            <p className="num break-all">{data.hash}</p>
            <p className="mt-2 text-sm">Block <Link className="text-cyan" href={entityHref('block', data.blockNumber, search)}>{data.blockNumber}</Link> · index {data.txIndex} · {data.timestamp}</p>
            <p className="mt-2">From <Link className="num text-cyan" href={entityHref('address', data.from, search)}>{data.from}</Link></p>
            <p>To {data.to ? <Link className="num text-cyan" href={entityHref('address', data.to, search)}>{data.to}</Link> : 'Contract creation'}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ClassTag value={data.classification} />
              <span className="tag">{data.categoryLabel}</span>
              <span className="tag">{data.status === 'reverted' ? 'Reverted — gas still consumed' : 'Success'}</span>
            </div>
            <p className="mt-3">{data.method ?? (data.selector ? `Unidentified method ${data.selector}` : 'No calldata selector')}</p>
            <p className="text-xs text-muted">{data.provenance}</p>
            <p className="mt-3 text-sm">Gas used {data.gasUsed} of limit {data.gasLimit}{data.shareOfBlockGas === null ? '' : ` · ${(data.shareOfBlockGas * 100).toFixed(2)}% of block gas used`}</p>
            <p className="text-sm">Base fee {gwei(data.baseFeePerGasWei)} gwei · effective price {gwei(data.effectiveGasPriceWei)} gwei</p>
            <p className="text-sm">Burn {weiEth(data.baseBurnWei)} · tip {weiEth(data.tipWei)} · execution fee {weiEth(data.executionFeeWei)} · blob fee {weiEth(data.blobFeeWei)} · value transferred {weiEth(data.valueWei)}</p>
            <p className="mt-2 text-sm text-muted">{data.note}</p>
            <div className="mt-2"><ExternalLinks links={data.links} /></div>
          </section>
          <section className="panel">
            <h2>Modelled removal</h2>
            <p className="text-sm text-muted">Replays the open interval with this transaction’s gas removed. The result is labelled modelled. It is not a claim that the sender caused the network move.</p>
            <button type="button" className="btn btn-solid mt-3" onClick={() => model.mutate()} disabled={model.isPending}>Run counterfactual</button>
            {model.error ? <p className="mt-2 text-sm text-[#fb7185]" role="alert">{model.error.message}</p> : null}
            {model.data ? <SensitivityView data={model.data} /> : null}
          </section>
        </div>
      ) : null}
    </div>
  )
}
