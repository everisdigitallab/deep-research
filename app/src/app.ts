import { Hono, type MiddlewareHandler } from 'hono'
import { cors } from 'hono/cors'
import type { AppContext } from './types/bindings'
import { renderShell } from './lib/render-shell'
import { resolveUser } from './middleware/auth'

import authRoutes from './routes/auth'
import usersRoutes from './routes/users'
import masterDataRoutes from './routes/master-data'
import dashboardRoutes from './routes/dashboard'
import auditRoutes from './routes/audit'

export function createApp(staticAssets?: MiddlewareHandler<AppContext>) {
  const app = new Hono<AppContext>()
  const serviceName = typeof process !== 'undefined' ? process.env.APP_NAME || 'app' : 'app'

  app.use('/api/*', cors({ credentials: true, origin: (origin) => origin }))
  app.use('/api/*', resolveUser)

  app.route('/api/auth', authRoutes)
  app.route('/api/users', usersRoutes)
  app.route('/api/master-data', masterDataRoutes)
  app.route('/api/dashboard', dashboardRoutes)
  app.route('/api/audit', auditRoutes)

  app.get('/api/health', (c) => c.json({ status: 'ok', service: serviceName }))

  if (staticAssets) {
    app.use('/static/*', staticAssets)
  }

  app.get('*', (c) => c.html(renderShell()))

  return app
}
