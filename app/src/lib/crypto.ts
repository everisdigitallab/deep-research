// Crypto helpers using Web Crypto API (available in Cloudflare Workers runtime).
// NOTE: The original spec requested Argon2id. Argon2id is not natively available
// in the Cloudflare Workers runtime (no native crypto module / WASM budget concerns
// for this MVP), so we use SHA-256 with a random per-token salt as a pragmatic
// substitute. This is documented as a known limitation in README.md.

export function generateToken(bytesLength = 32): string {
  const bytes = new Uint8Array(bytesLength)
  crypto.getRandomValues(bytes)
  return bufferToHex(bytes)
}

export function generateUUID(): string {
  return crypto.randomUUID()
}

export async function hashToken(token: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const useSalt = salt || generateToken(16)
  const encoder = new TextEncoder()
  const data = encoder.encode(useSalt + ':' + token)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const hash = bufferToHex(new Uint8Array(digest))
  return { hash: `${useSalt}:${hash}`, salt: useSalt }
}

export async function verifyToken(token: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !storedHash.includes(':')) return false
  const [salt] = storedHash.split(':')
  const { hash } = await hashToken(token, salt)
  return timingSafeEqual(hash, storedHash)
}

function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function addHours(date: Date, hours: number): string {
  return new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString()
}

export function addDays(date: Date, days: number): string {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
}
