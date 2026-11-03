import { etherscanAddress, etherscanBlock, etherscanTx } from '@gasscope/shared'

export function externalLink(
  synthetic: boolean,
  kind: 'tx' | 'address' | 'block',
  value: string | number,
): { label: string; href: string | null; disabledReason?: string } {
  const label = kind === 'tx' ? 'Etherscan transaction' : kind === 'address' ? 'Etherscan address' : 'Etherscan block'
  if (synthetic) {
    return { label, href: null, disabledReason: 'Synthetic demo data has no Etherscan page.' }
  }
  const href = kind === 'tx' ? etherscanTx(String(value)) : kind === 'address' ? etherscanAddress(String(value)) : etherscanBlock(Number(value))
  return { label, href }
}
