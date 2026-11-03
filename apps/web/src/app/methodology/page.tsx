'use client'

import type { MethodologyDto } from '@gasscope/shared'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { QueryNote } from '@/components/bits'
import { api } from '@/lib/api'
import { useGasQuery } from '@/lib/query-state'

export default function MethodologyPage() {
  const { search } = useGasQuery()
  const docs = useQuery({ queryKey: ['methodology'], queryFn: () => api<MethodologyDto>('/api/v1/methodology') })
  return (
    <div className="grid gap-3">
      <h1 className="text-2xl">Sources and methodology</h1>
      <p className="max-w-3xl text-sm text-muted">Execution gas comes from block headers and receipts. A wallet share is observed consumption. It is not a claim that the wallet was the sole cause of a base-fee move. Blob fees use a separate schedule and never enter the execution base-fee formula.</p>
      <QueryNote error={docs.error} loading={docs.isLoading} />
      {docs.data ? (
        <>
          <p className="text-xs text-muted">Formula {docs.data.formulaVersion}</p>
          {docs.data.sections.map((section) => (
            <section key={section.id} className="panel">
              <h2>{section.title}</h2>
              {section.body.map((paragraph) => <p key={paragraph} className="mt-2 text-sm leading-6 text-muted">{paragraph}</p>)}
            </section>
          ))}
          <section className="panel">
            <h2>Blob schedule compiled into this build</h2>
            <p className="text-sm text-muted">{docs.data.registryNote}</p>
            <table>
              <thead><tr><th>Name</th><th>Active from (UTC)</th><th>Target blobs</th><th>Max blobs</th><th>Update fraction</th></tr></thead>
              <tbody>
                {docs.data.blobSchedule.map((row) => (
                  <tr key={row.name}><td>{row.name}</td><td className="num">{row.timeUtc}</td><td className="num">{row.targetBlobs}</td><td className="num">{row.maxBlobs}</td><td className="num">{row.updateFraction}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : null}
      <section className="panel">
        <h2>Stored regression fixture</h2>
        <p className="text-sm text-muted">Block 26330059 is a checked example. It is not the live headline. Re-verify it against a mainnet RPC from the fixture page.</p>
        <Link className="text-cyan" href={`/fixture${search}`}>Open the fixture</Link>
      </section>
    </div>
  )
}
