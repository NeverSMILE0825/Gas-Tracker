import { readFileSync } from 'node:fs'
import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import type { ChainBlock, ChainTx } from '@gasscope/analytics'
import { blockToRow, rowToBlock, rowToTx, txToRow } from './map'
import * as schema from './schema'

export interface CheckpointMeta {
  mode: 'demo' | 'live'
  chainId: number | null
  networkName: string
  synthetic: boolean
  ws: 'up' | 'down' | 'unused'
  lagSeconds: number | null
  capabilities: {
    eth_getBlockReceipts: boolean | null
    eth_feeHistory: boolean | null
    trace: boolean | null
  }
  requestCount: number
  errorCount: number
  lastError: string | null
  backfillTarget: number
  backfillCompleted: number
  backfillInProgress: boolean
  safeBlock: number | null
  finalizedBlock: number | null
  httpConfigured: boolean
  wsConfigured: boolean
  fallbackConfigured: boolean
  warnings: string[]
  backfillRequest: { fromBlock: number; toBlock: number } | null
  heartbeatMs: number
}

export interface StoredAlert {
  id: string
  name: string
  kind: string
  config: Record<string, unknown>
  enabled: boolean
  cooldownSec: number
  createdAt: string
}

export interface StoredFiring {
  id: string
  ruleId: string
  dedupeKey: string
  firedAt: string
  resolvedAt: string | null
  payload: Record<string, unknown>
  delivery: Record<string, unknown>
}

const migrationSql = readFileSync(new URL('../migrations/001_init.sql', import.meta.url), 'utf8')

export class GasRepository {
  readonly db: NodePgDatabase<typeof schema>

  constructor(readonly pool: pg.Pool) {
    this.db = drizzle(pool, { schema })
  }

  static connect(databaseUrl: string): GasRepository {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 8 })
    return new GasRepository(pool)
  }

  async migrate(): Promise<void> {
    await this.pool.query(migrationSql)
    await this.pool.query(`INSERT INTO schema_migrations (id) VALUES ('001_init') ON CONFLICT (id) DO NOTHING`)
  }

  async close(): Promise<void> {
    await this.pool.end()
  }

  async upsertBlock(block: ChainBlock, txs: ChainTx[]): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const row = blockToRow(block)
      await client.query(
        `INSERT INTO blocks (
          number, hash, parent_hash, timestamp, gas_limit, gas_used, base_fee_per_gas,
          blob_gas_used, excess_blob_gas, blob_base_fee, tx_count, receipts_complete,
          canonical, confirmation, synthetic, miner
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
        ) ON CONFLICT (number) DO UPDATE SET
          hash = EXCLUDED.hash,
          parent_hash = EXCLUDED.parent_hash,
          timestamp = EXCLUDED.timestamp,
          gas_limit = EXCLUDED.gas_limit,
          gas_used = EXCLUDED.gas_used,
          base_fee_per_gas = EXCLUDED.base_fee_per_gas,
          blob_gas_used = EXCLUDED.blob_gas_used,
          excess_blob_gas = EXCLUDED.excess_blob_gas,
          blob_base_fee = EXCLUDED.blob_base_fee,
          tx_count = EXCLUDED.tx_count,
          receipts_complete = EXCLUDED.receipts_complete,
          canonical = EXCLUDED.canonical,
          confirmation = EXCLUDED.confirmation,
          synthetic = EXCLUDED.synthetic,
          miner = EXCLUDED.miner`,
        [
          row.number, row.hash, row.parentHash, row.timestamp, row.gasLimit, row.gasUsed, row.baseFeePerGas,
          row.blobGasUsed, row.excessBlobGas, row.blobBaseFee, row.txCount, row.receiptsComplete,
          row.canonical, row.confirmation, row.synthetic, row.miner,
        ],
      )
      await client.query('DELETE FROM transactions WHERE block_number = $1', [block.number])
      for (let i = 0; i < txs.length; i += 200) {
        const slice = txs.slice(i, i + 200).map(txToRow)
        if (slice.length === 0) continue
        const values: unknown[] = []
        const groups = slice.map((tx, index) => {
          const base = index * 30
          values.push(
            tx.hash, tx.blockNumber, tx.txIndex, tx.timestamp, tx.fromAddress, tx.toAddress, tx.valueWei,
            tx.gasLimit, tx.gasUsed, tx.effectiveGasPrice, tx.maxFeePerGas, tx.maxPriorityFeePerGas, tx.baseFeePerGas,
            tx.executionFeeWei, tx.baseBurnWei, tx.tipWei, tx.blobGasUsed, tx.blobGasPrice, tx.blobFeeWei,
            tx.txType, tx.status, tx.selector, tx.methodSignature, tx.methodSource, tx.category,
            tx.categoryConfidence, tx.categoryProvenance, tx.classification, tx.synthetic, tx.inputSize,
          )
          const cols = Array.from({ length: 30 }, (_, n) => `$${base + n + 1}`)
          return `(${cols.join(',')})`
        })
        await client.query(
          `INSERT INTO transactions (
            hash, block_number, tx_index, timestamp, from_address, to_address, value_wei,
            gas_limit, gas_used, effective_gas_price, max_fee_per_gas, max_priority_fee_per_gas, base_fee_per_gas,
            execution_fee_wei, base_burn_wei, tip_wei, blob_gas_used, blob_gas_price, blob_fee_wei,
            tx_type, status, selector, method_signature, method_source, category,
            category_confidence, category_provenance, classification, synthetic, input_size
          ) VALUES ${groups.join(',')}`,
          values,
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async deleteFrom(number: number): Promise<void> {
    await this.db.delete(schema.blocks).where(gte(schema.blocks.number, number))
  }

  async blocksBetween(fromSec: number, toSec: number): Promise<ChainBlock[]> {
    const rows = await this.db
      .select()
      .from(schema.blocks)
      .where(and(eq(schema.blocks.canonical, true), gte(schema.blocks.timestamp, fromSec), lt(schema.blocks.timestamp, toSec)))
      .orderBy(asc(schema.blocks.number))
    return rows.map(rowToBlock)
  }

  async txsBetween(fromSec: number, toSec: number): Promise<ChainTx[]> {
    const rows = await this.db
      .select()
      .from(schema.transactions)
      .where(and(gte(schema.transactions.timestamp, fromSec), lt(schema.transactions.timestamp, toSec)))
      .orderBy(asc(schema.transactions.blockNumber), asc(schema.transactions.txIndex))
    return rows.map(rowToTx)
  }

  async countTxs(fromSec: number, toSec: number): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.transactions)
      .where(and(gte(schema.transactions.timestamp, fromSec), lt(schema.transactions.timestamp, toSec)))
    return rows[0]?.count ?? 0
  }

  async blockByNumber(number: number): Promise<ChainBlock | null> {
    const rows = await this.db.select().from(schema.blocks).where(eq(schema.blocks.number, number)).limit(1)
    return rows[0] ? rowToBlock(rows[0]) : null
  }

  async txsInBlock(number: number): Promise<ChainTx[]> {
    const rows = await this.db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.blockNumber, number))
      .orderBy(asc(schema.transactions.txIndex))
    return rows.map(rowToTx)
  }

  async txByHash(hash: string): Promise<ChainTx | null> {
    const rows = await this.db.select().from(schema.transactions).where(eq(schema.transactions.hash, hash.toLowerCase())).limit(1)
    const found = rows[0] ?? (await this.db.select().from(schema.transactions).where(eq(schema.transactions.hash, hash)).limit(1))[0]
    return found ? rowToTx(found) : null
  }

  async txsByAddress(address: string, fromSec: number, toSec: number): Promise<ChainTx[]> {
    const key = address.toLowerCase()
    const rows = await this.db
      .select()
      .from(schema.transactions)
      .where(
        and(
          gte(schema.transactions.timestamp, fromSec),
          lt(schema.transactions.timestamp, toSec),
          sql`(lower(${schema.transactions.fromAddress}) = ${key} OR lower(${schema.transactions.toAddress}) = ${key})`,
        ),
      )
      .orderBy(desc(schema.transactions.timestamp))
      .limit(500)
    return rows.map(rowToTx)
  }

  async indexedRange(): Promise<{ fromSec: number | null; toSec: number | null; latest: ChainBlock | null; count: number }> {
    const rows = await this.db
      .select({
        minTs: sql<number | null>`min(${schema.blocks.timestamp})`,
        maxTs: sql<number | null>`max(${schema.blocks.timestamp})`,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.blocks)
      .where(eq(schema.blocks.canonical, true))
    const latestRows = await this.db
      .select()
      .from(schema.blocks)
      .where(eq(schema.blocks.canonical, true))
      .orderBy(desc(schema.blocks.number))
      .limit(1)
    return {
      fromSec: rows[0]?.minTs ?? null,
      toSec: rows[0]?.maxTs ?? null,
      latest: latestRows[0] ? rowToBlock(latestRows[0]) : null,
      count: rows[0]?.count ?? 0,
    }
  }

  async recentBlocks(limit: number): Promise<ChainBlock[]> {
    const rows = await this.db
      .select()
      .from(schema.blocks)
      .where(eq(schema.blocks.canonical, true))
      .orderBy(desc(schema.blocks.number))
      .limit(limit)
    return rows.map(rowToBlock).reverse()
  }

  async readCheckpoint(): Promise<{ lastBlock: number | null; lastHash: string | null; meta: CheckpointMeta | null; updatedAtMs: number | null }> {
    const rows = await this.db.select().from(schema.checkpoints).where(eq(schema.checkpoints.id, 'main')).limit(1)
    const row = rows[0]
    if (!row) return { lastBlock: null, lastHash: null, meta: null, updatedAtMs: null }
    return {
      lastBlock: row.lastBlock,
      lastHash: row.lastHash,
      meta: row.meta as CheckpointMeta,
      updatedAtMs: row.updatedAt.getTime(),
    }
  }

  async writeCheckpoint(lastBlock: number | null, lastHash: string | null, meta: CheckpointMeta): Promise<void> {
    await this.db
      .insert(schema.checkpoints)
      .values({ id: 'main', lastBlock, lastHash, meta, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.checkpoints.id,
        set: { lastBlock, lastHash, meta, updatedAt: new Date() },
      })
  }

  async listAlerts(): Promise<StoredAlert[]> {
    const rows = await this.db.select().from(schema.alertRules).orderBy(asc(schema.alertRules.createdAt))
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      config: row.config as Record<string, unknown>,
      enabled: row.enabled,
      cooldownSec: row.cooldownSec,
      createdAt: row.createdAt.toISOString(),
    }))
  }

  async saveAlert(alert: StoredAlert): Promise<void> {
    await this.db
      .insert(schema.alertRules)
      .values({
        id: alert.id,
        name: alert.name,
        kind: alert.kind,
        config: alert.config,
        enabled: alert.enabled,
        cooldownSec: alert.cooldownSec,
        createdAt: new Date(alert.createdAt),
      })
      .onConflictDoUpdate({
        target: schema.alertRules.id,
        set: {
          name: alert.name,
          kind: alert.kind,
          config: alert.config,
          enabled: alert.enabled,
          cooldownSec: alert.cooldownSec,
        },
      })
  }

  async deleteAlert(id: string): Promise<boolean> {
    const rows = await this.db.delete(schema.alertRules).where(eq(schema.alertRules.id, id)).returning({ id: schema.alertRules.id })
    return rows.length > 0
  }

  async listFirings(limit = 50): Promise<StoredFiring[]> {
    const rows = await this.db.select().from(schema.alertFirings).orderBy(desc(schema.alertFirings.firedAt)).limit(limit)
    return rows.map((row) => ({
      id: row.id,
      ruleId: row.ruleId,
      dedupeKey: row.dedupeKey,
      firedAt: row.firedAt.toISOString(),
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
      payload: row.payload as Record<string, unknown>,
      delivery: row.delivery as Record<string, unknown>,
    }))
  }

  async activeFiring(ruleId: string): Promise<StoredFiring | null> {
    const rows = await this.db
      .select()
      .from(schema.alertFirings)
      .where(and(eq(schema.alertFirings.ruleId, ruleId), sql`${schema.alertFirings.resolvedAt} IS NULL`))
      .orderBy(desc(schema.alertFirings.firedAt))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    return {
      id: row.id,
      ruleId: row.ruleId,
      dedupeKey: row.dedupeKey,
      firedAt: row.firedAt.toISOString(),
      resolvedAt: null,
      payload: row.payload as Record<string, unknown>,
      delivery: row.delivery as Record<string, unknown>,
    }
  }

  async insertFiring(firing: StoredFiring): Promise<void> {
    await this.db
      .insert(schema.alertFirings)
      .values({
        id: firing.id,
        ruleId: firing.ruleId,
        dedupeKey: firing.dedupeKey,
        firedAt: new Date(firing.firedAt),
        resolvedAt: firing.resolvedAt ? new Date(firing.resolvedAt) : null,
        payload: firing.payload,
        delivery: firing.delivery,
      })
      .onConflictDoNothing()
  }

  async feeTotals(fromSec: number, toSec: number): Promise<{ gasUsed: string; burnWei: string; tipWei: string; blobFeeWei: string; failedGas: string; txCount: number }> {
    const result = await this.pool.query<{ gas_used: string; burn: string; tip: string; blob: string; failed: string; tx_count: number }>(
      `SELECT
         trunc(coalesce(sum(gas_used::numeric), 0))::text AS gas_used,
         trunc(coalesce(sum(base_burn_wei::numeric), 0))::text AS burn,
         trunc(coalesce(sum(tip_wei::numeric), 0))::text AS tip,
         trunc(coalesce(sum(coalesce(blob_fee_wei, '0')::numeric), 0))::text AS blob,
         trunc(coalesce(sum(CASE WHEN status = 0 THEN gas_used::numeric ELSE 0 END), 0))::text AS failed,
         count(*)::int AS tx_count
       FROM transactions
       WHERE timestamp >= $1 AND timestamp < $2`,
      [fromSec, toSec],
    )
    const row = result.rows[0]
    return {
      gasUsed: row?.gas_used ?? '0',
      burnWei: row?.burn ?? '0',
      tipWei: row?.tip ?? '0',
      blobFeeWei: row?.blob ?? '0',
      failedGas: row?.failed ?? '0',
      txCount: row?.tx_count ?? 0,
    }
  }

  async groupedDrivers(
    fromSec: number,
    toSec: number,
    groupBy: 'sender' | 'contract' | 'category' | 'method',
    limit: number,
  ): Promise<{
    key: string
    gasUsed: string
    txCount: number
    failedGas: string
    failedTxCount: number
    burnWei: string
    tipWei: string
    executionFeeWei: string
    blobFeeWei: string
    firstTs: number
    lastTs: number
    category: string | null
    method: string | null
    aboveTargetGas: string
  }[]> {
    const keySql =
      groupBy === 'sender'
        ? 't.from_address'
        : groupBy === 'contract'
          ? `coalesce(t.to_address, 'create:' || t.hash)`
          : groupBy === 'category'
            ? 't.category'
            : `coalesce(t.selector, 'none')`
    const result = await this.pool.query(
      `SELECT ${keySql} AS key,
         trunc(sum(t.gas_used::numeric))::text AS gas_used,
         count(*)::int AS tx_count,
         trunc(sum(CASE WHEN t.status = 0 THEN t.gas_used::numeric ELSE 0 END))::text AS failed_gas,
         sum(CASE WHEN t.status = 0 THEN 1 ELSE 0 END)::int AS failed_count,
         trunc(sum(t.base_burn_wei::numeric))::text AS burn,
         trunc(sum(t.tip_wei::numeric))::text AS tip,
         trunc(sum(t.execution_fee_wei::numeric))::text AS execution,
         trunc(sum(coalesce(t.blob_fee_wei, '0')::numeric))::text AS blob,
         min(t.timestamp)::int AS first_ts,
         max(t.timestamp)::int AS last_ts,
         max(t.category) AS category,
         max(t.method_signature) AS method,
         trunc(sum(CASE WHEN b.gas_used::numeric * 2 > b.gas_limit::numeric THEN t.gas_used::numeric ELSE 0 END))::text AS above_gas
       FROM transactions t
       JOIN blocks b ON b.number = t.block_number AND b.canonical
       WHERE t.timestamp >= $1 AND t.timestamp < $2
       GROUP BY 1
       ORDER BY sum(t.gas_used::numeric) DESC
       LIMIT $3`,
      [fromSec, toSec, limit],
    )
    return result.rows.map((row: Record<string, string | number | null>) => ({
      key: String(row.key),
      gasUsed: String(row.gas_used),
      txCount: Number(row.tx_count),
      failedGas: String(row.failed_gas),
      failedTxCount: Number(row.failed_count),
      burnWei: String(row.burn),
      tipWei: String(row.tip),
      executionFeeWei: String(row.execution),
      blobFeeWei: String(row.blob),
      firstTs: Number(row.first_ts),
      lastTs: Number(row.last_ts),
      category: row.category ? String(row.category) : null,
      method: row.method ? String(row.method) : null,
      aboveTargetGas: String(row.above_gas),
    }))
  }

  async resolveFiring(ruleId: string, dedupeKey: string): Promise<void> {
    await this.db
      .update(schema.alertFirings)
      .set({ resolvedAt: new Date() })
      .where(and(eq(schema.alertFirings.ruleId, ruleId), eq(schema.alertFirings.dedupeKey, dedupeKey)))
  }
}
