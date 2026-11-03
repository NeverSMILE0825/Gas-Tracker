export interface HashRef {
  number: number
  hash: string
}

/** Highest block number present in both sets with the same hash. Null when they do not overlap. */
export function highestMatchingHeight(local: HashRef[], remote: HashRef[]): number | null {
  const remoteHash = new Map(remote.map((b) => [b.number, b.hash]))
  let best: number | null = null
  for (const block of local) {
    if (remoteHash.get(block.number) === block.hash && (best === null || block.number > best)) best = block.number
  }
  return best
}

/**
 * If the incoming parent hash disagrees with the stored parent, return the height
 * the caller should walk backward from. Null means the new block extends the stored chain.
 */
export function reorgWalkFrom(
  storedParent: { number: number; hash: string } | null,
  incoming: { number: number; parentHash: string },
): number | null {
  if (!storedParent) return null
  if (storedParent.number !== incoming.number - 1) return incoming.number - 1
  if (storedParent.hash === incoming.parentHash) return null
  return storedParent.number
}
