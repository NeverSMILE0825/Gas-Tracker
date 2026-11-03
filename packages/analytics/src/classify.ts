import type { Category, EvidenceClass } from '@gasscope/shared'
import { keccak256, toBytes } from 'viem'

export interface SelectorInfo {
  signature: string
  selector: string
  category: Category
  /** Selector alone is too generic unless the callee is in the address book. */
  addressRequired: boolean
  collision: boolean
}

export interface AddressInfo {
  address: string
  name: string
  category: Category
  source: string
}

const SIGNATURES: Omit<SelectorInfo, 'selector'>[] = [
  { signature: 'transfer(address,uint256)', category: 'erc20', addressRequired: false, collision: false },
  { signature: 'approve(address,uint256)', category: 'erc20', addressRequired: false, collision: false },
  { signature: 'transferFrom(address,address,uint256)', category: 'token-transfer', addressRequired: false, collision: true },
  { signature: 'safeTransferFrom(address,address,uint256)', category: 'nft', addressRequired: false, collision: false },
  { signature: 'safeTransferFrom(address,address,uint256,bytes)', category: 'nft', addressRequired: false, collision: false },
  { signature: 'setApprovalForAll(address,bool)', category: 'nft', addressRequired: false, collision: false },
  { signature: 'mint(address,uint256)', category: 'token-mint', addressRequired: false, collision: false },
  { signature: 'deposit()', category: 'infrastructure', addressRequired: true, collision: false },
  { signature: 'withdraw(uint256)', category: 'infrastructure', addressRequired: true, collision: false },
  { signature: 'exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))', category: 'dex', addressRequired: false, collision: false },
  { signature: 'exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))', category: 'dex', addressRequired: false, collision: false },
  { signature: 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)', category: 'dex', addressRequired: false, collision: false },
  { signature: 'swapExactETHForTokens(uint256,address[],address,uint256)', category: 'dex', addressRequired: false, collision: false },
  { signature: 'execute(bytes,bytes[],uint256)', category: 'dex', addressRequired: false, collision: false },
]

export const SELECTOR_BOOK: SelectorInfo[] = SIGNATURES.map((row) => ({
  ...row,
  selector: keccak256(toBytes(row.signature)).slice(0, 10),
}))

const SELECTOR_MAP = new Map(SELECTOR_BOOK.map((row) => [row.selector, row]))

/**
 * Curated mainnet addresses. A hit is a registry match, not a protocol proof of the operator's motive.
 * Sources are the canonical deployments widely published by those projects.
 */
export const ADDRESS_BOOK: AddressInfo[] = [
  { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', name: 'WETH', category: 'infrastructure', source: 'canonical WETH9 deployment' },
  { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', name: 'USDC', category: 'stablecoin', source: 'Circle USDC proxy' },
  { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', name: 'USDT', category: 'stablecoin', source: 'Tether USDT deployment' },
  { address: '0x6b175474e89094c44da98b954eedeac495271d0f', name: 'DAI', category: 'stablecoin', source: 'MakerDAO DAI' },
  { address: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d', name: 'Uniswap V2 Router02', category: 'dex', source: 'Uniswap canonical router' },
  { address: '0xe592427a0aece92de3edee1f18e0157c05861564', name: 'Uniswap V3 SwapRouter', category: 'dex', source: 'Uniswap canonical router' },
  { address: '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', name: 'Uniswap V3 SwapRouter02', category: 'dex', source: 'Uniswap canonical router' },
  { address: '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', name: 'Uniswap Universal Router', category: 'dex', source: 'Uniswap canonical router' },
  { address: '0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b', name: 'Uniswap Universal Router (older)', category: 'dex', source: 'Uniswap canonical router' },
  { address: '0x0000000000000068f116a894984e2db1123eb395', name: 'Seaport 1.6', category: 'nft', source: 'OpenSea Seaport 1.6' },
  { address: '0x00000000006c3852cbef3e08e8df289169ede581', name: 'Seaport 1.1', category: 'nft', source: 'OpenSea Seaport 1.1' },
  { address: '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789', name: 'ERC-4337 EntryPoint v0.6', category: 'erc4337', source: 'account-abstraction canonical entry point' },
  { address: '0x0000000071727de22e5e9d8baf0edac6f37da032', name: 'ERC-4337 EntryPoint v0.7', category: 'erc4337', source: 'account-abstraction canonical entry point' },
  { address: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2', name: 'Aave V3 Pool', category: 'lending', source: 'Aave V3 Ethereum pool' },
  { address: '0x00000000219ab540356cbb839cbe05303d7705fa', name: 'Beacon deposit contract', category: 'infrastructure', source: 'Ethereum deposit contract' },
]

const ADDRESS_MAP = new Map(ADDRESS_BOOK.map((row) => [row.address, row]))

export interface Classification {
  category: Category
  confidence: 'high' | 'medium' | 'low' | 'none'
  classification: EvidenceClass
  method: string | null
  methodSource: string | null
  provenance: string
  selector: string | null
  addressName: string | null
}

export function selectorOf(signature: string): string {
  return keccak256(toBytes(signature)).slice(0, 10)
}

export function lookupSelector(selector: string | null): SelectorInfo | null {
  if (!selector) return null
  return SELECTOR_MAP.get(selector.toLowerCase()) ?? null
}

export function lookupAddress(address: string | null): AddressInfo | null {
  if (!address) return null
  return ADDRESS_MAP.get(address.toLowerCase()) ?? null
}

export function classifyCall(input: {
  to: string | null
  input: string | null
  txType: number
}): Classification {
  const calldata = (input.input ?? '0x').toLowerCase()
  const selector = calldata.length >= 10 ? calldata.slice(0, 10) : null
  const book = lookupAddress(input.to)
  const sig = lookupSelector(selector)

  if (input.to === null) {
    return {
      category: 'contract-deploy',
      confidence: 'high',
      classification: 'OBSERVED ON-CHAIN',
      method: null,
      methodSource: null,
      provenance: 'Transaction has no recipient, which is a contract creation.',
      selector,
      addressName: null,
    }
  }

  if (!calldata || calldata === '0x') {
    return {
      category: 'empty-calldata',
      confidence: 'high',
      classification: 'OBSERVED ON-CHAIN',
      method: null,
      methodSource: null,
      provenance: 'Calldata is empty. That matches a simple transfer pattern; recipient code was not checked.',
      selector: null,
      addressName: book?.name ?? null,
    }
  }

  if (input.txType === 4 && !sig && !book) {
    return {
      category: 'eip7702',
      confidence: 'high',
      classification: 'OBSERVED ON-CHAIN',
      method: null,
      methodSource: null,
      provenance: 'Transaction type is 4 (EIP-7702). The called method is unidentified, so intent is not classified.',
      selector,
      addressName: null,
    }
  }

  if (book && sig && !sig.addressRequired) {
    const category = book.category === 'stablecoin' && sig.category === 'erc20' ? 'stablecoin' : book.category
    return {
      category,
      confidence: 'high',
      classification: 'INFERRED',
      method: sig.signature,
      methodSource: 'selector derived from the canonical signature text',
      provenance: `Callee matches the curated registry entry “${book.name}” (${book.source}) and the selector matches ${sig.signature}. This is not a statement about the sender’s motive.${sig.collision ? ' The selector also collides with other standards.' : ''}`,
      selector,
      addressName: book.name,
    }
  }

  if (book && sig?.addressRequired) {
    return {
      category: book.category,
      confidence: 'high',
      classification: 'INFERRED',
      method: sig.signature,
      methodSource: 'selector derived from the canonical signature text',
      provenance: `Callee matches “${book.name}” and the selector matches ${sig.signature}.`,
      selector,
      addressName: book.name,
    }
  }

  if (book) {
    return {
      category: book.category,
      confidence: 'medium',
      classification: 'INFERRED',
      method: sig?.signature ?? null,
      methodSource: sig ? 'selector derived from the canonical signature text' : null,
      provenance: `Callee matches the curated registry entry “${book.name}”. ${sig ? `Selector ${sig.signature} is noted separately.` : selector ? `Selector ${selector} is not in the local signature list.` : 'No selector was present.'}`,
      selector,
      addressName: book.name,
    }
  }

  if (sig && !sig.addressRequired) {
    return {
      category: sig.category,
      confidence: sig.collision ? 'low' : 'medium',
      classification: 'INFERRED',
      method: sig.signature,
      methodSource: 'selector derived from the canonical signature text; callee is not in the curated registry',
      provenance: sig.collision
        ? `Selector matches ${sig.signature}, which collides across standards. Category is a fingerprint only.`
        : `Selector matches ${sig.signature}. The callee is not in the curated registry, so this is a fingerprint, not an application identity.`,
      selector,
      addressName: null,
    }
  }

  if (input.txType === 4) {
    return {
      category: 'eip7702',
      confidence: 'medium',
      classification: 'OBSERVED ON-CHAIN',
      method: null,
      methodSource: null,
      provenance: `Transaction type is 4 (EIP-7702). ${selector ? `Method ${selector} is unidentified.` : 'No calldata selector.'}`,
      selector,
      addressName: null,
    }
  }

  return {
    category: 'unknown',
    confidence: 'none',
    classification: 'UNVERIFIED',
    method: null,
    methodSource: null,
    provenance: selector
      ? `Unidentified method ${selector}. No curated address or signature match.`
      : 'Calldata does not contain a 4-byte selector and is not empty.',
    selector,
    addressName: null,
  }
}
