import { Hono } from 'hono'
import type { AppContext } from '../types/bindings'
import { generateUUID, nowIso } from '../lib/crypto'
import { logAudit } from '../lib/audit'
import { requireRole } from '../middleware/auth'
import { hasMasterclassGate, isPrivileged } from '../lib/helpers'

const editions = new Hono<AppContext>()

editions.get('/', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM editions WHERE deleted_at IS NULL ORDER BY created_at DESC`).all()
  return c.json(rows.results)
})

editions.get('/:id', async (c) => {
  const id = c.req.param('id')
  const edition = await c.env.DB.prepare(`SELECT * FROM editions WHERE id = ? AND deleted_at IS NULL`).bind(id).first()
  if (!edition) return c.json({ error: 'not_found' }, 404)
  const countries = await c.env.DB.prepare(
    `SELECT co.* FROM edition_countries ec JOIN countries co ON co.id = ec.country_id WHERE ec.edition_id = ?`
  )
    .bind(id)
    .all()
  return c.json({ ...edition, countries: countries.results })
})

editions.post('/', requireRole('master_admin', 'admin'), async (c) => {
  const body = await c.req.json<any>()
  const user = c.get('user')!
  const id = generateUUID()
  await c.env.DB.prepare(
    `INSERT INTO editions (id, name, code, description, base_currency_code, status, start_date, end_date,
      masterclass_start, masterclass_end, challenge_open_start, challenge_open_end, execution_start, execution_end,
      catalyst_day_date, irl_min_score, created_at, created_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.name,
      body.code,
      body.description || null,
      body.base_currency_code || 'EUR',
      body.status || 'draft',
      body.start_date || null,
      body.end_date || null,
      body.masterclass_start || null,
      body.masterclass_end || null,
      body.challenge_open_start || null,
      body.challenge_open_end || null,
      body.execution_start || null,
      body.execution_end || null,
      body.catalyst_day_date || null,
      body.irl_min_score ?? 6,
      nowIso(),
      user.id,
      nowIso()
    )
    .run()

  if (Array.isArray(body.country_ids)) {
    for (const cid of body.country_ids) {
      await c.env.DB.prepare(`INSERT INTO edition_countries (id, edition_id, country_id) VALUES (?, ?, ?)`)
        .bind(generateUUID(), id, cid)
        .run()
    }
  }

  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'create_edition', entityType: 'edition', entityId: id })
  return c.json({ id, ...body }, 201)
})

editions.put('/:id', requireRole('master_admin', 'admin'), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<any>()
  const user = c.get('user')!

  const current = await c.env.DB.prepare(`SELECT status FROM editions WHERE id = ?`).bind(id).first<any>()
  if (current?.status === 'closed' || current?.status === 'archived') {
    return c.json({ error: 'read_only', message: 'Closed/archived editions are read-only. Master Admin must reopen first.' }, 423)
  }

  const fields = [
    'name', 'description', 'base_currency_code', 'status', 'start_date', 'end_date',
    'masterclass_start', 'masterclass_end', 'challenge_open_start', 'challenge_open_end',
    'execution_start', 'execution_end', 'catalyst_day_date', 'irl_min_score'
  ]
  const sets: string[] = []
  const values: any[] = []
  for (const f of fields) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`)
      values.push(body[f])
    }
  }
  sets.push('updated_at = ?')
  values.push(nowIso())
  values.push(id)

  await c.env.DB.prepare(`UPDATE editions SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_edition', entityType: 'edition', entityId: id, details: body })
  return c.json({ message: 'Edition updated' })
})

// Reopen a closed edition (Master Admin only, requires justification)
editions.post('/:id/reopen', requireRole('master_admin'), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ justification: string }>()
  const user = c.get('user')!
  if (!body.justification) {
    return c.json({ error: 'validation_error', message: 'Justification is required to reopen an edition' }, 400)
  }
  await c.env.DB.prepare(
    `UPDATE editions SET status = 'in_execution', reopened_at = ?, reopened_by = ?, reopen_justification = ?, updated_at = ? WHERE id = ?`
  )
    .bind(nowIso(), user.id, body.justification, nowIso(), id)
    .run()
  await logAudit(c.env.DB, {
    userId: user.id,
    userName: user.name,
    action: 'reopen_edition',
    entityType: 'edition',
    entityId: id,
    details: { justification: body.justification }
  })
  return c.json({ message: 'Edition reopened' })
})

// Duplicate an edition (copies masterclass structure, weights, config)
editions.post('/:id/duplicate', requireRole('master_admin', 'admin'), async (c) => {
  const sourceId = c.req.param('id')
  const body = await c.req.json<{ name: string; code: string }>()
  const user = c.get('user')!

  const source = await c.env.DB.prepare(`SELECT * FROM editions WHERE id = ?`).bind(sourceId).first<any>()
  if (!source) return c.json({ error: 'not_found' }, 404)

  const newId = generateUUID()
  await c.env.DB.prepare(
    `INSERT INTO editions (id, name, code, description, base_currency_code, status, irl_min_score, created_at, created_by, updated_at)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`
  )
    .bind(newId, body.name, body.code, source.description, source.base_currency_code, source.irl_min_score, nowIso(), user.id, nowIso())
    .run()

  // Copy masterclass modules + contents
  const modules = await c.env.DB.prepare(`SELECT * FROM masterclass_modules WHERE edition_id = ?`).bind(sourceId).all<any>()
  for (const mod of modules.results || []) {
    const newModId = generateUUID()
    await c.env.DB.prepare(
      `INSERT INTO masterclass_modules (id, edition_id, code, title, description, order_index, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(newModId, newId, mod.code, mod.title, mod.description, mod.order_index, nowIso())
      .run()
    const contents = await c.env.DB.prepare(`SELECT * FROM masterclass_contents WHERE module_id = ?`).bind(mod.id).all<any>()
    for (const content of contents.results || []) {
      await c.env.DB.prepare(
        `INSERT INTO masterclass_contents (id, module_id, type, title, description, content_url, text_body, is_required, duration_seconds, order_index, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          generateUUID(),
          newModId,
          content.type,
          content.title,
          content.description,
          content.content_url,
          content.text_body,
          content.is_required,
          content.duration_seconds,
          content.order_index,
          nowIso()
        )
        .run()
    }
  }

  await logAudit(c.env.DB, {
    userId: user.id,
    userName: user.name,
    action: 'duplicate_edition',
    entityType: 'edition',
    entityId: newId,
    details: { source_edition_id: sourceId }
  })

  return c.json({ id: newId, message: 'Edition duplicated (masterclass structure copied)' }, 201)
})

// Masterclass gate status for current user in an edition
editions.get('/:id/masterclass-gate', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')
  if (!user) return c.json({ error: 'unauthenticated' }, 401)
  const passed = await hasMasterclassGate(c.env.DB, user, id)
  return c.json({ edition_id: id, gate_passed: passed, exempt: isPrivileged(user) || user.role === 'legal' })
})

export default editions
