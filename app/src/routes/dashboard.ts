import { Hono } from 'hono'
import type { AppContext } from '../types/bindings'
import { authGuard } from '../middleware/auth'

const dashboard = new Hono<AppContext>()
dashboard.use('*', authGuard)

dashboard.get('/summary', async (c) => {
  const db = c.env.DB

  const [users, activeUsers, pendingUsers, countries, currencies, technologies, hubs, recentAudit, openSessions] =
    await Promise.all([
      db.prepare(`SELECT COUNT(*) as n FROM users WHERE deleted_at IS NULL`).first<any>(),
      db.prepare(`SELECT COUNT(*) as n FROM users WHERE deleted_at IS NULL AND status = 'active'`).first<any>(),
      db.prepare(`SELECT COUNT(*) as n FROM users WHERE deleted_at IS NULL AND status = 'pending_activation'`).first<any>(),
      db.prepare(`SELECT COUNT(*) as n FROM countries WHERE deleted_at IS NULL`).first<any>(),
      db.prepare(`SELECT COUNT(*) as n FROM currencies WHERE deleted_at IS NULL`).first<any>(),
      db.prepare(`SELECT COUNT(*) as n FROM technologies WHERE deleted_at IS NULL`).first<any>(),
      db.prepare(`SELECT COUNT(*) as n FROM hubs WHERE deleted_at IS NULL`).first<any>(),
      db.prepare(`SELECT action, entity_type, user_name, created_at FROM audit_log ORDER BY created_at DESC LIMIT 8`).all<any>(),
      db.prepare(`SELECT COUNT(*) as n FROM sessions WHERE revoked_at IS NULL AND expires_at > ?`).bind(new Date().toISOString()).first<any>()
    ])

  return c.json({
    users: {
      total: users?.n || 0,
      active: activeUsers?.n || 0,
      pending_activation: pendingUsers?.n || 0,
      active_sessions: openSessions?.n || 0
    },
    reference_data: {
      countries: countries?.n || 0,
      currencies: currencies?.n || 0,
      technologies: technologies?.n || 0,
      hubs: hubs?.n || 0
    },
    recent_audit: recentAudit.results
  })
})

export default dashboard
