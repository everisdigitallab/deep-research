import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import type { AppDatabase, AppPreparedStatement, AppStatementResult } from '../../types/bindings'

export interface RuntimeDatabase extends AppDatabase {
  readonly dialect: 'sqlite' | 'postgres'
  exec(sql: string): Promise<void>
  close(): Promise<void>
}

function normalizeValue(value: unknown) {
  if (value === undefined) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  return value as string | number | bigint | Uint8Array | null
}

class SqlJsPreparedStatement implements AppPreparedStatement {
  private values: unknown[] = []

  constructor(
    private readonly db: Database,
    private readonly sql: string,
    private readonly persist: () => Promise<void>
  ) {}

  bind(...values: unknown[]) {
    this.values = values.map(normalizeValue)
    return this
  }

  async all<T = Record<string, unknown>>() {
    const stmt = this.db.prepare(this.sql)
    try {
      stmt.bind(this.values as never[])
      const results: T[] = []
      while (stmt.step()) {
        results.push(stmt.getAsObject() as T)
      }
      return { results }
    } finally {
      stmt.free()
    }
  }

  async first<T = Record<string, unknown>>() {
    const rows = await this.all<T>()
    return rows.results[0] ?? null
  }

  async run(): Promise<AppStatementResult> {
    this.db.run(this.sql, this.values as never[])
    const changes = this.db.getRowsModified()
    const rowIdResult = this.db.exec('SELECT last_insert_rowid() AS id')
    const lastRowId = rowIdResult[0]?.values?.[0]?.[0]
    await this.persist()

    return {
      success: true,
      meta: {
        changes,
        last_row_id: typeof lastRowId === 'number' ? lastRowId : undefined
      }
    }
  }
}

export class SqlJsDatabase implements RuntimeDatabase {
  readonly dialect = 'sqlite' as const

  constructor(
    private readonly db: Database,
    private readonly persist: () => Promise<void>
  ) {}

  prepare(sql: string): AppPreparedStatement {
    return new SqlJsPreparedStatement(this.db, sql, this.persist)
  }

  async exec(sql: string) {
    this.db.exec(sql)
  }

  async execAndPersist(sql: string) {
    this.db.exec(sql)
    await this.persist()
  }

  async close() {
    await this.persist()
    this.db.close()
  }
}

async function loadSqlJs() {
  const wasmPath = fileURLToPath(new URL('../../../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url))
  return initSqlJs({
    locateFile: () => wasmPath
  })
}

export async function createSqlJsDatabase(sqlitePath: string) {
  await mkdir(path.dirname(sqlitePath), { recursive: true })

  let SQL: SqlJsStatic
  try {
    SQL = await loadSqlJs()
  } catch {
    const fallbackPath = fileURLToPath(new URL('../../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url))
    SQL = await initSqlJs({
      locateFile: () => fallbackPath
    })
  }

  let fileExists = true
  let buffer: Uint8Array | undefined
  try {
    buffer = new Uint8Array(await readFile(sqlitePath))
  } catch {
    fileExists = false
  }

  const db = new SQL.Database(buffer)
  const persist = async () => {
    const data = db.export()
    await writeFile(sqlitePath, Buffer.from(data))
  }

  if (!fileExists) {
    await persist()
  }

  return {
    fileExists,
    db: new SqlJsDatabase(db, persist)
  }
}
