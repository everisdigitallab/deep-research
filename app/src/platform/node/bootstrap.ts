import { mkdir, readdir, readFile } from 'node:fs/promises'
import { access, constants } from 'node:fs/promises'
import path from 'node:path'
import { nowIso } from '../../lib/crypto'
import { createSqlJsDatabase, type RuntimeDatabase } from './db'
import { createPostgresDatabase } from './postgres-db'
import { applyStaticApiTemplate } from './static-api-template'
import { FileObjectStorage } from './storage'

async function listSqlFiles(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort()
}

async function fileExists(filePath: string) {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function ensureSchemaTable(db: RuntimeDatabase) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)
}

async function applyMigrations(db: RuntimeDatabase, migrationsDir: string) {
  await ensureSchemaTable(db)
  const files = await listSqlFiles(migrationsDir)

  for (const filename of files) {
    const existing = await db.prepare('SELECT filename FROM schema_migrations WHERE filename = ?').bind(filename).first()
    if (existing) continue

    const sql = await readFile(path.join(migrationsDir, filename), 'utf8')
    await db.exec(sql)
    await db.prepare('INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)').bind(filename, nowIso()).run()
  }
}

async function tableExists(db: RuntimeDatabase, tableName: string) {
  if (db.dialect === 'sqlite') {
    const row = await db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).bind(tableName).first()
    return !!row
  }

  const row = await db.prepare(`SELECT to_regclass(?) as name`).bind(`public.${tableName}`).first<{ name: string | null }>()
  return !!row?.name
}

async function seedIfEmpty(db: RuntimeDatabase, seedFile: string) {
  const usersTable = await tableExists(db, 'users')
  if (!usersTable) return

  const usersCount = await db.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>()
  if ((usersCount?.count ?? 0) > 0) return

  const sql = await readFile(seedFile, 'utf8')
  await db.exec(sql)
}

export async function bootstrapAzureRuntime(options: {
  databaseProvider: 'sqlite' | 'postgres'
  databaseUrl?: string
  staticApiTemplateFile?: string
  sqlitePath: string
  documentsPath: string
  sqliteMigrationsDir?: string
  sqliteSeedFile?: string
  postgresMigrationsDir?: string
  postgresSeedFile?: string
  autoRunMigrations: boolean
  autoSeedOnEmptyDb: boolean
}) {
  await mkdir(options.documentsPath, { recursive: true })
  let db: RuntimeDatabase
  let shouldBootstrapDatabase = true
  let migrationsDir = options.sqliteMigrationsDir
  let seedFile = options.sqliteSeedFile

  if (options.databaseProvider === 'postgres') {
    if (!options.databaseUrl) {
      throw new Error('DATABASE_URL is required when DATABASE_PROVIDER=postgres')
    }

    if ((options.postgresMigrationsDir && !options.postgresSeedFile) || (!options.postgresMigrationsDir && options.postgresSeedFile)) {
      throw new Error('PostgreSQL migration and seed files must be configured together.')
    }

    if (options.postgresMigrationsDir && options.postgresSeedFile) {
      const postgresMigrationsExists = await fileExists(options.postgresMigrationsDir)
      const postgresSeedExists = await fileExists(options.postgresSeedFile)
      if (!postgresMigrationsExists || !postgresSeedExists) {
        throw new Error(
          'PostgreSQL portability artifacts are missing. Run `cd app && npm run db:compile:postgres` before starting the Azure runtime.'
        )
      }
    }

    const postgres = await createPostgresDatabase(options.databaseUrl)
    db = postgres.db
    migrationsDir = options.postgresMigrationsDir
    seedFile = options.postgresSeedFile
  } else {
    if ((options.sqliteMigrationsDir && !options.sqliteSeedFile) || (!options.sqliteMigrationsDir && options.sqliteSeedFile)) {
      throw new Error('SQLite migration and seed files must be configured together.')
    }

    await mkdir(path.dirname(options.sqlitePath), { recursive: true })
    const sqlite = await createSqlJsDatabase(options.sqlitePath)
    db = sqlite.db
    shouldBootstrapDatabase = options.autoRunMigrations || !sqlite.fileExists
  }

  if (shouldBootstrapDatabase && migrationsDir) {
    await applyMigrations(db, migrationsDir)
  }

  if (options.autoSeedOnEmptyDb && seedFile) {
    await seedIfEmpty(db, seedFile)
  }

  if (options.staticApiTemplateFile && (await fileExists(options.staticApiTemplateFile))) {
    await applyStaticApiTemplate(db, options.staticApiTemplateFile)
  }

  return {
    DB: db,
    R2: new FileObjectStorage(options.documentsPath)
  }
}
