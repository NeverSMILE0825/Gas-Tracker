'use client'

import { formatGweiFixed, parseWei } from '@gasscope/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { QueryNote } from '@/components/bits'
import { ClassTag } from '@/components/ui'
import { api } from '@/lib/api'

interface FixtureBody {
  fixture: true
  disclaimer: string
  blockNumber: number
  gasUsed: string
  gasLimit: string
  gasTarget: string
  baseFeeWei: string
  txHash: string
  from: string
  to: string
  selector: string
  method: string
  txGas: string
  shareOfBlock: string
  observedNextBaseFeeWei: string
  modelledGasUsed: string
  modelledNextBaseFeeWei: string
  flippedBelowTarget: boolean
  formula: string
  links: { label: string; href: string }[]
  notIncluded: string
}

export default function FixturePage() {
  const fixture = useQuery({ queryKey: ['fixture'], queryFn: () => api<FixtureBody>('/api/v1/fixture') })
  const verify = useMutation({
    mutationFn: () => api<Record<string, unknown>>('/api/v1/fixture/verify', { method: 'POST' }),
  })
  const data = fixture.data
  return (
    <div className="grid gap-3">
      <h1 className="text-2xl">Regression fixture</h1>
      <div className="banner">Stored example. It is not the live dashboard and it is not refreshed unless you verify it against a configured mainnet RPC.</div>
      <QueryNote error={fixture.error} loading={fixture.isLoading} />
      {data ? (
        <section className="panel grid gap-2">
          <p>{data.disclaimer}</p>
          <p className="num">Block {data.blockNumber}</p>
          <p>Gas used {data.gasUsed} · limit {data.gasLimit} · target {data.gasTarget}</p>
          <p>Base fee {formatGweiFixed(parseWei(data.baseFeeWei))} gwei · {data.baseFeeWei} wei</p>
          <p>Transaction <span className="num break-all">{data.txHash}</span></p>
          <p>Sender <span className="num break-all">{data.from}</span></p>
          <p>Callee <span className="num break-all">{data.to}</span></p>
          <p><ClassTag value="UNVERIFIED" /> {data.method}</p>
          <p>Transaction gas {data.txGas} · {data.shareOfBlock} of the block’s used gas</p>
          <p>Formula next base fee {data.observedNextBaseFeeWei} wei.</p>
          <p className="text-sm text-muted">{data.formula}</p>
          <p><ClassTag value="MODELLED" /> Removing that gas leaves {data.modelledGasUsed}. Modelled next base fee {data.modelledNextBaseFeeWei} wei. {data.flippedBelowTarget ? 'That modelled block sits below target.' : 'That modelled block stays at or above target.'}</p>
          <div className="flex flex-wrap gap-3">
            {data.links.map((link) => <a key={link.label} className="text-cyan" href={link.href} target="_blank" rel="noreferrer">{link.label}</a>)}
          </div>
          <p className="text-sm">{data.notIncluded}</p>
          <button type="button" className="btn btn-solid w-fit" onClick={() => verify.mutate()} disabled={verify.isPending}>Verify against configured RPC</button>
          {verify.error ? <p className="text-sm text-[#fb7185]" role="alert">{verify.error.message}</p> : null}
          {verify.data ? <pre className="overflow-auto text-xs">{JSON.stringify(verify.data, null, 2)}</pre> : null}
        </section>
      ) : null}
    </div>
  )
}
