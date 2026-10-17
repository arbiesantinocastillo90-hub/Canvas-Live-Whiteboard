import { useEffect, useState } from 'react'
import {
  libraryKey,
  localLibrary,
  type LocalLibraryClient,
} from './localLibrary'

export const BACKGROUND_MAX_BYTES = 2 * 1024 * 1024
export const BACKGROUND_DATABASE_NAME = 'canvas-live.appearance'
export type BackgroundAsset = {
  mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  dataURL: string
}
export type BackgroundAssetStore = {
  save(file: Blob): Promise<string>
  read(id: string): Promise<string | null>
}
const ID = /^[a-f\d]{64}$/u
const STORE = 'assets'

export function imageMime(bytes: Uint8Array): BackgroundAsset['mime'] {
  const starts = (...signature: number[]) =>
    signature.every((value, index) => bytes[index] === value)
  if (bytes.length >= 24 && starts(137, 80, 78, 71, 13, 10, 26, 10))
    return 'image/png'
  if (
    bytes.length >= 4 &&
    starts(255, 216, 255) &&
    bytes[bytes.length - 2] === 255 &&
    bytes[bytes.length - 1] === 217
  )
    return 'image/jpeg'
  if (
    bytes.length >= 14 &&
    starts(71, 73, 70, 56) &&
    (bytes[4] === 55 || bytes[4] === 57) &&
    bytes[5] === 97
  )
    return 'image/gif'
  if (
    bytes.length >= 16 &&
    starts(82, 73, 70, 70) &&
    bytes[8] === 87 &&
    bytes[9] === 69 &&
    bytes[10] === 66 &&
    bytes[11] === 80
  )
    return 'image/webp'
  throw new Error(
    'Choose a PNG, JPEG, WebP, or GIF image. SVG and other file types are not supported.',
  )
}
async function hash(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle)
    throw new Error('This browser cannot securely store background images.')
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new Uint8Array(bytes).buffer,
  )
  return Array.from(new Uint8Array(digest), (part) =>
    part.toString(16).padStart(2, '0'),
  ).join('')
}
function encode(bytes: Uint8Array) {
  let raw = ''
  for (let offset = 0; offset < bytes.length; offset += 8192)
    raw += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(raw)
}
function readBlob(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      reader.result instanceof ArrayBuffer
        ? resolve(reader.result)
        : reject(new Error('The image could not be read.'))
    reader.onerror = () => reject(new Error('The image could not be read.'))
    reader.readAsArrayBuffer(file)
  })
}
export async function validateBackgroundAsset(
  value: unknown,
  id: string,
): Promise<BackgroundAsset> {
  if (
    !ID.test(id) ||
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  )
    throw new Error('The saved background image is invalid.')
  const item = value as Record<string, unknown>
  if (
    typeof item.dataURL !== 'string' ||
    item.dataURL.length > Math.ceil(BACKGROUND_MAX_BYTES / 3) * 4 + 64 ||
    !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z\d+/]+={0,2}$/u.test(
      item.dataURL,
    )
  )
    throw new Error('The saved background image is invalid.')
  const separator = item.dataURL.indexOf(',')
  let bytes: Uint8Array
  try {
    bytes = Uint8Array.from(
      atob(item.dataURL.slice(separator + 1)),
      (character) => character.charCodeAt(0),
    )
  } catch {
    throw new Error('The saved background image is invalid.')
  }
  if (bytes.byteLength > BACKGROUND_MAX_BYTES)
    throw new Error('Background images must be 2 MB or smaller.')
  const mime = imageMime(bytes)
  if (
    item.mime !== mime ||
    item.dataURL.slice(0, separator) !== `data:${mime};base64` ||
    (await hash(bytes)) !== id
  )
    throw new Error('The saved background image is invalid.')
  return { mime, dataURL: item.dataURL }
}
export function createBackgroundAssetStore(
  options: { client?: LocalLibraryClient; indexedDB?: IDBFactory | null } = {},
): BackgroundAssetStore {
  const client = options.client ?? localLibrary
  const factory =
    options.indexedDB === undefined ? globalThis.indexedDB : options.indexedDB
  let connection: Promise<IDBDatabase> | null = null
  const open = (): Promise<IDBDatabase> => {
    if (!factory)
      return Promise.reject(
        new Error(
          'Image storage is unavailable. The background was not changed.',
        ),
      )
    connection ??= new Promise((resolve, reject) => {
      const request = factory.open(BACKGROUND_DATABASE_NAME, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE))
          request.result.createObjectStore(STORE)
      }
      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => {
          db.close()
          connection = null
        }
        resolve(db)
      }
      request.onerror = () => {
        connection = null
        reject(new Error('Image storage could not be opened.'))
      }
      request.onblocked = () => {
        connection = null
        reject(
          new Error('Close older Canvas Live tabs and try the image again.'),
        )
      }
    })
    return connection
  }
  async function browserRead(id: string): Promise<unknown> {
    const db = await open()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly')
      const request = transaction.objectStore(STORE).get(id)
      request.onsuccess = () => resolve(request.result)
      transaction.onabort = () =>
        reject(new Error('The background image could not be read.'))
      request.onerror = () =>
        reject(new Error('The background image could not be read.'))
    })
  }
  return {
    async save(file) {
      if (!file.size || file.size > BACKGROUND_MAX_BYTES)
        throw new Error('Choose an image of 2 MB or smaller.')
      const bytes = new Uint8Array(await readBlob(file))
      if (bytes.byteLength > BACKGROUND_MAX_BYTES)
        throw new Error('Choose an image of 2 MB or smaller.')
      const mime = imageMime(bytes)
      if (file.type && file.type.toLowerCase() !== mime)
        throw new Error('The image type does not match its contents.')
      const id = await hash(bytes)
      const asset: BackgroundAsset = {
        mime,
        dataURL: `data:${mime};base64,${encode(bytes)}`,
      }
      if (client.available) {
        await client.transform<BackgroundAsset>(
          libraryKey('settings', `asset-${id}`),
          (existing) =>
            existing?.dataURL === asset.dataURL && existing.mime === mime
              ? existing
              : asset,
        )
      } else {
        const db = await open()
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(STORE, 'readwrite')
          transaction.objectStore(STORE).put(asset, id)
          transaction.oncomplete = () => resolve()
          transaction.onerror = () =>
            reject(
              new Error(
                'The image could not be saved. Free some local storage and try again.',
              ),
            )
          transaction.onabort = () =>
            reject(new Error('The image could not be saved.'))
        })
      }
      return id
    },
    async read(id) {
      if (!ID.test(id)) throw new Error('The background identifier is invalid.')
      const value = client.available
        ? (
            await client.read<BackgroundAsset>(
              libraryKey('settings', `asset-${id}`),
              true,
            )
          ).value
        : await browserRead(id)
      if (value == null) return null
      return (await validateBackgroundAsset(value, id)).dataURL
    },
  }
}
export const backgroundAssets = createBackgroundAssetStore()

export function useWorkspaceBackground(
  assetId: string | null | undefined,
): string | null {
  const [loaded, setLoaded] = useState<{
    id: string
    url: string | null
  } | null>(null)
  useEffect(() => {
    if (!assetId) return
    let active = true
    void backgroundAssets
      .read(assetId)
      .then((url) => {
        if (active) setLoaded({ id: assetId, url })
      })
      .catch(() => {
        if (active) setLoaded({ id: assetId, url: null })
      })
    return () => {
      active = false
    }
  }, [assetId])
  return loaded && loaded.id === assetId ? loaded.url : null
}
