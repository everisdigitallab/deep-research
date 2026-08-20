import { Hono } from 'hono'
import type { AppContext } from '../types/bindings'
import { requireRole } from '../middleware/auth'
import { paginationParams } from '../lib/helpers'

const audit = new Hono<AppContext>()

audit.get('/', requireRole('master_admin', 'admin'), async (c) => {
  const { page, pageSize, offset } = paginationParams(c.req.query() as any)
  const entityType = c.req.query('entity_type')
  const userId = c.req.query('user_id')

  let sql = `SELECT * FROM audit_log WHERE 1=1`
  const binds: any[] = []
  if (entityType) {
    sql += ` AND entity_type = ?`
    binds.push(entityType)
  }
  if (userId) {
    sql += ` AND user_id = ?`
    binds.push(userId)
  }
  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`
  binds.push(pageSize, offset)

  const rows = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json({ page, page_size: pageSize, results: rows.results })
})

export default audit
