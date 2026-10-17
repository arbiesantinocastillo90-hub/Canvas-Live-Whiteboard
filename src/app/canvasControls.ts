import type { CanvasViewport, ElementBounds } from './lcanvas'

export type CanvasControlSettings = {
  snapToGrid: boolean
  gridSpacing: number
  rulers: boolean
  rulerUnit: 'px' | 'mm' | 'cm' | 'in'
  zoomUnit: 'percent' | 'multiplier' | 'ratio'
  selectionFill: string
  selectionOpacity: number
  selectionStroke: string
  selectionStrokeWidth: number
  selectionDashed: boolean
  selectionBehavior: 'contain' | 'intersect'
}

export const DEFAULT_CANVAS_CONTROLS: CanvasControlSettings = {
  snapToGrid: false,
  gridSpacing: 24,
  rulers: false,
  rulerUnit: 'px',
  zoomUnit: 'percent',
  selectionFill: 'theme',
  selectionOpacity: 0.1,
  selectionStroke: 'theme',
  selectionStrokeWidth: 1.5,
  selectionDashed: false,
  selectionBehavior: 'contain',
}

function bounded(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback
}

function color(value: unknown) {
  return typeof value === 'string' && /^#[\da-f]{6}$/iu.test(value)
    ? value.toLowerCase()
    : 'theme'
}

/** Keep imported workspace settings bounded without changing old documents. */
export function normalizeCanvasControls(value: unknown): CanvasControlSettings {
  const candidate =
    value && typeof value === 'object'
      ? (value as Partial<CanvasControlSettings>)
      : {}
  return {
    snapToGrid: candidate.snapToGrid === true,
    gridSpacing: bounded(candidate.gridSpacing, 24, 2, 1000),
    rulers: candidate.rulers === true,
    rulerUnit: ['px', 'mm', 'cm', 'in'].includes(candidate.rulerUnit ?? '')
      ? candidate.rulerUnit!
      : 'px',
    zoomUnit: ['percent', 'multiplier', 'ratio'].includes(
      candidate.zoomUnit ?? '',
    )
      ? candidate.zoomUnit!
      : 'percent',
    selectionFill: color(candidate.selectionFill),
    selectionOpacity: bounded(candidate.selectionOpacity, 0.1, 0, 0.5),
    selectionStroke: color(candidate.selectionStroke),
    selectionStrokeWidth: bounded(candidate.selectionStrokeWidth, 1.5, 0.5, 6),
    selectionDashed: candidate.selectionDashed === true,
    selectionBehavior:
      candidate.selectionBehavior === 'intersect' ? 'intersect' : 'contain',
  }
}

export function selectionColor(value: string) {
  return value === 'theme' ? 'var(--accent)' : value
}

export function snapCoordinate(value: number, spacing: number) {
  const size = bounded(spacing, 24, 2, 1000)
  // Avoid negative zero in documents, labels and URL view state.
  return Math.round(value / size) * size || 0
}

/** Snap one group anchor, retaining every member's exact relative position. */
export function snapSelectionDelta(
  bounds: ElementBounds,
  dx: number,
  dy: number,
  spacing: number,
) {
  return {
    x: snapCoordinate(bounds.x + dx, spacing) - bounds.x,
    y: snapCoordinate(bounds.y + dy, spacing) - bounds.y,
  }
}

/** Snap only the edges being dragged; opposite edges stay anchored. */
export function snapResizeDelta(
  bounds: ElementBounds,
  handle: string,
  dx: number,
  dy: number,
  spacing: number,
) {
  return {
    x: handle.includes('w')
      ? snapCoordinate(bounds.x + dx, spacing) - bounds.x
      : handle.includes('e')
        ? snapCoordinate(bounds.x + bounds.width + dx, spacing) -
          bounds.x -
          bounds.width
        : dx,
    y: handle.includes('n')
      ? snapCoordinate(bounds.y + dy, spacing) - bounds.y
      : handle.includes('s')
        ? snapCoordinate(bounds.y + bounds.height + dy, spacing) -
          bounds.y -
          bounds.height
        : dy,
  }
}

export function isWithinSelection(
  object: ElementBounds,
  selection: ElementBounds,
  behavior: CanvasControlSettings['selectionBehavior'],
) {
  if (behavior === 'intersect')
    return (
      object.x <= selection.x + selection.width &&
      object.x + object.width >= selection.x &&
      object.y <= selection.y + selection.height &&
      object.y + object.height >= selection.y
    )
  return (
    object.x >= selection.x &&
    object.y >= selection.y &&
    object.x + object.width <= selection.x + selection.width &&
    object.y + object.height <= selection.y + selection.height
  )
}

function displayNumber(value: number, precision = 3) {
  return String(Number(value.toFixed(precision)))
}

export function formatCanvasZoom(
  zoom: number,
  options: Pick<CanvasControlSettings, 'zoomUnit'> = DEFAULT_CANVAS_CONTROLS,
) {
  const safe = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  if (options.zoomUnit === 'multiplier') return `${displayNumber(safe)}×`
  if (options.zoomUnit === 'ratio')
    return safe >= 1
      ? `${displayNumber(safe)}:1`
      : `1:${displayNumber(1 / safe)}`
  return `${Math.round(safe * 100)}%`
}

export const RULER_PIXELS_PER_UNIT = {
  px: 1,
  mm: 96 / 25.4,
  cm: 96 / 2.54,
  in: 96,
}
export const RULER_UNIT_NAMES = {
  px: 'pixels',
  mm: 'millimeters',
  cm: 'centimeters',
  in: 'inches',
}
export type RulerTick = {
  position: number
  value: number
  major: boolean
  label: string
}

/** Adaptive bounded ticks in document coordinates, including a panned negative origin. */
export function buildRulerTicks(
  length: number,
  offset: number,
  zoom: number,
  unit: CanvasControlSettings['rulerUnit'],
): RulerTick[] {
  if (
    ![length, offset, zoom].every(Number.isFinite) ||
    length <= 0 ||
    zoom <= 0
  )
    return []
  const visibleLength = Math.min(length, 32768)
  const pixelsPerUnit = RULER_PIXELS_PER_UNIT[unit] ?? 1
  const desiredUnits = Math.max(72, visibleLength / 44) / (pixelsPerUnit * zoom)
  if (!Number.isFinite(desiredUnits) || desiredUnits <= 0) return []
  const power = 10 ** Math.floor(Math.log10(desiredUnits))
  const majorStep =
    ([1, 2, 5, 10].find((step) => step * power >= desiredUnits) ?? 10) * power
  const minorStep = majorStep / 5
  const first = Math.ceil(-offset / zoom / pixelsPerUnit / minorStep)
  if (
    !Number.isSafeInteger(first) ||
    !Number.isFinite(minorStep) ||
    minorStep <= 0
  )
    return []
  const ticks: RulerTick[] = []
  for (let index = first; ticks.length < 256; index++) {
    const value = index * minorStep
    const position = value * pixelsPerUnit * zoom + offset
    if (!Number.isFinite(position)) break
    if (position > visibleLength + 0.01) break
    const major = index % 5 === 0
    ticks.push({
      position,
      value: value || 0,
      major,
      label: major ? displayNumber(value, 6) : '',
    })
  }
  return ticks
}

export function rulerTicksForViewport(
  viewport: CanvasViewport,
  width: number,
  height: number,
  unit: CanvasControlSettings['rulerUnit'],
) {
  return {
    horizontal: buildRulerTicks(width, viewport.x, viewport.zoom, unit),
    vertical: buildRulerTicks(height, viewport.y, viewport.zoom, unit),
  }
}
