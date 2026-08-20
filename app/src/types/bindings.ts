export type AppStatementResult = {
  success: boolean
  meta?: {
    changes?: number
    last_row_id?: number
  }
}

export interface AppPreparedStatement {
  bind(...values: unknown[]): AppPreparedStatement
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  first<T = Record<string, unknown>>(): Promise<T | null>
  run(): Promise<AppStatementResult>
}

export interface AppDatabase {
  prepare(sql: string): AppPreparedStatement
}

export interface AppObjectStorage {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: {
      httpMetadata?: {
        contentType?: string
      }
    }
  ): Promise<void>
  get(key: string): Promise<{ body: BodyInit | null; httpMetadata?: { contentType?: string } } | null>
}

export type Bindings = {
  DB: AppDatabase
  R2: AppObjectStorage
  ADMIN_BOOTSTRAP_TOKEN?: string
}

export type Role = 'master_admin' | 'admin' | 'executive' | 'legal'

export type AuthUser = {
  id: string
  name: string
  email: string
  role: Role
  is_client_manager: number
  status: string
  locale: string
}

export type AppContext = {
  Bindings: Bindings
  Variables: {
    user?: AuthUser
  }
}
