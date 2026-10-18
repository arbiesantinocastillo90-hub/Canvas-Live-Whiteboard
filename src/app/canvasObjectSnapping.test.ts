import { describe, expect, it } from 'vitest'
import {
  snapMoveToObjects,
  snapResizeToObjects,
  type ObjectSnapTarget,
} from './canvasObjectSnapping'

const box = { x: 10, y: 20, width: 100, height: 60 }
const options = { enabled: true, zoom: 1 }
const target: ObjectSnapTarget = {
  id: 'target',
  bounds: { x: 180, y: 140, width: 80, height: 60 },
}

describe('object snapping', () => {
  it('aligns a moved selection edge on each axis with one shared group delta', () => {
    const result = snapMoveToObjects(box, 64, 55, [target], options)
    expect(result).toEqual({
      x: 70,
      y: 60,
      guides: [
        { axis: 'x', coordinate: 180, targetId: 'target' },
        { axis: 'y', coordinate: 140, targetId: 'target' },
      ],
    })
    expect(box.x + box.width + result.x).toBe(target.bounds.x)
    // The same returned delta applies to every member; no per-object rounding.
    expect(37.25 + result.x - (box.x + result.x)).toBe(27.25)
  })

  it('uses the same screen-distance tolerance at different zoom levels', () => {
    const near = {
      id: 'near',
      bounds: { x: 200, y: 300, width: 60, height: 60 },
    }
    expect(
      snapMoveToObjects(box, 75, 0, [near], { ...options, zoom: 0.5 }).x,
    ).toBe(90)
    expect(
      snapMoveToObjects(box, 85, 0, [near], { ...options, zoom: 2 }).x,
    ).toBe(85)
    expect(
      snapMoveToObjects(box, 86, 0, [near], { ...options, zoom: 2 }).x,
    ).toBe(90)
  })

  it('aligns centers and resolves equal distances independently of target order', () => {
    const a = { id: 'a', bounds: { x: 53, y: 1000, width: 0, height: 0 } }
    const z = { id: 'z', bounds: { x: 67, y: 1000, width: 0, height: 0 } }
    const first = snapMoveToObjects(box, 0, 0, [z, a], options)
    const second = snapMoveToObjects(box, 0, 0, [a, z], options)
    expect(first).toEqual(second)
    expect(first.x).toBe(-7)
    expect(first.guides[0]).toMatchObject({ targetId: 'a', coordinate: 53 })
  })

  it('excludes moving selections, hidden and locked targets and malformed geometry', () => {
    const targets: ObjectSnapTarget[] = [
      { ...target, id: 'moving' },
      { ...target, id: 'hidden', visible: false },
      { ...target, id: 'locked', locked: true },
      { id: 'bad', bounds: { ...target.bounds, x: Infinity } },
    ]
    expect(
      snapMoveToObjects(box, 64, 55, targets, {
        ...options,
        excludeIds: ['moving'],
      }),
    ).toEqual({ x: 64, y: 55, guides: [] })
  })

  it('leaves movement unchanged when disabled, out of range or zoom is invalid', () => {
    for (const option of [
      { ...options, enabled: false },
      { ...options, zoom: 0 },
      { ...options, zoom: NaN },
    ]) {
      expect(snapMoveToObjects(box, 64, 55, [target], option)).toEqual({
        x: 64,
        y: 55,
        guides: [],
      })
    }
    expect(snapMoveToObjects(box, 50, 40, [target], options)).toEqual({
      x: 50,
      y: 40,
      guides: [],
    })
  })

  it('snaps only the dragged resize edges and retains anchored opposite edges', () => {
    expect(
      snapResizeToObjects(box, 'se', 64, 55, [target], options),
    ).toMatchObject({ x: 70, y: 60 })
    const west = { id: 'west', bounds: { x: -40, y: -20, width: 0, height: 0 } }
    expect(
      snapResizeToObjects(box, 'nw', -45, -36, [west], options),
    ).toMatchObject({ x: -50, y: -40 })
    const eastOnly = snapResizeToObjects(box, 'e', 64, 55, [target], options)
    expect(eastOnly).toEqual({
      x: 70,
      y: 55,
      guides: [{ axis: 'x', coordinate: 180, targetId: 'target' }],
    })
    expect(
      snapResizeToObjects(box, 'se', 64, 55, [target], {
        ...options,
        enabled: false,
      }),
    ).toEqual({ x: 64, y: 55, guides: [] })
  })
})
