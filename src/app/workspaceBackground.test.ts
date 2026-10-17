import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BACKGROUND_MAX_BYTES,
  createBackgroundAssetStore,
  imageMime,
  validateBackgroundAsset,
  type BackgroundAsset,
} from './workspaceBackground'
import { libraryKey, type LocalLibraryClient } from './localLibrary'

const gif = Uint8Array.from(
  atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
  (part) => part.charCodeAt(0),
)
const blob = () => new Blob([gif], { type: 'image/gif' })
function library() {
  const saved = new Map<string, BackgroundAsset>()
  const client = {
    available: true,
    transform: vi.fn(
      async (
        key: string,
        update: (value: BackgroundAsset | null) => BackgroundAsset,
      ) => {
        const value = update(saved.get(key) ?? null)
        saved.set(key, structuredClone(value))
        return { revision: 1, value }
      },
    ),
    read: vi.fn(async (key: string) => ({
      revision: 1,
      value: structuredClone(saved.get(key) ?? null),
    })),
  } as unknown as LocalLibraryClient
  return { client, saved }
}
function browser() {
  const values = new Map<string, unknown>()
  let initialized = false
  const database = {
    objectStoreNames: { contains: () => initialized },
    createObjectStore: () => {
      initialized = true
    },
    close: () => undefined,
    onversionchange: null,
    transaction: () => {
      const transaction = {
        oncomplete: null as (() => void) | null,
        onerror: null,
        onabort: null,
        objectStore: () => ({
          put: (value: unknown, key: string) => {
            queueMicrotask(() => {
              values.set(key, structuredClone(value))
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
    open: () => {
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
    },
  } as unknown as IDBFactory
  return { factory, values }
}
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
})
afterEach(() => {
  vi.unstubAllGlobals()
})
describe('local image assets', () => {
  it('stores original GIF bytes under a stable hash and reloads across client instances', async () => {
    const { client, saved } = library()
    const first = createBackgroundAssetStore({ client, indexedDB: null })
    const id = await first.save(blob())
    expect(id).toMatch(/^[a-f\d]{64}$/u)
    const encoded = saved.get(libraryKey('settings', `asset-${id}`))
    expect(encoded?.mime).toBe('image/gif')
    expect(encoded?.dataURL).toBe(
      `data:image/gif;base64,${btoa(String.fromCharCode(...gif))}`,
    )
    const second = createBackgroundAssetStore({ client, indexedDB: null })
    expect(await second.read(id)).toBe(encoded?.dataURL)
    expect(await second.save(blob())).toBe(id)
    expect(saved.size).toBe(1)
  })
  it('persists browser assets independently of document schemas and reloads them', async () => {
    const client = { available: false } as LocalLibraryClient
    const { factory } = browser()
    const id = await createBackgroundAssetStore({
      client,
      indexedDB: factory,
    }).save(blob())
    expect(
      await createBackgroundAssetStore({ client, indexedDB: factory }).read(id),
    ).toMatch(/^data:image\/gif;base64,/u)
  })
  it('does not attach images when no durable store is available', async () => {
    const store = createBackgroundAssetStore({
      client: { available: false } as LocalLibraryClient,
      indexedDB: null,
    })
    await expect(store.save(blob())).rejects.toThrow('storage is unavailable')
  })
  it('surfaces connected-library write failures without writing a browser substitute', async () => {
    const { client } = library()
    vi.mocked(client.transform).mockRejectedValue(
      new Error('Library disconnected'),
    )
    const { factory, values } = browser()
    await expect(
      createBackgroundAssetStore({ client, indexedDB: factory }).save(blob()),
    ).rejects.toThrow('Library disconnected')
    expect(values.size).toBe(0)
  })
  it('rejects empty, oversize, SVG and mismatched raster files before persistence', async () => {
    const { client } = library()
    const store = createBackgroundAssetStore({ client, indexedDB: null })
    await expect(store.save(new Blob([]))).rejects.toThrow('2 MB')
    await expect(
      store.save(new Blob([new Uint8Array(BACKGROUND_MAX_BYTES + 1)])),
    ).rejects.toThrow('2 MB')
    await expect(
      store.save(
        new Blob(['<svg onload="alert(1)"/>'], { type: 'image/svg+xml' }),
      ),
    ).rejects.toThrow('not supported')
    await expect(
      store.save(new Blob([gif], { type: 'image/png' })),
    ).rejects.toThrow('does not match')
    expect(client.transform).not.toHaveBeenCalled()
  })
  it('rejects corrupt, replaced, remote and mismatched stored assets', async () => {
    const { client, saved } = library()
    const store = createBackgroundAssetStore({ client, indexedDB: null })
    const id = await store.save(blob())
    const asset = saved.get(libraryKey('settings', `asset-${id}`))!
    await expect(
      validateBackgroundAsset(
        { mime: 'image/gif', dataURL: 'https://bad.test/a.gif' },
        id,
      ),
    ).rejects.toThrow('invalid')
    await expect(
      validateBackgroundAsset({ ...asset, mime: 'image/png' }, id),
    ).rejects.toThrow('invalid')
    await expect(
      validateBackgroundAsset(asset, 'a'.repeat(64)),
    ).rejects.toThrow('invalid')
    await expect(store.read('../../file')).rejects.toThrow('identifier')
  })
  it('recognizes only supported raster magic bytes, including either GIF version', () => {
    expect(imageMime(gif)).toBe('image/gif')
    expect(
      imageMime(
        new Uint8Array([
          137,
          80,
          78,
          71,
          13,
          10,
          26,
          10,
          ...new Array<number>(16).fill(0),
        ]),
      ),
    ).toBe('image/png')
    expect(imageMime(new Uint8Array([255, 216, 255, 217]))).toBe('image/jpeg')
    expect(
      imageMime(
        new Uint8Array([
          82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80, 0, 0, 0, 0,
        ]),
      ),
    ).toBe('image/webp')
    expect(() => imageMime(new Uint8Array([71, 73, 70, 56, 56, 97]))).toThrow(
      'not supported',
    )
  })
})
