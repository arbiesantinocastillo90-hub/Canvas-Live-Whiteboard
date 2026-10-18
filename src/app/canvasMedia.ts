import { useEffect, useState } from 'react'
import { localLibrary, type LocalLibraryClient } from './localLibrary'
import { imageMime } from './workspaceBackground'

export const CANVAS_MEDIA_MAX_BYTES = 20 * 1024 * 1024
export const CANVAS_MEDIA_DATABASE = 'canvas-live.media'
export const CANVAS_MEDIA_ENDPOINT = '/__canvas_live_library/media/'
const SOURCE = /^media:([a-f\d]{64})$/u
const STORE = 'blobs'
const CACHE_BYTES = 64 * 1024 * 1024
const CACHE_ENTRIES = 32
export type CanvasMediaMime =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/gif'
  | 'video/mp4'
  | 'video/webm'
  | 'audio/mpeg'
  | 'audio/wav'
  | 'audio/ogg'
  | 'application/pdf'
  | 'text/plain'

function prefix(bytes: Uint8Array, value: string, offset = 0) {
  return Array.from(value).every(
    (character, index) => bytes[offset + index] === character.charCodeAt(0),
  )
}
function hasControlCharacters(text: string) {
  for (const character of text) {
    const code = character.charCodeAt(0)
    if (code === 127 || (code < 32 && ![9, 10, 13].includes(code))) return true
  }
  return false
}
function ascii(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
}
/** Sniff only inert media formats; a filename never substitutes for its signature. */
export function canvasMediaMime(bytes: Uint8Array): CanvasMediaMime {
  try {
    return imageMime(bytes)
  } catch {
    /* Continue with non-image formats. */
  }
  if (
    bytes.length >= 12 &&
    prefix(bytes, 'ftyp', 4) &&
    /^(?:isom|iso[2-9]|mp4[12]|avc1|M4V |MSNV|dash)$/u.test(
      ascii(bytes.subarray(8, 12)),
    )
  )
    return 'video/mp4'
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3 &&
    ascii(bytes.subarray(0, 4096)).includes('webm')
  )
    return 'video/webm'
  if (
    bytes.length >= 10 &&
    (prefix(bytes, 'ID3') ||
      (bytes[0] === 0xff &&
        (bytes[1] & 0xe0) === 0xe0 &&
        ((bytes[1] >> 3) & 3) !== 1 &&
        ((bytes[1] >> 1) & 3) !== 0 &&
        bytes[2] >> 4 > 0 &&
        bytes[2] >> 4 < 15 &&
        ((bytes[2] >> 2) & 3) !== 3))
  )
    return 'audio/mpeg'
  if (bytes.length >= 44 && prefix(bytes, 'RIFF') && prefix(bytes, 'WAVE', 8))
    return 'audio/wav'
  if (
    bytes.length >= 35 &&
    prefix(bytes, 'OggS') &&
    bytes[4] === 0 &&
    /OpusHead|vorbis/u.test(ascii(bytes.subarray(27, 4096)))
  )
    return 'audio/ogg'
  if (
    bytes.length >= 12 &&
    /^%PDF-[12]\.[0-9]/u.test(ascii(bytes.subarray(0, 8))) &&
    ascii(bytes.subarray(Math.max(0, bytes.length - 1024))).includes('%%EOF')
  )
    return 'application/pdf'
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error(
      'Choose a supported image, video, audio, PDF, or UTF-8 text document.',
    )
  }
  if (
    !text.length ||
    hasControlCharacters(text) ||
    /^\s*(?:<!doctype|<html|<svg|<script|<\?xml)/iu.test(text)
  )
    throw new Error(
      'HTML, SVG, scripts and unknown binary files cannot be embedded as local media.',
    )
  return 'text/plain'
}
function normalizedMime(mime: string) {
  const value = mime.toLowerCase().split(';')[0].trim()
  if (['audio/mp3', 'audio/x-mp3'].includes(value)) return 'audio/mpeg'
  if (['audio/x-wav', 'audio/wave', 'audio/vnd.wave'].includes(value))
    return 'audio/wav'
  if (['text/markdown', 'text/csv'].includes(value)) return 'text/plain'
  return value
}
function readBlob(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      reader.result instanceof ArrayBuffer
        ? resolve(reader.result)
        : reject(new Error('The media could not be read.'))
    reader.onerror = () => reject(new Error('The media could not be read.'))
    reader.readAsArrayBuffer(file)
  })
}
async function hash(bytes: Uint8Array) {
  if (!globalThis.crypto?.subtle)
    throw new Error('This browser cannot securely store media.')
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new Uint8Array(bytes).buffer,
  )
  return Array.from(new Uint8Array(digest), (part) =>
    part.toString(16).padStart(2, '0'),
  ).join('')
}
export type CanvasMediaStore = {
  save(file: File): Promise<string>
  read(source: string): Promise<string | null>
  retain(source: string): void
  release(source: string): void
}
/** Binary storage is deliberately separate from CLF JSON and the polled library index. */
export function createCanvasMediaStore(
  options: {
    client?: Pick<LocalLibraryClient, 'available'>
    indexedDB?: IDBFactory | null
    fetch?: typeof fetch
  } = {},
): CanvasMediaStore {
  const client = options.client ?? localLibrary
  const factory =
    options.indexedDB === undefined ? globalThis.indexedDB : options.indexedDB
  let connection: Promise<IDBDatabase> | null = null
  function open(): Promise<IDBDatabase> {
    if (!factory)
      return Promise.reject(
        new Error('Media storage is unavailable. The object was not added.'),
      )
    connection ??= new Promise((resolve, reject) => {
      const request = factory.open(CANVAS_MEDIA_DATABASE, 1)
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
        reject(new Error('Media storage could not be opened.'))
      }
      request.onblocked = () => {
        connection = null
        reject(
          new Error('Close older Canvas Live tabs and try the media again.'),
        )
      }
    })
    return connection
  }
  async function browserWrite(id: string, value: Blob) {
    const db = await open()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).put(value, id)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () =>
        reject(
          new Error(
            'Media could not be saved. Free some local storage and try again.',
          ),
        )
      transaction.onabort = () => reject(new Error('Media could not be saved.'))
    })
  }
  async function browserRead(id: string): Promise<unknown> {
    const db = await open()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly')
      const request = transaction.objectStore(STORE).get(id)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('The media could not be read.'))
      transaction.onabort = () =>
        reject(new Error('The media could not be read.'))
    })
  }
  type Cached = { promise: Promise<string | null>; url?: string; size: number }
  const cache = new Map<string, Cached>()
  const retained = new Map<string, number>()
  function trim() {
    let total = [...cache.values()].reduce((sum, entry) => sum + entry.size, 0)
    for (const [source, entry] of cache) {
      if (cache.size <= CACHE_ENTRIES && total <= CACHE_BYTES) break
      if (retained.has(source) || !entry.url) continue
      URL.revokeObjectURL(entry.url)
      cache.delete(source)
      total -= entry.size
    }
  }
  const store: CanvasMediaStore = {
    async save(file) {
      if (!file.size || file.size > CANVAS_MEDIA_MAX_BYTES)
        throw new Error('Choose media of 20 MB or smaller.')
      if (
        /\.(?:html?|xhtml|svg|svgz|[cm]?js|jsx|tsx|exe|dll|bat|cmd|ps1)$/iu.test(
          file.name,
        )
      )
        throw new Error('HTML, SVG and executable files are not supported.')
      const bytes = new Uint8Array(await readBlob(file))
      if (!bytes.length || bytes.length > CANVAS_MEDIA_MAX_BYTES)
        throw new Error('Choose media of 20 MB or smaller.')
      const mime = canvasMediaMime(bytes)
      const claimed = normalizedMime(file.type)
      if (claimed && claimed !== mime && claimed !== 'application/octet-stream')
        throw new Error('The media type does not match its contents.')
      if (mime === 'text/plain' && !/\.(?:txt|md|csv|log)$/iu.test(file.name))
        throw new Error(
          'Plain text documents must use .txt, .md, .csv or .log.',
        )
      const id = await hash(bytes)
      const blob = new Blob([new Uint8Array(bytes).buffer], { type: mime })
      if (client.available) {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 60_000)
        try {
          const response = await (options.fetch ?? globalThis.fetch)(
            CANVAS_MEDIA_ENDPOINT + id,
            {
              method: 'PUT',
              headers: { 'Content-Type': mime },
              body: blob,
              credentials: 'same-origin',
              redirect: 'error',
              signal: controller.signal,
            },
          )
          await response.body?.cancel()
          if (!response.ok)
            throw new Error(
              'The media could not be saved in the local library. Try again.',
            )
        } catch (reason) {
          if (controller.signal.aborted)
            throw new Error('Saving the media took too long. Try again.')
          throw reason
        } finally {
          clearTimeout(timeout)
        }
      } else await browserWrite(id, blob)
      return `media:${id}`
    },
    async read(source) {
      const id = SOURCE.exec(source)?.[1]
      if (!id) throw new Error('The media identifier is invalid.')
      if (client.available) return CANVAS_MEDIA_ENDPOINT + id
      const previous = cache.get(source)
      if (previous) {
        cache.delete(source)
        cache.set(source, previous)
        return previous.promise
      }
      const entry: Cached = { promise: Promise.resolve(null), size: 0 }
      entry.promise = (async () => {
        const value = await browserRead(id)
        if (value == null) {
          cache.delete(source)
          return null
        }
        if (
          !(value instanceof Blob) ||
          !value.size ||
          value.size > CANVAS_MEDIA_MAX_BYTES
        )
          throw new Error('The saved media is invalid.')
        const bytes = new Uint8Array(await readBlob(value))
        if (canvasMediaMime(bytes) !== value.type || (await hash(bytes)) !== id)
          throw new Error('The saved media is invalid.')
        const url = URL.createObjectURL(value)
        entry.url = url
        entry.size = value.size
        trim()
        return url
      })().catch((reason: unknown) => {
        cache.delete(source)
        throw reason
      })
      cache.set(source, entry)
      return entry.promise
    },
    retain(source) {
      if (SOURCE.test(source))
        retained.set(source, (retained.get(source) ?? 0) + 1)
    },
    release(source) {
      const count = retained.get(source) ?? 0
      if (count > 1) retained.set(source, count - 1)
      else retained.delete(source)
      trim()
    },
  }
  return store
}
export const canvasMedia = createCanvasMediaStore()
export function saveCanvasMedia(file: File): Promise<string> {
  return canvasMedia.save(file)
}
/** Retain each owned URL once; remote sources are intentionally untouched. */
export function useCanvasMedia(sources: string[]): Record<string, string> {
  const key = JSON.stringify(
    [...new Set(sources.filter((source) => SOURCE.test(source)))].sort(),
  )
  const [loaded, setLoaded] = useState<{
    key: string
    urls: Record<string, string>
  } | null>(null)
  useEffect(() => {
    const owned = JSON.parse(key) as string[]
    let active = true
    for (const source of owned) canvasMedia.retain(source)
    void Promise.all(
      owned.map(async (source) => {
        try {
          return [source, await canvasMedia.read(source)] as const
        } catch {
          return [source, null] as const
        }
      }),
    ).then((entries) => {
      if (active)
        setLoaded({
          key,
          urls: Object.fromEntries(
            entries.filter(
              (entry): entry is readonly [string, string] => entry[1] !== null,
            ),
          ),
        })
    })
    return () => {
      active = false
      for (const source of owned) canvasMedia.release(source)
    }
  }, [key])
  return loaded?.key === key ? loaded.urls : {}
}
