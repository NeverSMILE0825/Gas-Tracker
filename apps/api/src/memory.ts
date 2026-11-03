import { appendDemoBlock, buildDemoHistory, DEMO_LABELS, formulaVersion, type ChainBlock, type ChainTx } from '@gasscope/analytics'
import { FORMULA_VERSION, toIsoUtc, type AlertFiringDto, type AlertRuleDto, type StatusDto } from '@gasscope/shared'
import type { FeeTotals, GasData, GroupedDriver, HeadEvent } from './data'

const CAP_NOTE = 'Synthetic demo history. These blocks are not Ethereum mainnet, and the addresses are not real identities.'

export function createMemoryData(options?: { hours?: number; seed?: number; endSec?: number; tick?: boolean }): GasData {
  const history = buildDemoHistory({
    hours: options?.hours ?? 6,
    seed: options?.seed ?? 1559,
    endSec: options?.endSec ?? Math.floor(Date.now() / 1000) - 6,
  })
  const blocks = history.blocks
  const txs = history.txs
  const alerts: AlertRuleDto[] = []
  const firings: AlertFiringDto[] = []
  const listeners = new Set<(event: HeadEvent) => void>()

  const emit = (block: ChainBlock) => {
    const event = { blockNumber: block.number, timestamp: block.timestamp, baseFeeWei: block.baseFeePerGas.toString(), synthetic: true }
    for (const listener of listeners) listener(event)
  }

  if (options?.tick !== false) {
    const timer = setInterval(() => {
      const next = appendDemoBlock(history)
      blocks.push(next.block)
      txs.push(...next.txs)
      if (blocks.length > 8) blocks[blocks.length - 9]!.confirmation = 'safe'
      emit(next.block)
    }, 12_000)
    timer.unref?.()
  }

  function inRange<T extends { timestamp: number }>(rows: T[], fromSec: number, toSec: number): T[] {
    return rows.filter((row) => row.timestamp >= fromSec && row.timestamp < toSec)
  }

  function totals(rows: ChainTx[]): FeeTotals {
    return rows.reduce<FeeTotals>(
      (acc, tx) => {
        acc.gasUsed = (BigInt(acc.gasUsed) + tx.gasUsed).toString()
        acc.burnWei = (BigInt(acc.burnWei) + tx.baseBurnWei).toString()
        acc.tipWei = (BigInt(acc.tipWei) + tx.tipWei).toString()
        acc.blobFeeWei = (BigInt(acc.blobFeeWei) + (tx.blobFeeWei ?? 0n)).toString()
        acc.failedGas = (BigInt(acc.failedGas) + (tx.status === 0 ? tx.gasUsed : 0n)).toString()
        acc.txCount += 1
        return acc
      },
      { gasUsed: '0', burnWei: '0', tipWei: '0', blobFeeWei: '0', failedGas: '0', txCount: 0 },
    )
  }

  return {
    async getStatus(): Promise<StatusDto> {
      const latest = blocks[blocks.length - 1] ?? null
      const lag = latest ? Math.max(0, Math.floor(Date.now() / 1000) - latest.timestamp) : null
      return {
        mode: 'demo',
        synthetic: true,
        runState: 'DEMO',
        networkName: 'Demo chain (synthetic)',
        chainId: null,
        chainIdOk: false,
        latestBlock: latest?.number ?? null,
        latestBlockHash: latest?.hash ?? null,
        latestTimestamp: latest ? toIsoUtc(latest.timestamp * 1000) : null,
        indexedBlock: latest?.number ?? null,
        indexedFrom: blocks[0] ? toIsoUtc(blocks[0].timestamp * 1000) : null,
        indexedTo: latest ? toIsoUtc((latest.timestamp + 1) * 1000) : null,
        lagSeconds: lag,
        headDelayBlocks: 0,
        receiptCoverage15m: coverage(blocks, txs, 15 * 60),
        confirmation: {
          safe: [...blocks].reverse().find((block) => block.confirmation === 'safe')?.number ?? null,
          finalized: [...blocks].reverse().find((block) => block.confirmation === 'finalized')?.number ?? null,
        },
        backfill: { targetBlocks: blocks.length, completedBlocks: blocks.length, inProgress: false, note: 'Demo history is generated locally. It does not backfill mainnet.' },
        provider: {
          httpConfigured: false,
          wsConfigured: false,
          fallbackConfigured: false,
          websocket: 'unused',
          capabilities: { eth_getBlockReceipts: null, eth_feeHistory: null, trace: null },
          lastError: null,
          requestCount: 0,
          errorCount: 0,
        },
        formulaVersion: formulaVersion() || FORMULA_VERSION,
        updatedAt: new Date().toISOString(),
        warnings: [CAP_NOTE, 'Set ETH_RPC_HTTP_URL and run the worker against Postgres for Ethereum mainnet.'],
      }
    },
    async blocksBetween(fromSec, toSec) {
      return inRange(blocks.filter((block) => block.canonical), fromSec, toSec)
    },
    async txsBetween(fromSec, toSec) {
      return inRange(txs, fromSec, toSec)
    },
    async countTxs(fromSec, toSec) {
      return inRange(txs, fromSec, toSec).length
    },
    async blockByNumber(number) {
      return blocks.find((block) => block.number === number) ?? null
    },
    async txsInBlock(number) {
      return txs.filter((tx) => tx.blockNumber === number)
    },
    async txByHash(hash) {
      const key = hash.toLowerCase()
      return txs.find((tx) => tx.hash === key) ?? null
    },
    async txsByAddress(address, fromSec, toSec) {
      const key = address.toLowerCase()
      return inRange(txs, fromSec, toSec).filter((tx) => tx.from.toLowerCase() === key || tx.to?.toLowerCase() === key).slice(0, 500)
    },
    async recent(limitBlocks) {
      const slice = blocks.slice(-limitBlocks)
      const min = slice[0]?.number ?? Number.MAX_SAFE_INTEGER
      return { blocks: slice, txs: txs.filter((tx) => tx.blockNumber >= min) }
    },
    async feeTotals(fromSec, toSec) {
      return totals(inRange(txs, fromSec, toSec))
    },
    async groupedDrivers(fromSec, toSec, groupBy, limit) {
      return groupMemory(inRange(txs, fromSec, toSec), blocks, groupBy, limit)
    },
    async alerts() {
      return alerts
    },
    async saveAlert(alert) {
      const index = alerts.findIndex((item) => item.id === alert.id)
      if (index >= 0) alerts[index] = alert
      else alerts.push(alert)
    },
    async deleteAlert(id) {
      const index = alerts.findIndex((item) => item.id === id)
      if (index < 0) return false
      alerts.splice(index, 1)
      return true
    },
    async firings() {
      return [...firings].sort((a, b) => b.firedAt.localeCompare(a.firedAt))
    },
    async addFiring(firing) {
      if (firings.some((item) => item.ruleId === firing.ruleId && item.dedupeKey === firing.dedupeKey)) return
      firings.push(firing)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async requestBackfill() {
      return { accepted: false, message: 'Demo mode cannot backfill Ethereum mainnet. Configure an RPC URL and the worker.' }
    },
  }
}

function coverage(blocks: ChainBlock[], _txs: ChainTx[], seconds: number): number | null {
  const latest = blocks[blocks.length - 1]
  if (!latest) return null
  const slice = blocks.filter((block) => block.timestamp >= latest.timestamp - seconds)
  if (slice.length === 0) return null
  return slice.filter((block) => block.receiptsComplete).length / slice.length
}

function groupMemory(rows: ChainTx[], blocks: ChainBlock[], groupBy: 'sender' | 'contract' | 'category' | 'method', limit: number): GroupedDriver[] {
  const above = new Map(blocks.map((block) => [block.number, block.gasUsed * 2n > block.gasLimit]))
  const map = new Map<string, GroupedDriver & { gas: bigint; failed: bigint; burn: bigint; tip: bigint; execution: bigint; blob: bigint; above: bigint }>()
  for (const tx of rows) {
    const key = groupBy === 'sender' ? tx.from : groupBy === 'contract' ? tx.to ?? `create:${tx.hash}` : groupBy === 'category' ? tx.category : tx.selector ?? 'none'
    const row = map.get(key) ?? {
      key,
      gasUsed: '0',
      txCount: 0,
      failedGas: '0',
      failedTxCount: 0,
      burnWei: '0',
      tipWei: '0',
      executionFeeWei: '0',
      blobFeeWei: '0',
      firstTs: tx.timestamp,
      lastTs: tx.timestamp,
      category: tx.category,
      method: tx.method,
      aboveTargetGas: '0',
      gas: 0n,
      failed: 0n,
      burn: 0n,
      tip: 0n,
      execution: 0n,
      blob: 0n,
      above: 0n,
    }
    row.gas += tx.gasUsed
    row.txCount += 1
    row.burn += tx.baseBurnWei
    row.tip += tx.tipWei
    row.execution += tx.executionFeeWei
    row.blob += tx.blobFeeWei ?? 0n
    if (tx.status === 0) {
      row.failed += tx.gasUsed
      row.failedTxCount += 1
    }
    if (above.get(tx.blockNumber)) row.above += tx.gasUsed
    if (tx.timestamp < row.firstTs) row.firstTs = tx.timestamp
    if (tx.timestamp > row.lastTs) row.lastTs = tx.timestamp
    map.set(key, row)
  }
  return [...map.values()]
    .sort((a, b) => (a.gas > b.gas ? -1 : 1))
    .slice(0, limit)
    .map((row) => ({
      key: row.key,
      gasUsed: row.gas.toString(),
      txCount: row.txCount,
      failedGas: row.failed.toString(),
      failedTxCount: row.failedTxCount,
      burnWei: row.burn.toString(),
      tipWei: row.tip.toString(),
      executionFeeWei: row.execution.toString(),
      blobFeeWei: row.blob.toString(),
      firstTs: row.firstTs,
      lastTs: row.lastTs,
      category: row.category,
      method: row.method,
      aboveTargetGas: row.above.toString(),
    }))
}

export function demoLabel(address: string): string | null {
  return DEMO_LABELS[address.toLowerCase()] ?? null
}
