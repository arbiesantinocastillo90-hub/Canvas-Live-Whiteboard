export type CanvasViewport = { x: number; y: number; zoom: number }

type ElementBase = { id: string; x: number; y: number; color: string }
type SizedElement = ElementBase & { width: number; height: number }

export type RectangleElement = SizedElement & {
  type: 'rectangle'
  fill: string | null
}
export type EllipseElement = SizedElement & {
  type: 'ellipse'
  fill: string | null
}
export type TextElement = SizedElement & {
  type: 'text'
  text: string
  fontSize: number
}
export type LineElement = ElementBase & {
  type: 'line'
  x2: number
  y2: number
}
export type CanvasElement =
  RectangleElement | EllipseElement | TextElement | LineElement

export type CanvasDocument = {
  format: 'LCANVAS'
  version: 1
  name: string
  viewport: CanvasViewport
  elements: CanvasElement[]
}

export const LCANVAS_MAX_BYTES = 10 * 1024 * 1024
export const LCANVAS_MAX_ELEMENTS = 5000
export const LCANVAS_MIN_ZOOM = 0.1
export const LCANVAS_MAX_ZOOM = 4
const COORDINATE_LIMIT = 1_000_000

export class LCanvasError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LCanvasError'
  }
}

function fail(message: string): never {
  throw new LCanvasError(message)
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value)
  return (
    actual.length === keys.length && actual.every((key) => keys.includes(key))
  )
}

function finiteBounded(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= COORDINATE_LIMIT
  )
}

function positiveSize(value: unknown): value is number {
  return finiteBounded(value) && value > 0
}

function color(value: unknown): value is string {
  return typeof value === 'string' && /^#[\da-f]{6}$/iu.test(value)
}

function hasControlCharacters(value: string, allowWhitespace = false): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    if (allowWhitespace && [9, 10, 13].includes(code)) return false
    return code < 32 || code === 127
  })
}

export function validCanvasId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    value.trim() === value &&
    !hasControlCharacters(value)
  )
}

function requireName(value: unknown): string {
  if (typeof value !== 'string') return fail('The canvas name must be text.')
  const name = value.trim()
  if (!name || name.length > 120 || hasControlCharacters(name)) {
    return fail('Enter a canvas name between 1 and 120 characters.')
  }
  return name
}

export function validateCanvasDocument(value: unknown): CanvasDocument {
  if (!record(value) || value.format !== 'LCANVAS') {
    return fail('This is not an LCANVAS file.')
  }
  if (value.version !== 1) {
    return fail('This LCANVAS version is not supported. Supported version: 1.')
  }
  if (
    !exactKeys(value, ['format', 'version', 'name', 'viewport', 'elements'])
  ) {
    return fail('The LCANVAS file contains unsupported document fields.')
  }
  const name = requireName(value.name)
  const viewport = value.viewport
  if (
    !record(viewport) ||
    !exactKeys(viewport, ['x', 'y', 'zoom']) ||
    !finiteBounded(viewport.x) ||
    !finiteBounded(viewport.y) ||
    typeof viewport.zoom !== 'number' ||
    !Number.isFinite(viewport.zoom) ||
    viewport.zoom < LCANVAS_MIN_ZOOM ||
    viewport.zoom > LCANVAS_MAX_ZOOM
  ) {
    return fail(
      'The canvas view must use finite coordinates and 10%–400% zoom.',
    )
  }
  if (
    !Array.isArray(value.elements) ||
    value.elements.length > LCANVAS_MAX_ELEMENTS
  ) {
    return fail('An LCANVAS file can contain up to 5,000 supported elements.')
  }

  const ids = new Set<string>()
  const elements: CanvasElement[] = []
  let textBytes = 0
  for (const item of value.elements) {
    if (
      !record(item) ||
      !validCanvasId(item.id) ||
      ids.has(item.id) ||
      !finiteBounded(item.x) ||
      !finiteBounded(item.y) ||
      !color(item.color)
    ) {
      return fail(
        'An element has an invalid or duplicate identifier, position, or color.',
      )
    }
    ids.add(item.id)
    const base = { id: item.id, x: item.x, y: item.y, color: item.color }
    if (item.type === 'line') {
      if (
        !exactKeys(item, ['id', 'type', 'x', 'y', 'x2', 'y2', 'color']) ||
        !finiteBounded(item.x2) ||
        !finiteBounded(item.y2)
      ) {
        return fail('A line has unsupported fields or invalid end coordinates.')
      }
      elements.push({ ...base, type: 'line', x2: item.x2, y2: item.y2 })
      continue
    }
    if (!positiveSize(item.width) || !positiveSize(item.height)) {
      return fail('Element dimensions must be positive and at most 1,000,000.')
    }
    const sized = { ...base, width: item.width, height: item.height }
    if (item.type === 'rectangle' || item.type === 'ellipse') {
      if (
        !exactKeys(item, [
          'id',
          'type',
          'x',
          'y',
          'width',
          'height',
          'color',
          'fill',
        ]) ||
        (item.fill !== null && !color(item.fill))
      ) {
        return fail('A shape has unsupported fields or an invalid fill color.')
      }
      elements.push({ ...sized, type: item.type, fill: item.fill })
      continue
    }
    if (item.type === 'text') {
      if (
        !exactKeys(item, [
          'id',
          'type',
          'x',
          'y',
          'width',
          'height',
          'color',
          'text',
          'fontSize',
        ]) ||
        typeof item.text !== 'string' ||
        item.text.length > 20_000 ||
        hasControlCharacters(item.text, true) ||
        typeof item.fontSize !== 'number' ||
        !Number.isFinite(item.fontSize) ||
        item.fontSize < 8 ||
        item.fontSize > 160
      ) {
        return fail(
          'Text must be plain text, up to 20,000 characters, with an 8–160 font size.',
        )
      }
      textBytes += new TextEncoder().encode(item.text).byteLength
      if (textBytes > LCANVAS_MAX_BYTES)
        return fail('The LCANVAS file exceeds 10 MiB.')
      elements.push({
        ...sized,
        type: 'text',
        text: item.text,
        fontSize: item.fontSize,
      })
      continue
    }
    return fail('This LCANVAS file contains an unsupported element type.')
  }

  const document: CanvasDocument = {
    format: 'LCANVAS',
    version: 1,
    name,
    viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
    elements,
  }
  if (
    new TextEncoder().encode(JSON.stringify(document)).byteLength >
    LCANVAS_MAX_BYTES
  ) {
    return fail('The LCANVAS file exceeds 10 MiB.')
  }
  return document
}

export function parseLCANVAS(raw: string): CanvasDocument {
  if (
    typeof raw !== 'string' ||
    raw.length > LCANVAS_MAX_BYTES ||
    new TextEncoder().encode(raw).byteLength > LCANVAS_MAX_BYTES
  ) {
    return fail('The LCANVAS file exceeds 10 MiB.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fail('The LCANVAS file is not valid JSON.')
  }
  return validateCanvasDocument(parsed)
}

export function serializeLCANVAS(document: CanvasDocument): string {
  const serialized = JSON.stringify(validateCanvasDocument(document))
  if (new TextEncoder().encode(serialized).byteLength > LCANVAS_MAX_BYTES) {
    return fail('The exported LCANVAS file exceeds 10 MiB.')
  }
  return serialized
}

export function createCanvasDocument(name: string): CanvasDocument {
  return {
    format: 'LCANVAS',
    version: 1,
    name: requireName(name),
    viewport: { x: 0, y: 0, zoom: 1 },
    elements: [],
  }
}

export function canvasExportFilename(name: string): string {
  const safe = requireName(name)
    .replace(/[<>:"/\\|?*]/gu, '-')
    .replace(/[. ]+$/gu, '')
    .replace(/\.lcanvas$/iu, '')
  const base = safe || 'Canvas'
  return `${/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(base) ? `Canvas-${base}` : base}.lcanvas`
}
