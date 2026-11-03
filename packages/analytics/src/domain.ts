import type { EvidenceClass } from '@gasscope/shared'

export interface ChainBlock {
  number: number
  hash: string
  parentHash: string
  timestamp: number
  gasLimit: bigint
  gasUsed: bigint
  baseFeePerGas: bigint
  blobGasUsed: bigint | null
  excessBlobGas: bigint | null
  blobBaseFee: bigint | null
  txCount: number
  receiptsComplete: boolean
  canonical: boolean
  confirmation: 'head' | 'safe' | 'finalized'
  synthetic: boolean
  miner: string | null
}

export interface ChainTx {
  hash: string
  blockNumber: number
  txIndex: number
  timestamp: number
  from: string
  to: string | null
  valueWei: bigint
  gasUsed: bigint
  gasLimit: bigint
  effectiveGasPrice: bigint
  maxFeePerGas: bigint | null
  maxPriorityFeePerGas: bigint | null
  baseFeePerGas: bigint
  executionFeeWei: bigint
  baseBurnWei: bigint
  tipWei: bigint
  blobGasUsed: bigint | null
  blobGasPrice: bigint | null
  blobFeeWei: bigint | null
  txType: number
  status: 0 | 1
  selector: string | null
  method: string | null
  methodSource: string | null
  category: string
  categoryConfidence: 'high' | 'medium' | 'low' | 'none'
  categoryProvenance: string
  classification: EvidenceClass
  synthetic: boolean
  inputSize: number
}

export interface AggRow {
  key: string
  label: string | null
  category: string | null
  confidence: 'high' | 'medium' | 'low' | 'none'
  classification: EvidenceClass
  provenance: string
  method: string | null
  gasUsed: bigint
  txCount: number
  failedGas: bigint
  failedTxCount: number
  burnWei: bigint
  tipWei: bigint
  executionFeeWei: bigint
  blobFeeWei: bigint
  firstTs: number
  lastTs: number
  aboveTargetGas: bigint
  sampleTxs: ChainTx[]
}

export interface Totals {
  gasUsed: bigint
  burnWei: bigint
  tipWei: bigint
  executionFeeWei: bigint
  blobFeeWei: bigint
  failedGas: bigint
  txCount: number
}

export interface Rollup {
  rows: {
    sender: AggRow[]
    contract: AggRow[]
    category: AggRow[]
    method: AggRow[]
  }
  totals: Totals
  heavy: ChainTx[]
  bursts: {
    from: string
    to: string | null
    selector: string
    method: string | null
    count: number
    gasUsed: bigint
    firstTs: number
    lastTs: number
  }[]
  failedBatches: { blockNumber: number; timestamp: number; failedGas: bigint; failedCount: number; gasUsed: bigint }[]
}
