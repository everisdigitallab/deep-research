import { Hono } from 'hono'
import type { AppContext } from '../types/bindings'
import { generateUUID, nowIso } from '../lib/crypto'
import { logAudit } from '../lib/audit'
import { authGuard } from '../middleware/auth'
import { hasMasterclassGate } from '../lib/helpers'

const challenges = new Hono<AppContext>()
challenges.use('*', authGuard)

challenges.get('/', async (c) => {
  const editionId = c.req.query('edition_id')
  const query = editionId
    ? c.env.DB.prepare(`SELECT * FROM challenges WHERE edition_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`).bind(editionId)
    : c.env.DB.prepare(`SELECT * FROM challenges WHERE deleted_at IS NULL ORDER BY created_at DESC`)
  const rows = await query.all()
  return c.json(rows.results)
})

challenges.get('/:id', async (c) => {
  const id = c.req.param('id')
  const challenge = await c.env.DB.prepare(`SELECT * FROM challenges WHERE id = ? AND deleted_at IS NULL`).bind(id).first<any>()
  if (!challenge) return c.json({ error: 'not_found' }, 404)

  const clientsRows = await c.env.DB.prepare(
    `SELECT cl.* FROM challenge_clients cc JOIN clients cl ON cl.id = cc.client_id WHERE cc.challenge_id = ?`
  )
    .bind(id)
    .all()
  const technologiesRows = await c.env.DB.prepare(
    `SELECT t.* FROM challenge_technologies ct JOIN technologies t ON t.id = ct.technology_id WHERE ct.challenge_id = ?`
  )
    .bind(id)
    .all()
  const cuboExperiences = await c.env.DB.prepare(
    `SELECT ce.* FROM cubo_experience_challenges cec JOIN cubo_experiences ce ON ce.id = cec.experience_id WHERE cec.challenge_id = ?`
  )
    .bind(id)
    .all()

  return c.json({
    ...challenge,
    clients: clientsRows.results,
    technologies: technologiesRows.results,
    cubo_experiences: cuboExperiences.results
  })
})

challenges.post('/', async (c) => {
  const user = c.get('user')!
  const body = await c.req.json<any>()

  // Masterclass gate check for Executives creating challenges
  const gatePassed = await hasMasterclassGate(c.env.DB, user, body.edition_id)
  if (!gatePassed) {
    return c.json({ error: 'masterclass_gate_required', message: 'Complete all required Masterclass modules for this edition before creating challenges.' }, 403)
  }

  const id = generateUUID()
  await c.env.DB.prepare(
    `INSERT INTO challenges (
      id, edition_id, title, description, business_mission, problem_statement, context, current_impact,
      affected_audience, expected_outcome, is_internal, sponsor, country_id, sector_id, available_data,
      constraints_text, expected_deadline, expected_budget, value_hypothesis, success_criteria, known_risks,
      confidentiality, status, created_at, created_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.edition_id,
      body.title,
      body.description || null,
      body.business_mission || null,
      body.problem_statement || null,
      body.context || null,
      body.current_impact || null,
      body.affected_audience || null,
      body.expected_outcome || null,
      body.is_internal ? 1 : 0,
      body.sponsor || null,
      body.country_id || null,
      body.sector_id || null,
      body.available_data || null,
      body.constraints_text || null,
      body.expected_deadline || null,
      body.expected_budget || null,
      body.value_hypothesis || null,
      body.success_criteria || null,
      body.known_risks || null,
      body.confidentiality || 'internal',
      'draft',
      nowIso(),
      user.id,
      nowIso()
    )
    .run()

  if (Array.isArray(body.client_ids)) {
    for (const clientId of body.client_ids) {
      await c.env.DB.prepare(`INSERT INTO challenge_clients (id, challenge_id, client_id) VALUES (?, ?, ?)`)
        .bind(generateUUID(), id, clientId)
        .run()
    }
  }
  if (Array.isArray(body.technology_ids)) {
    for (const techId of body.technology_ids) {
      await c.env.DB.prepare(`INSERT INTO challenge_technologies (id, challenge_id, technology_id) VALUES (?, ?, ?)`)
        .bind(generateUUID(), id, techId)
        .run()
    }
  }

  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'create_challenge', entityType: 'challenge', entityId: id })
  return c.json({ id, ...body }, 201)
})

challenges.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<any>()
  const user = c.get('user')!

  const fields = [
    'title', 'description', 'business_mission', 'problem_statement', 'context', 'current_impact',
    'affected_audience', 'expected_outcome', 'sponsor', 'country_id', 'sector_id', 'available_data',
    'constraints_text', 'expected_deadline', 'expected_budget', 'value_hypothesis', 'success_criteria',
    'known_risks', 'confidentiality', 'status'
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

  await c.env.DB.prepare(`UPDATE challenges SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_challenge', entityType: 'challenge', entityId: id })
  return c.json({ message: 'Challenge updated' })
})

challenges.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  await c.env.DB.prepare(`UPDATE challenges SET deleted_at = ? WHERE id = ?`).bind(nowIso(), id).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'soft_delete_challenge', entityType: 'challenge', entityId: id })
  return c.json({ message: 'Challenge archived' })
})

export default challenges
