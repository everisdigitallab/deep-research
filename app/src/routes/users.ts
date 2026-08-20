import { Hono } from 'hono'
import type { AppContext } from '../types/bindings'
import { generateUUID, generateToken, hashToken, nowIso, addHours } from '../lib/crypto'
import { logAudit } from '../lib/audit'
import { requireRole } from '../middleware/auth'

const users = new Hono<AppContext>()

// List users (Admin/Master Admin only)
users.get('/', requireRole('master_admin', 'admin'), async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, name, email, role, is_client_manager, status, locale, last_login_at, created_at
     FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC`
  ).all()
  return c.json(rows.results)
})

// Get single user (Admin/Master Admin only) - used to pre-fill edit forms
users.get('/:id', requireRole('master_admin', 'admin'), async (c) => {
  const id = c.req.param('id')
  const row = await c.env.DB.prepare(
    `SELECT id, name, email, role, is_client_manager, status, locale, last_login_at, created_at
     FROM users WHERE id = ? AND deleted_at IS NULL`
  ).bind(id).first()
  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json(row)
})

// Create user -> generates activation token (Admin/Master Admin only)
users.post('/', requireRole('master_admin', 'admin'), async (c) => {
  const body = await c.req.json<{ name: string; email: string; role: string; is_client_manager?: boolean }>()
  const actingUser = c.get('user')!

  if (!['master_admin', 'admin', 'executive', 'legal'].includes(body.role)) {
    return c.json({ error: 'validation_error', message: 'Invalid role' }, 400)
  }
  // Only master_admin can create another master_admin
  if (body.role === 'master_admin' && actingUser.role !== 'master_admin') {
    return c.json({ error: 'forbidden', message: 'Only Master Admin can create another Master Admin' }, 403)
  }

  const existing = await c.env.DB.prepare(`SELECT id FROM users WHERE email = ? AND deleted_at IS NULL`)
    .bind(body.email.toLowerCase())
    .first()
  if (existing) {
    return c.json({ error: 'conflict', message: 'Email already registered' }, 409)
  }

  const id = generateUUID()
  const activationToken = generateToken(24)
  const { hash } = await hashToken(activationToken)

  await c.env.DB.prepare(
    `INSERT INTO users (id, name, email, role, is_client_manager, status, activation_token_hash, activation_token_expires_at, created_at, created_by, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending_activation', ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.name,
      body.email.toLowerCase(),
      body.role,
      body.is_client_manager ? 1 : 0,
      hash,
      addHours(new Date(), 24),
      nowIso(),
      actingUser.id,
      nowIso()
    )
    .run()

  await logAudit(c.env.DB, {
    userId: actingUser.id,
    userName: actingUser.name,
    action: 'create_user',
    entityType: 'user',
    entityId: id,
    details: { role: body.role, email: body.email }
  })

  return c.json(
    {
      message: 'User created. Share this activation token securely — it will not be shown again and expires in 24h.',
      user: { id, name: body.name, email: body.email, role: body.role },
      activation_token: activationToken
    },
    201
  )
})

// Suspend / reactivate
users.post('/:id/suspend', requireRole('master_admin', 'admin'), async (c) => {
  const id = c.req.param('id')
  const actingUser = c.get('user')!
  const target = await c.env.DB.prepare(`SELECT role FROM users WHERE id = ?`).bind(id).first<any>()
  if (target?.role === 'master_admin') {
    const count = await c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM users WHERE role = 'master_admin' AND status = 'active' AND deleted_at IS NULL`
    ).first<any>()
    if ((count?.n || 0) <= 1) {
      return c.json({ error: 'forbidden', message: 'Cannot suspend the last active Master Admin' }, 403)
    }
  }
  await c.env.DB.prepare(`UPDATE users SET status = 'suspended', updated_at = ? WHERE id = ?`).bind(nowIso(), id).run()
  await logAudit(c.env.DB, { userId: actingUser.id, userName: actingUser.name, action: 'suspend_user', entityType: 'user', entityId: id })
  return c.json({ message: 'User suspended' })
})

users.post('/:id/reactivate', requireRole('master_admin', 'admin'), async (c) => {
  const id = c.req.param('id')
  const actingUser = c.get('user')!
  await c.env.DB.prepare(`UPDATE users SET status = 'active', updated_at = ? WHERE id = ?`).bind(nowIso(), id).run()
  await logAudit(c.env.DB, { userId: actingUser.id, userName: actingUser.name, action: 'reactivate_user', entityType: 'user', entityId: id })
  return c.json({ message: 'User reactivated' })
})

// Regenerate personal token
users.post('/:id/regenerate-token', requireRole('master_admin', 'admin'), async (c) => {
  const id = c.req.param('id')
  const actingUser = c.get('user')!
  const personalToken = generateToken(24)
  const { hash } = await hashToken(personalToken)
  await c.env.DB.prepare(`UPDATE users SET token_hash = ?, token_expires_at = ?, updated_at = ? WHERE id = ?`)
    .bind(hash, addHours(new Date(), 24 * 90), nowIso(), id)
    .run()
  await logAudit(c.env.DB, { userId: actingUser.id, userName: actingUser.name, action: 'regenerate_token', entityType: 'user', entityId: id })
  return c.json({ message: 'Token regenerated. Share it securely — it will not be shown again.', personal_token: personalToken })
})

// Revoke token
users.post('/:id/revoke-token', requireRole('master_admin', 'admin'), async (c) => {
  const id = c.req.param('id')
  const actingUser = c.get('user')!
  await c.env.DB.prepare(`UPDATE users SET token_hash = NULL, token_expires_at = NULL, updated_at = ? WHERE id = ?`)
    .bind(nowIso(), id)
    .run()
  await logAudit(c.env.DB, { userId: actingUser.id, userName: actingUser.name, action: 'revoke_token', entityType: 'user', entityId: id })
  return c.json({ message: 'Token revoked' })
})

// Update role/permissions (master_admin only for role changes involving master_admin)
users.put('/:id', requireRole('master_admin', 'admin'), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ name?: string; role?: string; is_client_manager?: boolean }>()
  const actingUser = c.get('user')!

  if (body.role === 'master_admin' && actingUser.role !== 'master_admin') {
    return c.json({ error: 'forbidden' }, 403)
  }

  const fields: string[] = []
  const values: any[] = []
  if (body.name) {
    fields.push('name = ?')
    values.push(body.name)
  }
  if (body.role) {
    fields.push('role = ?')
    values.push(body.role)
  }
  if (body.is_client_manager !== undefined) {
    fields.push('is_client_manager = ?')
    values.push(body.is_client_manager ? 1 : 0)
  }
  fields.push('updated_at = ?')
  values.push(nowIso())
  values.push(id)

  await c.env.DB.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()
  await logAudit(c.env.DB, { userId: actingUser.id, userName: actingUser.name, action: 'update_user', entityType: 'user', entityId: id, details: body })
  return c.json({ message: 'User updated' })
})

// Soft delete (archive) a user - Admin/Master Admin only, protects last active master_admin
users.delete('/:id', requireRole('master_admin', 'admin'), async (c) => {
  const id = c.req.param('id')
  const actingUser = c.get('user')!
  const target = await c.env.DB.prepare(`SELECT role FROM users WHERE id = ?`).bind(id).first<any>()
  if (!target) return c.json({ error: 'not_found' }, 404)
  if (target.role === 'master_admin') {
    const count = await c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM users WHERE role = 'master_admin' AND deleted_at IS NULL`
    ).first<any>()
    if ((count?.n || 0) <= 1) {
      return c.json({ error: 'forbidden', message: 'Cannot delete the last Master Admin' }, 403)
    }
  }
  if (id === actingUser.id) {
    return c.json({ error: 'forbidden', message: 'You cannot delete your own account' }, 403)
  }
  await c.env.DB.prepare(`UPDATE users SET deleted_at = ?, status = 'suspended', updated_at = ? WHERE id = ?`)
    .bind(nowIso(), nowIso(), id)
    .run()
  await logAudit(c.env.DB, { userId: actingUser.id, userName: actingUser.name, action: 'soft_delete_user', entityType: 'user', entityId: id })
  return c.json({ message: 'User archived' })
})

export default users
