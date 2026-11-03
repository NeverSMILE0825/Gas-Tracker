import { executionTarget } from './basefee'
import type { AggRow, ChainBlock, ChainTx, Rollup, Totals } from './domain'

interface Mutable extends Omit<AggRow, 'sampleTxs'> {
  samples: ChainTx[]
  categoryGas: Map<string, bigint>
}

function empty(key: string): Mutable {
  return {
    key,
    label: null,
    category: null,
    confidence: 'none',
    classification: 'UNVERIFIED',
    provenance: '',
    method: null,
    gasUsed: 0n,
    txCount: 0,
    failedGas: 0n,
    failedTxCount: 0,
    burnWei: 0n,
    tipWei: 0n,
    executionFeeWei: 0n,
    blobFeeWei: 0n,
    firstTs: Number.POSITIVE_INFINITY,
    lastTs: 0,
    aboveTargetGas: 0n,
    samples: [],
    categoryGas: new Map(),
  }
}

function add(row: Mutable, tx: ChainTx, above: boolean, category: string) {
  row.gasUsed += tx.gasUsed
  row.txCount += 1
  row.burnWei += tx.baseBurnWei
  row.tipWei += tx.tipWei
  row.executionFeeWei += tx.executionFeeWei
  row.blobFeeWei += tx.blobFeeWei ?? 0n
  if (tx.status === 0) {
    row.failedGas += tx.gasUsed
    row.failedTxCount += 1
  }
  if (tx.timestamp < row.firstTs) row.firstTs = tx.timestamp
  if (tx.timestamp > row.lastTs) row.lastTs = tx.timestamp
  if (above) row.aboveTargetGas += tx.gasUsed
  row.categoryGas.set(category, (row.categoryGas.get(category) ?? 0n) + tx.gasUsed)
  row.samples.push(tx)
  row.samples.sort((a, b) => (a.gasUsed > b.gasUsed ? -1 : 1))
  if (row.samples.length > 5) row.samples.length = 5
}

function finish(row: Mutable, label: string | null, provenance: string, method: string | null, classification: AggRow['classification'], confidence: AggRow['confidence']): AggRow {
  let topCat: string | null = null
  let topGas = -1n
  for (const [cat, gas] of row.categoryGas) {
    if (gas > topGas) {
      topGas = gas
      topCat = cat
    }
  }
  const mixed = topCat && row.gasUsed > 0n && topGas * 100n < row.gasUsed * 70n
  return {
    key: row.key,
    label,
    category: mixed ? 'mixed' : topCat,
    confidence,
    classification,
    provenance,
    method,
    gasUsed: row.gasUsed,
    txCount: row.txCount,
    failedGas: row.failedGas,
    failedTxCount: row.failedTxCount,
    burnWei: row.burnWei,
    tipWei: row.tipWei,
    executionFeeWei: row.executionFeeWei,
    blobFeeWei: row.blobFeeWei,
    firstTs: Number.isFinite(row.firstTs) ? row.firstTs : 0,
    lastTs: row.lastTs,
    aboveTargetGas: row.aboveTargetGas,
    sampleTxs: row.samples,
  }
}

function blockMap(blocks: ChainBlock[]): Map<number, ChainBlock> {
  return new Map(blocks.map((b) => [b.number, b]))
}

export function rollup(blocks: ChainBlock[], txs: ChainTx[]): Rollup {
  const byBlock = blockMap(blocks)
  const senders = new Map<string, Mutable>()
  const contracts = new Map<string, Mutable>()
  const categories = new Map<string, Mutable>()
  const methods = new Map<string, Mutable>()
  const totals: Totals = {
    gasUsed: 0n,
    burnWei: 0n,
    tipWei: 0n,
    executionFeeWei: 0n,
    blobFeeWei: 0n,
    failedGas: 0n,
    txCount: 0,
  }
  const heavy: ChainTx[] = []
  const burstMap = new Map<string, { from: string; to: string | null; selector: string; method: string | null; count: number; gasUsed: bigint; firstTs: number; lastTs: number }>()
  const failedByBlock = new Map<number, { timestamp: number; failedGas: bigint; failedCount: number; gasUsed: bigint }>()

  for (const tx of txs) {
    const block = byBlock.get(tx.blockNumber)
    if (!block) continue
    const target = executionTarget(block.gasLimit)
    const above = block.gasUsed > target
    totals.gasUsed += tx.gasUsed
    totals.burnWei += tx.baseBurnWei
    totals.tipWei += tx.tipWei
    totals.executionFeeWei += tx.executionFeeWei
    totals.blobFeeWei += tx.blobFeeWei ?? 0n
    totals.txCount += 1
    if (tx.status === 0) totals.failedGas += tx.gasUsed

    const sender = senders.get(tx.from) ?? empty(tx.from)
    add(sender, tx, above, tx.category)
    senders.set(tx.from, sender)

    const contractKey = tx.to ?? `create:${tx.hash}`
    const contract = contracts.get(contractKey) ?? empty(contractKey)
    add(contract, tx, above, tx.category)
    contracts.set(contractKey, contract)

    const category = categories.get(tx.category) ?? empty(tx.category)
    add(category, tx, above, tx.category)
    categories.set(tx.category, category)

    const methodKey = tx.selector ?? 'none'
    const method = methods.get(methodKey) ?? empty(methodKey)
    add(method, tx, above, tx.category)
    if (!method.method && tx.method) method.method = tx.method
    methods.set(methodKey, method)

    if (block.gasUsed > 0n && tx.gasUsed * 100n >= block.gasUsed * 15n) heavy.push(tx)

    if (tx.selector) {
      const bkey = `${tx.from}|${tx.selector}`
      const burst = burstMap.get(bkey) ?? {
        from: tx.from,
        to: tx.to,
        selector: tx.selector,
        method: tx.method,
        count: 0,
        gasUsed: 0n,
        firstTs: tx.timestamp,
        lastTs: tx.timestamp,
      }
      burst.count += 1
      burst.gasUsed += tx.gasUsed
      if (tx.timestamp < burst.firstTs) burst.firstTs = tx.timestamp
      if (tx.timestamp > burst.lastTs) burst.lastTs = tx.timestamp
      if (!burst.method && tx.method) burst.method = tx.method
      burstMap.set(bkey, burst)
    }

    const fail = failedByBlock.get(tx.blockNumber) ?? { timestamp: tx.timestamp, failedGas: 0n, failedCount: 0, gasUsed: block.gasUsed }
    if (tx.status === 0) {
      fail.failedGas += tx.gasUsed
      fail.failedCount += 1
    }
    failedByBlock.set(tx.blockNumber, fail)
  }

  const senderRows = [...senders.values()]
    .map((row) => finish(row, null, 'Exclusive sum of receipt gasUsed on transaction sender (from). Each transaction is counted once.', null, 'OBSERVED ON-CHAIN', 'high'))
    .sort((a, b) => (a.gasUsed > b.gasUsed ? -1 : a.gasUsed < b.gasUsed ? 1 : 0))

  const contractRows = [...contracts.values()]
    .map((row) => finish(row, null, 'Exclusive sum of receipt gasUsed on the top-level callee (to), or on the creation itself. Internal calls are not split.', null, 'OBSERVED ON-CHAIN', 'high'))
    .sort((a, b) => (a.gasUsed > b.gasUsed ? -1 : 1))

  const categoryRows = [...categories.values()]
    .map((row) => {
      const unknown = row.key === 'unknown'
      return finish(
        row,
        row.key,
        unknown ? 'No curated address or signature match.' : 'Category assigned by the local classifier. Gas is still an exclusive partition.',
        null,
        unknown ? 'UNVERIFIED' : 'INFERRED',
        unknown ? 'none' : 'medium',
      )
    })
    .sort((a, b) => (a.gasUsed > b.gasUsed ? -1 : 1))

  const methodRows = [...methods.values()]
    .map((row) =>
      finish(
        row,
        row.method,
        row.key === 'none' ? 'No 4-byte selector.' : row.method ? 'Selector matched a local signature.' : 'Selector has no local signature.',
        row.method,
        row.method ? 'INFERRED' : 'UNVERIFIED',
        row.method ? 'medium' : 'none',
      ),
    )
    .sort((a, b) => (a.gasUsed > b.gasUsed ? -1 : 1))

  const bursts = [...burstMap.values()].filter((b) => b.count >= 8 && b.lastTs - b.firstTs <= 5 * 60)
  const failedBatches = [...failedByBlock.entries()]
    .filter(([, v]) => v.failedCount >= 5 && v.gasUsed > 0n && v.failedGas * 5n >= v.gasUsed)
    .map(([blockNumber, v]) => ({ blockNumber, ...v }))

  heavy.sort((a, b) => (a.gasUsed > b.gasUsed ? -1 : 1))

  return {
    rows: { sender: senderRows, contract: contractRows, category: categoryRows, method: methodRows },
    totals,
    heavy: heavy.slice(0, 15),
    bursts,
    failedBatches,
  }
}
