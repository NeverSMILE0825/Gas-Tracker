'use client'

import { useEffect, useState } from 'react'
import { QueryNote } from '@/components/bits'
import { ZONES, useGasQuery, useUpdateQuery } from '@/lib/query-state'
import { useStatus } from '@/lib/use-gas'

export default function SettingsPage() {
  const status = useStatus()
  const { tz } = useGasQuery()
  const update = useUpdateQuery()
  const [secret, setSecret] = useState('')
  const [theme, setTheme] = useState('navy')
  const [saved, setSaved] = useState<string | null>(null)
  useEffect(() => {
    setSecret(sessionStorage.getItem('gasscope-secret') ?? '')
    setTheme(document.documentElement.dataset.theme === 'graphite' ? 'graphite' : 'navy')
  }, [])
  const data = status.data
  return (
    <div className="grid gap-3">
      <h1 className="text-2xl">Settings</h1>
      <p className="max-w-3xl text-sm text-muted">RPC URLs, database credentials, and Telegram tokens stay in server environment variables. This page cannot write them.</p>
      <section className="panel grid gap-3">
        <label className="text-sm">Display time zone
          <select className="mt-1 w-full rounded-xl border border-line bg-[#0c1224] px-3 py-2" value={tz} onChange={(event) => update({ tz: event.target.value })}>
            {ZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
          </select>
        </label>
        <label className="text-sm">Surface
          <select
            className="mt-1 w-full rounded-xl border border-line bg-[#0c1224] px-3 py-2"
            value={theme}
            onChange={(event) => {
              const next = event.target.value
              setTheme(next)
              if (next === 'graphite') document.documentElement.dataset.theme = 'graphite'
              else delete document.documentElement.dataset.theme
              localStorage.setItem('gasscope-theme', next === 'graphite' ? 'graphite' : '')
            }}
          >
            <option value="navy">Navy</option>
            <option value="graphite">Graphite</option>
          </select>
        </label>
        <label className="text-sm">Mutation secret
          <input className="mt-1 w-full rounded-xl border border-line bg-transparent px-3 py-2" type="password" autoComplete="off" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="Matches INTERNAL_API_SECRET" />
        </label>
        <button
          type="button"
          className="btn btn-solid w-fit"
          onClick={() => {
            if (secret) sessionStorage.setItem('gasscope-secret', secret)
            else sessionStorage.removeItem('gasscope-secret')
            setSaved(secret ? 'Secret stored in this tab’s session only.' : 'Secret cleared.')
          }}
        >
          Save in this tab
        </button>
        {saved ? <p className="text-sm text-muted">{saved}</p> : null}
      </section>
      <section className="panel">
        <h2>Provider and coverage</h2>
        <QueryNote error={status.error} loading={status.isLoading} />
        {data ? (
          <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
            <div><dt className="text-muted">Network</dt><dd>{data.networkName}</dd></div>
            <div><dt className="text-muted">Run state</dt><dd>{data.runState}</dd></div>
            <div><dt className="text-muted">Chain id</dt><dd>{data.chainId ?? 'not a live chain'} · {data.chainIdOk ? 'accepted' : 'not confirmed as mainnet'}</dd></div>
            <div><dt className="text-muted">Indexed</dt><dd>{data.indexedBlock ?? '—'} · lag {data.lagSeconds ?? 'n/a'}s</dd></div>
            <div><dt className="text-muted">HTTP / WebSocket / fallback</dt><dd>{data.provider.httpConfigured ? 'HTTP set' : 'HTTP empty'} · socket {data.provider.websocket} · {data.provider.fallbackConfigured ? 'fallback set' : 'no fallback'}</dd></div>
            <div><dt className="text-muted">Capabilities</dt><dd>receipts {String(data.provider.capabilities.eth_getBlockReceipts)} · fee history {String(data.provider.capabilities.eth_feeHistory)} · trace {String(data.provider.capabilities.trace)}</dd></div>
            <div><dt className="text-muted">Requests / errors</dt><dd>{data.provider.requestCount} / {data.provider.errorCount}</dd></div>
            <div><dt className="text-muted">Last provider error</dt><dd>{data.provider.lastError ?? 'none'}</dd></div>
            <div><dt className="text-muted">Backfill</dt><dd>{data.backfill.completedBlocks}/{data.backfill.targetBlocks} · {data.backfill.note}</dd></div>
            <div><dt className="text-muted">Safe / finalized</dt><dd>{data.confirmation.safe ?? '—'} / {data.confirmation.finalized ?? '—'}</dd></div>
            <div className="md:col-span-2"><dt className="text-muted">Formula</dt><dd className="num">{data.formulaVersion}</dd></div>
          </dl>
        ) : null}
        {data?.warnings.map((warning) => <p key={warning} className="mt-2 text-sm text-muted">{warning}</p>)}
      </section>
    </div>
  )
}
