import { describe, expect, it, vi } from 'vitest'
import {
  createCanvasFileRecord,
  createCanvasFileStore,
  type CanvasFileRecord,
} from './canvasFiles'
import { createCanvasDocument } from './lcanvas'
import {
  createLocalLibraryClient,
  createSharedCanvasFileStore,
  libraryKey,
  LibraryConflictError,
  sharedCanvasFileCatalog,
  type LibraryEntry,
  type LibraryIssue,
} from './localLibrary'

const endpoint = '/__canvas_live_library'
function response(value: unknown, status = 200): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    body: null,
    text: async () => JSON.stringify(value),
  } as unknown as Response
}
function file(id: string, projectId = 'project', name = id) {
  return createCanvasFileRecord(projectId, createCanvasDocument(name), 1, id)
}
function native(files: CanvasFileRecord[]) {
  const values = new Map<string, LibraryEntry>(
    files.map((record) => [
      libraryKey('file', record.id),
      { revision: 1, value: record },
    ]),
  )
  const summaries = () =>
    [...values].map(([key, item]) => {
      const record = item.value as CanvasFileRecord
      return {
        key,
        revision: item.revision,
        id: record.id,
        projectId: record.projectId,
        name: record.document.name,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        lastOpenedAt: record.lastOpenedAt,
      }
    })
  let issues: LibraryIssue[] = []
  let unavailable = false
  let delay = false
  let active = 0
  let peak = 0
  const bad = new Set<string>()
  const calls: string[] = []
  const fetcher = vi.fn<typeof fetch>(async (target, init) => {
    calls.push(String(target))
    if (unavailable) throw new Error('USB disconnected')
    active++
    peak = Math.max(peak, active)
    try {
      if (delay) await new Promise((resolve) => setTimeout(resolve, 1))
      if (String(target) === `${endpoint}/catalog`)
        return response({
          version: 2,
          entries: {
            [libraryKey('settings', 'main')]: {
              revision: 3,
              value: { theme: 'dark' },
            },
          },
          files: summaries(),
          issues,
        })
      if (String(target) === endpoint)
        throw new Error('Full collection should not be requested')
      const key = decodeURIComponent(String(target).slice(endpoint.length + 1))
      if (issues.some((issue) => issue.key === key && !issue.recovered))
        return response(
          {
            error:
              'This saved item needs recovery; its original data was retained and cannot be overwritten.',
          },
          503,
        )
      const previous = values.get(key) ?? { revision: 0, value: null }
      if (init?.method === 'PUT') {
        if (
          Number((init.headers as Record<string, string>)['If-Match']) !==
          previous.revision
        )
          return response({ error: 'Conflict' }, 409)
        const next = {
          revision: previous.revision + 1,
          value: JSON.parse(String(init.body)) as unknown,
        }
        values.set(key, next)
        return response(next)
      }
      return response(
        bad.has(key)
          ? { revision: previous.revision, value: { bad: true } }
          : previous,
      )
    } finally {
      active--
    }
  })
  const client = createLocalLibraryClient({
    fetch: fetcher,
    enabled: () => true,
  })
  const fallback = createCanvasFileStore({ indexedDB: null })
  const store = createSharedCanvasFileStore(fallback, client)
  return {
    client,
    store,
    calls,
    values,
    bad,
    get peak() {
      return peak
    },
    setIssues: (next: LibraryIssue[]) => {
      issues = next
    },
    disconnect: () => {
      unavailable = true
    },
    delay: () => {
      delay = true
    },
  }
}

describe('lightweight native library catalog', () => {
  it('adopts a recovered canonical file revision even when it is lower than a previously cached revision', async () => {
    const server = native([file('first')])
    const key = libraryKey('file', 'first')
    server.values.set(key, {
      revision: 2,
      value: file('first', 'project', 'Latest before corruption'),
    })
    await server.client.initialize()
    await server.store.list('project')
    server.values.set(key, {
      revision: 1,
      value: file('first', 'project', 'Recovered copy'),
    })
    server.setIssues([
      { key, recovered: true, message: 'Recovered previous durable version' },
    ])
    const result = await server.store.list('project')
    expect(result.value[0].document.name).toBe('Recovered copy')
    expect(server.client.cached(key).revision).toBe(1)
    expect(server.client.files?.()?.[0].revision).toBe(1)
    expect(result.error).toContain('recovered from a previous valid copy')
    await server.store.save({
      ...result.value[0],
      document: createCanvasDocument('Checked and saved'),
    })
    expect(server.client.cached(key).revision).toBe(2)
    expect(server.client.issues?.()).toEqual([])
  })

  it('adopts recovered workspace metadata rather than retaining a higher corrupt revision in memory', async () => {
    const key = libraryKey('metadata', 'main')
    let recovered = false
    const fetcher = vi.fn<typeof fetch>(async () =>
      response({
        version: 2,
        entries: {
          [key]: {
            revision: recovered ? 1 : 2,
            value: {
              name: recovered ? 'Recovered workspace' : 'Latest workspace',
            },
          },
        },
        files: [],
        issues: recovered
          ? [
              {
                key,
                recovered: true,
                message: 'Recovered previous durable version',
              },
            ]
          : [],
      }),
    )
    const client = createLocalLibraryClient({
      fetch: fetcher,
      enabled: () => true,
    })
    await client.initialize()
    recovered = true
    await client.refresh()
    expect(client.cached(key)).toEqual({
      revision: 1,
      value: { name: 'Recovered workspace' },
    })
  })

  it('opens only the index at startup and lazily loads documents from the requested project', async () => {
    const server = native([file('first'), file('second', 'other')])
    expect(await server.client.initialize()).toEqual({ available: true })
    expect(server.calls).toEqual([`${endpoint}/catalog`])
    expect(server.client.entries().map(([key]) => key)).toEqual([
      libraryKey('settings', 'main'),
    ])
    expect(server.client.cached(libraryKey('file', 'first'))).toEqual({
      revision: 1,
      value: null,
    })
    expect(
      (await server.store.list('project')).value.map((record) => record.id),
    ).toEqual(['first'])
    expect(server.calls).not.toContain(
      `${endpoint}/${encodeURIComponent(libraryKey('file', 'second'))}`,
    )
    expect(server.calls).not.toContain(endpoint)
  })

  it('retains loaded bodies by revision and refetches only changed files', async () => {
    const server = native([file('first'), file('second')])
    await server.client.initialize()
    await server.store.list('project')
    server.calls.length = 0
    await server.store.list('project')
    expect(server.calls).toEqual([`${endpoint}/catalog`])
    const key = libraryKey('file', 'second')
    server.values.set(key, {
      revision: 2,
      value: file('second', 'project', 'Changed'),
    })
    server.calls.length = 0
    expect(
      (await server.store.list('project')).value.map(
        (record) => record.document.name,
      ),
    ).toContain('Changed')
    expect(server.calls).toEqual([
      `${endpoint}/catalog`,
      `${endpoint}/${encodeURIComponent(key)}`,
    ])
  })

  it('deduplicates concurrent catalog and item reads, with a global four-request limit across projects', async () => {
    const files = Array.from({ length: 20 }, (_, index) =>
      file(`file-${index}`, `project-${index % 5}`),
    )
    const server = native(files)
    await server.client.initialize()
    server.delay()
    server.calls.length = 0
    const lists = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        server.store.list(`project-${index}`),
      ),
    )
    expect(lists.flatMap((result) => result.value)).toHaveLength(20)
    expect(
      server.calls.filter((path) => path.endsWith('/catalog')),
    ).toHaveLength(1)
    expect(server.peak).toBeLessThanOrEqual(4)
    const path = `${endpoint}/${encodeURIComponent(libraryKey('file', 'file-0'))}`
    server.calls.length = 0
    await Promise.all([
      server.store.get('project-0', 'file-0'),
      server.store.get('project-0', 'file-0'),
      server.store.get('project-0', 'file-0'),
    ])
    expect(server.calls).toEqual([path])
  })

  it('keeps healthy files available when another document body is invalid', async () => {
    const server = native([file('good'), file('bad')])
    await server.client.initialize()
    server.bad.add(libraryKey('file', 'bad'))
    const result = await server.store.list('project')
    expect(result.value.map((record) => record.id)).toEqual(['good'])
    expect(result.error).toContain('1 saved item could not be loaded')
    await expect(server.store.get('project', 'bad')).rejects.toThrow()
    server.bad.clear()
    const retried = await server.store.list('project')
    expect(retried.value).toHaveLength(2)
    expect(retried.error).toBeUndefined()
  })

  it('surfaces recovered-copy notices and unrecoverable records without resetting healthy data', async () => {
    const server = native([file('good')])
    server.setIssues([
      {
        key: libraryKey('file', 'missing'),
        recovered: false,
        message: 'Preserved invalid file',
      },
    ])
    await server.client.initialize()
    expect(await server.store.list('project')).toMatchObject({
      value: [expect.objectContaining({ id: 'good' })],
      error: expect.stringContaining('original files were preserved'),
    })
    server.setIssues([
      {
        key: libraryKey('file', 'good'),
        recovered: true,
        message: 'Recovered from backup',
      },
    ])
    expect((await server.store.list('project')).error).toContain(
      'recovered from a previous valid copy',
    )
  })

  it('does not fall back to browser data on transport failure, and retains the last summary explicitly for Home', async () => {
    const server = native([file('good')])
    await server.client.initialize()
    server.disconnect()
    await expect(server.store.list('project')).rejects.toThrow(
      'USB disconnected',
    )
    expect(await sharedCanvasFileCatalog(server.store)).toMatchObject({
      files: [expect.objectContaining({ id: 'good' })],
      error: expect.stringContaining('last loaded index'),
    })
    expect(server.client.available).toBe(true)
  })

  it('keeps version conflicts after a newer catalog is loaded and updates the local index after a successful save', async () => {
    const server = native([file('good')])
    await server.client.initialize()
    const original = (await server.store.get('project', 'good')).value!
    server.values.set(libraryKey('file', 'good'), {
      revision: 2,
      value: file('good', 'project', 'Concurrent'),
    })
    await server.client.refresh()
    await expect(
      server.store.save({
        ...original,
        document: createCanvasDocument('Stale'),
      }),
    ).rejects.toBeInstanceOf(LibraryConflictError)
    const latest = (await server.store.get('project', 'good')).value!
    await server.store.save({
      ...latest,
      document: createCanvasDocument('Saved'),
    })
    expect(
      server.client.files?.()?.find((item) => item.id === 'good'),
    ).toMatchObject({ revision: 3, name: 'Saved' })
  })

  it('falls back only on a real 404 from an older native host and remembers that capability', async () => {
    const fetcher = vi.fn<typeof fetch>(async (path) =>
      String(path).endsWith('/catalog')
        ? response({ error: 'Not found' }, 404)
        : response({ version: 1, entries: {} }),
    )
    const client = createLocalLibraryClient({
      fetch: fetcher,
      enabled: () => true,
    })
    expect(await client.initialize()).toEqual({ available: true })
    await client.refresh()
    expect(fetcher.mock.calls.map(([path]) => String(path))).toEqual([
      `${endpoint}/catalog`,
      endpoint,
      endpoint,
    ])
    expect(client.files?.()).toBeNull()
    const malformed = createLocalLibraryClient({
      fetch: vi.fn(async () =>
        response({ version: 2, entries: {} }),
      ) as typeof fetch,
      enabled: () => true,
    })
    expect(await malformed.initialize()).toMatchObject({
      available: false,
      error: expect.stringContaining('invalid catalog'),
    })
  })

  it('isolates unknown damaged records while refusing to replace unrecoverable workspace settings', async () => {
    const server = native([file('good')])
    server.setIssues([
      {
        key: '',
        recovered: false,
        message: 'Unknown damaged record preserved',
      },
    ])
    expect(await server.client.initialize()).toEqual({ available: true })
    expect((await server.store.list('project')).value).toHaveLength(1)
    const metadata = native([file('good')])
    metadata.setIssues([
      {
        key: libraryKey('metadata', 'main'),
        recovered: false,
        message: 'Unrecoverable metadata',
      },
    ])
    expect(await metadata.client.initialize()).toMatchObject({
      available: false,
      error: expect.stringContaining(
        'workspace settings could not be recovered',
      ),
    })
    expect(metadata.client.entries()).toEqual([])
  })

  it.each([
    ['mini preferences', libraryKey('settings', 'ai-mini-workspace')],
    ['link preferences', libraryKey('settings', 'links')],
    ['resume pointer', libraryKey('settings', 'resume')],
    ['saved view', libraryKey('view', 'workspace-view')],
    ['latest view', libraryKey('latest', 'workspace')],
  ])(
    'keeps healthy native canvases available when %s are unrecoverable',
    async (_label, key) => {
      // No browser files exist: this models plugging the USB into a new PC.
      const server = native([file('healthy')])
      server.setIssues([
        {
          key,
          recovered: false,
          message: 'The original damaged record was retained.',
        },
      ])
      expect(await server.client.initialize()).toEqual({ available: true })
      expect(server.client.available).toBe(true)
      const result = await server.store.list('project')
      expect(result.value.map((record) => record.id)).toEqual(['healthy'])
      expect(result.error).toContain('1 saved item could not be loaded')
      expect(server.client.issues?.()).toEqual([
        expect.objectContaining({ key, recovered: false }),
      ])
      await expect(server.client.read(key, true)).rejects.toThrow(
        'needs recovery',
      )
      await expect(
        server.client.write(key, { version: 1, name: 'replacement' }, 0),
      ).rejects.toThrow('cannot be overwritten')
      expect(server.values.has(key)).toBe(false)
      expect((await server.store.get('project', 'healthy')).value?.id).toBe(
        'healthy',
      )
    },
  )

  it.each([
    ['project identity', libraryKey('metadata', 'main')],
    ['workspace membership', libraryKey('sessions', 'main')],
    [
      'workspace Trash',
      libraryKey('settings', 'workspace').replace(
        'settings:',
        'settings:trash_',
      ),
    ],
  ])(
    'fails closed for unrecoverable %s instead of creating an empty replacement',
    async (_label, key) => {
      const server = native([file('healthy')])
      server.setIssues([
        {
          key,
          recovered: false,
          message: 'The original authority record was retained.',
        },
      ])
      expect(await server.client.initialize()).toMatchObject({
        available: false,
        error: expect.stringContaining('could not be recovered'),
      })
      expect(server.client.available).toBe(false)
      expect(server.client.entries()).toEqual([])
      expect(server.calls.every((path) => path.endsWith('/catalog'))).toBe(true)
      expect(
        server.values.get(libraryKey('file', 'healthy'))?.value,
      ).toMatchObject({ id: 'healthy' })
    },
  )

  it('does not replace a successful save with an older catalog response that was already in flight', async () => {
    const original = file('first')
    let catalogCount = 0
    let release!: () => void
    let requested!: () => void
    const started = new Promise<void>((resolve) => {
      requested = resolve
    })
    const oldCatalog = {
      version: 2,
      entries: {},
      files: [
        {
          key: libraryKey('file', original.id),
          revision: 1,
          id: original.id,
          projectId: original.projectId,
          name: original.document.name,
          createdAt: 1,
          updatedAt: 1,
          lastOpenedAt: 1,
        },
      ],
      issues: [],
    }
    const fetcher = vi.fn<typeof fetch>(async (path, init) => {
      if (String(path).endsWith('/catalog')) {
        if (++catalogCount > 1) {
          requested()
          await new Promise<void>((resolve) => {
            release = resolve
          })
        }
        return response(oldCatalog)
      }
      return response(
        init?.method === 'PUT'
          ? { revision: 2, value: JSON.parse(String(init.body)) as unknown }
          : { revision: 1, value: original },
      )
    })
    const client = createLocalLibraryClient({
      fetch: fetcher,
      enabled: () => true,
    })
    await client.initialize()
    await client.read(libraryKey('file', 'first'), true)
    const refresh = client.refresh()
    await started
    await client.write(
      libraryKey('file', 'first'),
      { ...original, document: createCanvasDocument('Just saved') },
      1,
    )
    release()
    await refresh
    expect(
      client.cached<CanvasFileRecord>(libraryKey('file', 'first')).value
        ?.document.name,
    ).toBe('Just saved')
    expect(client.files?.()?.[0]).toMatchObject({
      revision: 2,
      name: 'Just saved',
    })
  })
})
