import { Hono } from 'hono'
import type { AppContext } from '../types/bindings'
import { nowIso, generateUUID } from '../lib/crypto'
import { logAudit } from '../lib/audit'
import { requireRole, authGuard } from '../middleware/auth'

const aiConfig = new Hono<AppContext>()
aiConfig.use('*', authGuard)

// Returns config WITHOUT exposing any secret values.
aiConfig.get('/', requireRole('master_admin'), async (c) => {
  const row = await c.env.DB.prepare(`SELECT * FROM ai_configuration WHERE id = 'singleton'`).first<any>()
  if (!row) {
    return c.json({ enabled: false, configured: false })
  }
  const { key_vault_secret_ref, ...safe } = row
  return c.json({ ...safe, configured: !!row.azure_endpoint, has_secret_ref: !!key_vault_secret_ref })
})

aiConfig.put('/', requireRole('master_admin'), async (c) => {
  const body = await c.req.json<any>()
  const user = c.get('user')!

  const existing = await c.env.DB.prepare(`SELECT id FROM ai_configuration WHERE id = 'singleton'`).first()
  if (existing) {
    await c.env.DB.prepare(
      `UPDATE ai_configuration SET enabled=?, azure_endpoint=?, deployment_name=?, api_version=?, auth_method=?,
       key_vault_secret_ref=?, timeout_ms=?, max_tokens=?, temperature=?, updated_at=?, updated_by=? WHERE id='singleton'`
    )
      .bind(
        body.enabled ? 1 : 0,
        body.azure_endpoint || null,
        body.deployment_name || null,
        body.api_version || null,
        body.auth_method || 'key_vault',
        body.key_vault_secret_ref || null,
        body.timeout_ms || 30000,
        body.max_tokens || 2000,
        body.temperature ?? 0.3,
        nowIso(),
        user.id
      )
      .run()
  } else {
    await c.env.DB.prepare(
      `INSERT INTO ai_configuration (id, enabled, azure_endpoint, deployment_name, api_version, auth_method, key_vault_secret_ref, timeout_ms, max_tokens, temperature, updated_at, updated_by)
       VALUES ('singleton', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        body.enabled ? 1 : 0,
        body.azure_endpoint || null,
        body.deployment_name || null,
        body.api_version || null,
        body.auth_method || 'key_vault',
        body.key_vault_secret_ref || null,
        body.timeout_ms || 30000,
        body.max_tokens || 2000,
        body.temperature ?? 0.3,
        nowIso(),
        user.id
      )
      .run()
  }

  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'update_ai_configuration', entityType: 'ai_configuration', entityId: 'singleton' })
  return c.json({ message: 'AI configuration updated. Note: no secret values are stored in this table — configure the actual key via Cloudflare secret and reference it by name.' })
})

// AI execution history (read-only list; actual generation functions are out
// of scope for this MVP since it requires a configured Azure OpenAI endpoint
// which is NOT available in this Cloudflare-only environment).
aiConfig.get('/executions', requireRole('master_admin', 'admin'), async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM ai_executions ORDER BY created_at DESC LIMIT 100`).all()
  return c.json(rows.results)
})

// Any AI function call attempt returns a clear "not configured" response
// until enabled=1 AND azure_endpoint is set — enforced here, not in the frontend.
aiConfig.post('/execute/:functionName', requireRole('master_admin', 'admin', 'executive', 'legal'), async (c) => {
  const config = await c.env.DB.prepare(`SELECT * FROM ai_configuration WHERE id = 'singleton'`).first<any>()
  const user = c.get('user')!
  const functionName = c.req.param('functionName')

  if (!config || !config.enabled || !config.azure_endpoint) {
    const execId = generateUUID()
    await c.env.DB.prepare(
      `INSERT INTO ai_executions (id, user_id, function_name, status, error_text, created_at) VALUES (?, ?, ?, 'failed', ?, ?)`
    )
      .bind(execId, user.id, functionName, 'AI not configured. A Master Admin must configure Azure OpenAI in Administration > AI Configuration.', nowIso())
      .run()
    return c.json({ error: 'ai_not_configured', message: 'AI features are disabled until a Master Admin configures Azure OpenAI.' }, 503)
  }

  // NOTE: Actual call to Azure OpenAI is intentionally NOT implemented in this
  // MVP: this sandbox has no Azure subscription/credentials, and the spec
  // requires Managed Identity / Key Vault which only exist in real Azure.
  // This endpoint is wired end-to-end (DB, audit, human-in-the-loop contract)
  // so a real Azure OpenAI call can be dropped in later without touching the
  // rest of the system.
  return c.json({ error: 'not_implemented', message: 'Azure OpenAI call not implemented in this Cloudflare-only MVP. See README limitations.' }, 501)
})

export default aiConfig
