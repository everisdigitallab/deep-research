import { Hono } from 'hono'
import type { AppContext } from '../types/bindings'

type StoredRecord = Record<string, unknown> & {
  id: string
  created_at: string
  updated_at: string
}

const router = new Hono<AppContext>()
let ensureStoragePromise: Promise<void> | null = null

function getDb(c: { env: AppContext['Bindings'] }) {
  return c.env.DB
}

function isValidTableName(tableName: string) {
  return /^[a-zA-Z0-9_]+$/.test(tableName)
}

async function ensureStorage(c: { env: AppContext['Bindings'] }) {
  if (!ensureStoragePromise) {
    ensureStoragePromise = (async () => {
      await getDb(c)
        .prepare(
          `CREATE TABLE IF NOT EXISTS static_api_records (
            id TEXT PRIMARY KEY,
            table_name TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )`
        )
        .run()

      await getDb(c)
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_static_api_records_table_name
           ON static_api_records (table_name)`
        )
        .run()
    })().catch((error) => {
      ensureStoragePromise = null
      throw error
    })
  }

  await ensureStoragePromise
}

function parseJsonRecord(row: {
  id: string
  data: string
  created_at: string
  updated_at: string
}): StoredRecord {
  const parsed = JSON.parse(row.data) as Record<string, unknown>
  return {
    ...parsed,
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at
  }
}

function compareValues(a: unknown, b: unknown) {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1

  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }

  const aString = String(a).toLowerCase()
  const bString = String(b).toLowerCase()
  return aString.localeCompare(bString, 'pt-BR', { numeric: true })
}

function sortRecords(records: StoredRecord[], sortField: string | null) {
  if (!sortField) return records

  return [...records].sort((a, b) => compareValues(a[sortField], b[sortField]))
}

function parsePagination(url: URL) {
  const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get('limit') || '50')))
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'))
  const offset = (page - 1) * limit
  return { limit, page, offset }
}

router.get('/:tableName', async (c) => {
  const tableName = c.req.param('tableName')
  if (!isValidTableName(tableName)) {
    return c.json({ error: 'Invalid table name' }, 400)
  }

  await ensureStorage(c)
  const url = new URL(c.req.url)
  const { limit, page, offset } = parsePagination(url)
  const sortField = url.searchParams.get('sort')

  const totalRow = await getDb(c)
    .prepare('SELECT COUNT(*) as count FROM static_api_records WHERE table_name = ?')
    .bind(tableName)
    .first<{ count: number | string }>()

  const total = Number(totalRow?.count || 0)

  if (sortField) {
    const allRows = await getDb(c)
      .prepare(
        'SELECT id, data, created_at, updated_at FROM static_api_records WHERE table_name = ? ORDER BY created_at DESC, id DESC'
      )
      .bind(tableName)
      .all<{ id: string; data: string; created_at: string; updated_at: string }>()

    const records = sortRecords(allRows.results.map(parseJsonRecord), sortField)
    const paged = records.slice(offset, offset + limit)

    return c.json({ data: paged, total, page, limit })
  }

  const rows = await getDb(c)
    .prepare(
      `SELECT id, data, created_at, updated_at
       FROM static_api_records
       WHERE table_name = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`
    )
    .bind(tableName, limit, offset)
    .all<{ id: string; data: string; created_at: string; updated_at: string }>()

  return c.json({
    data: rows.results.map(parseJsonRecord),
    total,
    page,
    limit
  })
})

router.get('/:tableName/:id', async (c) => {
  const { tableName, id } = c.req.param()
  if (!isValidTableName(tableName)) {
    return c.json({ error: 'Invalid table name' }, 400)
  }

  await ensureStorage(c)
  const row = await getDb(c)
    .prepare(
      'SELECT id, data, created_at, updated_at FROM static_api_records WHERE table_name = ? AND id = ?'
    )
    .bind(tableName, id)
    .first<{ id: string; data: string; created_at: string; updated_at: string }>()

  if (!row) {
    return c.json({ error: 'Record not found' }, 404)
  }

  return c.json(parseJsonRecord(row))
})

router.post('/:tableName', async (c) => {
  const tableName = c.req.param('tableName')
  if (!isValidTableName(tableName)) {
    return c.json({ error: 'Invalid table name' }, 400)
  }

  await ensureStorage(c)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || Array.isArray(body)) {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const now = new Date().toISOString()
  const id = typeof body.id === 'string' && body.id ? body.id : crypto.randomUUID()
  const record: StoredRecord = {
    ...body,
    id,
    created_at: typeof body.created_at === 'string' && body.created_at ? body.created_at : now,
    updated_at: now
  }

  try {
    await getDb(c)
      .prepare(
        `INSERT INTO static_api_records (id, table_name, data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(id, tableName, JSON.stringify(record), record.created_at, record.updated_at)
      .run()
  } catch {
    return c.json({ error: 'Failed to create record' }, 409)
  }

  return c.json(record, 201)
})

router.patch('/:tableName/:id', async (c) => {
  const { tableName, id } = c.req.param()
  if (!isValidTableName(tableName)) {
    return c.json({ error: 'Invalid table name' }, 400)
  }

  await ensureStorage(c)
  const existing = await getDb(c)
    .prepare(
      'SELECT id, data, created_at, updated_at FROM static_api_records WHERE table_name = ? AND id = ?'
    )
    .bind(tableName, id)
    .first<{ id: string; data: string; created_at: string; updated_at: string }>()

  if (!existing) {
    return c.json({ error: 'Record not found' }, 404)
  }

  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || Array.isArray(body)) {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const existingRecord = parseJsonRecord(existing)
  const updatedRecord: StoredRecord = {
    ...existingRecord,
    ...body,
    id,
    created_at: existingRecord.created_at,
    updated_at: new Date().toISOString()
  }

  await getDb(c)
    .prepare(
      `UPDATE static_api_records
       SET data = ?, updated_at = ?
       WHERE table_name = ? AND id = ?`
    )
    .bind(JSON.stringify(updatedRecord), updatedRecord.updated_at, tableName, id)
    .run()

  return c.json(updatedRecord)
})

router.put('/:tableName/:id', async (c) => {
  const { tableName, id } = c.req.param()
  if (!isValidTableName(tableName)) {
    return c.json({ error: 'Invalid table name' }, 400)
  }

  await ensureStorage(c)
  const existing = await getDb(c)
    .prepare(
      'SELECT id, data, created_at, updated_at FROM static_api_records WHERE table_name = ? AND id = ?'
    )
    .bind(tableName, id)
    .first<{ id: string; data: string; created_at: string; updated_at: string }>()

  if (!existing) {
    return c.json({ error: 'Record not found' }, 404)
  }

  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || Array.isArray(body)) {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const updatedRecord: StoredRecord = {
    ...body,
    id,
    created_at: existing.created_at,
    updated_at: new Date().toISOString()
  }

  await getDb(c)
    .prepare(
      `UPDATE static_api_records
       SET data = ?, updated_at = ?
       WHERE table_name = ? AND id = ?`
    )
    .bind(JSON.stringify(updatedRecord), updatedRecord.updated_at, tableName, id)
    .run()

  return c.json(updatedRecord)
})

router.delete('/:tableName/:id', async (c) => {
  const { tableName, id } = c.req.param()
  if (!isValidTableName(tableName)) {
    return c.json({ error: 'Invalid table name' }, 400)
  }

  await ensureStorage(c)
  await getDb(c)
    .prepare('DELETE FROM static_api_records WHERE table_name = ? AND id = ?')
    .bind(tableName, id)
    .run()

  return c.json({ success: true })
})

export default router
