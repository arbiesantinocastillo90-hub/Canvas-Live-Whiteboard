import {
  LCanvasError,
  validCanvasId,
  type CanvasDocument,
  type CanvasElement,
} from './lcanvas'
import {
  isElementEditable,
  reorderLayer,
  updateElement,
} from './canvasOperations'

export const CANVAS_LAYER_DRAG_MIME = 'application/x-canvas-live-layer-item'
export type CanvasLayerDrag = {
  version: 1
  kind: 'layer' | 'object'
  id: string
}
export type LayerDropPosition = 'before' | 'after' | 'inside'

export function readCanvasLayerDrag(
  value: string,
  document: CanvasDocument,
): CanvasLayerDrag | null {
  if (!value || value.length > 2048) return null
  try {
    const item: unknown = JSON.parse(value)
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const entry = item as Record<string, unknown>
    if (
      Object.keys(entry).length !== 3 ||
      entry.version !== 1 ||
      !['layer', 'object'].includes(String(entry.kind)) ||
      !validCanvasId(entry.id)
    )
      return null
    const exists =
      entry.kind === 'layer'
        ? document.layers.some((layer) => layer.id === entry.id)
        : document.elements.some((element) => element.id === entry.id)
    return exists ? (entry as CanvasLayerDrag) : null
  } catch {
    return null
  }
}

export function canDropCanvasLayerItem(
  document: CanvasDocument,
  item: CanvasLayerDrag,
  layerId: string,
): boolean {
  const current = readCanvasLayerDrag(JSON.stringify(item), document)
  const target = document.layers.find((layer) => layer.id === layerId)
  if (!current || !target) return false
  return current.kind === 'layer'
    ? current.id !== target.id
    : target.visible &&
        !target.locked &&
        isElementEditable(document, current.id)
}

/** The inspector lists the frontmost layers first; the document stores them last. */
export function dropCanvasLayerItem(
  document: CanvasDocument,
  item: CanvasLayerDrag,
  layerId: string,
  position: LayerDropPosition,
): CanvasDocument {
  if (!canDropCanvasLayerItem(document, item, layerId))
    throw new LCanvasError('Choose a visible, unlocked layer for this object.')
  if (item.kind === 'object') {
    const source = document.elements.find((element) => element.id === item.id)!
    return source.layerId === layerId
      ? document
      : updateElement(document, item.id, { layerId })
  }
  if (position !== 'before' && position !== 'after')
    throw new LCanvasError('Choose a position above or below the layer.')
  const visualIds = document.layers.map((layer) => layer.id).reverse()
  const withoutSource = visualIds.filter((id) => id !== item.id)
  const insertion =
    withoutSource.indexOf(layerId) + Number(position === 'after')
  withoutSource.splice(insertion, 0, item.id)
  const index = document.layers.length - 1 - withoutSource.indexOf(item.id)
  return document.layers[index].id === item.id
    ? document
    : reorderLayer(document, item.id, index)
}

/** Objects appear front to back, with areas behind other objects in their layer. */
export function inspectorLayerElements(
  document: CanvasDocument,
  layerId: string,
): CanvasElement[] {
  return document.elements
    .filter((element) => element.layerId === layerId)
    .sort((a, b) => Number(b.type === 'area') - Number(a.type === 'area'))
    .reverse()
}
