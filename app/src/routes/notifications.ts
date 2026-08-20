import { Hono } from 'hono'
import type { AppContext, AppDatabase } from '../types/bindings'
import { generateUUID, nowIso } from '../lib/crypto'
import { authGuard } from '../middleware/auth'

const notifications = new Hono<AppContext>()
notifications.use('*', authGuard)

notifications.get('/', async (c) => {
  const user = c.get('user')!
  const unreadOnly = c.req.query('unread_only') === 'true'
  const type = c.req.query('type')
  let sql = `SELECT * FROM notifications WHERE user_id = ?`
  const binds: any[] = [user.id]
  if (unreadOnly) sql += ` AND read_at IS NULL`
  if (type) {
    sql += ` AND type = ?`
    binds.push(type)
  }
  sql += ` ORDER BY created_at DESC LIMIT 100`
  const rows = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json(rows.results)
})

notifications.post('/:id/read', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  await c.env.DB.prepare(`UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?`).bind(nowIso(), id, user.id).run()
  return c.json({ message: 'Marked as read' })
})

notifications.post('/read-all', async (c) => {
  const user = c.get('user')!
  await c.env.DB.prepare(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL`).bind(nowIso(), user.id).run()
  return c.json({ message: 'All marked as read' })
})

// Internal helper endpoint used by other modules to create notifications
export async function createNotification(
  db: AppDatabase,
  params: { userId: string; type: string; title: string; body?: string; entityType?: string; entityId?: string }
) {
  const id = generateUUID()
  await db
    .prepare(
      `INSERT INTO notifications (id, user_id, type, title, body, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, params.userId, params.type, params.title, params.body || null, params.entityType || null, params.entityId || null, nowIso())
    .run()
  return id
}

export default notifications
