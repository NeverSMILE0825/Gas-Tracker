export interface BaseFeeInput {
  baseFeePerGas: bigint
  gasUsed: bigint
  gasLimit: bigint
}

export interface BaseFeeStep {
  target: bigint
  delta: bigint
  next: bigint
  direction: 'up' | 'down' | 'flat'
  formula: string
}

/** EIP-1559 target. Post-London elasticity is 2, so target = gasLimit // 2. */
export function executionTarget(gasLimit: bigint): bigint {
  if (gasLimit < 0n) throw new Error('gasLimit must be non-negative')
  return gasLimit / 2n
}

/**
 * Integer EIP-1559 parent → child base fee.
 * Upward steps use a 1 wei minimum. Downward steps do not.
 * https://eips.ethereum.org/EIPS/eip-1559
 */
export function nextBaseFee(parent: BaseFeeInput): BaseFeeStep {
  const target = executionTarget(parent.gasLimit)
  const base = parent.baseFeePerGas
  if (base < 0n || parent.gasUsed < 0n) throw new Error('base fee and gas used must be non-negative')
  if (target === 0n) {
    return {
      target,
      delta: 0n,
      next: base,
      direction: 'flat',
      formula: 'gas target is 0; base fee was left unchanged',
    }
  }
  if (parent.gasUsed === target) {
    return {
      target,
      delta: 0n,
      next: base,
      direction: 'flat',
      formula: 'gasUsed == target, so the next base fee equals the parent base fee',
    }
  }
  if (parent.gasUsed > target) {
    const excess = parent.gasUsed - target
    let delta = (base * excess) / target / 8n
    if (delta < 1n) delta = 1n
    return {
      target,
      delta,
      next: base + delta,
      direction: 'up',
      formula: 'delta = max(1, parentBaseFee * (gasUsed - target) / target / 8); next = parent + delta',
    }
  }
  const deficit = target - parent.gasUsed
  const delta = (base * deficit) / target / 8n
  const next = base > delta ? base - delta : 0n
  return {
    target,
    delta,
    next,
    direction: next === base ? 'flat' : 'down',
    formula: 'delta = parentBaseFee * (target - gasUsed) / target / 8; next = parent - delta',
  }
}
