import { Hono } from 'hono'
import type { AppContext } from '../types/bindings'
import { generateUUID, generateToken, hashToken, verifyToken, nowIso, addHours, addDays } from '../lib/crypto'
import { logAudit } from '../lib/audit'
import { SESSION_COOKIE } from '../middleware/auth'

const auth = new Hono<AppContext>()

// ---------------------------------------------------------------------------
// POST /api/auth/bootstrap
// One-time bootstrap of the first Master Admin using ADMIN_BOOTSTRAP_TOKEN.
// The secret itself is never hardcoded; it must be set via wrangler secret
// (production) or .dev.vars (local dev). If it is not configured, bootstrap
// is disabled entirely.
// ---------------------------------------------------------------------------
auth.post('/bootstrap', async (c) => {
  const bootstrapSecret = c.env.ADMIN_BOOTSTRAP_TOKEN
  if (!bootstrapSecret) {
    return c.json({ error: 'not_configured', message: 'ADMIN_BOOTSTRAP_TOKEN not configured' }, 503)
  }
  const body = await c.req.json<{ bootstrap_token: string; name: string; email: string }>().catch(() => null)
  if (!body || body.bootstrap_token !== bootstrapSecret) {
    return c.json({ error: 'invalid_bootstrap_token' }, 401)
  }
  if (!body.name || !body.email) {
    return c.json({ error: 'validation_error', message: 'name and email are required' }, 400)
  }

  const db = c.env.DB
  const existingMaster = await db
    .prepare(`SELECT id FROM users WHERE role = 'master_admin' AND deleted_at IS NULL LIMIT 1`)
    .first()
  if (existingMaster) {
    return c.json({ error: 'already_bootstrapped', message: 'A Master Admin already exists' }, 409)
  }

  const id = generateUUID()
  const personalToken = generateToken(24)
  const { hash } = await hashToken(personalToken)

  await db
    .prepare(
      `INSERT INTO users (id, name, email, role, status, token_hash, token_expires_at, created_at, updated_at)
       VALUES (?, ?, ?, 'master_admin', 'active', ?, ?, ?, ?)`
    )
    .bind(id, body.name, body.email.toLowerCase(), hash, addDays(new Date(), 90), nowIso(), nowIso())
    .run()

  await logAudit(db, { userId: id, userName: body.name, action: 'bootstrap_master_admin', entityType: 'user', entityId: id })

  return c.json({
    message: 'Master Admin created. Save this personal token now — it will not be shown again.',
    user: { id, name: body.name, email: body.email },
    personal_token: personalToken
  })
})

// ---------------------------------------------------------------------------
// POST /api/auth/activate
// First-access flow: user redeems an activation token (issued by an Admin),
// accepts terms/privacy, picks a locale, and receives a permanent personal token.
// ---------------------------------------------------------------------------
auth.post('/activate', async (c) => {
  const body = await c.req.json<{ activation_token: string; locale: string; accept_terms: boolean; accept_privacy: boolean }>().catch(() => null)
  if (!body?.activation_token) {
    return c.json({ error: 'validation_error', message: 'activation_token is required' }, 400)
  }
  if (!body.accept_terms || !body.accept_privacy) {
    return c.json({ error: 'validation_error', message: 'Terms and privacy policy must be accepted' }, 400)
  }

  const db = c.env.DB
  const candidates = await db
    .prepare(
      `SELECT id, name, email, activation_token_hash, activation_token_expires_at
       FROM users WHERE status = 'pending_activation' AND deleted_at IS NULL AND activation_token_hash IS NOT NULL`
    )
    .all<any>()

  let matchedUser: any = null
  for (const row of candidates.results || []) {
    if (row.activation_token_expires_at && new Date(row.activation_token_expires_at) < new Date()) continue
    const ok = await verifyToken(body.activation_token, row.activation_token_hash)
    if (ok) {
      matchedUser = row
      break
    }
  }

  if (!matchedUser) {
    return c.json({ error: 'invalid_or_expired_token' }, 401)
  }

  const personalToken = generateToken(24)
  const { hash } = await hashToken(personalToken)

  await db
    .prepare(
      `UPDATE users SET status = 'active', token_hash = ?, token_expires_at = ?,
       activation_token_hash = NULL, activation_token_expires_at = NULL,
       locale = ?, terms_accepted_at = ?, privacy_accepted_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(hash, addDays(new Date(), 90), body.locale || 'pt-BR', nowIso(), nowIso(), nowIso(), matchedUser.id)
    .run()

  await logAudit(db, { userId: matchedUser.id, userName: matchedUser.name, action: 'user_activated', entityType: 'user', entityId: matchedUser.id })

  return c.json({
    message: 'Account activated. Save this personal token now — it will not be shown again.',
    user: { id: matchedUser.id, name: matchedUser.name, email: matchedUser.email },
    personal_token: personalToken
  })
})

// ---------------------------------------------------------------------------
// POST /api/auth/login
// Exchanges a personal access token for a browser session cookie.
// ---------------------------------------------------------------------------
auth.post('/login', async (c) => {
  const body = await c.req.json<{ token: string }>().catch(() => null)
  if (!body?.token) {
    return c.json({ error: 'validation_error', message: 'token is required' }, 400)
  }

  const db = c.env.DB
  const ip = c.req.header('CF-Connecting-IP') || 'unknown'

  const users = await db
    .prepare(
      `SELECT id, name, email, role, status, token_hash, token_expires_at, failed_login_attempts, locked_until
       FROM users WHERE deleted_at IS NULL AND token_hash IS NOT NULL`
    )
    .all<any>()

  let matched: any = null
  for (const row of users.results || []) {
    const ok = await verifyToken(body.token, row.token_hash)
    if (ok) {
      matched = row
      break
    }
  }

  if (!matched) {
    return c.json({ error: 'invalid_credentials' }, 401)
  }
  if (matched.locked_until && new Date(matched.locked_until) > new Date()) {
    return c.json({ error: 'account_locked', message: 'Too many failed attempts. Try again later.' }, 423)
  }
  if (matched.status !== 'active') {
    return c.json({ error: 'account_not_active', message: `Account status: ${matched.status}` }, 403)
  }
  if (matched.token_expires_at && new Date(matched.token_expires_at) < new Date()) {
    return c.json({ error: 'token_expired', message: 'Personal token expired. Ask an Admin to regenerate it.' }, 401)
  }

  // Create session
  const sessionId = generateUUID()
  const sessionRawToken = generateToken(24)
  const { hash: sessionHash } = await hashToken(sessionRawToken)
  const expiresAt = addHours(new Date(), 8)

  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, session_token_hash, ip_address, user_agent, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(sessionId, matched.id, sessionHash, ip, c.req.header('User-Agent') || null, expiresAt, nowIso())
    .run()

  await db.prepare(`UPDATE users SET last_login_at = ?, failed_login_attempts = 0 WHERE id = ?`).bind(nowIso(), matched.id).run()
  await logAudit(db, { userId: matched.id, userName: matched.name, action: 'login', entityType: 'user', entityId: matched.id, ipAddress: ip })

  const cookieValue = `${sessionId}.${sessionRawToken}`
  c.header(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(cookieValue)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`
  )

  return c.json({
    user: { id: matched.id, name: matched.name, email: matched.email, role: matched.role }
  })
})

auth.post('/logout', async (c) => {
  const user = c.get('user')
  const db = c.env.DB
  const cookieHeader = c.req.header('Cookie') || ''
  const match = cookieHeader.split(';').map((s) => s.trim()).find((s) => s.startsWith(SESSION_COOKIE + '='))
  if (match) {
    const value = decodeURIComponent(match.substring(SESSION_COOKIE.length + 1))
    const [sessionId] = value.split('.')
    if (sessionId) {
      await db.prepare(`UPDATE sessions SET revoked_at = ? WHERE id = ?`).bind(nowIso(), sessionId).run()
    }
  }
  if (user) {
    await logAudit(db, { userId: user.id, userName: user.name, action: 'logout', entityType: 'user', entityId: user.id })
  }
  c.header('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`)
  return c.json({ message: 'Logged out' })
})

auth.get('/me', async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'unauthenticated' }, 401)
  return c.json({ user })
})

export default auth
