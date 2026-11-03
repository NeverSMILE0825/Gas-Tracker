'use client'

import type { AlertFiringDto, AlertRuleDto } from '@gasscope/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { QueryNote } from '@/components/bits'
import { api } from '@/lib/api'

const KINDS = [
  ['basefee_above', 'Base fee stays above a gwei level'],
  ['basefee_below', 'Base fee stays below a gwei level'],
  ['basefee_change_pct', 'Base fee rises or falls by a percent'],
  ['consecutive_target', 'Consecutive blocks above or below target'],
  ['wallet_share', 'A sender’s share of recent gas'],
  ['large_tx', 'A single transaction above a gas amount'],
  ['index_stale', 'Indexer lag'],
] as const

export default function AlertsPage() {
  const client = useQueryClient()
  const rules = useQuery({ queryKey: ['alerts'], queryFn: () => api<{ rules: AlertRuleDto[] }>('/api/v1/alerts') })
  const firings = useQuery({ queryKey: ['firings'], queryFn: () => api<{ firings: AlertFiringDto[] }>('/api/v1/alerts/firings') })
  const [form, setForm] = useState({
    name: 'Base fee jump',
    kind: 'basefee_change_pct',
    gwei: '20',
    minutes: '5',
    percent: '15',
    intervalMinutes: '15',
    direction: 'above',
    count: '5',
    address: '',
    share: '0.2',
    gas: '5000000',
    staleSeconds: '120',
    cooldownSec: '300',
  })
  const [notice, setNotice] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => api<AlertRuleDto>('/api/v1/alerts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        kind: form.kind,
        cooldownSec: Number(form.cooldownSec),
        enabled: true,
        config: {
          gwei: Number(form.gwei),
          minutes: Number(form.minutes),
          percent: Number(form.percent),
          intervalMinutes: Number(form.intervalMinutes),
          direction: form.direction,
          count: Number(form.count),
          address: form.address || undefined,
          share: Number(form.share),
          gas: Number(form.gas),
          staleSeconds: Number(form.staleSeconds),
        },
      }),
    }),
    onSuccess: async () => {
      setNotice('Rule saved on the API. The worker evaluates it. This page does not run the rule on a timer.')
      await client.invalidateQueries({ queryKey: ['alerts'] })
    },
  })

  return (
    <div className="grid gap-3">
      <h1 className="text-2xl">Alerts</h1>
      <p className="max-w-3xl text-sm text-muted">Rules persist in the API store. A configured worker is what fires them. Telegram and email send only when those server variables are set. Browser notifications below only repeat firings the API already recorded.</p>
      <section className="panel">
        <h2>New rule</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
          <label className="text-sm">Name<input className="mt-1 w-full rounded-xl border border-line bg-transparent px-3 py-2" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label className="text-sm">Kind
            <select className="mt-1 w-full rounded-xl border border-line bg-[#0c1224] px-3 py-2" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
              {KINDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <Field label="Gwei threshold" value={form.gwei} onChange={(gwei) => setForm({ ...form, gwei })} />
          <Field label="Minutes held" value={form.minutes} onChange={(minutes) => setForm({ ...form, minutes })} />
          <Field label="Percent" value={form.percent} onChange={(percent) => setForm({ ...form, percent })} />
          <Field label="Change window minutes" value={form.intervalMinutes} onChange={(intervalMinutes) => setForm({ ...form, intervalMinutes })} />
          <label className="text-sm">Target direction
            <select className="mt-1 w-full rounded-xl border border-line bg-[#0c1224] px-3 py-2" value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value })}>
              <option value="above">Above target</option>
              <option value="below">Below target</option>
            </select>
          </label>
          <Field label="Consecutive blocks" value={form.count} onChange={(count) => setForm({ ...form, count })} />
          <Field label="Sender address" value={form.address} onChange={(address) => setForm({ ...form, address })} />
          <Field label="Share (0–1)" value={form.share} onChange={(share) => setForm({ ...form, share })} />
          <Field label="Large-tx gas" value={form.gas} onChange={(gas) => setForm({ ...form, gas })} />
          <Field label="Stale seconds" value={form.staleSeconds} onChange={(staleSeconds) => setForm({ ...form, staleSeconds })} />
          <Field label="Cooldown seconds" value={form.cooldownSec} onChange={(cooldownSec) => setForm({ ...form, cooldownSec })} />
          <div className="md:col-span-2">
            <button className="btn btn-solid" type="submit" disabled={save.isPending}>Save rule</button>
            {save.error ? <p className="mt-2 text-sm text-[#fb7185]" role="alert">{save.error.message}</p> : null}
            {notice ? <p className="mt-2 text-sm text-muted">{notice}</p> : null}
          </div>
        </form>
      </section>
      <section className="panel">
        <h2>Saved rules</h2>
        <QueryNote error={rules.error} loading={rules.isLoading} />
        {(rules.data?.rules ?? []).length === 0 && !rules.isLoading ? <div className="state">No rules yet.</div> : null}
        <ul className="grid gap-2">
          {(rules.data?.rules ?? []).map((rule) => <RuleRow key={rule.id} rule={rule} />)}
        </ul>
      </section>
      <section className="panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2>Firing history</h2>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              if (!('Notification' in window)) {
                setNotice('This browser has no Notification API.')
                return
              }
              const permission = await Notification.requestPermission()
              setNotice(permission === 'granted' ? 'Browser notifications allowed. New firings from the API can be shown.' : 'Browser notifications were not allowed.')
              if (permission === 'granted') {
                const latest = firings.data?.firings[0]
                if (latest) new Notification('GasScope', { body: `Latest firing ${latest.dedupeKey}` })
              }
            }}
          >
            Enable browser notifications
          </button>
        </div>
        <QueryNote error={firings.error} loading={firings.isLoading} />
        {(firings.data?.firings ?? []).length === 0 && !firings.isLoading ? <div className="state">No firings recorded.</div> : null}
        <ul className="mt-2 grid gap-2 text-sm">
          {(firings.data?.firings ?? []).map((firing) => (
            <li key={firing.id} className="rounded-xl border border-line px-3 py-2">
              <div className="num">{firing.firedAt}{firing.resolvedAt ? ` · resolved ${firing.resolvedAt}` : ' · open'}</div>
              <div>{firing.dedupeKey}</div>
              <div className="text-xs text-muted">{JSON.stringify(firing.payload)} · delivery {JSON.stringify(firing.delivery)}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm">{label}
      <input className="mt-1 w-full rounded-xl border border-line bg-transparent px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function RuleRow({ rule }: { rule: AlertRuleDto }) {
  const client = useQueryClient()
  const act = useMutation({
    mutationFn: async (action: 'test' | 'toggle' | 'delete') => {
      if (action === 'delete') {
        await api(`/api/v1/alerts/${rule.id}`, { method: 'DELETE' })
        return
      }
      if (action === 'toggle') {
        await api(`/api/v1/alerts/${rule.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: !rule.enabled }),
        })
        return
      }
      await api(`/api/v1/alerts/${rule.id}/test`, { method: 'POST' })
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['alerts'] })
      await client.invalidateQueries({ queryKey: ['firings'] })
    },
  })
  return (
    <li className="rounded-xl border border-line px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <strong>{rule.name}</strong>
          <div className="text-xs text-muted">{rule.kind} · {rule.enabled ? 'enabled' : 'paused'} · cooldown {rule.cooldownSec}s</div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={() => act.mutate('test')}>Test</button>
          <button type="button" className="btn" onClick={() => act.mutate('toggle')}>{rule.enabled ? 'Pause' : 'Enable'}</button>
          <button type="button" className="btn" onClick={() => act.mutate('delete')}>Delete</button>
        </div>
      </div>
      {act.error ? <p className="mt-1 text-xs text-[#fb7185]">{act.error.message}</p> : null}
    </li>
  )
}
