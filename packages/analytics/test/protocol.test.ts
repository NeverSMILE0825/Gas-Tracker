import { describe, expect, it } from 'vitest'
import { FORMULA_VERSION } from '@gasscope/shared'
import {
  analyzeWindow,
  buildDemoHistory,
  counterfactualBlock,
  decomposeFees,
  DEMO_LABELS,
  evaluateAlert,
  executionTarget,
  fakeExponential,
  fixtureReport,
  highestMatchingHeight,
  nextBaseFee,
  percentileNearest,
  replayBaseFee,
  reorgWalkFrom,
  rollup,
  selectorOf,
} from '../src/index'
import type { ChainBlock, ChainTx } from '../src/domain'

describe('EIP-1559', () => {
  const limit = 60_000_000n
  const target = 30_000_000n

  it('keeps the base fee when usage equals the parent target', () => {
    const step = nextBaseFee({ baseFeePerGas: 1_000_000_000n, gasUsed: target, gasLimit: limit })
    expect(step.next).toBe(1_000_000_000n)
    expect(step.direction).toBe('flat')
  })

  it('uses a 1-wei minimum on the way up and none on the way down', () => {
    const up = nextBaseFee({ baseFeePerGas: 1n, gasUsed: limit, gasLimit: limit })
    expect(up.delta).toBe(1n)
    expect(up.next).toBe(2n)
    const stuck = nextBaseFee({ baseFeePerGas: 7n, gasUsed: 0n, gasLimit: limit })
    expect(stuck.delta).toBe(0n)
    expect(stuck.next).toBe(7n)
    const down = nextBaseFee({ baseFeePerGas: 8n, gasUsed: 0n, gasLimit: limit })
    expect(down.delta).toBe(1n)
    expect(down.next).toBe(7n)
  })

  it('supports a non-default gas limit and an empty or full block', () => {
    const gasLimit = 40_000_000n
    expect(executionTarget(gasLimit)).toBe(20_000_000n)
    const full = nextBaseFee({ baseFeePerGas: 80n, gasUsed: gasLimit, gasLimit })
    expect(full.next).toBe(80n + 80n / 8n)
    const empty = nextBaseFee({ baseFeePerGas: 80n, gasUsed: 0n, gasLimit })
    expect(empty.next).toBe(80n - 80n / 8n)
  })

  it('matches the block 26330059 fixture and the static removal', () => {
    const parent = { baseFeePerGas: 48_571_925n, gasUsed: 32_928_976n, gasLimit: 60_000_000n }
    const step = nextBaseFee(parent)
    expect(step.delta).toBe(592_775n)
    expect(step.next).toBe(49_164_700n)
    const model = counterfactualBlock(parent, 9_480_430n)
    expect(model.modelledGasUsed).toBe(23_448_546n)
    expect(model.flippedBelowTarget).toBe(true)
    expect(model.modelledNext).toBe(47_246_022n)
    const report = fixtureReport()
    expect(report.method).toBe('Unidentified method 0x6ceef480')
    expect(report.shareOfBlock).toBe('28.79%')
    expect(report.flippedBelowTarget).toBe(true)
  })

  it('chains child base fees with integer equality', () => {
    let base = 3_000_000_000n
    const limit2 = 60_000_000n
    const usages = [20_000_000n, 30_000_000n, 45_000_000n, 10_000_000n]
    for (const gasUsed of usages) {
      const next = nextBaseFee({ baseFeePerGas: base, gasUsed, gasLimit: limit2 }).next
      const childObserved = next
      expect(childObserved).toBe(nextBaseFee({ baseFeePerGas: base, gasUsed, gasLimit: limit2 }).next)
      base = next
    }
  })
})

describe('fees and classifiers', () => {
  it('splits burn, tip, and blob fee, including a reverted transaction', () => {
    const failed = decomposeFees({
      gasUsed: 100_000n,
      effectiveGasPrice: 12n * 10n ** 9n,
      baseFeePerGas: 10n * 10n ** 9n,
      blobGasUsed: 131_072n,
      blobGasPrice: 5n,
    })
    expect(failed.baseBurnWei).toBe(100_000n * 10n * 10n ** 9n)
    expect(failed.tipWei).toBe(100_000n * 2n * 10n ** 9n)
    expect(failed.executionFeeWei).toBe(failed.baseBurnWei + failed.tipWei)
    expect(failed.blobFeeWei).toBe(131_072n * 5n)
    expect(failed.executionFeeWei + failed.blobFeeWei).not.toBe(failed.executionFeeWei)
  })

  it('derives the ERC-20 transfer selector', () => {
    expect(selectorOf('transfer(address,uint256)')).toBe('0xa9059cbb')
  })

  it('uses nearest-rank percentiles', () => {
    expect(percentileNearest([10n, 20n, 30n, 40n], 0.5)).toBe(20n)
  })

  it('approximates a small exponential', () => {
    expect(fakeExponential(1n, 0n, 3_338_477n)).toBe(1n)
    expect(fakeExponential(1n, 2n, 1n)).toBe(6n)
  })
})

function block(partial: Partial<ChainBlock> & Pick<ChainBlock, 'number' | 'gasUsed' | 'baseFeePerGas'>): ChainBlock {
  return {
    hash: `0x${partial.number.toString(16).padStart(64, '0')}`,
    parentHash: `0x${(partial.number - 1).toString(16).padStart(64, '0')}`,
    timestamp: 1_700_000_000 + partial.number,
    gasLimit: 60_000_000n,
    blobGasUsed: null,
    excessBlobGas: null,
    blobBaseFee: null,
    txCount: 1,
    receiptsComplete: true,
    canonical: true,
    confirmation: 'head',
    synthetic: true,
    miner: null,
    ...partial,
  }
}

function tx(partial: Partial<ChainTx> & Pick<ChainTx, 'hash' | 'from' | 'gasUsed'>): ChainTx {
  const gasUsed = partial.gasUsed
  return {
    blockNumber: 1,
    txIndex: 0,
    timestamp: 1_700_000_001,
    to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    valueWei: 0n,
    gasLimit: gasUsed,
    effectiveGasPrice: 10n,
    maxFeePerGas: null,
    maxPriorityFeePerGas: null,
    baseFeePerGas: 8n,
    executionFeeWei: gasUsed * 10n,
    baseBurnWei: gasUsed * 8n,
    tipWei: gasUsed * 2n,
    blobGasUsed: null,
    blobGasPrice: null,
    blobFeeWei: null,
    txType: 2,
    status: 1,
    selector: null,
    method: null,
    methodSource: null,
    category: 'unknown',
    categoryConfidence: 'none',
    categoryProvenance: 'test',
    classification: 'UNVERIFIED',
    synthetic: true,
    inputSize: 0,
    ...partial,
  }
}

describe('attribution', () => {
  it('keeps exclusive groupings from double counting inside one table', () => {
    const blocks = [block({ number: 2, gasUsed: 300n, baseFeePerGas: 100n, parentHash: block({ number: 1, gasUsed: 1n, baseFeePerGas: 1n }).hash })]
    const txs = [
      tx({ hash: '0x01', from: '0x1111111111111111111111111111111111111111', to: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', gasUsed: 100n, blockNumber: 2, category: 'erc20' }),
      tx({ hash: '0x02', from: '0x1111111111111111111111111111111111111111', to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', gasUsed: 200n, blockNumber: 2, category: 'unknown', status: 0 }),
    ]
    const rolled = rollup(blocks, txs)
    expect(rolled.rows.sender.reduce((s, r) => s + r.gasUsed, 0n)).toBe(300n)
    expect(rolled.rows.contract.reduce((s, r) => s + r.gasUsed, 0n)).toBe(300n)
    expect(rolled.rows.category.reduce((s, r) => s + r.gasUsed, 0n)).toBe(300n)
    expect(rolled.totals.failedGas).toBe(200n)
    expect(rolled.rows.sender).toHaveLength(1)
    expect(rolled.rows.contract).toHaveLength(2)
  })
})

describe('demo history', () => {
  const history = buildDemoHistory({ endSec: 1_762_200_000, hours: 2, seed: 1559 })

  it('obeys the base-fee recurrence and receipt gas sums', () => {
    expect(history.blocks.length).toBe(600)
    for (let i = 0; i < history.blocks.length - 1; i++) {
      const parent = history.blocks[i]!
      const child = history.blocks[i + 1]!
      expect(child.parentHash).toBe(parent.hash)
      expect(child.baseFeePerGas).toBe(nextBaseFee(parent).next)
      if (parent.receiptsComplete) {
        const sum = history.txs.filter((tx) => tx.blockNumber === parent.number).reduce((s, tx) => s + tx.gasUsed, 0n)
        expect(sum).toBe(parent.gasUsed)
      }
    }
  })

  it('explains a falling tail without treating a sender as the sole cause', () => {
    const last = history.blocks[history.blocks.length - 1]!.timestamp
    const from = last - 15 * 60
    const prevFrom = from - 15 * 60
    const inWindow = (start: number, end: number) => history.blocks.filter((b) => b.timestamp >= start && b.timestamp < end)
    const txsBetween = (start: number, end: number) => history.txs.filter((t) => t.timestamp >= start && t.timestamp < end)
    const analysis = analyzeWindow({
      fromSec: from,
      toSec: last + 1,
      tz: 'America/New_York',
      synthetic: true,
      formulaVersion: FORMULA_VERSION,
      blocks: inWindow(from, last + 1),
      txs: txsBetween(from, last + 1),
      previousBlocks: inWindow(prevFrom, from),
      previousTxs: txsBetween(prevFrom, from),
      indexedFromSec: history.blocks[0]!.timestamp,
      indexedToSec: last + 1,
      labelFor: (address) => DEMO_LABELS[address.toLowerCase()] ?? null,
    })
    expect(analysis.synthetic).toBe(true)
    expect(analysis.bounds.startBaseFeeWei).toBeTruthy()
    expect(analysis.bounds.endBaseFeeWei).toBeTruthy()
    expect(BigInt(analysis.bounds.endBaseFeeWei!)).toBeLessThan(BigInt(analysis.bounds.startBaseFeeWei!))
    expect(BigInt(analysis.bounds.endBaseFeeWei!)).toBeGreaterThan(1_000_000n)
    expect(analysis.ribbon.startsWith('DEMO')).toBe(true)
    expect(analysis.verdict.toLowerCase()).toContain('do not')
    expect(analysis.protocol.mismatchCount).toBe(0)
    expect(analysis.unknownGasShare).not.toBeNull()
    const senderGas = analysis.causes.filter((c) => c.kind === 'sender')
    expect(senderGas.length).toBeGreaterThan(0)
    expect(analysis.causes.some((c) => c.kind === 'unknown' || (analysis.unknownGasShare ?? 0) > 0)).toBe(true)
  })
})

describe('counterfactual replay', () => {
  it('does not add overlapping wallet effects', () => {
    const blocks = [
      block({ number: 5, gasUsed: 40_000_000n, baseFeePerGas: 1_000n, timestamp: 100, hash: '0x' + '11'.repeat(32), parentHash: '0x' + '00'.repeat(32) }),
      block({ number: 6, gasUsed: 40_000_000n, baseFeePerGas: nextBaseFee({ baseFeePerGas: 1000n, gasUsed: 40_000_000n, gasLimit: 60_000_000n }).next, timestamp: 112, hash: '0x' + '22'.repeat(32), parentHash: '0x' + '11'.repeat(32) }),
    ]
    const steps = replayBaseFee(blocks, new Map([[5, 20_000_000n]]))
    expect(steps[0]?.modelledBaseFeeWei).toBe(blocks[0]!.baseFeePerGas)
    expect(steps[0]?.flippedBelowTarget).toBe(true)
    expect(steps[1]?.modelledBaseFeeWei).toBe(steps[0]?.modelledNextWei)
  })
})

describe('alerts and reorg', () => {
  const blocks = Array.from({ length: 6 }, (_, i) => ({
    number: i + 1,
    timestamp: 1_000 + i * 12,
    baseFeePerGas: 30n * 10n ** 9n,
    aboveTarget: true,
  }))

  it('fires once per episode and respects cooldown after resolve', () => {
    const rule = { id: 'a', kind: 'basefee_above' as const, enabled: true, cooldownSec: 300, config: { gwei: 20, minutes: 1 } }
    const ctx = { nowSec: 1_060, synthetic: false, blocks, lagSeconds: 0 }
    const first = evaluateAlert(rule, ctx, null)
    expect(first.action).toBe('fire')
    const second = evaluateAlert(rule, ctx, { dedupeKey: first.dedupeKey, firedAtSec: 1_060, resolvedAtSec: null })
    expect(second.action).toBe('none')
    const resolved = evaluateAlert(
      rule,
      { ...ctx, blocks: blocks.map((b) => ({ ...b, baseFeePerGas: 1n })) },
      { dedupeKey: first.dedupeKey, firedAtSec: 1_060, resolvedAtSec: null },
    )
    expect(resolved.action).toBe('resolve')
    const cooled = evaluateAlert(rule, ctx, { dedupeKey: first.dedupeKey, firedAtSec: 1_000, resolvedAtSec: ctx.nowSec - 10 })
    expect(cooled.action).toBe('none')
  })

  it('finds a reorg ancestor and a clean extension', () => {
    const local = [
      { number: 10, hash: '0xa' },
      { number: 11, hash: '0xb' },
    ]
    expect(highestMatchingHeight(local, [{ number: 10, hash: '0xa' }, { number: 11, hash: '0xc' }])).toBe(10)
    expect(reorgWalkFrom({ number: 11, hash: '0xb' }, { number: 12, parentHash: '0xb' })).toBeNull()
    expect(reorgWalkFrom({ number: 11, hash: '0xb' }, { number: 12, parentHash: '0xc' })).toBe(11)
  })
})
