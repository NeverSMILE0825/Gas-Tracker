import { formatShare } from '@gasscope/shared'
import { executionTarget, nextBaseFee } from './basefee'
import { counterfactualBlock } from './counterfactual'

/** Historical regression inputs from the build brief. Not live data. Re-check against a mainnet RPC before relying on them. */
export const FIXTURE_26330059 = {
  blockNumber: 26330059,
  gasUsed: 32_928_976n,
  gasLimit: 60_000_000n,
  baseFeePerGas: 48_571_925n,
  txHash: '0xa45a0cfe5f4be90bb22d9d772cee7e3ceda55853c859b502529e713e0a412ecb',
  from: '0x062f05cd6c835677b05a8658a351969476861316',
  to: '0xf3e54a1fda3d4351c8bd5065678c0f5ddd0d7bcb',
  selector: '0x6ceef480',
  txGas: 9_480_430n,
  source:
    'Figures are a stored regression fixture (block 26330059 and one transaction). They are not refreshed automatically. A second wallet was described in the source brief as sending repeated Seaport cancel transactions; those hashes were not included, so they are not shown as evidence.',
} as const

export interface FixtureReport {
  synthetic: false
  fixture: true
  disclaimer: string
  blockNumber: number
  gasUsed: string
  gasLimit: string
  gasTarget: string
  baseFeeWei: string
  txHash: string
  from: string
  to: string
  selector: string
  method: string
  txGas: string
  shareOfBlock: string
  observedNextBaseFeeWei: string
  modelledGasUsed: string
  modelledNextBaseFeeWei: string
  flippedBelowTarget: boolean
  formula: string
  links: { label: string; href: string }[]
  notIncluded: string
}

export function fixtureReport(): FixtureReport {
  const fx = FIXTURE_26330059
  const step = nextBaseFee({ baseFeePerGas: fx.baseFeePerGas, gasUsed: fx.gasUsed, gasLimit: fx.gasLimit })
  const model = counterfactualBlock(
    { baseFeePerGas: fx.baseFeePerGas, gasUsed: fx.gasUsed, gasLimit: fx.gasLimit },
    fx.txGas,
  )
  return {
    synthetic: false,
    fixture: true,
    disclaimer: fx.source,
    blockNumber: fx.blockNumber,
    gasUsed: fx.gasUsed.toString(),
    gasLimit: fx.gasLimit.toString(),
    gasTarget: executionTarget(fx.gasLimit).toString(),
    baseFeeWei: fx.baseFeePerGas.toString(),
    txHash: fx.txHash,
    from: fx.from,
    to: fx.to,
    selector: fx.selector,
    method: `Unidentified method ${fx.selector}`,
    txGas: fx.txGas.toString(),
    shareOfBlock: formatShare(fx.txGas, fx.gasUsed),
    observedNextBaseFeeWei: step.next.toString(),
    modelledGasUsed: model.modelledGasUsed.toString(),
    modelledNextBaseFeeWei: model.modelledNext.toString(),
    flippedBelowTarget: model.flippedBelowTarget,
    formula: step.formula,
    links: [
      { label: 'Etherscan block', href: `https://etherscan.io/block/${fx.blockNumber}` },
      { label: 'Etherscan transaction', href: `https://etherscan.io/tx/${fx.txHash}` },
      { label: 'Etherscan sender', href: `https://etherscan.io/address/${fx.from}` },
      { label: 'Etherscan callee', href: `https://etherscan.io/address/${fx.to}` },
    ],
    notIncluded:
      'The source brief mentioned wallet 0x33AAEC8F773a0023f929eb075dc68053B6C4F5ED and Seaport cancels to 0x0000000000000068F116a894984e2DB1123eB395. No transaction hashes were supplied, so GasScope does not invent that activity.',
  }
}

export interface FixtureVerification {
  available: boolean
  matches: boolean | null
  message: string
  observed?: { gasUsed: string; gasLimit: string; baseFeeWei: string; txGas: string; from: string; to: string; selector: string | null }
}

export function compareFixture(remote: {
  gasUsed: bigint
  gasLimit: bigint
  baseFeePerGas: bigint
  txGas: bigint
  from: string
  to: string | null
  selector: string | null
} | null): FixtureVerification {
  if (!remote) {
    return { available: false, matches: null, message: 'No mainnet RPC is configured, so the fixture was not re-read from the network.' }
  }
  const fx = FIXTURE_26330059
  const mismatches: string[] = []
  if (remote.gasUsed !== fx.gasUsed) mismatches.push(`gasUsed ${remote.gasUsed} vs fixture ${fx.gasUsed}`)
  if (remote.gasLimit !== fx.gasLimit) mismatches.push(`gasLimit ${remote.gasLimit} vs fixture ${fx.gasLimit}`)
  if (remote.baseFeePerGas !== fx.baseFeePerGas) mismatches.push(`baseFee ${remote.baseFeePerGas} vs fixture ${fx.baseFeePerGas}`)
  if (remote.txGas !== fx.txGas) mismatches.push(`tx gas ${remote.txGas} vs fixture ${fx.txGas}`)
  if (remote.from.toLowerCase() !== fx.from) mismatches.push('sender mismatch')
  if ((remote.to ?? '').toLowerCase() !== fx.to) mismatches.push('callee mismatch')
  if ((remote.selector ?? '').toLowerCase() !== fx.selector) mismatches.push('selector mismatch')
  return {
    available: true,
    matches: mismatches.length === 0,
    message: mismatches.length === 0 ? 'RPC values match the stored fixture.' : `RPC values differ: ${mismatches.join('; ')}.`,
    observed: {
      gasUsed: remote.gasUsed.toString(),
      gasLimit: remote.gasLimit.toString(),
      baseFeeWei: remote.baseFeePerGas.toString(),
      txGas: remote.txGas.toString(),
      from: remote.from,
      to: remote.to ?? '',
      selector: remote.selector,
    },
  }
}
