export interface FeeParts {
  executionFeeWei: bigint
  baseBurnWei: bigint
  tipWei: bigint
  blobFeeWei: bigint
  priorityPerGas: bigint
  tipClamped: boolean
}

/**
 * Execution fee uses receipt gasUsed and effectiveGasPrice.
 * Blob fee is separate and is not added into execution gas.
 */
export function decomposeFees(input: {
  gasUsed: bigint
  effectiveGasPrice: bigint
  baseFeePerGas: bigint
  blobGasUsed?: bigint | null
  blobGasPrice?: bigint | null
}): FeeParts {
  if (input.gasUsed < 0n) throw new Error('gasUsed must be non-negative')
  const executionFeeWei = input.gasUsed * input.effectiveGasPrice
  const baseBurnWei = input.gasUsed * input.baseFeePerGas
  const rawTip = executionFeeWei - baseBurnWei
  const tipClamped = rawTip < 0n
  const tipWei = tipClamped ? 0n : rawTip
  const blobFeeWei = (input.blobGasUsed ?? 0n) * (input.blobGasPrice ?? 0n)
  const priorityPerGas = input.gasUsed > 0n ? tipWei / input.gasUsed : 0n
  return { executionFeeWei, baseBurnWei, tipWei, blobFeeWei, priorityPerGas, tipClamped }
}

export function percentileNearest(sortedAsc: bigint[], p: number): bigint | null {
  if (sortedAsc.length === 0) return null
  if (p <= 0) return sortedAsc[0] ?? null
  if (p >= 1) return sortedAsc[sortedAsc.length - 1] ?? null
  const rank = Math.min(sortedAsc.length, Math.max(1, Math.ceil(p * sortedAsc.length)))
  return sortedAsc[rank - 1] ?? null
}

export const ESTIMATE_METHODOLOGY =
  'Standard, Fast, and High are estimates: the latest execution base fee plus the nearest-rank 50th, 75th, and 90th percentile of priority fee per gas on successful transactions in the sampled recent blocks. They are not quotes, not the base fee, and not blob fees. A simple transfer illustration multiplies the Standard estimate by 21,000 gas and can understate real transfers.'
