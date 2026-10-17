import { describe, expect, it } from 'vitest'
import {
  adaptCanvasText,
  canvasTextBox,
  DEFAULT_TEXT_OPTIONS,
  growCanvasText,
  layoutCanvasText,
  normalizeTextOptions,
  wrapCanvasText,
  type TextElement,
} from './canvasText'
import { createCanvasDocument, validateCanvasDocument } from './lcanvas'
import {
  assignElementArea,
  connectElements,
  createElement,
  updateElement,
  updateLayer,
} from './canvasOperations'

function textShape(overrides: Partial<TextElement> = {}): TextElement {
  return {
    type: 'rectangle',
    id: 'shape',
    x: 10,
    y: 20,
    width: 180,
    height: 100,
    text: 'Readable text',
    color: '#11aabb',
    fill: '#000000',
    fontSize: 20,
    layerId: 'layer-main',
    areaId: null,
    ...overrides,
  } as TextElement
}

describe('smart canvas text', () => {
  it('wraps words and unbroken content instead of clipping a single line', () => {
    const words = 'The quick brown fox jumps over a long fence'
    const wrapped = wrapCanvasText(words, 90, 20)
    expect(wrapped.length).toBeGreaterThan(4)
    expect(wrapped.join(' ').replace(/\s+/gu, ' ')).toBe(words)
    const long = 'abcdefghijklmnop'.repeat(20)
    const unbroken = wrapCanvasText(long, 40, 20)
    expect(unbroken.length).toBeGreaterThan(30)
    expect(unbroken.join('')).toBe(long)
  })

  it('preserves explicit empty lines, Unicode graphemes, and the last line', () => {
    const value = 'a\n\n👩🏽‍💻👩🏽‍💻\n終わり'
    const lines = wrapCanvasText(value, 30, 20)
    expect(lines.slice(0, 2)).toEqual(['a', ''])
    expect(lines.filter((line) => line.includes('👩'))).toEqual(['👩🏽‍💻', '👩🏽‍💻'])
    expect(lines.join('')).toBe(value.replace(/\n/gu, ''))
  })

  it.each(['rectangle', 'ellipse', 'diamond'] as const)(
    'uses a safe text rectangle inside a %s',
    (type) => {
      const element = textShape({ type, width: 300, height: 220 })
      const box = canvasTextBox(element)
      expect(box.x).toBeGreaterThan(element.x)
      expect(box.y).toBeGreaterThan(element.y)
      if (type === 'diamond') {
        const corner =
          Math.abs(
            (box.x - (element.x + element.width / 2)) / (element.width / 2),
          ) +
          Math.abs(
            (box.y - (element.y + element.height / 2)) / (element.height / 2),
          )
        expect(corner).toBeLessThan(1)
      }
      if (type === 'ellipse') {
        const corner =
          ((box.x - (element.x + element.width / 2)) / (element.width / 2)) **
            2 +
          ((box.y - (element.y + element.height / 2)) / (element.height / 2)) **
            2
        expect(corner).toBeLessThan(1)
      }
    },
  )

  it('grows content at its chosen size without changing colors, position or font size', () => {
    const original = textShape({ text: 'One line\n'.repeat(15) })
    const grown = growCanvasText(original)
    expect(grown.height).toBeGreaterThan(original.height)
    expect(grown).toMatchObject({
      x: 10,
      y: 20,
      color: '#11aabb',
      fill: '#000000',
      fontSize: 20,
      text: original.text,
    })
    expect(layoutCanvasText(grown).overflow).toBe(false)
    expect(growCanvasText(original, { autoGrowShapes: false })).toBe(original)
  })

  it('fits manually small shapes without altering their stored font or geometry', () => {
    const element = textShape({ text: 'Small label', width: 100, height: 50 })
    const layout = layoutCanvasText(element)
    expect(layout.fontSize).toBeGreaterThanOrEqual(8)
    expect(layout.fontSize).toBeLessThan(20)
    expect(layout.overflow).toBe(false)
    expect(element).toMatchObject({ fontSize: 20, width: 100, height: 50 })
    expect(layoutCanvasText(element, { fitTextToShape: false }).fontSize).toBe(
      20,
    )
  })

  it('keeps every line visible when minimum readable size cannot fit', () => {
    const element = textShape({
      text: Array.from({ length: 40 }, (_, i) => `Line ${i}`).join('\n'),
      width: 100,
      height: 30,
    })
    const layout = layoutCanvasText(element, { minTextSize: 12 })
    expect(layout.fontSize).toBe(12)
    expect(layout.overflow).toBe(true)
    expect(layout.lines.at(-1)).toBe('Line 39')
    expect(layout.lines).toHaveLength(40)
  })

  it('reuses a measured layout while the object and text preferences stay unchanged', () => {
    const element = textShape()
    expect(layoutCanvasText(element)).toBe(
      layoutCanvasText(element, { ...DEFAULT_TEXT_OPTIONS }),
    )
    expect(layoutCanvasText(element, { minTextSize: 12 })).not.toBe(
      layoutCanvasText(element),
    )
  })

  it('normalizes invalid minimum sizes and handles the full text limit without unbounded geometry', () => {
    expect(normalizeTextOptions({ minTextSize: NaN }).minTextSize).toBe(8)
    expect(normalizeTextOptions({ minTextSize: 100 }).minTextSize).toBe(32)
    const original = textShape({
      text: '終'.repeat(20000),
      width: 30,
      height: 30,
      fontSize: 160,
    })
    const grown = growCanvasText(original)
    expect(grown.width).toBeLessThanOrEqual(1_000_000)
    expect(grown.height).toBeLessThanOrEqual(1_000_000)
    expect(layoutCanvasText(grown).lines.join('')).toBe(original.text)
  })

  it('changes geometry only with new or edited text, preserving a deliberate manual resize', () => {
    const before = { ...createCanvasDocument('Plan'), elements: [textShape()] }
    const resized = updateElement(before, 'shape', { width: 24, height: 24 })
    expect(adaptCanvasText(before, resized)).toBe(resized)
    const edited = updateElement(before, 'shape', {
      text: 'Many new lines\n'.repeat(20),
    })
    const after = adaptCanvasText(before, edited)
    expect(after.elements[0]).toMatchObject({
      text: 'Many new lines\n'.repeat(20),
      width: 180,
    })
    expect(
      'height' in after.elements[0] && after.elements[0].height,
    ).toBeGreaterThan(100)
  })

  it('keeps locked elements and newly assigned areas valid during adaptation', () => {
    let before = createElement(createCanvasDocument('Plan'), {
      type: 'area',
      id: 'area',
      x: 0,
      y: 0,
      width: 600,
      height: 250,
    })
    before = createElement(before, {
      type: 'rectangle',
      id: 'a',
      x: 10,
      y: 20,
      width: 180,
      height: 100,
    })
    before = createElement(before, {
      type: 'rectangle',
      id: 'b',
      x: 300,
      y: 20,
      width: 180,
      height: 100,
    })
    before = assignElementArea(
      assignElementArea(before, 'a', 'area'),
      'b',
      'area',
    )
    before = connectElements(before, 'a', 'b', { id: 'edge', areaId: 'area' })
    const edited = updateElement(before, 'a', { text: 'Content\n'.repeat(20) })
    const after = adaptCanvasText(before, edited)
    expect(validateCanvasDocument(after)).toEqual(after)
    expect(
      after.elements.find((element) => element.id === 'a')?.areaId,
    ).toBeNull()
    expect(
      after.elements.find((element) => element.id === 'edge')?.areaId,
    ).toBeNull()
    const locked = updateLayer(edited, 'layer-main', { locked: true })
    expect(adaptCanvasText(before, locked)).toBe(locked)
  })
})
