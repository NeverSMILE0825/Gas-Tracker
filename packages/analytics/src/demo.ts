import { keccak256, toBytes } from 'viem'
import { nextBaseFee } from './basefee'
import { GAS_PER_BLOB, blobBaseFeePerGas, nextExcessBlobGas } from './blobfee'
import { classifyCall, selectorOf } from './classify'
import type { ChainBlock, ChainTx } from './domain'
import { decomposeFees } from './fees'

export const DEMO_ORIGIN = 8_000_000_000

export const DEMO_ACTORS = {
  whale: '0x1111111111111111111111111111111111111111',
  erc20: '0x2222222222222222222222222222222222222222',
  transfer: '0x3333333333333333333333333333333333333333',
  failed: '0x4444444444444444444444444444444444444444',
  misc: '0x5555555555555555555555555555555555555555',
  token: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  app: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
} as const

export const DEMO_LABELS: Record<string, string> = {
  [DEMO_ACTORS.whale]: 'Demo sender Alpha (synthetic)',
  [DEMO_ACTORS.erc20]: 'Demo sender Bravo (synthetic)',
  [DEMO_ACTORS.transfer]: 'Demo sender Charlie (synthetic)',
  [DEMO_ACTORS.failed]: 'Demo sender Delta (synthetic)',
  [DEMO_ACTORS.misc]: 'Demo sender Echo (synthetic)',
  [DEMO_ACTORS.token]: 'Demo token contract (synthetic)',
  [DEMO_ACTORS.app]: 'Demo application contract (synthetic)',
}

const TRANSFER = selectorOf('transfer(address,uint256)')

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function ratioAt(index: number, total: number, rand: () => number): number {
  const fromEnd = Math.max(0, total - 1 - index)
  let base = 1
  if (index < 30) base = 0.88
  else if (fromEnd >= 80 && fromEnd < 160) base = 1.14
  else if (fromEnd < 80) base = 0.84
  return Math.min(1.7, Math.max(0.4, base + (rand() - 0.5) * 0.03))
}

function split(total: bigint, weights: number[]): bigint[] {
  const scaled = weights.map((w) => Math.max(1, Math.round(w * 100)))
  const sum = scaled.reduce((a, b) => a + b, 0)
  const parts = scaled.map((w) => (total * BigInt(w)) / BigInt(sum))
  const used = parts.reduce((a, b) => a + b, 0n)
  parts[parts.length - 1] = (parts[parts.length - 1] ?? 0n) + (total - used)
  return parts
}

interface Draft {
  from: string
  to: string | null
  input: string
  status: 0 | 1
  weight: number
  txType: number
}

function draftsFor(index: number, ratio: number): Draft[] {
  const spike = ratio > 1.15
  const batch = spike && index % 20 === 0
  const rows: Draft[] = [
    { from: DEMO_ACTORS.whale, to: DEMO_ACTORS.app, input: '0xdeadbeef', status: 1, weight: spike ? 36 : 5, txType: 2 },
    { from: DEMO_ACTORS.erc20, to: DEMO_ACTORS.token, input: TRANSFER, status: 1, weight: 18, txType: 2 },
    { from: DEMO_ACTORS.transfer, to: DEMO_ACTORS.misc, input: '0x', status: 1, weight: 12, txType: 0 },
    { from: DEMO_ACTORS.misc, to: DEMO_ACTORS.token, input: TRANSFER, status: 1, weight: 10, txType: 2 },
    { from: DEMO_ACTORS.failed, to: DEMO_ACTORS.app, input: '0xcafebabe', status: batch ? 0 : 1, weight: batch ? 8 : 4, txType: 2 },
  ]
  if (batch) {
    for (let i = 0; i < 5; i++) rows.push({ from: DEMO_ACTORS.failed, to: DEMO_ACTORS.app, input: '0xcafebabe', status: 0, weight: 3, txType: 2 })
  } else {
    rows.push({ from: DEMO_ACTORS.erc20, to: DEMO_ACTORS.token, input: TRANSFER, status: 1, weight: 8, txType: 2 })
    rows.push({ from: DEMO_ACTORS.whale, to: DEMO_ACTORS.app, input: '0x12345678', status: 1, weight: spike ? 8 : 4, txType: 2 })
    rows.push({ from: DEMO_ACTORS.misc, to: DEMO_ACTORS.transfer, input: '0x', status: 1, weight: 7, txType: 0 })
  }
  if (index % 7 === 0) rows.push({ from: DEMO_ACTORS.misc, to: DEMO_ACTORS.token, input: TRANSFER, status: 1, weight: 6, txType: 3 })
  if (index % 53 === 0) rows.push({ from: DEMO_ACTORS.misc, to: null, input: '0x60806040', status: 1, weight: 5, txType: 2 })
  return rows
}

function materialize(index: number, total: number, seed: number, prev: { baseFee: bigint; excess: bigint; parentHash: string; timestamp: number }): { block: ChainBlock; txs: ChainTx[]; nextBase: bigint; nextExcess: bigint } {
  const rand = mulberry32(seed + index * 997)
  const ratio = ratioAt(index, total, rand)
  const gasLimit = 60_000_000n
  const target = gasLimit / 2n
  let gasUsed = BigInt(Math.round(Number(target) * ratio))
  if (gasUsed < 1_000_000n) gasUsed = 1_000_000n
  if (gasUsed > 58_000_000n) gasUsed = 58_000_000n
  const timestamp = prev.timestamp + 12
  const number = DEMO_ORIGIN + index
  const hash = keccak256(toBytes(`gasscope-demo-block:${seed}:${number}`))
  const blobGasUsed = index % 7 === 0 ? GAS_PER_BLOB * 16n : index % 3 === 0 ? GAS_PER_BLOB * 6n : 0n
  const blobBase = blobBaseFeePerGas(prev.excess, timestamp)!
  const withhold = index === 10
  const drafts = withhold ? [] : draftsFor(index, ratio)
  const parts = withhold ? [] : split(gasUsed, drafts.map((d) => d.weight))
  const txs: ChainTx[] = drafts.map((draft, txIndex) => {
    const used = parts[txIndex] ?? 0n
    const tip = BigInt(Math.round((0.05 + rand() * 2) * 1e9))
    const effective = prev.baseFee + tip
    const blobGas = draft.txType === 3 ? GAS_PER_BLOB : 0n
    const fees = decomposeFees({
      gasUsed: used,
      effectiveGasPrice: effective,
      baseFeePerGas: prev.baseFee,
      blobGasUsed: blobGas,
      blobGasPrice: blobBase,
    })
    const classified = classifyCall({ to: draft.to, input: draft.input, txType: draft.txType })
    return {
      hash: keccak256(toBytes(`gasscope-demo-tx:${seed}:${number}:${txIndex}`)),
      blockNumber: number,
      txIndex,
      timestamp,
      from: draft.from,
      to: draft.to,
      valueWei: draft.input === '0x' ? 10n ** 15n : 0n,
      gasUsed: used,
      gasLimit: used + 50_000n,
      effectiveGasPrice: effective,
      maxFeePerGas: draft.txType === 0 ? null : effective + 1_000_000_000n,
      maxPriorityFeePerGas: draft.txType === 0 ? null : tip,
      baseFeePerGas: prev.baseFee,
      executionFeeWei: fees.executionFeeWei,
      baseBurnWei: fees.baseBurnWei,
      tipWei: fees.tipWei,
      blobGasUsed: blobGas > 0n ? blobGas : null,
      blobGasPrice: blobGas > 0n ? blobBase : null,
      blobFeeWei: blobGas > 0n ? fees.blobFeeWei : null,
      txType: draft.txType,
      status: draft.status,
      selector: classified.selector,
      method: classified.method,
      methodSource: classified.methodSource,
      category: classified.category,
      categoryConfidence: classified.confidence,
      categoryProvenance: classified.provenance,
      classification: classified.classification,
      synthetic: true,
      inputSize: draft.input === '0x' ? 0 : Math.max(0, (draft.input.length - 2) / 2),
    }
  })
  const step = nextBaseFee({ baseFeePerGas: prev.baseFee, gasUsed, gasLimit })
  const nextExcess = nextExcessBlobGas(
    { excessBlobGas: prev.excess, blobGasUsed, baseFeePerGas: prev.baseFee, timestamp },
    timestamp + 12,
  )
  const block: ChainBlock = {
    number,
    hash,
    parentHash: prev.parentHash,
    timestamp,
    gasLimit,
    gasUsed,
    baseFeePerGas: prev.baseFee,
    blobGasUsed,
    excessBlobGas: prev.excess,
    blobBaseFee: blobBase,
    txCount: withhold ? 12 : txs.length,
    receiptsComplete: !withhold,
    canonical: true,
    confirmation: 'head',
    synthetic: true,
    miner: null,
  }
  return { block, txs, nextBase: step.next, nextExcess: nextExcess ?? 0n }
}

export interface DemoHistory {
  blocks: ChainBlock[]
  txs: ChainTx[]
  seriesLength: number
  seed: number
}

export function buildDemoHistory(options?: { endSec?: number; hours?: number; seed?: number }): DemoHistory {
  const hours = options?.hours ?? 12
  const seed = options?.seed ?? 1559
  const count = Math.max(2, Math.round((hours * 3600) / 12))
  const endSec = options?.endSec ?? Math.floor(Date.now() / 1000)
  const start = endSec - (count - 1) * 12
  const blocks: ChainBlock[] = []
  const txs: ChainTx[] = []
  let prev: { baseFee: bigint; excess: bigint; parentHash: string; timestamp: number } = {
    baseFee: 4_000_000_000n,
    excess: 0n,
    parentHash: keccak256(toBytes(`gasscope-demo-genesis:${seed}`)),
    timestamp: start - 12,
  }
  for (let index = 0; index < count; index++) {
    const made = materialize(index, count, seed, prev)
    blocks.push(made.block)
    txs.push(...made.txs)
    prev = { baseFee: made.nextBase, excess: made.nextExcess, parentHash: made.block.hash, timestamp: made.block.timestamp }
  }
  if (blocks.length > 64) {
    for (let i = 0; i < blocks.length - 64; i++) blocks[i]!.confirmation = 'finalized'
    for (let i = Math.max(0, blocks.length - 64); i < blocks.length - 8; i++) blocks[i]!.confirmation = 'safe'
  }
  return { blocks, txs, seriesLength: count, seed }
}

export function appendDemoBlock(history: DemoHistory): { block: ChainBlock; txs: ChainTx[] } {
  const last = history.blocks[history.blocks.length - 1]
  if (!last) throw new Error('Cannot append to an empty demo history')
  const index = last.number - DEMO_ORIGIN + 1
  const made = materialize(index, history.seriesLength, history.seed, {
    baseFee: nextBaseFee(last).next,
    excess: nextExcessBlobGas(
      {
        excessBlobGas: last.excessBlobGas ?? 0n,
        blobGasUsed: last.blobGasUsed ?? 0n,
        baseFeePerGas: last.baseFeePerGas,
        timestamp: last.timestamp,
      },
      last.timestamp + 12,
    ) ?? 0n,
    parentHash: last.hash,
    timestamp: last.timestamp,
  })
  made.block.confirmation = 'head'
  return { block: made.block, txs: made.txs }
}
