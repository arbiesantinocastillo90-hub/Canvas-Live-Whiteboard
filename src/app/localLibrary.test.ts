import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCanvasDocument } from './lcanvas'
import {
  createCanvasFileRecord,
  validateCanvasFileRecord,
  type CanvasFileRecord,
  type CanvasFileStore,
} from './canvasFiles'
import {
  createLocalLibraryClient,
  createSharedCanvasFileStore,
  libraryKey,
  LibraryConflictError,
  LIBRARY_MAX_BYTES,
  LIBRARY_ENTRY_MAX_BYTES,
  type LibraryEntry,
} from './localLibrary'

function response(value: unknown, status = 200, length?: number): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (key: string) =>
        key.toLowerCase() === 'content-length' && length !== undefined
          ? String(length)
          : null,
    },
    body: null,
    text: async () => JSON.stringify(value),
  } as Response
}
function server() {
  const entries: Record<string, LibraryEntry> = {}
  let offline = false
  let override: Response | null = null
  let beforePut: (() => void) | null = null
  const calls: { path: string; method: string; revision?: number }[] = []
  const fetcher = vi.fn<typeof fetch>(async (target, init) => {
    if (offline) throw new Error('Local server disconnected')
    if (override) {
      const result = override
      override = null
      return result
    }
    const path = String(target)
    const method = init?.method ?? 'GET'
    const call: (typeof calls)[number] = { path, method }
    calls.push(call)
    expect(init?.credentials).toBe('same-origin')
    expect(init?.cache).toBe('no-store')
    expect(init?.redirect).toBe('error')
    if (path === '/__canvas_live_library')
      return response({ version: 1, entries: structuredClone(entries) })
    const key = decodeURIComponent(path.slice('/__canvas_live_library/'.length))
    if (method === 'GET')
      return response(
        structuredClone(entries[key] ?? { revision: 0, value: null }),
      )
    const headers = init?.headers as Record<string, string>
    const expected = Number(headers['If-Match'])
    call.revision = expected
    expect(headers['Content-Type']).toBe('application/json')
    beforePut?.()
    const current = entries[key]?.revision ?? 0
    if (expected !== current) return response({ error: 'Conflict' }, 409)
    const next = {
      revision: current + 1,
      value: JSON.parse(String(init?.body)) as unknown,
    }
    entries[key] = structuredClone(next)
    return response(next)
  })
  return {
    fetcher,
    entries,
    calls,
    disconnect: () => {
      offline = true
    },
    override: (value: Response) => {
      override = value
    },
    beforePut: (action: (() => void) | null) => {
      beforePut = action
    },
    client: () =>
      createLocalLibraryClient({ fetch: fetcher, enabled: () => true }),
  }
}
function fallback() {
  const files = new Map<string, CanvasFileRecord>()
  const store = {
    list: vi.fn<CanvasFileStore['list']>(async (projectId) => ({
      value: [...files.values()].filter((file) => file.projectId === projectId),
      persistence: 'browser',
    })),
    get: vi.fn<CanvasFileStore['get']>(async (projectId, id) => ({
      value:
        files.get(id)?.projectId === projectId
          ? structuredClone(files.get(id)!)
          : null,
      persistence: 'browser',
    })),
    markOpened: vi.fn<CanvasFileStore['markOpened']>(async (projectId, id) => ({
      value:
        files.get(id)?.projectId === projectId
          ? structuredClone(files.get(id)!)
          : null,
      persistence: 'browser',
    })),
    save: vi.fn<CanvasFileStore['save']>(async (input) => {
      const value = validateCanvasFileRecord(input)
      files.set(value.id, value)
      return { value, persistence: 'browser' }
    }),
  }
  return { store, files }
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.head
    .querySelectorAll('meta[name="canvas-live-storage"]')
    .forEach((meta) => meta.remove())
})

describe('native local library transport', () => {
  it('does not probe arbitrary preview/web origins; the native marker or explicit force is required', async () => {
    const native = server()
    const client = createLocalLibraryClient({ fetch: native.fetcher })
    expect(await client.initialize()).toEqual({ available: false })
    expect(native.fetcher).not.toHaveBeenCalled()
    const meta = document.createElement('meta')
    meta.name = 'canvas-live-storage'
    meta.content = 'local-v1'
    document.head.append(meta)
    expect(await client.initialize()).toEqual({ available: true })
    expect(client.available).toBe(true)
    expect(native.fetcher).toHaveBeenCalledOnce()
    const forced = createLocalLibraryClient({
      fetch: native.fetcher,
      enabled: () => false,
    })
    expect(await forced.initialize({ force: true })).toEqual({
      available: true,
    })
  })

  it('isolates cached JSON and supports bounded Unicode identifiers without putting paths in URLs', async () => {
    const native = server()
    const client = native.client()
    const key = libraryKey('metadata', '工作区 / planning')
    expect(key).toMatch(/^metadata:[A-Za-z0-9_-]+$/u)
    expect(key).not.toContain('planning')
    expect(() => libraryKey('file', '🙂'.repeat(100))).toThrow('identifier')
    expect(() => libraryKey('file', 'bad\u0000id')).toThrow('identifier')
    expect(() => client.cached('file:../../private')).toThrow('identifier')
    await client.initialize()
    const original = { nested: { name: 'First' } }
    await client.write(key, original)
    original.nested.name = 'Mutated'
    const cached = client.cached<typeof original>(key)
    cached.value!.nested.name = 'Another mutation'
    expect(client.cached<typeof original>(key).value?.nested.name).toBe('First')
    const entries = client.entries()
    ;(entries[0][1].value as typeof original).nested.name = 'Changed'
    expect(client.cached<typeof original>(key).value?.nested.name).toBe('First')
    expect(await client.read(libraryKey('file', 'missing'), true)).toEqual({
      revision: 0,
      value: null,
    })
  })

  it('serializes writes per key and detects conflicts between independent clients', async () => {
    const native = server()
    const first = native.client()
    const second = native.client()
    await Promise.all([first.initialize(), second.initialize()])
    const key = libraryKey('settings', 'main')
    const results = await Promise.all([
      first.write(key, { count: 1 }),
      first.write(key, { count: 2 }),
    ])
    expect(results.map((item) => item.revision)).toEqual([1, 2])
    await expect(second.write(key, { count: 999 })).rejects.toBeInstanceOf(
      LibraryConflictError,
    )
    expect(second.cached(key).revision).toBe(0)
    expect((await second.read<{ count: number }>(key, true)).value?.count).toBe(
      2,
    )
    expect((await second.write(key, { count: 3 })).revision).toBe(3)
    expect(native.entries[key]).toEqual({ revision: 3, value: { count: 3 } })
    expect(
      native.calls
        .filter((call) => call.method === 'PUT')
        .map((call) => call.revision),
    ).toEqual([0, 1, 0, 2])
  })

  it('retries transforms against freshly read state after a conflict without losing concurrent changes', async () => {
    const native = server()
    const client = native.client()
    await client.initialize()
    const key = libraryKey('metadata', 'main')
    await client.write(key, { mine: 0, other: 0 })
    native.beforePut(() => {
      native.beforePut(null)
      native.entries[key] = { revision: 2, value: { mine: 0, other: 7 } }
    })
    const update = vi.fn((current: { mine: number; other: number } | null) => ({
      ...current!,
      mine: current!.mine + 1,
    }))
    expect(await client.transform(key, update)).toEqual({
      revision: 3,
      value: { mine: 1, other: 7 },
    })
    expect(update).toHaveBeenCalledTimes(2)
    native.beforePut(() => {
      native.entries[key] = {
        revision: native.entries[key].revision + 1,
        value: { mine: 1, other: 8 },
      }
    })
    await expect(client.transform(key, update, 1)).rejects.toBeInstanceOf(
      LibraryConflictError,
    )
    expect(native.entries[key].value).toEqual({ mine: 1, other: 8 })
  })

  it.each([
    { version: 2, entries: {} },
    { version: 1, entries: { 'file:invalid/key': { revision: 1, value: {} } } },
    { version: 1, entries: { 'file:YWJj': { revision: 0, value: {} } } },
    { version: 1, entries: { 'file:YWJj': { revision: 1.5, value: {} } } },
    { version: 1, entries: { 'file:YWJj': { revision: 1, value: [] } } },
    {
      version: 1,
      entries: Object.fromEntries(
        Array.from({ length: 2001 }, (_, i) => [
          `file:${i}`,
          { revision: 1, value: {} },
        ]),
      ),
    },
  ])(
    'rejects malformed native collections without enabling shared storage',
    async (value) => {
      const native = server()
      native.override(response(value))
      const client = native.client()
      expect(await client.initialize()).toMatchObject({
        available: false,
        error: expect.stringContaining('local library'),
      })
      expect(client.entries()).toEqual([])
    },
  )

  it('bounds declared responses and item bodies, and rejects non-JSON or non-finite values before writing', async () => {
    const native = server()
    native.override(response({}, 200, LIBRARY_MAX_BYTES + 1))
    const client = native.client()
    expect(await client.initialize()).toMatchObject({
      available: false,
      error: expect.stringContaining('size limit'),
    })
    await client.initialize()
    const key = libraryKey('view', 'test')
    const invalid = [
      null,
      [],
      new Date(),
      { bad: NaN },
      { bad: undefined },
      { bad: Infinity },
      JSON.parse('{"__proto__":{}}'),
    ]
    for (const value of invalid)
      await expect(client.write(key, value)).rejects.toThrow()
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    await expect(client.write(key, cycle)).rejects.toThrow('plain JSON')
    const large = {
      text: '🙂'.repeat(Math.floor(LIBRARY_ENTRY_MAX_BYTES / 4) + 1),
    }
    await expect(client.write(key, large)).rejects.toThrow('16 MiB')
    expect(native.calls.filter((call) => call.method === 'PUT')).toHaveLength(0)
    native.override(response({ error: 'Read-only volume' }, 503))
    await expect(client.write(key, {})).rejects.toThrow('Read-only volume')
    expect(client.available).toBe(true)
  })

  it('aborts an unresponsive native server and preserves availability after a later disconnection', async () => {
    const fetcher = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    const hanging = createLocalLibraryClient({
      fetch: fetcher,
      enabled: () => true,
      timeoutMs: 5,
    })
    expect(await hanging.initialize()).toMatchObject({
      available: false,
      error: expect.stringContaining('in time'),
    })
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true)
    const native = server()
    const client = native.client()
    await client.initialize()
    native.disconnect()
    await expect(client.read(libraryKey('file', 'abc'), true)).rejects.toThrow(
      'disconnected',
    )
    expect(client.available).toBe(true)
    expect(await client.initialize()).toMatchObject({
      available: true,
      error: expect.stringContaining('disconnected'),
    })
  })
})

describe('shared physical-library canvas store', () => {
  it('uses the browser fallback only when native storage has not been initialized', async () => {
    const native = server()
    const client = native.client()
    const local = fallback()
    const store = createSharedCanvasFileStore(local.store, client)
    const file = createCanvasFileRecord(
      'project',
      createCanvasDocument('Canvas'),
      1,
      'file',
    )
    await store.save(file)
    await store.get('project', 'file')
    await store.list('project')
    await store.markOpened('project', 'file', 10)
    expect(local.store.save).toHaveBeenCalledOnce()
    expect(local.store.list).toHaveBeenCalledOnce()
    expect(local.store.markOpened).toHaveBeenCalledOnce()
    expect(native.fetcher).not.toHaveBeenCalled()
    await client.initialize()
    expect((await store.list('project')).value).toEqual([])
    expect(local.store.list).toHaveBeenCalledOnce()
  })

  it('shares the same file between independent browser clients and records opening time without writing content', async () => {
    const native = server()
    const a = native.client()
    const b = native.client()
    await Promise.all([a.initialize(), b.initialize()])
    const localA = fallback()
    const localB = fallback()
    const first = createSharedCanvasFileStore(localA.store, a)
    const second = createSharedCanvasFileStore(localB.store, b)
    const file = createCanvasFileRecord(
      'project',
      createCanvasDocument('Original'),
      1,
      'file',
    )
    await first.save(file)
    const list = await second.list('project')
    expect(list.value.map((item) => item.document.name)).toEqual(['Original'])
    const puts = native.calls.filter((call) => call.method === 'PUT').length
    const opened = await second.markOpened('project', 'file', 90)
    expect(opened.value?.lastOpenedAt).toBe(90)
    expect(native.calls.filter((call) => call.method === 'PUT')).toHaveLength(
      puts,
    )
    expect(
      (native.entries[libraryKey('file', 'file')].value as CanvasFileRecord)
        .lastOpenedAt,
    ).toBe(1)
    const edited = {
      ...opened.value!,
      document: createCanvasDocument('Edited in iframe'),
      updatedAt: 95,
    }
    const saved = await second.save(edited)
    expect(saved.value.document.name).toBe('Edited in iframe')
    expect((await first.get('project', 'file')).value?.document.name).toBe(
      'Edited in iframe',
    )
    expect((await first.get('other', 'file')).value).toBeNull()
    expect(localB.store.save).toHaveBeenCalledOnce()
    expect(JSON.stringify(saved.value)).not.toContain('revision')
  })

  it('rejects stale edits even if a background listing has seen a newer revision', async () => {
    const native = server()
    const a = native.client()
    const b = native.client()
    await Promise.all([a.initialize(), b.initialize()])
    const first = createSharedCanvasFileStore(fallback().store, a)
    const second = createSharedCanvasFileStore(fallback().store, b)
    await first.save(
      createCanvasFileRecord(
        'project',
        createCanvasDocument('Original'),
        1,
        'file',
      ),
    )
    const old = (await first.get('project', 'file')).value!
    const theirs = (await second.get('project', 'file')).value!
    await second.save({
      ...theirs,
      document: createCanvasDocument('Concurrent edit'),
      updatedAt: 10,
    })
    await first.list('project')
    await expect(
      first.save({
        ...old,
        document: createCanvasDocument('Stale edit'),
        updatedAt: 11,
      }),
    ).rejects.toBeInstanceOf(LibraryConflictError)
    expect(
      (native.entries[libraryKey('file', 'file')].value as CanvasFileRecord)
        .document.name,
    ).toBe('Concurrent edit')
    const latest = (await first.get('project', 'file')).value!
    const saved = await first.save({
      ...latest,
      document: createCanvasDocument('Deliberate later edit'),
      updatedAt: 12,
    })
    expect(saved.value.document.name).toBe('Deliberate later edit')
  })

  it('does not overwrite unloaded existing IDs or move a file between projects', async () => {
    const native = server()
    const client = native.client()
    await client.initialize()
    const store = createSharedCanvasFileStore(fallback().store, client)
    const file = createCanvasFileRecord(
      'project',
      createCanvasDocument('Original'),
      1,
      'file',
    )
    await store.save(file)
    const foreign = createSharedCanvasFileStore(fallback().store, client)
    await expect(
      foreign.save({
        ...file,
        document: createCanvasDocument('Unloaded copy'),
      }),
    ).rejects.toBeInstanceOf(LibraryConflictError)
    const loaded = (await store.get('project', 'file')).value!
    await expect(store.save({ ...loaded, projectId: 'other' })).rejects.toThrow(
      'another file or project',
    )
    await expect(store.save({ ...loaded, createdAt: 0 })).rejects.toThrow(
      'another file or project',
    )
    expect(
      (native.entries[libraryKey('file', 'file')].value as CanvasFileRecord)
        .projectId,
    ).toBe('project')
  })

  it('never silently falls back after connecting; failed writes keep native data and browser cache intact', async () => {
    const native = server()
    const client = native.client()
    await client.initialize()
    const local = fallback()
    const store = createSharedCanvasFileStore(local.store, client)
    const file = createCanvasFileRecord(
      'project',
      createCanvasDocument('Original'),
      1,
      'file',
    )
    const saved = (await store.save(file)).value
    native.disconnect()
    await expect(
      store.save({
        ...saved,
        document: createCanvasDocument('Unsaved'),
        updatedAt: 2,
      }),
    ).rejects.toThrow('disconnected')
    await expect(store.list('project')).rejects.toThrow('disconnected')
    await expect(store.get('project', 'file')).rejects.toThrow('disconnected')
    expect(local.store.save).toHaveBeenCalledOnce()
    expect(local.files.get('file')?.document.name).toBe('Original')
    expect(
      (native.entries[libraryKey('file', 'file')].value as CanvasFileRecord)
        .document.name,
    ).toBe('Original')
  })

  it('reports native success when the optional browser cache fails, and validates corrupt records before exposing them', async () => {
    const native = server()
    const client = native.client()
    await client.initialize()
    const local = fallback()
    local.store.save.mockRejectedValue(new Error('IDB full'))
    const store = createSharedCanvasFileStore(local.store, client)
    const file = createCanvasFileRecord(
      'project',
      createCanvasDocument('Original'),
      1,
      'file',
    )
    const saved = await store.save(file)
    expect(saved.error).toContain('Saved in the local library')
    expect(saved.value.document.name).toBe('Original')
    native.entries[libraryKey('file', 'file')] = {
      revision: 2,
      value: { ...file, projectId: 'project', document: { bad: true } },
    }
    await expect(store.list('project')).rejects.toThrow()
    await expect(store.get('project', 'file')).rejects.toThrow()
    native.entries[libraryKey('file', 'file')] = {
      revision: 3,
      value: { ...file, id: 'wrong-id' },
    }
    await expect(store.get('project', 'file')).rejects.toThrow(
      'mismatched identifier',
    )
  })
})
