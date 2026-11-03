import type { EvidenceClass } from './constants'

export interface StatusDto {
  mode: 'demo' | 'live'
  synthetic: boolean
  runState: 'LIVE' | 'DELAYED' | 'RECONNECTING' | 'PAUSED' | 'DEMO'
  networkName: string
  chainId: number | null
  chainIdOk: boolean
  latestBlock: number | null
  latestBlockHash: string | null
  latestTimestamp: string | null
  indexedBlock: number | null
  indexedFrom: string | null
  indexedTo: string | null
  lagSeconds: number | null
  headDelayBlocks: number | null
  receiptCoverage15m: number | null
  confirmation: { safe: number | null; finalized: number | null }
  backfill: {
    targetBlocks: number
    completedBlocks: number
    inProgress: boolean
    note: string
  }
  provider: {
    httpConfigured: boolean
    wsConfigured: boolean
    fallbackConfigured: boolean
    websocket: 'up' | 'down' | 'unused'
    capabilities: {
      eth_getBlockReceipts: boolean | null
      eth_feeHistory: boolean | null
      trace: boolean | null
    }
    lastError: string | null
    requestCount: number
    errorCount: number
  }
  formulaVersion: string
  updatedAt: string
  warnings: string[]
}

export interface FeeEstimateDto {
  label: 'Standard' | 'Fast' | 'High'
  totalWei: string | null
  priorityWei: string | null
  estimate: true
}

export interface CurrentGasDto {
  asOf: string | null
  blockNumber: number | null
  synthetic: boolean
  baseFeeWei: string | null
  blobBaseFeeWei: string | null
  excessBlobGas: string | null
  blobGasUsed: string | null
  blobTarget: string | null
  blobSchedule: string | null
  utilizationTarget: number | null
  utilizationLimit: number | null
  gasUsed: string | null
  gasLimit: string | null
  gasTarget: string | null
  priority: { p10Wei: string | null; p50Wei: string | null; p90Wei: string | null; samples: number }
  estimates: FeeEstimateDto[]
  estimateMethodology: string
  simpleTransferWei: string | null
  deltas: {
    window: '5m' | '15m' | '1h'
    baseFeeDeltaWei: string | null
    baseFeePct: number | null
    zeroBaseline: boolean
    estimateDeltaWei: string | null
    estimateNote: string
  }[]
  illustration: null | {
    txHash: string
    synthetic: boolean
    burnWei: string
    tipWei: string
    blobFeeWei: string
    executionFeeWei: string
    valueWei: string
    gasUsed: string
    note: string
  }
  definitions: Record<string, string>
}

export interface ChartPointDto {
  t: string
  blockStart: number
  blockEnd: number
  baseFeeOpenWei: string
  baseFeeCloseWei: string
  baseFeeMinWei: string
  baseFeeMaxWei: string
  gasUsed: string
  gasTarget: string
  gasLimit: string
  utilTarget: string
  utilLimit: string
  blocksAbove: number
  blocksBelow: number
  blocksEqual: number
  txCount: number
  burnWei: string
  tipWei: string
  blobFeeWei: string
  blobBaseFeeCloseWei: string | null
  tipP50Wei: string | null
  tipP90Wei: string | null
  receiptCoverage: number
  parentDeltaWei: string | null
  direction: 'up' | 'down' | 'flat'
}

export interface ChartDto {
  from: string
  to: string
  resolution: 'block' | '1m' | '5m' | '15m' | '1h'
  synthetic: boolean
  partial: boolean
  coverage: number
  note: string
  points: ChartPointDto[]
  prior: ChartPointDto[] | null
}

export interface EvidenceDto {
  id: string
  classification: EvidenceClass
  confidence: 'high' | 'medium' | 'low' | 'none'
  method: string
  statement: string
  blockNumbers: number[]
  txHashes: string[]
  severity: 'info' | 'notable' | 'high'
}

export interface CauseDto {
  id: string
  rank: number
  title: string
  summary: string
  gasUsed: string
  gasShare: number | null
  txCount: number
  failedGas: string
  failedTxCount: number
  burnWei: string
  tipWei: string
  executionFeeWei: string
  kind: 'protocol' | 'sender' | 'contract' | 'category' | 'method' | 'unknown'
  classification: EvidenceClass
  confidence: 'high' | 'medium' | 'low' | 'none'
  method: string
  entity: string | null
  category: string | null
  aboveTargetGas: string
  links: { label: string; href: string | null; disabledReason?: string }[]
  proof: {
    hash: string
    blockNumber: number
    gasUsed: string
    selector: string | null
    method: string | null
    status: 'success' | 'reverted'
    synthetic: boolean
  }[]
  evidenceIds: string[]
}

export interface CriticalEventDto {
  id: string
  t: string
  blockNumber: number
  kind:
    | 'spike'
    | 'drop'
    | 'heavy-tx'
    | 'method-burst'
    | 'failed-batch'
    | 'target-cross'
    | 'new-wallet'
    | 'category-shift'
    | 'receipt-gap'
  title: string
  detail: string
  severity: 'info' | 'notable' | 'high'
  classification: EvidenceClass
  evidenceIds: string[]
}

export interface CompactCheckDto {
  parentBlock: number
  childBlock: number | null
  gasUsed: string
  target: string
  gasLimit: string
  parentBaseFeeWei: string
  predictedNextWei: string
  observedChildWei: string | null
  deltaWei: string
  direction: 'up' | 'down' | 'flat'
  match: boolean | null
}

export interface AnalysisDto {
  formulaVersion: string
  startUtc: string
  endUtc: string
  timezone: string
  synthetic: boolean
  partial: boolean
  ribbon: string
  verdict: string
  whatChanged: string[]
  coverage: {
    blocks: number
    receiptsCompleteBlocks: number
    receiptCoverage: number | null
    txCount: number
    indexedFrom: string | null
    indexedTo: string | null
    definitiveRankings: boolean
    notes: string[]
  }
  bounds: {
    firstBlock: number | null
    lastBlock: number | null
    firstTimestamp: string | null
    lastTimestamp: string | null
    startBaseFeeWei: string | null
    endBaseFeeWei: string | null
    absDeltaWei: string | null
    pctDelta: number | null
    zeroBaseline: boolean
    minBaseFeeWei: string | null
    maxBaseFeeWei: string | null
    maxIncreaseWei: string | null
    maxDecreaseWei: string | null
    blocksAboveTarget: number
    blocksBelowTarget: number
    blocksAtTarget: number
    targetWeightedOccupancy: number | null
    limitOccupancy: number | null
    burnWei: string
    tipWei: string
    blobFeeWei: string
    failedGas: string
    failedGasShare: number | null
    txCount: number
    baseFeeStdevGwei: number | null
    secondsAboveStartFee: number
  }
  compare: null | {
    startUtc: string
    endUtc: string
    baseFeePct: number | null
    occupancyDelta: number | null
    txCountDelta: number
    burnWeiDelta: string
    categoryDeltas: { category: string; label: string; shareDelta: number | null; gasDelta: string }[]
    estimatorNote: string
  }
  protocol: {
    summary: string
    above: number
    below: number
    equal: number
    mismatchCount: number
    checksTruncated: boolean
    checks: CompactCheckDto[]
  }
  evidence: EvidenceDto[]
  causes: CauseDto[]
  events: CriticalEventDto[]
  unknownGasShare: number | null
  rankingsNote: string
}

export interface DriverRowDto {
  rank: number
  key: string
  label: string
  category: string | null
  categoryLabel: string
  gasUsed: string
  gasShare: number | null
  txCount: number
  failedGas: string
  failedTxCount: number
  avgGas: string
  executionFeeWei: string
  burnWei: string
  tipWei: string
  blobFeeWei: string
  firstTimestamp: string | null
  lastTimestamp: string | null
  trendGasDelta: string | null
  trendShareDelta: number | null
  classification: EvidenceClass
  methodNote: string
  links: { label: string; href: string | null; disabledReason?: string }[]
  synthetic: boolean
}

export interface DriversDto {
  groupBy: 'sender' | 'contract' | 'category' | 'method'
  sort: 'gasUsed' | 'fees' | 'txCount' | 'tip'
  from: string
  to: string
  synthetic: boolean
  definitive: boolean
  note: string
  rows: DriverRowDto[]
  nextCursor: string | null
}

export interface TxDetailDto {
  hash: string
  blockNumber: number
  txIndex: number
  timestamp: string
  from: string
  to: string | null
  synthetic: boolean
  txType: number
  status: 'success' | 'reverted'
  valueWei: string
  gasUsed: string
  gasLimit: string
  effectiveGasPriceWei: string
  maxFeePerGasWei: string | null
  maxPriorityFeePerGasWei: string | null
  baseFeePerGasWei: string
  executionFeeWei: string
  baseBurnWei: string
  tipWei: string
  blobGasUsed: string | null
  blobGasPriceWei: string | null
  blobFeeWei: string | null
  selector: string | null
  method: string | null
  methodSource: string | null
  category: string
  categoryLabel: string
  classification: EvidenceClass
  confidence: 'high' | 'medium' | 'low' | 'none'
  provenance: string
  shareOfBlockGas: number | null
  links: { label: string; href: string | null; disabledReason?: string }[]
  note: string
}

export interface BlockDetailDto {
  synthetic: boolean
  number: number
  hash: string
  parentHash: string
  timestamp: string
  gasUsed: string
  gasLimit: string
  gasTarget: string
  baseFeeWei: string
  blobGasUsed: string | null
  excessBlobGas: string | null
  blobBaseFeeWei: string | null
  blobTarget: string | null
  txCount: number
  receiptsComplete: boolean
  confirmation: string
  miner: string | null
  parentMath: null | {
    parentNumber: number
    parentHash: string
    parentGasUsed: string
    parentTarget: string
    parentBaseFeeWei: string
    predictedWei: string
    observedWei: string
    deltaWei: string
    direction: 'up' | 'down' | 'flat'
    match: boolean
    formula: string
  }
  nextMath: null | {
    childNumber: number | null
    predictedWei: string
    observedWei: string | null
    match: boolean | null
    deltaWei: string
    direction: 'up' | 'down' | 'flat'
  }
  totals: { burnWei: string; tipWei: string; blobFeeWei: string; failedGas: string }
  topSenders: { address: string; gasUsed: string; share: number | null; txCount: number }[]
  topContracts: { address: string; gasUsed: string; share: number | null; txCount: number }[]
  transactions: TxDetailDto[]
  links: { label: string; href: string | null; disabledReason?: string }[]
}

export interface SensitivityDto {
  classification: 'MODELLED'
  banner: string
  assumptions: string[]
  from: string
  to: string
  synthetic: boolean
  scope: 'transaction' | 'sender-interval'
  observedEndBaseFeeWei: string | null
  modelledEndBaseFeeWei: string | null
  flippedAnyBlock: boolean
  flippedCount: number
  stepsTruncated: boolean
  blocks: {
    number: number
    observedBaseFeeWei: string
    modelledBaseFeeWei: string
    observedGasUsed: string
    modelledGasUsed: string
    target: string
    observedNextWei: string
    modelledNextWei: string
    flippedAcrossTarget: boolean
    removedGas: string
  }[]
  note: string
}

export interface AlertRuleDto {
  id: string
  name: string
  kind: string
  config: Record<string, unknown>
  enabled: boolean
  cooldownSec: number
  createdAt: string
}

export interface AlertFiringDto {
  id: string
  ruleId: string
  dedupeKey: string
  firedAt: string
  resolvedAt: string | null
  payload: Record<string, unknown>
  delivery: Record<string, unknown>
}

export interface MethodologyDto {
  formulaVersion: string
  sections: { id: string; title: string; body: string[] }[]
  blobSchedule: { name: string; timeUtc: string; targetBlobs: number; maxBlobs: number; updateFraction: string }[]
  registryNote: string
}

export interface AddressDto {
  address: string
  label: string | null
  synthetic: boolean
  from: string
  to: string
  gasUsed: string
  gasShare: number | null
  txCount: number
  failedGas: string
  burnWei: string
  tipWei: string
  executionFeeWei: string
  categories: { category: string; label: string; gasUsed: string; share: number | null; classification: EvidenceClass }[]
  transactions: TxDetailDto[]
  note: string
  links: { label: string; href: string | null; disabledReason?: string }[]
}
