import {
  LCanvasError,
  validCanvasId,
  validateCanvasDocument,
  type CanvasDocument,
} from './lcanvas'

export type CanvasFileRecord = {
  id: string
  projectId: string
  document: CanvasDocument
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
}

export type CanvasFileResult<T> = {
  value: T
  persistence: 'browser' | 'session'
  error?: string
}

export type CanvasFileStore = {
  list(projectId: string): Promise<CanvasFileResult<CanvasFileRecord[]>>
  get(
    projectId: string,
    id: string,
  ): Promise<CanvasFileResult<CanvasFileRecord | null>>
  markOpened(
    projectId: string,
    id: string,
    now?: number,
  ): Promise<CanvasFileResult<CanvasFileRecord | null>>
  save(record: CanvasFileRecord): Promise<CanvasFileResult<CanvasFileRecord>>
}

export const CANVAS_DATABASE_NAME = 'canvas-live.documents'
const STORE_NAME = 'canvases'
const SESSION_MESSAGE =
  'Browser storage is unavailable. Keep this tab open and export a copy of your canvas.'

function timestamp(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 8_640_000_000_000_000
  )
}

function requireId(id: unknown): asserts id is string {
  if (!validCanvasId(id))
    throw new LCanvasError('The project or canvas identifier is invalid.')
}

function validateRecord(value: unknown): CanvasFileRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new LCanvasError('The saved canvas record is invalid.')
  }
  const item = value as Record<string, unknown>
  requireId(item.id)
  requireId(item.projectId)
  if (
    !timestamp(item.createdAt) ||
    !timestamp(item.updatedAt) ||
    !timestamp(item.lastOpenedAt) ||
    item.updatedAt < item.createdAt ||
    item.lastOpenedAt < item.createdAt
  ) {
    throw new LCanvasError('The saved canvas dates are invalid.')
  }
  return {
    id: item.id,
    projectId: item.projectId,
    document: validateCanvasDocument(item.document),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastOpenedAt: item.lastOpenedAt,
  }
}

export function createCanvasFileRecord(
  projectId: string,
  document: CanvasDocument,
  now = Date.now(),
  id: string = globalThis.crypto?.randomUUID?.() ??
    `canvas-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
): CanvasFileRecord {
  return validateRecord({
    id,
    projectId,
    document,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  })
}

function browserFactory(): IDBFactory | null {
  try {
    return globalThis.indexedDB ?? null
  } catch {
    return null
  }
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false
    const request = factory.open(CANVAS_DATABASE_NAME, 1)
    const timeout = setTimeout(() => {
      settled = true
      reject(new Error('Browser storage did not open in time.'))
    }, 5000)
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    }
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('projectId', 'projectId', { unique: false })
      }
    }
    request.onsuccess = () => {
      if (settled) {
        request.result.close()
        return
      }
      settled = true
      clearTimeout(timeout)
      resolve(request.result)
    }
    request.onerror = () =>
      fail(request.error ?? new Error('Browser storage could not open.'))
    request.onblocked = () =>
      fail(new Error('Browser storage is open in an incompatible tab.'))
  })
}

function readRecord(database: IDBDatabase, id: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(id)
    transaction.oncomplete = () => resolve(request.result as unknown)
    transaction.onabort = () =>
      reject(
        transaction.error ?? new Error('The saved canvas could not be read.'),
      )
    transaction.onerror = () => {
      /* onabort reports the transaction outcome. */
    }
  })
}

function readProject(
  database: IDBDatabase,
  projectId: string,
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction
      .objectStore(STORE_NAME)
      .index('projectId')
      .getAll(projectId)
    transaction.oncomplete = () => resolve(request.result as unknown[])
    transaction.onabort = () =>
      reject(
        transaction.error ?? new Error('The project files could not be read.'),
      )
    transaction.onerror = () => {
      /* onabort reports the transaction outcome. */
    }
  })
}

function writeRecord(
  database: IDBDatabase,
  record: CanvasFileRecord,
): Promise<CanvasFileRecord> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(record.id)
    let written = record
    let validationError: LCanvasError | undefined
    request.onsuccess = () => {
      try {
        if (request.result !== undefined) {
          const existing = validateRecord(request.result as unknown)
          if (existing.projectId !== record.projectId) {
            throw new LCanvasError('This canvas belongs to another project.')
          }
          if (existing.createdAt !== record.createdAt) {
            throw new LCanvasError('This canvas identifier is already in use.')
          }
          written = {
            ...record,
            lastOpenedAt: Math.max(record.lastOpenedAt, existing.lastOpenedAt),
          }
        }
        store.put(written)
      } catch (error) {
        validationError = error instanceof LCanvasError ? error : undefined
        transaction.abort()
      }
    }
    transaction.oncomplete = () => resolve(written)
    transaction.onabort = () =>
      reject(
        validationError ??
          transaction.error ??
          new Error('This canvas could not be saved in the browser.'),
      )
    transaction.onerror = () => {
      /* onabort reports the transaction outcome. */
    }
  })
}

function markRecordOpened(
  database: IDBDatabase,
  projectId: string,
  id: string,
  now: number,
): Promise<CanvasFileRecord | null> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(id)
    let result: CanvasFileRecord | null = null
    let validationError: LCanvasError | undefined
    request.onsuccess = () => {
      try {
        if (request.result !== undefined) {
          const existing = validateRecord(request.result as unknown)
          if (existing.projectId === projectId) {
            result = {
              ...existing,
              lastOpenedAt: Math.max(now, existing.lastOpenedAt),
            }
            // Opening a version 1 canvas updates recency without rewriting its
            // document. Conversion is held in memory until an explicit save.
            const raw = request.result as Record<string, unknown>
            store.put({ ...result, document: raw.document })
          }
        }
      } catch (error) {
        validationError = error instanceof LCanvasError ? error : undefined
        transaction.abort()
      }
    }
    transaction.oncomplete = () => resolve(result)
    transaction.onabort = () =>
      reject(
        validationError ??
          transaction.error ??
          new Error('The canvas could not be opened.'),
      )
    transaction.onerror = () => {
      /* onabort reports the transaction outcome. */
    }
  })
}

export function createCanvasFileStore(
  options: { indexedDB?: IDBFactory | null } = {},
): CanvasFileStore {
  const factory =
    options.indexedDB === undefined ? browserFactory() : options.indexedDB
  const memory = new Map<string, CanvasFileRecord>()
  const sessionOnly = new Set<string>()
  const mutations = new Map<string, Promise<unknown>>()
  let databasePromise: Promise<IDBDatabase> | undefined

  async function database(): Promise<IDBDatabase> {
    if (!factory) throw new Error('Browser storage is unavailable.')
    if (!databasePromise) {
      databasePromise = openDatabase(factory)
      try {
        const opened = await databasePromise
        opened.onversionchange = () => {
          opened.close()
          databasePromise = undefined
        }
      } catch (error) {
        databasePromise = undefined
        throw error
      }
    }
    return databasePromise
  }

  function sessionList(projectId: string): CanvasFileRecord[] {
    return [...memory.values()]
      .filter((record) => record.projectId === projectId)
      .map(validateRecord)
      .sort(
        (left, right) =>
          right.lastOpenedAt - left.lastOpenedAt ||
          right.updatedAt - left.updatedAt ||
          left.document.name.localeCompare(right.document.name),
      )
  }

  function mutate<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = mutations.get(id) ?? Promise.resolve()
    const result = previous.catch(() => undefined).then(operation)
    mutations.set(id, result)
    const clear = () => {
      if (mutations.get(id) === result) mutations.delete(id)
    }
    void result.then(clear, clear)
    return result
  }

  function mergeCached(record: CanvasFileRecord): CanvasFileRecord {
    const cached = memory.get(record.id)
    if (cached && cached.projectId !== record.projectId) {
      throw new LCanvasError('This canvas belongs to another project.')
    }
    if (cached && cached.createdAt !== record.createdAt) {
      throw new LCanvasError('This canvas identifier is already in use.')
    }
    return {
      ...record,
      lastOpenedAt: Math.max(record.lastOpenedAt, cached?.lastOpenedAt ?? 0),
    }
  }

  return {
    async list(projectId) {
      requireId(projectId)
      let raw: unknown[]
      try {
        raw = await readProject(await database(), projectId)
      } catch {
        return {
          value: sessionList(projectId),
          persistence: 'session',
          error: SESSION_MESSAGE,
        }
      }
      let corrupt = false
      for (const value of raw) {
        try {
          const record = validateRecord(value)
          if (record.projectId !== projectId) {
            corrupt = true
            continue
          }
          if (!sessionOnly.has(record.id)) memory.set(record.id, record)
        } catch {
          corrupt = true
        }
      }
      const value = sessionList(projectId)
      const fallback = value.some((record) => sessionOnly.has(record.id))
      const error = corrupt
        ? 'Some saved canvas files are invalid and could not be opened.'
        : fallback
          ? SESSION_MESSAGE
          : undefined
      return {
        value,
        persistence: fallback ? 'session' : 'browser',
        ...(error ? { error } : {}),
      }
    },
    async get(projectId, id) {
      requireId(projectId)
      requireId(id)
      await mutations.get(id)?.catch(() => undefined)
      const cached = memory.get(id)
      if (sessionOnly.has(id)) {
        return {
          value:
            cached?.projectId === projectId ? validateRecord(cached) : null,
          persistence: 'session',
          error: SESSION_MESSAGE,
        }
      }
      let raw: unknown
      try {
        raw = await readRecord(await database(), id)
      } catch {
        return {
          value:
            cached?.projectId === projectId ? validateRecord(cached) : null,
          persistence: 'session',
          error: SESSION_MESSAGE,
        }
      }
      if (raw === undefined) return { value: null, persistence: 'browser' }
      const record = validateRecord(raw)
      if (record.projectId !== projectId)
        return { value: null, persistence: 'browser' }
      memory.set(id, record)
      return { value: validateRecord(record), persistence: 'browser' }
    },
    async markOpened(projectId, id, now = Date.now()) {
      requireId(projectId)
      requireId(id)
      if (!timestamp(now)) throw new LCanvasError('The canvas date is invalid.')
      return mutate(id, async () => {
        function markSession(): CanvasFileRecord | null {
          const cached = memory.get(id)
          if (!cached || cached.projectId !== projectId) return null
          const record = {
            ...cached,
            lastOpenedAt: Math.max(now, cached.lastOpenedAt),
          }
          memory.set(id, record)
          sessionOnly.add(id)
          return validateRecord(record)
        }
        if (sessionOnly.has(id)) {
          return {
            value: markSession(),
            persistence: 'session',
            error: SESSION_MESSAGE,
          }
        }
        let record: CanvasFileRecord | null
        try {
          record = await markRecordOpened(await database(), projectId, id, now)
        } catch (error) {
          if (error instanceof LCanvasError) throw error
          return {
            value: markSession(),
            persistence: 'session',
            error: SESSION_MESSAGE,
          }
        }
        if (record) memory.set(id, record)
        return {
          value: record ? validateRecord(record) : null,
          persistence: 'browser',
        }
      })
    },
    async save(input) {
      const validated = validateRecord(input)
      return mutate(validated.id, async () => {
        let record = mergeCached(validated)
        try {
          record = await writeRecord(await database(), record)
        } catch (error) {
          if (error instanceof LCanvasError) throw error
          record = mergeCached(record)
          memory.set(record.id, record)
          sessionOnly.add(record.id)
          return {
            value: validateRecord(record),
            persistence: 'session',
            error: SESSION_MESSAGE,
          }
        }
        memory.set(record.id, record)
        sessionOnly.delete(record.id)
        return { value: validateRecord(record), persistence: 'browser' }
      })
    },
  }
}

export const canvasFileStore = createCanvasFileStore()
export { validateRecord as validateCanvasFileRecord }
