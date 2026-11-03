let basePromise: Promise<string> | null = null

export const browserDemo = process.env.NEXT_PUBLIC_DATA_SOURCE === 'browser'

export function apiBase(): Promise<string> {
  if (browserDemo) return Promise.resolve('')
  if (process.env.NEXT_PUBLIC_API_BASE_URL) return Promise.resolve(process.env.NEXT_PUBLIC_API_BASE_URL)
  if (!basePromise) {
    basePromise = fetch('/runtime-config.json')
      .then((res) => res.json())
      .then((body: { apiBase?: string }) => body.apiBase || 'http://localhost:4000')
      .catch(() => 'http://localhost:4000')
  }
  return basePromise
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (browserDemo) {
    const { browserApi } = await import('./browser-api')
    return browserApi<T>(path, init)
  }
  const base = await apiBase()
  const headers = new Headers(init?.headers)
  if (typeof window !== 'undefined') {
    const secret = sessionStorage.getItem('gasscope-secret')
    if (secret) headers.set('x-gasscope-secret', secret)
  }
  const response = await fetch(`${base}${path}`, { ...init, headers, cache: 'no-store' })
  if (response.status === 204) return undefined as T
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`)
  return body as T
}
