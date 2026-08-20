import { Hono } from 'hono'
import type { AppContext } from '../types/bindings'
import { generateUUID, nowIso } from '../lib/crypto'
import { logAudit } from '../lib/audit'
import { requireRole } from '../middleware/auth'

const md = new Hono<AppContext>()

// ---------- Countries ----------
md.get('/countries', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM countries WHERE deleted_at IS NULL ORDER BY name`).all()
  return c.json(rows.results)
})
md.post('/countries', requireRole('master_admin', 'admin'), async (c) => {
  const body = await c.req.json<{ code: string; name: string }>()
  const id = generateUUID()
  const user = c.get('user')!
  await c.env.DB.prepare(`INSERT INTO countries (id, code, name) VALUES (?, ?, ?)`).bind(id, body.code, body.name).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'create_country', entityType: 'country', entityId: id })
  return c.json({ id, ...body }, 201)
})
md.put('/countries/:id', requireRole('master_admin', 'admin'), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ code: string; name: string }>()
  const user = c.get('user')!
  await c.env.DB.prepare(`UPDATE countries SET code=?, name=? WHERE id=?`).bind(body.code, body.name, id).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_country', entityType: 'country', entityId: id })
  return c.json({ id, ...body })
})
md.delete('/countries/:id', requireRole('master_admin', 'admin'), async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  await c.env.DB.prepare(`UPDATE countries SET deleted_at = ? WHERE id = ?`).bind(nowIso(), id).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'soft_delete_country', entityType: 'country', entityId: id })
  return c.json({ message: 'Country archived' })
})

// ---------- Currencies ----------
md.get('/currencies', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM currencies WHERE deleted_at IS NULL ORDER BY code`).all()
  return c.json(rows.results)
})
md.post('/currencies', requireRole('master_admin', 'admin'), async (c) => {
  const body = await c.req.json<{ code: string; name: string; symbol?: string }>()
  const id = generateUUID()
  const user = c.get('user')!
  await c.env.DB.prepare(`INSERT INTO currencies (id, code, name, symbol) VALUES (?, ?, ?, ?)`)
    .bind(id, body.code, body.name, body.symbol || null)
    .run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'create_currency', entityType: 'currency', entityId: id })
  return c.json({ id, ...body }, 201)
})
md.put('/currencies/:id', requireRole('master_admin', 'admin'), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ code: string; name: string; symbol?: string }>()
  const user = c.get('user')!
  await c.env.DB.prepare(`UPDATE currencies SET code=?, name=?, symbol=? WHERE id=?`)
    .bind(body.code, body.name, body.symbol || null, id)
    .run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_currency', entityType: 'currency', entityId: id })
  return c.json({ id, ...body })
})
md.delete('/currencies/:id', requireRole('master_admin', 'admin'), async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  await c.env.DB.prepare(`UPDATE currencies SET deleted_at = ? WHERE id = ?`).bind(nowIso(), id).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'soft_delete_currency', entityType: 'currency', entityId: id })
  return c.json({ message: 'Currency archived' })
})

// ---------- Exchange rates (historical snapshots) ----------
md.get('/exchange-rates', async (c) => {
  const currency = c.req.query('currency_code')
  const query = currency
    ? c.env.DB.prepare(`SELECT * FROM exchange_rates WHERE currency_code = ? ORDER BY rate_date DESC`).bind(currency)
    : c.env.DB.prepare(`SELECT * FROM exchange_rates ORDER BY rate_date DESC LIMIT 100`)
  const rows = await query.all()
  return c.json(rows.results)
})
md.post('/exchange-rates', requireRole('master_admin', 'admin'), async (c) => {
  const body = await c.req.json<{ currency_code: string; rate_to_eur: number; rate_date: string }>()
  const user = c.get('user')!
  const id = generateUUID()
  await c.env.DB.prepare(
    `INSERT INTO exchange_rates (id, currency_code, rate_to_eur, rate_date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, body.currency_code, body.rate_to_eur, body.rate_date, user.id, nowIso())
    .run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'create_exchange_rate', entityType: 'exchange_rate', entityId: id })
  return c.json({ id, ...body }, 201)
})
md.put('/exchange-rates/:id', requireRole('master_admin', 'admin'), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ currency_code?: string; rate_to_eur?: number; rate_date?: string }>()
  const user = c.get('user')!
  const sets: string[] = []
  const values: any[] = []
  for (const f of ['currency_code', 'rate_to_eur', 'rate_date'] as const) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`)
      values.push(body[f])
    }
  }
  if (sets.length === 0) return c.json({ error: 'validation_error', message: 'No fields to update' }, 400)
  values.push(id)
  await c.env.DB.prepare(`UPDATE exchange_rates SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_exchange_rate', entityType: 'exchange_rate', entityId: id, details: body })
  return c.json({ message: 'Exchange rate updated' })
})
md.delete('/exchange-rates/:id', requireRole('master_admin', 'admin'), async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  await c.env.DB.prepare(`DELETE FROM exchange_rates WHERE id = ?`).bind(id).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'delete_exchange_rate', entityType: 'exchange_rate', entityId: id })
  return c.json({ message: 'Exchange rate deleted' })
})

// ---------- Technologies ----------
md.get('/technologies', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM technologies WHERE deleted_at IS NULL ORDER BY name`).all()
  return c.json(rows.results)
})
md.post('/technologies', requireRole('master_admin', 'admin'), async (c) => {
  const body = await c.req.json<{ name: string }>()
  const id = generateUUID()
  const user = c.get('user')!
  await c.env.DB.prepare(`INSERT INTO technologies (id, name) VALUES (?, ?)`).bind(id, body.name).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'create_technology', entityType: 'technology', entityId: id })
  return c.json({ id, ...body }, 201)
})
md.put('/technologies/:id', requireRole('master_admin', 'admin'), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ name: string }>()
  const user = c.get('user')!
  await c.env.DB.prepare(`UPDATE technologies SET name=? WHERE id=?`).bind(body.name, id).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_technology', entityType: 'technology', entityId: id })
  return c.json({ id, ...body })
})
md.delete('/technologies/:id', requireRole('master_admin', 'admin'), async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  await c.env.DB.prepare(`UPDATE technologies SET deleted_at = ? WHERE id = ?`).bind(nowIso(), id).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'soft_delete_technology', entityType: 'technology', entityId: id })
  return c.json({ message: 'Technology archived' })
})

// ---------- Hubs ----------
md.get('/hubs', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM hubs WHERE deleted_at IS NULL ORDER BY name`).all()
  return c.json(rows.results)
})
md.post('/hubs', requireRole('master_admin', 'admin'), async (c) => {
  const body = await c.req.json<any>()
  const id = generateUUID()
  const user = c.get('user')!
  await c.env.DB.prepare(
    `INSERT INTO hubs (id, name, country_id, city, website, description, logo_url, status, observations, created_at, created_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.name,
      body.country_id || null,
      body.city || null,
      body.website || null,
      body.description || null,
      body.logo_url || null,
      body.status || 'active',
      body.observations || null,
      nowIso(),
      user.id,
      nowIso()
    )
    .run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'create_hub', entityType: 'hub', entityId: id })
  return c.json({ id, ...body }, 201)
})
md.put('/hubs/:id', requireRole('master_admin', 'admin'), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<any>()
  const user = c.get('user')!
  await c.env.DB.prepare(
    `UPDATE hubs SET name=?, country_id=?, city=?, website=?, description=?, logo_url=?, status=?, observations=?, updated_at=? WHERE id=?`
  )
    .bind(
      body.name,
      body.country_id || null,
      body.city || null,
      body.website || null,
      body.description || null,
      body.logo_url || null,
      body.status || 'active',
      body.observations || null,
      nowIso(),
      id
    )
    .run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_hub', entityType: 'hub', entityId: id })
  return c.json({ id, ...body })
})
md.delete('/hubs/:id', requireRole('master_admin', 'admin'), async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  await c.env.DB.prepare(`UPDATE hubs SET deleted_at = ? WHERE id = ?`).bind(nowIso(), id).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'soft_delete_hub', entityType: 'hub', entityId: id })
  return c.json({ message: 'Hub archived' })
})

export default md
