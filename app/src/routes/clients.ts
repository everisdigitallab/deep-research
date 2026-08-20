import { Hono } from 'hono'
import type { AppContext } from '../types/bindings'
import { generateUUID, nowIso } from '../lib/crypto'
import { logAudit } from '../lib/audit'
import { authGuard } from '../middleware/auth'
import { convertToEur, safeDiv } from '../lib/helpers'

const clients = new Hono<AppContext>()
clients.use('*', authGuard)

// ---------- Clients ----------
clients.get('/', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM clients WHERE deleted_at IS NULL ORDER BY name`).all()
  return c.json(rows.results)
})

clients.get('/:id', async (c) => {
  const id = c.req.param('id')
  const client = await c.env.DB.prepare(`SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL`).bind(id).first()
  if (!client) return c.json({ error: 'not_found' }, 404)
  const accounts = await c.env.DB.prepare(`SELECT * FROM accounts WHERE client_id = ? AND deleted_at IS NULL`).bind(id).all()
  const stakeholders = await c.env.DB.prepare(`SELECT * FROM stakeholders WHERE client_id = ?`).bind(id).all()
  return c.json({ ...client, accounts: accounts.results, stakeholders: stakeholders.results })
})

clients.post('/', async (c) => {
  const body = await c.req.json<any>()
  const user = c.get('user')!
  const id = generateUUID()
  await c.env.DB.prepare(
    `INSERT INTO clients (id, name, country_id, sector_id, logo_url, description, status, created_at, created_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, body.name, body.country_id || null, body.sector_id || null, body.logo_url || null, body.description || null, body.status || 'active', nowIso(), user.id, nowIso())
    .run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'create_client', entityType: 'client', entityId: id })
  return c.json({ id, ...body }, 201)
})

clients.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<any>()
  const user = c.get('user')!
  await c.env.DB.prepare(
    `UPDATE clients SET name=?, country_id=?, sector_id=?, logo_url=?, description=?, status=?, updated_at=? WHERE id=?`
  )
    .bind(body.name, body.country_id || null, body.sector_id || null, body.logo_url || null, body.description || null, body.status || 'active', nowIso(), id)
    .run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_client', entityType: 'client', entityId: id })
  return c.json({ message: 'Client updated' })
})

clients.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  await c.env.DB.prepare(`UPDATE clients SET deleted_at = ? WHERE id = ?`).bind(nowIso(), id).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'soft_delete_client', entityType: 'client', entityId: id })
  return c.json({ message: 'Client archived' })
})

// ---------- Stakeholders ----------
clients.get('/:id/stakeholders', async (c) => {
  const clientId = c.req.param('id')
  const rows = await c.env.DB.prepare(`SELECT * FROM stakeholders WHERE client_id = ? AND deleted_at IS NULL ORDER BY name`).bind(clientId).all()
  return c.json(rows.results)
})

clients.post('/:id/stakeholders', async (c) => {
  const clientId = c.req.param('id')
  const body = await c.req.json<any>()
  const id = generateUUID()
  await c.env.DB.prepare(
    `INSERT INTO stakeholders (id, name, title, organization, email, phone, role_in_project, observations, client_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, body.name, body.title || null, body.organization || null, body.email || null, body.phone || null, body.role_in_project || null, body.observations || null, clientId, nowIso())
    .run()
  return c.json({ id, ...body }, 201)
})

clients.get('/stakeholders/:stakeholderId', async (c) => {
  const stakeholderId = c.req.param('stakeholderId')
  const row = await c.env.DB.prepare(`SELECT * FROM stakeholders WHERE id = ? AND deleted_at IS NULL`).bind(stakeholderId).first()
  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json(row)
})

clients.put('/stakeholders/:stakeholderId', async (c) => {
  const stakeholderId = c.req.param('stakeholderId')
  const body = await c.req.json<any>()
  const user = c.get('user')!
  await c.env.DB.prepare(
    `UPDATE stakeholders SET name=?, title=?, organization=?, email=?, phone=?, role_in_project=?, observations=? WHERE id=?`
  )
    .bind(body.name, body.title || null, body.organization || null, body.email || null, body.phone || null, body.role_in_project || null, body.observations || null, stakeholderId)
    .run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_stakeholder', entityType: 'stakeholder', entityId: stakeholderId })
  return c.json({ message: 'Stakeholder updated' })
})

clients.delete('/stakeholders/:stakeholderId', async (c) => {
  const stakeholderId = c.req.param('stakeholderId')
  const user = c.get('user')!
  await c.env.DB.prepare(`UPDATE stakeholders SET deleted_at = ? WHERE id = ?`).bind(nowIso(), stakeholderId).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'soft_delete_stakeholder', entityType: 'stakeholder', entityId: stakeholderId })
  return c.json({ message: 'Stakeholder archived' })
})

// ---------- Accounts ----------
clients.get('/:clientId/accounts', async (c) => {
  const clientId = c.req.param('clientId')
  const rows = await c.env.DB.prepare(`SELECT * FROM accounts WHERE client_id = ? AND deleted_at IS NULL`).bind(clientId).all()
  return c.json(rows.results)
})

export default clients

// ---------- Standalone Accounts router (mounted separately) ----------
export const accountsRouter = new Hono<AppContext>()
accountsRouter.use('*', authGuard)

accountsRouter.get('/', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM accounts WHERE deleted_at IS NULL ORDER BY name`).all()
  return c.json(rows.results)
})

accountsRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const account = await c.env.DB.prepare(`SELECT * FROM accounts WHERE id = ? AND deleted_at IS NULL`).bind(id).first<any>()
  if (!account) return c.json({ error: 'not_found' }, 404)

  // Compute pipeline / revenue contribution from linked moonshots (via challenges -> moonshot_clients)
  const client = await c.env.DB.prepare(`SELECT id FROM clients WHERE id = ?`).bind(account.client_id).first<any>()
  let influencedPipeline = 0
  let closedRevenue = 0
  if (client) {
    const moonshots = await c.env.DB.prepare(
      `SELECT m.estimated_final_project_value, m.commercial_conversion_value, m.commercial_conversion_registered
       FROM moonshots m JOIN moonshot_clients mc ON mc.moonshot_id = m.id WHERE mc.client_id = ? AND m.deleted_at IS NULL`
    )
      .bind(client.id)
      .all<any>()
    for (const m of moonshots.results || []) {
      influencedPipeline += m.estimated_final_project_value || 0
      if (m.commercial_conversion_registered) closedRevenue += m.commercial_conversion_value || 0
    }
  }

  const pipelineContributionPct = safeDiv(influencedPipeline, account.baseline_value)
  const revenueContributionPct = safeDiv(closedRevenue, account.baseline_value)

  return c.json({
    ...account,
    computed: {
      influenced_pipeline: influencedPipeline,
      closed_revenue: closedRevenue,
      pipeline_contribution_pct: pipelineContributionPct,
      revenue_contribution_pct: revenueContributionPct
    }
  })
})

accountsRouter.post('/', async (c) => {
  const body = await c.req.json<any>()
  const user = c.get('user')!
  const id = generateUUID()
  await c.env.DB.prepare(
    `INSERT INTO accounts (id, client_id, name, country_id, primary_client_manager_id, baseline_type, baseline_value, currency_code, target_value, observations, created_at, created_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.client_id,
      body.name,
      body.country_id || null,
      body.primary_client_manager_id || null,
      body.baseline_type || null,
      body.baseline_value || null,
      body.currency_code || 'EUR',
      body.target_value || null,
      body.observations || null,
      nowIso(),
      user.id,
      nowIso()
    )
    .run()

  if (body.primary_client_manager_id) {
    await c.env.DB.prepare(`INSERT INTO account_client_managers (id, account_id, user_id, is_primary) VALUES (?, ?, ?, 1)`)
      .bind(generateUUID(), id, body.primary_client_manager_id)
      .run()
  }

  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'create_account', entityType: 'account', entityId: id })
  return c.json({ id, ...body }, 201)
})

accountsRouter.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<any>()
  const user = c.get('user')!
  await c.env.DB.prepare(
    `UPDATE accounts SET name=?, country_id=?, primary_client_manager_id=?, baseline_type=?, baseline_value=?, currency_code=?, target_value=?, observations=?, updated_at=? WHERE id=?`
  )
    .bind(body.name, body.country_id || null, body.primary_client_manager_id || null, body.baseline_type || null, body.baseline_value || null, body.currency_code || 'EUR', body.target_value || null, body.observations || null, nowIso(), id)
    .run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_account', entityType: 'account', entityId: id })
  return c.json({ message: 'Account updated' })
})

accountsRouter.post('/:id/client-managers', async (c) => {
  const accountId = c.req.param('id')
  const body = await c.req.json<{ user_id: string; is_primary?: boolean }>()
  const id = generateUUID()
  await c.env.DB.prepare(`INSERT INTO account_client_managers (id, account_id, user_id, is_primary) VALUES (?, ?, ?, ?)`)
    .bind(id, accountId, body.user_id, body.is_primary ? 1 : 0)
    .run()
  return c.json({ id, ...body }, 201)
})

accountsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  await c.env.DB.prepare(`UPDATE accounts SET deleted_at = ? WHERE id = ?`).bind(nowIso(), id).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'soft_delete_account', entityType: 'account', entityId: id })
  return c.json({ message: 'Account archived' })
})
