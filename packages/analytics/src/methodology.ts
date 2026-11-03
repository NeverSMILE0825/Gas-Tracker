import { FORMULA_VERSION, type MethodologyDto } from '@gasscope/shared'
import { DEFAULT_BLOB_SCHEDULE } from './blobfee'
import { ADDRESS_BOOK } from './classify'

export function methodologyDocument(): MethodologyDto {
  return {
    formulaVersion: FORMULA_VERSION,
    blobSchedule: DEFAULT_BLOB_SCHEDULE.map((row) => ({
      name: row.name,
      timeUtc: new Date(row.time * 1000).toISOString(),
      targetBlobs: row.target,
      maxBlobs: row.max,
      updateFraction: row.fraction.toString(),
    })),
    registryNote: `The curated address book has ${ADDRESS_BOOK.length} mainnet entries. A match is a local registry hit, not an on-chain proof of who operates the contract or why a transaction was sent.`,
    sections: [
      {
        id: 'labels',
        title: 'How claims are labelled',
        body: [
          'PROTOCOL-EXACT means the EIP-1559 integer update, or a direct comparison of gas used with that block’s target (gas limit / 2).',
          'OBSERVED ON-CHAIN means a value taken from a canonical header, transaction, or receipt: gas used, effective gas price, status, sender, top-level callee, empty calldata, or transaction type.',
          'INFERRED means a category or method label from the curated address book or from a 4-byte selector derived from a known signature. A single selector is not treated as proof of an application, and collisions are disclosed.',
          'UNVERIFIED / UNKNOWN means the classifier has no supporting match, receipts are missing, or a base-fee step does not match the formula.',
          'MODELLED means a static counterfactual that deletes observed gas and replays the base fee. It is not what the block builder would have done.',
        ],
      },
      {
        id: 'base-fee',
        title: 'Execution base fee',
        body: [
          'The base fee of a block is fixed by its parent. Gas used in a block changes the next block’s base fee, not its own.',
          'Target = gasLimit / 2 using integer division. If gas used equals the target, the next base fee is unchanged. If it is higher, delta = max(1, parentBaseFee * excess / target / 8). If it is lower, delta = parentBaseFee * deficit / target / 8 with no 1-wei floor.',
          'A window’s start-to-end base-fee change is explained with the parent blocks inside the window (every block except the last). The last block is reported because it sets the following base fee.',
          'Calculated child fees are compared with the observed child base fee. Mismatches are shown; they are not smoothed over.',
          'Gas used comes from receipts. The transaction gas limit and maxFeePerGas are caps, not the amount paid. Reverted transactions still consume gas.',
        ],
      },
      {
        id: 'fees',
        title: 'Burn, tip, and blob fee',
        body: [
          'Execution fee = receipt.gasUsed * receipt.effectiveGasPrice. Base-fee burn = receipt.gasUsed * block.baseFeePerGas. Priority tip = execution fee − burn, floored at zero if a receipt is inconsistent.',
          'Blob fee = receipt.blobGasUsed * receipt.blobGasPrice when those fields exist. Blob gas is not added to execution gas used and is not burned twice.',
          'Standard / Fast / High prices are estimates: latest base fee plus nearest-rank priority percentiles p50 / p75 / p90. If an estimate moves while the base fee does not, the decomposition says so.',
          'No ETH/USD figure is shown unless a timestamped price source is configured. None is configured in this build.',
        ],
      },
      {
        id: 'blobs',
        title: 'Blob fee schedule',
        body: [
          'Blob base fee uses EIP-4844 fake_exponential(1, excessBlobGas, updateFraction).',
          'From the Osaka timestamp onward, EIP-7918 can stop the excess-blob update from subtracting the target when the blob fee is below the execution-cost reserve (BLOB_BASE_COST = 8192).',
          'The bundled schedule ends at BPO2 (14 target / 21 max blobs, update fraction 11,684,671, activated 2026-01-07). Execution specs reviewed for this build still list mainnet BPO3 as unscheduled. Set BLOB_SCHEDULE_JSON if a later fork is active. The active schedule name is shown next to the blob fee.',
        ],
      },
      {
        id: 'attribution',
        title: 'Who used the gas',
        body: [
          'Each transaction’s execution gas is added once to its sender, once in a separate callee table, once in a category table, and once in a method table. Those tables are not additive with each other.',
          'Without a trace, internal calls are not given a share of gas. Traces are off unless TRACE_ENABLED and the provider actually supports them.',
          'Rankings are marked non-definitive below 98% receipt coverage or when the canonical parent links have a gap.',
          'Demo mode uses synthetic addresses and synthetic hashes. Those rows are labelled synthetic and do not link to Etherscan.',
        ],
      },
      {
        id: 'windows',
        title: 'Time windows',
        body: [
          'Intervals are half-open [start, end) on block timestamps, stored and compared in UTC. The default display zone is America/New_York.',
          'A preset such as 15m is the last 15 minutes on the server clock when live mode is on. Pinning a range freezes the absolute timestamps.',
          'The comparison baseline is the immediately previous interval of equal length.',
          'Per-block charts are limited to 3 hours. Longer ranges use 1m, 5m, or 1h buckets. Seven-day requests need indexed history; missing time is reported instead of being filled in.',
        ],
      },
    ],
  }
}
