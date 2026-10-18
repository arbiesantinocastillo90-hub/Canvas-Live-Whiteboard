import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CANVAS_CONTROLS,
  buildRulerTicks,
  formatCanvasZoom,
  isWithinSelection,
  normalizeCanvasControls,
  rulerTicksForViewport,
  selectionColor,
  snapCoordinate,
  snapResizeDelta,
  snapSelectionDelta,
} from './canvasControls'

describe('canvas precision settings', () => {
  it('keeps old workspaces compatible and bounds imported settings', () => {
    expect(normalizeCanvasControls(null)).toEqual(DEFAULT_CANVAS_CONTROLS)
    expect(
      normalizeCanvasControls({
        gridSpacing: -50,
        selectionOpacity: 9,
        selectionStrokeWidth: Infinity,
        rulerUnit: 'script',
        zoomUnit: 'script',
        selectionFill: 'url(javascript:alert(1))',
        selectionStroke: '#ABCDEF',
        selectionBehavior: 'intersect',
        snapToGrid: 'yes',
      }),
    ).toEqual({
      ...DEFAULT_CANVAS_CONTROLS,
      gridSpacing: 2,
      selectionOpacity: 0.5,
      selectionStroke: '#abcdef',
      selectionBehavior: 'intersect',
    })
    expect(selectionColor('theme')).toBe('var(--accent)')
  })

  it('snaps negative coordinates and moves one anchor without distorting a group', () => {
    expect(snapCoordinate(-14, 24)).toBe(-24)
    expect(Object.is(snapCoordinate(-2, 24), -0)).toBe(false)
    const delta = snapSelectionDelta(
      { x: -35, y: 11, width: 97, height: 45 },
      8,
      15,
      24,
    )
    expect(delta).toEqual({ x: 11, y: 13 })
    expect(-35 + delta.x).toBe(-24)
    expect(11 + delta.y).toBe(24)
    expect(
      snapResizeDelta(
        { x: 10, y: 20, width: 140, height: 100 },
        'se',
        13,
        13,
        24,
      ),
    ).toEqual({ x: 18, y: 24 })
    expect(
      snapResizeDelta(
        { x: 10, y: 20, width: 140, height: 100 },
        'nw',
        -13,
        -13,
        24,
      ),
    ).toEqual({ x: -10, y: -20 })
  })

  it('distinguishes fully contained and touched objects including negative coordinates', () => {
    const selection = { x: -20, y: -20, width: 100, height: 100 }
    const clipped = { x: 70, y: 10, width: 50, height: 10 }
    expect(isWithinSelection(clipped, selection, 'contain')).toBe(false)
    expect(isWithinSelection(clipped, selection, 'intersect')).toBe(true)
    expect(
      isWithinSelection(
        { x: 81, y: 10, width: 50, height: 10 },
        selection,
        'intersect',
      ),
    ).toBe(false)
    expect(isWithinSelection(selection, selection, 'contain')).toBe(true)
  })

  it('formats zoom as percent, multiplier or ratio without changing camera scale', () => {
    expect(formatCanvasZoom(0.625)).toBe('63%')
    expect(formatCanvasZoom(0.625, { zoomUnit: 'multiplier' })).toBe('0.625×')
    expect(formatCanvasZoom(0.25, { zoomUnit: 'ratio' })).toBe('1:4')
    expect(formatCanvasZoom(2, { zoomUnit: 'ratio' })).toBe('2:1')
    expect(formatCanvasZoom(NaN, { zoomUnit: 'ratio' })).toBe('1:1')
  })
})

describe('adaptive document rulers', () => {
  it('keeps ticks attached to the document during pan and zoom', () => {
    for (const unit of ['px', 'mm', 'cm', 'in'] as const) {
      const before = buildRulerTicks(800, 100, 1, unit)
      const after = buildRulerTicks(800, 120, 1, unit)
      const tick = before.find((candidate) => candidate.value === 0)!
      expect(tick.position).toBe(100)
      expect(after.find((candidate) => candidate.value === 0)?.position).toBe(
        120,
      )
    }
    expect(
      buildRulerTicks(800, 500, 1, 'px').some((tick) => tick.value < 0),
    ).toBe(true)
    const inches = buildRulerTicks(800, 0, 1, 'in')
    expect(inches.find((tick) => tick.value === 1)?.position).toBe(96)
    const mm = buildRulerTicks(800, 0, 2, 'mm')
    expect(mm.find((tick) => tick.value === 10)?.position).toBeCloseTo(
      (96 / 25.4) * 20,
    )
  })

  it('bounds tick generation and excludes nonfinite output', () => {
    for (const zoom of [
      0,
      -1,
      NaN,
      Infinity,
      Number.MIN_VALUE,
      0.1,
      1,
      100,
      1e100,
    ]) {
      const ticks = buildRulerTicks(1e8, -1000, zoom, 'cm')
      expect(ticks.length).toBeLessThanOrEqual(256)
      expect(
        ticks.every(
          (tick) =>
            Number.isFinite(tick.value) && Number.isFinite(tick.position),
        ),
      ).toBe(true)
    }
    expect(buildRulerTicks(1000, 1e300, 1, 'px')).toEqual([])
    expect(
      rulerTicksForViewport(
        { x: 100, y: 200, zoom: 1 },
        600,
        400,
        'px',
      ).vertical.find((tick) => tick.value === 0)?.position,
    ).toBe(200)
  })
})
