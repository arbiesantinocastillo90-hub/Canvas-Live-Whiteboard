import {
  canvasFileStore,
  validateCanvasFileRecord,
  type CanvasFileRecord,
  type CanvasFileResult,
  type CanvasFileStore,
} from './canvasFiles'
import { requireCanvasName, validCanvasId } from './lcanvas'

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
export type LibraryFileSummary = {
  key: string
  revision: number
  id: string
  projectId: string
  name: string
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
}
export type LibraryIssue = { key: string; recovered: boolean; message: string }
export type LocalLibraryClient = {
  readonly available: boolean
  initialize: (options?: { force?: boolean }) => Promise<LibraryAvailability>
  cached: <T = unknown>(key: string) => LibraryEntry<T>
  entries: () => [string, LibraryEntry][]
  files?: () => LibraryFileSummary[] | null
  issues?: () => LibraryIssue[]
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
class LibraryHttpError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
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
function envelope(value: unknown): {
  entries: Map<string, LibraryEntry>
  issues: LibraryIssue[]
} {
  if (
    !record(value) ||
    value.version !== 1 ||
    !record(value.entries) ||
    Object.keys(value.entries).length > LIBRARY_MAX_ENTRIES
  )
    return fail('The local library returned an invalid collection.')
  const normalized = new Map<string, LibraryEntry>()
  const issues: LibraryIssue[] = []
  for (const [key, item] of Object.entries(value.entries)) {
    requireKey(key)
    try {
      normalized.set(key, entry(item))
    } catch (error) {
      if (!key.startsWith('file:')) throw error
      issues.push({
        key,
        recovered: false,
        message: 'This saved canvas record is invalid.',
      })
    }
  }
  return { entries: normalized, issues }
}
function fileSummary(value: unknown): LibraryFileSummary {
  if (!record(value))
    return fail('The local library returned an invalid canvas index.')
  const {
    key,
    revision,
    id,
    projectId,
    name,
    createdAt,
    updatedAt,
    lastOpenedAt,
  } = value
  if (
    typeof key !== 'string' ||
    !key.startsWith('file:') ||
    !Number.isSafeInteger(revision) ||
    (revision as number) < 1 ||
    !validCanvasId(id) ||
    !validCanvasId(projectId) ||
    key !== libraryKey('file', id) ||
    typeof name !== 'string' ||
    !name.trim() ||
    name !== requireCanvasName(name) ||
    ![createdAt, updatedAt, lastOpenedAt].every(
      (date) =>
        typeof date === 'number' &&
        Number.isInteger(date) &&
        date >= 0 &&
        date <= 8_640_000_000_000_000,
    ) ||
    (updatedAt as number) < (createdAt as number) ||
    (lastOpenedAt as number) < (createdAt as number)
  )
    return fail('The local library returned an invalid canvas index.')
  return {
    key,
    revision: revision as number,
    id,
    projectId,
    name,
    createdAt: createdAt as number,
    updatedAt: updatedAt as number,
    lastOpenedAt: lastOpenedAt as number,
  }
}
function catalog(value: unknown) {
  if (
    !record(value) ||
    value.version !== 2 ||
    !record(value.entries) ||
    !Array.isArray(value.files) ||
    !Array.isArray(value.issues) ||
    Object.keys(value.entries).length + value.files.length >
      LIBRARY_MAX_ENTRIES ||
    value.issues.length > LIBRARY_MAX_ENTRIES
  )
    return fail('The local library returned an invalid catalog.')
  const entries = new Map<string, LibraryEntry>()
  for (const [key, item] of Object.entries(value.entries)) {
    requireKey(key)
    if (key.startsWith('file:'))
      return fail(
        'The local library catalog contains an unexpected canvas body.',
      )
    entries.set(key, entry(item))
  }
  const files = new Map<string, LibraryFileSummary>()
  const issues: LibraryIssue[] = []
  for (const issue of value.issues) {
    if (
      !record(issue) ||
      typeof issue.key !== 'string' ||
      typeof issue.recovered !== 'boolean' ||
      typeof issue.message !== 'string' ||
      issue.message.length > 2000
    )
      return fail('The local library returned an invalid recovery notice.')
    if (issue.key && !KEY_PATTERN.test(issue.key))
      return fail('The local library returned an invalid recovery notice.')
    // Identity, project membership and Trash control which saved items exist
    // in a workspace. Never seed replacements for their damaged records.
    // Optional preferences and saved views are independently recoverable;
    // their failure must not hide every healthy project on a fresh computer.
    if (
      !issue.recovered &&
      (issue.key.startsWith('metadata:') ||
        issue.key.startsWith('sessions:') ||
        issue.key.startsWith('settings:trash_'))
    )
      return fail(
        'The saved workspace settings could not be recovered. Existing files were preserved. Reconnect your drive and retry opening Canvas Live; do not replace the saved library.',
      )
    issues.push({
      key: issue.key,
      recovered: issue.recovered,
      message: issue.message,
    })
  }
  for (const item of value.files) {
    let summary: LibraryFileSummary
    try {
      summary = fileSummary(item)
    } catch {
      if (
        !record(item) ||
        typeof item.key !== 'string' ||
        !KEY_PATTERN.test(item.key)
      )
        return fail('The local library returned an invalid canvas index.')
      issues.push({
        key: item.key,
        recovered: false,
        message: 'This saved canvas index is invalid.',
      })
      continue
    }
    if (files.has(summary.key))
      return fail('The local library returned a duplicate canvas identifier.')
    files.set(summary.key, summary)
  }
  return { entries, files, issues }
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
  let fileIndex: Map<string, LibraryFileSummary> | null = null
  let notices: LibraryIssue[] = []
  let catalogSupported: boolean | null = null
  let refreshing: Promise<void> | null = null
  const reads = new Map<string, Promise<LibraryEntry>>()
  let writeSequence = 0
  const writtenAt = new Map<string, number>()
  let activeRequests = 0
  const requestQueue: (() => void)[] = []
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
    // Catalog-only files retain their real revision before their body is read.
    // Migration uses this revision to distinguish existing files from new IDs.
    return clone(
      cache.get(key) ?? {
        revision: fileIndex?.get(key)?.revision ?? 0,
        value: null,
      },
    ) as LibraryEntry<T>
  }
  async function request(
    path: string,
    init?: RequestInit,
    maximum = LIBRARY_MAX_BYTES,
    requestTimeout = timeoutMs,
  ): Promise<unknown> {
    if (activeRequests >= 4)
      await new Promise<void>((resolve) => requestQueue.push(resolve))
    else activeRequests++
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), requestTimeout)
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
      if (response.status === 404) {
        await response.body?.cancel()
        throw new LibraryHttpError(
          'The local library endpoint was not found.',
          404,
        )
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
        throw new LibraryHttpError(
          record(value) && typeof value.error === 'string'
            ? value.error
            : 'The local library could not save or open this item.',
          response.status,
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
      const next = requestQueue.shift()
      if (next) next()
      else activeRequests--
    }
  }
  async function loadCollection() {
    const startedAt = writeSequence
    if (catalogSupported !== false) {
      try {
        const loaded = catalog(
          await request(
            `${ENDPOINT}/catalog`,
            undefined,
            LIBRARY_MAX_BYTES,
            !available && options.timeoutMs === undefined ? 60_000 : timeoutMs,
          ),
        )
        catalogSupported = true
        const next = loaded.entries
        const recoveredKeys = new Set(
          loaded.issues
            .filter((issue) => issue.recovered)
            .map((issue) => issue.key),
        )
        for (const [key, summary] of loaded.files) {
          const previous = cache.get(key)
          if (previous?.revision === summary.revision) next.set(key, previous)
        }
        for (const [key, previous] of cache) {
          if (recoveredKeys.has(key) && (writtenAt.get(key) ?? 0) <= startedAt)
            continue
          const indexedRevision =
            loaded.files.get(key)?.revision ?? next.get(key)?.revision ?? 0
          if (
            (writtenAt.get(key) ?? 0) <= startedAt &&
            (!indexedRevision || previous.revision <= indexedRevision)
          )
            continue
          next.set(key, previous)
          if (key.startsWith('file:')) {
            const file = validateCanvasFileRecord(previous.value)
            loaded.files.set(key, {
              key,
              revision: previous.revision,
              id: file.id,
              projectId: file.projectId,
              name: file.document.name,
              createdAt: file.createdAt,
              updatedAt: file.updatedAt,
              lastOpenedAt: file.lastOpenedAt,
            })
          }
        }
        cache = next
        fileIndex = loaded.files
        notices = loaded.issues
        return
      } catch (error) {
        if (!(error instanceof LibraryHttpError) || error.status !== 404)
          throw error
        catalogSupported = false
      }
    }
    const loaded = envelope(await request(ENDPOINT))
    for (const [key, previous] of cache) {
      const next = loaded.entries.get(key)
      if (
        (writtenAt.get(key) ?? 0) > startedAt ||
        (next && previous.revision > next.revision)
      )
        loaded.entries.set(key, previous)
    }
    cache = loaded.entries
    notices = loaded.issues
    fileIndex = null
  }
  function refresh() {
    requireAvailable()
    if (refreshing) return refreshing
    refreshing = loadCollection().finally(() => {
      refreshing = null
    })
    return refreshing
  }
  async function read<T = unknown>(
    key: string,
    refreshItem = false,
  ): Promise<LibraryEntry<T>> {
    requireKey(key)
    requireAvailable()
    if (refreshItem || (!cache.has(key) && fileIndex?.has(key))) {
      let reading = reads.get(key)
      if (!reading) {
        const startedAt = writeSequence
        reading = (async () => {
          const loaded = entry(
            await request(
              `${ENDPOINT}/${encodeURIComponent(key)}`,
              undefined,
              LIBRARY_ENTRY_MAX_BYTES + 1024,
            ),
            true,
          )
          if (loaded.revision && key.startsWith('file:')) {
            const file = validateCanvasFileRecord(loaded.value)
            if (key !== libraryKey('file', file.id))
              fail('A local library canvas has a mismatched identifier.')
          }
          const existing = cache.get(key)
          const recovered =
            notices.some((issue) => issue.key === key && issue.recovered) &&
            (writtenAt.get(key) ?? 0) <= startedAt
          if (!existing || loaded.revision >= existing.revision || recovered) {
            if (loaded.revision) cache.set(key, loaded)
            else {
              cache.delete(key)
              fileIndex?.delete(key)
            }
          }
          return loaded
        })().finally(() => {
          reads.delete(key)
        })
        reads.set(key, reading)
      }
      await reading
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
    writtenAt.set(key, ++writeSequence)
    notices = notices.filter((issue) => issue.key !== key)
    if (fileIndex && key.startsWith('file:')) {
      const file = validateCanvasFileRecord(loaded.value)
      fileIndex.set(key, {
        key,
        revision: loaded.revision,
        id: file.id,
        projectId: file.projectId,
        name: file.document.name,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        lastOpenedAt: file.lastOpenedAt,
      })
    }
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
          await loadCollection()
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
    files: () => (fileIndex ? [...fileIndex.values()].map(clone) : null),
    issues: () => clone(notices),
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
  let listingCollection: Promise<void> | null = null
  let listings = 0
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
      listings++
      try {
        listingCollection ??= client.refresh()
        await listingCollection
        const index = client.files?.()
        const files: CanvasFileRecord[] = []
        let failed = 0
        const items = index
          ? index
              .filter((file) => file.projectId === projectId)
              .map((file) => ({
                key: file.key,
                item: null as LibraryEntry | null,
              }))
          : client
              .entries()
              .filter(([key]) => key.startsWith('file:'))
              .map(([key, item]) => ({ key, item }))
        await Promise.all(
          items.map(async ({ key, item }) => {
            try {
              const loaded = item ?? (await client.read(key))
              const file = validateCanvasFileRecord(loaded.value)
              if (key !== libraryKey('file', file.id))
                fail('A local library canvas has a mismatched identifier.')
              if (file.projectId === projectId)
                files.push(opened(file, loaded.revision))
            } catch {
              failed++
            }
          }),
        )
        files.sort(
          (a, b) =>
            b.lastOpenedAt - a.lastOpenedAt ||
            b.updatedAt - a.updatedAt ||
            a.id.localeCompare(b.id),
        )
        const warning = libraryIssueMessage(client.issues?.() ?? [], failed)
        return {
          value: files,
          persistence: 'browser',
          ...(warning ? { error: warning } : {}),
        }
      } finally {
        listings--
        if (!listings) listingCollection = null
      }
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
  sharedClients.set(store, client)
  return store
}
const sharedClients = new WeakMap<CanvasFileStore, LocalLibraryClient>()
export function hasSharedCanvasFileCatalog(store: CanvasFileStore): boolean {
  const client = sharedClients.get(store)
  return Boolean(client?.available && client.files?.())
}
export function libraryIssueMessage(
  issues: readonly LibraryIssue[],
  failed = 0,
): string | undefined {
  const unavailable = issues.filter((issue) => !issue.recovered).length + failed
  const recovered = issues.filter((issue) => issue.recovered).length
  if (unavailable)
    return `${unavailable} saved ${unavailable === 1 ? 'item could' : 'items could'} not be loaded. Healthy files and open drafts are available. Retry loading after reconnecting your drive; original files were preserved.`
  if (recovered)
    return `${recovered} saved ${recovered === 1 ? 'item was' : 'items were'} recovered from a previous valid copy. Check the recovered content before saving.`
  return undefined
}
export async function sharedCanvasFileCatalog(store: CanvasFileStore) {
  const client = sharedClients.get(store)
  if (!client?.available || !client.files) return null
  try {
    await client.refresh()
  } catch (error) {
    const files = client.files()
    if (!files) throw error
    return {
      files,
      error:
        `The saved-file index could not be refreshed. Showing the last loaded index; reconnect your drive and retry loading. ${error instanceof Error ? error.message : ''}`.trim(),
    }
  }
  const files = client.files()
  return files
    ? { files, error: libraryIssueMessage(client.issues?.() ?? []) }
    : null
}
export const localLibrary = createLocalLibraryClient()
export const initializeLocalLibrary = (options?: { force?: boolean }) =>
  localLibrary.initialize(options)
export const sharedCanvasFileStoreFallback = canvasFileStore
export const sharedCanvasFileStore = createSharedCanvasFileStore(
  canvasFileStore,
  localLibrary,
)
