import { z } from 'zod'
import { BUCKETS, PRESETS } from './constants'

const boolish = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined
    if (typeof v === 'boolean') return v
    return v === '1' || v === 'true'
  })

export const intervalQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  preset: z.enum(PRESETS).optional(),
  bucket: z.enum(BUCKETS).optional(),
  compare: boolish,
  live: boolish,
  tz: z.string().min(1).max(80).optional(),
  includeChecks: boolish,
})

export const driversQuerySchema = intervalQuerySchema.extend({
  groupBy: z.enum(['sender', 'contract', 'category', 'method']).default('sender'),
  sort: z.enum(['gasUsed', 'fees', 'txCount', 'tip']).default('gasUsed'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
})

export const sensitivityBodySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  preset: z.enum(PRESETS).optional(),
  tz: z.string().optional(),
  live: boolish,
  sender: z.string().optional(),
  txHash: z.string().optional(),
  blockNumber: z.coerce.number().int().nonnegative().optional(),
})

export const alertKindSchema = z.enum([
  'basefee_above',
  'basefee_below',
  'basefee_change_pct',
  'consecutive_target',
  'wallet_share',
  'large_tx',
  'index_stale',
])

export const alertConfigSchema = z.object({
  gwei: z.number().positive().optional(),
  minutes: z.number().int().min(1).max(24 * 60).optional(),
  percent: z.number().positive().max(10000).optional(),
  intervalMinutes: z.number().int().min(1).max(24 * 60).optional(),
  direction: z.enum(['above', 'below']).optional(),
  count: z.number().int().min(1).max(500).optional(),
  address: z.string().optional(),
  category: z.string().optional(),
  share: z.number().positive().max(1).optional(),
  gas: z.number().int().positive().optional(),
  staleSeconds: z.number().int().min(30).max(3600).optional(),
})

export const alertWriteSchema = z.object({
  name: z.string().min(1).max(80),
  kind: alertKindSchema,
  config: alertConfigSchema,
  enabled: z.boolean().default(true),
  cooldownSec: z.number().int().min(30).max(86_400).default(300),
})

export type IntervalQuery = z.infer<typeof intervalQuerySchema>
export type DriversQuery = z.infer<typeof driversQuerySchema>
export type SensitivityBody = z.infer<typeof sensitivityBodySchema>
export type AlertWrite = z.infer<typeof alertWriteSchema>
