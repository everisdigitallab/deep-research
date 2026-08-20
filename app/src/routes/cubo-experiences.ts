import { Hono } from 'hono'
import type { AppContext } from '../types/bindings'
import { generateUUID, nowIso } from '../lib/crypto'
import { logAudit } from '../lib/audit'
import { authGuard } from '../middleware/auth'

const cubo = new Hono<AppContext>()
cubo.use('*', authGuard)

cubo.get('/', async (c) => {
  const editionId = c.req.query('edition_id')
  const query = editionId
    ? c.env.DB.prepare(`SELECT * FROM cubo_experiences WHERE edition_id = ? AND deleted_at IS NULL ORDER BY event_date DESC`).bind(editionId)
    : c.env.DB.prepare(`SELECT * FROM cubo_experiences WHERE deleted_at IS NULL ORDER BY event_date DESC`)
  const rows = await query.all()
  return c.json(rows.results)
})

cubo.get('/:id', async (c) => {
  const id = c.req.param('id')
  const exp = await c.env.DB.prepare(`SELECT * FROM cubo_experiences WHERE id = ? AND deleted_at IS NULL`).bind(id).first<any>()
  if (!exp) return c.json({ error: 'not_found' }, 404)
  const clientsRows = await c.env.DB.prepare(
    `SELECT cl.* FROM cubo_experience_clients cec JOIN clients cl ON cl.id = cec.client_id WHERE cec.experience_id = ?`
  )
    .bind(id)
    .all()
  const challengesRows = await c.env.DB.prepare(
    `SELECT ch.* FROM cubo_experience_challenges cech JOIN challenges ch ON ch.id = cech.challenge_id WHERE cech.experience_id = ?`
  )
    .bind(id)
    .all()
  return c.json({ ...exp, clients: clientsRows.results, challenges: challengesRows.results })
})

cubo.post('/', async (c) => {
  const body = await c.req.json<any>()
  const user = c.get('user')!
  const id = generateUUID()

  await c.env.DB.prepare(
    `INSERT INTO cubo_experiences (
      id, edition_id, type, location_flag, event_date, start_time, end_time, country_id, city, location,
      client_manager_id, facilitators, participants, objective, agenda, description, pre_materials,
      created_at, created_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.edition_id,
      body.type,
      body.location_flag,
      body.event_date || null,
      body.start_time || null,
      body.end_time || null,
      body.country_id || null,
      body.city || null,
      body.location || null,
      body.client_manager_id || null,
      body.facilitators || null,
      body.participants || null,
      body.objective || null,
      body.agenda || null,
      body.description || null,
      body.pre_materials || null,
      nowIso(),
      user.id,
      nowIso()
    )
    .run()

  if (Array.isArray(body.client_ids)) {
    for (const clientId of body.client_ids) {
      await c.env.DB.prepare(`INSERT INTO cubo_experience_clients (id, experience_id, client_id) VALUES (?, ?, ?)`)
        .bind(generateUUID(), id, clientId)
        .run()
    }
  }
  if (Array.isArray(body.challenge_ids)) {
    for (const challengeId of body.challenge_ids) {
      await c.env.DB.prepare(`INSERT INTO cubo_experience_challenges (id, experience_id, challenge_id) VALUES (?, ?, ?)`)
        .bind(generateUUID(), id, challengeId)
        .run()
    }
  }

  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'create_cubo_experience', entityType: 'cubo_experience', entityId: id })
  return c.json({ id, ...body }, 201)
})

cubo.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<any>()
  const user = c.get('user')!

  const fields = [
    'report', 'action_plan_url', 'next_steps', 'presented_materials', 'post_materials',
    'mana_opportunity_number', 'mana_opportunity_link'
  ]
  const sets: string[] = []
  const values: any[] = []
  for (const f of fields) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`)
      values.push(body[f])
      if (f === 'mana_opportunity_number' || f === 'mana_opportunity_link') {
        sets.push(f === 'mana_opportunity_number' ? 'mana_registered_by = ?' : null!)
      }
    }
  }
  if (body.mana_opportunity_number || body.mana_opportunity_link) {
    if (body.mana_opportunity_link) {
      try {
        new URL(body.mana_opportunity_link)
      } catch {
        return c.json({ error: 'validation_error', message: 'mana_opportunity_link must be a valid URL' }, 400)
      }
    }
    sets.push('mana_registered_by = ?', 'mana_registered_at = ?')
    values.push(user.id, nowIso())
  }
  sets.push('updated_at = ?')
  values.push(nowIso())
  values.push(id)

  await c.env.DB.prepare(`UPDATE cubo_experiences SET ${sets.filter(Boolean).join(', ')} WHERE id = ?`).bind(...values).run()

  // If action plan was uploaded, mark related challenges as cubo_gate_done
  if (body.action_plan_url) {
    const challengesRows = await c.env.DB.prepare(
      `SELECT challenge_id FROM cubo_experience_challenges WHERE experience_id = ?`
    )
      .bind(id)
      .all<any>()
    for (const row of challengesRows.results || []) {
      await c.env.DB.prepare(
        `UPDATE challenges SET cubo_gate_completed_at = COALESCE(cubo_gate_completed_at, ?), status = CASE WHEN status = 'draft' OR status = 'cubo_gate_pending' THEN 'cubo_gate_done' ELSE status END WHERE id = ?`
      )
        .bind(nowIso(), row.challenge_id)
        .run()
    }
  }

  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_cubo_experience', entityType: 'cubo_experience', entityId: id })
  return c.json({ message: 'Cubo experience updated' })
})

cubo.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  await c.env.DB.prepare(`UPDATE cubo_experiences SET deleted_at = ? WHERE id = ?`).bind(nowIso(), id).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'soft_delete_cubo_experience', entityType: 'cubo_experience', entityId: id })
  return c.json({ message: 'Cubo experience archived' })
})

export default cubo
