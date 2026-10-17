export type CanvasViewport = { x: number; y: number; zoom: number }
export type CanvasLayer = {
  id: string
  name: string
  visible: boolean
  locked: boolean
}
export type ElementBase = {
  id: string
  color: string
  layerId: string
  areaId: string | null
}
export type PositionedElement = ElementBase & { x: number; y: number }
export type SizedElement = PositionedElement & { width: number; height: number }
export type ShapeElement = SizedElement & {
  type: 'rectangle' | 'ellipse' | 'diamond'
  fill: string | null
  text: string
  fontSize: number
}
export type RectangleElement = ShapeElement & { type: 'rectangle' }
export type EllipseElement = ShapeElement & { type: 'ellipse' }
export type DiamondElement = ShapeElement & { type: 'diamond' }
export type TextElement = SizedElement & {
  type: 'text'
  text: string
  fontSize: number
}
export type AreaElement = SizedElement & {
  type: 'area'
  name: string
  fill: string | null
  areaId: null
}
export type LineElement = PositionedElement & {
  type: 'line'
  x2: number
  y2: number
}
export type ConnectionElement = ElementBase & {
  type: 'connection'
  fromId: string
  toId: string
  style: 'straight' | 'elbow'
  startArrow: boolean
  endArrow: boolean
  fromSide?: ConnectionSide
  toSide?: ConnectionSide
}
export type ConnectionSide = 'auto' | 'top' | 'right' | 'bottom' | 'left'
export const CONNECTION_SIDES: readonly ConnectionSide[] = [
  'auto',
  'top',
  'right',
  'bottom',
  'left',
]
export type CanvasElement =
  ShapeElement | TextElement | AreaElement | LineElement | ConnectionElement
export type CanvasDocument = {
  format: 'LCANVAS'
  version: 2
  name: string
  viewport: CanvasViewport
  layers: CanvasLayer[]
  elements: CanvasElement[]
}

export const LCANVAS_MAX_BYTES = 10 * 1024 * 1024
export const CANVAS_FILE_EXTENSION = '.CLF'
export const CANVAS_FILE_ACCEPT = '.CLF,.clf,.lcanvas,application/json'
export const LCANVAS_MAX_ELEMENTS = 5000
export const LCANVAS_MAX_LAYERS = 100
export const LCANVAS_MIN_ZOOM = 0.1
export const LCANVAS_MAX_ZOOM = 4
export const DEFAULT_LAYER_ID = 'layer-main'
export const COORDINATE_LIMIT = 1_000_000

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
export function requireCanvasName(value: unknown): string {
  if (typeof value !== 'string') return fail('The canvas name must be text.')
  const name = value.trim()
  if (!name || name.length > 120 || hasControlCharacters(name))
    return fail('Enter a name between 1 and 120 characters.')
  return name
}
function requireText(item: Record<string, unknown>) {
  if (
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
  return { text: item.text, fontSize: item.fontSize }
}
function requireViewport(value: unknown): CanvasViewport {
  if (
    !record(value) ||
    !exactKeys(value, ['x', 'y', 'zoom']) ||
    !finiteBounded(value.x) ||
    !finiteBounded(value.y) ||
    typeof value.zoom !== 'number' ||
    !Number.isFinite(value.zoom) ||
    value.zoom < LCANVAS_MIN_ZOOM ||
    value.zoom > LCANVAS_MAX_ZOOM
  ) {
    return fail(
      'The canvas view must use finite coordinates and 10%–400% zoom.',
    )
  }
  return { x: value.x, y: value.y, zoom: value.zoom }
}

function validateElement(
  item: unknown,
  legacy: boolean,
  ids: Set<string>,
): CanvasElement {
  if (
    !record(item) ||
    !validCanvasId(item.id) ||
    ids.has(item.id) ||
    !color(item.color)
  )
    return fail(
      'An element has an invalid or duplicate identifier, position, or color.',
    )
  ids.add(item.id)
  if (
    !legacy &&
    (!validCanvasId(item.layerId) ||
      (item.areaId !== null && !validCanvasId(item.areaId)))
  )
    return fail('Every element must reference a valid layer and optional area.')
  const base: ElementBase = {
    id: item.id,
    color: item.color,
    layerId: legacy ? DEFAULT_LAYER_ID : (item.layerId as string),
    areaId: legacy ? null : (item.areaId as string | null),
  }
  const keys = legacy
    ? ['id', 'type', 'color']
    : ['id', 'type', 'color', 'layerId', 'areaId']
  if (item.type === 'connection' && !legacy) {
    if (
      !exactKeys(item, [
        ...keys,
        'fromId',
        'toId',
        'style',
        'startArrow',
        'endArrow',
        ...(Object.hasOwn(item, 'fromSide') ? ['fromSide'] : []),
        ...(Object.hasOwn(item, 'toSide') ? ['toSide'] : []),
      ]) ||
      !validCanvasId(item.fromId) ||
      !validCanvasId(item.toId) ||
      item.fromId === item.toId ||
      !['straight', 'elbow'].includes(item.style as string) ||
      typeof item.startArrow !== 'boolean' ||
      typeof item.endArrow !== 'boolean' ||
      (Object.hasOwn(item, 'fromSide') &&
        !CONNECTION_SIDES.includes(item.fromSide as ConnectionSide)) ||
      (Object.hasOwn(item, 'toSide') &&
        !CONNECTION_SIDES.includes(item.toSide as ConnectionSide))
    )
      return fail(
        'A connection has invalid endpoints, style, arrows, or unsupported fields.',
      )
    return {
      ...base,
      type: 'connection',
      fromId: item.fromId,
      toId: item.toId,
      style: item.style as 'straight' | 'elbow',
      startArrow: item.startArrow,
      endArrow: item.endArrow,
      ...(Object.hasOwn(item, 'fromSide')
        ? { fromSide: item.fromSide as ConnectionSide }
        : {}),
      ...(Object.hasOwn(item, 'toSide')
        ? { toSide: item.toSide as ConnectionSide }
        : {}),
    }
  }
  if (!finiteBounded(item.x) || !finiteBounded(item.y))
    return fail(
      'An element has an invalid or duplicate identifier, position, or color.',
    )
  const positioned = { ...base, x: item.x, y: item.y }
  if (item.type === 'line') {
    if (
      !exactKeys(item, [...keys, 'x', 'y', 'x2', 'y2']) ||
      !finiteBounded(item.x2) ||
      !finiteBounded(item.y2)
    )
      return fail('A line has unsupported fields or invalid end coordinates.')
    return { ...positioned, type: 'line', x2: item.x2, y2: item.y2 }
  }
  if (!positiveSize(item.width) || !positiveSize(item.height))
    return fail('Element dimensions must be positive and at most 1,000,000.')
  const sized = { ...positioned, width: item.width, height: item.height }
  const sizedKeys = [...keys, 'x', 'y', 'width', 'height']
  if (
    item.type === 'rectangle' ||
    item.type === 'ellipse' ||
    (!legacy && item.type === 'diamond')
  ) {
    if (
      !exactKeys(item, [
        ...sizedKeys,
        'fill',
        ...(!legacy ? ['text', 'fontSize'] : []),
      ]) ||
      (item.fill !== null && !color(item.fill))
    )
      return fail('A shape has unsupported fields or an invalid fill color.')
    return {
      ...sized,
      type: item.type,
      fill: item.fill,
      ...(legacy ? { text: '', fontSize: 20 } : requireText(item)),
    }
  }
  if (item.type === 'text') {
    if (!exactKeys(item, [...sizedKeys, 'text', 'fontSize']))
      return fail('Text has unsupported fields.')
    return { ...sized, type: 'text', ...requireText(item) }
  }
  if (item.type === 'area' && !legacy) {
    if (
      !exactKeys(item, [...sizedKeys, 'name', 'fill']) ||
      item.areaId !== null ||
      (item.fill !== null && !color(item.fill))
    )
      return fail('Areas cannot be nested and must use a valid fill color.')
    return {
      ...sized,
      type: 'area',
      areaId: null,
      name: requireCanvasName(item.name),
      fill: item.fill,
    }
  }
  return fail('This LCANVAS file contains an unsupported element type.')
}

export type ElementBounds = {
  x: number
  y: number
  width: number
  height: number
}
export function elementBounds(
  document: CanvasDocument,
  element: CanvasElement,
): ElementBounds {
  if (element.type === 'connection') {
    const points = connectionEndpoints(document, element)
    return {
      x: Math.min(points.x1, points.x2),
      y: Math.min(points.y1, points.y2),
      width: Math.abs(points.x2 - points.x1),
      height: Math.abs(points.y2 - points.y1),
    }
  }
  if (element.type === 'line')
    return {
      x: Math.min(element.x, element.x2),
      y: Math.min(element.y, element.y2),
      width: Math.abs(element.x2 - element.x),
      height: Math.abs(element.y2 - element.y),
    }
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  }
}
export function containsBounds(
  area: ElementBounds,
  bounds: ElementBounds,
): boolean {
  return (
    bounds.x >= area.x &&
    bounds.y >= area.y &&
    bounds.x + bounds.width <= area.x + area.width &&
    bounds.y + bounds.height <= area.y + area.height
  )
}
export function connectionEndpoints(
  document: CanvasDocument,
  connection: ConnectionElement,
): { x1: number; y1: number; x2: number; y2: number } {
  const from = document.elements.find((item) => item.id === connection.fromId)
  const to = document.elements.find((item) => item.id === connection.toId)
  if (
    !from ||
    !to ||
    from.type === 'connection' ||
    from.type === 'line' ||
    to.type === 'connection' ||
    to.type === 'line'
  )
    return fail(
      'A connection must reference two existing shapes, text items, or areas.',
    )
  const a = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
  const b = { x: to.x + to.width / 2, y: to.y + to.height / 2 }
  function boundary(
    shape: ShapeElement | TextElement | AreaElement,
    center: { x: number; y: number },
    other: { x: number; y: number },
    side: ConnectionSide = 'auto',
  ) {
    if (side === 'top') return { x: center.x, y: shape.y }
    if (side === 'right') return { x: shape.x + shape.width, y: center.y }
    if (side === 'bottom') return { x: center.x, y: shape.y + shape.height }
    if (side === 'left') return { x: shape.x, y: center.y }
    const dx = other.x - center.x
    const dy = other.y - center.y
    if (dx === 0 && dy === 0) return center
    const halfW = shape.width / 2
    const halfH = shape.height / 2
    const ratio =
      shape.type === 'ellipse'
        ? 1 / Math.sqrt((dx / halfW) ** 2 + (dy / halfH) ** 2)
        : shape.type === 'diamond'
          ? 1 / (Math.abs(dx) / halfW + Math.abs(dy) / halfH)
          : 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH)
    return { x: center.x + dx * ratio, y: center.y + dy * ratio }
  }
  const start = boundary(from, a, b, connection.fromSide)
  const end = boundary(to, b, a, connection.toSide)
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y }
}

/** Choose a side once when creating a link, so another node's movement cannot slide its origin. */
export function defaultConnectionSides(
  document: CanvasDocument,
  fromId: string,
  toId: string,
): { fromSide: ConnectionSide; toSide: ConnectionSide } {
  const from = document.elements.find((item) => item.id === fromId)
  const to = document.elements.find((item) => item.id === toId)
  if (!from || !to || !('width' in from) || !('width' in to))
    return fail(
      'A connection must reference two existing shapes, text items, or areas.',
    )
  const dx = to.x + to.width / 2 - from.x - from.width / 2
  const dy = to.y + to.height / 2 - from.y - from.height / 2
  function side(
    width: number,
    height: number,
    x: number,
    y: number,
  ): ConnectionSide {
    return Math.abs(x) / width >= Math.abs(y) / height
      ? x >= 0
        ? 'right'
        : 'left'
      : y >= 0
        ? 'bottom'
        : 'top'
  }
  return {
    fromSide: side(from.width, from.height, dx, dy),
    toSide: side(to.width, to.height, -dx, -dy),
  }
}

/** Orthogonal paths leave and enter the selected sides in their outward direction. */
export function connectionPath(
  document: CanvasDocument,
  connection: ConnectionElement,
): string {
  const { x1, y1, x2, y2 } = connectionEndpoints(document, connection)
  if (connection.style === 'straight') return `M ${x1} ${y1} L ${x2} ${y2}`
  const defaults = defaultConnectionSides(
    document,
    connection.fromId,
    connection.toId,
  )
  const from =
    connection.fromSide && connection.fromSide !== 'auto'
      ? connection.fromSide
      : defaults.fromSide
  const to =
    connection.toSide && connection.toSide !== 'auto'
      ? connection.toSide
      : defaults.toSide
  function lead(x: number, y: number, side: ConnectionSide) {
    return {
      x: x + (side === 'right' ? 24 : side === 'left' ? -24 : 0),
      y: y + (side === 'bottom' ? 24 : side === 'top' ? -24 : 0),
    }
  }
  const a = lead(x1, y1, from)
  const b = lead(x2, y2, to)
  const fromHorizontal = from === 'left' || from === 'right'
  const toHorizontal = to === 'left' || to === 'right'
  const middle =
    fromHorizontal === toHorizontal
      ? fromHorizontal
        ? `H ${(a.x + b.x) / 2} V ${b.y} H ${b.x}`
        : `V ${(a.y + b.y) / 2} H ${b.x} V ${b.y}`
      : fromHorizontal
        ? `H ${b.x} V ${b.y}`
        : `V ${b.y} H ${b.x}`
  return `M ${x1} ${y1} L ${a.x} ${a.y} ${middle} L ${x2} ${y2}`
}

export function validateCanvasDocument(value: unknown): CanvasDocument {
  if (!record(value) || value.format !== 'LCANVAS')
    return fail('This is not an LCANVAS file.')
  if (value.version !== 1 && value.version !== 2)
    return fail(
      'This LCANVAS version is not supported. Supported versions: 1 and 2.',
    )
  const legacy = value.version === 1
  if (
    !exactKeys(value, [
      'format',
      'version',
      'name',
      'viewport',
      'elements',
      ...(!legacy ? ['layers'] : []),
    ])
  )
    return fail('The LCANVAS file contains unsupported document fields.')
  const name = requireCanvasName(value.name)
  const viewport = requireViewport(value.viewport)
  const layers: CanvasLayer[] = []
  if (legacy)
    layers.push({
      id: DEFAULT_LAYER_ID,
      name: 'Main',
      visible: true,
      locked: false,
    })
  else {
    if (
      !Array.isArray(value.layers) ||
      value.layers.length === 0 ||
      value.layers.length > LCANVAS_MAX_LAYERS
    )
      return fail('An LCANVAS file needs 1–100 layers.')
    const ids = new Set<string>()
    for (const layer of value.layers) {
      if (
        !record(layer) ||
        !exactKeys(layer, ['id', 'name', 'visible', 'locked']) ||
        !validCanvasId(layer.id) ||
        ids.has(layer.id) ||
        typeof layer.visible !== 'boolean' ||
        typeof layer.locked !== 'boolean'
      )
        return fail('A layer has invalid or duplicate fields.')
      ids.add(layer.id)
      layers.push({
        id: layer.id,
        name: requireCanvasName(layer.name),
        visible: layer.visible,
        locked: layer.locked,
      })
    }
  }
  if (
    !Array.isArray(value.elements) ||
    value.elements.length > LCANVAS_MAX_ELEMENTS
  )
    return fail('An LCANVAS file can contain up to 5,000 supported elements.')
  const ids = new Set<string>()
  const elements = value.elements.map((item) =>
    validateElement(item, legacy, ids),
  )
  const document: CanvasDocument = {
    format: 'LCANVAS',
    version: 2,
    name,
    viewport,
    layers,
    elements,
  }
  // Earlier v2 files had no endpoint-side fields. Fix their sides from the
  // loaded geometry before any edit can move an endpoint. Explicit auto keeps
  // its dynamic behavior, and only these validated copies are normalized.
  for (const element of elements) {
    if (element.type !== 'connection') continue
    connectionEndpoints(document, element)
    if (element.fromSide === undefined || element.toSide === undefined) {
      const sides = defaultConnectionSides(
        document,
        element.fromId,
        element.toId,
      )
      element.fromSide ??= sides.fromSide
      element.toSide ??= sides.toSide
    }
  }
  for (const element of elements) {
    if (!layers.some((layer) => layer.id === element.layerId))
      return fail('An element references an unknown layer.')
    if (element.areaId !== null) {
      const area = elements.find((candidate) => candidate.id === element.areaId)
      if (
        !area ||
        area.type !== 'area' ||
        !containsBounds(area, elementBounds(document, element))
      )
        return fail('An area must exist and fully contain each of its members.')
      if (element.type === 'connection') {
        const from = elements.find(
          (candidate) => candidate.id === element.fromId,
        )
        const to = elements.find((candidate) => candidate.id === element.toId)
        if (from?.areaId !== area.id || to?.areaId !== area.id)
          return fail(
            'A connection inside an area must connect two members of that area.',
          )
      }
    }
  }
  if (
    new TextEncoder().encode(JSON.stringify(document)).byteLength >
    LCANVAS_MAX_BYTES
  )
    return fail('The LCANVAS file exceeds 10 MiB.')
  return document
}

export function parseLCANVAS(raw: string): CanvasDocument {
  if (
    typeof raw !== 'string' ||
    raw.length > LCANVAS_MAX_BYTES ||
    new TextEncoder().encode(raw).byteLength > LCANVAS_MAX_BYTES
  )
    return fail('The LCANVAS file exceeds 10 MiB.')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fail('The LCANVAS file is not valid JSON.')
  }
  return validateCanvasDocument(parsed)
}
export function serializeLCANVAS(document: CanvasDocument): string {
  return JSON.stringify(validateCanvasDocument(document))
}
export function createCanvasDocument(name: string): CanvasDocument {
  return {
    format: 'LCANVAS',
    version: 2,
    name: requireCanvasName(name),
    viewport: { x: 0, y: 0, zoom: 1 },
    layers: [
      { id: DEFAULT_LAYER_ID, name: 'Main', visible: true, locked: false },
    ],
    elements: [],
  }
}
export function canvasExportFilename(name: string): string {
  const safe = requireCanvasName(name)
    .replace(/[<>:"/\\|?*]/gu, '-')
    .replace(/[. ]+$/gu, '')
    .replace(/(?:\.(?:lcanvas|clf))+$/iu, '')
  const base = safe || 'Canvas'
  return `${/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(base) ? `Canvas-${base}` : base}${CANVAS_FILE_EXTENSION}`
}
