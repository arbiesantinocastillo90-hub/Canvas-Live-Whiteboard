import { describe, expect, it } from 'vitest'
import { addLayer, assignElementLayer, updateLayer } from './canvasOperations'
import {
  moveSelection,
  removeSelection,
  resizeSelection,
  selectionBounds,
  selectionIds,
} from './canvasSelection'
import {
  commitEditorHistory,
  createEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
} from './editorHistory'
import {
  connectionEndpoints,
  createCanvasDocument,
  serializeLCANVAS,
  validateCanvasDocument,
  type CanvasDocument,
} from './lcanvas'

function board(): CanvasDocument {
  const base = { color: '#7C5CFC', layerId: 'layer-main', areaId: null }
  const shape = {
    ...base,
    type: 'rectangle',
    fill: null,
    text: '',
    fontSize: 20,
    width: 100,
    height: 80,
  }
  return validateCanvasDocument({
    ...createCanvasDocument('Selection'),
    elements: [
      { ...shape, id: 'one', x: 20, y: 40, areaId: 'area' },
      { ...shape, id: 'two', x: 220, y: 40, areaId: 'area' },
      {
        ...base,
        id: 'area',
        type: 'area',
        name: 'Group',
        fill: null,
        x: 0,
        y: 0,
        width: 400,
        height: 240,
      },
      {
        ...base,
        id: 'line',
        type: 'line',
        areaId: 'area',
        x: 30,
        y: 180,
        x2: 300,
        y2: 150,
      },
      {
        ...base,
        id: 'edge',
        type: 'connection',
        areaId: 'area',
        fromId: 'one',
        toId: 'two',
        style: 'elbow',
        startArrow: false,
        endArrow: true,
      },
      { ...shape, id: 'outside', x: 600, y: 40 },
      {
        ...base,
        id: 'external-edge',
        type: 'connection',
        fromId: 'two',
        toId: 'outside',
        style: 'straight',
        startArrow: true,
        endArrow: false,
      },
    ],
  })
}

describe('atomic canvas selections', () => {
  it('expands areas and internal links once while retaining document order', () => {
    expect(selectionIds(board(), ['area', 'one', 'area', 'missing'])).toEqual([
      'one',
      'two',
      'area',
      'line',
      'edge',
    ])
    expect(selectionIds(board(), ['one', 'two'])).toEqual([
      'one',
      'two',
      'edge',
    ])
    expect(
      selectionIds(board(), ['area'], { includeAreaMembers: false }),
    ).toEqual(['area'])
    expect(selectionBounds(board(), ['area'])).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 240,
    })
    expect(selectionBounds(board(), [])).toBeNull()
  })

  it('moves an area, members and both line endpoints once and keeps every connector attached', () => {
    const source = board()
    const before = serializeLCANVAS(source)
    const next = moveSelection(source, ['area', 'one'], 60, -20)
    expect(next.elements.find((item) => item.id === 'one')).toMatchObject({
      x: 80,
      y: 20,
      areaId: 'area',
    })
    expect(next.elements.find((item) => item.id === 'area')).toMatchObject({
      x: 60,
      y: -20,
    })
    expect(next.elements.find((item) => item.id === 'line')).toMatchObject({
      x: 90,
      y: 160,
      x2: 360,
      y2: 130,
    })
    expect(next.elements.find((item) => item.id === 'outside')).toMatchObject({
      x: 600,
      y: 40,
    })
    const edge = next.elements.find((item) => item.id === 'edge')!
    if (edge.type !== 'connection') throw new Error('Missing edge')
    expect(connectionEndpoints(next, edge)).toEqual({
      x1: 180,
      y1: 60,
      x2: 280,
      y2: 60,
    })
    expect(serializeLCANVAS(source)).toBe(before)
  })

  it('scales group positions, shape dimensions, area bounds and legacy lines as one change', () => {
    const source = board()
    const next = resizeSelection(source, ['area', 'two'], {
      x: -100,
      y: -40,
      width: 200,
      height: 120,
    })
    expect(next.elements.find((item) => item.id === 'area')).toMatchObject({
      x: -100,
      y: -40,
      width: 200,
      height: 120,
    })
    expect(next.elements.find((item) => item.id === 'one')).toMatchObject({
      x: -90,
      y: -20,
      width: 50,
      height: 40,
      areaId: 'area',
      fontSize: 20,
    })
    expect(next.elements.find((item) => item.id === 'line')).toMatchObject({
      x: -85,
      y: 50,
      x2: 50,
      y2: 35,
    })
    expect(next.elements.find((item) => item.id === 'outside')).toMatchObject({
      x: 600,
      width: 100,
    })
    const history = commitEditorHistory(createEditorHistory(source), next)
    expect(history.past).toHaveLength(1)
    expect(undoEditorHistory(history).present).toEqual(source)
    expect(redoEditorHistory(undoEditorHistory(history)).present).toEqual(next)
  })

  it('detaches a moved group from its former area and repairs only dependent memberships', () => {
    const next = moveSelection(board(), ['one', 'two'], -400, 0)
    expect(
      next.elements
        .filter((item) => ['one', 'two', 'edge'].includes(item.id))
        .every((item) => item.areaId === null),
    ).toBe(true)
    expect(next.elements.find((item) => item.id === 'line')).toHaveProperty(
      'areaId',
      'area',
    )
    expect(
      next.elements.find((item) => item.id === 'external-edge'),
    ).toMatchObject({ fromId: 'two', toId: 'outside' })
  })

  it('retains border-aligned area membership while scaling fractional coordinates', () => {
    const base = {
      color: '#7C5CFC',
      layerId: 'layer-main',
      areaId: null,
      fill: null,
    }
    const source = validateCanvasDocument({
      ...createCanvasDocument('Precision'),
      elements: [
        {
          ...base,
          id: 'area',
          type: 'area',
          name: 'Group',
          x: 0.2,
          y: 0.3,
          width: 333.3,
          height: 240.4,
        },
        {
          ...base,
          id: 'member',
          type: 'rectangle',
          text: '',
          fontSize: 20,
          areaId: 'area',
          x: 300.5,
          y: 180.7,
          width: 33,
          height: 60,
        },
      ],
    })
    for (const width of [117.13, 87.42, 91.17, 250.77]) {
      const next = resizeSelection(source, ['area'], {
        x: -57.3,
        y: -19.8,
        width,
        height: width / 2,
      })
      expect(next.elements.find((item) => item.id === 'member')).toHaveProperty(
        'areaId',
        'area',
      )
    }
  })

  it.each(['locked', 'hidden'])(
    'rejects an entire area transform around a %s member layer',
    (protection) => {
      let source = addLayer(board(), 'Protected', 'protected')
      source = assignElementLayer(source, 'one', 'protected')
      source = updateLayer(
        source,
        'protected',
        protection === 'locked' ? { locked: true } : { visible: false },
      )
      const before = serializeLCANVAS(source)
      expect(() => moveSelection(source, ['area'], 60, 40)).toThrow(
        'hidden or locked',
      )
      expect(() =>
        resizeSelection(source, ['area'], {
          x: 0,
          y: 0,
          width: 800,
          height: 480,
        }),
      ).toThrow('hidden or locked')
      expect(() => removeSelection(source, ['area'])).toThrow(
        'hidden or locked',
      )
      expect(serializeLCANVAS(source)).toBe(before)
    },
  )

  it('will not detach or delete a locked connection as a side effect', () => {
    let source = addLayer(board(), 'Protected', 'protected')
    source = assignElementLayer(source, 'edge', 'protected')
    source = updateLayer(source, 'protected', { locked: true })
    expect(() => moveSelection(source, ['one'], -500, 0)).toThrow(
      'hidden or locked',
    )
    expect(() => removeSelection(source, ['one'])).toThrow('hidden or locked')
  })

  it('deletes selected nodes and their internal/external links together', () => {
    const source = board()
    const next = removeSelection(source, ['one', 'two'])
    expect(next.elements.map((item) => item.id)).toEqual([
      'area',
      'line',
      'outside',
    ])
    expect(source.elements).toHaveLength(7)
  })

  it('retains area contents on ordinary Delete and removes the expanded contents on Cut', () => {
    const source = board()
    const next = removeSelection(source, ['area'])
    expect(next.elements).toHaveLength(6)
    expect(next.elements.every((item) => item.areaId === null)).toBe(true)
    const cut = removeSelection(source, selectionIds(source, ['area']))
    expect(cut.elements.map((item) => item.id)).toEqual(['outside'])
  })

  it('rejects stale IDs, non-finite movement, invalid resize, and overflow without changing input', () => {
    const source = board()
    const before = serializeLCANVAS(source)
    expect(() => moveSelection(source, ['missing'], 10, 10)).toThrow(
      'no longer exists',
    )
    expect(() => moveSelection(source, ['one'], Infinity, 10)).toThrow('finite')
    expect(() => moveSelection(source, ['area'], 1_000_000, 0)).toThrow()
    expect(() =>
      resizeSelection(source, ['area'], { x: 0, y: 0, width: 0, height: 40 }),
    ).toThrow('positive')
    expect(() => moveSelection(source, ['external-edge'], 10, 10)).toThrow(
      'attached objects',
    )
    expect(serializeLCANVAS(source)).toBe(before)
  })
})
