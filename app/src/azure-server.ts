import path from 'node:path'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createApp } from './app'
import { loadAppEnv } from './config/env'
import { bootstrapAzureRuntime } from './platform/node/bootstrap'
import tablesRoutes from './routes/tables'

function createStaticWebWithApiApp(staticSiteRoot: string) {
  const app = new Hono()
  const serviceName = process.env.APP_NAME || 'app'

  app.use('/api/*', cors({ credentials: true, origin: (origin) => origin }))
  app.use('/tables/*', cors({ credentials: true, origin: (origin) => origin }))
  app.get('/api/health', (c) => c.json({ status: 'ok', service: serviceName, mode: 'static-web-with-api' }))
  app.route('/tables', tablesRoutes)

  const staticAssets = serveStatic({
    root: `./${staticSiteRoot}`,
    rewriteRequestPath: (requestPath) => (requestPath === '/' ? '/index.html' : requestPath)
  })

  app.use('*', staticAssets)
  app.notFound((c) => c.text('Not Found', 404))

  return app
}

async function main() {
  const env = loadAppEnv()
  const port = Number(process.env.PORT || 3000)
  const shouldUseFullAppSchema = env.appMode === 'app-runtime'

  const bindings = await bootstrapAzureRuntime({
    databaseProvider: env.databaseProvider,
    databaseUrl: env.databaseUrl,
    sqlitePath: env.sqlitePath,
    documentsPath: env.documentsPath,
    staticApiTemplateFile: env.staticApiTemplate
      ? path.resolve(`${env.staticSiteRoot || 'webapp'}/static-api-templates/${env.staticApiTemplate}.json`)
      : undefined,
    sqliteMigrationsDir: shouldUseFullAppSchema ? path.resolve('migrations') : undefined,
    sqliteSeedFile: shouldUseFullAppSchema ? path.resolve('seed.sql') : undefined,
    postgresMigrationsDir: shouldUseFullAppSchema ? path.resolve('generated/postgres/migrations') : undefined,
    postgresSeedFile: shouldUseFullAppSchema ? path.resolve('generated/postgres/seed.sql') : undefined,
    autoRunMigrations: env.autoRunMigrations,
    autoSeedOnEmptyDb: env.autoSeedOnEmptyDb
  })

  const app =
    env.appMode === 'static-web-with-api'
      ? createStaticWebWithApiApp(env.staticSiteRoot || 'webapp')
      : createApp(
          serveStatic({
            root: './public'
          })
        )

  serve(
    {
      port,
      fetch: (request) =>
        app.fetch(request, {
          ...bindings,
          ADMIN_BOOTSTRAP_TOKEN: process.env.ADMIN_BOOTSTRAP_TOKEN
        })
    },
    (info) => {
      console.log(
        `Application runtime listening on http://localhost:${info.port} (${env.appRuntime}, env=${env.appEnv}, mode=${env.appMode})`
      )
    }
  )
}

main().catch((error) => {
  console.error('Failed to start Azure runtime', error)
  process.exit(1)
})
