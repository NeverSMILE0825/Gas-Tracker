import { describe, expect, it } from 'vitest'
import { buildDemoHistory } from '@gasscope/analytics'
import { blockToRow, rowToBlock, rowToTx, txToRow } from '../src/map'

describe('row mapping', () => {
  it('round-trips a demo block and transaction through text columns', () => {
    const history = buildDemoHistory({ endSec: 1_762_200_000, hours: 0.05, seed: 7 })
    const block = history.blocks[1]!
    const tx = history.txs.find((row) => row.blockNumber === block.number)!
    expect(rowToBlock(blockToRow(block) as never)).toMatchObject({
      number: block.number,
      baseFeePerGas: block.baseFeePerGas,
      gasUsed: block.gasUsed,
    })
    const restored = rowToTx(txToRow(tx) as never)
    expect(restored.gasUsed).toBe(tx.gasUsed)
    expect(restored.baseBurnWei).toBe(tx.baseBurnWei)
    expect(restored.tipWei).toBe(tx.tipWei)
    expect(restored.from).toBe(tx.from)
  })
})
