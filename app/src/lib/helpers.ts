import type { AppDatabase, AuthUser } from '../types/bindings'

export function isPrivileged(user: AuthUser): boolean {
  return user.role === 'master_admin' || user.role === 'admin'
}

/**
 * Checks whether an Executive has completed all required Masterclass modules
 * for a given edition. Master Admin, Admin and Legal are exempt (per spec).
 */
export async function hasMasterclassGate(db: AppDatabase, user: AuthUser, editionId: string): Promise<boolean> {
  if (user.role !== 'executive') return true // gate only applies to Executives

  const modules = await db
    .prepare(`SELECT id FROM masterclass_modules WHERE edition_id = ?`)
    .bind(editionId)
    .all<{ id: string }>()

  const moduleIds = (modules.results || []).map((m) => m.id)
  if (moduleIds.length === 0) return true // no masterclass configured for this edition yet

  const completed = await db
    .prepare(
      `SELECT module_id FROM module_progress WHERE user_id = ? AND completed_at IS NOT NULL AND module_id IN (${moduleIds
        .map(() => '?')
        .join(',')})`
    )
    .bind(user.id, ...moduleIds)
    .all<{ module_id: string }>()

  const completedIds = new Set((completed.results || []).map((r) => r.module_id))
  return moduleIds.every((id) => completedIds.has(id))
}

/**
 * Checks whether a user can edit a specific moonshot.
 * master_admin/admin: always. executive: only if linked via moonshot_members
 * or is owner/project_lead/tech_lead. legal: only legal fields (checked separately).
 */
export async function canEditMoonshot(db: AppDatabase, user: AuthUser, moonshotId: string): Promise<boolean> {
  if (isPrivileged(user)) return true
  const ms = await db
    .prepare(`SELECT owner_id, project_lead_id, tech_lead_id FROM moonshots WHERE id = ?`)
    .bind(moonshotId)
    .first<any>()
  if (!ms) return false
  if (ms.owner_id === user.id || ms.project_lead_id === user.id || ms.tech_lead_id === user.id) return true

  const member = await db
    .prepare(`SELECT id FROM moonshot_members WHERE moonshot_id = ? AND user_id = ?`)
    .bind(moonshotId, user.id)
    .first()
  return !!member
}

/**
 * Financial visibility: master_admin, admin, client managers, and users
 * explicitly granted 'financial_viewer' role_in_project.
 */
export async function canViewFinancials(db: AppDatabase, user: AuthUser, moonshotId?: string): Promise<boolean> {
  if (isPrivileged(user)) return true
  if (user.is_client_manager) return true
  if (!moonshotId) return false
  const grant = await db
    .prepare(
      `SELECT id FROM moonshot_members WHERE moonshot_id = ? AND user_id = ? AND role_in_project = 'financial_viewer'`
    )
    .bind(moonshotId, user.id)
    .first()
  return !!grant
}

export function convertToEur(amount: number, currencyCode: string, rateToEur: number | null | undefined): number {
  if (currencyCode === 'EUR') return amount
  if (!rateToEur) return amount // fallback: no rate provided yet
  return Math.round(amount * rateToEur * 100) / 100
}

export function safeDiv(numerator: number, denominator: number): number | null {
  if (!denominator) return null
  return Math.round((numerator / denominator) * 10000) / 10000
}

export function paginationParams(query: Record<string, string | undefined>) {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(query.page_size || '20', 10) || 20))
  const offset = (page - 1) * pageSize
  return { page, pageSize, offset }
}
