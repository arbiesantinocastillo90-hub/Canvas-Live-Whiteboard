import { describe, expect, it } from 'vitest'
import { createElement, updateElement } from './canvasOperations'
import { createCanvasDocument, type CanvasDocument } from './lcanvas'
import {
  createCanvasAiPresence,
  resolveCanvasAiObjectTargets,
  visibleCanvasAiTargets,
} from './canvasAiPresenceState'

function board() {
  return createElement(createCanvasDocument('Presence'), {
    id: 'shape',
    type: 'rectangle',
    x: 100,
    y: 80,
    width: 140,
    height: 60,
  })
}
function event(before: CanvasDocument, after = before, targetIds = ['shape']) {
  return createCanvasAiPresence({
    id: 'action-1',
    kind: 'edit',
    phase: 'complete',
    at: 1000,
    scope: 'canvas-1',
    before,
    after,
    targetIds,
  })
}

describe('observed AI target geometry', () => {
  it('captures moved target geometry and its previous location without content', () => {
    const before = board()
    const after = updateElement(before, 'shape', { x: 300, y: 200 })
    expect(event(before, after)).toMatchObject({
      targets: [
        {
          id: 'shape',
          bounds: { x: 300, y: 200, width: 140, height: 60 },
          previousBounds: { x: 100, y: 80, width: 140, height: 60 },
        },
      ],
    })
    expect(event(before, after).targets[0]).not.toHaveProperty('text')
    expect(event(before).targets[0]).not.toHaveProperty('previousBounds')
  })
  it('uses element geometry for reversed lines and minimized embeds', () => {
    let document = createElement(board(), {
      id: 'line',
      type: 'line',
      x: 200,
      y: 160,
      x2: 50,
      y2: 30,
    })
    document = createElement(document, {
      id: 'media',
      type: 'embed',
      x: 10,
      y: 20,
      width: 400,
      height: 250,
      kind: 'web',
      src: 'https://example.com',
      minimized: true,
    })
    expect(
      event(document, document, ['line', 'media']).targets.map(
        (item) => item.bounds,
      ),
    ).toEqual([
      { x: 50, y: 30, width: 150, height: 130 },
      { x: 10, y: 20, width: 400, height: 38 },
    ])
  })
  it('resolves explicit layer edits to members, deduplicates, and caps geometry at 32 objects', () => {
    const document = board()
    document.elements = Array.from({ length: 60 }, (_, index) => ({
      ...document.elements[0],
      id: `shape-${index}`,
    }))
    const changed = {
      ...document,
      layers: document.layers.map((layer) => ({ ...layer, name: 'Renamed' })),
    }
    const ids = resolveCanvasAiObjectTargets(
      document,
      changed,
      [document.layers[0].id],
      {
        kind: 'update_layer',
        id: document.layers[0].id,
        patch: { name: 'Renamed' },
      },
    )
    const observed = event(document, changed, [...ids, 'shape-0', 'missing'])
    expect(observed.targets).toHaveLength(32)
    expect(new Set(observed.targets.map((item) => item.id)).size).toBe(32)
    expect(observed.targets[31].id).toBe('shape-31')
  })
  it('keeps object and layer identifiers distinct for reads, edits, layer commands, and history', () => {
    let document = board()
    const layerId = document.layers[0].id
    document.layers.push({
      id: 'other',
      name: 'Other',
      visible: true,
      locked: false,
    })
    document = createElement(document, {
      id: layerId,
      type: 'rectangle',
      x: 400,
      y: 200,
      width: 100,
      height: 100,
      layerId: 'other',
    })
    expect(resolveCanvasAiObjectTargets(document, document, [layerId])).toEqual(
      [layerId],
    )
    expect(
      event(document, document, [layerId]).targets.map((target) => target.id),
    ).toEqual([layerId])
    expect(event(document, document, ['other']).targets).toEqual([])

    const moved = updateElement(document, layerId, { x: 500 })
    expect(
      resolveCanvasAiObjectTargets(document, moved, [layerId], {
        kind: 'move',
        id: layerId,
        x: 500,
        y: 200,
      }),
    ).toEqual([layerId])
    expect(
      resolveCanvasAiObjectTargets(moved, document, [layerId], {
        kind: 'undo',
      }),
    ).toEqual([layerId])

    const renamed = {
      ...document,
      layers: document.layers.map((layer) =>
        layer.id === layerId ? { ...layer, name: 'Renamed' } : layer,
      ),
    }
    expect(
      resolveCanvasAiObjectTargets(document, renamed, [layerId], {
        kind: 'update_layer',
        id: layerId,
        patch: { name: 'Renamed' },
      }),
    ).toEqual(['shape'])
    expect(
      resolveCanvasAiObjectTargets(renamed, document, [layerId], {
        kind: 'undo',
      }),
    ).toEqual(['shape'])
    expect(
      resolveCanvasAiObjectTargets(document, renamed, [layerId], {
        kind: 'redo',
      }),
    ).toEqual(['shape'])

    const both = { ...moved, layers: renamed.layers }
    expect(
      resolveCanvasAiObjectTargets(document, both, [layerId], {
        kind: 'batch',
        operations: [
          { kind: 'update_layer', id: layerId, patch: { name: 'Renamed' } },
          { kind: 'move', id: layerId, x: 500, y: 200 },
        ],
      }),
    ).toEqual(['shape', layerId])
  })
  it('excludes hidden layers, hidden area members, and their hidden connections', () => {
    const visible = board()
    const hidden = {
      ...visible,
      layers: visible.layers.map((layer) => ({ ...layer, visible: false })),
    }
    expect(event(hidden).targets).toEqual([])
    expect(event(visible, hidden).targets).toEqual([])
    const area = createElement(visible, {
      id: 'area',
      type: 'area',
      x: 0,
      y: 0,
      width: 1000,
      height: 1000,
    })
    area.layers.push({
      id: 'hidden',
      name: 'Hidden',
      visible: false,
      locked: false,
    })
    area.elements = area.elements.map((item) =>
      item.type === 'area'
        ? { ...item, layerId: 'hidden' }
        : { ...item, areaId: 'area' },
    )
    expect(event(area, area, ['area', 'shape']).targets).toEqual([])
  })
  it('retains deleted geometry only for an acknowledged edit that actually removed it', () => {
    const before = board()
    const after = { ...before, elements: [] }
    expect(event(before, after).targets).toEqual([
      {
        id: 'shape',
        bounds: { x: 100, y: 80, width: 140, height: 60 },
        removed: true,
      },
    ])
    expect(
      createCanvasAiPresence({
        ...event(before),
        kind: 'read',
        before,
        after,
        targetIds: ['shape'],
      }).targets,
    ).toEqual([])
    expect(
      createCanvasAiPresence({
        ...event(before),
        phase: 'working',
        before,
        after,
        targetIds: ['shape'],
      }).targets,
    ).toEqual([])
    expect(event(before, after, ['missing']).targets).toEqual([])
  })
  it('updates live bounds and removes ghosts after unrelated manual hide/delete', () => {
    const document = board()
    const observed = event(document)
    const moved = updateElement(document, 'shape', { x: 900 })
    expect(visibleCanvasAiTargets(observed, moved)[0].bounds.x).toBe(900)
    expect(
      visibleCanvasAiTargets(observed, { ...document, elements: [] }),
    ).toEqual([])
    const hidden = {
      ...document,
      layers: document.layers.map((layer) => ({ ...layer, visible: false })),
    }
    expect(visibleCanvasAiTargets(observed, hidden)).toEqual([])
    const removed = event(document, { ...document, elements: [] })
    expect(
      visibleCanvasAiTargets(removed, { ...document, elements: [] })[0].removed,
    ).toBe(true)
    expect(visibleCanvasAiTargets(removed, document)[0].removed).toBe(false)
  })
  it('copies snapshots and never mutates source documents', () => {
    const document = board()
    const original = JSON.stringify(document)
    const observed = event(document)
    observed.targets[0].bounds.x = 555
    expect(JSON.stringify(document)).toBe(original)
    expect(event(document).targets[0].bounds.x).toBe(100)
  })
  it('ignores invalid geometry rather than rendering nonfinite screen positions', () => {
    const document = board()
    document.elements[0] = {
      ...document.elements[0],
      x: Number.NaN,
    } as (typeof document.elements)[number]
    expect(event(document).targets).toEqual([])
  })
})
