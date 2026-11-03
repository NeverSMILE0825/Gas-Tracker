'use client'

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { Shell } from '@/components/shell'
import { apiBase, browserDemo } from '@/lib/api'

function LiveBridge() {
  const client = useQueryClient()
  useEffect(() => {
    if (browserDemo) {
      const timer = window.setInterval(() => {
        void client.invalidateQueries()
      }, 12_000)
      return () => window.clearInterval(timer)
    }
    let source: EventSource | null = null
    let stop = false
    void apiBase().then((base) => {
      if (stop) return
      source = new EventSource(`${base}/api/v1/events/stream`)
      source.addEventListener('block', () => {
        void client.invalidateQueries({ queryKey: ['status'] })
        void client.invalidateQueries({ queryKey: ['current'] })
        if (new URLSearchParams(window.location.search).get('live') !== '0') {
          void client.invalidateQueries({ queryKey: ['analysis'] })
          void client.invalidateQueries({ queryKey: ['chart'] })
          void client.invalidateQueries({ queryKey: ['drivers'] })
        }
      })
    })
    return () => {
      stop = true
      source?.close()
    }
  }, [client])
  return null
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
  }))
  return (
    <QueryClientProvider client={client}>
      <LiveBridge />
      <Suspense fallback={<div className="state">Loading GasScope…</div>}>
        <Shell>{children}</Shell>
      </Suspense>
    </QueryClientProvider>
  )
}
