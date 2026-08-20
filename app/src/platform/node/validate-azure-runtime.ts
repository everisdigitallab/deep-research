import path from 'node:path'
import { loadAppEnv } from '../../config/env'
import { bootstrapAzureRuntime } from './bootstrap'

async function main() {
  const env = loadAppEnv()

  if (env.databaseProvider !== 'postgres') {
    throw new Error(
      `Azure runtime validation expects DATABASE_PROVIDER=postgres, received ${env.databaseProvider}`
    )
  }

  const bindings = await bootstrapAzureRuntime({
    databaseProvider: env.databaseProvider,
    databaseUrl: env.databaseUrl,
    sqlitePath: env.sqlitePath,
    documentsPath: env.documentsPath,
    sqliteMigrationsDir: path.resolve('migrations'),
    sqliteSeedFile: path.resolve('seed.sql'),
    postgresMigrationsDir: path.resolve('generated/postgres/migrations'),
    postgresSeedFile: path.resolve('generated/postgres/seed.sql'),
    autoRunMigrations: env.autoRunMigrations,
    autoSeedOnEmptyDb: env.autoSeedOnEmptyDb
  })

  try {
    await bindings.DB.prepare('SELECT 1 as ok').first()
    console.log(
      `Validated Azure runtime bootstrap with ${env.databaseProvider} (${env.appRuntime}, env=${env.appEnv})`
    )
  } finally {
    await bindings.DB.close()
  }
}

main().catch((error) => {
  console.error('Azure runtime validation failed', error)
  process.exit(1)
})
