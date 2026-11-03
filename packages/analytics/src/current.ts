import { FORMULA_VERSION, formatGweiFixed, toIsoUtc, type CurrentGasDto } from '@gasscope/shared'
import { executionTarget } from './basefee'
import { scheduleAt, targetBlobGas } from './blobfee'
import type { ChainBlock, ChainTx } from './domain'
import { ESTIMATE_METHODOLOGY, percentileNearest } from './fees'

const DEFINITIONS: Record<string, string> = {
  baseFee: 'Execution base fee of the latest indexed canonical block, in wei converted to gwei. It is burned, and it was set by the parent block under EIP-1559.',
  standard: 'Estimate. Latest base fee plus the 50th percentile priority fee per gas in the sample. Not a quote and not a blob fee.',
  fast: 'Estimate. Latest base fee plus the 75th percentile priority fee per gas in the sample.',
  high: 'Estimate. Latest base fee plus the 90th percentile priority fee per gas in the sample.',
  utilization: 'Latest block gas used divided by that block’s dynamic target (gas limit / 2). This is not gas used divided by the gas limit.',
  fullness: 'Latest block gas used divided by its gas limit. A block can be under the limit and still above the target.',
  priority: 'Observed priority fee per gas (effective gas price minus base fee) on successful transactions in the sample.',
  transfer: 'Estimate of a 21,000-gas transfer at the Standard total. Real transfers can cost more. The ETH value sent is not a fee.',
  blob: 'Blob base fee computed from excess blob gas with the bundled mainnet schedule (EIP-4844 fake exponential, EIP-7918 from Osaka, BPO2 parameters). Separate from execution gas.',
}

function findAtOrBefore(blocks: ChainBlock[], ts: number): ChainBlock | null {
  let found: ChainBlock | null = null
  for (const block of blocks) {
    if (block.timestamp <= ts) found = block
    else break
  }
  return found
}

export function buildCurrent(input: {
  blocks: ChainBlock[]
  txs: ChainTx[]
  nowSec: number
  synthetic: boolean
}): CurrentGasDto {
  const blocks = [...input.blocks].sort((a, b) => a.number - b.number)
  const latest = blocks[blocks.length - 1] ?? null
  const empty: CurrentGasDto = {
    asOf: null,
    blockNumber: null,
    synthetic: input.synthetic,
    baseFeeWei: null,
    blobBaseFeeWei: null,
    excessBlobGas: null,
    blobGasUsed: null,
    blobTarget: null,
    blobSchedule: null,
    utilizationTarget: null,
    utilizationLimit: null,
    gasUsed: null,
    gasLimit: null,
    gasTarget: null,
    priority: { p10Wei: null, p50Wei: null, p90Wei: null, samples: 0 },
    estimates: [
      { label: 'Standard', totalWei: null, priorityWei: null, estimate: true },
      { label: 'Fast', totalWei: null, priorityWei: null, estimate: true },
      { label: 'High', totalWei: null, priorityWei: null, estimate: true },
    ],
    estimateMethodology: ESTIMATE_METHODOLOGY,
    simpleTransferWei: null,
    deltas: [],
    illustration: null,
    definitions: DEFINITIONS,
  }
  if (!latest) return empty
  const target = executionTarget(latest.gasLimit)
  const priorities = input.txs
    .filter((tx) => tx.status === 1 && tx.gasUsed > 0n)
    .map((tx) => tx.tipWei / tx.gasUsed)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const p10 = percentileNearest(priorities, 0.1)
  const p50 = percentileNearest(priorities, 0.5)
  const p75 = percentileNearest(priorities, 0.75)
  const p90 = percentileNearest(priorities, 0.9)
  const estimates = [
    { label: 'Standard' as const, priority: p50 },
    { label: 'Fast' as const, priority: p75 },
    { label: 'High' as const, priority: p90 },
  ].map((row) => ({
    label: row.label,
    priorityWei: row.priority?.toString() ?? null,
    totalWei: row.priority === null ? null : (latest.baseFeePerGas + row.priority).toString(),
    estimate: true as const,
  }))
  const standard = estimates[0]?.totalWei ? BigInt(estimates[0].totalWei) : null
  const sampleFrom = input.txs.reduce((min, tx) => Math.min(min, tx.timestamp), Number.POSITIVE_INFINITY)

  const deltas = (['5m', '15m', '1h'] as const).map((window) => {
    const sec = window === '5m' ? 300 : window === '15m' ? 900 : 3600
    const then = findAtOrBefore(blocks, latest.timestamp - sec)
    const baseDelta = then ? latest.baseFeePerGas - then.baseFeePerGas : null
    const pct = then && then.baseFeePerGas > 0n && baseDelta !== null ? Number((baseDelta * 1_000_000n) / then.baseFeePerGas) / 10_000 : null
    const covered = Number.isFinite(sampleFrom) && sampleFrom <= latest.timestamp - sec
    let estimateDelta: bigint | null = null
    let estimateNote = 'Base-fee delta uses canonical block headers.'
    if (!then) {
      estimateNote = 'The recent header sample does not reach the start of this window, so the base-fee change is omitted.'
    } else if (!covered) {
      estimateNote = 'Priority samples do not cover this comparison window, so the estimate delta is omitted. The base-fee delta still uses headers.'
    } else if (standard !== null && p50 !== null) {
      const thenTxs = input.txs.filter((tx) => tx.blockNumber === then.number && tx.status === 1 && tx.gasUsed > 0n)
      const thenP = percentileNearest(thenTxs.map((tx) => tx.tipWei / tx.gasUsed).sort((a, b) => (a < b ? -1 : 1)), 0.5)
      if (thenP !== null) {
        estimateDelta = standard - (then.baseFeePerGas + thenP)
        estimateNote = `Standard estimate change is ${formatGweiFixed(estimateDelta)} gwei. Base fee changed ${formatGweiFixed(baseDelta ?? 0n)} gwei and the p50 priority comparison uses the block near the start of this window.`
      }
    }
    return {
      window,
      baseFeeDeltaWei: baseDelta?.toString() ?? null,
      baseFeePct: pct,
      zeroBaseline: then?.baseFeePerGas === 0n,
      estimateDeltaWei: estimateDelta?.toString() ?? null,
      estimateNote,
    }
  })

  const latestTxs = input.txs.filter((tx) => tx.blockNumber === latest.number).sort((a, b) => (a.gasUsed < b.gasUsed ? -1 : 1))
  let illustration: CurrentGasDto['illustration'] = null
  if (latestTxs.length > 0) {
    const mid = latestTxs[Math.floor(latestTxs.length / 2)]!
    illustration = {
      txHash: mid.hash,
      synthetic: mid.synthetic,
      burnWei: mid.baseBurnWei.toString(),
      tipWei: mid.tipWei.toString(),
      blobFeeWei: (mid.blobFeeWei ?? 0n).toString(),
      executionFeeWei: mid.executionFeeWei.toString(),
      valueWei: mid.valueWei.toString(),
      gasUsed: mid.gasUsed.toString(),
      note: 'Fee paid on this transaction is execution base fee burned plus priority fee, plus blob fee when the receipt has blob gas. ETH transferred (value) is not a gas fee.',
    }
  }

  const spec = scheduleAt(latest.timestamp)
  return {
    asOf: toIsoUtc(latest.timestamp * 1000),
    blockNumber: latest.number,
    synthetic: input.synthetic,
    baseFeeWei: latest.baseFeePerGas.toString(),
    blobBaseFeeWei: latest.blobBaseFee?.toString() ?? null,
    excessBlobGas: latest.excessBlobGas?.toString() ?? null,
    blobGasUsed: latest.blobGasUsed?.toString() ?? null,
    blobTarget: targetBlobGas(latest.timestamp)?.toString() ?? null,
    blobSchedule: spec?.name ?? null,
    utilizationTarget: target === 0n ? null : Number((latest.gasUsed * 1_000_000n) / target) / 1_000_000,
    utilizationLimit: latest.gasLimit === 0n ? null : Number((latest.gasUsed * 1_000_000n) / latest.gasLimit) / 1_000_000,
    gasUsed: latest.gasUsed.toString(),
    gasLimit: latest.gasLimit.toString(),
    gasTarget: target.toString(),
    priority: {
      p10Wei: p10?.toString() ?? null,
      p50Wei: p50?.toString() ?? null,
      p90Wei: p90?.toString() ?? null,
      samples: priorities.length,
    },
    estimates,
    estimateMethodology: ESTIMATE_METHODOLOGY,
    simpleTransferWei: standard === null ? null : (standard * 21_000n).toString(),
    deltas,
    illustration,
    definitions: DEFINITIONS,
  }
}

export function formulaVersion(): string {
  return FORMULA_VERSION
}
