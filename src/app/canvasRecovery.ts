import {
  canvasFileStore,
  validateCanvasFileRecord,
  type CanvasFileStore,
} from './canvasFiles'
import { sharedCanvasFileStore } from './localLibrary'
import type { CanvasDraft } from './canvasDrafts'
import { validCanvasId, validateCanvasDocument } from './lcanvas'

export const RECOVERY_DATABASE_NAME = 'canvas-live.draft-recovery'
const STORE = 'drafts'
export type CanvasRecoveryStore = {
  durable: boolean
  list: (projectId: string) => Promise<CanvasDraft[]>
  replace: (projectId: string, drafts: CanvasDraft[]) => Promise<void>
}

export function validateRecoveryDraft(
  value: unknown,
  projectId: string,
): CanvasDraft {
  if (
    !validCanvasId(projectId) ||
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  )
    throw new Error('The canvas recovery record is invalid.')
  const source = value as Record<string, unknown>
  const record = validateCanvasFileRecord(source.record)
  if (
    record.projectId !== projectId ||
    source.dirty !== true ||
    !['browser', 'session'].includes(source.persistence as string)
  )
    throw new Error(
      'The canvas recovery record does not belong to this project.',
    )
  return {
    record,
    dirty: true,
    savedDocument: validateCanvasDocument(source.savedDocument),
    persistence: source.persistence as CanvasDraft['persistence'],
  }
}

export function mergeRecoveredDrafts(
  saved: CanvasDraft[],
  recovered: CanvasDraft[],
): CanvasDraft[] {
  const entries = new Map(saved.map((entry) => [entry.record.id, entry]))
  for (const draft of recovered) {
    const existing = entries.get(draft.record.id)
    // A newer explicit save wins over an older recovery snapshot.
    if (
      !existing ||
      (existing.record.projectId === draft.record.projectId &&
        JSON.stringify(existing.savedDocument) ===
          JSON.stringify(draft.savedDocument))
    )
      entries.set(draft.record.id, draft)
  }
  return [...entries.values()]
}

export function createCanvasRecoveryStore(
  factory: IDBFactory | null,
): CanvasRecoveryStore {
  let database: Promise<IDBDatabase> | null = null
  const memory = new Map<string, CanvasDraft[]>()
  const pending = new Map<string, Promise<void>>()
  function open() {
    if (!factory) throw new Error('Browser recovery is unavailable.')
    if (!database)
      database = new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(RECOVERY_DATABASE_NAME, 1)
        let finished = false
        const timeout = setTimeout(() => {
          finished = true
          reject(new Error('Draft recovery storage did not respond.'))
        }, 5000)
        const fail = () => {
          if (finished) return
          finished = true
          clearTimeout(timeout)
          reject(
            new Error(
              'Draft recovery storage could not open. Save a local LCANVAS file.',
            ),
          )
        }
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore(STORE, {
            keyPath: ['record.projectId', 'record.id'],
          })
          store.createIndex('projectId', 'record.projectId', { unique: false })
        }
        request.onsuccess = () => {
          if (finished) {
            request.result.close()
            return
          }
          finished = true
          clearTimeout(timeout)
          request.result.onversionchange = () => {
            request.result.close()
            database = null
          }
          resolve(request.result)
        }
        request.onerror = fail
        request.onblocked = fail
      }).catch((error: unknown) => {
        database = null
        throw error
      })
    return database
  }
  function requireProject(projectId: string) {
    if (!validCanvasId(projectId))
      throw new Error('The project identifier is invalid.')
  }
  function read(db: IDBDatabase, projectId: string): Promise<CanvasDraft[]> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly')
      const request = transaction
        .objectStore(STORE)
        .index('projectId')
        .getAll(projectId)
      transaction.oncomplete = () => {
        try {
          resolve(
            (request.result as unknown[]).map((draft) =>
              validateRecoveryDraft(draft, projectId),
            ),
          )
        } catch (error) {
          reject(error)
        }
      }
      transaction.onabort = () =>
        reject(
          transaction.error ?? new Error('Draft recovery could not be read.'),
        )
      transaction.onerror = () => {
        /* onabort reports the outcome. */
      }
    })
  }
  function write(
    db: IDBDatabase,
    projectId: string,
    drafts: CanvasDraft[],
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite')
      const store = transaction.objectStore(STORE)
      const request = store.index('projectId').getAllKeys(projectId)
      request.onsuccess = () => {
        request.result.forEach((key) => store.delete(key))
        drafts.forEach((draft) => store.put(draft))
      }
      transaction.oncomplete = () => resolve()
      transaction.onabort = () =>
        reject(
          transaction.error ??
            new Error(
              'Draft recovery could not be written. Save a local LCANVAS file.',
            ),
        )
      transaction.onerror = () => {
        /* onabort reports the outcome. */
      }
    })
  }
  return {
    durable: factory !== null,
    async list(projectId) {
      requireProject(projectId)
      await pending.get(projectId)?.catch(() => undefined)
      if (!factory)
        return (memory.get(projectId) ?? []).map((draft) =>
          validateRecoveryDraft(draft, projectId),
        )
      return read(await open(), projectId)
    },
    async replace(projectId, drafts) {
      requireProject(projectId)
      const ids = new Set<string>()
      const validated = drafts.map((draft) => {
        const item = validateRecoveryDraft(draft, projectId)
        if (ids.has(item.record.id))
          throw new Error('A recovery file identifier is duplicated.')
        ids.add(item.record.id)
        return item
      })
      const next = (pending.get(projectId) ?? Promise.resolve())
        .catch(() => undefined)
        .then(async () => {
          if (factory) await write(await open(), projectId, validated)
          else memory.set(projectId, validated)
        })
      pending.set(projectId, next)
      try {
        await next
      } finally {
        if (pending.get(projectId) === next) pending.delete(projectId)
      }
    },
  }
}

const stores = new WeakMap<CanvasFileStore, CanvasRecoveryStore>()
export function recoveryFor(
  store: CanvasFileStore = canvasFileStore,
): CanvasRecoveryStore {
  if (store === sharedCanvasFileStore) return recoveryFor(canvasFileStore)
  let recovery = stores.get(store)
  if (!recovery) {
    let factory: IDBFactory | null = null
    if (store === canvasFileStore) {
      try {
        factory = globalThis.indexedDB ?? null
      } catch {
        /* Memory protection remains available. */
      }
    }
    recovery = createCanvasRecoveryStore(factory)
    stores.set(store, recovery)
  }
  return recovery
}
