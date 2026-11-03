import type { EvidenceClass } from '@gasscope/shared'
import type { ChainBlock, ChainTx } from '@gasscope/analytics'
import type { blocks, transactions } from './schema'

type BlockRow = typeof blocks.$inferSelect
type TxRow = typeof transactions.$inferSelect

function opt(value: bigint | null): string | null {
  return value === null ? null : value.toString()
}

function req(value: string | null | undefined): bigint | null {
  if (value === null || value === undefined) return null
  return BigInt(value)
}

export function blockToRow(block: ChainBlock): typeof blocks.$inferInsert {
  return {
    number: block.number,
    hash: block.hash,
    parentHash: block.parentHash,
    timestamp: block.timestamp,
    gasLimit: block.gasLimit.toString(),
    gasUsed: block.gasUsed.toString(),
    baseFeePerGas: block.baseFeePerGas.toString(),
    blobGasUsed: opt(block.blobGasUsed),
    excessBlobGas: opt(block.excessBlobGas),
    blobBaseFee: opt(block.blobBaseFee),
    txCount: block.txCount,
    receiptsComplete: block.receiptsComplete,
    canonical: block.canonical,
    confirmation: block.confirmation,
    synthetic: block.synthetic,
    miner: block.miner,
  }
}

export function rowToBlock(row: BlockRow): ChainBlock {
  return {
    number: row.number,
    hash: row.hash,
    parentHash: row.parentHash,
    timestamp: row.timestamp,
    gasLimit: BigInt(row.gasLimit),
    gasUsed: BigInt(row.gasUsed),
    baseFeePerGas: BigInt(row.baseFeePerGas),
    blobGasUsed: req(row.blobGasUsed),
    excessBlobGas: req(row.excessBlobGas),
    blobBaseFee: req(row.blobBaseFee),
    txCount: row.txCount,
    receiptsComplete: row.receiptsComplete,
    canonical: row.canonical,
    confirmation: row.confirmation === 'safe' || row.confirmation === 'finalized' ? row.confirmation : 'head',
    synthetic: row.synthetic,
    miner: row.miner,
  }
}

export function txToRow(tx: ChainTx): typeof transactions.$inferInsert {
  return {
    hash: tx.hash,
    blockNumber: tx.blockNumber,
    txIndex: tx.txIndex,
    timestamp: tx.timestamp,
    fromAddress: tx.from,
    toAddress: tx.to,
    valueWei: tx.valueWei.toString(),
    gasLimit: tx.gasLimit.toString(),
    gasUsed: tx.gasUsed.toString(),
    effectiveGasPrice: tx.effectiveGasPrice.toString(),
    maxFeePerGas: opt(tx.maxFeePerGas),
    maxPriorityFeePerGas: opt(tx.maxPriorityFeePerGas),
    baseFeePerGas: tx.baseFeePerGas.toString(),
    executionFeeWei: tx.executionFeeWei.toString(),
    baseBurnWei: tx.baseBurnWei.toString(),
    tipWei: tx.tipWei.toString(),
    blobGasUsed: opt(tx.blobGasUsed),
    blobGasPrice: opt(tx.blobGasPrice),
    blobFeeWei: opt(tx.blobFeeWei),
    txType: tx.txType,
    status: tx.status,
    selector: tx.selector,
    methodSignature: tx.method,
    methodSource: tx.methodSource,
    category: tx.category,
    categoryConfidence: tx.categoryConfidence,
    categoryProvenance: tx.categoryProvenance,
    classification: tx.classification,
    synthetic: tx.synthetic,
    inputSize: tx.inputSize,
  }
}

export function rowToTx(row: TxRow): ChainTx {
  const confidence = row.categoryConfidence
  const safeConfidence = confidence === 'high' || confidence === 'medium' || confidence === 'low' || confidence === 'none' ? confidence : 'none'
  return {
    hash: row.hash,
    blockNumber: row.blockNumber,
    txIndex: row.txIndex,
    timestamp: row.timestamp,
    from: row.fromAddress,
    to: row.toAddress,
    valueWei: BigInt(row.valueWei),
    gasUsed: BigInt(row.gasUsed),
    gasLimit: BigInt(row.gasLimit),
    effectiveGasPrice: BigInt(row.effectiveGasPrice),
    maxFeePerGas: req(row.maxFeePerGas),
    maxPriorityFeePerGas: req(row.maxPriorityFeePerGas),
    baseFeePerGas: BigInt(row.baseFeePerGas),
    executionFeeWei: BigInt(row.executionFeeWei),
    baseBurnWei: BigInt(row.baseBurnWei),
    tipWei: BigInt(row.tipWei),
    blobGasUsed: req(row.blobGasUsed),
    blobGasPrice: req(row.blobGasPrice),
    blobFeeWei: req(row.blobFeeWei),
    txType: row.txType,
    status: row.status === 1 ? 1 : 0,
    selector: row.selector,
    method: row.methodSignature,
    methodSource: row.methodSource,
    category: row.category,
    categoryConfidence: safeConfidence,
    categoryProvenance: row.categoryProvenance,
    classification: row.classification as EvidenceClass,
    synthetic: row.synthetic,
    inputSize: row.inputSize,
  }
}
