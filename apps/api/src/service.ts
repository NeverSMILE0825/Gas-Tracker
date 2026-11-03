import {
  analyzeWindow,
  bucketize,
  buildCurrent,
  counterfactualBlock,
  DEMO_LABELS,
  evidenceText,
  executionTarget,
  externalLink,
  fixtureReport,
  formulaVersion,
  lookupAddress,
  methodologyDocument,
  nextBaseFee,
  replayBaseFee,
  rollup,
  type ChainBlock,
  type ChainTx,
} from '@gasscope/analytics'
import {
  categoryLabel,
  driversQuerySchema,
  intervalQuerySchema,
  resolveInterval,
  sensitivityBodySchema,
  shareRatio,
  shortHash,
  toIsoUtc,
  type AddressDto,
  type AnalysisDto,
  type BlockDetailDto,
  type ChartDto,
  type DriverRowDto,
  type DriversDto,
  type EvidenceClass,
  type SensitivityDto,
  type TxDetailDto,
} from '@gasscope/shared'
import type { GasData, GroupedDriver } from './data'

const RECEIPT_CAP = 80_000

export function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number }
  error.statusCode = statusCode
  return error
}

function bounds(query: { from?: string; to?: string; preset?: string; bucket?: string; live?: boolean; tz?: string }, nowMs: number) {
  const resolved = intervalQuerySchema.safeParse(query)
  if (!resolved.success) throw httpError(400, resolved.error.issues.map((issue) => issue.message).join('; '))
  const interval = requireInterval({ ...resolved.data, nowMs })
  return { parsed: resolved.data, interval, ...secs(interval.fromMs, interval.toMs) }
}

function requireInterval(input: { from?: string; to?: string; preset?: string; bucket?: string; live?: boolean; tz?: string; nowMs: number }) {
  const interval = resolveInterval(input)
  if (!interval.ok) throw httpError(interval.status, interval.error)
  return interval.value
}

function secs(fromMs: number, toMs: number) {
  return { fromSec: Math.floor(fromMs / 1000), toSec: Math.ceil(toMs / 1000) }
}

function labelFor(synthetic: boolean, address: string): string | null {
  if (synthetic) return DEMO_LABELS[address.toLowerCase()] ?? null
  return lookupAddress(address)?.name ?? null
}

function toTx(tx: ChainTx, block: ChainBlock | null): TxDetailDto {
  const share = block && block.gasUsed > 0n ? shareRatio(tx.gasUsed, block.gasUsed) : null
  return {
    hash: tx.hash,
    blockNumber: tx.blockNumber,
    txIndex: tx.txIndex,
    timestamp: toIsoUtc(tx.timestamp * 1000),
    from: tx.from,
    to: tx.to,
    synthetic: tx.synthetic,
    txType: tx.txType,
    status: tx.status === 1 ? 'success' : 'reverted',
    valueWei: tx.valueWei.toString(),
    gasUsed: tx.gasUsed.toString(),
    gasLimit: tx.gasLimit.toString(),
    effectiveGasPriceWei: tx.effectiveGasPrice.toString(),
    maxFeePerGasWei: tx.maxFeePerGas?.toString() ?? null,
    maxPriorityFeePerGasWei: tx.maxPriorityFeePerGas?.toString() ?? null,
    baseFeePerGasWei: tx.baseFeePerGas.toString(),
    executionFeeWei: tx.executionFeeWei.toString(),
    baseBurnWei: tx.baseBurnWei.toString(),
    tipWei: tx.tipWei.toString(),
    blobGasUsed: tx.blobGasUsed?.toString() ?? null,
    blobGasPriceWei: tx.blobGasPrice?.toString() ?? null,
    blobFeeWei: tx.blobFeeWei?.toString() ?? null,
    selector: tx.selector,
    method: tx.method,
    methodSource: tx.methodSource,
    category: tx.category,
    categoryLabel: categoryLabel(tx.category),
    classification: tx.classification,
    confidence: tx.categoryConfidence,
    provenance: tx.categoryProvenance,
    shareOfBlockGas: share,
    links: [
      externalLink(tx.synthetic, 'tx', tx.hash),
      externalLink(tx.synthetic, 'address', tx.from),
      ...(tx.to ? [externalLink(tx.synthetic, 'address', tx.to)] : []),
    ],
    note: tx.status === 0 ? 'This transaction reverted. The gas it used still counts.' : 'Receipt status is success. ETH value transferred is not a fee.',
  }
}

export async function analysis(data: GasData, query: Record<string, unknown>, nowMs = Date.now()): Promise<AnalysisDto> {
  const { parsed, interval, fromSec, toSec } = bounds(query as never, nowMs)
  const span = toSec - fromSec
  const [blocks, previousBlocks, count] = await Promise.all([
    data.blocksBetween(fromSec, toSec),
    parsed.compare === false ? Promise.resolve([]) : data.blocksBetween(fromSec - span, fromSec),
    data.countTxs(fromSec, toSec),
  ])
  const status = await data.getStatus()
  const synthetic = status.synthetic || blocks.some((block) => block.synthetic)
  if (count > RECEIPT_CAP) {
    const totals = await data.feeTotals(fromSec, toSec)
    const result = analyzeWindow({
      fromSec,
      toSec,
      tz: interval.tz,
      synthetic,
      formulaVersion: formulaVersion(),
      blocks,
      txs: [],
      previousBlocks,
      previousTxs: [],
      indexedFromSec: status.indexedFrom ? Math.floor(Date.parse(status.indexedFrom) / 1000) : null,
      indexedToSec: status.indexedTo ? Math.floor(Date.parse(status.indexedTo) / 1000) : null,
      includeAllChecks: parsed.includeChecks === true,
      labelFor: (address) => labelFor(synthetic, address),
    })
    result.bounds.burnWei = totals.burnWei
    result.bounds.tipWei = totals.tipWei
    result.bounds.blobFeeWei = totals.blobFeeWei
    result.bounds.failedGas = totals.failedGas
    result.bounds.txCount = totals.txCount
    result.bounds.failedGasShare = shareRatio(BigInt(totals.failedGas), BigInt(totals.gasUsed))
    result.coverage.txCount = totals.txCount
    result.coverage.definitiveRankings = false
    result.partial = true
    result.rankingsNote = `This window has ${count.toLocaleString('en-US')} transactions, above the ${RECEIPT_CAP.toLocaleString('en-US')} receipt cap. Base-fee math uses every block header and fee totals are summed in the database. Open a shorter interval for per-sender proof.`
    result.coverage.notes.push(result.rankingsNote)
    result.unknownGasShare = null
    return result
  }
  const [txs, previousTxs] = await Promise.all([
    data.txsBetween(fromSec, toSec),
    parsed.compare === false ? Promise.resolve([]) : data.txsBetween(fromSec - span, fromSec),
  ])
  return analyzeWindow({
    fromSec,
    toSec,
    tz: interval.tz,
    synthetic,
    formulaVersion: formulaVersion(),
    blocks,
    txs,
    previousBlocks,
    previousTxs,
    indexedFromSec: status.indexedFrom ? Math.floor(Date.parse(status.indexedFrom) / 1000) : null,
    indexedToSec: status.indexedTo ? Math.floor(Date.parse(status.indexedTo) / 1000) : null,
    includeAllChecks: parsed.includeChecks === true,
    labelFor: (address) => labelFor(synthetic, address),
  })
}

export async function chart(data: GasData, query: Record<string, unknown>, nowMs = Date.now()): Promise<ChartDto> {
  const { parsed, interval, fromSec, toSec } = bounds(query as never, nowMs)
  const blocks = await data.blocksBetween(fromSec, toSec)
  const count = await data.countTxs(fromSec, toSec)
  const txs = count > RECEIPT_CAP ? [] : await data.txsBetween(fromSec, toSec)
  const span = toSec - fromSec
  const priorBlocks = parsed.compare === false ? [] : await data.blocksBetween(fromSec - span, fromSec)
  const status = await data.getStatus()
  return {
    from: interval.fromIso,
    to: interval.toIso,
    resolution: interval.bucket,
    synthetic: status.synthetic || blocks.some((block) => block.synthetic),
    partial: blocks.length === 0 || (status.indexedFrom !== null && fromSec * 1000 < Date.parse(status.indexedFrom)),
    coverage: blocks.length === 0 ? 0 : blocks.filter((block) => block.receiptsComplete).length / blocks.length,
    note:
      count > RECEIPT_CAP
        ? 'Priority percentiles are omitted because this range exceeds the receipt cap. Base fee and gas-used bars still come from block headers.'
        : interval.bucket === 'block'
          ? 'Each point is one block. Utilization is gas used divided by that block’s dynamic target.'
          : 'Each point aggregates canonical blocks. The 100% line is the dynamic target, not the gas limit.',
    points: bucketize(blocks, interval.bucket, txs),
    prior: parsed.compare === false ? null : bucketize(priorBlocks, interval.bucket, []),
  }
}

export async function drivers(data: GasData, query: Record<string, unknown>, nowMs = Date.now()): Promise<DriversDto> {
  const parsed = driversQuerySchema.safeParse(query)
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((issue) => issue.message).join('; '))
  const interval = requireInterval({ ...parsed.data, nowMs })
  const { fromSec, toSec } = secs(interval.fromMs, interval.toMs)
  const status = await data.getStatus()
  const count = await data.countTxs(fromSec, toSec)
  const offset = decodeCursor(parsed.data.cursor)
  const synthetic = status.synthetic
  let rows: DriverRowDto[]
  if (count > RECEIPT_CAP) {
    const grouped = await data.groupedDrivers(fromSec, toSec, parsed.data.groupBy, offset + parsed.data.limit + 1)
    const total = BigInt((await data.feeTotals(fromSec, toSec)).gasUsed)
    rows = grouped.map((row, index) => groupedToDriver(row, index + 1, total, synthetic, parsed.data.groupBy))
  } else {
    const txs = await data.txsBetween(fromSec, toSec)
    const blocks = await data.blocksBetween(fromSec, toSec)
    const rolled = rollup(blocks, txs)
    const previous = parsed.data.compare === false ? null : rollup(await data.blocksBetween(fromSec - (toSec - fromSec), fromSec), await data.txsBetween(fromSec - (toSec - fromSec), fromSec))
    const source = sortRows(rolled.rows[parsed.data.groupBy], parsed.data.sort)
    const prevMap = new Map((previous?.rows[parsed.data.groupBy] ?? []).map((row) => [row.key, row]))
    rows = source.map((row, index) => {
      const before = prevMap.get(row.key)
      return {
        rank: index + 1,
        key: row.key,
        label: displayKey(parsed.data.groupBy, row.key, row.method, synthetic),
        category: row.category,
        categoryLabel: row.category ? categoryLabel(row.category) : 'Unclassified',
        gasUsed: row.gasUsed.toString(),
        gasShare: shareRatio(row.gasUsed, rolled.totals.gasUsed),
        txCount: row.txCount,
        failedGas: row.failedGas.toString(),
        failedTxCount: row.failedTxCount,
        avgGas: row.txCount ? (row.gasUsed / BigInt(row.txCount)).toString() : '0',
        executionFeeWei: row.executionFeeWei.toString(),
        burnWei: row.burnWei.toString(),
        tipWei: row.tipWei.toString(),
        blobFeeWei: row.blobFeeWei.toString(),
        firstTimestamp: row.firstTs ? toIsoUtc(row.firstTs * 1000) : null,
        lastTimestamp: row.lastTs ? toIsoUtc(row.lastTs * 1000) : null,
        trendGasDelta: before ? (row.gasUsed - before.gasUsed).toString() : null,
        trendShareDelta: before ? (shareRatio(row.gasUsed, rolled.totals.gasUsed) ?? 0) - (shareRatio(before.gasUsed, previous!.totals.gasUsed) ?? 0) : null,
        classification: row.classification,
        methodNote: row.provenance,
        links: linkFor(parsed.data.groupBy, row.key, synthetic),
        synthetic,
      }
    })
  }
  const page = rows.slice(offset, offset + parsed.data.limit)
  const definitive = count <= RECEIPT_CAP && (await data.blocksBetween(fromSec, toSec)).every((block) => block.receiptsComplete)
  return {
    groupBy: parsed.data.groupBy,
    sort: parsed.data.sort,
    from: interval.fromIso,
    to: interval.toIso,
    synthetic,
    definitive,
    note: definitive
      ? 'Each table is its own exclusive grouping. Do not add a sender share to a contract share.'
      : 'Rankings are partial: receipts are incomplete or the range exceeded the in-process receipt cap. Database sums are still exclusive within this table.',
    rows: page,
    nextCursor: offset + parsed.data.limit < rows.length ? encodeCursor(offset + parsed.data.limit) : null,
  }
}

function groupedToDriver(row: GroupedDriver, rank: number, total: bigint, synthetic: boolean, groupBy: DriversDto['groupBy']): DriverRowDto {
  const gas = BigInt(row.gasUsed)
  const classification: EvidenceClass = groupBy === 'category' && row.key !== 'unknown' ? 'INFERRED' : groupBy === 'method' && row.method ? 'INFERRED' : 'OBSERVED ON-CHAIN'
  return {
    rank,
    key: row.key,
    label: displayKey(groupBy, row.key, row.method, synthetic),
    category: row.category,
    categoryLabel: categoryLabel(row.category ?? row.key),
    gasUsed: row.gasUsed,
    gasShare: shareRatio(gas, total),
    txCount: row.txCount,
    failedGas: row.failedGas,
    failedTxCount: row.failedTxCount,
    avgGas: row.txCount ? (gas / BigInt(row.txCount)).toString() : '0',
    executionFeeWei: row.executionFeeWei,
    burnWei: row.burnWei,
    tipWei: row.tipWei,
    blobFeeWei: row.blobFeeWei,
    firstTimestamp: toIsoUtc(row.firstTs * 1000),
    lastTimestamp: toIsoUtc(row.lastTs * 1000),
    trendGasDelta: null,
    trendShareDelta: null,
    classification,
    methodNote: 'Database sum of receipt gas. Trend is omitted above the receipt cap.',
    links: linkFor(groupBy, row.key, synthetic),
    synthetic,
  }
}

function displayKey(groupBy: DriversDto['groupBy'], key: string, method: string | null, synthetic: boolean): string {
  if (groupBy === 'category') return categoryLabel(key)
  if (groupBy === 'method') return method ?? (key === 'none' ? 'No selector' : `Unidentified method ${key}`)
  if (key.startsWith('create:')) return 'Contract creation'
  return labelFor(synthetic, key) ?? shortHash(key)
}

function linkFor(groupBy: DriversDto['groupBy'], key: string, synthetic: boolean) {
  if ((groupBy === 'sender' || groupBy === 'contract') && key.startsWith('0x')) return [externalLink(synthetic, 'address', key)]
  return []
}

function sortRows<T extends { gasUsed: bigint; executionFeeWei: bigint; tipWei: bigint; txCount: number }>(rows: T[], sort: 'gasUsed' | 'fees' | 'txCount' | 'tip'): T[] {
  const value = (row: T) => (sort === 'fees' ? row.executionFeeWei : sort === 'tip' ? row.tipWei : sort === 'txCount' ? BigInt(row.txCount) : row.gasUsed)
  return [...rows].sort((a, b) => (value(a) > value(b) ? -1 : value(a) < value(b) ? 1 : 0))
}

function encodeCursor(offset: number): string {
  return btoa(String(offset)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeCursor(cursor?: string): number {
  if (!cursor) return 0
  const pad = cursor.length % 4 === 0 ? '' : '='.repeat(4 - (cursor.length % 4))
  const offset = Number(atob(cursor.replace(/-/g, '+').replace(/_/g, '/') + pad))
  if (!Number.isInteger(offset) || offset < 0 || offset > 10_000) throw httpError(400, 'Invalid cursor.')
  return offset
}

export async function current(data: GasData, nowMs = Date.now()) {
  const { blocks, txs } = await data.recent(420)
  const status = await data.getStatus()
  return buildCurrent({ blocks, txs, nowSec: Math.floor(nowMs / 1000), synthetic: status.synthetic })
}

export async function blockDetail(data: GasData, number: number): Promise<BlockDetailDto> {
  const block = await data.blockByNumber(number)
  if (!block) throw httpError(404, `Block ${number} is not in the index.`)
  const [txs, parent, child] = await Promise.all([
    data.txsInBlock(number),
    data.blockByNumber(number - 1),
    data.blockByNumber(number + 1),
  ])
  const parentMath = parent
    ? (() => {
        const step = nextBaseFee(parent)
        return {
          parentNumber: parent.number,
          parentHash: parent.hash,
          parentGasUsed: parent.gasUsed.toString(),
          parentTarget: step.target.toString(),
          parentBaseFeeWei: parent.baseFeePerGas.toString(),
          predictedWei: step.next.toString(),
          observedWei: block.baseFeePerGas.toString(),
          deltaWei: (block.baseFeePerGas - parent.baseFeePerGas).toString(),
          direction: block.baseFeePerGas > parent.baseFeePerGas ? 'up' as const : block.baseFeePerGas < parent.baseFeePerGas ? 'down' as const : 'flat' as const,
          match: parent.hash === block.parentHash && step.next === block.baseFeePerGas,
          formula: step.formula,
        }
      })()
    : null
  const next = nextBaseFee(block)
  const burn = txs.reduce((sum, tx) => sum + tx.baseBurnWei, 0n)
  const tip = txs.reduce((sum, tx) => sum + tx.tipWei, 0n)
  const blob = txs.reduce((sum, tx) => sum + (tx.blobFeeWei ?? 0n), 0n)
  const failed = txs.filter((tx) => tx.status === 0).reduce((sum, tx) => sum + tx.gasUsed, 0n)
  const by = (keyFn: (tx: ChainTx) => string | null) => {
    const map = new Map<string, { gas: bigint; count: number }>()
    for (const tx of txs) {
      const key = keyFn(tx)
      if (!key) continue
      const row = map.get(key) ?? { gas: 0n, count: 0 }
      row.gas += tx.gasUsed
      row.count += 1
      map.set(key, row)
    }
    return [...map.entries()]
      .sort((a, b) => (a[1].gas > b[1].gas ? -1 : 1))
      .slice(0, 10)
      .map(([address, row]) => ({ address, gasUsed: row.gas.toString(), share: shareRatio(row.gas, block.gasUsed), txCount: row.count }))
  }
  return {
    synthetic: block.synthetic,
    number: block.number,
    hash: block.hash,
    parentHash: block.parentHash,
    timestamp: toIsoUtc(block.timestamp * 1000),
    gasUsed: block.gasUsed.toString(),
    gasLimit: block.gasLimit.toString(),
    gasTarget: executionTarget(block.gasLimit).toString(),
    baseFeeWei: block.baseFeePerGas.toString(),
    blobGasUsed: block.blobGasUsed?.toString() ?? null,
    excessBlobGas: block.excessBlobGas?.toString() ?? null,
    blobBaseFeeWei: block.blobBaseFee?.toString() ?? null,
    blobTarget: null,
    txCount: block.txCount,
    receiptsComplete: block.receiptsComplete,
    confirmation: block.confirmation,
    miner: block.miner,
    parentMath,
    nextMath: {
      childNumber: child?.number ?? null,
      predictedWei: next.next.toString(),
      observedWei: child?.baseFeePerGas.toString() ?? null,
      match: child ? child.parentHash === block.hash && child.baseFeePerGas === next.next : null,
      deltaWei: next.delta.toString(),
      direction: next.direction,
    },
    totals: { burnWei: burn.toString(), tipWei: tip.toString(), blobFeeWei: blob.toString(), failedGas: failed.toString() },
    topSenders: by((tx) => tx.from),
    topContracts: by((tx) => tx.to),
    transactions: txs.map((tx) => toTx(tx, block)),
    links: [externalLink(block.synthetic, 'block', block.number)],
  }
}

export async function transactionDetail(data: GasData, hash: string): Promise<TxDetailDto> {
  const tx = await data.txByHash(hash)
  if (!tx) throw httpError(404, 'Transaction is not in the index.')
  const block = await data.blockByNumber(tx.blockNumber)
  return toTx(tx, block)
}

export async function addressDetail(data: GasData, address: string, query: Record<string, unknown>, nowMs = Date.now()): Promise<AddressDto> {
  const { interval, fromSec, toSec } = bounds(query as never, nowMs)
  const status = await data.getStatus()
  const txs = await data.txsByAddress(address, fromSec, toSec)
  const sent = txs.filter((tx) => tx.from.toLowerCase() === address.toLowerCase())
  const gas = sent.reduce((sum, tx) => sum + tx.gasUsed, 0n)
  const windowTotals = await data.feeTotals(fromSec, toSec)
  const categories = new Map<string, bigint>()
  for (const tx of sent) categories.set(tx.category, (categories.get(tx.category) ?? 0n) + tx.gasUsed)
  const blocks = new Map<number, ChainBlock>()
  for (const tx of sent.slice(0, 40)) {
    if (!blocks.has(tx.blockNumber)) {
      const block = await data.blockByNumber(tx.blockNumber)
      if (block) blocks.set(block.number, block)
    }
  }
  return {
    address,
    label: labelFor(status.synthetic, address),
    synthetic: status.synthetic || sent.some((tx) => tx.synthetic),
    from: interval.fromIso,
    to: interval.toIso,
    gasUsed: gas.toString(),
    gasShare: shareRatio(gas, BigInt(windowTotals.gasUsed)),
    txCount: sent.length,
    failedGas: sent.filter((tx) => tx.status === 0).reduce((sum, tx) => sum + tx.gasUsed, 0n).toString(),
    burnWei: sent.reduce((sum, tx) => sum + tx.baseBurnWei, 0n).toString(),
    tipWei: sent.reduce((sum, tx) => sum + tx.tipWei, 0n).toString(),
    executionFeeWei: sent.reduce((sum, tx) => sum + tx.executionFeeWei, 0n).toString(),
    categories: [...categories.entries()].map(([category, used]) => ({
      category,
      label: categoryLabel(category),
      gasUsed: used.toString(),
      share: shareRatio(used, gas),
      classification: category === 'unknown' ? 'UNVERIFIED' : 'INFERRED',
    })),
    transactions: sent.slice(0, 40).map((tx) => toTx(tx, blocks.get(tx.blockNumber) ?? null)),
    note: 'Gas totals count transactions this address sent. Calls to this address are listed only when it is the top-level callee; they are not added into the sender gas total.',
    links: [externalLink(status.synthetic, 'address', address)],
  }
}

export async function sensitivity(data: GasData, body: unknown, nowMs = Date.now()): Promise<SensitivityDto> {
  const parsed = sensitivityBodySchema.safeParse(body)
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((issue) => issue.message).join('; '))
  const interval = requireInterval({ ...parsed.data, live: parsed.data.live, nowMs })
  if (interval.toMs - interval.fromMs > 3 * 3600 * 1000) {
    throw httpError(400, 'Counterfactuals are limited to 3 hours. Narrow the interval.')
  }
  const { fromSec, toSec } = secs(interval.fromMs, interval.toMs)
  const count = await data.countTxs(fromSec, toSec)
  if (count > RECEIPT_CAP) throw httpError(400, 'This interval has too many receipts to replay in one request.')
  const [blocks, txs, status] = await Promise.all([
    data.blocksBetween(fromSec, toSec),
    data.txsBetween(fromSec, toSec),
    data.getStatus(),
  ])
  if (blocks.length === 0) throw httpError(404, 'No indexed blocks in that interval.')
  if (blocks.length > 1500) throw httpError(400, 'Too many blocks to replay. Narrow the interval.')
  const removed = new Map<number, bigint>()
  let scope: SensitivityDto['scope'] = 'sender-interval'
  if (parsed.data.txHash) {
    const tx = txs.find((item) => item.hash === parsed.data.txHash!.toLowerCase()) ?? (await data.txByHash(parsed.data.txHash))
    if (!tx) throw httpError(404, 'Transaction was not found in this interval.')
    removed.set(tx.blockNumber, (removed.get(tx.blockNumber) ?? 0n) + tx.gasUsed)
    scope = 'transaction'
  } else if (parsed.data.sender) {
    const sender = parsed.data.sender.toLowerCase()
    for (const tx of txs) {
      if (tx.from.toLowerCase() === sender) removed.set(tx.blockNumber, (removed.get(tx.blockNumber) ?? 0n) + tx.gasUsed)
    }
  } else throw httpError(400, 'Provide a sender address or a transaction hash.')
  const replay = replayBaseFee(blocks, removed)
  const flipped = replay.filter((step) => step.flippedBelowTarget)
  const focus = parsed.data.blockNumber ? replay.find((step) => step.number === parsed.data.blockNumber) : replay.find((step) => step.removedGas > 0n)
  const single = focus
    ? counterfactualBlock(
        {
          gasUsed: focus.observedGasUsed,
          gasLimit: blocks.find((block) => block.number === focus.number)?.gasLimit ?? 0n,
          baseFeePerGas: focus.observedBaseFeeWei,
        },
        focus.removedGas,
      )
    : null
  const steps = replay.length > 400 ? replay.filter((_, index) => index % Math.ceil(replay.length / 400) === 0 || removed.has(replay[index]!.number)) : replay
  return {
    classification: 'MODELLED',
    banner: 'MODELLED / NOT REAL-WORLD CAUSAL PROOF. Other transactions stay in the block. A builder could have included different transactions if this gas were absent.',
    assumptions: [
      'Removed gas is subtracted from the observed gas used of each block.',
      'The first block’s base fee is kept, because its parent is outside the edit.',
      'Later base fees are replayed with the EIP-1559 integer formula.',
      'Wallet effects are not added together; overlapping transactions would be counted twice if summed from separate runs.',
      single?.flippedBelowTarget ? 'The fixed-block check shows this removal would move at least one edited block from above target to below target.' : 'The fixed-block check does not show a strict above-target to below-target flip for the edited gas.',
    ],
    from: interval.fromIso,
    to: interval.toIso,
    synthetic: status.synthetic,
    scope,
    observedEndBaseFeeWei: replay[replay.length - 1]?.observedBaseFeeWei.toString() ?? null,
    modelledEndBaseFeeWei: replay[replay.length - 1]?.modelledBaseFeeWei.toString() ?? null,
    flippedAnyBlock: flipped.length > 0,
    flippedCount: flipped.length,
    stepsTruncated: steps.length !== replay.length,
    blocks: steps.map((step) => ({
      number: step.number,
      observedBaseFeeWei: step.observedBaseFeeWei.toString(),
      modelledBaseFeeWei: step.modelledBaseFeeWei.toString(),
      observedGasUsed: step.observedGasUsed.toString(),
      modelledGasUsed: step.modelledGasUsed.toString(),
      target: step.target.toString(),
      observedNextWei: step.observedNextWei.toString(),
      modelledNextWei: step.modelledNextWei.toString(),
      flippedAcrossTarget: step.flippedBelowTarget,
      removedGas: step.removedGas.toString(),
    })),
    note: 'MODELLED / NOT REAL-WORLD CAUSAL PROOF',
  }
}

export async function blockList(data: GasData, query: Record<string, unknown>, nowMs = Date.now()) {
  const { interval, fromSec, toSec } = bounds(query as never, nowMs)
  const blocks = await data.blocksBetween(fromSec, toSec)
  const slice = blocks.slice(-300)
  return {
    from: interval.fromIso,
    to: interval.toIso,
    truncated: slice.length !== blocks.length,
    blocks: slice.map((block, index) => {
      const previous = slice[index - 1]
      const target = executionTarget(block.gasLimit)
      return {
        number: block.number,
        timestamp: toIsoUtc(block.timestamp * 1000),
        baseFeeWei: block.baseFeePerGas.toString(),
        gasUsed: block.gasUsed.toString(),
        gasTarget: target.toString(),
        gasLimit: block.gasLimit.toString(),
        utilTarget: target === 0n ? null : Number((block.gasUsed * 1_000_000n) / target) / 1_000_000,
        txCount: block.txCount,
        receiptsComplete: block.receiptsComplete,
        direction: !previous ? 'flat' : block.baseFeePerGas > previous.baseFeePerGas ? 'up' : block.baseFeePerGas < previous.baseFeePerGas ? 'down' : 'flat',
      }
    }),
  }
}

export function evidence(data: AnalysisDto): { text: string } {
  return { text: evidenceText(data) }
}

export function docs() {
  return methodologyDocument()
}

export function fixture() {
  return fixtureReport()
}
