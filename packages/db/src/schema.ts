import { bigint, boolean, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const blocks = pgTable('blocks', {
  number: bigint('number', { mode: 'number' }).primaryKey(),
  hash: text('hash').notNull(),
  parentHash: text('parent_hash').notNull(),
  timestamp: integer('timestamp').notNull(),
  gasLimit: text('gas_limit').notNull(),
  gasUsed: text('gas_used').notNull(),
  baseFeePerGas: text('base_fee_per_gas').notNull(),
  blobGasUsed: text('blob_gas_used'),
  excessBlobGas: text('excess_blob_gas'),
  blobBaseFee: text('blob_base_fee'),
  txCount: integer('tx_count').notNull(),
  receiptsComplete: boolean('receipts_complete').notNull(),
  canonical: boolean('canonical').notNull().default(true),
  confirmation: text('confirmation').notNull(),
  synthetic: boolean('synthetic').notNull(),
  miner: text('miner'),
})

export const transactions = pgTable('transactions', {
  hash: text('hash').primaryKey(),
  blockNumber: bigint('block_number', { mode: 'number' }).notNull(),
  txIndex: integer('tx_index').notNull(),
  timestamp: integer('timestamp').notNull(),
  fromAddress: text('from_address').notNull(),
  toAddress: text('to_address'),
  valueWei: text('value_wei').notNull(),
  gasLimit: text('gas_limit').notNull(),
  gasUsed: text('gas_used').notNull(),
  effectiveGasPrice: text('effective_gas_price').notNull(),
  maxFeePerGas: text('max_fee_per_gas'),
  maxPriorityFeePerGas: text('max_priority_fee_per_gas'),
  baseFeePerGas: text('base_fee_per_gas').notNull(),
  executionFeeWei: text('execution_fee_wei').notNull(),
  baseBurnWei: text('base_burn_wei').notNull(),
  tipWei: text('tip_wei').notNull(),
  blobGasUsed: text('blob_gas_used'),
  blobGasPrice: text('blob_gas_price'),
  blobFeeWei: text('blob_fee_wei'),
  txType: integer('tx_type').notNull(),
  status: integer('status').notNull(),
  selector: text('selector'),
  methodSignature: text('method_signature'),
  methodSource: text('method_source'),
  category: text('category').notNull(),
  categoryConfidence: text('category_confidence').notNull(),
  categoryProvenance: text('category_provenance').notNull(),
  classification: text('classification').notNull(),
  synthetic: boolean('synthetic').notNull(),
  inputSize: integer('input_size').notNull(),
})

export const buckets = pgTable(
  'buckets',
  {
    resolution: text('resolution').notNull(),
    bucketStart: integer('bucket_start').notNull(),
    blockStart: bigint('block_start', { mode: 'number' }).notNull(),
    blockEnd: bigint('block_end', { mode: 'number' }).notNull(),
    baseFeeOpen: text('base_fee_open').notNull(),
    baseFeeClose: text('base_fee_close').notNull(),
    gasUsed: text('gas_used').notNull(),
    gasTarget: text('gas_target').notNull(),
    txCount: integer('tx_count').notNull(),
    blocksAbove: integer('blocks_above').notNull(),
    blocksBelow: integer('blocks_below').notNull(),
    burnWei: text('burn_wei').notNull(),
    tipWei: text('tip_wei').notNull(),
  },
  (table) => [primaryKey({ columns: [table.resolution, table.bucketStart] })],
)

export const checkpoints = pgTable('checkpoints', {
  id: text('id').primaryKey(),
  lastBlock: bigint('last_block', { mode: 'number' }),
  lastHash: text('last_hash'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  meta: jsonb('meta').notNull(),
})

export const alertRules = pgTable('alert_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  config: jsonb('config').notNull(),
  enabled: boolean('enabled').notNull(),
  cooldownSec: integer('cooldown_sec').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const alertFirings = pgTable(
  'alert_firings',
  {
    id: text('id').primaryKey(),
    ruleId: text('rule_id').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    firedAt: timestamp('fired_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    payload: jsonb('payload').notNull(),
    delivery: jsonb('delivery').notNull(),
  },
  (table) => [uniqueIndex('alert_episode_idx').on(table.ruleId, table.dedupeKey)],
)

export const labels = pgTable(
  'labels',
  {
    address: text('address').notNull(),
    chainId: integer('chain_id').notNull(),
    name: text('name').notNull(),
    category: text('category'),
    source: text('source').notNull(),
    verified: boolean('verified').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.address, table.chainId, table.source] })],
)
