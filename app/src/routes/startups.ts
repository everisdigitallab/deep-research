import { Hono } from 'hono'
import type { AppContext, AppDatabase } from '../types/bindings'
import { generateUUID, nowIso } from '../lib/crypto'
import { logAudit } from '../lib/audit'
import { authGuard, requireRole } from '../middleware/auth'

const startups = new Hono<AppContext>()
startups.use('*', authGuard)

startups.get('/', async (c) => {
  const hubId = c.req.query('hub_id')
  const query = hubId
    ? c.env.DB.prepare(`SELECT * FROM startups WHERE hub_id = ? AND deleted_at IS NULL ORDER BY name`).bind(hubId)
    : c.env.DB.prepare(`SELECT * FROM startups WHERE deleted_at IS NULL ORDER BY name`)
  const rows = await query.all()
  return c.json(rows.results)
})

startups.get('/:id', async (c) => {
  const id = c.req.param('id')
  const startup = await c.env.DB.prepare(`SELECT * FROM startups WHERE id = ? AND deleted_at IS NULL`).bind(id).first<any>()
  if (!startup) return c.json({ error: 'not_found' }, 404)
  const contacts = await c.env.DB.prepare(`SELECT * FROM startup_contacts WHERE startup_id = ?`).bind(id).all()
  const technologies = await c.env.DB.prepare(
    `SELECT t.* FROM startup_technologies st JOIN technologies t ON t.id = st.technology_id WHERE st.startup_id = ?`
  )
    .bind(id)
    .all()
  const irl = await computeIrl(c.env.DB, id)
  return c.json({ ...startup, contacts: contacts.results, technologies: technologies.results, irl })
})

startups.post('/', async (c) => {
  const body = await c.req.json<any>()
  const user = c.get('user')!

  if (!body.hub_id && !body.hub_exception) {
    return c.json({ error: 'validation_error', message: 'hub_id is required unless hub_exception is authorized' }, 400)
  }
  if (body.hub_exception && user.role !== 'admin' && user.role !== 'master_admin') {
    return c.json({ error: 'forbidden', message: 'Only Admin can authorize a hub exception' }, 403)
  }
  if (body.hub_exception && !body.hub_exception_justification) {
    return c.json({ error: 'validation_error', message: 'hub_exception_justification is required' }, 400)
  }

  const id = generateUUID()
  await c.env.DB.prepare(
    `INSERT INTO startups (
      id, name, hub_id, hub_exception, hub_exception_justification, country_id, website, sector_id, stage,
      financial_health, ip_notes, price_range_min, price_range_max, price_range_currency, logo_url, status,
      confidentiality, observations, created_at, created_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.name,
      body.hub_id || null,
      body.hub_exception ? 1 : 0,
      body.hub_exception_justification || null,
      body.country_id || null,
      body.website || null,
      body.sector_id || null,
      body.stage || null,
      body.financial_health || null,
      body.ip_notes || null,
      body.price_range_min || null,
      body.price_range_max || null,
      body.price_range_currency || 'EUR',
      body.logo_url || null,
      body.status || 'active',
      body.confidentiality || 'internal',
      body.observations || null,
      nowIso(),
      user.id,
      nowIso()
    )
    .run()

  if (Array.isArray(body.technology_ids)) {
    for (const techId of body.technology_ids) {
      await c.env.DB.prepare(`INSERT INTO startup_technologies (id, startup_id, technology_id) VALUES (?, ?, ?)`)
        .bind(generateUUID(), id, techId)
        .run()
    }
  }

  if (body.hub_exception) {
    await logAudit(c.env.DB, {
      userId: user.id,
      userName: user.name,
      action: 'authorize_hub_exception',
      entityType: 'startup',
      entityId: id,
      details: { justification: body.hub_exception_justification }
    })
  }
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'create_startup', entityType: 'startup', entityId: id })
  return c.json({ id, ...body }, 201)
})

startups.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<any>()
  const user = c.get('user')!
  const fields = [
    'name', 'website', 'sector_id', 'stage', 'financial_health', 'ip_notes',
    'price_range_min', 'price_range_max', 'price_range_currency', 'logo_url', 'status', 'observations'
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
  await c.env.DB.prepare(`UPDATE startups SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_startup', entityType: 'startup', entityId: id })
  return c.json({ message: 'Startup updated' })
})

startups.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  await c.env.DB.prepare(`UPDATE startups SET deleted_at = ? WHERE id = ?`).bind(nowIso(), id).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'soft_delete_startup', entityType: 'startup', entityId: id })
  return c.json({ message: 'Startup archived' })
})

// ---------- Contacts ----------
startups.get('/:id/contacts', async (c) => {
  const startupId = c.req.param('id')
  const rows = await c.env.DB.prepare(`SELECT * FROM startup_contacts WHERE startup_id = ? ORDER BY name`).bind(startupId).all()
  return c.json(rows.results)
})

startups.post('/:id/contacts', async (c) => {
  const startupId = c.req.param('id')
  const body = await c.req.json<any>()
  const id = generateUUID()
  await c.env.DB.prepare(`INSERT INTO startup_contacts (id, startup_id, name, role, email, phone) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, startupId, body.name, body.role || null, body.email || null, body.phone || null)
    .run()
  return c.json({ id, ...body }, 201)
})

startups.put('/contacts/:contactId', async (c) => {
  const contactId = c.req.param('contactId')
  const body = await c.req.json<any>()
  await c.env.DB.prepare(`UPDATE startup_contacts SET name=?, role=?, email=?, phone=? WHERE id=?`)
    .bind(body.name, body.role || null, body.email || null, body.phone || null, contactId)
    .run()
  return c.json({ message: 'Contact updated' })
})

startups.delete('/contacts/:contactId', async (c) => {
  const contactId = c.req.param('contactId')
  await c.env.DB.prepare(`DELETE FROM startup_contacts WHERE id = ?`).bind(contactId).run()
  return c.json({ message: 'Contact deleted' })
})

// ---------- IRL Assessments ----------
const IRL_DIMENSIONS = [
  'technology_maturity', 'solution_maturity', 'integration_capability', 'security_compliance',
  'financial_health', 'intellectual_property', 'delivery_capability', 'cases_references',
  'scalability', 'challenge_fit', 'poc_availability', 'commercial_viability'
]

startups.get('/:id/irl', async (c) => {
  const startupId = c.req.param('id')
  const challengeId = c.req.query('challenge_id')
  const irl = await computeIrl(c.env.DB, startupId, challengeId)
  return c.json(irl)
})

startups.post('/:id/irl', async (c) => {
  const startupId = c.req.param('id')
  const body = await c.req.json<{
    challenge_id?: string
    dimension: string
    score: number
    weight?: number
    justification?: string
    evidence_url?: string
  }>()
  const user = c.get('user')!

  if (!IRL_DIMENSIONS.includes(body.dimension)) {
    return c.json({ error: 'validation_error', message: `dimension must be one of: ${IRL_DIMENSIONS.join(', ')}` }, 400)
  }
  if (body.score < 1 || body.score > 9) {
    return c.json({ error: 'validation_error', message: 'score must be between 1 and 9' }, 400)
  }

  const id = generateUUID()
  await c.env.DB.prepare(
    `INSERT INTO irl_assessments (id, startup_id, challenge_id, dimension, score, weight, justification, evidence_url, evaluator_id, version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  )
    .bind(
      id,
      startupId,
      body.challenge_id || null,
      body.dimension,
      body.score,
      body.weight ?? 1,
      body.justification || null,
      body.evidence_url || null,
      user.id,
      nowIso()
    )
    .run()

  await logAudit(c.env.DB, {
    userId: user.id,
    userName: user.name,
    action: 'irl_assessment',
    entityType: 'startup',
    entityId: startupId,
    details: { dimension: body.dimension, score: body.score, challenge_id: body.challenge_id }
  })

  const irl = await computeIrl(c.env.DB, startupId, body.challenge_id)
  return c.json({ id, ...body, current_irl: irl }, 201)
})

async function computeIrl(db: AppDatabase, startupId: string, challengeId?: string) {
  const query = challengeId
    ? db.prepare(`SELECT dimension, score, weight, created_at FROM irl_assessments WHERE startup_id = ? AND challenge_id = ?`).bind(startupId, challengeId)
    : db.prepare(`SELECT dimension, score, weight, created_at FROM irl_assessments WHERE startup_id = ? AND challenge_id IS NULL`).bind(startupId)

  const rows = await query.all<any>()
  const latestByDimension = new Map<string, any>()
  for (const row of rows.results || []) {
    const existing = latestByDimension.get(row.dimension)
    if (!existing || row.created_at > existing.created_at) {
      latestByDimension.set(row.dimension, row)
    }
  }

  let totalWeighted = 0
  let totalWeight = 0
  for (const row of latestByDimension.values()) {
    totalWeighted += row.score * row.weight
    totalWeight += row.weight
  }

  const weightedAverage = totalWeight > 0 ? Math.round((totalWeighted / totalWeight) * 100) / 100 : null

  return {
    dimensions_assessed: latestByDimension.size,
    total_dimensions: IRL_DIMENSIONS.length,
    weighted_average: weightedAverage,
    is_complete: latestByDimension.size === IRL_DIMENSIONS.length
  }
}

export default startups
