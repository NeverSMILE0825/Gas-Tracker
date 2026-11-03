import type { ChartPointDto } from '@gasscope/shared'
import { toIsoUtc } from '@gasscope/shared'
import { executionTarget, nextBaseFee } from './basefee'
import type { ChainBlock, ChainTx } from './domain'
import { percentileNearest } from './fees'

export type ChartResolution = 'block' | '1m' | '5m' | '15m' | '1h'

function ratioString(num: bigint, den: bigint): string {
  if (den <= 0n) return '0'
  const scaled = (num * 1_000_000n) / den
  const whole = scaled / 1_000_000n
  const frac = (scaled % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole.toString()
}

function bucketStart(ts: number, resolution: ChartResolution): number {
  if (resolution === 'block') return ts
  const size = resolution === '1m' ? 60 : resolution === '5m' ? 300 : resolution === '15m' ? 900 : 3600
  return Math.floor(ts / size) * size
}

export function bucketize(blocks: ChainBlock[], resolution: ChartResolution, txs: ChainTx[] = []): ChartPointDto[] {
  const ordered = [...blocks].sort((a, b) => a.number - b.number)
  const groups = new Map<number, ChainBlock[]>()
  for (const block of ordered) {
    const key = resolution === 'block' ? block.number : bucketStart(block.timestamp, resolution)
    const list = groups.get(key) ?? []
    list.push(block)
    groups.set(key, list)
  }
  const txByBlock = new Map<number, ChainTx[]>()
  for (const tx of txs) {
    const list = txByBlock.get(tx.blockNumber) ?? []
    list.push(tx)
    txByBlock.set(tx.blockNumber, list)
  }
  const points: ChartPointDto[] = []
  let prevClose: bigint | null = null
  for (const [, group] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const first = group[0]!
    const last = group[group.length - 1]!
    let gasUsed = 0n
    let gasTarget = 0n
    let gasLimit = 0n
    let burn = 0n
    let tip = 0n
    let blobFee = 0n
    let txCount = 0
    let above = 0
    let below = 0
    let equal = 0
    let complete = 0
    let minFee = first.baseFeePerGas
    let maxFee = first.baseFeePerGas
    const priorities: bigint[] = []
    for (const block of group) {
      const target = executionTarget(block.gasLimit)
      gasUsed += block.gasUsed
      gasTarget += target
      gasLimit += block.gasLimit
      if (block.baseFeePerGas < minFee) minFee = block.baseFeePerGas
      if (block.baseFeePerGas > maxFee) maxFee = block.baseFeePerGas
      if (block.gasUsed > target) above += 1
      else if (block.gasUsed < target) below += 1
      else equal += 1
      if (block.receiptsComplete) complete += 1
      txCount += block.txCount
      const blockTxs = txByBlock.get(block.number) ?? []
      for (const tx of blockTxs) {
        burn += tx.baseBurnWei
        tip += tx.tipWei
        blobFee += tx.blobFeeWei ?? 0n
        if (tx.status === 1 && tx.gasUsed > 0n) priorities.push(tx.tipWei / tx.gasUsed)
      }
    }
    priorities.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    const parentDelta = prevClose === null ? null : last.baseFeePerGas - prevClose
    const direction = parentDelta === null ? 'flat' : parentDelta > 0n ? 'up' : parentDelta < 0n ? 'down' : 'flat'
    if (resolution === 'block') {
      const step = nextBaseFee(first)
      points.push({
        t: toIsoUtc(first.timestamp * 1000),
        blockStart: first.number,
        blockEnd: first.number,
        baseFeeOpenWei: first.baseFeePerGas.toString(),
        baseFeeCloseWei: first.baseFeePerGas.toString(),
        baseFeeMinWei: first.baseFeePerGas.toString(),
        baseFeeMaxWei: first.baseFeePerGas.toString(),
        gasUsed: first.gasUsed.toString(),
        gasTarget: step.target.toString(),
        gasLimit: first.gasLimit.toString(),
        utilTarget: ratioString(first.gasUsed, step.target),
        utilLimit: ratioString(first.gasUsed, first.gasLimit),
        blocksAbove: above,
        blocksBelow: below,
        blocksEqual: equal,
        txCount: first.txCount,
        burnWei: burn.toString(),
        tipWei: tip.toString(),
        blobFeeWei: blobFee.toString(),
        blobBaseFeeCloseWei: first.blobBaseFee?.toString() ?? null,
        tipP50Wei: percentileNearest(priorities, 0.5)?.toString() ?? null,
        tipP90Wei: percentileNearest(priorities, 0.9)?.toString() ?? null,
        receiptCoverage: first.receiptsComplete ? 1 : 0,
        parentDeltaWei: parentDelta?.toString() ?? null,
        direction,
      })
    } else {
      points.push({
        t: toIsoUtc(first.timestamp * 1000),
        blockStart: first.number,
        blockEnd: last.number,
        baseFeeOpenWei: first.baseFeePerGas.toString(),
        baseFeeCloseWei: last.baseFeePerGas.toString(),
        baseFeeMinWei: minFee.toString(),
        baseFeeMaxWei: maxFee.toString(),
        gasUsed: gasUsed.toString(),
        gasTarget: gasTarget.toString(),
        gasLimit: gasLimit.toString(),
        utilTarget: ratioString(gasUsed, gasTarget),
        utilLimit: ratioString(gasUsed, gasLimit),
        blocksAbove: above,
        blocksBelow: below,
        blocksEqual: equal,
        txCount,
        burnWei: burn.toString(),
        tipWei: tip.toString(),
        blobFeeWei: blobFee.toString(),
        blobBaseFeeCloseWei: last.blobBaseFee?.toString() ?? null,
        tipP50Wei: percentileNearest(priorities, 0.5)?.toString() ?? null,
        tipP90Wei: percentileNearest(priorities, 0.9)?.toString() ?? null,
        receiptCoverage: group.length === 0 ? 0 : complete / group.length,
        parentDeltaWei: (last.baseFeePerGas - first.baseFeePerGas).toString(),
        direction: last.baseFeePerGas > first.baseFeePerGas ? 'up' : last.baseFeePerGas < first.baseFeePerGas ? 'down' : 'flat',
      })
    }
    prevClose = last.baseFeePerGas
  }
  return points
}
