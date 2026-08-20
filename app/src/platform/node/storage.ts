import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AppObjectStorage } from '../../types/bindings'

type PutOptions = {
  httpMetadata?: {
    contentType?: string
  }
}

function encodeKey(key: string) {
  return key.split('/').map((part) => encodeURIComponent(part)).join(path.sep)
}

export class FileObjectStorage implements AppObjectStorage {
  constructor(private readonly basePath: string) {}

  private resolvePath(key: string) {
    return path.join(this.basePath, encodeKey(key))
  }

  async put(key: string, value: ArrayBuffer | Uint8Array | string, options?: PutOptions) {
    const filePath = this.resolvePath(key)
    await mkdir(path.dirname(filePath), { recursive: true })

    const buffer =
      typeof value === 'string'
        ? Buffer.from(value)
        : value instanceof Uint8Array
          ? Buffer.from(value)
          : Buffer.from(value)

    await writeFile(filePath, buffer)

    if (options?.httpMetadata?.contentType) {
      await writeFile(`${filePath}.meta.json`, JSON.stringify(options.httpMetadata))
    }
  }

  async get(key: string) {
    const filePath = this.resolvePath(key)
    try {
      const body = await readFile(filePath)
      return {
        body,
        httpMetadata: undefined
      }
    } catch {
      return null
    }
  }
}
