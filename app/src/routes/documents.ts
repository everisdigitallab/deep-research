import { Hono } from 'hono'
import type { AppContext } from '../types/bindings'
import { generateUUID, nowIso } from '../lib/crypto'
import { logAudit } from '../lib/audit'
import { authGuard } from '../middleware/auth'

const documents = new Hono<AppContext>()
documents.use('*', authGuard)

const ALLOWED_MIME: Record<string, number> = {
  'application/pdf': 250 * 1024 * 1024,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 250 * 1024 * 1024, // docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 250 * 1024 * 1024, // xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 250 * 1024 * 1024, // pptx
  'image/png': 25 * 1024 * 1024,
  'image/jpeg': 25 * 1024 * 1024,
  'video/mp4': 5 * 1024 * 1024 * 1024,
  'video/webm': 5 * 1024 * 1024 * 1024
}

documents.get('/', async (c) => {
  const entityType = c.req.query('entity_type')
  const entityId = c.req.query('entity_id')
  if (!entityType || !entityId) {
    return c.json({ error: 'validation_error', message: 'entity_type and entity_id are required' }, 400)
  }
  const rows = await c.env.DB.prepare(
    `SELECT id, title, original_filename, mime_type, size_bytes, entity_type, entity_id, version, confidentiality, uploaded_by, created_at
     FROM documents WHERE entity_type = ? AND entity_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`
  )
    .bind(entityType, entityId)
    .all()
  return c.json(rows.results)
})

// Upload: multipart/form-data with `file` field and metadata fields.
documents.post('/', async (c) => {
  const user = c.get('user')!
  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  const entityType = formData.get('entity_type') as string
  const entityId = formData.get('entity_id') as string
  const title = (formData.get('title') as string) || file?.name || 'Untitled'
  const confidentiality = (formData.get('confidentiality') as string) || 'internal'

  if (!file || !entityType || !entityId) {
    return c.json({ error: 'validation_error', message: 'file, entity_type and entity_id are required' }, 400)
  }

  const mime = file.type || 'application/octet-stream'
  const maxSize = ALLOWED_MIME[mime]
  if (!maxSize) {
    return c.json({ error: 'invalid_file_type', message: `File type not allowed: ${mime}` }, 400)
  }
  if (file.size > maxSize) {
    return c.json({ error: 'file_too_large', message: `File exceeds limit of ${maxSize} bytes for type ${mime}` }, 400)
  }

  const id = generateUUID()
  const sanitizedName = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')
  const key = `${entityType}/${entityId}/${id}_${sanitizedName}`

  const buffer = await file.arrayBuffer()
  await c.env.R2.put(key, buffer, { httpMetadata: { contentType: mime } })

  await c.env.DB.prepare(
    `INSERT INTO documents (id, title, file_key, original_filename, mime_type, size_bytes, entity_type, entity_id, version, confidentiality, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
  )
    .bind(id, title, key, file.name, mime, file.size, entityType, entityId, confidentiality, user.id, nowIso())
    .run()

  await logAudit(c.env.DB, {
    userId: user.id,
    userName: user.name,
    action: 'upload_document',
    entityType,
    entityId,
    details: { document_id: id, filename: file.name, size: file.size }
  })

  return c.json({ id, title, file_key: key, mime_type: mime, size_bytes: file.size }, 201)
})

// Download: streams from R2 with access control (must be authenticated)
documents.get('/:id/download', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  const doc = await c.env.DB.prepare(`SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL`).bind(id).first<any>()
  if (!doc) return c.json({ error: 'not_found' }, 404)

  const object = await c.env.R2.get(doc.file_key)
  if (!object) return c.json({ error: 'file_not_found' }, 404)

  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'download_document', entityType: doc.entity_type, entityId: doc.entity_id, details: { document_id: id } })

  return new Response(object.body as any, {
    headers: {
      'Content-Type': doc.mime_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${doc.original_filename || 'file'}"`
    }
  })
})

documents.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!
  await c.env.DB.prepare(`UPDATE documents SET deleted_at = ? WHERE id = ?`).bind(nowIso(), id).run()
  await logAudit(c.env.DB, { userId: user.id, userName: user.name, action: 'soft_delete_document', entityType: 'document', entityId: id })
  return c.json({ message: 'Document archived' })
})

export default documents
