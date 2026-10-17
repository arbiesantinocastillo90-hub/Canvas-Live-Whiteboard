import {
  canvasFileStore,
  validateCanvasFileRecord,
  type CanvasFileRecord,
  type CanvasFileResult,
  type CanvasFileStore,
} from './canvasFiles'
import { validCanvasId } from './lcanvas'

const ENDPOINT = '/__canvas_live_library'
export const LIBRARY_MAX_ENTRIES = 2000
export const LIBRARY_MAX_BYTES = 128 * 1024 * 1024
export const LIBRARY_ENTRY_MAX_BYTES = 16 * 1024 * 1024
const KEY_PATTERN =
  /^(file|metadata|sessions|latest|view|settings):[A-Za-z0-9_-]{1,280}$/u
type LibraryKind =
  'file' | 'metadata' | 'sessions' | 'latest' | 'view' | 'settings'
export type LibraryEntry<T = unknown> = { revision: number; value: T | null }
export type LibraryAvailability = { available: boolean; error?: string }
export type LocalLibraryClient = {
  readonly available: boolean
  initialize: (options?: { force?: boolean }) => Promise<LibraryAvailability>
  cached: <T = unknown>(key: string) => LibraryEntry<T>
  entries: () => [string, LibraryEntry][]
  refresh: () => Promise<void>
  read: <T = unknown>(
    key: string,
    refresh?: boolean,
  ) => Promise<LibraryEntry<T>>
  write: <T = unknown>(
    key: string,
    value: T,
    expected?: number,
  ) => Promise<LibraryEntry<T>>
  transform: <T = unknown>(
    key: string,
    update: (value: T | null) => T,
    maxRetries?: number,
  ) => Promise<LibraryEntry<T>>
}
export class LibraryConflictError extends Error {
  constructor(
    message = 'This item changed in another Canvas Live view. Open the latest version before saving, or export your edits as a separate file.',
  ) {
    super(message)
    this.name = 'LibraryConflictError'
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function fail(message: string): never {
  throw new Error(message)
}
function requireKey(key: string) {
  if (!KEY_PATTERN.test(key)) fail('The local library identifier is invalid.')
}
function bytes(raw: string) {
  return new TextEncoder().encode(raw).byteLength
}
function clone<T>(value: T): T {
  return structuredClone(value)
}
function valueObject(value: unknown): Record<string, unknown> {
  if (
    !record(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    ['__proto__', 'constructor', 'prototype'].some((key) =>
      Object.hasOwn(value, key),
    )
  )
    return fail('The local library item must be a plain JSON object.')
  return value
}
function requireJson(
  value: unknown,
  depth = 0,
  ancestors = new Set<object>(),
): void {
  if (depth > 60) return fail('The local library item is nested too deeply.')
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return
  if (typeof value === 'number' && Number.isFinite(value)) return
  if (
    typeof value !== 'object' ||
    (!Array.isArray(value) &&
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) ||
    ancestors.has(value)
  )
    return fail('The local library item is not valid plain JSON.')
  ancestors.add(value)
  for (const item of Array.isArray(value) ? value : Object.values(value))
    requireJson(item, depth + 1, ancestors)
  ancestors.delete(value)
}
function jsonValue(value: unknown): Record<string, unknown> {
  valueObject(value)
  requireJson(value)
  let raw: string
  try {
    raw = JSON.stringify(value)
  } catch {
    return fail('The local library item is not valid JSON.')
  }
  if (bytes(raw) > LIBRARY_ENTRY_MAX_BYTES)
    return fail('The local library item exceeds 16 MiB.')
  const parsed: unknown = JSON.parse(raw)
  return valueObject(parsed)
}
function entry(value: unknown, allowMissing = false): LibraryEntry {
  if (
    !record(value) ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < (allowMissing ? 0 : 1) ||
    !Object.hasOwn(value, 'value')
  )
    return fail('The local library returned an invalid item revision.')
  if (value.revision === 0) {
    if (value.value !== null)
      return fail('The local library returned an invalid missing item.')
    return { revision: 0, value: null }
  }
  return { revision: value.revision as number, value: jsonValue(value.value) }
}
function envelope(value: unknown): Map<string, LibraryEntry> {
  if (
    !record(value) ||
    value.version !== 1 ||
    !record(value.entries) ||
    Object.keys(value.entries).length > LIBRARY_MAX_ENTRIES
  )
    return fail('The local library returned an invalid collection.')
  const normalized = new Map<string, LibraryEntry>()
  for (const [key, item] of Object.entries(value.entries)) {
    requireKey(key)
    normalized.set(key, entry(item))
  }
  return normalized
}
export function libraryKey(kind: LibraryKind, id: string): string {
  if (!validCanvasId(id))
    return fail('The local library identifier is invalid.')
  const encoded = Array.from(new TextEncoder().encode(id), (byte) =>
    String.fromCharCode(byte),
  ).join('')
  const key = `${kind}:${btoa(encoded).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')}`
  requireKey(key)
  return key
}
function nativeMarker() {
  return (
    typeof document !== 'undefined' &&
    document
      .querySelector('meta[name="canvas-live-storage"]')
      ?.getAttribute('content') === 'local-v1'
  )
}
export function createLocalLibraryClient(
  options: {
    fetch?: typeof fetch
    timeoutMs?: number
    enabled?: () => boolean
  } = {},
): LocalLibraryClient {
  let available = false
  let cache = new Map<string, LibraryEntry>()
  let initialization: Promise<LibraryAvailability> | null = null
  const pending = new Map<string, Promise<unknown>>()
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(1, Math.min(60_000, options.timeoutMs!))
    : 8000
  function requireAvailable() {
    if (!available) fail('The local Canvas Live library is not connected.')
  }
  function cached<T = unknown>(key: string): LibraryEntry<T> {
    requireKey(key)
    return clone(
      cache.get(key) ?? { revision: 0, value: null },
    ) as LibraryEntry<T>
  }
  async function request(
    path: string,
    init?: RequestInit,
    maximum = LIBRARY_MAX_BYTES,
  ): Promise<unknown> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const fetcher = options.fetch ?? globalThis.fetch
      if (!fetcher) return fail('The local library could not be reached.')
      const response = await fetcher(path, {
        ...init,
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'same-origin',
        redirect: 'error',
      })
      if (response.status === 409) {
        await response.body?.cancel()
        throw new LibraryConflictError()
      }
      const length = response.headers.get('content-length')
      if (
        length !== null &&
        (!/^\d+$/u.test(length) || Number(length) > maximum)
      )
        return fail('The local library response exceeds its size limit.')
      let raw = ''
      if (response.body) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8', { fatal: true })
        let count = 0
        try {
          while (true) {
            const part = await reader.read()
            if (part.done) break
            count += part.value.byteLength
            if (count > maximum) {
              await reader.cancel()
              return fail('The local library response exceeds its size limit.')
            }
            raw += decoder.decode(part.value, { stream: true })
          }
          raw += decoder.decode()
        } finally {
          reader.releaseLock()
        }
      } else {
        raw = await response.text()
        if (bytes(raw) > maximum)
          return fail('The local library response exceeds its size limit.')
      }
      let value: unknown
      try {
        value = JSON.parse(raw)
      } catch {
        return fail('The local library returned invalid JSON.')
      }
      if (!response.ok)
        return fail(
          record(value) && typeof value.error === 'string'
            ? value.error
            : 'The local library could not save or open this item.',
        )
      return value
    } catch (error) {
      if (error instanceof LibraryConflictError) throw error
      if (controller.signal.aborted)
        return fail(
          'The local library did not respond in time. Your edits remain open; try again or export a copy.',
        )
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
  async function refresh() {
    requireAvailable()
    const loaded = envelope(await request(ENDPOINT))
    cache = loaded
  }
  async function read<T = unknown>(
    key: string,
    refreshItem = false,
  ): Promise<LibraryEntry<T>> {
    requireKey(key)
    requireAvailable()
    if (refreshItem) {
      const loaded = entry(
        await request(
          `${ENDPOINT}/${encodeURIComponent(key)}`,
          undefined,
          LIBRARY_ENTRY_MAX_BYTES + 1024,
        ),
        true,
      )
      if (loaded.revision) cache.set(key, loaded)
      else cache.delete(key)
    }
    return cached<T>(key)
  }
  function queued<T>(key: string, action: () => Promise<T>): Promise<T> {
    requireKey(key)
    const next = (pending.get(key) ?? Promise.resolve())
      .catch(() => undefined)
      .then(action)
    pending.set(key, next)
    void next
      .finally(() => {
        if (pending.get(key) === next) pending.delete(key)
      })
      .catch(() => undefined)
    return next
  }
  async function writeDirect<T>(
    key: string,
    input: T,
    expected?: number,
  ): Promise<LibraryEntry<T>> {
    requireAvailable()
    const value = jsonValue(input)
    const revision = expected ?? cached(key).revision
    if (
      !Number.isSafeInteger(revision) ||
      revision < 0 ||
      revision >= Number.MAX_SAFE_INTEGER
    )
      return fail('The local library write revision is invalid.')
    const loaded = entry(
      await request(
        `${ENDPOINT}/${encodeURIComponent(key)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': String(revision),
          },
          body: JSON.stringify(value),
        },
        LIBRARY_ENTRY_MAX_BYTES + 1024,
      ),
    )
    if (loaded.revision !== revision + 1)
      return fail('The local library returned an unexpected write revision.')
    cache.set(key, loaded)
    return clone(loaded) as LibraryEntry<T>
  }
  const client: LocalLibraryClient = {
    get available() {
      return available
    },
    initialize({ force = false } = {}) {
      if (initialization) return initialization
      if (!force && !(options.enabled ?? nativeMarker)())
        return Promise.resolve({ available: false })
      initialization = (async () => {
        try {
          const loaded = envelope(await request(ENDPOINT))
          cache = loaded
          available = true
          return { available: true }
        } catch (error) {
          return {
            available,
            error:
              error instanceof Error
                ? error.message
                : 'The local library could not be opened.',
          }
        } finally {
          initialization = null
        }
      })()
      return initialization
    },
    cached,
    entries: () => [...cache].map(([key, item]) => [key, clone(item)]),
    refresh,
    read,
    write: (key, value, expected) =>
      queued(key, () => writeDirect(key, value, expected)),
    transform: (key, update, maxRetries = 3) =>
      queued(key, async () => {
        const attempts = Number.isFinite(maxRetries)
          ? Math.max(0, Math.min(10, Math.floor(maxRetries)))
          : 3
        for (let attempt = 0; ; attempt++) {
          const current = await read(key, true)
          const next = update(current.value as never)
          try {
            return await writeDirect(key, next, current.revision)
          } catch (error) {
            if (!(error instanceof LibraryConflictError) || attempt >= attempts)
              throw error
          }
        }
      }),
  }
  return client
}

const FILE_REVISION = Symbol('canvas-live-library-file-revision')
type VersionedFile = CanvasFileRecord & { [FILE_REVISION]?: number }
function versioned(file: CanvasFileRecord, revision: number): CanvasFileRecord {
  const copy: VersionedFile = validateCanvasFileRecord(file)
  // Spread preserves this token while exported JSON and IndexedDB ignore it.
  Object.defineProperty(copy, FILE_REVISION, {
    value: revision,
    enumerable: true,
  })
  return copy
}
export function createSharedCanvasFileStore(
  fallback: CanvasFileStore,
  client: LocalLibraryClient,
): CanvasFileStore {
  const firstLoaded = new Map<string, number>()
  const recency = new Map<string, number>()
  const pending = new Map<string, Promise<unknown>>()
  function opened(file: CanvasFileRecord, revision: number) {
    if (!firstLoaded.has(file.id)) firstLoaded.set(file.id, revision)
    return versioned(
      {
        ...file,
        lastOpenedAt: Math.max(file.lastOpenedAt, recency.get(file.id) ?? 0),
      },
      revision,
    )
  }
  function validateId(value: string) {
    if (!validCanvasId(value))
      fail('The project or canvas identifier is invalid.')
  }
  async function localCache(file: CanvasFileRecord) {
    try {
      return (await fallback.save(validateCanvasFileRecord(file))).error
    } catch {
      return 'Saved in the local library; the browser cache could not be updated.'
    }
  }
  const store: CanvasFileStore = {
    async list(projectId) {
      if (!client.available) return fallback.list(projectId)
      validateId(projectId)
      await client.refresh()
      const files: CanvasFileRecord[] = []
      for (const [key, item] of client.entries()) {
        if (!key.startsWith('file:')) continue
        const file = validateCanvasFileRecord(item.value)
        if (key !== libraryKey('file', file.id))
          fail('A local library canvas has a mismatched identifier.')
        if (file.projectId === projectId)
          files.push(opened(file, item.revision))
      }
      files.sort(
        (a, b) =>
          b.lastOpenedAt - a.lastOpenedAt ||
          b.updatedAt - a.updatedAt ||
          a.id.localeCompare(b.id),
      )
      return { value: files, persistence: 'browser' }
    },
    async get(projectId, id) {
      if (!client.available) return fallback.get(projectId, id)
      validateId(projectId)
      validateId(id)
      const item = await client.read(libraryKey('file', id), true)
      if (!item.revision) return { value: null, persistence: 'browser' }
      const file = validateCanvasFileRecord(item.value)
      if (file.id !== id)
        fail('A local library canvas has a mismatched identifier.')
      return {
        value:
          file.projectId === projectId ? opened(file, item.revision) : null,
        persistence: 'browser',
      }
    },
    async markOpened(projectId, id, now = Date.now()) {
      if (!client.available) return fallback.markOpened(projectId, id, now)
      if (!Number.isInteger(now) || now < 0 || now > 8_640_000_000_000_000)
        fail('The canvas date is invalid.')
      const result = await store.get(projectId, id)
      if (!result.value) return result
      recency.set(id, Math.max(now, result.value.lastOpenedAt))
      const revision = (result.value as VersionedFile)[FILE_REVISION]!
      return { value: opened(result.value, revision), persistence: 'browser' }
    },
    save(input) {
      if (!client.available) return fallback.save(input)
      const file = validateCanvasFileRecord(input)
      const expected =
        (input as VersionedFile)[FILE_REVISION] ?? firstLoaded.get(file.id) ?? 0
      const previous = pending.get(file.id) ?? Promise.resolve()
      const next = previous
        .catch(() => undefined)
        .then(async (): Promise<CanvasFileResult<CanvasFileRecord>> => {
          // Unloaded existing records cannot be overwritten as though they were new.
          const current = client.cached<CanvasFileRecord>(
            libraryKey('file', file.id),
          )
          if (current.value) {
            const original = validateCanvasFileRecord(current.value)
            if (
              original.projectId !== file.projectId ||
              original.createdAt !== file.createdAt
            )
              fail(
                'This canvas identifier already belongs to another file or project.',
              )
          }
          const saved = await client.write(
            libraryKey('file', file.id),
            file,
            expected,
          )
          firstLoaded.set(file.id, saved.revision)
          const value = opened(
            validateCanvasFileRecord(saved.value),
            saved.revision,
          )
          const error = await localCache(value)
          return { value, persistence: 'browser', ...(error ? { error } : {}) }
        })
      pending.set(file.id, next)
      void next
        .finally(() => {
          if (pending.get(file.id) === next) pending.delete(file.id)
        })
        .catch(() => undefined)
      return next
    },
  }
  return store
}
export const localLibrary = createLocalLibraryClient()
export const initializeLocalLibrary = (options?: { force?: boolean }) =>
  localLibrary.initialize(options)
export const sharedCanvasFileStoreFallback = canvasFileStore
export const sharedCanvasFileStore = createSharedCanvasFileStore(
  canvasFileStore,
  localLibrary,
)
