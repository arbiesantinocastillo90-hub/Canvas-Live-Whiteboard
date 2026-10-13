import { createElement } from './canvasOperations'
import {
  preserveAreaPrecision,
  selectionBounds,
  selectionIds,
} from './canvasSelection'
import {
  COORDINATE_LIMIT,
  LCanvasError,
  parseLCANVAS,
  validCanvasId,
  validateCanvasDocument,
  type CanvasDocument,
  type CanvasElement,
} from './lcanvas'

export const CANVAS_CLIPBOARD_MIME = 'application/x-canvas-live+json'
export const CANVAS_CLIPBOARD_PREFIX = 'Canvas Live clipboard v1\n'
export const CANVAS_CLIPBOARD_MAX_BYTES = 2 * 1024 * 1024
export const CANVAS_CLIPBOARD_MAX_ELEMENTS = 1000

export type PasteResult = { document: CanvasDocument; selectedIds: string[] }
export type PasteOptions = {
  layerId: string
  center: { x: number; y: number }
  offset?: number
  idFactory?: () => string
}

function fail(message: string): never {
  throw new LCanvasError(message)
}

function clipboardSize(raw: string) {
  if (
    typeof raw !== 'string' ||
    raw.length > CANVAS_CLIPBOARD_MAX_BYTES ||
    new TextEncoder().encode(raw).byteLength > CANVAS_CLIPBOARD_MAX_BYTES
  )
    fail('The canvas clipboard exceeds 2 MiB.')
}

function clipboardDocument(document: CanvasDocument) {
  if (document.elements.length > CANVAS_CLIPBOARD_MAX_ELEMENTS)
    fail('Copy up to 1,000 objects at a time.')
  return document
}

/** Recognize our text envelope without interpreting unrelated JSON as a canvas. */
export function isCanvasClipboard(raw: string): boolean {
  return raw.startsWith('Canvas Live clipboard ')
}

export function createCanvasClipboard(
  document: CanvasDocument,
  ids: readonly string[],
): string | null {
  const current = validateCanvasDocument(document)
  const selected = new Set(selectionIds(current, ids))
  const elements = current.elements
    .filter(
      (item) =>
        selected.has(item.id) &&
        (item.type !== 'connection' ||
          (selected.has(item.fromId) && selected.has(item.toId))),
    )
    .map((item) => ({
      ...item,
      areaId:
        item.areaId !== null && selected.has(item.areaId) ? item.areaId : null,
    }))
  if (!elements.length) return null
  const usedLayers = new Set(elements.map((item) => item.layerId))
  const copy = clipboardDocument(
    validateCanvasDocument({
      ...current,
      name: 'Clipboard',
      viewport: { x: 0, y: 0, zoom: 1 },
      layers: current.layers.filter((layer) => usedLayers.has(layer.id)),
      elements,
    }),
  )
  const raw = `${CANVAS_CLIPBOARD_PREFIX}${JSON.stringify({
    format: 'Canvas Live clipboard',
    version: 1,
    document: copy,
  })}`
  clipboardSize(raw)
  return raw
}

export function parseCanvasClipboard(raw: string): CanvasDocument {
  clipboardSize(raw)
  if (!raw.startsWith(CANVAS_CLIPBOARD_PREFIX))
    return fail('This canvas clipboard version is not supported.')
  let payload: unknown
  try {
    payload = JSON.parse(raw.slice(CANVAS_CLIPBOARD_PREFIX.length))
  } catch {
    return fail('The canvas clipboard is not valid JSON.')
  }
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    Object.keys(payload).length !== 3 ||
    !Object.keys(payload).every((key) =>
      ['format', 'version', 'document'].includes(key),
    ) ||
    !('format' in payload) ||
    payload.format !== 'Canvas Live clipboard' ||
    !('version' in payload) ||
    payload.version !== 1 ||
    !('document' in payload)
  )
    return fail('The canvas clipboard has unsupported fields or version.')
  // Reuse the same strict import validator, including area and endpoint checks.
  return clipboardDocument(parseLCANVAS(JSON.stringify(payload.document)))
}

function pasteLayer(document: CanvasDocument, options: PasteOptions) {
  const layer = document.layers.find((item) => item.id === options.layerId)
  if (!layer?.visible || layer.locked)
    fail('Choose a visible, unlocked layer before pasting.')
  if (
    !options.center ||
    ![options.center.x, options.center.y, options.offset ?? 0].every(
      Number.isFinite,
    )
  )
    fail('The paste position must use finite coordinates.')
  return layer
}

function freshId() {
  return `object-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`
}

export function pasteCanvasClipboard(
  document: CanvasDocument,
  raw: string,
  options: PasteOptions,
): PasteResult {
  const current = validateCanvasDocument(document)
  pasteLayer(current, options)
  const copied = parseCanvasClipboard(raw)
  const bounds = selectionBounds(
    copied,
    copied.elements.map((item) => item.id),
  )
  if (!bounds) return { document: current, selectedIds: [] }
  const offset = options.offset ?? 0
  const desiredX = options.center.x - bounds.width / 2 + offset - bounds.x
  const desiredY = options.center.y - bounds.height / 2 + offset - bounds.y
  // Keep every translated coordinate within import limits, including line ends.
  const coordinates = copied.elements.flatMap((item) =>
    item.type === 'connection'
      ? []
      : item.type === 'line'
        ? [
            { x: item.x, y: item.y },
            { x: item.x2, y: item.y2 },
          ]
        : [{ x: item.x, y: item.y }],
  )
  const dx = Math.max(
    -COORDINATE_LIMIT - Math.min(...coordinates.map((point) => point.x)),
    Math.min(
      desiredX,
      COORDINATE_LIMIT - Math.max(...coordinates.map((point) => point.x)),
    ),
  )
  const dy = Math.max(
    -COORDINATE_LIMIT - Math.min(...coordinates.map((point) => point.y)),
    Math.min(
      desiredY,
      COORDINATE_LIMIT - Math.max(...coordinates.map((point) => point.y)),
    ),
  )
  const usedIds = new Set([
    ...current.elements.map((item) => item.id),
    ...copied.elements.map((item) => item.id),
  ])
  const remapped = new Map<string, string>()
  for (const item of copied.elements) {
    let id = ''
    for (let attempt = 0; attempt < 10; attempt++) {
      id = (options.idFactory ?? freshId)()
      if (validCanvasId(id) && !usedIds.has(id)) break
      id = ''
    }
    if (!id)
      fail('Could not create a fresh object identifier. Try pasting again.')
    remapped.set(item.id, id)
    usedIds.add(id)
  }
  const pasted = copied.elements.map((item): CanvasElement => {
    const base = {
      ...item,
      id: remapped.get(item.id)!,
      layerId: options.layerId,
      areaId: item.areaId === null ? null : remapped.get(item.areaId)!,
    }
    if (base.type === 'connection')
      return {
        ...base,
        fromId: remapped.get(base.fromId)!,
        toId: remapped.get(base.toId)!,
      }
    if (base.type === 'line')
      return {
        ...base,
        x: base.x + dx,
        y: base.y + dy,
        x2: base.x2 + dx,
        y2: base.y2 + dy,
      }
    if (base.type === 'area')
      return { ...base, areaId: null, x: base.x + dx, y: base.y + dy }
    return { ...base, x: base.x + dx, y: base.y + dy }
  })
  return {
    document: validateCanvasDocument(
      preserveAreaPrecision(
        { ...current, elements: [...current.elements, ...pasted] },
        new Set(
          pasted.filter((item) => item.type === 'area').map((item) => item.id),
        ),
      ),
    ),
    selectedIds: pasted.map((item) => item.id),
  }
}

export function pasteCanvasText(
  document: CanvasDocument,
  text: string,
  options: PasteOptions,
): PasteResult {
  const current = validateCanvasDocument(document)
  pasteLayer(current, options)
  if (typeof text !== 'string' || !text.trim())
    return { document: current, selectedIds: [] }
  if (text.length > 20_000) fail('Paste plain text up to 20,000 characters.')
  const lines = text.replace(/\r\n?/gu, '\n').split('\n')
  const width = Math.min(
    480,
    Math.max(160, Math.max(...lines.map((line) => line.length)) * 12),
  )
  const height = Math.min(
    960,
    Math.max(
      48,
      lines.reduce(
        (sum, line) => sum + Math.max(1, Math.ceil((line.length * 12) / width)),
        0,
      ) * 29,
    ),
  )
  const id = (options.idFactory ?? freshId)()
  const next = createElement(current, {
    id,
    type: 'text',
    text,
    fontSize: 24,
    layerId: options.layerId,
    x: Math.min(
      COORDINATE_LIMIT,
      Math.max(
        -COORDINATE_LIMIT,
        options.center.x - width / 2 + (options.offset ?? 0),
      ),
    ),
    y: Math.min(
      COORDINATE_LIMIT,
      Math.max(
        -COORDINATE_LIMIT,
        options.center.y - height / 2 + (options.offset ?? 0),
      ),
    ),
    width,
    height,
  })
  return { document: next, selectedIds: [id] }
}

export function duplicateSelection(
  document: CanvasDocument,
  ids: readonly string[],
  options: { layerId?: string; offset?: number; idFactory?: () => string } = {},
): PasteResult {
  const raw = createCanvasClipboard(document, ids)
  if (!raw)
    return { document: validateCanvasDocument(document), selectedIds: [] }
  const copied = parseCanvasClipboard(raw)
  const bounds = selectionBounds(
    copied,
    copied.elements.map((item) => item.id),
  )!
  const layerId =
    options.layerId ??
    document.layers.find((layer) => layer.visible && !layer.locked)?.id
  if (!layerId) fail('Choose a visible, unlocked layer before duplicating.')
  return pasteCanvasClipboard(document, raw, {
    ...options,
    layerId,
    center: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
    offset: options.offset ?? 24,
  })
}
