import { describe, expect, it } from 'vitest'
import type { CanvasElement } from './lcanvas'
import {
  commitView,
  createViewHistory,
  fitView,
  panBy,
  redoView,
  sameViewport,
  undoView,
  VIEW_HISTORY_LIMIT,
  zoomAt,
} from './canvasViewport'

describe('canvas view navigation', () => {
  it('keeps the same world point under the cursor when zooming', () => {
    const start = { x: -70, y: 40, zoom: 0.75 }
    const anchor = { x: 220, y: 180 }
    const next = zoomAt(start, 1.8, anchor)
    expect((anchor.x - next.x) / next.zoom).toBeCloseTo(
      (anchor.x - start.x) / start.zoom,
    )
    expect((anchor.y - next.y) / next.zoom).toBeCloseTo(
      (anchor.y - start.y) / start.zoom,
    )
  })

  it('bounds zoom and translation and rejects non-finite input', () => {
    const start = { x: 1_000_000, y: -1_000_000, zoom: 0.1 }
    expect(zoomAt(start, 100, { x: 0, y: 0 })).toEqual({
      x: 1_000_000,
      y: -1_000_000,
      zoom: 4,
    })
    expect(zoomAt(start, -10, { x: 0, y: 0 })).toBe(start)
    expect(zoomAt(start, NaN, { x: 0, y: 0 })).toBe(start)
    expect(zoomAt(start, 2, { x: Infinity, y: 0 })).toBe(start)
    expect(panBy(start, Infinity, 0)).toBe(start)
    expect(panBy(start, 10_000, -10_000)).toEqual(start)
  })

  it('fits positive and negative geometry, including reverse lines', () => {
    const elements: CanvasElement[] = [
      {
        id: 'box',
        type: 'rectangle',
        x: -100,
        y: -50,
        width: 100,
        height: 100,
        color: '#000000',
        fill: null,
        text: '',
        fontSize: 20,
        layerId: 'layer-main',
        areaId: null,
      },
      {
        id: 'line',
        type: 'line',
        x: 200,
        y: 150,
        x2: 0,
        y2: 10,
        color: '#000000',
        layerId: 'layer-main',
        areaId: null,
      },
    ]
    const view = fitView(elements, 400, 300, 20)
    expect(view.zoom).toBe(1.2)
    expect(view.x).toBe(140)
    expect(view.y).toBe(90)
    expect(-100 * view.zoom + view.x).toBeGreaterThanOrEqual(20)
    expect(200 * view.zoom + view.x).toBeLessThanOrEqual(380)
    expect(fitView([], 400, 300)).toEqual({ x: 0, y: 0, zoom: 1 })
    expect(fitView(elements, 0, 300)).toEqual({ x: 0, y: 0, zoom: 1 })
  })

  it('bounds fit for extreme geometry and small stage sizes', () => {
    const elements: CanvasElement[] = [
      {
        id: 'ellipse',
        type: 'ellipse',
        x: -1_000_000,
        y: -1_000_000,
        width: 1_000_000,
        height: 1_000_000,
        color: '#000000',
        fill: null,
        text: '',
        fontSize: 20,
        layerId: 'layer-main',
        areaId: null,
      },
    ]
    expect(fitView(elements, 20, 20).zoom).toBe(0.1)
    const one: CanvasElement[] = [
      {
        id: 'tiny',
        type: 'line',
        x: 1_000_000,
        y: 1_000_000,
        x2: 1_000_000,
        y2: 1_000_000,
        color: '#000000',
        layerId: 'layer-main',
        areaId: null,
      },
    ]
    expect(fitView(one, 1_000, 1_000)).toEqual({
      x: -1_000_000,
      y: -1_000_000,
      zoom: 4,
    })
  })

  it('makes undo and redo reversible and drops redo after a new action', () => {
    const start = createViewHistory({ x: 0, y: 0, zoom: 1 })
    expect(undoView(start)).toBe(start)
    expect(redoView(start)).toBe(start)
    const moved = commitView(start, { x: 40, y: -30, zoom: 1 })
    const zoomed = commitView(moved, { x: 40, y: -30, zoom: 2 })
    const undone = undoView(zoomed)
    expect(undone.present).toEqual(moved.present)
    expect(redoView(undone)).toEqual(zoomed)
    expect(commitView(undone, { x: 0, y: 0, zoom: 1 }).future).toEqual([])
    expect(commitView(zoomed, { ...zoomed.present })).toBe(zoomed)
    expect(sameViewport(start.present, moved.present)).toBe(false)
  })

  it('limits retained history to the last 100 navigation actions', () => {
    let history = createViewHistory({ x: 0, y: 0, zoom: 1 })
    for (let x = 1; x <= 140; x++)
      history = commitView(history, { x, y: 0, zoom: 1 })
    expect(history.past).toHaveLength(VIEW_HISTORY_LIMIT)
    for (let index = 0; index < VIEW_HISTORY_LIMIT; index++)
      history = undoView(history)
    expect(history.present.x).toBe(40)
    expect(undoView(history)).toBe(history)
  })
})
