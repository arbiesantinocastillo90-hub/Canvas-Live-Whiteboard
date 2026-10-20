import { canvasFileStore, type CanvasFileStore } from './canvasFiles'
import { sharedCanvasFileStore } from './localLibrary'
import { baseCanvasStore } from './canvasStoreScope'
import {
  canvasExportFilename,
  parseLCANVAS,
  serializeLCANVAS,
  validCanvasId,
  validateCanvasDocument,
  type CanvasDocument,
} from './lcanvas'

export const LOCAL_FILES_DATABASE_NAME = 'canvas-live.local-file-handles'
const HANDLES_STORE = 'handles'
type Permission = 'granted' | 'denied' | 'prompt'
type PermissionOptions = { mode: 'readwrite' }
export type LocalCanvasWritable = {
  write: (data: string) => Promise<void>
  close: () => Promise<void>
  abort?: () => Promise<void>
}
export type LocalCanvasHandle = {
  kind: 'file'
  name: string
  getFile: () => Promise<File>
  createWritable: () => Promise<LocalCanvasWritable>
  isSameEntry?: (other: LocalCanvasHandle) => Promise<boolean>
  queryPermission?: (options: PermissionOptions) => Promise<Permission>
  requestPermission?: (options: PermissionOptions) => Promise<Permission>
}
export type LocalCanvasImport = { file: File; handle: LocalCanvasHandle }
export type LocalCanvasBinding = {
  handle: LocalCanvasHandle
  autoSave: boolean
  autoSaveIntervalMs?: number
  savedDocument: CanvasDocument
}
export const DEFAULT_AUTOSAVE_INTERVAL_MS = 900
export const MIN_AUTOSAVE_INTERVAL_MS = 500
export const MAX_AUTOSAVE_INTERVAL_MS = 60 * 60 * 1000
export function boundedAutosaveInterval(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(
        MIN_AUTOSAVE_INTERVAL_MS,
        Math.min(MAX_AUTOSAVE_INTERVAL_MS, Math.round(value)),
      )
    : DEFAULT_AUTOSAVE_INTERVAL_MS
}
export class LocalCanvasMissingError extends Error {
  constructor() {
    super(
      'This local file was moved or deleted. Choose a new save location to keep your changes.',
    )
    this.name = 'LocalCanvasMissingError'
  }
}
export function isMissingLocalCanvas(error: unknown): boolean {
  return (
    error instanceof LocalCanvasMissingError ||
    (!!error &&
      typeof error === 'object' &&
      'name' in error &&
      error.name === 'NotFoundError')
  )
}
export class LocalCanvasPermissionError extends Error {
  constructor() {
    super(
      'The external .CLF file was not updated because this browser blocked file access. Use Save now to retry, open Canvas Live directly in Chrome or Edge, or download a copy.',
    )
    this.name = 'LocalCanvasPermissionError'
  }
}
export function isLocalCanvasPermissionError(error: unknown): boolean {
  return (
    error instanceof LocalCanvasPermissionError ||
    (!!error &&
      typeof error === 'object' &&
      'name' in error &&
      ['NotAllowedError', 'SecurityError'].includes(String(error.name)))
  )
}
export type LocalCanvasFiles = {
  get: (projectId: string, fileId: string) => Promise<LocalCanvasBinding | null>
  set: (
    projectId: string,
    fileId: string,
    binding: LocalCanvasBinding,
  ) => Promise<void>
}
type PickerHost = {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: { description: string; accept: Record<string, string[]> }[]
    excludeAcceptAllOption: boolean
  }) => Promise<LocalCanvasHandle>
  showOpenFilePicker?: (options: {
    multiple: boolean
    types: { description: string; accept: Record<string, string[]> }[]
    excludeAcceptAllOption: boolean
  }) => Promise<LocalCanvasHandle[]>
}
const canvasTypes = [
  {
    description: 'Canvas Live file (.CLF)',
    accept: { 'application/json': ['.CLF', '.clf', '.lcanvas'] },
  },
]

function host(): PickerHost {
  return globalThis as PickerHost
}
export function supportsLocalCanvasSave() {
  if (typeof window !== 'undefined' && window.top !== window) return false
  return typeof host().showSaveFilePicker === 'function'
}
export function supportsLocalCanvasOpen() {
  return typeof host().showOpenFilePicker === 'function'
}
export function isPickerCancellation(error: unknown) {
  return (
    !!error &&
    typeof error === 'object' &&
    'name' in error &&
    error.name === 'AbortError'
  )
}

function requireHandle(value: unknown): LocalCanvasHandle {
  if (
    !value ||
    typeof value !== 'object' ||
    !('kind' in value) ||
    value.kind !== 'file' ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !/\.(?:clf|lcanvas)$/iu.test(value.name) ||
    !('getFile' in value) ||
    typeof value.getFile !== 'function' ||
    !('createWritable' in value) ||
    typeof value.createWritable !== 'function'
  )
    throw new Error(
      'Choose a local .CLF file (legacy .lcanvas is also supported).',
    )
  return value as LocalCanvasHandle
}

export async function chooseLocalCanvasSave(
  name: string,
): Promise<LocalCanvasHandle | null> {
  const picker = host().showSaveFilePicker
  if (!picker)
    throw new Error(
      'This browser cannot bind a local file. A downloaded copy is available instead.',
    )
  try {
    return requireHandle(
      await picker.call(globalThis, {
        suggestedName: canvasExportFilename(name),
        types: canvasTypes,
        excludeAcceptAllOption: true,
      }),
    )
  } catch (error) {
    if (isPickerCancellation(error)) return null
    throw error
  }
}

export async function chooseLocalCanvasFiles(): Promise<
  LocalCanvasImport[] | null
> {
  const picker = host().showOpenFilePicker
  if (!picker)
    throw new Error('Use Import to choose .CLF files in this browser.')
  try {
    const handles = await picker.call(globalThis, {
      multiple: true,
      types: canvasTypes,
      excludeAcceptAllOption: true,
    })
    if (handles.length > 100)
      throw new Error('Open up to 100 local files at a time.')
    return await Promise.all(
      handles.map(async (source) => {
        const handle = requireHandle(source)
        return { handle, file: await handle.getFile() }
      }),
    )
  } catch (error) {
    if (isPickerCancellation(error)) return null
    throw error
  }
}

export async function allowLocalWrite(
  handle: LocalCanvasHandle,
  interactive: boolean,
): Promise<boolean> {
  requireHandle(handle)
  if (!handle.queryPermission) return interactive
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted')
    return true
  return (
    interactive &&
    !!handle.requestPermission &&
    (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
  )
}

const writes = new WeakMap<LocalCanvasHandle, Promise<void>>()
/** Writes to a given handle are serialized; only close commits the new file. */
export async function writeLocalCanvas(
  handle: LocalCanvasHandle,
  document: CanvasDocument,
  expected?: CanvasDocument,
): Promise<void> {
  requireHandle(handle)
  const raw = serializeLCANVAS(document)
  const next = (writes.get(handle) ?? Promise.resolve())
    .catch(() => undefined)
    .then(async () => {
      try {
        if (expected) {
          const file = await handle.getFile()
          if (
            file.size > 10 * 1024 * 1024 ||
            JSON.stringify(parseLCANVAS(await file.text())) !==
              JSON.stringify(expected)
          )
            throw new Error(
              'This local file changed outside Canvas Live. Open it again, or use Save as to keep your edits in a separate file.',
            )
        }
        const writable = await handle.createWritable()
        try {
          await writable.write(raw)
          await writable.close()
        } catch (error) {
          await writable.abort?.().catch(() => undefined)
          throw error
        }
      } catch (error) {
        if (isMissingLocalCanvas(error)) throw new LocalCanvasMissingError()
        if (isLocalCanvasPermissionError(error))
          throw new LocalCanvasPermissionError()
        throw error
      }
    })
  writes.set(handle, next)
  try {
    await next
  } finally {
    if (writes.get(handle) === next) writes.delete(handle)
  }
}

function key(projectId: string, fileId: string) {
  if (!validCanvasId(projectId) || !validCanvasId(fileId))
    throw new Error('The local file identifier is invalid.')
  return JSON.stringify([projectId, fileId])
}

function binding(value: unknown): LocalCanvasBinding {
  if (
    !value ||
    typeof value !== 'object' ||
    !('handle' in value) ||
    !('autoSave' in value) ||
    typeof value.autoSave !== 'boolean' ||
    !('savedDocument' in value)
  )
    throw new Error('The saved local file binding is invalid.')
  return {
    handle: requireHandle(value.handle),
    autoSave: value.autoSave,
    ...('autoSaveIntervalMs' in value
      ? {
          autoSaveIntervalMs: boundedAutosaveInterval(value.autoSaveIntervalMs),
        }
      : {}),
    savedDocument: validateCanvasDocument(value.savedDocument),
  }
}

export function createLocalCanvasFiles(
  factory: IDBFactory | null,
): LocalCanvasFiles {
  let database: Promise<IDBDatabase> | null = null
  const cache = new Map<string, LocalCanvasBinding | null>()
  function open() {
    if (!factory)
      throw new Error(
        'Local file bindings cannot be remembered after this tab closes.',
      )
    if (!database)
      database = new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(LOCAL_FILES_DATABASE_NAME, 1)
        let done = false
        const timeout = setTimeout(() => {
          done = true
          reject(new Error('Local file binding storage did not respond.'))
        }, 4000)
        function fail() {
          if (done) return
          done = true
          clearTimeout(timeout)
          reject(
            new Error(
              'The browser could not open local file binding storage. Your physical files are unaffected.',
            ),
          )
        }
        request.onupgradeneeded = () =>
          request.result.createObjectStore(HANDLES_STORE, { keyPath: 'key' })
        request.onsuccess = () => {
          if (done) {
            request.result.close()
            return
          }
          done = true
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
  return {
    async get(projectId, fileId) {
      const id = key(projectId, fileId)
      if (cache.has(id)) return cache.get(id) ?? null
      if (!factory) return null
      const db = await open()
      const saved: unknown = await new Promise((resolve, reject) => {
        const transaction = db.transaction(HANDLES_STORE, 'readonly')
        const request = transaction.objectStore(HANDLES_STORE).get(id)
        transaction.oncomplete = () => resolve(request.result as unknown)
        transaction.onabort = () =>
          reject(
            transaction.error ??
              new Error('The local file binding could not be read.'),
          )
        transaction.onerror = () => {
          /* onabort reports the result. */
        }
      })
      const result = saved ? binding(saved) : null
      cache.set(id, result)
      return result
    },
    async set(projectId, fileId, value) {
      const id = key(projectId, fileId)
      const validated = binding(value)
      cache.set(id, validated)
      if (!factory) return
      const db = await open()
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(HANDLES_STORE, 'readwrite')
        transaction.objectStore(HANDLES_STORE).put({ key: id, ...validated })
        transaction.oncomplete = () => resolve()
        transaction.onabort = () =>
          reject(
            transaction.error ??
              new Error('The local file handle could not be remembered.'),
          )
        transaction.onerror = () => {
          /* onabort reports the result. */
        }
      })
    },
  }
}

const bindings = new WeakMap<CanvasFileStore, LocalCanvasFiles>()
export function localFilesFor(store: CanvasFileStore = canvasFileStore) {
  const base = baseCanvasStore(store)
  if (base !== store) return localFilesFor(base)
  if (store === sharedCanvasFileStore) return localFilesFor(canvasFileStore)
  let local = bindings.get(store)
  if (!local) {
    let factory: IDBFactory | null = null
    if (store === canvasFileStore) {
      try {
        factory = globalThis.indexedDB ?? null
      } catch {
        /* Session bindings remain usable. */
      }
    }
    local = createLocalCanvasFiles(factory)
    bindings.set(store, local)
  }
  return local
}
