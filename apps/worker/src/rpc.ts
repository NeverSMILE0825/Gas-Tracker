import type { RpcBlock } from './normalize'

export class RpcClient {
  requestCount = 0
  errorCount = 0
  lastError: string | null = null
  receiptsSupported: boolean | null = null
  feeHistorySupported: boolean | null = null
  traceSupported: boolean | null = null
  private pending = 0
  private waiters: (() => void)[] = []

  constructor(
    private readonly urls: string[],
    private readonly timeoutMs = 20_000,
    private readonly maxConcurrent = 3,
  ) {}

  private async slot<T>(fn: () => Promise<T>): Promise<T> {
    while (this.pending >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.waiters.push(resolve))
    }
    this.pending += 1
    try {
      return await fn()
    } finally {
      this.pending -= 1
      this.waiters.shift()?.()
    }
  }

  async call<T>(method: string, params: unknown[]): Promise<T> {
    let last: Error | null = null
    for (const url of this.urls) {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          return await this.slot(async () => {
            this.requestCount += 1
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), this.timeoutMs)
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
              signal: controller.signal,
            })
            clearTimeout(timer)
            if (response.status === 429 || response.status >= 500) throw new Error(`RPC HTTP ${response.status}`)
            const body = (await response.json()) as { result?: T; error?: { message?: string } }
            if (body.error) {
              const message = body.error.message ?? 'RPC error'
              if (/not found|not supported|does not exist|method/i.test(message)) {
                const unsupported = new Error(message)
                ;(unsupported as Error & { permanent: boolean }).permanent = true
                throw unsupported
              }
              throw new Error(message)
            }
            return body.result as T
          })
        } catch (error) {
          last = error instanceof Error ? error : new Error('RPC error')
          this.errorCount += 1
          this.lastError = last.message
          if ((error as { permanent?: boolean }).permanent) break
          await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt + Math.floor(Math.random() * 200)))
        }
      }
    }
    throw last ?? new Error('RPC failed')
  }

  async chainId(): Promise<number> {
    return Number(BigInt(await this.call<string>('eth_chainId', [])))
  }

  async blockNumber(): Promise<number> {
    return Number(BigInt(await this.call<string>('eth_blockNumber', [])))
  }

  async taggedNumber(tag: 'safe' | 'finalized'): Promise<number | null> {
    const block = await this.call<{ number: string } | null>('eth_getBlockByNumber', [tag, false])
    return block ? Number(BigInt(block.number)) : null
  }

  async getBlock(number: number): Promise<RpcBlock> {
    return this.call<RpcBlock>('eth_getBlockByNumber', ['0x' + number.toString(16), true])
  }

  async getReceipts(number: number, hashes: string[]) {
    if (this.receiptsSupported !== false) {
      try {
        const result = await this.call<unknown[]>('eth_getBlockReceipts', ['0x' + number.toString(16)])
        this.receiptsSupported = true
        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        if (/not found|not supported|does not exist|method/i.test(message)) this.receiptsSupported = false
        else throw error
      }
    }
    const receipts = []
    for (let i = 0; i < hashes.length; i += 20) {
      const slice = hashes.slice(i, i + 20)
      const batch = await Promise.all(slice.map((hash) => this.call('eth_getTransactionReceipt', [hash])))
      receipts.push(...batch)
    }
    return receipts
  }

  async probe(traceEnabled: boolean) {
    try {
      await this.call('eth_feeHistory', ['0x1', 'latest', [50]])
      this.feeHistorySupported = true
    } catch {
      this.feeHistorySupported = false
    }
    if (!traceEnabled) {
      this.traceSupported = false
      return
    }
    try {
      await this.call('trace_block', ['latest'])
      this.traceSupported = true
    } catch {
      this.traceSupported = false
    }
  }
}

export function redactHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return 'invalid-rpc-url'
  }
}
