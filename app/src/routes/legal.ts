import { Hono } from 'hono'
import type { AppContext } from '../types/bindings'
import { generateUUID, nowIso } from '../lib/crypto'
import { logAudit } from '../lib/audit'
import { authGuard, requireRole } from '../middleware/auth'

const legal = new Hono<AppContext>()
legal.use('*', authGuard)

// ---------- Templates (MSA/SOW) ----------
legal.get('/templates', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM legal_templates ORDER BY created_at DESC`).all()
  return c.json(rows.results)
})

legal.post('/templates', requireRole('master_admin', 'admin', 'legal'), async (c) => {
  const body = await c.req.json<any>()
  const user = c.get('user')!
  const id = generateUUID()
  await c.env.DB.prepare(
    `INSERT INTO legal_templates (id, type, country_id, language, version, effective_date, status, file_url, observations, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, body.type, body.country_id || null, body.language || 'pt-BR', body.version, body.effective_date || null, body.status || 'active', body.file_url || null, body.observations || null, nowIso(), user.id)
    .run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'create_legal_template', entityType: 'legal_template', entityId: id })
  return c.json({ id, ...body }, 201)
})

legal.put('/templates/:id', requireRole('master_admin', 'admin', 'legal'), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<any>()
  const user = c.get('user')!
  const fields = ['type', 'country_id', 'language', 'version', 'effective_date', 'status', 'file_url', 'observations']
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
  await c.env.DB.prepare(`UPDATE legal_templates SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_legal_template', entityType: 'legal_template', entityId: id })
  return c.json({ message: 'Template updated' })
})

legal.delete('/templates/:id', requireRole('master_admin', 'admin', 'legal'), async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  await c.env.DB.prepare(`UPDATE legal_templates SET status = 'superseded' WHERE id = ?`).bind(id).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'archive_legal_template', entityType: 'legal_template', entityId: id })
  return c.json({ message: 'Template archived (marked superseded)' })
})

// ---------- Clause library ----------
legal.get('/clauses', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM legal_clauses WHERE status = 'active' ORDER BY category, name`).all()
  return c.json(rows.results)
})

legal.post('/clauses', requireRole('master_admin', 'admin', 'legal'), async (c) => {
  const body = await c.req.json<any>()
  const user = c.get('user')!
  const id = generateUUID()
  await c.env.DB.prepare(
    `INSERT INTO legal_clauses (id, name, category, country_id, language, clause_text, version, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
  )
    .bind(id, body.name, body.category || null, body.country_id || null, body.language || 'pt-BR', body.clause_text, body.version || '1.0', user.id, nowIso())
    .run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'create_legal_clause', entityType: 'legal_clause', entityId: id })
  return c.json({ id, ...body }, 201)
})

legal.put('/clauses/:id', requireRole('master_admin', 'admin', 'legal'), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<any>()
  const user = c.get('user')!
  const fields = ['name', 'category', 'country_id', 'language', 'clause_text', 'version', 'status']
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
  await c.env.DB.prepare(`UPDATE legal_clauses SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_legal_clause', entityType: 'legal_clause', entityId: id })
  return c.json({ message: 'Clause updated' })
})

legal.delete('/clauses/:id', requireRole('master_admin', 'admin', 'legal'), async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  await c.env.DB.prepare(`UPDATE legal_clauses SET status = 'inactive' WHERE id = ?`).bind(id).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'archive_legal_clause', entityType: 'legal_clause', entityId: id })
  return c.json({ message: 'Clause archived' })
})

// ---------- Legal documents (per Moonshot) ----------
legal.get('/documents', async (c) => {
  const moonshotId = c.req.query('moonshot_id')
  const query = moonshotId
    ? c.env.DB.prepare(`SELECT * FROM legal_documents WHERE moonshot_id = ? ORDER BY created_at DESC`).bind(moonshotId)
    : c.env.DB.prepare(`SELECT * FROM legal_documents ORDER BY created_at DESC LIMIT 200`)
  const rows = await query.all()
  return c.json(rows.results)
})

legal.post('/documents', requireRole('master_admin', 'admin', 'legal'), async (c) => {
  const body = await c.req.json<any>()
  const user = c.get('user')!
  const id = generateUUID()
  await c.env.DB.prepare(
    `INSERT INTO legal_documents (id, moonshot_id, template_id, type, status, file_url, version, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
  )
    .bind(id, body.moonshot_id || null, body.template_id || null, body.type, body.status || 'draft', body.file_url || null, nowIso(), user.id)
    .run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'create_legal_document', entityType: 'legal_document', entityId: id, details: { moonshot_id: body.moonshot_id } })
  return c.json({ id, ...body }, 201)
})

legal.put('/documents/:id', requireRole('master_admin', 'admin', 'legal'), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<any>()
  const user = c.get('user')!
  const sets: string[] = []
  const values: any[] = []
  for (const f of ['status', 'file_url', 'legal_opinion']) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`)
      values.push(body[f])
    }
  }
  if (body.status && ['signed', 'rejected'].includes(body.status)) {
    sets.push('reviewed_by = ?', 'reviewed_at = ?')
    values.push(user.id, nowIso())
  }
  values.push(id)
  await c.env.DB.prepare(`UPDATE legal_documents SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_legal_document', entityType: 'legal_document', entityId: id, details: body })
  return c.json({ message: 'Legal document updated' })
})

legal.delete('/documents/:id', requireRole('master_admin', 'admin', 'legal'), async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  await c.env.DB.prepare(`DELETE FROM legal_documents WHERE id = ?`).bind(id).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'delete_legal_document', entityType: 'legal_document', entityId: id })
  return c.json({ message: 'Legal document deleted' })
})

// ---------- Electronic signature stub ----------
legal.get('/signature/status', async (c) => {
  return c.json({
    configured: false,
    message: 'Electronic signature integration not configured.'
  })
})

export default legal
