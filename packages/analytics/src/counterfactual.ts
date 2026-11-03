import { nextBaseFee } from './basefee'
import type { ChainBlock } from './domain'

export interface FixedBlockCounterfactual {
  observedGasUsed: bigint
  modelledGasUsed: bigint
  target: bigint
  observedNext: bigint
  modelledNext: bigint
  flippedBelowTarget: boolean
  landedOnTarget: boolean
}

/** Static removal of gas inside one block. Other included gas stays fixed. Not a proof of what miners would have included. */
export function counterfactualBlock(
  block: { gasUsed: bigint; gasLimit: bigint; baseFeePerGas: bigint },
  removeGas: bigint,
): FixedBlockCounterfactual {
  if (removeGas < 0n || removeGas > block.gasUsed) {
    throw new Error('Removed gas must be between 0 and the block gas used')
  }
  const modelledGasUsed = block.gasUsed - removeGas
  const observed = nextBaseFee(block)
  const modelled = nextBaseFee({ ...block, gasUsed: modelledGasUsed })
  return {
    observedGasUsed: block.gasUsed,
    modelledGasUsed,
    target: observed.target,
    observedNext: observed.next,
    modelledNext: modelled.next,
    flippedBelowTarget: block.gasUsed > observed.target && modelledGasUsed < observed.target,
    landedOnTarget: block.gasUsed > observed.target && modelledGasUsed === observed.target,
  }
}

export interface ReplayStep {
  number: number
  observedBaseFeeWei: bigint
  modelledBaseFeeWei: bigint
  observedGasUsed: bigint
  modelledGasUsed: bigint
  target: bigint
  observedNextWei: bigint
  modelledNextWei: bigint
  flippedBelowTarget: boolean
  removedGas: bigint
}

/**
 * Replay base fees from the first block, removing gas per block and holding remaining gas fixed.
 * The first block’s base fee is unchanged because its parent sits outside the edit.
 */
export function replayBaseFee(blocks: ChainBlock[], removedByBlock: Map<number, bigint>): ReplayStep[] {
  const ordered = [...blocks].sort((a, b) => a.number - b.number)
  const steps: ReplayStep[] = []
  if (ordered.length === 0) return steps
  let modelledBase = ordered[0]!.baseFeePerGas
  for (let i = 0; i < ordered.length; i++) {
    const block = ordered[i]!
    const removed = removedByBlock.get(block.number) ?? 0n
    if (removed < 0n || removed > block.gasUsed) throw new Error(`Removal for block ${block.number} is out of range`)
    const modelledGas = block.gasUsed - removed
    const observedNext = nextBaseFee(block)
    const modelledNext = nextBaseFee({
      baseFeePerGas: modelledBase,
      gasUsed: modelledGas,
      gasLimit: block.gasLimit,
    })
    steps.push({
      number: block.number,
      observedBaseFeeWei: block.baseFeePerGas,
      modelledBaseFeeWei: modelledBase,
      observedGasUsed: block.gasUsed,
      modelledGasUsed: modelledGas,
      target: observedNext.target,
      observedNextWei: observedNext.next,
      modelledNextWei: modelledNext.next,
      flippedBelowTarget: block.gasUsed > observedNext.target && modelledGas < observedNext.target,
      removedGas: removed,
    })
    modelledBase = modelledNext.next
  }
  return steps
}
