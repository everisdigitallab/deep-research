import { Hono } from 'hono'
import type { AppContext } from '../types/bindings'
import { generateUUID, nowIso } from '../lib/crypto'
import { logAudit } from '../lib/audit'
import { authGuard, requireRole } from '../middleware/auth'

const catalyst = new Hono<AppContext>()
catalyst.use('*', authGuard)

catalyst.get('/', async (c) => {
  const editionId = c.req.query('edition_id')
  const query = editionId
    ? c.env.DB.prepare(`SELECT * FROM catalyst_days WHERE edition_id = ? AND deleted_at IS NULL ORDER BY event_date DESC`).bind(editionId)
    : c.env.DB.prepare(`SELECT * FROM catalyst_days WHERE deleted_at IS NULL ORDER BY event_date DESC`)
  const rows = await query.all()
  return c.json(rows.results)
})

catalyst.get('/:id', async (c) => {
  const id = c.req.param('id')
  const day = await c.env.DB.prepare(`SELECT * FROM catalyst_days WHERE id = ? AND deleted_at IS NULL`).bind(id).first<any>()
  if (!day) return c.json({ error: 'not_found' }, 404)
  const moonshotsRows = await c.env.DB.prepare(
    `SELECT m.*, cdm.id as link_id, cdm.presentation_order FROM catalyst_day_moonshots cdm JOIN moonshots m ON m.id = cdm.moonshot_id WHERE cdm.catalyst_day_id = ? ORDER BY cdm.presentation_order`
  )
    .bind(id)
    .all()
  const recognitions = await c.env.DB.prepare(`SELECT * FROM recognitions WHERE catalyst_day_id = ?`).bind(id).all()
  return c.json({ ...day, moonshots: moonshotsRows.results, recognitions: recognitions.results })
})

catalyst.post('/', requireRole('master_admin', 'admin'), async (c) => {
  const body = await c.req.json<any>()
  const user = c.get('user')!
  const id = generateUUID()
  await c.env.DB.prepare(
    `INSERT INTO catalyst_days (id, edition_id, name, event_date, start_time, location, capacity, description, agenda, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, body.edition_id, body.name, body.event_date || null, body.start_time || null, body.location || null, body.capacity || null, body.description || null, body.agenda || null, nowIso(), user.id)
    .run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'create_catalyst_day', entityType: 'catalyst_day', entityId: id })
  return c.json({ id, ...body }, 201)
})

catalyst.put('/:id', requireRole('master_admin', 'admin'), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<any>()
  const user = c.get('user')!
  const fields = ['name', 'event_date', 'start_time', 'location', 'capacity', 'description', 'agenda']
  const sets: string[] = []
  const values: any[] = []
  for (const f of fields) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`)
      values.push(body[f])
    }
  }
  if (sets.length === 0) return c.json({ error: 'validation_error', message: 'No fields to update' }, 400)
  values.push(id)
  await c.env.DB.prepare(`UPDATE catalyst_days SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_catalyst_day', entityType: 'catalyst_day', entityId: id })
  return c.json({ message: 'Catalyst Day updated' })
})

catalyst.delete('/:id', requireRole('master_admin', 'admin'), async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  await c.env.DB.prepare(`UPDATE catalyst_days SET deleted_at = ? WHERE id = ?`).bind(nowIso(), id).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'soft_delete_catalyst_day', entityType: 'catalyst_day', entityId: id })
  return c.json({ message: 'Catalyst Day archived' })
})

catalyst.post('/:id/moonshots', requireRole('master_admin', 'admin'), async (c) => {
  const catalystDayId = c.req.param('id')
  const body = await c.req.json<{ moonshot_id: string; presentation_order?: number }>()
  const id = generateUUID()
  await c.env.DB.prepare(`INSERT INTO catalyst_day_moonshots (id, catalyst_day_id, moonshot_id, presentation_order) VALUES (?, ?, ?, ?)`)
    .bind(id, catalystDayId, body.moonshot_id, body.presentation_order || 0)
    .run()
  return c.json({ id, ...body }, 201)
})

catalyst.delete('/:id/moonshots/:linkId', requireRole('master_admin', 'admin'), async (c) => {
  const linkId = c.req.param('linkId')
  await c.env.DB.prepare(`DELETE FROM catalyst_day_moonshots WHERE id = ?`).bind(linkId).run()
  return c.json({ message: 'Moonshot removed from Catalyst Day' })
})

catalyst.post('/:id/recognitions', requireRole('master_admin', 'admin'), async (c) => {
  const catalystDayId = c.req.param('id')
  const body = await c.req.json<any>()
  const id = generateUUID()
  await c.env.DB.prepare(
    `INSERT INTO recognitions (id, catalyst_day_id, entity_type, entity_id, entity_name, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, catalystDayId, body.entity_type, body.entity_id, body.entity_name || null, body.reason || null, nowIso())
    .run()
  return c.json({ id, ...body }, 201)
})

catalyst.delete('/:id/recognitions/:recognitionId', requireRole('master_admin', 'admin'), async (c) => {
  const recognitionId = c.req.param('recognitionId')
  await c.env.DB.prepare(`DELETE FROM recognitions WHERE id = ?`).bind(recognitionId).run()
  return c.json({ message: 'Recognition deleted' })
})

export default catalyst
