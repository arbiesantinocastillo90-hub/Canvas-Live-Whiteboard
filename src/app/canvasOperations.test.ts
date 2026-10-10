import { describe, expect, it } from 'vitest'
import {
  connectionEndpoints,
  createCanvasDocument,
  elementBounds,
  serializeLCANVAS,
} from './lcanvas'
import {
  addLayer,
  assignElementArea,
  assignElementLayer,
  connectElements,
  createElement,
  isElementEditable,
  moveElement,
  orderedVisibleElements,
  removeElement,
  reorderLayer,
  resizeElement,
  updateElement,
  updateLayer,
} from './canvasOperations'

function board() {
  let document = createCanvasDocument('Diagram')
  document = createElement(document, {
    id: 'one',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    text: 'One',
  })
  document = createElement(document, {
    id: 'two',
    type: 'ellipse',
    x: 300,
    y: 0,
    width: 100,
    height: 80,
  })
  return document
}
function organized() {
  let document = createElement(board(), {
    id: 'area',
    type: 'area',
    x: -20,
    y: -40,
    width: 500,
    height: 300,
    name: 'Group',
  })
  document = assignElementArea(document, 'one', 'area')
  document = assignElementArea(document, 'two', 'area')
  return connectElements(document, 'one', 'two', { id: 'edge', areaId: 'area' })
}

describe('validated canvas operations', () => {
  it('creates shapes, shape labels, text and area fields with safe defaults and stable identity', () => {
    let document = board()
    document = createElement(document, {
      id: 'decision',
      type: 'diamond',
      x: 30,
      y: 140,
      width: 160,
      height: 100,
      fill: '#AABBCC',
      text: 'Yes or no',
    })
    document = createElement(document, {
      id: 'label',
      type: 'text',
      x: 230,
      y: 140,
      width: 160,
      height: 100,
      text: '<script>literal</script>',
    })
    expect(document.elements.at(-2)).toMatchObject({
      id: 'decision',
      type: 'diamond',
      text: 'Yes or no',
      layerId: 'layer-main',
      fontSize: 20,
    })
    expect(document.elements.at(-1)).toMatchObject({
      id: 'label',
      text: '<script>literal</script>',
      fontSize: 24,
    })
    expect(() => serializeLCANVAS(document)).not.toThrow()
  })

  it('applies property changes atomically and never mutates the source document', () => {
    const original = board()
    const snapshot = serializeLCANVAS(original)
    const changed = updateElement(original, 'one', {
      x: 40,
      y: 50,
      width: 180,
      height: 90,
      text: 'Updated',
      fill: '#123456',
      fontSize: 30,
    })
    expect(changed.elements[0]).toMatchObject({
      x: 40,
      y: 50,
      width: 180,
      height: 90,
      text: 'Updated',
      fill: '#123456',
      fontSize: 30,
    })
    expect(serializeLCANVAS(original)).toBe(snapshot)
    expect(() =>
      updateElement(original, 'one', { width: 0, text: 'Never applied' }),
    ).toThrow('dimensions')
    expect(serializeLCANVAS(original)).toBe(snapshot)
  })

  it('keeps bound connections attached to shape boundaries when moving and resizing', () => {
    let document = connectElements(board(), 'one', 'two', {
      id: 'edge',
      style: 'elbow',
      startArrow: true,
      endArrow: false,
    })
    const edge = document.elements.find((item) => item.type === 'connection')
    if (!edge || edge.type !== 'connection')
      throw new Error('Missing connection')
    expect(connectionEndpoints(document, edge)).toEqual({
      x1: 100,
      y1: 40,
      x2: 300,
      y2: 40,
    })
    document = moveElement(document, 'one', 80, 0)
    expect(connectionEndpoints(document, edge)).toEqual({
      x1: 180,
      y1: 40,
      x2: 300,
      y2: 40,
    })
    document = resizeElement(document, 'one', 150, 80)
    expect(connectionEndpoints(document, edge)).toEqual({
      x1: 230,
      y1: 40,
      x2: 300,
      y2: 40,
    })
    expect(document.elements.find((item) => item.id === 'edge')).toMatchObject({
      style: 'elbow',
      startArrow: true,
      endArrow: false,
    })
  })

  it('supports no arrows, both arrows and independent connection style updates', () => {
    const document = connectElements(board(), 'one', 'two', {
      id: 'edge',
      startArrow: false,
      endArrow: false,
    })
    const changed = updateElement(document, 'edge', {
      style: 'elbow',
      startArrow: true,
      endArrow: true,
      color: '#FF0000',
    })
    expect(changed.elements.at(-1)).toMatchObject({
      type: 'connection',
      style: 'elbow',
      startArrow: true,
      endArrow: true,
      color: '#FF0000',
    })
    expect(() => connectElements(document, 'one', 'one')).toThrow('endpoints')
    const withLine = createElement(document, {
      id: 'line',
      type: 'line',
      x: 0,
      y: 0,
      x2: 30,
      y2: 80,
    })
    expect(() => connectElements(withLine, 'one', 'line')).toThrow(
      'existing shapes',
    )
  })

  it('moves an area and all explicit members together, including legacy lines and bound geometry', () => {
    let document = organized()
    document = createElement(document, {
      id: 'line',
      type: 'line',
      x: 10,
      y: 120,
      x2: 300,
      y2: 150,
      areaId: 'area',
    })
    const changed = moveElement(document, 'area', 80, 160)
    expect(changed.elements.find((item) => item.id === 'one')).toMatchObject({
      x: 100,
      y: 200,
      areaId: 'area',
    })
    expect(changed.elements.find((item) => item.id === 'two')).toMatchObject({
      x: 400,
      y: 200,
      areaId: 'area',
    })
    expect(changed.elements.find((item) => item.id === 'line')).toMatchObject({
      x: 110,
      y: 320,
      x2: 400,
      y2: 350,
    })
    const edge = changed.elements.find((item) => item.type === 'connection')
    if (!edge || edge.type !== 'connection') throw new Error('Missing edge')
    expect(connectionEndpoints(changed, edge)).toEqual({
      x1: 200,
      y1: 240,
      x2: 400,
      y2: 240,
    })
    expect(document.elements.find((item) => item.id === 'one')).toHaveProperty(
      'x',
      0,
    )
  })

  it('rejects shrinking an area around members and assigning objects outside its bounds', () => {
    const document = organized()
    expect(() => resizeElement(document, 'area', 150, 100)).toThrow(
      'fully contain',
    )
    expect(
      resizeElement(document, 'area', 600, 400).elements.at(-2),
    ).toHaveProperty('width', 600)
    const separate = createElement(document, {
      id: 'outside',
      type: 'text',
      x: 700,
      y: 0,
      width: 100,
      height: 50,
    })
    expect(() => assignElementArea(separate, 'outside', 'area')).toThrow(
      'fully contain',
    )
    expect(() => assignElementArea(document, 'area', 'area')).toThrow('nested')
  })

  it('detaches a member and its area connection when dragging the member outside an area', () => {
    const changed = moveElement(organized(), 'one', -200, -200)
    expect(changed.elements.find((item) => item.id === 'one')).toHaveProperty(
      'areaId',
      null,
    )
    expect(changed.elements.find((item) => item.id === 'edge')).toHaveProperty(
      'areaId',
      null,
    )
    expect(changed.elements.find((item) => item.id === 'two')).toHaveProperty(
      'areaId',
      'area',
    )
  })

  it('detaches dependent connection membership on deliberate removal from an area', () => {
    const changed = assignElementArea(organized(), 'one', null)
    expect(changed.elements.find((item) => item.id === 'edge')).toHaveProperty(
      'areaId',
      null,
    )
  })

  it('rejects assigning an area connection unless both endpoints are members', () => {
    const document = connectElements(
      createElement(board(), {
        id: 'area',
        type: 'area',
        x: -30,
        y: -30,
        width: 500,
        height: 400,
      }),
      'one',
      'two',
      { id: 'edge' },
    )
    expect(() => assignElementArea(document, 'edge', 'area')).toThrow(
      'two members',
    )
  })

  it('deletes a node with its attached connections and deletes an area while retaining members', () => {
    const original = organized()
    expect(
      removeElement(original, 'one').elements.map((item) => item.id),
    ).toEqual(['two', 'area'])
    const withoutArea = removeElement(original, 'area')
    expect(withoutArea.elements.map((item) => item.id)).toEqual([
      'one',
      'two',
      'edge',
    ])
    expect(withoutArea.elements.every((item) => item.areaId === null)).toBe(
      true,
    )
  })

  it('tracks layer assignments and draws layers from back to front in explicit order', () => {
    let document = addLayer(board(), 'Front', 'front')
    document = assignElementLayer(document, 'one', 'front')
    expect(orderedVisibleElements(document).map((item) => item.id)).toEqual([
      'two',
      'one',
    ])
    document = reorderLayer(document, 'front', 0)
    expect(document.layers.map((layer) => layer.id)).toEqual([
      'front',
      'layer-main',
    ])
    expect(orderedVisibleElements(document).map((item) => item.id)).toEqual([
      'one',
      'two',
    ])
    expect(
      updateLayer(document, 'front', { name: 'Renamed' }).layers[0].name,
    ).toBe('Renamed')
  })

  it('hides endpoint connections and refuses editing objects on hidden or locked layers', () => {
    let document = addLayer(
      connectElements(board(), 'one', 'two', { id: 'edge' }),
      'Nodes',
      'nodes',
    )
    document = assignElementLayer(document, 'one', 'nodes')
    document = updateLayer(document, 'nodes', { visible: false })
    expect(orderedVisibleElements(document).map((item) => item.id)).toEqual([
      'two',
    ])
    expect(isElementEditable(document, 'one')).toBe(false)
    expect(() => moveElement(document, 'one', 20, 30)).toThrow(
      'hidden or locked',
    )
    expect(() =>
      createElement(document, {
        id: 'hidden-new',
        type: 'text',
        x: 0,
        y: 0,
        width: 40,
        height: 50,
        layerId: 'nodes',
      }),
    ).toThrow('visible, unlocked')
    document = updateLayer(document, 'nodes', { visible: true, locked: true })
    expect(() => removeElement(document, 'one')).toThrow('hidden or locked')
    expect(() => assignElementLayer(document, 'two', 'nodes')).toThrow(
      'visible, unlocked',
    )
    expect(
      isElementEditable(
        updateLayer(document, 'nodes', { locked: false }),
        'one',
      ),
    ).toBe(true)
  })

  it('prevents area movement, resizing or deletion from bypassing a locked member layer', () => {
    let document = addLayer(organized(), 'Locked', 'locked')
    document = assignElementLayer(document, 'one', 'locked')
    document = updateLayer(document, 'locked', { locked: true })
    const snapshot = serializeLCANVAS(document)
    expect(() => moveElement(document, 'area', 80, 90)).toThrow(
      'hidden or locked',
    )
    expect(() => removeElement(document, 'area')).toThrow('hidden or locked')
    expect(serializeLCANVAS(document)).toBe(snapshot)
    expect(
      resizeElement(document, 'area', 600, 500).elements.find(
        (item) => item.id === 'one',
      ),
    ).toHaveProperty('x', 0)
  })

  it('refuses to delete a node or detach a member when its dependent connection is locked', () => {
    let document = addLayer(organized(), 'Edges', 'edges')
    document = assignElementLayer(document, 'edge', 'edges')
    document = updateLayer(document, 'edges', { locked: true })
    expect(() => removeElement(document, 'one')).toThrow('hidden or locked')
    expect(() => moveElement(document, 'area', 80, 90)).toThrow(
      'hidden or locked',
    )
    expect(() => moveElement(document, 'one', -300, 0)).toThrow(
      'hidden or locked',
    )
  })

  it('locked or hidden area layers also protect and hide their members on other layers', () => {
    let document = addLayer(organized(), 'Areas', 'areas')
    document = assignElementLayer(document, 'area', 'areas')
    document = updateLayer(document, 'areas', { locked: true })
    expect(isElementEditable(document, 'one')).toBe(false)
    expect(() => resizeElement(document, 'one', 120, 90)).toThrow(
      'hidden or locked',
    )
    document = updateLayer(document, 'areas', { visible: false })
    expect(orderedVisibleElements(document)).toEqual([])
  })

  it('translates legacy line endpoints together and permits explicit endpoint edits', () => {
    const document = createElement(board(), {
      id: 'line',
      type: 'line',
      x: 100,
      y: 50,
      x2: 20,
      y2: -20,
    })
    const moved = moveElement(document, 'line', 200, 150)
    expect(moved.elements.at(-1)).toMatchObject({
      x: 200,
      y: 150,
      x2: 120,
      y2: 80,
    })
    expect(elementBounds(moved, moved.elements.at(-1)!)).toEqual({
      x: 120,
      y: 80,
      width: 80,
      height: 70,
    })
    expect(
      updateElement(moved, 'line', { x2: 350, y2: 300 }).elements.at(-1),
    ).toMatchObject({ x: 200, y: 150, x2: 350, y2: 300 })
  })

  it.each([
    () => moveElement(board(), 'missing', 0, 0),
    () =>
      updateElement(board(), 'one', { url: 'https://example.com' } as never),
    () => updateElement(board(), 'one', { x2: 30 }),
    () => updateElement(board(), 'one', { fontSize: 200 }),
    () => moveElement(board(), 'one', Infinity, 0),
    () => resizeElement(board(), 'one', -1, 100),
    () => addLayer(board(), ''),
    () => addLayer(board(), 'Duplicate', 'layer-main'),
    () => updateLayer(board(), 'missing', { visible: false }),
    () => updateLayer(board(), 'layer-main', { token: 'private' } as never),
    () => reorderLayer(board(), 'layer-main', 4),
    () => reorderLayer(board(), 'layer-main', 0.5),
  ])(
    'rejects malformed, unsupported or inconsistent mutations',
    (operation) => {
      expect(operation).toThrow()
    },
  )

  it('enforces finite element and layer limits for direct operations', () => {
    let document = createCanvasDocument('Layers')
    for (let index = 1; index < 100; index += 1)
      document = addLayer(document, `Layer ${index}`, `layer-${index}`)
    expect(() => addLayer(document, 'Too many')).toThrow('1–100')
    const crowded = {
      ...createCanvasDocument('Elements'),
      elements: Array.from({ length: 5000 }, (_, index) => ({
        ...board().elements[0],
        id: `node-${index}`,
      })),
    }
    expect(() =>
      createElement(crowded, {
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
      }),
    ).toThrow('5,000')
  })
})
