import { describe, expect, it } from 'vitest'
import {
  canvasExportFilename,
  createCanvasDocument,
  LCANVAS_MAX_BYTES,
  parseLCANVAS,
  serializeLCANVAS,
  validateCanvasDocument,
  type CanvasDocument,
  type CanvasElement,
} from './lcanvas'

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
      },
      {
        id: 'edge',
        type: 'line',
        x: 100,
        y: 50,
        x2: 250,
        y2: -70,
        color: '#FF0000',
      },
    ],
  }
}

describe('LCANVAS version 1', () => {
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
      version: 1,
      name: 'First',
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: [],
    })
  })

  it.each(['{broken', 'null', '[]', '{}', '{"format":"OTHER","version":1}'])(
    'rejects malformed/non-LCANVAS content: %s',
    (raw) => expect(() => parseLCANVAS(raw)).toThrow(),
  )

  it.each([0, 2, '1', null])('rejects unsupported versions: %j', (version) => {
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
      })),
    }
    const serialized = serializeLCANVAS(document)
    const size = new TextEncoder().encode(serialized).byteLength
    expect(size).toBeGreaterThan(LCANVAS_MAX_BYTES * 0.99)
    expect(size).toBeLessThanOrEqual(LCANVAS_MAX_BYTES)
    expect(parseLCANVAS(serialized)).toEqual(document)
  })

  it.each([
    ['My Plan', 'My Plan.lcanvas'],
    ['A/B: draft?', 'A-B- draft-.lcanvas'],
    ['CON', 'Canvas-CON.lcanvas'],
    ['LPT1.notes', 'Canvas-LPT1.notes.lcanvas'],
    ['existing.LCANVAS', 'existing.lcanvas'],
    ['...', 'Canvas.lcanvas'],
  ])(
    'produces portable Windows-safe export filenames: %s',
    (name, expected) => {
      expect(canvasExportFilename(name)).toBe(expected)
    },
  )
})
