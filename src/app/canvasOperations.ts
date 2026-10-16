import {
  containsBounds,
  defaultConnectionSides,
  elementBounds,
  LCanvasError,
  requireCanvasName,
  validateCanvasDocument,
  type CanvasDocument,
  type CanvasElement,
  type CanvasLayer,
  type ConnectionSide,
} from './lcanvas'

type CreationBase = {
  id?: string
  color?: string
  layerId?: string
  areaId?: string | null
}
type CreationSize = CreationBase & {
  x: number
  y: number
  width: number
  height: number
}
export type NewCanvasElement =
  | (CreationSize & {
      type: 'rectangle' | 'ellipse' | 'diamond'
      fill?: string | null
      text?: string
      fontSize?: number
    })
  | (CreationSize & { type: 'text'; text?: string; fontSize?: number })
  | (CreationSize & { type: 'area'; name?: string; fill?: string | null })
  | (CreationBase & {
      type: 'line'
      x: number
      y: number
      x2: number
      y2: number
    })
  | (CreationBase & {
      type: 'connection'
      fromId: string
      toId: string
      style?: 'straight' | 'elbow'
      startArrow?: boolean
      endArrow?: boolean
      fromSide?: ConnectionSide
      toSide?: ConnectionSide
    })
export type ElementPatch = {
  x?: number
  y?: number
  width?: number
  height?: number
  x2?: number
  y2?: number
  color?: string
  fill?: string | null
  text?: string
  fontSize?: number
  name?: string
  layerId?: string
  areaId?: string | null
  style?: 'straight' | 'elbow'
  startArrow?: boolean
  endArrow?: boolean
  fromSide?: ConnectionSide
  toSide?: ConnectionSide
}
export type ConnectionOptions = CreationBase & {
  style?: 'straight' | 'elbow'
  startArrow?: boolean
  endArrow?: boolean
  fromSide?: ConnectionSide
  toSide?: ConnectionSide
}

function fail(message: string): never {
  throw new LCanvasError(message)
}
function generatedId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`
}
function source(document: CanvasDocument) {
  return validateCanvasDocument(document)
}
function requireElement(document: CanvasDocument, id: string): CanvasElement {
  return (
    document.elements.find((element) => element.id === id) ??
    fail('The selected object no longer exists.')
  )
}
function requireLayer(document: CanvasDocument, id: string): CanvasLayer {
  return (
    document.layers.find((layer) => layer.id === id) ??
    fail('The selected layer no longer exists.')
  )
}
function requireWritableLayer(document: CanvasDocument, id: string) {
  const layer = requireLayer(document, id)
  if (layer.locked || !layer.visible)
    fail('Choose a visible, unlocked layer before editing.')
  return layer
}
export function isElementEditable(
  document: CanvasDocument,
  id: string,
): boolean {
  const element = document.elements.find((item) => item.id === id)
  if (!element) return false
  const layer = document.layers.find((item) => item.id === element.layerId)
  if (!layer?.visible || layer.locked) return false
  if (element.areaId !== null) {
    const area = document.elements.find((item) => item.id === element.areaId)
    const areaLayer = document.layers.find((item) => item.id === area?.layerId)
    if (!areaLayer?.visible || areaLayer.locked) return false
  }
  return true
}
function requireEditable(document: CanvasDocument, id: string): CanvasElement {
  const element = requireElement(document, id)
  if (!isElementEditable(document, id))
    fail('This object or its area is on a hidden or locked layer.')
  return element
}
export function orderedVisibleElements(
  document: CanvasDocument,
): CanvasElement[] {
  const visibleLayers = new Set(
    document.layers.filter((layer) => layer.visible).map((layer) => layer.id),
  )
  const visible = (element: CanvasElement) => {
    if (!visibleLayers.has(element.layerId)) return false
    if (element.areaId === null) return true
    const area = document.elements.find((item) => item.id === element.areaId)
    return Boolean(area && visibleLayers.has(area.layerId))
  }
  const visibleIds = new Set(
    document.elements.filter(visible).map((element) => element.id),
  )
  return document.layers.flatMap((layer) =>
    document.elements
      .filter(
        (element) =>
          element.layerId === layer.id &&
          visibleIds.has(element.id) &&
          (element.type !== 'connection' ||
            (visibleIds.has(element.fromId) && visibleIds.has(element.toId))),
      )
      .sort((a, b) => Number(b.type === 'area') - Number(a.type === 'area')),
  )
}

function detachOutsideAreas(document: CanvasDocument): CanvasDocument {
  const detached = {
    ...document,
    elements: document.elements.map((element) => {
      if (element.areaId === null || element.type === 'connection')
        return element
      const area = document.elements.find((item) => item.id === element.areaId)
      if (
        area?.type === 'area' &&
        containsBounds(area, elementBounds(document, element))
      )
        return element
      requireEditable(document, element.id)
      return { ...element, areaId: null }
    }),
  }
  return {
    ...detached,
    elements: detached.elements.map((element) => {
      if (element.areaId === null || element.type !== 'connection')
        return element
      const area = detached.elements.find((item) => item.id === element.areaId)
      const endpointsInside = detached.elements
        .filter(
          (item) => item.id === element.fromId || item.id === element.toId,
        )
        .every((item) => item.areaId === element.areaId)
      if (
        area?.type === 'area' &&
        endpointsInside &&
        containsBounds(area, elementBounds(detached, element))
      )
        return element
      requireEditable(document, element.id)
      return { ...element, areaId: null }
    }),
  }
}

export function createElement(
  document: CanvasDocument,
  input: NewCanvasElement,
): CanvasDocument {
  const current = source(document)
  const layerId =
    input.layerId ??
    current.layers.find((layer) => layer.visible && !layer.locked)?.id
  if (!layerId)
    return fail('Create or unlock a visible layer before adding objects.')
  requireWritableLayer(current, layerId)
  const base = {
    id: generatedId('object'),
    color: '#7C5CFC',
    layerId,
    areaId: null,
  }
  if (input.type === 'connection') {
    requireEditable(current, input.fromId)
    requireEditable(current, input.toId)
  }
  const defaults =
    input.type === 'rectangle' ||
    input.type === 'ellipse' ||
    input.type === 'diamond'
      ? { fill: null, text: '', fontSize: 20 }
      : input.type === 'text'
        ? { text: 'Text', fontSize: 24 }
        : input.type === 'area'
          ? { name: 'Area', fill: null }
          : input.type === 'connection'
            ? {
                style: 'straight',
                startArrow: false,
                endArrow: true,
                ...defaultConnectionSides(current, input.fromId, input.toId),
              }
            : {}
  const element = { ...base, ...defaults, ...input }
  if (element.areaId !== null) {
    const area = requireEditable(current, element.areaId)
    if (area.type !== 'area')
      return fail('Choose an existing area for this object.')
  }
  return validateCanvasDocument({
    ...current,
    elements: [...current.elements, element],
  })
}

export function updateElement(
  document: CanvasDocument,
  id: string,
  patch: ElementPatch,
): CanvasDocument {
  const current = source(document)
  const element = requireEditable(current, id)
  const typeKeys =
    element.type === 'connection'
      ? ['style', 'startArrow', 'endArrow', 'fromSide', 'toSide']
      : element.type === 'line'
        ? ['x', 'y', 'x2', 'y2']
        : [
            'x',
            'y',
            'width',
            'height',
            ...(element.type === 'area'
              ? ['name', 'fill']
              : [
                  'text',
                  'fontSize',
                  ...(element.type === 'text' ? [] : ['fill']),
                ]),
          ]
  const allowedKeys = ['color', 'layerId', 'areaId', ...typeKeys]
  if (
    !patch ||
    typeof patch !== 'object' ||
    Array.isArray(patch) ||
    Object.keys(patch).some((key) => !allowedKeys.includes(key))
  )
    return fail('This change contains unsupported object fields.')
  if (patch.layerId !== undefined) requireWritableLayer(current, patch.layerId)
  if (patch.areaId !== undefined && patch.areaId !== null) {
    const area = requireEditable(current, patch.areaId)
    if (area.type !== 'area')
      return fail('Choose an existing area for this object.')
  }
  let elements = current.elements.map((item) =>
    item.id === id ? ({ ...item, ...patch } as CanvasElement) : item,
  )
  if (element.type === 'area' && ('x' in patch || 'y' in patch)) {
    const deltaX = (patch.x ?? element.x) - element.x
    const deltaY = (patch.y ?? element.y) - element.y
    if (deltaX !== 0 || deltaY !== 0) {
      elements = elements.map((item) => {
        if (item.areaId !== id) return item
        requireEditable(current, item.id)
        if (item.type === 'connection') return item
        return item.type === 'line'
          ? {
              ...item,
              x: item.x + deltaX,
              y: item.y + deltaY,
              x2: item.x2 + deltaX,
              y2: item.y2 + deltaY,
            }
          : { ...item, x: item.x + deltaX, y: item.y + deltaY }
      })
    }
  } else if (element.type === 'line') {
    // Moving the first endpoint translates the whole line unless explicitly editing both endpoints.
    if ('x' in patch && !('x2' in patch))
      elements = elements.map((item) =>
        item.id === id && item.type === 'line'
          ? { ...item, x2: element.x2 + ((patch.x ?? element.x) - element.x) }
          : item,
      )
    if ('y' in patch && !('y2' in patch))
      elements = elements.map((item) =>
        item.id === id && item.type === 'line'
          ? { ...item, y2: element.y2 + ((patch.y ?? element.y) - element.y) }
          : item,
      )
  }
  const next = { ...current, elements }
  // A deliberate assignment or area resize must contain all members. Ordinary dragging may leave an area.
  if ('areaId' in patch && patch.areaId !== null) {
    const edited = requireElement(next, id)
    const area = requireElement(next, patch.areaId as string)
    if (
      area.type !== 'area' ||
      !containsBounds(area, elementBounds(next, edited))
    )
      return fail('An area must fully contain each of its members.')
    if (
      edited.type === 'connection' &&
      next.elements
        .filter((item) => item.id === edited.fromId || item.id === edited.toId)
        .some((item) => item.areaId !== area.id)
    )
      return fail(
        'A connection inside an area must connect two members of that area.',
      )
  }
  const validated = element.type === 'area' ? next : detachOutsideAreas(next)
  return validateCanvasDocument(validated)
}
export function moveElement(
  document: CanvasDocument,
  id: string,
  x: number,
  y: number,
): CanvasDocument {
  return updateElement(document, id, { x, y })
}
export function resizeElement(
  document: CanvasDocument,
  id: string,
  width: number,
  height: number,
): CanvasDocument {
  return updateElement(document, id, { width, height })
}
export function assignElementLayer(
  document: CanvasDocument,
  id: string,
  layerId: string,
): CanvasDocument {
  return updateElement(document, id, { layerId })
}
export function assignElementArea(
  document: CanvasDocument,
  id: string,
  areaId: string | null,
): CanvasDocument {
  return updateElement(document, id, { areaId })
}

export function removeElement(
  document: CanvasDocument,
  id: string,
): CanvasDocument {
  const current = source(document)
  const selected = requireEditable(current, id)
  const removedIds = new Set([id])
  for (const element of current.elements) {
    if (
      element.type === 'connection' &&
      (element.fromId === id || element.toId === id)
    ) {
      requireEditable(current, element.id)
      removedIds.add(element.id)
    }
    if (selected.type === 'area' && element.areaId === id)
      requireEditable(current, element.id)
  }
  return validateCanvasDocument({
    ...current,
    elements: current.elements
      .filter((item) => !removedIds.has(item.id))
      .map((item) => (item.areaId === id ? { ...item, areaId: null } : item)),
  })
}
export function connectElements(
  document: CanvasDocument,
  fromId: string,
  toId: string,
  options: ConnectionOptions = {},
): CanvasDocument {
  return createElement(document, {
    type: 'connection',
    fromId,
    toId,
    ...options,
  })
}
export function addLayer(
  document: CanvasDocument,
  name: string,
  id = generatedId('layer'),
): CanvasDocument {
  const current = source(document)
  return validateCanvasDocument({
    ...current,
    layers: [
      ...current.layers,
      { id, name: requireCanvasName(name), visible: true, locked: false },
    ],
  })
}
export function updateLayer(
  document: CanvasDocument,
  id: string,
  patch: Partial<Pick<CanvasLayer, 'name' | 'visible' | 'locked'>>,
): CanvasDocument {
  const current = source(document)
  requireLayer(current, id)
  if (
    !patch ||
    typeof patch !== 'object' ||
    Array.isArray(patch) ||
    Object.keys(patch).some(
      (key) => !['name', 'visible', 'locked'].includes(key),
    )
  )
    return fail('This change contains unsupported layer fields.')
  return validateCanvasDocument({
    ...current,
    layers: current.layers.map((layer) =>
      layer.id === id ? { ...layer, ...patch } : layer,
    ),
  })
}
export function reorderLayer(
  document: CanvasDocument,
  id: string,
  index: number,
): CanvasDocument {
  const current = source(document)
  const layer = requireLayer(current, id)
  if (!Number.isInteger(index) || index < 0 || index >= current.layers.length)
    return fail('Choose a valid layer position.')
  const layers = current.layers.filter((item) => item.id !== id)
  layers.splice(index, 0, layer)
  return validateCanvasDocument({ ...current, layers })
}
