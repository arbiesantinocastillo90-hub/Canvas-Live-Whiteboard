import type { CanvasElement, CanvasViewport } from './lcanvas'

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4
export const VIEW_HISTORY_LIMIT = 100

export type ViewHistory = {
  past: CanvasViewport[]
  present: CanvasViewport
  future: CanvasViewport[]
}

export function sameViewport(a: CanvasViewport, b: CanvasViewport): boolean {
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom
}

export function createViewHistory(viewport: CanvasViewport): ViewHistory {
  return { past: [], present: { ...viewport }, future: [] }
}

export function commitView(
  history: ViewHistory,
  viewport: CanvasViewport,
): ViewHistory {
  if (sameViewport(history.present, viewport)) return history
  return {
    past: [...history.past, history.present].slice(-VIEW_HISTORY_LIMIT),
    present: viewport,
    future: [],
  }
}

export function undoView(history: ViewHistory): ViewHistory {
  const previous = history.past.at(-1)
  if (!previous) return history
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  }
}

export function redoView(history: ViewHistory): ViewHistory {
  const next = history.future[0]
  if (!next) return history
  return {
    past: [...history.past, history.present].slice(-VIEW_HISTORY_LIMIT),
    present: next,
    future: history.future.slice(1),
  }
}

export function zoomAt(
  viewport: CanvasViewport,
  requestedZoom: number,
  anchor: { x: number; y: number },
): CanvasViewport {
  if (
    !Number.isFinite(requestedZoom) ||
    !Number.isFinite(anchor.x) ||
    !Number.isFinite(anchor.y)
  )
    return viewport
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, requestedZoom))
  if (viewport.zoom === zoom) return viewport
  const ratio = zoom / viewport.zoom
  return {
    x: Math.min(
      1_000_000,
      Math.max(-1_000_000, anchor.x - (anchor.x - viewport.x) * ratio),
    ),
    y: Math.min(
      1_000_000,
      Math.max(-1_000_000, anchor.y - (anchor.y - viewport.y) * ratio),
    ),
    zoom,
  }
}

export function panBy(
  viewport: CanvasViewport,
  deltaX: number,
  deltaY: number,
): CanvasViewport {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return viewport
  // Keep view coordinates inside the same finite domain as imported documents.
  const x = Math.min(1_000_000, Math.max(-1_000_000, viewport.x + deltaX))
  const y = Math.min(1_000_000, Math.max(-1_000_000, viewport.y + deltaY))
  return { ...viewport, x, y }
}

export function fitView(
  elements: CanvasElement[],
  width: number,
  height: number,
  padding = 48,
): CanvasViewport {
  if (
    elements.length === 0 ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    return { x: 0, y: 0, zoom: 1 }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const element of elements) {
    // Connections follow their bound objects, whose bounds already cover the view.
    if (element.type === 'connection') continue
    const right =
      element.type === 'line' ? element.x2 : element.x + element.width
    const bottom =
      element.type === 'line' ? element.y2 : element.y + element.height
    minX = Math.min(minX, element.x, right)
    minY = Math.min(minY, element.y, bottom)
    maxX = Math.max(maxX, element.x, right)
    maxY = Math.max(maxY, element.y, bottom)
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, zoom: 1 }
  const zoom = Math.min(
    MAX_ZOOM,
    Math.max(
      MIN_ZOOM,
      Math.min(
        Math.max(1, width - padding * 2) / Math.max(1, maxX - minX),
        Math.max(1, height - padding * 2) / Math.max(1, maxY - minY),
      ),
    ),
  )
  return {
    x: Math.min(
      1_000_000,
      Math.max(-1_000_000, width / 2 - ((minX + maxX) / 2) * zoom),
    ),
    y: Math.min(
      1_000_000,
      Math.max(-1_000_000, height / 2 - ((minY + maxY) / 2) * zoom),
    ),
    zoom,
  }
}
