import { isElementEditable } from './canvasOperations'
import {
  containsBounds,
  elementBounds,
  LCanvasError,
  LCANVAS_MAX_ELEMENTS,
  validateCanvasDocument,
  type AreaElement,
  type CanvasDocument,
  type CanvasElement,
  type ElementBounds,
} from './lcanvas'

type SelectionOptions = {
  includeAreaMembers?: boolean
  includeInternalConnections?: boolean
}

/** Expand an area once, retaining document order and removing duplicate IDs. */
export function selectionIds(
  document: CanvasDocument,
  ids: readonly string[],
  options: SelectionOptions = {},
): string[] {
  const selected = new Set(ids)
  if (options.includeAreaMembers !== false) {
    const areas = new Set(
      document.elements
        .filter((item) => item.type === 'area' && selected.has(item.id))
        .map((item) => item.id),
    )
    for (const item of document.elements)
      if (item.areaId !== null && areas.has(item.areaId)) selected.add(item.id)
  }
  if (options.includeInternalConnections !== false)
    for (const item of document.elements)
      if (
        item.type === 'connection' &&
        selected.has(item.fromId) &&
        selected.has(item.toId)
      )
        selected.add(item.id)
  return document.elements
    .filter((item) => selected.has(item.id))
    .map((item) => item.id)
}

export function selectionBounds(
  document: CanvasDocument,
  ids: readonly string[],
): ElementBounds | null {
  const selected = new Set(selectionIds(document, ids))
  const bounds = document.elements
    .filter((item) => selected.has(item.id))
    .map((item) => elementBounds(document, item))
  if (!bounds.length) return null
  const x = Math.min(...bounds.map((item) => item.x))
  const y = Math.min(...bounds.map((item) => item.y))
  return {
    x,
    y,
    width: Math.max(...bounds.map((item) => item.x + item.width)) - x,
    height: Math.max(...bounds.map((item) => item.y + item.height)) - y,
  }
}

function requested(document: CanvasDocument, ids: readonly string[]) {
  if (!Array.isArray(ids) || ids.length > LCANVAS_MAX_ELEMENTS)
    throw new LCanvasError('Choose an existing, bounded selection of objects.')
  const existing = new Set(document.elements.map((item) => item.id))
  if (ids.some((id) => typeof id !== 'string' || !existing.has(id)))
    throw new LCanvasError('A selected object no longer exists.')
}

function requireEditable(document: CanvasDocument, id: string) {
  if (!isElementEditable(document, id))
    throw new LCanvasError(
      'This object or its area is on a hidden or locked layer.',
    )
}

/** Avoid losing a contained border member to floating-point transform rounding. */
export function preserveAreaPrecision(
  document: CanvasDocument,
  transformedAreas: ReadonlySet<string>,
): CanvasDocument {
  const areas = new Map(
    document.elements
      .filter(
        (item): item is AreaElement =>
          item.type === 'area' && transformedAreas.has(item.id),
      )
      .map((item) => [item.id, item]),
  )
  return {
    ...document,
    elements: document.elements.map((item): CanvasElement => {
      if (item.areaId === null || item.type === 'connection') return item
      const area = areas.get(item.areaId)
      if (!area || containsBounds(area, elementBounds(document, item)))
        return item
      const bounds = elementBounds(document, item)
      const right = area.x + area.width
      const bottom = area.y + area.height
      const epsilon = Math.min(
        Math.max(
          1,
          Math.abs(area.x),
          Math.abs(area.y),
          area.width,
          area.height,
        ) *
          Number.EPSILON *
          16,
        area.width / 8,
        area.height / 8,
      )
      if (
        bounds.x < area.x - epsilon ||
        bounds.y < area.y - epsilon ||
        bounds.x + bounds.width > right + epsilon ||
        bounds.y + bounds.height > bottom + epsilon
      )
        return item
      const x = (value: number) =>
        Math.min(right - epsilon, Math.max(area.x, value))
      const y = (value: number) =>
        Math.min(bottom - epsilon, Math.max(area.y, value))
      if (item.type === 'line')
        return {
          ...item,
          x: x(item.x),
          y: y(item.y),
          x2: x(item.x2),
          y2: y(item.y2),
        }
      const nextX = x(item.x)
      const nextY = y(item.y)
      return {
        ...item,
        x: nextX,
        y: nextY,
        width: Math.min(item.width, right - nextX - epsilon),
        height: Math.min(item.height, bottom - nextY - epsilon),
      }
    }),
  }
}

/** Remove only memberships made invalid by the completed group transaction. */
function repairMemberships(
  original: CanvasDocument,
  changed: CanvasDocument,
): CanvasDocument {
  const areas = new Map(
    changed.elements
      .filter((item) => item.type === 'area')
      .map((item) => [item.id, item]),
  )
  const detached = {
    ...changed,
    elements: changed.elements.map((item): CanvasElement => {
      if (item.areaId === null || item.type === 'connection') return item
      const area = areas.get(item.areaId)
      if (area && containsBounds(area, elementBounds(changed, item)))
        return item
      requireEditable(original, item.id)
      return { ...item, areaId: null }
    }),
  }
  const elements = new Map(detached.elements.map((item) => [item.id, item]))
  return {
    ...detached,
    elements: detached.elements.map((item): CanvasElement => {
      if (item.areaId === null || item.type !== 'connection') return item
      const area = areas.get(item.areaId)
      if (
        area &&
        elements.get(item.fromId)?.areaId === area.id &&
        elements.get(item.toId)?.areaId === area.id &&
        containsBounds(area, elementBounds(detached, item))
      )
        return item
      requireEditable(original, item.id)
      return { ...item, areaId: null }
    }),
  }
}

function transformSelection(
  document: CanvasDocument,
  ids: readonly string[],
  transform: (
    item: Exclude<CanvasElement, { type: 'connection' }>,
  ) => CanvasElement,
): CanvasDocument {
  const current = validateCanvasDocument(document)
  requested(current, ids)
  if (!ids.length) return current
  const selected = new Set(selectionIds(current, ids))
  for (const id of selected) requireEditable(current, id)
  if (
    !current.elements.some(
      (item) => selected.has(item.id) && item.type !== 'connection',
    )
  )
    throw new LCanvasError('Move a connection by moving its attached objects.')
  const changed = {
    ...current,
    elements: current.elements.map((item) =>
      selected.has(item.id) && item.type !== 'connection'
        ? transform(item)
        : item,
    ),
  }
  return validateCanvasDocument(
    repairMemberships(current, preserveAreaPrecision(changed, selected)),
  )
}

/** Return a single validated change; the caller commits one history step. */
export function moveSelection(
  document: CanvasDocument,
  ids: readonly string[],
  dx: number,
  dy: number,
): CanvasDocument {
  if (!Number.isFinite(dx) || !Number.isFinite(dy))
    throw new LCanvasError('Object movement must use finite coordinates.')
  return transformSelection(document, ids, (item) =>
    item.type === 'line'
      ? {
          ...item,
          x: item.x + dx,
          y: item.y + dy,
          x2: item.x2 + dx,
          y2: item.y2 + dy,
        }
      : { ...item, x: item.x + dx, y: item.y + dy },
  )
}

/** Resize a selection and its area contents around the same group bounds. */
export function resizeSelection(
  document: CanvasDocument,
  ids: readonly string[],
  nextBounds: ElementBounds,
): CanvasDocument {
  if (
    !nextBounds ||
    ![nextBounds.x, nextBounds.y, nextBounds.width, nextBounds.height].every(
      Number.isFinite,
    ) ||
    nextBounds.width <= 0 ||
    nextBounds.height <= 0
  )
    throw new LCanvasError('Selection dimensions must be finite and positive.')
  const bounds = selectionBounds(document, ids)
  if (!bounds) return transformSelection(document, ids, (item) => item)
  const scaleX = bounds.width > 0 ? nextBounds.width / bounds.width : 1
  const scaleY = bounds.height > 0 ? nextBounds.height / bounds.height : 1
  const x = (value: number) => nextBounds.x + (value - bounds.x) * scaleX
  const y = (value: number) => nextBounds.y + (value - bounds.y) * scaleY
  return transformSelection(document, ids, (item) =>
    item.type === 'line'
      ? { ...item, x: x(item.x), y: y(item.y), x2: x(item.x2), y2: y(item.y2) }
      : {
          ...item,
          x: x(item.x),
          y: y(item.y),
          width: item.width * scaleX,
          height: item.height * scaleY,
        },
  )
}

/** Delete selected objects/attached links; deleting an area keeps its contents. */
export function removeSelection(
  document: CanvasDocument,
  ids: readonly string[],
): CanvasDocument {
  const current = validateCanvasDocument(document)
  requested(current, ids)
  const removed = new Set(ids)
  for (const item of current.elements)
    if (
      item.type === 'connection' &&
      (removed.has(item.fromId) || removed.has(item.toId))
    )
      removed.add(item.id)
  for (const item of current.elements)
    if (
      removed.has(item.id) ||
      (item.areaId !== null && removed.has(item.areaId))
    )
      requireEditable(current, item.id)
  return validateCanvasDocument({
    ...current,
    elements: current.elements
      .filter((item) => !removed.has(item.id))
      .map((item) =>
        item.areaId !== null && removed.has(item.areaId)
          ? { ...item, areaId: null }
          : item,
      ),
  })
}
