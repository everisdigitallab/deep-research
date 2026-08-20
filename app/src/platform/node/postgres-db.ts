import { Pool, type QueryResultRow } from 'pg'
import type { AppPreparedStatement, AppStatementResult } from '../../types/bindings'
import type { RuntimeDatabase } from './db'

function normalizeValue(value: unknown) {
  if (value === undefined) return null
  if (typeof value === 'boolean') return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  return value
}

function sqlitePlaceholdersToPostgres(sql: string) {
  let output = ''
  let index = 1
  let quote: '\'' | '"' | null = null

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i]
    const next = sql[i + 1]

    if (!quote && (char === '\'' || char === '"')) {
      quote = char
      output += char
      continue
    }

    if (quote === char) {
      output += char
      if (next === char) {
        output += next
        i += 1
      } else {
        quote = null
      }
      continue
    }

    if (!quote && char === '?') {
      output += `$${index}`
      index += 1
      continue
    }

    output += char
  }

  return output
}

class PostgresPreparedStatement implements AppPreparedStatement {
  private values: unknown[] = []

  constructor(
    private readonly pool: Pool,
    private readonly sql: string
  ) {}

  bind(...values: unknown[]) {
    this.values = values.map(normalizeValue)
    return this
  }

  async all<T = Record<string, unknown>>() {
    const query = sqlitePlaceholdersToPostgres(this.sql)
    const result = await this.pool.query<T & QueryResultRow>(query, this.values as never[])
    return { results: result.rows }
  }

  async first<T = Record<string, unknown>>() {
    const rows = await this.all<T>()
    return rows.results[0] ?? null
  }

  async run(): Promise<AppStatementResult> {
    const query = sqlitePlaceholdersToPostgres(this.sql)
    const result = await this.pool.query(query, this.values as never[])
    return {
      success: true,
      meta: {
        changes: result.rowCount ?? 0
      }
    }
  }
}

export class PostgresDatabase implements RuntimeDatabase {
  readonly dialect = 'postgres' as const

  constructor(private readonly pool: Pool) {}

  prepare(sql: string): AppPreparedStatement {
    return new PostgresPreparedStatement(this.pool, sql)
  }

  async exec(sql: string) {
    await this.pool.query(sql)
  }

  async close() {
    await this.pool.end()
  }
}

export async function createPostgresDatabase(databaseUrl: string) {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
  })

  await pool.query('SELECT 1')

  return {
    db: new PostgresDatabase(pool)
  }
}
