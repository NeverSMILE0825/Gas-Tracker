export interface ApiConfig {
  host: string
  port: number
  dataMode: 'memory' | 'postgres'
  databaseUrl?: string
  corsOrigins: string[]
  secret?: string
  allowInsecureMutations: boolean
  rpcUrl?: string
  demoHours: number
  demoSeed: number
  tick: boolean
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const databaseUrl = env.DATABASE_URL || undefined
  const requested = env.DATA_MODE ?? 'auto'
  const dataMode = requested === 'memory' ? 'memory' : requested === 'postgres' ? 'postgres' : databaseUrl ? 'postgres' : 'memory'
  if (dataMode === 'postgres' && !databaseUrl) {
    throw new Error('DATA_MODE=postgres requires DATABASE_URL')
  }
  return {
    host: env.API_HOST ?? '0.0.0.0',
    port: Number(env.API_PORT ?? 4000),
    dataMode,
    databaseUrl,
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((item) => item.trim()).filter(Boolean),
    secret: env.INTERNAL_API_SECRET || undefined,
    allowInsecureMutations: env.ALLOW_INSECURE_MUTATIONS === 'true',
    rpcUrl: env.ETH_RPC_HTTP_URL || undefined,
    demoHours: Number(env.DEMO_HOURS ?? 12),
    demoSeed: Number(env.DEMO_SEED ?? 1559),
    tick: env.DEMO_TICK !== '0',
  }
}
