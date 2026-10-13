import { describe, expect, it } from 'vitest'
import {
  CANVAS_CLIPBOARD_MAX_BYTES,
  CANVAS_CLIPBOARD_PREFIX,
  createCanvasClipboard,
  duplicateSelection,
  isCanvasClipboard,
  parseCanvasClipboard,
  pasteCanvasClipboard,
  pasteCanvasText,
} from './canvasClipboard'
import { addLayer, assignElementLayer, updateLayer } from './canvasOperations'
import { selectionBounds } from './canvasSelection'
import {
  commitEditorHistory,
  createEditorHistory,
  undoEditorHistory,
} from './editorHistory'
import {
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
    fill: '#AAFFCC',
    text: 'Literal <script>',
    fontSize: 20,
    width: 100,
    height: 80,
  }
  return validateCanvasDocument({
    ...createCanvasDocument('Clipboard'),
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

function ids() {
  let count = 0
  return () => `pasted-${++count}`
}

function envelope(document: unknown, patch: Record<string, unknown> = {}) {
  return `${CANVAS_CLIPBOARD_PREFIX}${JSON.stringify({ format: 'Canvas Live clipboard', version: 1, document, ...patch })}`
}

describe('bounded canvas clipboard', () => {
  it('copies an area with its members and internal links, excluding external endpoints', () => {
    const source = board()
    const before = serializeLCANVAS(source)
    const raw = createCanvasClipboard(source, ['area'])!
    expect(isCanvasClipboard(raw)).toBe(true)
    const copy = parseCanvasClipboard(raw)
    expect(copy.elements.map((item) => item.id)).toEqual([
      'one',
      'two',
      'area',
      'edge',
    ])
    expect(copy.elements.find((item) => item.id === 'edge')).toMatchObject({
      fromId: 'one',
      toId: 'two',
      areaId: 'area',
      style: 'elbow',
      endArrow: true,
    })
    expect(serializeLCANVAS(source)).toBe(before)
  })

  it('copies a partial area as independent objects and includes links only with both endpoints', () => {
    const copy = parseCanvasClipboard(
      createCanvasClipboard(board(), ['one', 'two'])!,
    )
    expect(copy.elements.map((item) => item.id)).toEqual(['one', 'two', 'edge'])
    expect(copy.elements.every((item) => item.areaId === null)).toBe(true)
    expect(
      parseCanvasClipboard(
        createCanvasClipboard(board(), ['one', 'external-edge'])!,
      ).elements.map((item) => item.id),
    ).toEqual(['one'])
    expect(createCanvasClipboard(board(), ['edge'])).toBeNull()
    expect(createCanvasClipboard(board(), [])).toBeNull()
  })

  it('pastes fresh remapped identities and complete area relationships into the active layer', () => {
    const source = board()
    const target = addLayer(createCanvasDocument('Target'), 'Active', 'active')
    const result = pasteCanvasClipboard(
      target,
      createCanvasClipboard(source, ['area'])!,
      {
        layerId: 'active',
        center: { x: 1000, y: 500 },
        idFactory: ids(),
      },
    )
    expect(result.selectedIds).toEqual([
      'pasted-1',
      'pasted-2',
      'pasted-3',
      'pasted-4',
    ])
    expect(selectionBounds(result.document, result.selectedIds)).toEqual({
      x: 800,
      y: 380,
      width: 400,
      height: 240,
    })
    expect(
      result.document.elements.every((item) => item.layerId === 'active'),
    ).toBe(true)
    expect(
      result.document.elements.find((item) => item.type === 'connection'),
    ).toMatchObject({
      fromId: 'pasted-1',
      toId: 'pasted-2',
      areaId: 'pasted-3',
    })
    expect(result.document.elements[0]).toMatchObject({
      areaId: 'pasted-3',
      text: 'Literal <script>',
      fill: '#AAFFCC',
    })
    expect(result.document.viewport).toEqual(target.viewport)
    expect(target.elements).toEqual([])
    const history = commitEditorHistory(
      createEditorHistory(target),
      result.document,
    )
    expect(history.past).toHaveLength(1)
    expect(undoEditorHistory(history).present).toEqual(target)
  })

  it('duplicates a complete area at a predictable offset without touching originals', () => {
    const source = board()
    const duplicate = duplicateSelection(source, ['area', 'one'], {
      idFactory: ids(),
    })
    expect(
      duplicate.document.elements.slice(0, source.elements.length),
    ).toEqual(source.elements)
    expect(selectionBounds(duplicate.document, duplicate.selectedIds)).toEqual({
      x: 24,
      y: 24,
      width: 400,
      height: 240,
    })
    expect(duplicate.document.elements).toHaveLength(10)
  })

  it('copies protected area descendants without changing their layer protection or pulling external objects', () => {
    let source = addLayer(board(), 'Protected', 'protected')
    source = assignElementLayer(source, 'one', 'protected')
    source = updateLayer(source, 'protected', { locked: true, visible: false })
    const before = serializeLCANVAS(source)
    const pasted = pasteCanvasClipboard(
      createCanvasDocument('Target'),
      createCanvasClipboard(source, ['area'])!,
      {
        layerId: 'layer-main',
        center: { x: 0, y: 0 },
        idFactory: ids(),
      },
    )
    expect(pasted.document.elements).toHaveLength(4)
    expect(pasted.document.layers).toHaveLength(1)
    expect(serializeLCANVAS(source)).toBe(before)
  })

  it('rejects locked or hidden target layers before applying any pasted objects', () => {
    const raw = createCanvasClipboard(board(), ['one'])!
    for (const patch of [{ locked: true }, { visible: false }]) {
      const target = updateLayer(
        createCanvasDocument('Target'),
        'layer-main',
        patch,
      )
      expect(() =>
        pasteCanvasClipboard(target, raw, {
          layerId: 'layer-main',
          center: { x: 0, y: 0 },
        }),
      ).toThrow('visible, unlocked')
      expect(target.elements).toEqual([])
    }
  })

  it('retries colliding IDs and rejects factories that cannot produce fresh IDs', () => {
    const raw = createCanvasClipboard(board(), ['one'])!
    let count = 0
    const result = pasteCanvasClipboard(createCanvasDocument('Target'), raw, {
      layerId: 'layer-main',
      center: { x: 0, y: 0 },
      idFactory: () => (++count === 1 ? 'one' : 'fresh'),
    })
    expect(result.selectedIds).toEqual(['fresh'])
    expect(() =>
      pasteCanvasClipboard(board(), raw, {
        layerId: 'layer-main',
        center: { x: 0, y: 0 },
        idFactory: () => 'one',
      }),
    ).toThrow('fresh object identifier')
  })

  it('keeps pasted coordinates bounded near canvas coordinate limits', () => {
    const result = pasteCanvasClipboard(
      createCanvasDocument('Target'),
      createCanvasClipboard(board(), ['area'])!,
      {
        layerId: 'layer-main',
        center: { x: 1e20, y: -1e20 },
        offset: 100,
        idFactory: ids(),
      },
    )
    expect(() => serializeLCANVAS(result.document)).not.toThrow()
    expect(
      result.document.elements.every(
        (item) =>
          item.type === 'connection' ||
          (Math.abs(item.x) <= 1_000_000 && Math.abs(item.y) <= 1_000_000),
      ),
    ).toBe(true)
  })

  it('pastes literal multiline text as a bounded text object and leaves empty clipboard unchanged', () => {
    const target = createCanvasDocument('Target')
    const options = {
      layerId: 'layer-main',
      center: { x: 100, y: 100 },
      idFactory: ids(),
    }
    const result = pasteCanvasText(
      target,
      'Title\n<script>literal</script>',
      options,
    )
    expect(result.document.elements[0]).toMatchObject({
      type: 'text',
      text: 'Title\n<script>literal</script>',
      areaId: null,
      fontSize: 24,
    })
    expect(result.selectedIds).toEqual(['pasted-1'])
    expect(pasteCanvasText(target, '   ', options).document).toEqual(target)
    expect(() => pasteCanvasText(target, 'x'.repeat(20_001), options)).toThrow(
      '20,000',
    )
    expect(() => pasteCanvasText(target, 'bad\u0000text', options)).toThrow(
      'plain text',
    )
  })

  it.each([
    CANVAS_CLIPBOARD_PREFIX + '{',
    'Canvas Live clipboard v2\n{}',
    envelope(board(), { version: 99 }),
    envelope(board(), { command: 'shell' }),
    envelope({ ...board(), extra: 'unsupported' }),
    envelope({
      ...board(),
      elements: [{ ...board().elements[0], areaId: null, color: 'red' }],
    }),
    envelope({ ...board(), elements: [board().elements[3]] }),
    envelope({ ...board(), elements: [board().elements[0]] }),
    envelope({
      ...board(),
      elements: [...board().elements, board().elements[0]],
    }),
  ])('rejects malformed or inconsistent structured payloads', (raw) => {
    const target = createCanvasDocument('Target')
    expect(() =>
      pasteCanvasClipboard(target, raw, {
        layerId: 'layer-main',
        center: { x: 0, y: 0 },
      }),
    ).toThrow()
    expect(target.elements).toEqual([])
  })

  it('enforces byte and object limits before clipboard import or export', () => {
    expect(() =>
      parseCanvasClipboard(
        CANVAS_CLIPBOARD_PREFIX + 'x'.repeat(CANVAS_CLIPBOARD_MAX_BYTES),
      ),
    ).toThrow('2 MiB')
    expect(() =>
      parseCanvasClipboard(
        CANVAS_CLIPBOARD_PREFIX + '😀'.repeat(CANVAS_CLIPBOARD_MAX_BYTES / 3),
      ),
    ).toThrow('2 MiB')
    const shape = { ...board().elements[0], areaId: null }
    const many = validateCanvasDocument({
      ...createCanvasDocument('Many'),
      elements: Array.from({ length: 1001 }, (_, index) => ({
        ...shape,
        id: `shape-${index}`,
      })),
    })
    expect(() =>
      createCanvasClipboard(
        many,
        many.elements.map((item) => item.id),
      ),
    ).toThrow('1,000')
    expect(() => parseCanvasClipboard(envelope(many))).toThrow('1,000')
  })

  it('rejects a paste exceeding the document limit and leaves a crowded source intact', () => {
    const shape = { ...board().elements[0], areaId: null }
    const crowded = validateCanvasDocument({
      ...createCanvasDocument('Many'),
      elements: Array.from({ length: 5000 }, (_, index) => ({
        ...shape,
        id: `shape-${index}`,
      })),
    })
    expect(() =>
      pasteCanvasClipboard(crowded, createCanvasClipboard(board(), ['one'])!, {
        layerId: 'layer-main',
        center: { x: 0, y: 0 },
      }),
    ).toThrow('5,000')
    expect(crowded.elements).toHaveLength(5000)
  })
})
