import { webcrypto } from 'node:crypto'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CANVAS_MEDIA_MAX_BYTES,
  CANVAS_MEDIA_ENDPOINT,
  canvasMedia,
  canvasMediaMime,
  createCanvasMediaStore,
  useCanvasMedia,
} from './canvasMedia'

const text = (value: string) => new TextEncoder().encode(value)
const gif = Uint8Array.from(
  atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
  (part) => part.charCodeAt(0),
)
const fixtures = [
  { name: 'picture.gif', type: 'image/gif', bytes: gif },
  {
    name: 'picture.png',
    type: 'image/png',
    bytes: new Uint8Array([
      137,
      80,
      78,
      71,
      13,
      10,
      26,
      10,
      ...new Uint8Array(16),
    ]),
  },
  {
    name: 'picture.jpg',
    type: 'image/jpeg',
    bytes: new Uint8Array([255, 216, 255, 0, 255, 217]),
  },
  {
    name: 'picture.webp',
    type: 'image/webp',
    bytes: new Uint8Array([
      ...text('RIFF'),
      0,
      0,
      0,
      0,
      ...text('WEBP'),
      0,
      0,
      0,
      0,
    ]),
  },
  {
    name: 'movie.mp4',
    type: 'video/mp4',
    bytes: new Uint8Array([0, 0, 0, 12, ...text('ftypisom')]),
  },
  {
    name: 'movie.webm',
    type: 'video/webm',
    bytes: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...text('webm')]),
  },
  {
    name: 'sound.mp3',
    type: 'audio/mpeg',
    bytes: new Uint8Array([...text('ID3'), ...new Uint8Array(7)]),
  },
  {
    name: 'sound.wav',
    type: 'audio/wav',
    bytes: new Uint8Array([
      ...text('RIFF'),
      0,
      0,
      0,
      0,
      ...text('WAVE'),
      ...new Uint8Array(32),
    ]),
  },
  {
    name: 'sound.ogg',
    type: 'audio/ogg',
    bytes: new Uint8Array([
      ...text('OggS'),
      ...new Uint8Array(23),
      ...text('OpusHead'),
    ]),
  },
  {
    name: 'reference.pdf',
    type: 'application/pdf',
    bytes: text('%PDF-1.7\n1 0 obj\n%%EOF\n'),
  },
  {
    name: 'notes.txt',
    type: 'text/plain',
    bytes: text('Notes\nA local document\twith text.'),
  },
]
function browser() {
  const values = new Map<string, unknown>()
  let initialized = false
  const database = {
    objectStoreNames: { contains: () => initialized },
    createObjectStore: () => {
      initialized = true
    },
    close: () => undefined,
    transaction: () => {
      const transaction = {
        oncomplete: null as (() => void) | null,
        onerror: null,
        onabort: null,
        objectStore: () => ({
          put: (value: unknown, key: string) => {
            queueMicrotask(() => {
              values.set(key, value)
              transaction.oncomplete?.()
            })
          },
          get: (key: string) => {
            const request = {
              result: undefined as unknown,
              onsuccess: null as (() => void) | null,
              onerror: null,
            }
            queueMicrotask(() => {
              request.result = values.get(key)
              request.onsuccess?.()
            })
            return request
          },
        }),
      }
      return transaction
    },
  }
  const factory = {
    open: vi.fn(() => {
      const request = {
        result: database,
        onsuccess: null as (() => void) | null,
        onupgradeneeded: null as (() => void) | null,
        onerror: null,
        onblocked: null,
      }
      queueMicrotask(() => {
        if (!initialized) request.onupgradeneeded?.()
        request.onsuccess?.()
      })
      return request
    }),
  } as unknown as IDBFactory
  return { factory, values }
}
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  let next = 0
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => `blob:http://localhost/media-${++next}`),
    revokeObjectURL: vi.fn(),
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('owned canvas media', () => {
  it.each(fixtures)(
    'stores $type as binary and reloads it by stable content hash',
    async ({ name, type, bytes }) => {
      expect(canvasMediaMime(bytes)).toBe(type)
      const { factory, values } = browser()
      const store = createCanvasMediaStore({
        client: { available: false },
        indexedDB: factory,
      })
      const source = await store.save(new File([bytes], name, { type }))
      expect(source).toMatch(/^media:[a-f\d]{64}$/u)
      expect(values.get(source.slice(6))).toBeInstanceOf(Blob)
      expect((values.get(source.slice(6)) as Blob).type).toBe(type)
      expect(await store.save(new File([bytes], name, { type }))).toBe(source)
      expect(values.size).toBe(1)
      const reloaded = createCanvasMediaStore({
        client: { available: false },
        indexedDB: factory,
      })
      expect(await reloaded.read(source)).toMatch(/^blob:/u)
    },
  )
  it('uploads native media with canonical MIME and uses an immutable binary URL', async () => {
    const fetch = vi.fn(
      async () =>
        ({ ok: true, body: { cancel: vi.fn() } }) as unknown as Response,
    )
    const store = createCanvasMediaStore({
      client: { available: true },
      indexedDB: null,
      fetch,
    })
    const source = await store.save(
      new File([gif], 'animated.gif', { type: 'image/gif' }),
    )
    const [url, options] = fetch.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe(CANVAS_MEDIA_ENDPOINT + source.slice(6))
    expect(options).toMatchObject({
      method: 'PUT',
      credentials: 'same-origin',
      redirect: 'error',
      headers: { 'Content-Type': 'image/gif' },
    })
    expect(options.body).toBeInstanceOf(Blob)
    expect(await store.read(source)).toBe(url)
  })
  it('keeps canonical text storage and aliases while rejecting unsafe files and mismatches', async () => {
    const { factory } = browser()
    const store = createCanvasMediaStore({
      client: { available: false },
      indexedDB: factory,
    })
    expect(
      await store.save(
        new File(['# Notes'], 'notes.md', { type: 'text/markdown' }),
      ),
    ).toMatch(/^media:/u)
    for (const file of [
      new File(['<svg onload="alert(1)"/>'], 'image.svg', {
        type: 'image/svg+xml',
      }),
      new File(['<html><script>alert(1)</script></html>'], 'page.txt', {
        type: 'text/plain',
      }),
      new File(['alert(1)'], 'script.js', { type: 'text/plain' }),
      new File([gif], 'wrong.png', { type: 'image/png' }),
      new File([new Uint8Array([255, 0, 1])], 'binary.txt', {
        type: 'text/plain',
      }),
      new File(['%PDF-1.7 invalid'], 'truncated.pdf', {
        type: 'application/pdf',
      }),
      new File(['ordinary text'], 'unknown.bin', {
        type: 'application/octet-stream',
      }),
    ])
      await expect(store.save(file)).rejects.toThrow()
  })
  it('accepts the exact size limit and rejects oversized and empty uploads before persistence', async () => {
    const fetch = vi.fn(async () => ({ ok: true }) as Response)
    const store = createCanvasMediaStore({
      client: { available: true },
      indexedDB: null,
      fetch,
    })
    const exact = new Uint8Array(CANVAS_MEDIA_MAX_BYTES)
    exact.set(gif)
    expect(
      await store.save(new File([exact], 'large.gif', { type: 'image/gif' })),
    ).toMatch(/^media:/u)
    await expect(
      store.save(new File([], 'empty.gif', { type: 'image/gif' })),
    ).rejects.toThrow('20 MB')
    await expect(
      store.save(
        new File(
          [new Uint8Array(CANVAS_MEDIA_MAX_BYTES + 1)],
          'oversized.gif',
          { type: 'image/gif' },
        ),
      ),
    ).rejects.toThrow('20 MB')
    expect(fetch).toHaveBeenCalledOnce()
  })
  it('rejects a corrupt browser blob and does not substitute browser storage after native failures', async () => {
    const { factory, values } = browser()
    const store = createCanvasMediaStore({
      client: { available: false },
      indexedDB: factory,
    })
    const source = await store.save(
      new File([gif], 'test.gif', { type: 'image/gif' }),
    )
    values.set(
      source.slice(6),
      new Blob(['replacement'], { type: 'text/plain' }),
    )
    await expect(store.read(source)).rejects.toThrow('invalid')
    await expect(
      store.read('https://outside.example/image.gif'),
    ).rejects.toThrow('identifier')
    const native = createCanvasMediaStore({
      client: { available: true },
      indexedDB: factory,
      fetch: vi.fn(async () => ({ ok: false }) as Response),
    })
    await expect(
      native.save(new File([gif], 'test.gif', { type: 'image/gif' })),
    ).rejects.toThrow('could not be saved')
    expect(values.size).toBe(1)
  })
  it('deduplicates browser URLs across readers and releases inactive cache entries', async () => {
    const { factory } = browser()
    const store = createCanvasMediaStore({
      client: { available: false },
      indexedDB: factory,
    })
    const source = await store.save(
      new File([gif], 'test.gif', { type: 'image/gif' }),
    )
    store.retain(source)
    store.retain(source)
    expect(await Promise.all([store.read(source), store.read(source)])).toEqual(
      ['blob:http://localhost/media-1', 'blob:http://localhost/media-1'],
    )
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    store.release(source)
    for (let index = 0; index < 35; index++) {
      const other = await store.save(
        new File([`Notes ${index}`], `notes-${index}.txt`, {
          type: 'text/plain',
        }),
      )
      await store.read(other)
    }
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(
      'blob:http://localhost/media-1',
    )
    store.release(source)
    const final = await store.save(
      new File(['Last note'], 'last.txt', { type: 'text/plain' }),
    )
    await store.read(final)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(
      'blob:http://localhost/media-1',
    )
  })
  it('retains owned refs once and releases them when a view changes or unmounts', async () => {
    const source = `media:${'a'.repeat(64)}`
    const retain = vi
      .spyOn(canvasMedia, 'retain')
      .mockImplementation(() => undefined)
    const release = vi
      .spyOn(canvasMedia, 'release')
      .mockImplementation(() => undefined)
    vi.spyOn(canvasMedia, 'read').mockResolvedValue('blob:owned')
    const view = renderHook(({ sources }) => useCanvasMedia(sources), {
      initialProps: { sources: [source, source, 'https://outside.example'] },
    })
    await waitFor(() =>
      expect(view.result.current).toEqual({ [source]: 'blob:owned' }),
    )
    expect(retain).toHaveBeenCalledTimes(1)
    await act(async () => view.rerender({ sources: [] }))
    expect(release).toHaveBeenCalledWith(source)
    expect(view.result.current).toEqual({})
    view.unmount()
    expect(release).toHaveBeenCalledTimes(1)
  })
  it('reports unavailable durable browser storage without adding media', async () => {
    const store = createCanvasMediaStore({
      client: { available: false },
      indexedDB: null,
    })
    await expect(
      store.save(new File([gif], 'test.gif', { type: 'image/gif' })),
    ).rejects.toThrow('storage is unavailable')
  })
})
