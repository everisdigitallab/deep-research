import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { RuntimeDatabase } from './db'

type StaticApiTemplate = {
  name: string
  tables?: Array<{
    name: string
    description?: string
  }>
  seedRecords?: Record<string, Array<Record<string, unknown>>>
}

async function ensureTemplateTables(db: RuntimeDatabase) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS static_api_records (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_static_api_records_table_name
    ON static_api_records (table_name)
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS static_api_table_definitions (
      table_name TEXT PRIMARY KEY,
      template_name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
}

export async function applyStaticApiTemplate(db: RuntimeDatabase, templateFile: string) {
  const raw = await readFile(templateFile, 'utf8')
  const template = JSON.parse(raw) as StaticApiTemplate
  await ensureTemplateTables(db)

  const now = new Date().toISOString()

  for (const table of template.tables || []) {
    const existing = await db
      .prepare('SELECT table_name FROM static_api_table_definitions WHERE table_name = ?')
      .bind(table.name)
      .first()

    if (existing) continue

    await db
      .prepare(
        `INSERT INTO static_api_table_definitions (table_name, template_name, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(table.name, template.name, table.description || null, now, now)
      .run()
  }

  for (const [tableName, rows] of Object.entries(template.seedRecords || {})) {
    const countRow = await db
      .prepare('SELECT COUNT(*) as count FROM static_api_records WHERE table_name = ?')
      .bind(tableName)
      .first<{ count: number | string }>()

    const count = Number(countRow?.count || 0)
    if (count > 0) continue

    for (const row of rows) {
      const recordId = typeof row.id === 'string' && row.id ? row.id : randomUUID()
      const createdAt = typeof row.created_at === 'string' && row.created_at ? row.created_at : now
      const updatedAt = typeof row.updated_at === 'string' && row.updated_at ? row.updated_at : now
      const record = {
        ...row,
        id: recordId,
        created_at: createdAt,
        updated_at: updatedAt
      }

      await db
        .prepare(
          `INSERT INTO static_api_records (id, table_name, data, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(recordId, tableName, JSON.stringify(record), createdAt, updatedAt)
        .run()
    }
  }
}
