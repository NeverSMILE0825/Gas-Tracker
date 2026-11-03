import {
  DEFINITIVE_COVERAGE,
  categoryLabel,
  formatEth,
  formatGweiFixed,
  formatPct,
  formatShare,
  percentDelta,
  shareRatio,
  shortHash,
  toIsoUtc,
  type AnalysisDto,
  type CauseDto,
  type CompactCheckDto,
  type CriticalEventDto,
  type EvidenceDto,
} from '@gasscope/shared'
import { rollup } from './aggregate'
import { executionTarget, nextBaseFee } from './basefee'
import type { AggRow, ChainBlock, ChainTx } from './domain'
import { percentileNearest } from './fees'
import { externalLink } from './links'

export interface AnalyzeInput {
  fromSec: number
  toSec: number
  tz: string
  synthetic: boolean
  formulaVersion: string
  blocks: ChainBlock[]
  txs: ChainTx[]
  previousBlocks: ChainBlock[]
  previousTxs: ChainTx[]
  indexedFromSec: number | null
  indexedToSec: number | null
  includeAllChecks?: boolean
  labelFor?: (address: string) => string | null
}

function iso(sec: number): string {
  return toIsoUtc(sec * 1000)
}

function tipP50(txs: ChainTx[]): bigint | null {
  const values = txs.filter((tx) => tx.status === 1 && tx.gasUsed > 0n).map((tx) => tx.tipWei / tx.gasUsed)
  values.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return percentileNearest(values, 0.5)
}

function proofOf(txs: ChainTx[]) {
  return txs.slice(0, 5).map((tx) => ({
    hash: tx.hash,
    blockNumber: tx.blockNumber,
    gasUsed: tx.gasUsed.toString(),
    selector: tx.selector,
    method: tx.method,
    status: tx.status === 1 ? ('success' as const) : ('reverted' as const),
    synthetic: tx.synthetic,
  }))
}

function stdevGwei(blocks: ChainBlock[]): number | null {
  if (blocks.length < 2) return null
  const values = blocks.map((b) => Number(b.baseFeePerGas) / 1e9)
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

export function analyzeWindow(input: AnalyzeInput): AnalysisDto {
  const blocks = [...input.blocks].filter((b) => b.canonical).sort((a, b) => a.number - b.number)
  const previousBlocks = [...input.previousBlocks].filter((b) => b.canonical).sort((a, b) => a.number - b.number)
  const current = rollup(blocks, input.txs)
  const previous = rollup(previousBlocks, input.previousTxs)
  const labelFor = input.labelFor ?? (() => null)

  const checks: CompactCheckDto[] = []
  let mismatches = 0
  let gaps = 0
  for (let i = 0; i < blocks.length - 1; i++) {
    const parent = blocks[i]!
    const child = blocks[i + 1]!
    const step = nextBaseFee(parent)
    const linked = child.number === parent.number + 1 && child.parentHash === parent.hash
    if (!linked) gaps += 1
    const match = linked ? step.next === child.baseFeePerGas : null
    if (match === false) mismatches += 1
    checks.push({
      parentBlock: parent.number,
      childBlock: child.number,
      gasUsed: parent.gasUsed.toString(),
      target: step.target.toString(),
      gasLimit: parent.gasLimit.toString(),
      parentBaseFeeWei: parent.baseFeePerGas.toString(),
      predictedNextWei: step.next.toString(),
      observedChildWei: child.baseFeePerGas.toString(),
      deltaWei: (step.direction === 'down' ? -step.delta : step.delta).toString(),
      direction: step.direction,
      match,
    })
  }

  let above = 0
  let below = 0
  let equal = 0
  let sumGas = 0n
  let sumTarget = 0n
  let sumLimit = 0n
  for (const block of blocks) {
    const target = executionTarget(block.gasLimit)
    sumGas += block.gasUsed
    sumTarget += target
    sumLimit += block.gasLimit
  }
  const parents = blocks.slice(0, -1)
  for (const block of parents) {
    const target = executionTarget(block.gasLimit)
    if (block.gasUsed > target) above += 1
    else if (block.gasUsed < target) below += 1
    else equal += 1
  }

  const first = blocks[0] ?? null
  const last = blocks[blocks.length - 1] ?? null
  const startFee = first?.baseFeePerGas ?? null
  const endFee = last?.baseFeePerGas ?? null
  const delta = startFee !== null && endFee !== null ? endFee - startFee : null
  const pctInfo = startFee !== null && endFee !== null ? percentDelta(startFee, endFee) : { pct: null, zeroBaseline: false }
  let maxUp = 0n
  let maxDown = 0n
  let minFee = startFee
  let maxFee = startFee
  let secondsAbove = 0
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!
    if (minFee === null || block.baseFeePerGas < minFee) minFee = block.baseFeePerGas
    if (maxFee === null || block.baseFeePerGas > maxFee) maxFee = block.baseFeePerGas
    if (startFee !== null && block.baseFeePerGas > startFee) {
      const dur = i < blocks.length - 1 ? blocks[i + 1]!.timestamp - block.timestamp : 12
      secondsAbove += Math.max(0, dur)
    }
  }
  for (const check of checks) {
    const d = BigInt(check.deltaWei)
    if (d > maxUp) maxUp = d
    if (-d > maxDown) maxDown = -d
  }

  const complete = blocks.filter((b) => b.receiptsComplete).length
  const coverage = blocks.length === 0 ? null : complete / blocks.length
  const definitive = coverage !== null && coverage >= DEFINITIVE_COVERAGE && gaps === 0
  const unknown = current.rows.category.find((row) => row.key === 'unknown')
  const unknownShare = shareRatio(unknown?.gasUsed ?? 0n, current.totals.gasUsed)
  const partial =
    blocks.length === 0 ||
    (coverage !== null && coverage < 1) ||
    gaps > 0 ||
    (input.indexedFromSec !== null && input.fromSec < input.indexedFromSec) ||
    mismatches > 0

  const notes: string[] = []
  if (input.synthetic) notes.push('This interval is synthetic demo history. It is not Ethereum mainnet.')
  if (input.indexedFromSec !== null && input.fromSec < input.indexedFromSec) {
    notes.push(`Indexed history starts at ${iso(input.indexedFromSec)}. Earlier time in this request has no blocks.`)
  }
  if (coverage !== null && coverage < 1) {
    notes.push(`Receipt coverage is ${(coverage * 100).toFixed(2)}%. Blocks missing receipts are excluded from sender and contract rankings.`)
  }
  if (!definitive) notes.push('Rankings are partial until receipt coverage is at least 98% and block links are contiguous.')
  if (mismatches > 0) notes.push(`${mismatches} parent/child base-fee steps do not match the EIP-1559 integer formula. Those steps are listed and are not treated as exact.`)
  if (gaps > 0) notes.push(`${gaps} block pairs are not contiguous parent/child links, so the formula was not applied across the gap.`)
  if (blocks.length === 0) notes.push('No canonical blocks have timestamps inside this half-open interval.')

  const evidence: EvidenceDto[] = []
  const causes: CauseDto[] = []

  const directionWord = delta === null ? 'did not change' : delta > 0n ? 'rose' : delta < 0n ? 'fell' : 'was unchanged'
  const pctText = pctInfo.zeroBaseline ? 'a percent change is undefined because the starting base fee is 0' : formatPct(pctInfo.pct)
  let verdict: string
  if (!first || !last) {
    verdict = 'No canonical blocks fall inside this interval, so there is no base-fee move to explain.'
  } else if (blocks.length === 1) {
    const step = nextBaseFee(first)
    verdict = `This interval contains one block. Its execution base fee is ${formatGweiFixed(first.baseFeePerGas)} gwei, already set by its parent. That block’s gas used ${first.gasUsed > step.target ? 'above' : first.gasUsed < step.target ? 'below' : 'at'} the ${step.target.toString()} gas target sets the following base fee to ${formatGweiFixed(step.next)} gwei. A single block is not a multi-block trend.`
  } else {
    const identified = current.rows.category.filter((row) => row.key !== 'unknown' && row.key !== 'mixed')
    const topCat = identified[0]
    const topShare = topCat ? shareRatio(topCat.gasUsed, current.totals.gasUsed) : null
    const categorySentence =
      topCat && topShare !== null && topShare >= 0.05 && definitive
        ? `The largest labelled category, ${categoryLabel(topCat.key)}, accounts for ${formatShare(topCat.gasUsed, current.totals.gasUsed)} of attributed execution gas (${topCat.classification === 'INFERRED' ? 'inferred label' : 'observed classification'}).`
        : 'No labelled category is both large and well covered enough to describe as the activity behind the move.'
    const unknownSentence =
      unknownShare === null
        ? 'Attributed gas is unavailable.'
        : `${(unknownShare * 100).toFixed(1)}% of attributed execution gas is unclassified.`
    verdict = `Execution base fee ${directionWord} ${pctText} from ${formatGweiFixed(startFee!)} to ${formatGweiFixed(endFee!)} gwei. Of the ${parents.length} parent blocks that set the successive base fees inside this window, ${above} were above the dynamic gas target and ${below} were below it. ${categorySentence} ${unknownSentence} These figures are contributions to gas usage. They do not show that one wallet solely caused the network base fee.`
  }

  evidence.push({
    id: 'ev-protocol-window',
    classification: mismatches > 0 ? 'UNVERIFIED' : 'PROTOCOL-EXACT',
    confidence: mismatches > 0 ? 'low' : 'high',
    method: 'EIP-1559 integer base-fee update applied to each contiguous parent block',
    statement: verdict,
    blockNumbers: parents.slice(0, 20).map((b) => b.number),
    txHashes: [],
    severity: delta !== null && pctInfo.pct !== null && Math.abs(pctInfo.pct) >= 10 ? 'high' : 'notable',
  })

  causes.push({
    id: 'cause-protocol',
    rank: 1,
    title: 'EIP-1559 parent-block update',
    summary:
      parents.length === 0
        ? 'The interval does not contain a parent/child pair, so no in-window base-fee step exists.'
        : `${above} of ${parents.length} parent blocks used more gas than the dynamic target and ${below} used less. The target is gasLimit/2 for each parent, not a fixed 15M or 30M. The latest block changes the next base fee after this window.`,
    gasUsed: sumGas.toString(),
    gasShare: 1,
    txCount: current.totals.txCount,
    failedGas: current.totals.failedGas.toString(),
    failedTxCount: 0,
    burnWei: current.totals.burnWei.toString(),
    tipWei: current.totals.tipWei.toString(),
    executionFeeWei: current.totals.executionFeeWei.toString(),
    kind: 'protocol',
    classification: mismatches === 0 && gaps === 0 && parents.length > 0 ? 'PROTOCOL-EXACT' : 'UNVERIFIED',
    confidence: mismatches === 0 && gaps === 0 ? 'high' : 'low',
    method: 'Parent gasUsed compared with gasLimit/2, then the EIP-1559 integer delta.',
    entity: null,
    category: null,
    aboveTargetGas: '0',
    links: last ? [externalLink(input.synthetic, 'block', last.number)] : [],
    proof: [],
    evidenceIds: ['ev-protocol-window'],
  })

  const pushRow = (row: AggRow, kind: CauseDto['kind'], rank: number) => {
    const share = shareRatio(row.gasUsed, current.totals.gasUsed)
    const name = kind === 'sender' ? labelFor(row.key) ?? shortHash(row.key) : kind === 'category' ? categoryLabel(row.key) : row.method ?? row.key
    const id = `cause-${kind}-${row.key}`
    evidence.push({
      id: `ev-${kind}-${row.key}`,
      classification: row.classification,
      confidence: row.confidence,
      method: row.provenance,
      statement: `${name} accounts for ${formatShare(row.gasUsed, current.totals.gasUsed)} of attributed execution gas (${row.txCount} transactions).`,
      blockNumbers: [],
      txHashes: row.sampleTxs.map((tx) => tx.hash),
      severity: share !== null && share >= 0.15 ? 'high' : 'notable',
    })
    causes.push({
      id,
      rank,
      title: kind === 'sender' ? `Sender ${name}` : kind === 'category' ? name : `Method ${name}`,
      summary:
        kind === 'sender'
          ? `${name} is the transaction sender on ${row.txCount} transactions using ${formatShare(row.gasUsed, current.totals.gasUsed)} of attributed gas, of which ${formatShare(row.aboveTargetGas, row.gasUsed)} landed in above-target blocks. ${row.method ? `Most recent sampled method: ${row.method}.` : 'Sampled methods are unidentified or mixed.'} This is a gas contribution, not sole causation.`
          : `${name} is an exclusive ${kind} grouping covering ${formatShare(row.gasUsed, current.totals.gasUsed)} of attributed gas. ${row.provenance}`,
      gasUsed: row.gasUsed.toString(),
      gasShare: share,
      txCount: row.txCount,
      failedGas: row.failedGas.toString(),
      failedTxCount: row.failedTxCount,
      burnWei: row.burnWei.toString(),
      tipWei: row.tipWei.toString(),
      executionFeeWei: row.executionFeeWei.toString(),
      kind,
      classification: row.classification,
      confidence: row.confidence,
      method: row.provenance,
      entity: kind === 'category' ? null : row.key,
      category: row.category,
      aboveTargetGas: row.aboveTargetGas.toString(),
      links:
        kind === 'sender' && !row.key.startsWith('create:')
          ? [externalLink(input.synthetic || row.sampleTxs[0]?.synthetic === true, 'address', row.key)]
          : [],
      proof: proofOf(row.sampleTxs),
      evidenceIds: [`ev-${kind}-${row.key}`],
    })
  }

  let rank = 2
  if (definitive) {
    const topSender = current.rows.sender[0]
    if (topSender && (shareRatio(topSender.gasUsed, current.totals.gasUsed) ?? 0) >= 0.03) pushRow(topSender, 'sender', rank++)
    for (const row of current.rows.category.filter((item) => item.key !== 'unknown').slice(0, 3)) {
      if ((shareRatio(row.gasUsed, current.totals.gasUsed) ?? 0) >= 0.03) pushRow(row, 'category', rank++)
    }
  }
  if ((unknownShare ?? 0) > 0) {
    pushRow(
      unknown ?? {
        key: 'unknown',
        label: 'Unclassified',
        category: 'unknown',
        confidence: 'none',
        classification: 'UNVERIFIED',
        provenance: 'No curated match.',
        method: null,
        gasUsed: 0n,
        txCount: 0,
        failedGas: 0n,
        failedTxCount: 0,
        burnWei: 0n,
        tipWei: 0n,
        executionFeeWei: 0n,
        blobFeeWei: 0n,
        firstTs: 0,
        lastTs: 0,
        aboveTargetGas: 0n,
        sampleTxs: [],
      },
      'unknown',
      rank++,
    )
  }

  const events: CriticalEventDto[] = []
  const up = [...checks].sort((a, b) => (BigInt(a.deltaWei) < BigInt(b.deltaWei) ? 1 : -1))[0]
  const down = [...checks].sort((a, b) => (BigInt(a.deltaWei) > BigInt(b.deltaWei) ? 1 : -1))[0]
  if (up && BigInt(up.deltaWei) > 0n) {
    events.push({
      id: `ev-spike-${up.parentBlock}`,
      t: iso(blocks.find((b) => b.number === up.childBlock)?.timestamp ?? input.fromSec),
      blockNumber: up.childBlock ?? up.parentBlock,
      kind: 'spike',
      title: `Largest base-fee step up: ${formatGweiFixed(BigInt(up.deltaWei))} gwei`,
      detail: `Parent ${up.parentBlock} used ${up.gasUsed} gas against a ${up.target} target. Predicted child base fee ${formatGweiFixed(BigInt(up.predictedNextWei))} gwei. Match: ${up.match === null ? 'not checked' : up.match ? 'yes' : 'no'}.`,
      severity: 'high',
      classification: up.match ? 'PROTOCOL-EXACT' : 'UNVERIFIED',
      evidenceIds: ['ev-protocol-window'],
    })
  }
  if (down && BigInt(down.deltaWei) < 0n) {
    events.push({
      id: `ev-drop-${down.parentBlock}`,
      t: iso(blocks.find((b) => b.number === down.childBlock)?.timestamp ?? input.fromSec),
      blockNumber: down.childBlock ?? down.parentBlock,
      kind: 'drop',
      title: `Largest base-fee step down: ${formatGweiFixed(-BigInt(down.deltaWei))} gwei`,
      detail: `Parent ${down.parentBlock} used ${down.gasUsed} gas against a ${down.target} target. The downward step has no 1-wei floor.`,
      severity: 'notable',
      classification: down.match ? 'PROTOCOL-EXACT' : 'UNVERIFIED',
      evidenceIds: ['ev-protocol-window'],
    })
  }
  for (const tx of current.heavy.slice(0, 5)) {
    const block = blocks.find((b) => b.number === tx.blockNumber)
    const share = block ? shareRatio(tx.gasUsed, block.gasUsed) : null
    events.push({
      id: `ev-heavy-${tx.hash}`,
      t: iso(tx.timestamp),
      blockNumber: tx.blockNumber,
      kind: 'heavy-tx',
      title: `High-gas transaction ${shortHash(tx.hash)}`,
      detail: `${tx.gasUsed.toString()} gas, ${share === null ? 'unknown share' : `${(share * 100).toFixed(2)}%`} of that block’s gas used. ${tx.method ? `Method ${tx.method}.` : tx.selector ? `Unidentified method ${tx.selector}.` : 'No selector.'} ${tx.status === 0 ? 'The transaction reverted and still consumed gas.' : 'The receipt status is success.'}`,
      severity: 'high',
      classification: 'OBSERVED ON-CHAIN',
      evidenceIds: [`ev-heavy-${tx.hash}`],
    })
  }
  for (const burst of current.bursts.slice(0, 4)) {
    events.push({
      id: `ev-burst-${burst.from}-${burst.selector}`,
      t: iso(burst.lastTs),
      blockNumber: blocks.find((b) => b.timestamp >= burst.firstTs)?.number ?? last?.number ?? 0,
      kind: 'method-burst',
      title: `Repeated selector ${burst.method ?? burst.selector}`,
      detail: `${labelFor(burst.from) ?? shortHash(burst.from)} sent ${burst.count} transactions with this selector within ${burst.lastTs - burst.firstTs}s, using ${burst.gasUsed.toString()} gas. Repetition is not an identity or an automation verdict.`,
      severity: 'notable',
      classification: 'INFERRED',
      evidenceIds: [`ev-burst-${burst.from}-${burst.selector}`],
    })
  }
  for (const batch of current.failedBatches.slice(0, 3)) {
    events.push({
      id: `ev-fail-${batch.blockNumber}`,
      t: iso(batch.timestamp),
      blockNumber: batch.blockNumber,
      kind: 'failed-batch',
      title: `Failed transactions consumed gas in block ${batch.blockNumber}`,
      detail: `${batch.failedCount} reverted transactions used ${batch.failedGas.toString()} gas (${formatShare(batch.failedGas, batch.gasUsed)} of the block). Reverted transactions are included in gas accounting.`,
      severity: 'notable',
      classification: 'OBSERVED ON-CHAIN',
      evidenceIds: [`ev-fail-${batch.blockNumber}`],
    })
  }
  let prevSide: 'above' | 'below' | null = null
  let run = 0
  for (const block of parents) {
    const target = executionTarget(block.gasLimit)
    const side = block.gasUsed > target ? 'above' : block.gasUsed < target ? 'below' : 'equal'
    if (side === 'equal') continue
    if (prevSide && side !== prevSide && run >= 5) {
      events.push({
        id: `ev-cross-${block.number}`,
        t: iso(block.timestamp),
        blockNumber: block.number,
        kind: 'target-cross',
        title: `Target side changed to ${side}`,
        detail: `Block ${block.number} is ${side} its ${target.toString()} gas target after ${run} ${prevSide}-target blocks.`,
        severity: 'info',
        classification: 'PROTOCOL-EXACT',
        evidenceIds: ['ev-protocol-window'],
      })
    }
    if (side === prevSide) run += 1
    else {
      prevSide = side
      run = 1
    }
  }
  const prevSenders = new Set(previous.rows.sender.map((row) => row.key))
  if (previousBlocks.length > 0) {
    for (const row of current.rows.sender.slice(0, 5)) {
      if (!prevSenders.has(row.key)) {
        events.push({
          id: `ev-new-${row.key}`,
          t: iso(row.lastTs || input.toSec),
          blockNumber: last?.number ?? 0,
          kind: 'new-wallet',
          title: `Sender ${labelFor(row.key) ?? shortHash(row.key)} was absent from the previous window`,
          detail: `It now accounts for ${formatShare(row.gasUsed, current.totals.gasUsed)} of attributed gas. Absence earlier is not proof the address is new to Ethereum, only that it was not in the previous equal-length interval’s indexed receipts.`,
          severity: 'info',
          classification: 'OBSERVED ON-CHAIN',
          evidenceIds: [`ev-sender-${row.key}`],
        })
      }
    }
  }
  for (const block of blocks.filter((item) => !item.receiptsComplete).slice(0, 5)) {
    events.push({
      id: `ev-gap-${block.number}`,
      t: iso(block.timestamp),
      blockNumber: block.number,
      kind: 'receipt-gap',
      title: `Receipts incomplete for block ${block.number}`,
      detail: 'Header gas is stored, but transaction attribution for this block is withheld.',
      severity: 'high',
      classification: 'UNVERIFIED',
      evidenceIds: [`ev-gap-${block.number}`],
    })
  }

  const prevCategory = new Map(previous.rows.category.map((row) => [row.key, row]))
  const categoryDeltas = current.rows.category.slice(0, 8).map((row) => {
    const before = prevCategory.get(row.key)
    const nowShare = shareRatio(row.gasUsed, current.totals.gasUsed)
    const thenShare = before ? shareRatio(before.gasUsed, previous.totals.gasUsed) : 0
    const shareDelta = nowShare === null || thenShare === null ? null : nowShare - thenShare
    if (shareDelta !== null && Math.abs(shareDelta) >= 0.1 && row.key !== 'unknown') {
      events.push({
        id: `ev-shift-${row.key}`,
        t: iso(last?.timestamp ?? input.toSec),
        blockNumber: last?.number ?? 0,
        kind: 'category-shift',
        title: `${categoryLabel(row.key)} share changed ${(shareDelta * 100).toFixed(1)} points`,
        detail: 'Comparison is against the immediately previous equal-length interval. Labels are classifier output.',
        severity: 'notable',
        classification: 'INFERRED',
        evidenceIds: [`ev-category-${row.key}`],
      })
    }
    return {
      category: row.key,
      label: categoryLabel(row.key),
      shareDelta,
      gasDelta: (row.gasUsed - (before?.gasUsed ?? 0n)).toString(),
    }
  })

  const whatChanged: string[] = []
  let compare: AnalysisDto['compare'] = null
  if (previousBlocks.length === 0) {
    whatChanged.push('The previous equal-length interval has no indexed blocks, so there is no baseline comparison.')
  } else {
    const prevFirst = previousBlocks[0]!
    const prevLast = previousBlocks[previousBlocks.length - 1]!
    const prevPct = percentDelta(prevFirst.baseFeePerGas, prevLast.baseFeePerGas)
    const prevGas = previousBlocks.reduce((sum, b) => sum + b.gasUsed, 0n)
    const prevTarget = previousBlocks.reduce((sum, b) => sum + executionTarget(b.gasLimit), 0n)
    const occNow = sumTarget === 0n ? null : Number((sumGas * 1_000_000n) / sumTarget) / 1_000_000
    const occPrev = prevTarget === 0n ? null : Number((prevGas * 1_000_000n) / prevTarget) / 1_000_000
    const p50Now = tipP50(input.txs)
    const p50Prev = tipP50(input.previousTxs)
    const estNow = endFee !== null && p50Now !== null ? endFee + p50Now : null
    const estPrev = p50Prev !== null ? prevLast.baseFeePerGas + p50Prev : null
    let estimatorNote = 'Priority-fee samples were insufficient to compare the Standard estimate.'
    if (estNow !== null && estPrev !== null && endFee !== null) {
      const estDelta = estNow - estPrev
      const baseMove = endFee - prevLast.baseFeePerGas
      const tipMove = p50Now! - p50Prev!
      if (baseMove === 0n && estDelta !== 0n) {
        estimatorNote = `The Standard estimate changed by ${formatGweiFixed(estDelta)} gwei while the compared end base fees were equal. The change comes from the sampled p50 priority (${formatGweiFixed(tipMove)} gwei), not from the execution base fee.`
      } else {
        estimatorNote = `From the previous window’s end to this window’s end, the base fee changed ${formatGweiFixed(baseMove)} gwei and the sampled p50 priority changed ${formatGweiFixed(tipMove)} gwei. The Standard estimate, which adds those two, changed ${formatGweiFixed(estDelta)} gwei.`
      }
    }
    compare = {
      startUtc: iso(input.fromSec - (input.toSec - input.fromSec)),
      endUtc: iso(input.fromSec),
      baseFeePct: prevPct.pct,
      occupancyDelta: occNow !== null && occPrev !== null ? occNow - occPrev : null,
      txCountDelta: current.totals.txCount - previous.totals.txCount,
      burnWeiDelta: (current.totals.burnWei - previous.totals.burnWei).toString(),
      categoryDeltas,
      estimatorNote,
    }
    whatChanged.push(
      `Previous window base fee moved ${formatPct(prevPct.pct)} (${formatGweiFixed(prevFirst.baseFeePerGas)} → ${formatGweiFixed(prevLast.baseFeePerGas)} gwei). This window moved ${pctText}.`,
    )
    if (occNow !== null && occPrev !== null) {
      whatChanged.push(
        `Target-weighted occupancy is ${(occNow * 100).toFixed(1)}% in this window and was ${(occPrev * 100).toFixed(1)}% in the previous one.`,
      )
    }
    whatChanged.push(`Attributed transactions: ${current.totals.txCount} now versus ${previous.totals.txCount} previously (${current.totals.txCount - previous.totals.txCount >= 0 ? '+' : ''}${current.totals.txCount - previous.totals.txCount}).`)
    whatChanged.push(estimatorNote)
    const falling = delta !== null && delta < 0n
    if (falling) {
      const declined = categoryDeltas.filter((row) => row.shareDelta !== null && row.shareDelta < -0.02 && row.category !== 'unknown')
      if (declined.length === 0) {
        whatChanged.push('The base fee fell because parent blocks were under the gas target. No labelled category shows a clear share decline; do not invent one.')
      } else {
        whatChanged.push(
          `Labelled gas share declined for ${declined.map((row) => `${row.label} (${((row.shareDelta ?? 0) * 100).toFixed(1)} points)`).join(', ')}. That is a change in classified gas, not proof of motive.`,
        )
      }
    }
  }

  const topSender = definitive ? current.rows.sender[0] : undefined
  const topShare = topSender ? shareRatio(topSender.gasUsed, current.totals.gasUsed) : null
  const coverageText = coverage === null ? 'no blocks' : `${(coverage * 100).toFixed(1)}% receipt coverage`
  const ribbonCore = !first || !last
    ? `No blocks in this interval | ${coverageText}`
    : `Base fee ${delta !== null && delta > 0n ? '↑' : delta !== null && delta < 0n ? '↓' : '→'} ${pctText} | ${above}/${Math.max(parents.length, 0)} parent blocks above target | ${
        topSender && topShare !== null
          ? `largest observed sender ${labelFor(topSender.key) ?? shortHash(topSender.key)} at ${(topShare * 100).toFixed(1)}% of attributed gas`
          : definitive
            ? 'no sender reached 3% of attributed gas'
            : 'sender ranking withheld'
      } | ${coverageText}`
  const ribbon = `${input.synthetic ? 'DEMO · ' : ''}${ribbonCore}`

  const limitedChecks =
    input.includeAllChecks || checks.length <= 1500
      ? checks
      : [...checks].sort((a, b) => {
          const da = BigInt(a.deltaWei)
          const db = BigInt(b.deltaWei)
          const aa = da < 0n ? -da : da
          const bb = db < 0n ? -db : db
          return aa > bb ? -1 : 1
        }).slice(0, 60)

  const failedShare = shareRatio(current.totals.failedGas, current.totals.gasUsed)

  return {
    formulaVersion: input.formulaVersion,
    startUtc: iso(input.fromSec),
    endUtc: iso(input.toSec),
    timezone: input.tz,
    synthetic: input.synthetic,
    partial,
    ribbon,
    verdict,
    whatChanged,
    coverage: {
      blocks: blocks.length,
      receiptsCompleteBlocks: complete,
      receiptCoverage: coverage,
      txCount: current.totals.txCount,
      indexedFrom: input.indexedFromSec === null ? null : iso(input.indexedFromSec),
      indexedTo: input.indexedToSec === null ? null : iso(input.indexedToSec),
      definitiveRankings: definitive,
      notes,
    },
    bounds: {
      firstBlock: first?.number ?? null,
      lastBlock: last?.number ?? null,
      firstTimestamp: first ? iso(first.timestamp) : null,
      lastTimestamp: last ? iso(last.timestamp) : null,
      startBaseFeeWei: startFee?.toString() ?? null,
      endBaseFeeWei: endFee?.toString() ?? null,
      absDeltaWei: delta?.toString() ?? null,
      pctDelta: pctInfo.pct,
      zeroBaseline: pctInfo.zeroBaseline,
      minBaseFeeWei: minFee?.toString() ?? null,
      maxBaseFeeWei: maxFee?.toString() ?? null,
      maxIncreaseWei: maxUp.toString(),
      maxDecreaseWei: maxDown.toString(),
      blocksAboveTarget: above,
      blocksBelowTarget: below,
      blocksAtTarget: equal,
      targetWeightedOccupancy: sumTarget === 0n ? null : Number((sumGas * 1_000_000n) / sumTarget) / 1_000_000,
      limitOccupancy: sumLimit === 0n ? null : Number((sumGas * 1_000_000n) / sumLimit) / 1_000_000,
      burnWei: current.totals.burnWei.toString(),
      tipWei: current.totals.tipWei.toString(),
      blobFeeWei: current.totals.blobFeeWei.toString(),
      failedGas: current.totals.failedGas.toString(),
      failedGasShare: failedShare,
      txCount: current.totals.txCount,
      baseFeeStdevGwei: stdevGwei(blocks),
      secondsAboveStartFee: secondsAbove,
    },
    compare,
    protocol: {
      summary: parents.length
        ? `${above} parent blocks above target, ${below} below, ${equal} equal. ${mismatches} formula mismatches. ${gaps} linkage gaps.`
        : 'No in-window parent step.',
      above,
      below,
      equal,
      mismatchCount: mismatches,
      checksTruncated: limitedChecks.length !== checks.length,
      checks: limitedChecks,
    },
    evidence,
    causes: (() => {
      const trimmed = causes.slice(0, 6)
      const unknownCause = causes.find((cause) => cause.kind === 'unknown')
      if (unknownCause && !trimmed.some((cause) => cause.kind === 'unknown')) trimmed[trimmed.length - 1] = unknownCause
      return trimmed
    })(),
    events: events.sort((a, b) => a.t.localeCompare(b.t)).slice(0, 40),
    unknownGasShare: unknownShare,
    rankingsNote: definitive
      ? 'Sender, contract, category, and method tables are separate exclusive groupings. Do not add them together.'
      : 'Definitive rankings are disabled because receipt coverage is below 98% or the block sequence has gaps.',
  }
}

export function evidenceText(analysis: AnalysisDto): string {
  const lines = [
    `GasScope evidence`,
    `Window ${analysis.startUtc} → ${analysis.endUtc} (${analysis.timezone})`,
    analysis.synthetic ? 'SYNTHETIC DEMO — not mainnet' : 'Source: indexed canonical blocks and receipts',
    `Formula ${analysis.formulaVersion}`,
    analysis.verdict,
    `Coverage: ${analysis.coverage.receiptCoverage === null ? 'n/a' : (analysis.coverage.receiptCoverage * 100).toFixed(2) + '%'}`,
    `Burned ${formatEth(BigInt(analysis.bounds.burnWei))} ETH execution base fee; tips ${formatEth(BigInt(analysis.bounds.tipWei))} ETH; blob fees ${formatEth(BigInt(analysis.bounds.blobFeeWei))} ETH.`,
    ...analysis.causes.map((cause) => `#${cause.rank} [${cause.classification}] ${cause.title}: ${cause.summary}`),
  ]
  return lines.join('\n')
}
