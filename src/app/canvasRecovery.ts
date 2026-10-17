import {
  canvasFileStore,
  validateCanvasFileRecord,
  type CanvasFileStore,
} from './canvasFiles'
import { sharedCanvasFileStore } from './localLibrary'
import { baseCanvasStore, canvasStoreWorkspace } from './canvasStoreScope'
import type { CanvasDraft } from './canvasDrafts'
import { validCanvasId, validateCanvasDocument } from './lcanvas'

export const RECOVERY_DATABASE_NAME = 'canvas-live.draft-recovery'
const STORE = 'drafts'
const INITIALIZED = 'initialized-projects'
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
  databaseName = RECOVERY_DATABASE_NAME,
  legacyRecovery?: CanvasRecoveryStore,
): CanvasRecoveryStore {
  let database: Promise<IDBDatabase> | null = null
  const memory = new Map<string, CanvasDraft[]>()
  const pending = new Map<string, Promise<void>>()
  function open() {
    if (!factory) throw new Error('Browser recovery is unavailable.')
    if (!database)
      database = new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(databaseName, 2)
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
          if (!request.result.objectStoreNames.contains(STORE)) {
            const store = request.result.createObjectStore(STORE, {
              keyPath: ['record.projectId', 'record.id'],
            })
            store.createIndex('projectId', 'record.projectId', {
              unique: false,
            })
          }
          if (!request.result.objectStoreNames.contains(INITIALIZED))
            request.result.createObjectStore(INITIALIZED)
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
  function read(
    db: IDBDatabase,
    projectId: string,
  ): Promise<{ drafts: CanvasDraft[]; initialized: boolean }> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE, INITIALIZED], 'readonly')
      const marker = transaction.objectStore(INITIALIZED).get(projectId)
      const request = transaction
        .objectStore(STORE)
        .index('projectId')
        .getAll(projectId)
      transaction.oncomplete = () => {
        try {
          resolve({
            drafts: (request.result as unknown[]).map((draft) =>
              validateRecoveryDraft(draft, projectId),
            ),
            initialized: marker.result === true,
          })
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
      const transaction = db.transaction([STORE, INITIALIZED], 'readwrite')
      const store = transaction.objectStore(STORE)
      transaction.objectStore(INITIALIZED).put(true, projectId)
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
  function validateDrafts(projectId: string, drafts: CanvasDraft[]) {
    const ids = new Set<string>()
    return drafts.map((draft) => {
      const item = validateRecoveryDraft(draft, projectId)
      if (ids.has(item.record.id))
        throw new Error('A recovery file identifier is duplicated.')
      ids.add(item.record.id)
      return item
    })
  }
  function enqueue<T>(projectId: string, work: () => Promise<T>): Promise<T> {
    const next = (pending.get(projectId) ?? Promise.resolve())
      .catch(() => undefined)
      .then(work)
    const settled = next.then(
      () => undefined,
      () => undefined,
    )
    pending.set(projectId, settled)
    void settled.then(() => {
      if (pending.get(projectId) === settled) pending.delete(projectId)
    })
    return next
  }
  async function persist(projectId: string, drafts: CanvasDraft[]) {
    if (factory) await write(await open(), projectId, drafts)
    else memory.set(projectId, drafts)
  }
  return {
    durable: factory !== null,
    async list(projectId) {
      requireProject(projectId)
      return enqueue(projectId, async () => {
        const current = factory
          ? await read(await open(), projectId)
          : {
              drafts: validateDrafts(projectId, memory.get(projectId) ?? []),
              initialized: memory.has(projectId),
            }
        if (legacyRecovery && !current.initialized) {
          // Existing v1 scoped drafts win. Even an empty migration is recorded,
          // so clearing a draft cannot bring the old global copy back later.
          const drafts = current.drafts.length
            ? current.drafts
            : validateDrafts(projectId, await legacyRecovery.list(projectId))
          await persist(projectId, drafts)
          return drafts
        }
        return current.drafts
      })
    },
    async replace(projectId, drafts) {
      requireProject(projectId)
      const validated = validateDrafts(projectId, drafts)
      await enqueue(projectId, () => persist(projectId, validated))
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
    if (
      [canvasFileStore, sharedCanvasFileStore].includes(baseCanvasStore(store))
    ) {
      try {
        factory = globalThis.indexedDB ?? null
      } catch {
        /* Memory protection remains available. */
      }
    }
    const workspaceId = canvasStoreWorkspace(store)
    recovery = createCanvasRecoveryStore(
      factory,
      workspaceId
        ? `${RECOVERY_DATABASE_NAME}.${encodeURIComponent(workspaceId)}`
        : RECOVERY_DATABASE_NAME,
      workspaceId ? recoveryFor(baseCanvasStore(store)) : undefined,
    )
    stores.set(store, recovery)
  }
  return recovery
}
