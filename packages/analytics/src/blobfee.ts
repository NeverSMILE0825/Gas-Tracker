export const GAS_PER_BLOB = 131_072n
export const BLOB_BASE_COST = 8_192n
export const MIN_BLOB_BASE_FEE = 1n
/** Fusaka / Osaka mainnet timestamp. EIP-7918 applies from this block onward. */
export const OSAKA_TIMESTAMP = 1_764_798_551

export interface BlobScheduleEntry {
  name: string
  /** Unix seconds, inclusive. */
  time: number
  target: number
  max: number
  fraction: bigint
}

/**
 * Mainnet blob schedule bundled 2026-11-02.
 * Cancun epoch 269568, Prague/Pectra epoch 364032, Osaka slot 13,164,544,
 * BPO1 and BPO2 per the Ethereum Foundation Fusaka announcement and EIP-8135.
 * Execution-specs still list BPO3 mainnet as unscheduled. Override with BLOB_SCHEDULE_JSON.
 */
export const DEFAULT_BLOB_SCHEDULE: BlobScheduleEntry[] = [
  { name: 'cancun', time: 1_710_338_135, target: 3, max: 6, fraction: 3_338_477n },
  { name: 'prague', time: 1_746_612_311, target: 6, max: 9, fraction: 5_007_716n },
  { name: 'osaka', time: OSAKA_TIMESTAMP, target: 6, max: 9, fraction: 5_007_716n },
  { name: 'bpo1', time: 1_765_290_071, target: 10, max: 15, fraction: 8_346_193n },
  { name: 'bpo2', time: 1_767_747_671, target: 14, max: 21, fraction: 11_684_671n },
]

export function parseScheduleOverride(raw: string | undefined): BlobScheduleEntry[] | null {
  if (!raw) return null
  const parsed = JSON.parse(raw) as {
    name: string
    time: number
    target: number
    max: number
    fraction: number | string
  }[]
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('BLOB_SCHEDULE_JSON must be a non-empty array')
  return parsed
    .map((row) => ({
      name: String(row.name),
      time: Number(row.time),
      target: Number(row.target),
      max: Number(row.max),
      fraction: BigInt(row.fraction),
    }))
    .sort((a, b) => a.time - b.time)
}

export function scheduleAt(timestamp: number, schedule = DEFAULT_BLOB_SCHEDULE): BlobScheduleEntry | null {
  let current: BlobScheduleEntry | null = null
  for (const entry of schedule) {
    if (timestamp >= entry.time) current = entry
  }
  return current
}

/** EIP-4844 integer approximation of factor * e^(numerator/denominator). */
export function fakeExponential(factor: bigint, numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('blob base-fee denominator must be positive')
  if (numerator < 0n || factor < 0n) throw new Error('blob base-fee inputs must be non-negative')
  let i = 1n
  let output = 0n
  let accum = factor * denominator
  while (accum > 0n) {
    output += accum
    accum = (accum * numerator) / (denominator * i)
    i += 1n
    if (i > 512n) break
  }
  return output / denominator
}

export function blobBaseFeePerGas(excessBlobGas: bigint, timestamp: number, schedule = DEFAULT_BLOB_SCHEDULE): bigint | null {
  const spec = scheduleAt(timestamp, schedule)
  if (!spec || excessBlobGas < 0n) return null
  return fakeExponential(MIN_BLOB_BASE_FEE, excessBlobGas, spec.fraction)
}

export function targetBlobGas(timestamp: number, schedule = DEFAULT_BLOB_SCHEDULE): bigint | null {
  const spec = scheduleAt(timestamp, schedule)
  if (!spec) return null
  return GAS_PER_BLOB * BigInt(spec.target)
}

/**
 * Excess blob gas for the child block.
 * From Osaka onward the EIP-7918 reserve can skip subtracting the target.
 * The reserve comparison uses the child schedule's update fraction, as specified for the producing block.
 */
export function nextExcessBlobGas(
  parent: { excessBlobGas: bigint; blobGasUsed: bigint; baseFeePerGas: bigint; timestamp: number },
  childTimestamp: number,
  schedule = DEFAULT_BLOB_SCHEDULE,
): bigint | null {
  const spec = scheduleAt(childTimestamp, schedule)
  if (!spec) return null
  const target = GAS_PER_BLOB * BigInt(spec.target)
  if (parent.excessBlobGas + parent.blobGasUsed < target) return 0n
  if (childTimestamp >= OSAKA_TIMESTAMP) {
    const parentBlobBase = fakeExponential(MIN_BLOB_BASE_FEE, parent.excessBlobGas, spec.fraction)
    if (BLOB_BASE_COST * parent.baseFeePerGas > GAS_PER_BLOB * parentBlobBase) {
      return parent.excessBlobGas + (parent.blobGasUsed * BigInt(spec.max - spec.target)) / BigInt(spec.max)
    }
  }
  return parent.excessBlobGas + parent.blobGasUsed - target
}
