import { describe, expect, it } from 'vitest'
import {
  addLayer,
  assignElementArea,
  assignElementLayer,
  connectElements,
  createElement,
  moveElement,
  reconnectConnection,
  resizeElement,
  updateLayer,
} from './canvasOperations'
import {
  connectionEndpoints,
  createCanvasDocument,
  parseLCANVAS,
  serializeLCANVAS,
  type CanvasDocument,
  type ConnectionElement,
  type ConnectionSide,
} from './lcanvas'
import {
  commitEditorHistory,
  createEditorHistory,
  navigateEditorHistory,
  redoEditorContentHistory,
  undoEditorContentHistory,
} from './editorHistory'

function fixture() {
  let document = createCanvasDocument('Reconnect relationships')
  for (const [id, x, y] of [
    ['one', 0, 0],
    ['two', 300, 0],
    ['three', 600, 200],
  ] as const)
    document = createElement(document, {
      id,
      type: 'rectangle',
      x,
      y,
      width: 120,
      height: 100,
    })
  return connectElements(document, 'one', 'two', {
    id: 'edge',
    style: 'curve',
    linePattern: 'dotted',
    startPointer: 'diamond',
    endPointer: 'circle',
    fromSide: 'right',
    toSide: 'left',
  })
}

function edge(document: CanvasDocument): ConnectionElement {
  const element = document.elements.find((item) => item.id === 'edge')
  if (element?.type !== 'connection') throw new Error('Missing fixture edge')
  return element
}

describe('validated relationship reconnection', () => {
  it.each(['start', 'end'] as const)(
    'replaces only the %s attachment while preserving identity, styles, camera and source',
    (endpoint) => {
      const document = {
        ...fixture(),
        viewport: { x: -100, y: 70, zoom: 1.8 },
      }
      const before = serializeLCANVAS(document)
      const next = reconnectConnection(
        document,
        'edge',
        endpoint,
        'three',
        'bottom',
      )
      expect(edge(next)).toEqual({
        ...edge(document),
        ...(endpoint === 'start'
          ? { fromId: 'three', fromSide: 'bottom' }
          : { toId: 'three', toSide: 'bottom' }),
      })
      expect(next.viewport).toEqual(document.viewport)
      expect(next.elements.slice(0, 3)).toEqual(document.elements.slice(0, 3))
      expect(serializeLCANVAS(document)).toBe(before)
      expect(parseLCANVAS(serializeLCANVAS(next))).toEqual(next)
    },
  )

  it.each([
    ['top', 660, 200],
    ['right', 720, 250],
    ['bottom', 660, 300],
    ['left', 600, 250],
  ] as const)('uses the chosen %s side on either endpoint', (side, x, y) => {
    const document = fixture()
    const start = reconnectConnection(document, 'edge', 'start', 'three', side)
    expect(connectionEndpoints(start, edge(start))).toEqual({
      x1: x,
      y1: y,
      x2: 300,
      y2: 50,
    })
    const end = reconnectConnection(document, 'edge', 'end', 'three', side)
    expect(connectionEndpoints(end, edge(end))).toEqual({
      x1: 120,
      y1: 50,
      x2: x,
      y2: y,
    })
  })

  it('keeps same-side drops as no-ops and permits changing the side of the current object', () => {
    const document = fixture()
    expect(reconnectConnection(document, 'edge', 'start', 'one', 'right')).toBe(
      document,
    )
    expect(reconnectConnection(document, 'edge', 'end', 'two', 'left')).toBe(
      document,
    )
    const changed = reconnectConnection(document, 'edge', 'end', 'two', 'top')
    expect(edge(changed)).toEqual({ ...edge(document), toSide: 'top' })
    const history = createEditorHistory(document)
    expect(
      commitEditorHistory(
        history,
        reconnectConnection(document, 'edge', 'end', 'two', 'left'),
      ),
    ).toBe(history)
  })

  it('returns the original older v2 document when its resolved side is unchanged', () => {
    const document = fixture()
    const legacy = {
      ...document,
      elements: document.elements.map((element) => {
        if (element.type !== 'connection') return element
        const copy = { ...element }
        delete copy.fromSide
        delete copy.toSide
        return copy
      }),
    }
    expect(reconnectConnection(legacy, 'edge', 'start', 'one', 'right')).toBe(
      legacy,
    )
    const changed = reconnectConnection(legacy, 'edge', 'end', 'three', 'top')
    expect(edge(changed)).toMatchObject({
      fromId: 'one',
      toId: 'three',
      fromSide: 'right',
      toSide: 'top',
    })
  })

  it.each(['one', 'two'])(
    'rejects collapsing the relationship onto its other endpoint %s',
    (target) => {
      const document = fixture()
      expect(() =>
        reconnectConnection(
          document,
          'edge',
          target === 'two' ? 'start' : 'end',
          target,
          'top',
        ),
      ).toThrow('different objects')
      expect(edge(document)).toMatchObject({ fromId: 'one', toId: 'two' })
    },
  )

  it('rejects malformed endpoint/side, missing objects and non-node targets atomically', () => {
    const document = createElement(fixture(), {
      id: 'line',
      type: 'line',
      x: 0,
      y: 0,
      x2: 40,
      y2: 40,
    })
    const before = serializeLCANVAS(document)
    expect(() =>
      reconnectConnection(document, 'edge', 'middle' as never, 'three', 'top'),
    ).toThrow('valid connection endpoint')
    expect(() =>
      reconnectConnection(document, 'edge', 'end', 'three', 'corner' as never),
    ).toThrow('valid connection endpoint')
    expect(() =>
      reconnectConnection(document, 'missing', 'end', 'three', 'top'),
    ).toThrow('no longer exists')
    expect(() =>
      reconnectConnection(document, 'one', 'end', 'three', 'top'),
    ).toThrow('Choose a connection')
    expect(() =>
      reconnectConnection(document, 'edge', 'end', 'missing', 'top'),
    ).toThrow('no longer exists')
    for (const target of ['line', 'edge'])
      expect(() =>
        reconnectConnection(document, 'edge', 'end', target, 'top'),
      ).toThrow('shape, text item, area, or embed')
    expect(serializeLCANVAS(document)).toBe(before)
  })

  it.each([
    ['edge', { locked: true }],
    ['three', { locked: true }],
    ['three', { visible: false }],
    ['one', { locked: true }],
    ['one', { visible: false }],
  ] as const)('rejects a protected %s layer (%j)', (id, protection) => {
    let document = addLayer(fixture(), 'Protected', 'protected')
    document = assignElementLayer(document, id, 'protected')
    document = updateLayer(document, 'protected', protection)
    const before = serializeLCANVAS(document)
    expect(() =>
      reconnectConnection(document, 'edge', 'end', 'three', 'top'),
    ).toThrow('hidden or locked')
    expect(serializeLCANVAS(document)).toBe(before)
  })

  it('retains valid legacy membership and detaches only when the new node is not a member', () => {
    let document = createElement(fixture(), {
      id: 'area',
      type: 'area',
      x: -50,
      y: -50,
      width: 900,
      height: 500,
    })
    document = assignElementArea(document, 'one', 'area')
    document = assignElementArea(document, 'two', 'area')
    document = assignElementArea(document, 'edge', 'area')
    const detached = reconnectConnection(
      document,
      'edge',
      'end',
      'three',
      'top',
    )
    expect(edge(detached).areaId).toBeNull()
    expect(edge(document).areaId).toBe('area')
    const contained = assignElementArea(document, 'three', 'area')
    const retained = reconnectConnection(
      contained,
      'edge',
      'end',
      'three',
      'top',
    )
    expect(edge(retained).areaId).toBe('area')
    expect(retained.elements.filter((item) => item.id !== 'edge')).toEqual(
      contained.elements.filter((item) => item.id !== 'edge'),
    )
  })

  it('tracks movement/resizing of the new node and restores both attachments with one Undo/Redo', () => {
    const document = fixture()
    const reconnected = reconnectConnection(
      document,
      'edge',
      'end',
      'three',
      'left',
    )
    const moved = moveElement(reconnected, 'three', 800, 300)
    const resized = resizeElement(moved, 'three', 200, 200)
    expect(connectionEndpoints(resized, edge(resized))).toEqual({
      x1: 120,
      y1: 50,
      x2: 800,
      y2: 400,
    })
    const committed = commitEditorHistory(
      createEditorHistory(document),
      reconnected,
    )
    expect(committed.past).toHaveLength(1)
    const navigated = navigateEditorHistory(committed, {
      x: 90,
      y: -20,
      zoom: 2,
    })
    const undone = undoEditorContentHistory(navigated)
    expect(edge(undone.present)).toEqual(edge(document))
    expect(undone.present.viewport).toEqual(navigated.present.viewport)
    const redone = redoEditorContentHistory(undone)
    expect(edge(redone.present)).toEqual(edge(reconnected))
    expect(redone.present.viewport).toEqual(navigated.present.viewport)
  })

  it.each(['text', 'area', 'embed'] as const)(
    'supports an existing editable %s target without changing its contents',
    (type) => {
      const fields = {
        id: 'target',
        x: 800,
        y: 200,
        width: 100,
        height: 100,
      }
      const document =
        type === 'embed'
          ? createElement(fixture(), {
              ...fields,
              type,
              kind: 'web',
              src: 'https://example.com/',
            })
          : createElement(fixture(), { ...fields, type })
      const next = reconnectConnection(
        document,
        'edge',
        'end',
        'target',
        'left',
      )
      expect(edge(next).toId).toBe('target')
      expect(next.elements.at(-1)).toEqual(document.elements.at(-1))
    },
  )

  it('retains explicit Auto support without persisting any free endpoint coordinates', () => {
    const document = reconnectConnection(
      fixture(),
      'edge',
      'end',
      'three',
      'auto',
    )
    expect(edge(document).toSide).toBe('auto' satisfies ConnectionSide)
    expect(Object.keys(edge(document))).not.toContain('toPoint')
    expect(Object.keys(edge(document))).not.toContain('fromPoint')
  })
})
