import type { ChainBlock, ChainTx } from '@gasscope/analytics'
import type { AlertFiringDto, AlertRuleDto, StatusDto } from '@gasscope/shared'

export interface HeadEvent {
  blockNumber: number
  timestamp: number
  baseFeeWei: string
  synthetic: boolean
}

export interface FeeTotals {
  gasUsed: string
  burnWei: string
  tipWei: string
  blobFeeWei: string
  failedGas: string
  txCount: number
}

export interface GroupedDriver {
  key: string
  gasUsed: string
  txCount: number
  failedGas: string
  failedTxCount: number
  burnWei: string
  tipWei: string
  executionFeeWei: string
  blobFeeWei: string
  firstTs: number
  lastTs: number
  category: string | null
  method: string | null
  aboveTargetGas: string
}

export interface GasData {
  getStatus(): Promise<StatusDto>
  blocksBetween(fromSec: number, toSec: number): Promise<ChainBlock[]>
  txsBetween(fromSec: number, toSec: number): Promise<ChainTx[]>
  countTxs(fromSec: number, toSec: number): Promise<number>
  blockByNumber(number: number): Promise<ChainBlock | null>
  txsInBlock(number: number): Promise<ChainTx[]>
  txByHash(hash: string): Promise<ChainTx | null>
  txsByAddress(address: string, fromSec: number, toSec: number): Promise<ChainTx[]>
  recent(limitBlocks: number): Promise<{ blocks: ChainBlock[]; txs: ChainTx[] }>
  feeTotals(fromSec: number, toSec: number): Promise<FeeTotals>
  groupedDrivers(fromSec: number, toSec: number, groupBy: 'sender' | 'contract' | 'category' | 'method', limit: number): Promise<GroupedDriver[]>
  alerts(): Promise<AlertRuleDto[]>
  saveAlert(alert: AlertRuleDto): Promise<void>
  deleteAlert(id: string): Promise<boolean>
  firings(): Promise<AlertFiringDto[]>
  addFiring(firing: AlertFiringDto): Promise<void>
  subscribe(listener: (event: HeadEvent) => void): () => void
  requestBackfill(fromSec: number, toSec: number): Promise<{ accepted: boolean; message: string }>
}
