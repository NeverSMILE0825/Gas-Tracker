import { getAddress, isAddress } from 'viem'

const HASH_RE = /^0x[0-9a-fA-F]{64}$/
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/

export type Probe =
  | { kind: 'tx'; hash: string }
  | { kind: 'address'; address: string }
  | { kind: 'block'; number: number }
  | { kind: 'invalid'; reason: string }

function clean(raw: string): string {
  return raw.trim()
}

export function parseProbe(raw: string): Probe {
  const input = clean(raw)
  if (!input) return { kind: 'invalid', reason: 'Enter a transaction hash, address, block number, or Etherscan URL.' }

  const url = input.match(
    /etherscan\.io\/(tx|address|block)\/(0x[0-9a-fA-F]{64}|0x[0-9a-fA-F]{40}|\d+)/i,
  )
  const body = url ? url[2] : input
  const urlKind = url?.[1]?.toLowerCase()

  if (urlKind === 'tx' || HASH_RE.test(body)) {
    return { kind: 'tx', hash: body.toLowerCase() }
  }
  if (urlKind === 'address' || ADDR_RE.test(body)) {
    if (!isAddress(body)) return { kind: 'invalid', reason: 'That value is not a 20-byte Ethereum address.' }
    return { kind: 'address', address: getAddress(body) }
  }
  if (urlKind === 'block' || /^\d{1,12}$/.test(body)) {
    const number = Number(body)
    if (!Number.isSafeInteger(number) || number < 0) {
      return { kind: 'invalid', reason: 'Block number is out of range.' }
    }
    return { kind: 'block', number }
  }
  return {
    kind: 'invalid',
    reason: 'Unrecognized query. Paste a tx hash, address, block number, or an etherscan.io tx/address/block URL.',
  }
}

export function etherscanTx(hash: string): string {
  return `https://etherscan.io/tx/${hash}`
}

export function etherscanAddress(address: string): string {
  return `https://etherscan.io/address/${address}`
}

export function etherscanBlock(number: number): string {
  return `https://etherscan.io/block/${number}`
}
