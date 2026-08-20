import type { AppDatabase } from '../types/bindings'
import { generateUUID, nowIso } from './crypto'

export async function logAudit(
  db: AppDatabase,
  params: {
    userId?: string | null
    userName?: string | null
    action: string
    entityType?: string | null
    entityId?: string | null
    details?: Record<string, unknown> | null
    ipAddress?: string | null
  }
): Promise<void> {
  const id = generateUUID()
  await db
    .prepare(
      `INSERT INTO audit_log (id, user_id, user_name, action, entity_type, entity_id, details, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      params.userId ?? null,
      params.userName ?? null,
      params.action,
      params.entityType ?? null,
      params.entityId ?? null,
      params.details ? JSON.stringify(params.details) : null,
      params.ipAddress ?? null,
      nowIso()
    )
    .run()
}
