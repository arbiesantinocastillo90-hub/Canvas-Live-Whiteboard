import type { ElementBounds } from './lcanvas'

export type ObjectSnapTarget = {
  id: string
  bounds: ElementBounds
  visible?: boolean
  locked?: boolean
}
export type ObjectSnapOptions = {
  enabled: boolean
  zoom: number
  thresholdPx?: number
  excludeIds?: readonly string[]
}
export type ObjectSnapGuide = {
  axis: 'x' | 'y'
  coordinate: number
  targetId: string
}
export type ObjectSnapResult = {
  x: number
  y: number
  guides: ObjectSnapGuide[]
}

function validBounds(bounds: ElementBounds) {
  return (
    [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) &&
    bounds.width >= 0 &&
    bounds.height >= 0
  )
}

function anchors(bounds: ElementBounds, axis: 'x' | 'y') {
  const start = bounds[axis]
  const size = axis === 'x' ? bounds.width : bounds.height
  return [start, start + size / 2, start + size]
}

function eligibleTargets(
  targets: readonly ObjectSnapTarget[],
  options: ObjectSnapOptions,
) {
  const excluded = new Set(options.excludeIds)
  return targets
    .filter(
      (target) =>
        target.visible !== false &&
        target.locked !== true &&
        !excluded.has(target.id) &&
        validBounds(target.bounds),
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function nearest(
  values: number[],
  targets: ObjectSnapTarget[],
  axis: 'x' | 'y',
  threshold: number,
) {
  let winner: { correction: number; guide: ObjectSnapGuide } | null = null
  let distance = Infinity
  for (const target of targets) {
    for (const coordinate of anchors(target.bounds, axis)) {
      for (const value of values) {
        const correction = coordinate - value
        const nextDistance = Math.abs(correction)
        // Strict comparison preserves the stable target/edge order on ties.
        if (nextDistance <= threshold && nextDistance < distance) {
          winner = {
            correction,
            guide: { axis, coordinate, targetId: target.id },
          }
          distance = nextDistance
        }
      }
    }
  }
  return winner
}

function threshold(options: ObjectSnapOptions) {
  if (!Number.isFinite(options.zoom) || options.zoom <= 0) return 0
  const pixels = options.thresholdPx ?? 8
  return Number.isFinite(pixels)
    ? Math.max(0, Math.min(32, pixels)) / options.zoom
    : 8 / options.zoom
}

/** Snap a single selection box; every grouped member keeps the same delta. */
export function snapMoveToObjects(
  bounds: ElementBounds,
  dx: number,
  dy: number,
  targets: readonly ObjectSnapTarget[],
  options: ObjectSnapOptions,
): ObjectSnapResult {
  const result: ObjectSnapResult = { x: dx, y: dy, guides: [] }
  if (
    !options.enabled ||
    !validBounds(bounds) ||
    ![dx, dy, options.zoom].every(Number.isFinite) ||
    options.zoom <= 0
  )
    return result
  const eligible = eligibleTargets(targets, options)
  const moved = { ...bounds, x: bounds.x + dx, y: bounds.y + dy }
  const tolerance = threshold(options)
  for (const axis of ['x', 'y'] as const) {
    const snap = nearest(anchors(moved, axis), eligible, axis, tolerance)
    if (snap) {
      result[axis] += snap.correction
      result.guides.push(snap.guide)
    }
  }
  return result
}

/** Snap only dragged edges, so the opposite resize edge remains anchored. */
export function snapResizeToObjects(
  bounds: ElementBounds,
  handle: string,
  dx: number,
  dy: number,
  targets: readonly ObjectSnapTarget[],
  options: ObjectSnapOptions,
): ObjectSnapResult {
  const result: ObjectSnapResult = { x: dx, y: dy, guides: [] }
  if (
    !options.enabled ||
    !validBounds(bounds) ||
    ![dx, dy, options.zoom].every(Number.isFinite) ||
    options.zoom <= 0
  )
    return result
  const eligible = eligibleTargets(targets, options)
  const tolerance = threshold(options)
  const dragged = {
    x: handle.includes('w')
      ? bounds.x + dx
      : handle.includes('e')
        ? bounds.x + bounds.width + dx
        : null,
    y: handle.includes('n')
      ? bounds.y + dy
      : handle.includes('s')
        ? bounds.y + bounds.height + dy
        : null,
  }
  for (const axis of ['x', 'y'] as const) {
    const edge = dragged[axis]
    if (edge === null) continue
    const snap = nearest([edge], eligible, axis, tolerance)
    if (snap) {
      result[axis] += snap.correction
      result.guides.push(snap.guide)
    }
  }
  return result
}
