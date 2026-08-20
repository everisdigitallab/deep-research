import { Hono } from 'hono'
import type { AppContext, AppDatabase } from '../types/bindings'
import { generateUUID, nowIso } from '../lib/crypto'
import { logAudit } from '../lib/audit'
import { requireRole } from '../middleware/auth'

const masterclass = new Hono<AppContext>()

// ---------- Modules ----------
masterclass.get('/editions/:editionId/modules', async (c) => {
  const editionId = c.req.param('editionId')
  const rows = await c.env.DB.prepare(`SELECT * FROM masterclass_modules WHERE edition_id = ? ORDER BY order_index`)
    .bind(editionId)
    .all()
  return c.json(rows.results)
})

masterclass.post('/editions/:editionId/modules', requireRole('master_admin', 'admin'), async (c) => {
  const editionId = c.req.param('editionId')
  const body = await c.req.json<any>()
  const id = generateUUID()
  await c.env.DB.prepare(
    `INSERT INTO masterclass_modules (id, edition_id, code, title, description, order_index, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, editionId, body.code, body.title, body.description || null, body.order_index || 0, nowIso())
    .run()
  return c.json({ id, ...body }, 201)
})

masterclass.put('/modules/:moduleId', requireRole('master_admin', 'admin'), async (c) => {
  const moduleId = c.req.param('moduleId')
  const body = await c.req.json<any>()
  const fields = ['code', 'title', 'description', 'order_index']
  const sets: string[] = []
  const values: any[] = []
  for (const f of fields) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`)
      values.push(body[f])
    }
  }
  if (sets.length === 0) return c.json({ error: 'validation_error', message: 'No fields to update' }, 400)
  values.push(moduleId)
  await c.env.DB.prepare(`UPDATE masterclass_modules SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run()
  return c.json({ message: 'Module updated' })
})

masterclass.delete('/modules/:moduleId', requireRole('master_admin', 'admin'), async (c) => {
  const moduleId = c.req.param('moduleId')
  await c.env.DB.prepare(`DELETE FROM masterclass_contents WHERE module_id = ?`).bind(moduleId).run()
  await c.env.DB.prepare(`DELETE FROM masterclass_modules WHERE id = ?`).bind(moduleId).run()
  return c.json({ message: 'Module deleted' })
})

// ---------- Contents ----------
masterclass.get('/modules/:moduleId/contents', async (c) => {
  const moduleId = c.req.param('moduleId')
  const rows = await c.env.DB.prepare(`SELECT * FROM masterclass_contents WHERE module_id = ? ORDER BY order_index`)
    .bind(moduleId)
    .all()
  return c.json(rows.results)
})

masterclass.post('/modules/:moduleId/contents', requireRole('master_admin', 'admin'), async (c) => {
  const moduleId = c.req.param('moduleId')
  const body = await c.req.json<any>()
  const id = generateUUID()
  await c.env.DB.prepare(
    `INSERT INTO masterclass_contents (id, module_id, type, title, description, content_url, text_body, is_required, duration_seconds, order_index, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      moduleId,
      body.type,
      body.title,
      body.description || null,
      body.content_url || null,
      body.text_body || null,
      body.is_required !== false ? 1 : 0,
      body.duration_seconds || null,
      body.order_index || 0,
      nowIso()
    )
    .run()
  return c.json({ id, ...body }, 201)
})

masterclass.put('/contents/:contentId', requireRole('master_admin', 'admin'), async (c) => {
  const contentId = c.req.param('contentId')
  const body = await c.req.json<any>()
  const fields = ['type', 'title', 'description', 'content_url', 'text_body', 'is_required', 'duration_seconds', 'order_index']
  const sets: string[] = []
  const values: any[] = []
  for (const f of fields) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`)
      values.push(f === 'is_required' ? (body[f] ? 1 : 0) : body[f])
    }
  }
  if (sets.length === 0) return c.json({ error: 'validation_error', message: 'No fields to update' }, 400)
  values.push(contentId)
  await c.env.DB.prepare(`UPDATE masterclass_contents SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run()
  return c.json({ message: 'Content updated' })
})

masterclass.delete('/contents/:contentId', requireRole('master_admin', 'admin'), async (c) => {
  const contentId = c.req.param('contentId')
  await c.env.DB.prepare(`DELETE FROM video_progress WHERE content_id = ?`).bind(contentId).run()
  await c.env.DB.prepare(`DELETE FROM masterclass_contents WHERE id = ?`).bind(contentId).run()
  return c.json({ message: 'Content deleted' })
})

// ---------- Video progress ----------
// Merges a new watched segment [start,end] into the stored segment list,
// computes percent watched, and marks completion at >=90% unique coverage.
masterclass.post('/contents/:contentId/progress', async (c) => {
  const contentId = c.req.param('contentId')
  const user = c.get('user')
  if (!user) return c.json({ error: 'unauthenticated' }, 401)
  const body = await c.req.json<{ segment_start: number; segment_end: number; playback_speed?: number; position?: number }>()

  const content = await c.env.DB.prepare(`SELECT * FROM masterclass_contents WHERE id = ?`).bind(contentId).first<any>()
  if (!content) return c.json({ error: 'not_found' }, 404)

  let progress = await c.env.DB.prepare(`SELECT * FROM video_progress WHERE user_id = ? AND content_id = ?`)
    .bind(user.id, contentId)
    .first<any>()

  let segments: [number, number][] = progress ? JSON.parse(progress.segments_watched) : []
  segments.push([body.segment_start, body.segment_end])
  segments = mergeSegments(segments)

  const totalWatched = segments.reduce((sum, [s, e]) => sum + (e - s), 0)
  const duration = content.duration_seconds || 1
  const percent = Math.min(100, Math.round((totalWatched / duration) * 10000) / 100)
  const isCompleted = percent >= 90

  if (progress) {
    await c.env.DB.prepare(
      `UPDATE video_progress SET segments_watched = ?, percent_watched = ?, playback_speed = ?, last_position_seconds = ?,
       last_access_at = ?, completed_at = COALESCE(completed_at, ?), started_at = COALESCE(started_at, ?), updated_at = ?
       WHERE id = ?`
    )
      .bind(
        JSON.stringify(segments),
        percent,
        body.playback_speed || progress.playback_speed || 1,
        body.position ?? progress.last_position_seconds,
        nowIso(),
        isCompleted ? nowIso() : null,
        progress.started_at || nowIso(),
        nowIso(),
        progress.id
      )
      .run()
  } else {
    const id = generateUUID()
    await c.env.DB.prepare(
      `INSERT INTO video_progress (id, user_id, content_id, segments_watched, percent_watched, playback_speed, started_at, completed_at, last_position_seconds, last_access_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        user.id,
        contentId,
        JSON.stringify(segments),
        percent,
        body.playback_speed || 1,
        nowIso(),
        isCompleted ? nowIso() : null,
        body.position || 0,
        nowIso(),
        nowIso()
      )
      .run()
  }

  // Re-check module completion
  await recomputeModuleCompletion(c.env.DB, user.id, content.module_id)

  return c.json({ percent_watched: percent, completed: isCompleted })
})

masterclass.get('/contents/:contentId/progress', async (c) => {
  const contentId = c.req.param('contentId')
  const user = c.get('user')
  if (!user) return c.json({ error: 'unauthenticated' }, 401)
  const progress = await c.env.DB.prepare(`SELECT * FROM video_progress WHERE user_id = ? AND content_id = ?`)
    .bind(user.id, contentId)
    .first()
  return c.json(progress || { percent_watched: 0, completed_at: null })
})

masterclass.get('/editions/:editionId/my-progress', async (c) => {
  const editionId = c.req.param('editionId')
  const user = c.get('user')
  if (!user) return c.json({ error: 'unauthenticated' }, 401)

  const modules = await c.env.DB.prepare(`SELECT * FROM masterclass_modules WHERE edition_id = ? ORDER BY order_index`)
    .bind(editionId)
    .all<any>()

  const result = []
  for (const mod of modules.results || []) {
    const completion = await c.env.DB.prepare(`SELECT completed_at FROM module_progress WHERE user_id = ? AND module_id = ?`)
      .bind(user.id, mod.id)
      .first<any>()
    result.push({ ...mod, completed_at: completion?.completed_at || null })
  }
  return c.json(result)
})

async function recomputeModuleCompletion(db: AppDatabase, userId: string, moduleId: string) {
  const contents = await db
    .prepare(`SELECT id FROM masterclass_contents WHERE module_id = ? AND is_required = 1`)
    .bind(moduleId)
    .all<{ id: string }>()
  const requiredIds = (contents.results || []).map((r) => r.id)
  if (requiredIds.length === 0) return

  const completed = await db
    .prepare(
      `SELECT content_id FROM video_progress WHERE user_id = ? AND completed_at IS NOT NULL AND content_id IN (${requiredIds
        .map(() => '?')
        .join(',')})`
    )
    .bind(userId, ...requiredIds)
    .all<{ content_id: string }>()
  const completedIds = new Set((completed.results || []).map((r) => r.content_id))
  const allDone = requiredIds.every((id) => completedIds.has(id))

  if (allDone) {
    const existing = await db.prepare(`SELECT id FROM module_progress WHERE user_id = ? AND module_id = ?`).bind(userId, moduleId).first()
    if (!existing) {
      await db
        .prepare(`INSERT INTO module_progress (id, user_id, module_id, completed_at) VALUES (?, ?, ?, ?)`)
        .bind(generateUUID(), userId, moduleId, nowIso())
        .run()
    }
  }
}

function mergeSegments(segments: [number, number][]): [number, number][] {
  if (segments.length === 0) return []
  const sorted = [...segments].sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]
    const [start, end] = sorted[i]
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end)
    } else {
      merged.push([start, end])
    }
  }
  return merged
}

// ---------- Certificates ----------
masterclass.post('/editions/:editionId/certificates/issue', async (c) => {
  const editionId = c.req.param('editionId')
  const user = c.get('user')
  if (!user) return c.json({ error: 'unauthenticated' }, 401)

  const modules = await c.env.DB.prepare(`SELECT id FROM masterclass_modules WHERE edition_id = ?`).bind(editionId).all<any>()
  const moduleIds = (modules.results || []).map((m: any) => m.id)
  if (moduleIds.length === 0) return c.json({ error: 'no_modules', message: 'No masterclass modules configured' }, 400)

  const completed = await c.env.DB.prepare(
    `SELECT module_id FROM module_progress WHERE user_id = ? AND module_id IN (${moduleIds.map(() => '?').join(',')})`
  )
    .bind(user.id, ...moduleIds)
    .all<any>()
  const completedIds = new Set((completed.results || []).map((r: any) => r.module_id))
  const allDone = moduleIds.every((id: string) => completedIds.has(id))
  if (!allDone) {
    return c.json({ error: 'not_completed', message: 'Masterclass not fully completed yet' }, 400)
  }

  const existing = await c.env.DB.prepare(`SELECT * FROM certificates WHERE user_id = ? AND edition_id = ? AND status = 'valid'`)
    .bind(user.id, editionId)
    .first()
  if (existing) return c.json(existing)

  const id = generateUUID()
  const code = `CERT-${editionId.slice(0, 6).toUpperCase()}-${id.slice(0, 8).toUpperCase()}`
  const validationCode = generateUUID().slice(0, 12).toUpperCase()

  await c.env.DB.prepare(
    `INSERT INTO certificates (id, user_id, edition_id, code, validation_code, issued_at, hours, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'valid')`
  )
    .bind(id, user.id, editionId, code, validationCode, nowIso(), moduleIds.length * 2)
    .run()

  await logAudit(c.env.DB, {
    userId: user.id,
    userName: user.name,
    action: 'issue_certificate',
    entityType: 'certificate',
    entityId: id
  })

  return c.json({ id, code, validation_code: validationCode, issued_at: nowIso() }, 201)
})

masterclass.get('/certificates/validate/:code', async (c) => {
  const code = c.req.param('code')
  const cert = await c.env.DB.prepare(
    `SELECT c.*, u.name as user_name, e.name as edition_name FROM certificates c
     JOIN users u ON u.id = c.user_id JOIN editions e ON e.id = c.edition_id
     WHERE c.validation_code = ?`
  )
    .bind(code)
    .first()
  if (!cert) return c.json({ valid: false }, 404)
  return c.json({ valid: (cert as any).status === 'valid', certificate: cert })
})

masterclass.get('/my-certificates', async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'unauthenticated' }, 401)
  const rows = await c.env.DB.prepare(
    `SELECT c.*, e.name as edition_name FROM certificates c JOIN editions e ON e.id = c.edition_id WHERE c.user_id = ? ORDER BY issued_at DESC`
  )
    .bind(user.id)
    .all()
  return c.json(rows.results)
})

export default masterclass
