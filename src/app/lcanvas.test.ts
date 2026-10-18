import { describe, expect, it } from 'vitest'
import {
  canvasExportFilename,
  connectionEndpoints,
  createCanvasDocument,
  LCANVAS_MAX_BYTES,
  parseLCANVAS,
  serializeLCANVAS,
  validateCanvasDocument,
  type CanvasDocument,
  type CanvasElement,
} from './lcanvas'
import {
  assignElementArea,
  connectElements,
  createElement,
  moveElement,
} from './canvasOperations'

function populatedDocument(): CanvasDocument {
  return {
    ...createCanvasDocument('A plan'),
    viewport: { x: -120, y: 240, zoom: 0.75 },
    elements: [
      {
        id: 'rect',
        type: 'rectangle',
        x: -10,
        y: 4,
        width: 120,
        height: 80,
        color: '#123aBc',
        fill: null,
        text: '',
        fontSize: 20,
        layerId: 'layer-main',
        areaId: null,
      },
      {
        id: 'ellipse',
        type: 'ellipse',
        x: 200,
        y: 4,
        width: 100,
        height: 80,
        color: '#000000',
        fill: '#FFFFFF',
        text: 'Within a shape',
        fontSize: 20,
        layerId: 'layer-main',
        areaId: null,
      },
      {
        id: 'label',
        type: 'text',
        x: 20,
        y: 30,
        width: 80,
        height: 40,
        text: '<script>literal</script>\nSecond line\t✓',
        color: '#AABBCC',
        fontSize: 24,
        layerId: 'layer-main',
        areaId: null,
      },
      {
        id: 'edge',
        type: 'line',
        x: 100,
        y: 50,
        x2: 250,
        y2: -70,
        color: '#FF0000',
        layerId: 'layer-main',
        areaId: null,
      },
    ],
  }
}

describe('LCANVAS version 2', () => {
  it('retains endpoint sides in v2 while accepting earlier connections without them', () => {
    const document = connectElements(populatedDocument(), 'rect', 'ellipse', {
      id: 'link',
      fromSide: 'bottom',
      toSide: 'top',
    })
    expect(parseLCANVAS(serializeLCANVAS(document))).toEqual(document)
    const legacyConnection = { ...document.elements.at(-1)! }
    if (legacyConnection.type !== 'connection')
      throw new Error('Missing connection')
    delete legacyConnection.fromSide
    delete legacyConnection.toSide
    const legacy = {
      ...document,
      elements: [...document.elements.slice(0, -1), legacyConnection],
    }
    expect(validateCanvasDocument(legacy).elements.at(-1)).toMatchObject({
      fromSide: 'right',
      toSide: 'left',
    })
    expect(legacyConnection).not.toHaveProperty('fromSide')
    expect(legacyConnection).not.toHaveProperty('toSide')
    for (const patch of [
      { fromSide: 'center' },
      { toSide: null },
      { fromSide: undefined },
      { fromSide: 'left', arbitrary: true },
    ]) {
      expect(() =>
        validateCanvasDocument({
          ...document,
          elements: [
            ...document.elements.slice(0, -1),
            { ...legacyConnection, ...patch },
          ],
        }),
      ).toThrow()
    }
  })
  it('normalizes legacy links once from loaded geometry before object movement', () => {
    const original = connectElements(populatedDocument(), 'rect', 'ellipse', {
      id: 'legacy-link',
    })
    const legacyLink = { ...original.elements.at(-1)! }
    if (legacyLink.type !== 'connection') throw new Error('Missing connection')
    delete legacyLink.fromSide
    delete legacyLink.toSide
    const raw = JSON.stringify({
      ...original,
      elements: [...original.elements.slice(0, -1), legacyLink],
    })
    const loaded = parseLCANVAS(raw)
    const edge = loaded.elements.at(-1)!
    if (edge.type !== 'connection') throw new Error('Missing connection')
    const before = connectionEndpoints(loaded, edge)
    const moved = moveElement(loaded, 'ellipse', -350, 500)
    const after = connectionEndpoints(moved, edge)
    expect(edge).toMatchObject({ fromSide: 'right', toSide: 'left' })
    expect({ x: after.x1, y: after.y1 }).toEqual({ x: before.x1, y: before.y1 })
    expect({ x: after.x2, y: after.y2 }).toEqual({ x: -350, y: 540 })
    expect(parseLCANVAS(serializeLCANVAS(moved))).toEqual(moved)
    expect(JSON.parse(raw).elements.at(-1)).not.toHaveProperty('fromSide')
    expect(JSON.parse(raw).elements.at(-1)).not.toHaveProperty('toSide')
  })

  it('preserves explicit auto sides while normalizing only the missing side', () => {
    const original = connectElements(populatedDocument(), 'rect', 'ellipse', {
      id: 'mixed-link',
      fromSide: 'auto',
      toSide: 'auto',
    })
    const legacyLink = { ...original.elements.at(-1)! }
    if (legacyLink.type !== 'connection') throw new Error('Missing connection')
    delete legacyLink.toSide
    const loaded = validateCanvasDocument({
      ...original,
      elements: [...original.elements.slice(0, -1), legacyLink],
    })
    const edge = loaded.elements.at(-1)!
    if (edge.type !== 'connection') throw new Error('Missing connection')
    expect(edge).toMatchObject({ fromSide: 'auto', toSide: 'left' })
    const before = connectionEndpoints(loaded, edge)
    const moved = moveElement(loaded, 'ellipse', -350, 500)
    const after = connectionEndpoints(moved, edge)
    expect({ x: after.x1, y: after.y1 }).not.toEqual({
      x: before.x1,
      y: before.y1,
    })
    expect({ x: after.x2, y: after.y2 }).toEqual({ x: -350, y: 540 })
    expect(validateCanvasDocument(original)).toEqual(original)
  })
  it('migrates validated version 1 shapes, labels, lines and view into Main without mutating input', () => {
    const legacy = {
      format: 'LCANVAS',
      version: 1,
      name: 'Old',
      viewport: { x: 30, y: 90, zoom: 2 },
      elements: [
        {
          id: 'old-shape',
          type: 'rectangle',
          x: 10,
          y: 20,
          width: 100,
          height: 90,
          color: '#112233',
          fill: null,
        },
        {
          id: 'old-text',
          type: 'text',
          x: -10,
          y: -20,
          width: 100,
          height: 90,
          color: '#112233',
          text: 'Preserved',
          fontSize: 32,
        },
        {
          id: 'old-line',
          type: 'line',
          x: 0,
          y: 10,
          x2: 90,
          y2: -80,
          color: '#112233',
        },
      ],
    }
    const original = JSON.stringify(legacy)
    const migrated = parseLCANVAS(original)
    expect(migrated.version).toBe(2)
    expect(migrated.viewport).toEqual(legacy.viewport)
    expect(migrated.layers).toEqual([
      { id: 'layer-main', name: 'Main', visible: true, locked: false },
    ])
    expect(migrated.elements[0]).toMatchObject({
      ...legacy.elements[0],
      text: '',
      fontSize: 20,
      layerId: 'layer-main',
      areaId: null,
    })
    expect(migrated.elements[1]).toMatchObject(legacy.elements[1])
    expect(JSON.stringify(legacy)).toBe(original)
    expect(parseLCANVAS(serializeLCANVAS(migrated))).toEqual(migrated)
    expect(() =>
      validateCanvasDocument({
        ...legacy,
        elements: [{ ...legacy.elements[0], onclick: 'bad' }],
      }),
    ).toThrow()
  })

  it('round-trips diamond labels, area relationships, explicit layers and bound connection styles', () => {
    let document = createCanvasDocument('Organized')
    document = createElement(document, {
      id: 'area',
      type: 'area',
      x: 0,
      y: 0,
      width: 600,
      height: 500,
      name: 'Planning',
      fill: '#102030',
    })
    document = createElement(document, {
      id: 'diamond',
      type: 'diamond',
      x: 40,
      y: 70,
      width: 140,
      height: 100,
      text: 'Decision',
      areaId: 'area',
    })
    document = createElement(document, {
      id: 'text',
      type: 'text',
      x: 300,
      y: 70,
      width: 140,
      height: 100,
      text: 'Result',
      areaId: 'area',
    })
    document = connectElements(document, 'diamond', 'text', {
      id: 'connection',
      style: 'elbow',
      startArrow: true,
      endArrow: false,
      areaId: 'area',
    })
    expect(parseLCANVAS(serializeLCANVAS(document))).toEqual(document)
  })

  it('rejects unknown layers, empty layers, duplicate layers, nesting and dangling bound connections', () => {
    const document = populatedDocument()
    expect(() => validateCanvasDocument({ ...document, layers: [] })).toThrow(
      '1–100',
    )
    expect(() =>
      validateCanvasDocument({
        ...document,
        layers: [document.layers[0], document.layers[0]],
      }),
    ).toThrow('duplicate')
    expect(() =>
      validateCanvasDocument({
        ...document,
        elements: [{ ...document.elements[0], layerId: 'missing' }],
      }),
    ).toThrow('unknown layer')
    expect(() => connectElements(document, 'rect', 'missing')).toThrow(
      'no longer exists',
    )
    const withArea = createElement(document, {
      id: 'area',
      type: 'area',
      x: -100,
      y: -100,
      width: 600,
      height: 600,
    })
    expect(() => assignElementArea(withArea, 'area', 'area')).toThrow('nested')
    expect(() => assignElementArea(withArea, 'rect', 'missing')).toThrow(
      'no longer exists',
    )
    const nestedArea = { ...withArea.elements.at(-1), areaId: 'area' }
    expect(() =>
      validateCanvasDocument({
        ...withArea,
        elements: [...document.elements, nestedArea],
      }),
    ).toThrow('nested')
  })
  it('round-trips every supported element and viewport without executing text', () => {
    const document = populatedDocument()
    expect(parseLCANVAS(serializeLCANVAS(document))).toEqual(document)
    expect(document.elements[2]).toHaveProperty(
      'text',
      '<script>literal</script>\nSecond line\t✓',
    )
  })

  it('returns independent validated objects and creates genuinely blank files', () => {
    const source = populatedDocument()
    const parsed = validateCanvasDocument(source)
    parsed.viewport.x = 0
    parsed.elements[0].color = '#ABCDEF'
    expect(source.viewport.x).toBe(-120)
    expect(source.elements[0].color).toBe('#123aBc')
    expect(createCanvasDocument('  First  ')).toEqual({
      format: 'LCANVAS',
      version: 2,
      name: 'First',
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: [],
      layers: [
        { id: 'layer-main', name: 'Main', visible: true, locked: false },
      ],
    })
  })

  it.each(['{broken', 'null', '[]', '{}', '{"format":"OTHER","version":1}'])(
    'rejects malformed/non-LCANVAS content: %s',
    (raw) => expect(() => parseLCANVAS(raw)).toThrow(),
  )

  it.each([0, 3, '1', null])('rejects unsupported versions: %j', (version) => {
    expect(() =>
      validateCanvasDocument({ ...populatedDocument(), version }),
    ).toThrow('version is not supported')
  })

  it.each([
    { extra: true },
    { viewport: { x: 0, y: 0, zoom: 1, url: 'https://example.com' } },
    { elements: [{ ...populatedDocument().elements[0], onclick: 'execute' }] },
  ])(
    'rejects unknown fields rather than silently removing them: %j',
    (overrides) => {
      expect(() =>
        validateCanvasDocument({ ...populatedDocument(), ...overrides }),
      ).toThrow()
    },
  )

  it.each(['', '  ', 'a'.repeat(121), 'bad\nname'])(
    'rejects invalid names',
    (name) => {
      expect(() => createCanvasDocument(name)).toThrow()
    },
  )

  it.each([
    { x: Number.NaN, y: 0, zoom: 1 },
    { x: Infinity, y: 0, zoom: 1 },
    { x: 1_000_001, y: 0, zoom: 1 },
    { x: 0, y: 0, zoom: 0.09 },
    { x: 0, y: 0, zoom: 4.01 },
    { x: 0, y: 0, zoom: '1' },
  ])('rejects invalid view coordinates or zoom', (viewport) => {
    expect(() =>
      validateCanvasDocument({ ...populatedDocument(), viewport }),
    ).toThrow()
  })

  it.each([
    { id: '' },
    { id: ' trailing ' },
    { id: 'a\u0000b' },
    { x: Number.NaN },
    { height: 0 },
    { width: -1 },
    { width: 1_000_001 },
    { color: 'url(https://example.com)' },
    { color: '#fff' },
    { fill: 'red' },
    { type: 'image' },
  ])('rejects unsafe or unsupported element fields', (overrides) => {
    const document = populatedDocument()
    document.elements[0] = {
      ...document.elements[0],
      ...overrides,
    } as CanvasElement
    expect(() => validateCanvasDocument(document)).toThrow()
  })

  it('rejects duplicate identifiers, invalid line endpoints, and oversized element arrays', () => {
    const document = populatedDocument()
    expect(() =>
      validateCanvasDocument({
        ...document,
        elements: [document.elements[0], document.elements[0]],
      }),
    ).toThrow('duplicate')
    expect(() =>
      validateCanvasDocument({
        ...document,
        elements: [{ ...document.elements[3], x2: Infinity }],
      }),
    ).toThrow('end coordinates')
    expect(() =>
      validateCanvasDocument({
        ...document,
        elements: Array.from({ length: 5001 }, (_, index) => ({
          ...document.elements[0],
          id: `item-${index}`,
        })),
      }),
    ).toThrow('5,000')
  })

  it.each([
    { text: 'x'.repeat(20_001) },
    { text: 'bad\u0000text' },
    { fontSize: 7 },
    { fontSize: 161 },
  ])('rejects invalid text properties', (overrides) => {
    const document = populatedDocument()
    expect(() =>
      validateCanvasDocument({
        ...document,
        elements: [{ ...document.elements[2], ...overrides }],
      }),
    ).toThrow()
  })

  it('measures import size in UTF-8 bytes, including non-ASCII text', () => {
    const oversized = '🙂'.repeat(LCANVAS_MAX_BYTES / 4 + 1)
    expect(oversized.length).toBeLessThan(LCANVAS_MAX_BYTES)
    expect(() => parseLCANVAS(oversized)).toThrow('10 MiB')
  })

  it('can export and re-import a valid compact document close to the byte limit', () => {
    const text = 'x'.repeat(20_000)
    const document = {
      ...createCanvasDocument('Near the limit'),
      elements: Array.from({ length: 520 }, (_, index) => ({
        id: `text-${index}`,
        type: 'text' as const,
        x: 0,
        y: index,
        width: 100,
        height: 30,
        color: '#000000',
        fontSize: 16,
        text,
        layerId: 'layer-main',
        areaId: null,
      })),
    }
    const serialized = serializeLCANVAS(document)
    const size = new TextEncoder().encode(serialized).byteLength
    expect(size).toBeGreaterThan(LCANVAS_MAX_BYTES * 0.99)
    expect(size).toBeLessThanOrEqual(LCANVAS_MAX_BYTES)
    expect(parseLCANVAS(serialized)).toEqual(document)
  })

  it.each([
    ['My Plan', 'My Plan.CLF'],
    ['A/B: draft?', 'A-B- draft-.CLF'],
    ['CON', 'Canvas-CON.CLF'],
    ['LPT1.notes', 'Canvas-LPT1.notes.CLF'],
    ['existing.LCANVAS', 'existing.CLF'],
    ['existing.clf', 'existing.CLF'],
    ['existing.CLF.lcanvas', 'existing.CLF'],
    ['...', 'Canvas.CLF'],
  ])(
    'produces portable Windows-safe export filenames: %s',
    (name, expected) => {
      expect(canvasExportFilename(name)).toBe(expected)
    },
  )
})
