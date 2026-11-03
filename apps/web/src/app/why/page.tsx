'use client'

import Link from 'next/link'
import { QueryNote, weiEth } from '@/components/bits'
import { RangeBar } from '@/components/range-bar'
import { ClassTag } from '@/components/ui'
import { entityHref, gwei, useGasQuery } from '@/lib/query-state'
import { useAnalysis } from '@/lib/use-gas'

export default function WhyPage() {
  const analysis = useAnalysis('includeChecks=true')
  const { search } = useGasQuery()
  const data = analysis.data
  return (
    <div>
      <h1 className="mb-3 text-2xl">Why gas changed</h1>
      <RangeBar />
      <QueryNote error={analysis.error} loading={analysis.isLoading} />
      {data ? (
        <div className="grid gap-3">
          {data.synthetic ? <div className="banner">Synthetic demo. The verdict describes the generated series, not mainnet.</div> : null}
          <section className="panel">
            <p className="text-xl">{data.verdict}</p>
            <p className="mt-2 text-sm text-muted">{data.ribbon}</p>
            <ul className="mt-3 grid gap-1 text-sm">{data.whatChanged.map((line) => <li key={line}>{line}</li>)}</ul>
            <p className="mt-3 text-xs text-muted">{data.formulaVersion} · {data.startUtc} → {data.endUtc} ({data.timezone})</p>
          </section>
          {data.causes.map((cause) => (
            <article key={cause.id} className="panel">
              <div className="flex flex-wrap items-center gap-2">
                <h2>{cause.rank}. {cause.title}</h2>
                <ClassTag value={cause.classification} />
                <span className="tag">{cause.confidence} confidence</span>
              </div>
              <p className="mt-2">{cause.summary}</p>
              <p className="mt-2 text-sm text-muted">
                Gas used {cause.gasUsed}
                {cause.gasShare === null ? '' : ` · ${(cause.gasShare * 100).toFixed(2)}% of execution gas`}
                · {cause.txCount} txs · failed gas {cause.failedGas} ({cause.failedTxCount} reverted)
                · burn {weiEth(cause.burnWei)} · tip {weiEth(cause.tipWei)}
                · above-target gas {cause.aboveTargetGas}
              </p>
              <p className="mt-1 text-xs text-muted">{cause.method}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {cause.links.map((link) => link.href
                  ? <a key={link.label} className="text-cyan" href={link.href} target="_blank" rel="noreferrer">{link.label}</a>
                  : <span key={link.label} className="text-muted">{link.label} unavailable{link.disabledReason ? `: ${link.disabledReason}` : ''}</span>)}
                {cause.entity?.startsWith('0x') ? <Link className="text-cyan" href={entityHref('address', cause.entity, search)}>Open address</Link> : null}
              </div>
              <details className="mt-3">
                <summary>View proof ({cause.proof.length})</summary>
                <table>
                  <thead><tr><th>Tx</th><th>Block</th><th>Gas</th><th>Method</th><th>Status</th></tr></thead>
                  <tbody>
                    {cause.proof.map((tx) => (
                      <tr key={tx.hash}>
                        <td><Link className="num text-cyan" href={entityHref('tx', tx.hash, search)}>{tx.hash.slice(0, 10)}…</Link></td>
                        <td className="num"><Link href={entityHref('block', tx.blockNumber, search)}>{tx.blockNumber}</Link></td>
                        <td className="num">{tx.gasUsed}</td>
                        <td>{tx.method ?? (tx.selector ? `Unidentified method ${tx.selector}` : 'No selector')}</td>
                        <td>{tx.status === 'reverted' ? 'Reverted, gas still consumed' : 'Success'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </article>
          ))}
          <section className="panel">
            <h2>Protocol check</h2>
            <p className="text-sm text-muted">{data.protocol.summary}</p>
            <p className="mt-2 text-sm">Mismatches {data.protocol.mismatchCount}. Above {data.protocol.above} · below {data.protocol.below} · equal {data.protocol.equal}.{data.protocol.checksTruncated ? ' The table is truncated.' : ''}</p>
            <div className="mt-3 max-h-96 overflow-auto">
              <table>
                <thead><tr><th>Parent</th><th>Child</th><th>Gas used</th><th>Target</th><th>Predicted next</th><th>Observed</th><th>Match</th></tr></thead>
                <tbody>
                  {data.protocol.checks.slice(0, 80).map((check) => (
                    <tr key={`${check.parentBlock}-${check.childBlock}`}>
                      <td className="num">{check.parentBlock}</td>
                      <td className="num">{check.childBlock ?? '—'}</td>
                      <td className="num">{check.gasUsed}</td>
                      <td className="num">{check.target}</td>
                      <td className="num">{gwei(check.predictedNextWei)}</td>
                      <td className="num">{gwei(check.observedChildWei)}</td>
                      <td>{check.match === null ? 'Gap' : check.match ? 'Match' : 'Mismatch'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <h2>Evidence</h2>
            {data.evidence.map((item) => (
              <p key={item.id} className="mt-2 text-sm"><ClassTag value={item.classification} /> {item.statement}</p>
            ))}
          </section>
        </div>
      ) : null}
    </div>
  )
}
