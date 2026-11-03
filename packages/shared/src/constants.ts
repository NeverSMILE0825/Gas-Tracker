export const FORMULA_VERSION = 'gasscope-eip1559-el2+4844-fakeexp+7918-bpo2-2026.11.02'

export const PRESETS = ['5m', '15m', '30m', '1h', '3h', '6h', '12h', '24h', '7d'] as const
export type Preset = (typeof PRESETS)[number]

export const BUCKETS = ['block', '1m', '5m', '15m', '1h', 'auto'] as const
export type BucketName = (typeof BUCKETS)[number]

export const DEFAULT_TIMEZONE = 'America/New_York'
export const MAX_RANGE_SEC = 7 * 24 * 3600
export const GWEI = 1_000_000_000n
export const WEI_PER_ETH = 1_000_000_000_000_000_000n

/** Rankings are labelled partial below this receipt coverage. */
export const DEFINITIVE_COVERAGE = 0.98

export const EVIDENCE_CLASSES = [
  'PROTOCOL-EXACT',
  'OBSERVED ON-CHAIN',
  'INFERRED',
  'UNVERIFIED',
  'MODELLED',
] as const
export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number]

export const CATEGORIES = [
  'empty-calldata',
  'erc20',
  'stablecoin',
  'nft',
  'dex',
  'lending',
  'erc4337',
  'eip7702',
  'contract-deploy',
  'token-mint',
  'infrastructure',
  'token-transfer',
  'unknown',
] as const
export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_LABEL: Record<Category, string> = {
  'empty-calldata': 'Empty calldata',
  erc20: 'ERC-20 fingerprint',
  stablecoin: 'Stablecoin contract',
  nft: 'NFT / marketplace',
  dex: 'DEX router',
  lending: 'Lending pool',
  erc4337: 'ERC-4337 entry point',
  eip7702: 'EIP-7702 authorization',
  'contract-deploy': 'Contract deployment',
  'token-mint': 'Mint selector',
  infrastructure: 'Infrastructure',
  'token-transfer': 'transferFrom selector',
  unknown: 'Unclassified',
}

export function categoryLabel(category: string | null | undefined): string {
  if (!category) return 'Unclassified'
  return CATEGORY_LABEL[category as Category] ?? category
}
