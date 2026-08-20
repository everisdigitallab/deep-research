import { Context, Next } from 'hono'
import { verifyToken } from '../lib/crypto'
import type { AppContext, AuthUser, Role } from '../types/bindings'

// Session cookie name
export const SESSION_COOKIE = 'app_session'

function getCookie(c: Context, name: string): string | undefined {
  const header = c.req.header('Cookie')
  if (!header) return undefined
  const match = header.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='))
  if (!match) return undefined
  return decodeURIComponent(match.substring(name.length + 1))
}

/**
 * Resolves the current user from either:
 * 1. Authorization: Bearer <personal_token>  (API usage)
 * 2. Session cookie (browser usage) -> looked up in `sessions` table
 * Does NOT block the request if unauthenticated; sets c.get('user') = undefined.
 */
export async function resolveUser(c: Context<AppContext>, next: Next) {
  const db = c.env.DB
  let user: AuthUser | undefined

  try {
    const authHeader = c.req.header('Authorization')
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined
    const sessionCookie = getCookie(c, SESSION_COOKIE)

    if (bearerToken) {
      // Personal access token flow
      const candidates = await db
        .prepare(
          `SELECT id, name, email, role, is_client_manager, status, locale, token_hash, token_expires_at
           FROM users WHERE status = 'active' AND deleted_at IS NULL AND token_hash IS NOT NULL`
        )
        .all<any>()
      for (const row of candidates.results || []) {
        if (row.token_expires_at && new Date(row.token_expires_at) < new Date()) continue
        const ok = await verifyToken(bearerToken, row.token_hash)
        if (ok) {
          user = {
            id: row.id,
            name: row.name,
            email: row.email,
            role: row.role,
            is_client_manager: row.is_client_manager,
            status: row.status,
            locale: row.locale
          }
          break
        }
      }
    } else if (sessionCookie) {
      const [sessionId, rawToken] = sessionCookie.split('.')
      if (sessionId && rawToken) {
        const session = await db
          .prepare(`SELECT * FROM sessions WHERE id = ? AND revoked_at IS NULL`)
          .bind(sessionId)
          .first<any>()
        if (session && new Date(session.expires_at) > new Date()) {
          const ok = await verifyToken(rawToken, session.session_token_hash)
          if (ok) {
            const row = await db
              .prepare(
                `SELECT id, name, email, role, is_client_manager, status, locale
                 FROM users WHERE id = ? AND status = 'active' AND deleted_at IS NULL`
              )
              .bind(session.user_id)
              .first<any>()
            if (row) {
              user = row as AuthUser
            }
          }
        }
      }
    }
  } catch (e) {
    // fail closed - user stays undefined
    console.error('resolveUser error', e)
  }

  c.set('user', user)
  await next()
}

export function requireAuth(c: Context<AppContext>): AuthUser | null {
  const user = c.get('user')
  return user ?? null
}

export function requireRole(...roles: Role[]) {
  return async (c: Context<AppContext>, next: Next) => {
    const user = c.get('user')
    if (!user) {
      return c.json({ error: 'unauthenticated', message: 'Authentication required' }, 401)
    }
    if (!roles.includes(user.role)) {
      return c.json({ error: 'forbidden', message: 'Insufficient role permissions' }, 403)
    }
    await next()
  }
}

export async function authGuard(c: Context<AppContext>, next: Next) {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'unauthenticated', message: 'Authentication required' }, 401)
  }
  await next()
}
