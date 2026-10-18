import { describe, expect, it } from 'vitest'
import {
  addLayer,
  assignElementArea,
  connectElements,
  createElement,
  updateLayer,
} from '../app/canvasOperations'
import {
  commitEditorHistory,
  createEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
} from '../app/editorHistory'
import {
  createCanvasDocument,
  serializeLCANVAS,
  validateCanvasDocument,
  type CanvasDocument,
} from '../app/lcanvas'
import {
  applyCanvasCommand,
  canvasState,
  commandSchema,
  findShape,
  searchCanvas,
  type CanvasCommand,
} from './canvasCommands'

function shape(id: string, x = 0) {
  return { type: 'rectangle' as const, id, x, y: 0, width: 80, height: 60 }
}
function board() {
  return createElement(
    createElement(createCanvasDocument('Test canvas'), shape('one')),
    shape('two', 200),
  )
}
function groupedBoard() {
  let document = createElement(board(), {
    type: 'area',
    id: 'area',
    x: -20,
    y: -20,
    width: 400,
    height: 200,
    name: 'Planning',
  })
  document = assignElementArea(document, 'one', 'area')
  document = assignElementArea(document, 'two', 'area')
  return connectElements(document, 'one', 'two', { id: 'edge', areaId: 'area' })
}
function manyObjects(count: number): CanvasDocument {
  const template = findShape(board(), 'one')
  return validateCanvasDocument({
    ...createCanvasDocument('Many objects'),
    elements: Array.from({ length: count }, (_, index) => ({
      ...template,
      id: `shape-${index}`,
      x: index * 100,
      text: `Object ${index}`,
    })),
  })
}

describe('MCP canvas command schemas', () => {
  it('validates and persists connection endpoint sides through create and update commands', () => {
    const created = applyCanvasCommand(
      board(),
      commandSchema.parse({
        kind: 'connect',
        fromId: 'one',
        toId: 'two',
        options: { id: 'edge', fromSide: 'bottom', toSide: 'top' },
      }),
    )
    expect(findShape(created.document, 'edge')).toMatchObject({
      fromSide: 'bottom',
      toSide: 'top',
    })
    const updated = applyCanvasCommand(
      created.document,
      commandSchema.parse({
        kind: 'update',
        id: 'edge',
        patch: { fromSide: 'auto', toSide: 'left' },
      }),
    )
    expect(findShape(updated.document, 'edge')).toMatchObject({
      fromSide: 'auto',
      toSide: 'left',
    })
    expect(
      commandSchema.safeParse({
        kind: 'connect',
        fromId: 'one',
        toId: 'two',
        options: { fromSide: 'center' },
      }).success,
    ).toBe(false)
    expect(
      commandSchema.safeParse({
        kind: 'update',
        id: 'edge',
        patch: { toSide: 'outside' },
      }).success,
    ).toBe(false)
    expect(() =>
      applyCanvasCommand(
        board(),
        commandSchema.parse({
          kind: 'update',
          id: 'one',
          patch: { fromSide: 'right' },
        }),
      ),
    ).toThrow('unsupported')
  })
  it.each([
    { ...shape('rectangle'), type: 'rectangle' },
    { ...shape('ellipse'), type: 'ellipse' },
    { ...shape('diamond'), type: 'diamond', text: 'Decision' },
    { ...shape('text'), type: 'text', text: 'Notes\nwith new lines' },
    { ...shape('area'), type: 'area', name: 'Scope' },
    { type: 'line', id: 'line', x: 0, y: 0, x2: 30, y2: 40 },
    { type: 'connection', id: 'connection', fromId: 'one', toId: 'two' },
  ])('creates validated $type objects using shared defaults', (element) => {
    const command = commandSchema.parse({ kind: 'create', element })
    const result = applyCanvasCommand(board(), command)
    expect(findShape(result.document, element.id)).toMatchObject({
      ...element,
      layerId: 'layer-main',
      areaId: null,
      color: '#7C5CFC',
    })
    expect(result.affectedIds).toEqual([element.id])
    expect(result.summary).toBe(`Created ${element.type}.`)
  })

  it.each([
    { kind: 'create', element: { ...shape('three'), script: 'arbitrary' } },
    { kind: 'update', id: 'one', patch: { type: 'ellipse' } },
    { kind: 'update', id: 'one', patch: {} },
    { kind: 'delete', id: 'one', recursive: true },
    {
      kind: 'connect',
      fromId: 'one',
      toId: 'two',
      options: { url: 'file:///secret' },
    },
    { kind: 'update_layer', id: 'layer-main', patch: { owner: 'other' } },
    { kind: 'update_layer', id: 'layer-main', patch: {} },
    { kind: 'save', path: '../secret' },
    {
      kind: 'create',
      element: { ...shape('nested'), type: 'area', areaId: 'area' },
    },
    { kind: 'create', element: { ...shape(' leading-id') } },
    {
      kind: 'batch',
      operations: [
        { kind: 'batch', operations: [{ kind: 'delete', id: 'one' }] },
      ],
    },
  ])('rejects unsupported or ambiguous arguments %#', (command) => {
    expect(commandSchema.safeParse(command).success).toBe(false)
  })

  it.each([0, -1, 1_000_001, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid dimensions %s',
    (width) => {
      expect(
        commandSchema.safeParse({
          kind: 'resize',
          id: 'one',
          width,
          height: 80,
        }).success,
      ).toBe(false)
    },
  )

  it('enforces coordinate, text, font and color boundaries before mutation', () => {
    for (const patch of [
      { x: Number.NaN },
      { y: Number.NEGATIVE_INFINITY },
      { x: -1_000_001 },
      { text: 'x'.repeat(20_001) },
      { text: 'bad\u0000text' },
      { fontSize: 7 },
      { fontSize: 161 },
      { fill: 'red' },
      { color: 'url(secret)' },
    ])
      expect(
        commandSchema.safeParse({ kind: 'update', id: 'one', patch }).success,
      ).toBe(false)
    const result = applyCanvasCommand(board(), {
      kind: 'update',
      id: 'one',
      patch: {
        x: -1_000_000,
        y: 1_000_000,
        text: 'plain\ttext\n<script>',
        fontSize: 160,
        fill: null,
      },
    })
    expect(findShape(result.document, 'one')).toMatchObject({
      x: -1_000_000,
      y: 1_000_000,
      text: 'plain\ttext\n<script>',
      fontSize: 160,
    })
  })

  it('rejects empty or oversized batches and accepts the bounded maximum', () => {
    expect(
      commandSchema.safeParse({ kind: 'batch', operations: [] }).success,
    ).toBe(false)
    const operation = { kind: 'move', id: 'one', x: 100, y: 10 }
    expect(
      commandSchema.safeParse({
        kind: 'batch',
        operations: Array(26).fill(operation),
      }).success,
    ).toBe(false)
    expect(
      commandSchema.safeParse({
        kind: 'batch',
        operations: Array(25).fill(operation),
      }).success,
    ).toBe(true)
  })
})

describe('MCP atomic shared operations', () => {
  it('validates typed arguments again at the execution boundary', () => {
    const command = {
      kind: 'move',
      id: 'one',
      x: 10,
      y: 20,
      shell: 'never',
    } as CanvasCommand
    expect(() => applyCanvasCommand(board(), command)).toThrow()
  })

  it('creates, labels, resizes and connects a diagram in one undoable transaction', () => {
    const document = createCanvasDocument('Diagram')
    const result = applyCanvasCommand(document, {
      kind: 'batch',
      operations: [
        { kind: 'add_layer', id: 'diagram', name: 'Diagram layer' },
        {
          kind: 'create',
          element: { ...shape('plan'), layerId: 'diagram', text: 'Plan' },
        },
        {
          kind: 'create',
          element: {
            ...shape('deliver', 220),
            type: 'diamond',
            layerId: 'diagram',
            text: 'Deliver',
          },
        },
        { kind: 'resize', id: 'plan', width: 120, height: 90 },
        {
          kind: 'connect',
          fromId: 'plan',
          toId: 'deliver',
          options: {
            id: 'edge',
            layerId: 'diagram',
            style: 'elbow',
            startArrow: true,
            endArrow: false,
          },
        },
      ],
    })
    expect(result.document.elements).toHaveLength(3)
    expect(result.affectedIds).toEqual(['diagram', 'plan', 'deliver', 'edge'])
    expect(result.summary).toBe('Applied 5 canvas operations.')
    const history = commitEditorHistory(
      createEditorHistory(document),
      result.document,
    )
    expect(history.past).toHaveLength(1)
    expect(undoEditorHistory(history).present).toEqual(document)
    expect(redoEditorHistory(undoEditorHistory(history)).present).toEqual(
      result.document,
    )
  })

  it('does not change the caller document if a later batch operation fails', () => {
    const document = board()
    const before = serializeLCANVAS(document)
    expect(() =>
      applyCanvasCommand(document, {
        kind: 'batch',
        operations: [
          { kind: 'move', id: 'one', x: 400, y: 150 },
          { kind: 'create', element: shape('three') },
          { kind: 'connect', fromId: 'three', toId: 'missing' },
        ],
      }),
    ).toThrow('no longer exists')
    expect(serializeLCANVAS(document)).toBe(before)
  })

  it('rejects duplicate IDs and element fields inappropriate to the object type', () => {
    const document = board()
    expect(() =>
      applyCanvasCommand(document, { kind: 'create', element: shape('one') }),
    ).toThrow('duplicate')
    expect(() =>
      applyCanvasCommand(document, {
        kind: 'update',
        id: 'one',
        patch: { x2: 30 },
      }),
    ).toThrow('unsupported object fields')
    expect(() =>
      applyCanvasCommand(document, {
        kind: 'connect',
        fromId: 'one',
        toId: 'one',
      }),
    ).toThrow('endpoints')
  })

  it('rejects edits and creation on hidden or locked layers', () => {
    for (const patch of [{ visible: false }, { locked: true }]) {
      const document = updateLayer(board(), 'layer-main', patch)
      expect(() =>
        applyCanvasCommand(document, { kind: 'move', id: 'one', x: 30, y: 0 }),
      ).toThrow('hidden or locked')
      expect(() =>
        applyCanvasCommand(document, {
          kind: 'create',
          element: { ...shape('three'), layerId: 'layer-main' },
        }),
      ).toThrow('visible, unlocked')
      expect(() =>
        applyCanvasCommand(document, { kind: 'delete', id: 'one' }),
      ).toThrow('hidden or locked')
    }
    expect(() =>
      applyCanvasCommand(board(), {
        kind: 'create',
        element: { ...shape('three'), layerId: 'missing' },
      }),
    ).toThrow('layer no longer exists')
  })

  it('validates area containment and connector membership', () => {
    const document = groupedBoard()
    expect(() =>
      applyCanvasCommand(document, {
        kind: 'create',
        element: { ...shape('outside', 500), areaId: 'area' },
      }),
    ).toThrow('fully contain')
    expect(() =>
      applyCanvasCommand(document, {
        kind: 'update',
        id: 'one',
        patch: { areaId: 'two' },
      }),
    ).toThrow('existing area')
    expect(() =>
      applyCanvasCommand(document, {
        kind: 'resize',
        id: 'area',
        width: 100,
        height: 100,
      }),
    ).toThrow('fully contain')
    const moved = applyCanvasCommand(document, {
      kind: 'move',
      id: 'one',
      x: 600,
      y: 0,
    })
    expect(findShape(moved.document, 'one')).toMatchObject({ areaId: null })
    expect(findShape(moved.document, 'edge')).toMatchObject({ areaId: null })
    expect(moved.affectedIds).toContain('edge')
  })

  it('moves area members together and refuses an area move with a locked member', () => {
    const document = groupedBoard()
    const moved = applyCanvasCommand(document, {
      kind: 'move',
      id: 'area',
      x: 80,
      y: 100,
    })
    expect(findShape(moved.document, 'one')).toMatchObject({ x: 100, y: 120 })
    expect(moved.affectedIds).toEqual(
      expect.arrayContaining(['area', 'one', 'two', 'edge']),
    )
    let separated = addLayer(document, 'Members', 'members')
    separated = applyCanvasCommand(separated, {
      kind: 'update',
      id: 'one',
      patch: { layerId: 'members' },
    }).document
    separated = updateLayer(separated, 'members', { locked: true })
    const before = serializeLCANVAS(separated)
    expect(() =>
      applyCanvasCommand(separated, {
        kind: 'move',
        id: 'area',
        x: 80,
        y: 100,
      }),
    ).toThrow('hidden or locked')
    expect(serializeLCANVAS(separated)).toBe(before)
  })

  it('reports attached connections when their endpoint geometry changes', () => {
    const document = connectElements(board(), 'one', 'two', { id: 'edge' })
    const moved = applyCanvasCommand(document, {
      kind: 'move',
      id: 'one',
      x: 100,
      y: 20,
    })
    expect(moved.affectedIds).toEqual(['one', 'edge'])
    expect(findShape(moved.document, 'edge')).toEqual(
      findShape(document, 'edge'),
    )
  })

  it('deletes attached connections while preserving independent objects and area members', () => {
    const document = groupedBoard()
    const result = applyCanvasCommand(document, { kind: 'delete', id: 'one' })
    expect(result.affectedIds).toEqual(['one', 'edge'])
    expect(result.document.elements.map((element) => element.id)).toEqual([
      'two',
      'area',
    ])
    const areaDeleted = applyCanvasCommand(document, {
      kind: 'delete',
      id: 'area',
    })
    expect(areaDeleted.document.elements.map((element) => element.id)).toEqual([
      'one',
      'two',
      'edge',
    ])
    expect(
      areaDeleted.document.elements.every((element) => element.areaId === null),
    ).toBe(true)
    expect(areaDeleted.affectedIds).toEqual(
      expect.arrayContaining(['area', 'one', 'two', 'edge']),
    )
  })

  it('counts attached connections in the deletion limit and rejects the entire operation', () => {
    let document = board()
    for (let index = 0; index < 10; index++)
      document = connectElements(document, 'one', 'two', {
        id: `edge-${index}`,
      })
    const before = serializeLCANVAS(document)
    expect(() =>
      applyCanvasCommand(document, { kind: 'delete', id: 'one' }),
    ).toThrow('at most 10 objects')
    expect(serializeLCANVAS(document)).toBe(before)
    const fewer = applyCanvasCommand(document, {
      kind: 'delete',
      id: 'edge-0',
    }).document
    expect(
      applyCanvasCommand(fewer, {
        kind: 'delete',
        id: 'one',
      }).document.elements.map((element) => element.id),
    ).toEqual(['two'])
  })

  it('enforces a cumulative batch deletion budget rather than a per-command budget', () => {
    const document = manyObjects(11)
    const before = serializeLCANVAS(document)
    const operations = document.elements.map((element) => ({
      kind: 'delete' as const,
      id: element.id,
    }))
    expect(() =>
      applyCanvasCommand(document, { kind: 'batch', operations }),
    ).toThrow('at most 10 objects')
    expect(serializeLCANVAS(document)).toBe(before)
    expect(
      applyCanvasCommand(document, {
        kind: 'batch',
        operations: operations.slice(0, 10),
      }).document.elements,
    ).toHaveLength(1)
  })

  it('does not evade the deletion budget by recreating the same identifier', () => {
    const operations: Exclude<CanvasCommand, { kind: 'batch' }>[] = []
    for (let index = 0; index < 11; index++) {
      operations.push({ kind: 'delete', id: 'one' })
      if (index < 10) operations.push({ kind: 'create', element: shape('one') })
    }
    expect(() =>
      applyCanvasCommand(board(), { kind: 'batch', operations }),
    ).toThrow('at most 10 objects')
  })

  it('uses the existing layer operation permissions and validates layer indices', () => {
    const document = addLayer(board(), 'Secondary', 'secondary')
    const changed = applyCanvasCommand(document, {
      kind: 'update_layer',
      id: 'secondary',
      patch: { name: '  Renamed  ', locked: true },
    })
    expect(changed.document.layers[1]).toMatchObject({
      name: 'Renamed',
      locked: true,
    })
    expect(changed.affectedIds).toEqual(['secondary'])
    const reordered = applyCanvasCommand(changed.document, {
      kind: 'reorder_layer',
      id: 'secondary',
      index: 0,
    })
    expect(reordered.document.layers[0].id).toBe('secondary')
    expect(reordered.affectedIds).toEqual(['secondary', 'layer-main'])
    expect(() =>
      applyCanvasCommand(document, {
        kind: 'reorder_layer',
        id: 'secondary',
        index: 2,
      }),
    ).toThrow('valid layer position')
  })
})

describe('MCP bounded canvas reads', () => {
  it('returns a stable bounded page and complete layer metadata', () => {
    const document = manyObjects(102)
    const first = canvasState(document)
    expect(first).toMatchObject({
      name: 'Many objects',
      format: 'LCANVAS',
      version: 2,
      total: 102,
      offset: 0,
      limit: 100,
      nextOffset: 100,
    })
    expect(first.elements).toHaveLength(100)
    expect(first.layers).toEqual(document.layers)
    const last = canvasState(document, {
      offset: first.nextOffset!,
      limit: 100,
    })
    expect(last.elements.map((element) => element.id)).toEqual([
      'shape-100',
      'shape-101',
    ])
    expect(last.nextOffset).toBeNull()
    expect(canvasState(document, { offset: 1000 }).elements).toEqual([])
  })

  it('returns independent validated copies for reads', () => {
    const document = board()
    const first = canvasState(document)
    first.elements[0].color = '#FF0000'
    first.layers[0].name = 'Modified response'
    const shapeResult = findShape(document, 'two')
    shapeResult.color = '#000000'
    expect(document.layers[0].name).toBe('Main')
    expect(
      document.elements.every((element) => element.color === '#7C5CFC'),
    ).toBe(true)
  })

  it('scopes reads to a requested area and layer, including unassigned objects', () => {
    const document = groupedBoard()
    expect(
      canvasState(document, { areaId: 'area' }).elements.map(
        (element) => element.id,
      ),
    ).toEqual(['one', 'two', 'edge'])
    expect(
      canvasState(document, { areaId: null }).elements.map(
        (element) => element.id,
      ),
    ).toEqual(['area'])
    expect(
      canvasState(document, {
        layerId: 'layer-main',
        areaId: 'area',
        limit: 1,
        offset: 1,
      }).elements.map((element) => element.id),
    ).toEqual(['two'])
    expect(() => canvasState(document, { layerId: 'missing' })).toThrow(
      'layer no longer exists',
    )
    expect(() => canvasState(document, { areaId: 'one' })).toThrow(
      'area no longer exists',
    )
  })

  it.each([
    { limit: 101 },
    { limit: 0 },
    { limit: 2.5 },
    { offset: -1 },
    { offset: 5001 },
    { offset: Number.NaN },
    { includeSecrets: true },
  ])('rejects unsupported or unbounded read options %#', (options) => {
    expect(() => canvasState(board(), options)).toThrow()
  })

  it('gets one object by stable ID and rejects an object absent from this document', () => {
    expect(findShape(board(), 'one')).toMatchObject({
      id: 'one',
      type: 'rectangle',
    })
    expect(() => findShape(board(), 'elsewhere')).toThrow(
      'object no longer exists',
    )
    expect(() => findShape(board(), ' one ')).toThrow()
  })

  it('performs a literal case-insensitive search without interpreting expressions', () => {
    const document = applyCanvasCommand(board(), {
      kind: 'update',
      id: 'one',
      patch: { text: 'A plan [.*] <script> literal' },
    }).document
    expect(
      searchCanvas(document, '[.*]').elements.map((element) => element.id),
    ).toEqual(['one'])
    expect(
      searchCanvas(document, 'PLAN').elements.map((element) => element.id),
    ).toEqual(['one'])
    expect(searchCanvas(document, '.*script.*').elements).toEqual([])
    expect(() => searchCanvas(document, ' ')).toThrow()
    expect(() => searchCanvas(document, 'x'.repeat(201))).toThrow()
  })

  it('searches the documented object and layer metadata with bounded pagination', () => {
    const document = groupedBoard()
    expect(
      searchCanvas(document, 'Planning').elements.map((element) => element.id),
    ).toEqual(['area'])
    expect(
      searchCanvas(document, 'Main', { areaId: 'area', limit: 1 }).elements.map(
        (element) => element.id,
      ),
    ).toEqual(['one'])
    expect(
      searchCanvas(document, 'Main', { areaId: 'area', limit: 1 }).nextOffset,
    ).toBe(1)
    expect(
      searchCanvas(document, 'connection').elements.map(
        (element) => element.id,
      ),
    ).toEqual(['edge'])
    expect(searchCanvas(document, 'Object', { limit: 100 }).elements).toEqual(
      [],
    )
    expect(searchCanvas(manyObjects(102), 'Object').elements).toHaveLength(100)
    expect(searchCanvas(manyObjects(102), 'Object').total).toBe(102)
  })
})
