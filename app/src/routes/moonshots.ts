import { Hono } from 'hono'
import type { AppContext } from '../types/bindings'
import { generateUUID, nowIso } from '../lib/crypto'
import { logAudit } from '../lib/audit'
import { authGuard } from '../middleware/auth'
import { canEditMoonshot, canViewFinancials, convertToEur, isPrivileged } from '../lib/helpers'

const moonshots = new Hono<AppContext>()
moonshots.use('*', authGuard)

const PHASE_ORDER = [
  'ideation', 'qualification', 'cubo_gate', 'scouting', 'matching', 'solution_design',
  'legal_feasibility', 'financial_feasibility', 'approval', 'contracting', 'kickoff',
  'execution', 'validation', 'scale_or_stop', 'closing', 'commercial_conversion'
]

moonshots.get('/', async (c) => {
  const editionId = c.req.query('edition_id')
  const phase = c.req.query('phase')
  let sql = `SELECT * FROM moonshots WHERE deleted_at IS NULL`
  const binds: any[] = []
  if (editionId) {
    sql += ` AND edition_id = ?`
    binds.push(editionId)
  }
  if (phase) {
    sql += ` AND phase = ?`
    binds.push(phase)
  }
  sql += ` ORDER BY created_at DESC`
  const rows = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json(rows.results)
})

moonshots.get('/:id', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  const ms = await c.env.DB.prepare(`SELECT * FROM moonshots WHERE id = ? AND deleted_at IS NULL`).bind(id).first<any>()
  if (!ms) return c.json({ error: 'not_found' }, 404)

  const clientsRows = await c.env.DB.prepare(`SELECT cl.* FROM moonshot_clients mc JOIN clients cl ON cl.id = mc.client_id WHERE mc.moonshot_id = ?`).bind(id).all()
  const startupsRows = await c.env.DB.prepare(`SELECT s.* FROM moonshot_startups ms2 JOIN startups s ON s.id = ms2.startup_id WHERE ms2.moonshot_id = ?`).bind(id).all()
  const hyperscalersRows = await c.env.DB.prepare(`SELECT h.* FROM moonshot_hyperscalers mh JOIN hyperscalers_partners h ON h.id = mh.hyperscaler_partner_id WHERE mh.moonshot_id = ?`).bind(id).all()
  const membersRows = await c.env.DB.prepare(`SELECT mm.*, u.name as user_name, u.email FROM moonshot_members mm JOIN users u ON u.id = mm.user_id WHERE mm.moonshot_id = ?`).bind(id).all()
  const milestonesRows = await c.env.DB.prepare(`SELECT * FROM moonshot_milestones WHERE moonshot_id = ? ORDER BY order_index`).bind(id).all()
  const checkpointsRows = await c.env.DB.prepare(`SELECT * FROM moonshot_checkpoints WHERE moonshot_id = ? ORDER BY checkpoint_date DESC`).bind(id).all()
  const kpisRows = await c.env.DB.prepare(`SELECT * FROM moonshot_kpis WHERE moonshot_id = ?`).bind(id).all()
  const legalDocsRows = await c.env.DB.prepare(`SELECT * FROM legal_documents WHERE moonshot_id = ? ORDER BY created_at DESC`).bind(id).all()

  const canViewFin = await canViewFinancials(c.env.DB, user, id)
  let funding: any[] = []
  let financials: any = null
  if (canViewFin) {
    const fundingRows = await c.env.DB.prepare(`SELECT * FROM moonshot_funding WHERE moonshot_id = ?`).bind(id).all()
    funding = fundingRows.results || []
    financials = await c.env.DB.prepare(`SELECT * FROM moonshot_financials WHERE moonshot_id = ?`).bind(id).first()
  }

  return c.json({
    ...ms,
    clients: clientsRows.results,
    startups: startupsRows.results,
    hyperscalers: hyperscalersRows.results,
    members: membersRows.results,
    milestones: milestonesRows.results,
    checkpoints: checkpointsRows.results,
    kpis: kpisRows.results,
    legal_documents: legalDocsRows.results,
    funding: canViewFin ? funding : undefined,
    financials: canViewFin ? financials : undefined,
    financial_access: canViewFin
  })
})

moonshots.post('/', async (c) => {
  const body = await c.req.json<any>()
  const user = c.get('user')!
  const id = generateUUID()

  // Duration validation (4-12 weeks standard per program spec)
  let durationWeeks = body.duration_weeks
  if (body.planned_start_date && body.planned_end_date) {
    const start = new Date(body.planned_start_date)
    const end = new Date(body.planned_end_date)
    durationWeeks = Math.round((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000))
  }
  if (durationWeeks && (durationWeeks < 4 || durationWeeks > 12) && !body.duration_exception_justification) {
    return c.json({
      error: 'validation_error',
      message: 'Moonshot duration outside 4-12 weeks requires duration_exception_justification (Admin approval)'
    }, 400)
  }

  const code = body.code || `MS-${new Date().getFullYear()}-${id.slice(0, 6).toUpperCase()}`

  await c.env.DB.prepare(
    `INSERT INTO moonshots (
      id, edition_id, code, title, primary_challenge_id, is_internal, owner_id, project_lead_id, tech_lead_id,
      sponsor, success_criteria, planned_start_date, planned_end_date, duration_weeks, duration_exception_justification,
      phase, created_at, created_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ideation', ?, ?, ?)`
  )
    .bind(
      id,
      body.edition_id,
      code,
      body.title,
      body.primary_challenge_id || null,
      body.is_internal ? 1 : 0,
      body.owner_id || user.id,
      body.project_lead_id || null,
      body.tech_lead_id || null,
      body.sponsor || null,
      body.success_criteria || null,
      body.planned_start_date || null,
      body.planned_end_date || null,
      durationWeeks || null,
      body.duration_exception_justification || null,
      nowIso(),
      user.id,
      nowIso()
    )
    .run()

  if (!body.is_internal && (!Array.isArray(body.client_ids) || body.client_ids.length === 0)) {
    return c.json({ error: 'validation_error', message: 'At least one client is required unless the Moonshot is internal' }, 400)
  }
  if (Array.isArray(body.client_ids)) {
    for (const clientId of body.client_ids) {
      await c.env.DB.prepare(`INSERT INTO moonshot_clients (id, moonshot_id, client_id) VALUES (?, ?, ?)`).bind(generateUUID(), id, clientId).run()
    }
  }
  if (!Array.isArray(body.startup_ids) || body.startup_ids.length === 0) {
    return c.json({ error: 'validation_error', message: 'At least one startup is required for a Moonshot' }, 400)
  }
  for (const startupId of body.startup_ids) {
    await c.env.DB.prepare(`INSERT INTO moonshot_startups (id, moonshot_id, startup_id) VALUES (?, ?, ?)`).bind(generateUUID(), id, startupId).run()
  }
  if (Array.isArray(body.hyperscaler_partner_ids)) {
    for (const hpId of body.hyperscaler_partner_ids) {
      await c.env.DB.prepare(`INSERT INTO moonshot_hyperscalers (id, moonshot_id, hyperscaler_partner_id) VALUES (?, ?, ?)`).bind(generateUUID(), id, hpId).run()
    }
  }
  if (body.primary_challenge_id) {
    await c.env.DB.prepare(`INSERT INTO moonshot_challenges (id, moonshot_id, challenge_id) VALUES (?, ?, ?)`).bind(generateUUID(), id, body.primary_challenge_id).run()
  }

  // Owner/Lead as moonshot_members
  for (const [uid, role] of [[body.owner_id || user.id, 'owner'], [body.project_lead_id, 'project_lead'], [body.tech_lead_id, 'tech_lead']] as [string, string][]) {
    if (uid) {
      await c.env.DB.prepare(`INSERT INTO moonshot_members (id, moonshot_id, user_id, role_in_project) VALUES (?, ?, ?, ?)`).bind(generateUUID(), id, uid, role).run()
    }
  }

  await c.env.DB.prepare(`INSERT INTO moonshot_financials (id, moonshot_id, currency_code) VALUES (?, ?, ?)`).bind(generateUUID(), id, 'EUR').run()
  await c.env.DB.prepare(`INSERT INTO moonshot_phase_history (id, moonshot_id, from_phase, to_phase, changed_by, comment, created_at) VALUES (?, ?, NULL, 'ideation', ?, 'Moonshot created', ?)`)
    .bind(generateUUID(), id, user.id, nowIso())
    .run()

  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'create_moonshot', entityType: 'moonshot', entityId: id })
  return c.json({ id, code, ...body }, 201)
})

moonshots.put('/:id', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  if (!(await canEditMoonshot(c.env.DB, user, id))) {
    return c.json({ error: 'forbidden', message: 'You are not authorized to edit this Moonshot' }, 403)
  }
  const body = await c.req.json<any>()
  const fields = ['title', 'sponsor', 'success_criteria', 'planned_start_date', 'planned_end_date', 'duration_weeks', 'duration_exception_justification', 'owner_id', 'project_lead_id', 'tech_lead_id']
  const sets: string[] = []
  const values: any[] = []
  for (const f of fields) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`)
      values.push(body[f])
    }
  }
  if (sets.length === 0) return c.json({ error: 'validation_error', message: 'No fields to update' }, 400)
  sets.push('updated_at = ?')
  values.push(nowIso())
  values.push(id)
  await c.env.DB.prepare(`UPDATE moonshots SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_moonshot', entityType: 'moonshot', entityId: id, details: body })
  return c.json({ message: 'Moonshot updated' })
})

moonshots.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  if (!isPrivileged(user)) {
    return c.json({ error: 'forbidden', message: 'Only Admin/Master Admin can archive a Moonshot' }, 403)
  }
  await c.env.DB.prepare(`UPDATE moonshots SET deleted_at = ? WHERE id = ?`).bind(nowIso(), id).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'soft_delete_moonshot', entityType: 'moonshot', entityId: id })
  return c.json({ message: 'Moonshot archived' })
})

// ---------- Phase transitions ----------
moonshots.post('/:id/phase', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  const body = await c.req.json<{ to_phase: string; comment?: string; justification?: string; authorize_with_pending?: boolean }>()

  if (!(await canEditMoonshot(c.env.DB, user, id))) {
    return c.json({ error: 'forbidden', message: 'You are not authorized to edit this Moonshot' }, 403)
  }
  if (!PHASE_ORDER.includes(body.to_phase)) {
    return c.json({ error: 'validation_error', message: 'Invalid phase' }, 400)
  }

  const ms = await c.env.DB.prepare(`SELECT * FROM moonshots WHERE id = ?`).bind(id).first<any>()
  if (!ms) return c.json({ error: 'not_found' }, 404)

  const currentIdx = PHASE_ORDER.indexOf(ms.phase)
  const targetIdx = PHASE_ORDER.indexOf(body.to_phase)
  const isBacktrack = targetIdx < currentIdx

  if (isBacktrack && !body.justification) {
    return c.json({ error: 'validation_error', message: 'Justification is required to move back to a previous phase' }, 400)
  }

  // Kickoff/Execution gate: legal + financial pending must be explicitly authorized
  if ((body.to_phase === 'kickoff' || body.to_phase === 'execution') && (ms.legal_status !== 'signed' || ms.financial_status !== 'funded')) {
    if (!body.authorize_with_pending) {
      return c.json({
        error: 'pending_gate',
        message: 'Legal and/or financial status not fully cleared. Set authorize_with_pending=true to proceed with an explicit override (will be audited).',
        legal_status: ms.legal_status,
        financial_status: ms.financial_status
      }, 409)
    }
  }

  const updates: string[] = ['phase = ?', 'updated_at = ?', 'version = version + 1']
  const values: any[] = [body.to_phase, nowIso()]
  if (body.authorize_with_pending) {
    updates.push('started_with_pending_by = ?', 'started_with_pending_at = ?', 'started_with_pending_justification = ?')
    values.push(user.id, nowIso(), body.justification || body.comment || 'Authorized with pending legal/financial items')
  }
  values.push(id)

  await c.env.DB.prepare(`UPDATE moonshots SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
  await c.env.DB.prepare(
    `INSERT INTO moonshot_phase_history (id, moonshot_id, from_phase, to_phase, changed_by, comment, justification, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(generateUUID(), id, ms.phase, body.to_phase, user.id, body.comment || null, body.justification || null, nowIso())
    .run()

  await logAudit(c.env.DB, {
    userId: user.id,
    userName: user.name,
    action: 'moonshot_phase_change',
    entityType: 'moonshot',
    entityId: id,
    details: { from: ms.phase, to: body.to_phase, authorized_with_pending: !!body.authorize_with_pending }
  })

  return c.json({ message: 'Phase updated', from: ms.phase, to: body.to_phase })
})

// ---------- Legal / Financial status ----------
moonshots.put('/:id/legal-status', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  if (user.role !== 'legal' && !isPrivileged(user)) {
    return c.json({ error: 'forbidden', message: 'Only Legal or Admin can change legal status' }, 403)
  }
  const body = await c.req.json<{ legal_status: string; comment?: string }>()
  await c.env.DB.prepare(`UPDATE moonshots SET legal_status = ?, updated_at = ? WHERE id = ?`).bind(body.legal_status, nowIso(), id).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_legal_status', entityType: 'moonshot', entityId: id, details: body })
  return c.json({ message: 'Legal status updated' })
})

moonshots.put('/:id/financial-status', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  if (!(await canViewFinancials(c.env.DB, user, id))) {
    return c.json({ error: 'forbidden' }, 403)
  }
  const body = await c.req.json<{ financial_status: string }>()
  await c.env.DB.prepare(`UPDATE moonshots SET financial_status = ?, updated_at = ? WHERE id = ?`).bind(body.financial_status, nowIso(), id).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_financial_status', entityType: 'moonshot', entityId: id, details: body })
  return c.json({ message: 'Financial status updated' })
})

// ---------- Final decision ----------
moonshots.post('/:id/decision', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  if (!(await canEditMoonshot(c.env.DB, user, id))) {
    return c.json({ error: 'forbidden' }, 403)
  }
  const body = await c.req.json<any>()
  if (!['scale', 'pivot', 'stop'].includes(body.final_decision)) {
    return c.json({ error: 'validation_error', message: 'final_decision must be scale, pivot or stop' }, 400)
  }
  await c.env.DB.prepare(
    `UPDATE moonshots SET final_decision = ?, final_decision_date = ?, final_decision_justification = ?,
     final_results = ?, lessons_learned = ?, next_steps = ?, potential_value = ?, phase = 'scale_or_stop', updated_at = ? WHERE id = ?`
  )
    .bind(
      body.final_decision,
      nowIso(),
      body.final_decision_justification || null,
      body.final_results || null,
      body.lessons_learned || null,
      body.next_steps || null,
      body.potential_value || null,
      nowIso(),
      id
    )
    .run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'moonshot_final_decision', entityType: 'moonshot', entityId: id, details: body })
  return c.json({ message: 'Decision registered' })
})

// ---------- Commercial conversion (manual only) ----------
moonshots.post('/:id/commercial-conversion', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  if (!(await canViewFinancials(c.env.DB, user, id))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<{ value: number; notes?: string }>()
  await c.env.DB.prepare(
    `UPDATE moonshots SET commercial_conversion_registered = 1, commercial_conversion_value = ?, commercial_conversion_notes = ?, updated_at = ? WHERE id = ?`
  )
    .bind(body.value, body.notes || null, nowIso(), id)
    .run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'register_commercial_conversion', entityType: 'moonshot', entityId: id, details: body })
  return c.json({ message: 'Commercial conversion registered' })
})

// ---------- Checkpoints ----------
moonshots.get('/:id/checkpoints', async (c) => {
  const id = c.req.param('id')
  const rows = await c.env.DB.prepare(`SELECT * FROM moonshot_checkpoints WHERE moonshot_id = ? ORDER BY checkpoint_date DESC`).bind(id).all()
  return c.json(rows.results)
})

moonshots.post('/:id/checkpoints', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  if (!(await canEditMoonshot(c.env.DB, user, id))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<any>()
  const checkpointId = generateUUID()
  await c.env.DB.prepare(
    `INSERT INTO moonshot_checkpoints (id, moonshot_id, checkpoint_date, overall_status, percent_progress, comments, blockers, next_steps, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(checkpointId, id, body.checkpoint_date || nowIso(), body.overall_status || 'on_track', body.percent_progress || 0, body.comments || null, body.blockers || null, body.next_steps || null, user.id, nowIso())
    .run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'create_checkpoint', entityType: 'moonshot', entityId: id })
  return c.json({ id: checkpointId, ...body }, 201)
})

moonshots.put('/checkpoints/:checkpointId', async (c) => {
  const checkpointId = c.req.param('checkpointId')
  const user = c.get('user')!
  const row = await c.env.DB.prepare(`SELECT moonshot_id FROM moonshot_checkpoints WHERE id = ?`).bind(checkpointId).first<any>()
  if (!row) return c.json({ error: 'not_found' }, 404)
  if (!(await canEditMoonshot(c.env.DB, user, row.moonshot_id))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<any>()
  const fields = ['checkpoint_date', 'overall_status', 'percent_progress', 'comments', 'blockers', 'next_steps']
  const sets: string[] = []
  const values: any[] = []
  for (const f of fields) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`)
      values.push(body[f])
    }
  }
  if (sets.length === 0) return c.json({ error: 'validation_error', message: 'No fields to update' }, 400)
  values.push(checkpointId)
  await c.env.DB.prepare(`UPDATE moonshot_checkpoints SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_checkpoint', entityType: 'moonshot_checkpoint', entityId: checkpointId })
  return c.json({ message: 'Checkpoint updated' })
})

moonshots.delete('/checkpoints/:checkpointId', async (c) => {
  const checkpointId = c.req.param('checkpointId')
  const user = c.get('user')!
  const row = await c.env.DB.prepare(`SELECT moonshot_id FROM moonshot_checkpoints WHERE id = ?`).bind(checkpointId).first<any>()
  if (!row) return c.json({ error: 'not_found' }, 404)
  if (!(await canEditMoonshot(c.env.DB, user, row.moonshot_id))) return c.json({ error: 'forbidden' }, 403)
  await c.env.DB.prepare(`DELETE FROM moonshot_checkpoints WHERE id = ?`).bind(checkpointId).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'delete_checkpoint', entityType: 'moonshot_checkpoint', entityId: checkpointId })
  return c.json({ message: 'Checkpoint deleted' })
})

// ---------- Milestones / Gantt ----------
moonshots.get('/:id/milestones', async (c) => {
  const id = c.req.param('id')
  const rows = await c.env.DB.prepare(`SELECT * FROM moonshot_milestones WHERE moonshot_id = ? ORDER BY order_index`).bind(id).all()
  return c.json(rows.results)
})

moonshots.post('/:id/milestones', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  if (!(await canEditMoonshot(c.env.DB, user, id))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<any>()
  const milestoneId = generateUUID()
  await c.env.DB.prepare(
    `INSERT INTO moonshot_milestones (id, moonshot_id, name, phase_label, planned_start, planned_end, actual_start, actual_end, percent_complete, depends_on_milestone_id, is_milestone, order_index, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      milestoneId,
      id,
      body.name,
      body.phase_label || null,
      body.planned_start || null,
      body.planned_end || null,
      body.actual_start || null,
      body.actual_end || null,
      body.percent_complete || 0,
      body.depends_on_milestone_id || null,
      body.is_milestone ? 1 : 0,
      body.order_index || 0,
      nowIso()
    )
    .run()
  return c.json({ id: milestoneId, ...body }, 201)
})

moonshots.put('/:id/milestones/:milestoneId', async (c) => {
  const { id, milestoneId } = c.req.param()
  const user = c.get('user')!
  if (!(await canEditMoonshot(c.env.DB, user, id))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<any>()
  const fields = ['name', 'phase_label', 'planned_start', 'planned_end', 'actual_start', 'actual_end', 'percent_complete', 'order_index']
  const sets: string[] = []
  const values: any[] = []
  for (const f of fields) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`)
      values.push(body[f])
    }
  }
  values.push(milestoneId)
  await c.env.DB.prepare(`UPDATE moonshot_milestones SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run()
  return c.json({ message: 'Milestone updated' })
})

moonshots.delete('/:id/milestones/:milestoneId', async (c) => {
  const { id, milestoneId } = c.req.param()
  const user = c.get('user')!
  if (!(await canEditMoonshot(c.env.DB, user, id))) return c.json({ error: 'forbidden' }, 403)
  await c.env.DB.prepare(`DELETE FROM moonshot_milestones WHERE id = ?`).bind(milestoneId).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'delete_milestone', entityType: 'moonshot_milestone', entityId: milestoneId })
  return c.json({ message: 'Milestone deleted' })
})

// ---------- KPIs ----------
moonshots.get('/:id/kpis', async (c) => {
  const id = c.req.param('id')
  const rows = await c.env.DB.prepare(`SELECT * FROM moonshot_kpis WHERE moonshot_id = ?`).bind(id).all()
  return c.json(rows.results)
})

moonshots.post('/:id/kpis', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  if (!(await canEditMoonshot(c.env.DB, user, id))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<any>()
  const kpiId = generateUUID()
  await c.env.DB.prepare(
    `INSERT INTO moonshot_kpis (id, moonshot_id, name, description, unit, baseline_value, target_value, current_value, frequency, responsible_id, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(kpiId, id, body.name, body.description || null, body.unit || null, body.baseline_value || null, body.target_value || null, body.current_value || null, body.frequency || null, body.responsible_id || null, body.source || null, nowIso())
    .run()
  return c.json({ id: kpiId, ...body }, 201)
})

moonshots.put('/kpis/:kpiId', async (c) => {
  const kpiId = c.req.param('kpiId')
  const user = c.get('user')!
  const row = await c.env.DB.prepare(`SELECT moonshot_id FROM moonshot_kpis WHERE id = ?`).bind(kpiId).first<any>()
  if (!row) return c.json({ error: 'not_found' }, 404)
  if (!(await canEditMoonshot(c.env.DB, user, row.moonshot_id))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<any>()
  const fields = ['name', 'description', 'unit', 'baseline_value', 'target_value', 'current_value', 'frequency', 'responsible_id', 'source']
  const sets: string[] = []
  const values: any[] = []
  for (const f of fields) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`)
      values.push(body[f])
    }
  }
  if (sets.length === 0) return c.json({ error: 'validation_error', message: 'No fields to update' }, 400)
  values.push(kpiId)
  await c.env.DB.prepare(`UPDATE moonshot_kpis SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_kpi', entityType: 'moonshot_kpi', entityId: kpiId })
  return c.json({ message: 'KPI updated' })
})

moonshots.delete('/kpis/:kpiId', async (c) => {
  const kpiId = c.req.param('kpiId')
  const user = c.get('user')!
  const row = await c.env.DB.prepare(`SELECT moonshot_id FROM moonshot_kpis WHERE id = ?`).bind(kpiId).first<any>()
  if (!row) return c.json({ error: 'not_found' }, 404)
  if (!(await canEditMoonshot(c.env.DB, user, row.moonshot_id))) return c.json({ error: 'forbidden' }, 403)
  await c.env.DB.prepare(`DELETE FROM kpi_records WHERE kpi_id = ?`).bind(kpiId).run()
  await c.env.DB.prepare(`DELETE FROM moonshot_kpis WHERE id = ?`).bind(kpiId).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'delete_kpi', entityType: 'moonshot_kpi', entityId: kpiId })
  return c.json({ message: 'KPI deleted' })
})

moonshots.post('/kpis/:kpiId/records', async (c) => {
  const kpiId = c.req.param('kpiId')
  const user = c.get('user')!
  const body = await c.req.json<{ value: number; measured_at: string; observations?: string }>()
  const recordId = generateUUID()
  await c.env.DB.prepare(
    `INSERT INTO kpi_records (id, kpi_id, value, measured_at, observations, created_by) VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(recordId, kpiId, body.value, body.measured_at, body.observations || null, user.id)
    .run()
  await c.env.DB.prepare(`UPDATE moonshot_kpis SET current_value = ? WHERE id = ?`).bind(body.value, kpiId).run()
  return c.json({ id: recordId, ...body }, 201)
})

// ---------- Funding ----------
moonshots.get('/:id/funding', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  if (!(await canViewFinancials(c.env.DB, user, id))) return c.json({ error: 'forbidden' }, 403)
  const rows = await c.env.DB.prepare(`SELECT * FROM moonshot_funding WHERE moonshot_id = ?`).bind(id).all()
  return c.json(rows.results)
})

moonshots.post('/:id/funding', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  if (!(await canViewFinancials(c.env.DB, user, id))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<any>()
  const fundingId = generateUUID()
  const amountEur = convertToEur(body.amount, body.currency_code || 'EUR', body.exchange_rate)

  await c.env.DB.prepare(
    `INSERT INTO moonshot_funding (
      id, moonshot_id, source_type, description, amount, currency_code, exchange_rate, rate_date, amount_eur,
      status, cost_center, ext_identifier, internal_order, observations, created_at, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      fundingId,
      id,
      body.source_type,
      body.description || null,
      body.amount,
      body.currency_code || 'EUR',
      body.exchange_rate || 1,
      body.rate_date || null,
      amountEur,
      body.status || 'identified',
      body.cost_center || null,
      body.ext_identifier || null,
      body.internal_order || null,
      body.observations || null,
      nowIso(),
      user.id
    )
    .run()

  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'create_funding', entityType: 'moonshot', entityId: id, details: { amount: body.amount, currency: body.currency_code } })
  return c.json({ id: fundingId, ...body, amount_eur: amountEur }, 201)
})

moonshots.put('/funding/:fundingId', async (c) => {
  const fundingId = c.req.param('fundingId')
  const user = c.get('user')!
  const body = await c.req.json<any>()
  const record = await c.env.DB.prepare(`SELECT moonshot_id FROM moonshot_funding WHERE id = ?`).bind(fundingId).first<any>()
  if (!record) return c.json({ error: 'not_found' }, 404)
  if (!(await canViewFinancials(c.env.DB, user, record.moonshot_id))) return c.json({ error: 'forbidden' }, 403)

  const amountEur = body.amount !== undefined ? convertToEur(body.amount, body.currency_code || 'EUR', body.exchange_rate) : undefined
  const sets: string[] = []
  const values: any[] = []
  for (const f of ['status', 'amount', 'currency_code', 'exchange_rate', 'rate_date', 'description', 'observations']) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`)
      values.push(body[f])
    }
  }
  if (amountEur !== undefined) {
    sets.push('amount_eur = ?')
    values.push(amountEur)
  }
  values.push(fundingId)
  await c.env.DB.prepare(`UPDATE moonshot_funding SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_funding', entityType: 'moonshot_funding', entityId: fundingId, details: body })
  return c.json({ message: 'Funding updated' })
})

moonshots.delete('/funding/:fundingId', async (c) => {
  const fundingId = c.req.param('fundingId')
  const user = c.get('user')!
  const record = await c.env.DB.prepare(`SELECT moonshot_id FROM moonshot_funding WHERE id = ?`).bind(fundingId).first<any>()
  if (!record) return c.json({ error: 'not_found' }, 404)
  if (!(await canViewFinancials(c.env.DB, user, record.moonshot_id))) return c.json({ error: 'forbidden' }, 403)
  await c.env.DB.prepare(`DELETE FROM moonshot_funding WHERE id = ?`).bind(fundingId).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'delete_funding', entityType: 'moonshot_funding', entityId: fundingId })
  return c.json({ message: 'Funding deleted' })
})

// ---------- Financial summary (revenue/cost/margin) ----------
moonshots.put('/:id/financials', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  if (!(await canViewFinancials(c.env.DB, user, id))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<{ total_revenue?: number; total_cost?: number; currency_code?: string }>()
  await c.env.DB.prepare(
    `UPDATE moonshot_financials SET total_revenue = COALESCE(?, total_revenue), total_cost = COALESCE(?, total_cost), currency_code = COALESCE(?, currency_code), updated_at = ? WHERE moonshot_id = ?`
  )
    .bind(body.total_revenue ?? null, body.total_cost ?? null, body.currency_code ?? null, nowIso(), id)
    .run()
  return c.json({ message: 'Financials updated' })
})

export default moonshots
