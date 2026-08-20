export type AppRuntime = 'cloudflare' | 'azure-container' | 'azure-container-apps' | 'azure-vm'
export type AppEnvironment = 'local' | 'dev' | 'staging' | 'production'
export type DatabaseProvider = 'sqlite' | 'postgres'
export type AppMode = 'static-web' | 'static-web-with-api' | 'app-runtime'

export interface AppEnv {
  appName: string
  appEnv: AppEnvironment
  appRuntime: AppRuntime
  appMode: AppMode
  databaseProvider: DatabaseProvider
  databaseUrl?: string
  postgresHost?: string
  postgresPort?: number
  postgresDatabase?: string
  postgresUser?: string
  postgresSslMode?: string
  appBaseUrl: string
  apiBasePath: string
  dbBinding: string
  bucketBinding: string
  aiEnabled: boolean
  azureDataMountPath: string
  sqlitePath: string
  documentsPath: string
  autoRunMigrations: boolean
  autoSeedOnEmptyDb: boolean
  staticSiteRoot?: string
  staticApiTemplate?: string
}

function readEnv(name: string): string | undefined {
  if (typeof globalThis.process !== 'undefined' && globalThis.process?.env?.[name]) {
    return globalThis.process.env[name]
  }

  if (typeof globalThis !== 'undefined' && name in globalThis) {
    const value = (globalThis as Record<string, unknown>)[name]
    return typeof value === 'string' ? value : undefined
  }

  return undefined
}

function requireEnv(name: string, fallback?: string): string {
  const value = readEnv(name) ?? fallback
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value == null) return fallback
  return value === '1' || value.toLowerCase() === 'true'
}

function parseEnvironment(value: string): AppEnvironment {
  if (value === 'local' || value === 'dev' || value === 'staging' || value === 'production') {
    return value
  }
  throw new Error(`Invalid APP_ENV value: ${value}`)
}

function parseRuntime(value: string): AppRuntime {
  if (value === 'cloudflare' || value === 'azure-container' || value === 'azure-container-apps' || value === 'azure-vm') {
    return value
  }
  throw new Error(`Invalid APP_RUNTIME value: ${value}`)
}

function parseDatabaseProvider(value: string): DatabaseProvider {
  if (value === 'sqlite' || value === 'postgres') {
    return value
  }
  throw new Error(`Invalid DATABASE_PROVIDER value: ${value}`)
}

function parseAppMode(value: string): AppMode {
  if (value === 'static-web' || value === 'static-web-with-api' || value === 'app-runtime') {
    return value
  }
  throw new Error(`Invalid APP_MODE value: ${value}`)
}

export function loadAppEnv(): AppEnv {
  const azureDataMountPath = requireEnv('AZURE_DATA_MOUNT_PATH', '/mnt/app-data')
  const appMode = parseAppMode(requireEnv('APP_MODE', 'app-runtime'))
  const databaseProvider = parseDatabaseProvider(requireEnv('DATABASE_PROVIDER', 'sqlite'))
  const postgresPort = readEnv('POSTGRES_PORT')

  return {
    appName: requireEnv('APP_NAME', 'app'),
    appEnv: parseEnvironment(requireEnv('APP_ENV', 'local')),
    appRuntime: parseRuntime(requireEnv('APP_RUNTIME', 'cloudflare')),
    appMode,
    databaseProvider,
    databaseUrl: readEnv('DATABASE_URL'),
    postgresHost: readEnv('POSTGRES_HOST'),
    postgresPort: postgresPort ? Number(postgresPort) : undefined,
    postgresDatabase: readEnv('POSTGRES_DATABASE'),
    postgresUser: readEnv('POSTGRES_USER'),
    postgresSslMode: readEnv('POSTGRES_SSLMODE'),
    appBaseUrl: requireEnv('APP_BASE_URL', 'http://localhost:3000'),
    apiBasePath: requireEnv('API_BASE_PATH', '/api'),
    dbBinding: requireEnv('DB_BINDING', 'DB'),
    bucketBinding: requireEnv('BUCKET_BINDING', 'R2'),
    aiEnabled: parseBoolean(readEnv('AI_ENABLED'), false),
    azureDataMountPath,
    sqlitePath: requireEnv('SQLITE_PATH', `${azureDataMountPath}/database/app.sqlite`),
    documentsPath: requireEnv('DOCUMENTS_PATH', `${azureDataMountPath}/documents`),
    autoRunMigrations: parseBoolean(readEnv('AUTO_RUN_MIGRATIONS'), true),
    autoSeedOnEmptyDb: parseBoolean(readEnv('AUTO_SEED_ON_EMPTY_DB'), false),
    staticSiteRoot: readEnv('STATIC_SITE_ROOT'),
    staticApiTemplate: readEnv('STATIC_API_TEMPLATE')
  }
}
