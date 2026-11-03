import { classifyCall, decomposeFees, parseScheduleOverride, blobBaseFeePerGas, type ChainBlock, type ChainTx } from '@gasscope/analytics'

type RpcTx = {
  hash: string
  from: string
  to: string | null
  value?: string
  gas?: string
  gasPrice?: string
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
  input?: string
  type?: string
  transactionIndex?: string
}

type RpcReceipt = {
  transactionHash: string
  gasUsed: string
  effectiveGasPrice?: string
  status?: string
  blobGasUsed?: string
  blobGasPrice?: string
}

export type RpcBlock = {
  number: string
  hash: string
  parentHash: string
  timestamp: string
  gasLimit: string
  gasUsed: string
  baseFeePerGas?: string
  blobGasUsed?: string
  excessBlobGas?: string
  miner?: string
  transactions: RpcTx[]
}

const schedule = parseScheduleOverride(process.env.BLOB_SCHEDULE_JSON) ?? undefined

function bi(value: string | undefined | null): bigint | null {
  if (!value) return null
  return BigInt(value)
}

function txType(value: string | undefined): number {
  if (!value) return 0
  const parsed = Number(BigInt(value))
  return Number.isFinite(parsed) ? parsed : 0
}

export function normalizeBlock(block: RpcBlock, receipts: RpcReceipt[]): { block: ChainBlock; txs: ChainTx[] } {
  if (!block.baseFeePerGas) {
    throw new Error(`Block ${block.number} has no baseFeePerGas. Pre-London blocks are outside this indexer.`)
  }
  const number = Number(BigInt(block.number))
  const timestamp = Number(BigInt(block.timestamp))
  const baseFee = BigInt(block.baseFeePerGas)
  const byHash = new Map(receipts.filter(Boolean).map((receipt) => [receipt.transactionHash.toLowerCase(), receipt]))
  const complete = block.transactions.every((tx) => byHash.has(tx.hash.toLowerCase()))
  const txs: ChainTx[] = []
  if (complete) {
    for (const tx of block.transactions) {
      const receipt = byHash.get(tx.hash.toLowerCase())
      if (!receipt) continue
      const gasUsed = BigInt(receipt.gasUsed)
      const effective = BigInt(receipt.effectiveGasPrice ?? tx.gasPrice ?? '0x0')
      const fees = decomposeFees({
        gasUsed,
        effectiveGasPrice: effective,
        baseFeePerGas: baseFee,
        blobGasUsed: bi(receipt.blobGasUsed),
        blobGasPrice: bi(receipt.blobGasPrice),
      })
      const type = txType(tx.type)
      const classified = classifyCall({ to: tx.to, input: tx.input ?? '0x', txType: type })
      txs.push({
        hash: tx.hash.toLowerCase(),
        blockNumber: number,
        txIndex: Number(BigInt(tx.transactionIndex ?? '0x0')),
        timestamp,
        from: tx.from.toLowerCase(),
        to: tx.to ? tx.to.toLowerCase() : null,
        valueWei: BigInt(tx.value ?? '0x0'),
        gasUsed,
        gasLimit: BigInt(tx.gas ?? '0x0'),
        effectiveGasPrice: effective,
        maxFeePerGas: bi(tx.maxFeePerGas),
        maxPriorityFeePerGas: bi(tx.maxPriorityFeePerGas),
        baseFeePerGas: baseFee,
        executionFeeWei: fees.executionFeeWei,
        baseBurnWei: fees.baseBurnWei,
        tipWei: fees.tipWei,
        blobGasUsed: bi(receipt.blobGasUsed),
        blobGasPrice: bi(receipt.blobGasPrice),
        blobFeeWei: bi(receipt.blobGasUsed) && bi(receipt.blobGasPrice) ? fees.blobFeeWei : null,
        txType: type,
        status: receipt.status === undefined || BigInt(receipt.status) === 1n ? 1 : 0,
        selector: classified.selector,
        method: classified.method,
        methodSource: classified.methodSource,
        category: classified.category,
        categoryConfidence: classified.confidence,
        categoryProvenance: classified.provenance,
        classification: classified.classification,
        synthetic: false,
        inputSize: Math.max(0, ((tx.input?.length ?? 2) - 2) / 2),
      })
    }
  }
  const excess = bi(block.excessBlobGas)
  return {
    block: {
      number,
      hash: block.hash.toLowerCase(),
      parentHash: block.parentHash.toLowerCase(),
      timestamp,
      gasLimit: BigInt(block.gasLimit),
      gasUsed: BigInt(block.gasUsed),
      baseFeePerGas: baseFee,
      blobGasUsed: bi(block.blobGasUsed),
      excessBlobGas: excess,
      blobBaseFee: excess === null ? null : blobBaseFeePerGas(excess, timestamp, schedule),
      txCount: block.transactions.length,
      receiptsComplete: complete,
      canonical: true,
      confirmation: 'head',
      synthetic: false,
      miner: block.miner?.toLowerCase() ?? null,
    },
    txs,
  }
}
