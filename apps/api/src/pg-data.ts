import { lookupAddress } from '@gasscope/analytics'
import { GasRepository, type CheckpointMeta } from '@gasscope/db'
import { FORMULA_VERSION, toIsoUtc, type AlertFiringDto, type AlertRuleDto, type StatusDto } from '@gasscope/shared'
import type { GasData, HeadEvent } from './data'

export async function openPostgres(databaseUrl: string): Promise<GasData> {
  const repo = GasRepository.connect(databaseUrl)
  await repo.migrate()
  return createPgData(repo)
}

export function createPgData(repo: GasRepository): GasData {
  return {
    async getStatus() {
      const [checkpoint, range] = await Promise.all([repo.readCheckpoint(), repo.indexedRange()])
      const meta = checkpoint.meta
      const latest = range.latest
      const synthetic = meta?.synthetic ?? latest?.synthetic ?? false
      const heartbeatAge = meta ? Math.max(0, Date.now() - meta.heartbeatMs) : null
      const lag = meta?.lagSeconds ?? (latest ? Math.max(0, Math.floor(Date.now() / 1000) - latest.timestamp) : null)
      let runState: StatusDto['runState'] = 'PAUSED'
      if (synthetic) runState = 'DEMO'
      else if (heartbeatAge !== null && heartbeatAge < 45_000) {
        if (meta?.ws === 'down') runState = 'RECONNECTING'
        else if ((lag ?? 99) > 36) runState = 'DELAYED'
        else runState = 'LIVE'
      }
      const warnings = [...(meta?.warnings ?? [])]
      if (!meta) warnings.push('The worker has not written a checkpoint yet.')
      if (!synthetic && heartbeatAge !== null && heartbeatAge >= 45_000) warnings.push('Indexer heartbeat is stale. Data is not live.')
      return {
        mode: synthetic ? 'demo' : 'live',
        synthetic,
        runState,
        networkName: meta?.networkName ?? (synthetic ? 'Demo chain (synthetic)' : 'Network not reported'),
        chainId: meta?.chainId ?? null,
        chainIdOk: meta?.chainId === 1,
        latestBlock: latest?.number ?? null,
        latestBlockHash: latest?.hash ?? null,
        latestTimestamp: latest ? toIsoUtc(latest.timestamp * 1000) : null,
        indexedBlock: latest?.number ?? checkpoint.lastBlock ?? null,
        indexedFrom: range.fromSec === null ? null : toIsoUtc(range.fromSec * 1000),
        indexedTo: range.toSec === null ? null : toIsoUtc((range.toSec + 1) * 1000),
        lagSeconds: lag,
        headDelayBlocks: meta && latest && meta.backfillTarget ? Math.max(0, meta.backfillTarget - meta.backfillCompleted) : null,
        receiptCoverage15m: null,
        confirmation: { safe: meta?.safeBlock ?? null, finalized: meta?.finalizedBlock ?? null },
        backfill: {
          targetBlocks: meta?.backfillTarget ?? 0,
          completedBlocks: meta?.backfillCompleted ?? range.count,
          inProgress: meta?.backfillInProgress ?? false,
          note: meta?.backfillInProgress
            ? 'Backfill is in progress. Each block costs a header request and a receipt request.'
            : 'Backfill is idle.',
        },
        provider: {
          httpConfigured: meta?.httpConfigured ?? false,
          wsConfigured: meta?.wsConfigured ?? false,
          fallbackConfigured: meta?.fallbackConfigured ?? false,
          websocket: meta?.ws ?? 'unused',
          capabilities: meta?.capabilities ?? { eth_getBlockReceipts: null, eth_feeHistory: null, trace: null },
          lastError: meta?.lastError ?? null,
          requestCount: meta?.requestCount ?? 0,
          errorCount: meta?.errorCount ?? 0,
        },
        formulaVersion: FORMULA_VERSION,
        updatedAt: new Date().toISOString(),
        warnings,
      }
    },
    blocksBetween: (from, to) => repo.blocksBetween(from, to),
    txsBetween: (from, to) => repo.txsBetween(from, to),
    countTxs: (from, to) => repo.countTxs(from, to),
    blockByNumber: (number) => repo.blockByNumber(number),
    txsInBlock: (number) => repo.txsInBlock(number),
    txByHash: (hash) => repo.txByHash(hash),
    txsByAddress: (address, from, to) => repo.txsByAddress(address, from, to),
    async recent(limitBlocks) {
      const blocks = await repo.recentBlocks(limitBlocks)
      const first = blocks[0]
      const txs = first ? await repo.txsBetween(first.timestamp, (blocks[blocks.length - 1]?.timestamp ?? first.timestamp) + 1) : []
      return { blocks, txs }
    },
    feeTotals: (from, to) => repo.feeTotals(from, to),
    groupedDrivers: (from, to, groupBy, limit) => repo.groupedDrivers(from, to, groupBy, limit),
    async alerts() {
      return (await repo.listAlerts()).map(toAlert)
    },
    async saveAlert(alert) {
      await repo.saveAlert({ ...alert, config: alert.config })
    },
    deleteAlert: (id) => repo.deleteAlert(id),
    async firings() {
      return (await repo.listFirings()).map(toFiring)
    },
    async addFiring(firing) {
      await repo.insertFiring(firing)
    },
    subscribe(listener: (event: HeadEvent) => void) {
      let last = -1
      const timer = setInterval(() => {
        void repo.indexedRange().then((range) => {
          const block = range.latest
          if (!block || block.number === last) return
          last = block.number
          listener({ blockNumber: block.number, timestamp: block.timestamp, baseFeeWei: block.baseFeePerGas.toString(), synthetic: block.synthetic })
        })
      }, 4000)
      timer.unref?.()
      return () => clearInterval(timer)
    },
    async requestBackfill(fromSec, toSec) {
      const checkpoint = await repo.readCheckpoint()
      const meta = checkpoint.meta
      if (!meta || meta.synthetic || meta.mode === 'demo') {
        return { accepted: false, message: 'Backfill is available only while the worker is indexing mainnet.' }
      }
      const approx = Math.max(1, Math.round((toSec - fromSec) / 12))
      const next: CheckpointMeta = {
        ...meta,
        backfillRequest: { fromBlock: Math.max(0, (checkpoint.lastBlock ?? approx) - approx), toBlock: checkpoint.lastBlock ?? approx },
        warnings: [...meta.warnings, `Backfill requested for about ${approx} blocks. Cost is roughly one header and one receipt payload per block.`],
      }
      await repo.writeCheckpoint(checkpoint.lastBlock, checkpoint.lastHash, next)
      return { accepted: true, message: `Queued a backfill of about ${approx} blocks. Watch ingestion progress on the status endpoint.` }
    },
  }
}

function toAlert(row: { id: string; name: string; kind: string; config: Record<string, unknown>; enabled: boolean; cooldownSec: number; createdAt: string }): AlertRuleDto {
  return row
}

function toFiring(row: { id: string; ruleId: string; dedupeKey: string; firedAt: string; resolvedAt: string | null; payload: Record<string, unknown>; delivery: Record<string, unknown> }): AlertFiringDto {
  return row
}

export function liveLabel(address: string): string | null {
  return lookupAddress(address)?.name ?? null
}
