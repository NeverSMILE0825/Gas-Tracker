'use client'

import type { AddressDto, SensitivityDto } from '@gasscope/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ExternalLinks, QueryNote, weiEth } from '@/components/bits'
import { RangeBar } from '@/components/range-bar'
import { SensitivityView } from '@/components/sensitivity'
import { ClassTag } from '@/components/ui'
import { api } from '@/lib/api'
import { entityHref, short, useGasQuery } from '@/lib/query-state'

export default function AddressPage() {
  const address = useSearchParams().get('a') ?? ''
  const { qs, search } = useGasQuery()
  const detail = useQuery({
    queryKey: ['address', address, qs],
    enabled: address.length > 0,
    queryFn: () => api<AddressDto>(`/api/v1/address/${address}?${qs}`),
  })
  const model = useMutation({
    mutationFn: () => api<SensitivityDto>('/api/v1/sensitivity', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...Object.fromEntries(new URLSearchParams(qs)), sender: address }),
    }),
  })
  const data = detail.data
  return (
    <div>
      <h1 className="mb-2 text-2xl">Address</h1>
      <p className="num mb-3 break-all text-sm">{address || 'Choose an address from a driver or transaction.'}</p>
      <RangeBar />
      <QueryNote error={detail.error} loading={detail.isLoading} />
      {data ? (
        <div className="grid gap-3">
          {data.synthetic ? <div className="banner">Synthetic activity for {data.label ?? 'an unlabelled demo address'}. This is not a mainnet identity.</div> : null}
          {data.label ? <p>{data.label}</p> : null}
          <section className="panel">
            <p>Gas sent {data.gasUsed}{data.gasShare === null ? '' : ` · ${(data.gasShare * 100).toFixed(2)}% of window gas`}</p>
            <p className="text-sm">Transactions sent {data.txCount} · failed gas {data.failedGas} · burn {weiEth(data.burnWei)} · tip {weiEth(data.tipWei)} · execution fees {weiEth(data.executionFeeWei)}</p>
            <p className="mt-2 text-sm text-muted">{data.note}</p>
            <div className="mt-2"><ExternalLinks links={data.links} /></div>
            <button type="button" className="btn btn-solid mt-3" onClick={() => model.mutate()} disabled={model.isPending}>Model removal of this sender</button>
            {model.error ? <p className="mt-2 text-sm text-[#fb7185]" role="alert">{model.error.message}</p> : null}
            {model.data ? <SensitivityView data={model.data} /> : null}
          </section>
          <section className="panel">
            <h2>Categories touched by transactions this address sent</h2>
            <ul className="mt-2 grid gap-1 text-sm">
              {data.categories.map((category) => (
                <li key={category.category}><ClassTag value={category.classification} /> {category.label} · {category.gasUsed} gas · {category.share === null ? 'n/a' : `${(category.share * 100).toFixed(1)}%`}</li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <h2>Transactions</h2>
            <table>
              <thead><tr><th>Tx</th><th>Block</th><th>To</th><th>Gas</th><th>Method</th><th>Status</th></tr></thead>
              <tbody>
                {data.transactions.map((tx) => (
                  <tr key={tx.hash}>
                    <td><Link className="num text-cyan" href={entityHref('tx', tx.hash, search)}>{short(tx.hash)}</Link></td>
                    <td className="num">{tx.blockNumber}</td>
                    <td className="num">{tx.to ? short(tx.to) : 'create'}</td>
                    <td className="num">{tx.gasUsed}</td>
                    <td>{tx.method ?? (tx.selector ? `Unidentified method ${tx.selector}` : 'No selector')}</td>
                    <td>{tx.status === 'reverted' ? 'Reverted' : 'Success'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      ) : null}
    </div>
  )
}
