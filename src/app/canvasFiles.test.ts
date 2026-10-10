import { describe, expect, it } from 'vitest'
import {
  createCanvasFileRecord,
  createCanvasFileStore,
  type CanvasFileRecord,
} from './canvasFiles'
import { createCanvasDocument } from './lcanvas'

type Callback = ((event: Event) => unknown) | null
type Request = {
  result: unknown
  error: DOMException | null
  onsuccess: Callback
  onerror: Callback
  onupgradeneeded: Callback
  onblocked: Callback
}

// A small transaction fixture: writes commit together, reads use the project
// index, and an aborted write never enters the durable map. The browser smoke
// check separately verifies the native IndexedDB implementation.
function indexedDBFixture() {
  const durable = new Map<string, CanvasFileRecord>()
  const behavior = { failOpen: false, failReads: false, failWrites: false }
  let initialized = false
  let transactions: Promise<void> = Promise.resolve()
  const database = {
    objectStoreNames: { contains: () => initialized },
    createObjectStore: () => {
      initialized = true
      return { createIndex: () => undefined }
    },
    close: () => undefined,
    onversionchange: null,
    transaction: (_name: string, _mode: string) => {
      const previous = transactions
      let finish: () => void = () => undefined
      transactions = new Promise<void>((resolve) => {
        finish = resolve
      })
      let pending = 0
      let started = false
      let ended = false
      const writes = new Map<string, CanvasFileRecord>()
      const transaction = {
        error: null as DOMException | null,
        oncomplete: null as Callback,
        onerror: null as Callback,
        onabort: null as Callback,
        abort: () => {
          if (ended) return
          ended = true
          queueMicrotask(() => {
            transaction.onabort?.(new Event('abort'))
            finish()
          })
        },
        objectStore: () => store,
      }
      function complete() {
        setTimeout(() => {
          if (ended || pending > 0 || !started) return
          ended = true
          for (const [id, record] of writes)
            durable.set(id, structuredClone(record))
          transaction.oncomplete?.(new Event('complete'))
          finish()
        }, 0)
      }
      function request(
        operation: () => unknown,
        fail: () => boolean,
        message: string,
      ): Request {
        const result: Request = {
          result: undefined,
          error: null,
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
          onblocked: null,
        }
        pending += 1
        void previous.then(() => {
          started = true
          if (ended) return
          if (fail()) {
            transaction.error = new DOMException(message, 'QuotaExceededError')
            result.error = transaction.error
            result.onerror?.(new Event('error'))
            transaction.abort()
            return
          }
          result.result = structuredClone(operation())
          result.onsuccess?.(new Event('success'))
          pending -= 1
          complete()
        })
        return result
      }
      const store = {
        get: (id: string) =>
          request(
            () => writes.get(id) ?? durable.get(id),
            () => behavior.failReads,
            'Read failed',
          ),
        put: (record: CanvasFileRecord) =>
          request(
            () => {
              writes.set(record.id, structuredClone(record))
              return record.id
            },
            () => behavior.failWrites,
            'Write quota exceeded',
          ),
        index: () => ({
          getAll: (projectId: string) =>
            request(
              () =>
                [...durable.values()].filter(
                  (record) => record.projectId === projectId,
                ),
              () => behavior.failReads,
              'Read failed',
            ),
        }),
      }
      return transaction
    },
  }
  const factory = {
    open: () => {
      const request: Request = {
        result: database,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null,
      }
      queueMicrotask(() => {
        if (behavior.failOpen) {
          request.error = new DOMException('Storage denied', 'SecurityError')
          request.onerror?.(new Event('error'))
          return
        }
        if (!initialized) request.onupgradeneeded?.(new Event('upgradeneeded'))
        request.onsuccess?.(new Event('success'))
      })
      return request
    },
  } as unknown as IDBFactory
  return { factory, behavior, durable }
}

function file(projectId = 'project-a', id = 'canvas-a'): CanvasFileRecord {
  return createCanvasFileRecord(
    projectId,
    createCanvasDocument('First canvas'),
    100,
    id,
  )
}

describe('project canvas file store', () => {
  it('persists individual files and restores them through another store instance', async () => {
    const fixture = indexedDBFixture()
    const first = createCanvasFileStore({ indexedDB: fixture.factory })
    expect((await first.save(file())).persistence).toBe('browser')
    const second = createCanvasFileStore({ indexedDB: fixture.factory })
    expect(await second.get('project-a', 'canvas-a')).toEqual({
      value: file(),
      persistence: 'browser',
    })
    expect((await second.list('project-a')).value).toEqual([file()])
  })

  it('indexes files by project and prevents cross-project reads or ownership changes', async () => {
    const fixture = indexedDBFixture()
    const store = createCanvasFileStore({ indexedDB: fixture.factory })
    await store.save(file())
    await store.save(file('project-b', 'canvas-b'))
    expect(
      (await store.list('project-a')).value.map((record) => record.id),
    ).toEqual(['canvas-a'])
    expect((await store.get('project-b', 'canvas-a')).value).toBeNull()
    expect(
      (await store.markOpened('project-b', 'canvas-a', 200)).value,
    ).toBeNull()
    const independent = createCanvasFileStore({ indexedDB: fixture.factory })
    await expect(
      independent.save(file('project-b', 'canvas-a')),
    ).rejects.toThrow('another project')
    expect(fixture.durable.get('canvas-a')?.projectId).toBe('project-a')
  })

  it('marks a file opened without replacing a newer saved document', async () => {
    const fixture = indexedDBFixture()
    const store = createCanvasFileStore({ indexedDB: fixture.factory })
    await store.save(file())
    const edited = {
      ...file(),
      document: createCanvasDocument('Renamed and saved'),
      updatedAt: 150,
    }
    const saving = store.save(edited)
    const opening = store.markOpened('project-a', 'canvas-a', 200)
    await saving
    expect((await opening).value).toEqual({ ...edited, lastOpenedAt: 200 })
    expect(
      (await store.markOpened('project-a', 'canvas-a', 120)).value
        ?.lastOpenedAt,
    ).toBe(200)
    expect(
      (await store.get('project-a', 'canvas-a')).value?.document.name,
    ).toBe('Renamed and saved')
  })

  it('preserves newer open recency when a stale UI snapshot is saved afterward', async () => {
    const fixture = indexedDBFixture()
    const store = createCanvasFileStore({ indexedDB: fixture.factory })
    await store.save(file())
    const opening = store.markOpened('project-a', 'canvas-a', 300)
    const edited = {
      ...file(),
      document: createCanvasDocument('Saved from earlier snapshot'),
      updatedAt: 200,
    }
    const saving = store.save(edited)
    await opening
    const saved = await saving
    expect(saved.value).toEqual({ ...edited, lastOpenedAt: 300 })
    expect(fixture.durable.get('canvas-a')).toEqual(saved.value)
    expect((await store.get('project-a', 'canvas-a')).value).toEqual(
      saved.value,
    )
  })

  it('preserves session recency through a save and serializes fallback ownership checks', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    await store.save(file())
    const opening = store.markOpened('project-a', 'canvas-a', 300)
    const saving = store.save({ ...file(), updatedAt: 200 })
    await opening
    expect((await saving).value.lastOpenedAt).toBe(300)
    const fresh = createCanvasFileStore({ indexedDB: null })
    const first = fresh.save(file())
    const conflicting = fresh.save(file('project-b', 'canvas-a'))
    await first
    await expect(conflicting).rejects.toThrow('another project')
    expect((await fresh.get('project-a', 'canvas-a')).value?.projectId).toBe(
      'project-a',
    )
  })

  it('keeps unavailable storage records in this session and signals the limitation', async () => {
    const store = createCanvasFileStore({ indexedDB: null })
    const result = await store.save(file())
    expect(result.persistence).toBe('session')
    expect(result.error).toContain('export a copy')
    expect((await store.list('project-a')).value).toEqual([file()])
    expect((await store.get('project-a', 'canvas-a')).value).toEqual(file())
    expect((await store.get('project-b', 'canvas-a')).value).toBeNull()
    expect(
      (await store.markOpened('project-a', 'canvas-a', 200)).value
        ?.lastOpenedAt,
    ).toBe(200)
    expect(
      (await createCanvasFileStore({ indexedDB: null }).list('project-a'))
        .value,
    ).toEqual([])
  })

  it('recovers from a denied database open without falsely reporting a browser save', async () => {
    const fixture = indexedDBFixture()
    fixture.behavior.failOpen = true
    const store = createCanvasFileStore({ indexedDB: fixture.factory })
    expect((await store.save(file())).persistence).toBe('session')
    fixture.behavior.failOpen = false
    expect((await store.save({ ...file(), updatedAt: 200 })).persistence).toBe(
      'browser',
    )
    expect((await store.list('project-a')).persistence).toBe('browser')
  })

  it('retains an unsaved viewport over the older durable record after quota failure', async () => {
    const fixture = indexedDBFixture()
    const store = createCanvasFileStore({ indexedDB: fixture.factory })
    await store.save(file())
    fixture.behavior.failWrites = true
    const edited = {
      ...file(),
      updatedAt: 200,
      document: { ...file().document, viewport: { x: 250, y: -50, zoom: 2 } },
    }
    expect((await store.save(edited)).persistence).toBe('session')
    expect(fixture.durable.get('canvas-a')).toEqual(file())
    expect((await store.list('project-a')).value).toEqual([edited])
    const marked = await store.markOpened('project-a', 'canvas-a', 250)
    expect(marked.value?.document.viewport.zoom).toBe(2)
    expect(marked.persistence).toBe('session')
    fixture.behavior.failWrites = false
    expect(
      (await store.save({ ...edited, lastOpenedAt: 250 })).persistence,
    ).toBe('browser')
    expect((await store.list('project-a')).persistence).toBe('browser')
  })

  it('uses previously read records during a read failure and preserves project isolation', async () => {
    const fixture = indexedDBFixture()
    const store = createCanvasFileStore({ indexedDB: fixture.factory })
    await store.save(file())
    fixture.behavior.failReads = true
    expect((await store.get('project-a', 'canvas-a')).persistence).toBe(
      'session',
    )
    expect((await store.list('project-a')).value).toEqual([file()])
    expect((await store.list('project-b')).value).toEqual([])
  })

  it('returns independent records and rejects invalid documents before any write', async () => {
    const fixture = indexedDBFixture()
    const store = createCanvasFileStore({ indexedDB: fixture.factory })
    const original = file()
    const saved = await store.save(original)
    saved.value.document.name = 'Mutation'
    original.document.name = 'Other mutation'
    expect(
      (await store.get('project-a', 'canvas-a')).value?.document.name,
    ).toBe('First canvas')
    await expect(
      store.save({
        ...file(),
        document: {
          ...file().document,
          viewport: { x: Infinity, y: 0, zoom: 1 },
        },
      }),
    ).rejects.toThrow()
    expect(fixture.durable.get('canvas-a')?.document.name).toBe('First canvas')
  })

  it('flags corrupt durable documents and prevents replacing them or moving their IDs', async () => {
    const fixture = indexedDBFixture()
    fixture.durable.set('canvas-a', {
      ...file(),
      document: { ...file().document, version: 2 },
    } as unknown as CanvasFileRecord)
    const store = createCanvasFileStore({ indexedDB: fixture.factory })
    const listing = await store.list('project-a')
    expect(listing.value).toEqual([])
    expect(listing.error).toContain('invalid')
    await expect(store.get('project-a', 'canvas-a')).rejects.toThrow(
      'version is not supported',
    )
    await expect(store.save(file())).rejects.toThrow('version is not supported')
  })

  it('assigns unique local IDs to independent imports without changing the portable document', () => {
    const document = createCanvasDocument('Portable canvas')
    const first = createCanvasFileRecord('project-a', document)
    const second = createCanvasFileRecord('project-a', document)
    expect(first.id).not.toBe(second.id)
    expect(first.document).toEqual(second.document)
    expect(document).not.toHaveProperty('projectId')
  })

  it.each([
    { id: '' },
    { projectId: '\nproject' },
    { createdAt: -1 },
    { updatedAt: 99 },
    { lastOpenedAt: 99 },
  ])('rejects invalid record identifiers and dates', async (overrides) => {
    const store = createCanvasFileStore({ indexedDB: null })
    await expect(store.save({ ...file(), ...overrides })).rejects.toThrow()
  })
})
