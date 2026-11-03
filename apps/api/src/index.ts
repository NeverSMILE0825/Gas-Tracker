import { loadRootEnv } from '@gasscope/db'
import { loadConfig } from './config'

loadRootEnv()
import { createMemoryData } from './memory'
import { openPostgres } from './pg-data'
import { buildServer } from './server'

const config = loadConfig()
const data = config.dataMode === 'postgres' && config.databaseUrl
  ? await openPostgres(config.databaseUrl)
  : createMemoryData({ hours: config.demoHours, seed: config.demoSeed, tick: config.tick })
const app = await buildServer(config, data)
await app.listen({ host: config.host, port: config.port })
console.log(`GasScope API listening on http://${config.host}:${config.port} (${config.dataMode})`)
