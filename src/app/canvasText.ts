import type { CanvasDocument, CanvasElement, TextFormat } from './lcanvas'
import { COORDINATE_LIMIT } from './lcanvas'
import { isElementEditable, updateElement } from './canvasOperations'

export type TextLayoutOptions = {
  autoGrowShapes: boolean
  fitTextToShape: boolean
  minTextSize: number
}

export const DEFAULT_TEXT_OPTIONS: TextLayoutOptions = {
  autoGrowShapes: true,
  fitTextToShape: true,
  minTextSize: 8,
}

export type TextElement = Extract<CanvasElement, { text: string }>
export type TextBox = { x: number; y: number; width: number; height: number }
export type TextLayout = {
  box: TextBox
  lines: string[]
  fontSize: number
  lineHeight: number
  height: number
  width: number
  overflow: boolean
}

export function canvasFontFamily(
  element: Pick<TextFormat, 'fontFamily'>,
): string {
  switch (element.fontFamily) {
    case 'serif':
      return 'Georgia, "Times New Roman", serif'
    case 'mono':
      return 'Consolas, "Courier New", monospace'
    case 'cursive':
      return '"Comic Sans MS", cursive'
    default:
      return '"Segoe UI", system-ui, sans-serif'
  }
}
let measureContext: OffscreenCanvasRenderingContext2D | null | undefined

/** Measurement is local. The fallback also works without a browser canvas. */
function glyphWidth(
  text: string,
  fontSize: number,
  format: TextFormat = {},
): number {
  if (measureContext === undefined) {
    try {
      measureContext =
        typeof OffscreenCanvas === 'undefined'
          ? null
          : new OffscreenCanvas(1, 1).getContext('2d')
    } catch {
      measureContext = null
    }
  }
  if (measureContext) {
    measureContext.font = `${format.fontStyle ?? 'normal'} ${format.fontWeight ?? 'normal'} ${fontSize}px ${canvasFontFamily(format)}`
    // A small allowance keeps SVG and textarea wrapping safely in agreement.
    return measureContext.measureText(text).width * 1.025
  }
  if (format.fontFamily === 'mono') return fontSize * 0.62
  const weight = format.fontWeight === 'bold' ? 1.08 : 1
  if (/^\s+$/u.test(text)) return fontSize * 0.34 * weight
  if (/^[ilI.,'`:;!|]$/u.test(text)) return fontSize * 0.3
  if (/^[MW@#%]$/u.test(text)) return fontSize * 0.9
  return (
    fontSize *
    weight *
    (Array.from(text).some((character) => character.codePointAt(0)! > 0x24f)
      ? 1
      : 0.56)
  )
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Wrap words, explicit lines and unbroken Unicode without deleting content. */
export function wrapCanvasText(
  text: string,
  width: number,
  fontSize: number,
  format: TextFormat = {},
): string[] {
  const available = Math.max(1, width)
  const cache = new Map<string, number>()
  const measured = (value: string) => {
    let result = cache.get(value)
    if (result === undefined) {
      result = glyphWidth(value, fontSize, format)
      cache.set(value, result)
    }
    return result
  }
  const lines: string[] = []
  for (const paragraph of text.replace(/\r\n?/gu, '\n').split('\n')) {
    let line: string[] = []
    let currentWidth = 0
    for (const { segment } of segmenter.segment(
      paragraph.replace(/\t/gu, '    '),
    )) {
      const size = measured(segment)
      if (line.length && currentWidth + size > available) {
        const breakAt = line.findLastIndex((part) => /^\s$/u.test(part))
        if (breakAt > 0) {
          lines.push(line.slice(0, breakAt).join(''))
          line = line.slice(breakAt + 1)
          currentWidth = line.reduce((sum, part) => sum + measured(part), 0)
        }
        if (line.length && currentWidth + size > available) {
          lines.push(line.join(''))
          line = []
          currentWidth = 0
        }
      }
      line.push(segment)
      currentWidth += size
    }
    lines.push(line.join(''))
  }
  return lines
}

export function normalizeTextOptions(
  options: Partial<TextLayoutOptions> = {},
): TextLayoutOptions {
  return {
    autoGrowShapes:
      options.autoGrowShapes ?? DEFAULT_TEXT_OPTIONS.autoGrowShapes,
    fitTextToShape:
      options.fitTextToShape ?? DEFAULT_TEXT_OPTIONS.fitTextToShape,
    minTextSize:
      typeof options.minTextSize === 'number' &&
      Number.isFinite(options.minTextSize)
        ? Math.min(32, Math.max(8, options.minTextSize))
        : DEFAULT_TEXT_OPTIONS.minTextSize,
  }
}

function insetFactor(element: TextElement) {
  // These centered rectangles stay within the sloped/curved outline.
  return element.type === 'star'
    ? 0.35
    : element.type === 'triangle'
      ? 0.45
      : ['pentagon', 'hexagon', 'parallelogram', 'trapezoid'].includes(
            element.type,
          )
        ? 0.65
        : element.type === 'cylinder'
          ? 0.75
          : element.type === 'diamond'
            ? 0.5
            : element.type === 'ellipse'
              ? Math.SQRT1_2
              : 1
}

export function canvasTextBox(element: TextElement): TextBox {
  const factor = insetFactor(element)
  const padding = element.type === 'text' ? 0 : 12
  const width = Math.max(1, element.width * factor - padding * 2)
  const height = Math.max(1, element.height * factor - padding * 2)
  return {
    x: element.x + (element.width - width) / 2,
    y: element.y + (element.height - height) / 2,
    width,
    height,
  }
}

function measureCanvasTextLayout(
  element: TextElement,
  options: Partial<TextLayoutOptions> = DEFAULT_TEXT_OPTIONS,
): TextLayout {
  const settings = normalizeTextOptions(options)
  const box = canvasTextBox(element)
  const make = (fontSize: number) => {
    const lines = wrapCanvasText(element.text, box.width, fontSize, element)
    const lineHeight = fontSize * 1.3
    const height = lines.length * lineHeight
    const widths = new Map<string, number>()
    const measure = (line: string) => {
      let width = 0
      for (const { segment } of segmenter.segment(line)) {
        if (!widths.has(segment))
          widths.set(segment, glyphWidth(segment, fontSize, element))
        width += widths.get(segment)!
      }
      return width
    }
    const width = lines.reduce((max, line) => Math.max(max, measure(line)), 0)
    return {
      box,
      lines,
      fontSize,
      lineHeight,
      height,
      width,
      overflow: height > box.height + 0.01 || width > box.width + 0.01,
    }
  }
  const original = make(element.fontSize)
  if (!settings.fitTextToShape || !original.overflow || !element.text)
    return original
  let low = Math.min(element.fontSize, settings.minTextSize)
  let high = element.fontSize
  let best = make(low)
  // Content remains visible if even the minimum size cannot fit the shape.
  if (best.overflow) return best
  for (let step = 0; step < 8; step++) {
    const candidate = (low + high) / 2
    const layout = make(candidate)
    if (layout.overflow) high = candidate
    else {
      low = candidate
      best = layout
    }
  }
  return best
}

const layoutCache = new WeakMap<TextElement, Map<string, TextLayout>>()

/** Camera movement reuses text layouts instead of remeasuring unchanged objects. */
export function layoutCanvasText(
  element: TextElement,
  options: Partial<TextLayoutOptions> = DEFAULT_TEXT_OPTIONS,
): TextLayout {
  const settings = normalizeTextOptions(options)
  const key = `${settings.fitTextToShape}:${settings.minTextSize}`
  const entries = layoutCache.get(element)
  const cached = entries?.get(key)
  if (cached) return cached
  const measured = measureCanvasTextLayout(element, settings)
  const next = entries ?? new Map<string, TextLayout>()
  if (next.size >= 4) next.clear()
  next.set(key, measured)
  layoutCache.set(element, next)
  return measured
}

/** SVG and the text editor share the same horizontal and vertical anchors. */
export function canvasTextPlacement(element: TextElement, layout: TextLayout) {
  const horizontal =
    element.textAlign ?? (element.type === 'text' ? 'left' : 'center')
  const vertical =
    element.verticalAlign ?? (element.type === 'text' ? 'top' : 'middle')
  const x =
    layout.box.x +
    (horizontal === 'right'
      ? layout.box.width
      : horizontal === 'center'
        ? layout.box.width / 2
        : 0)
  const y =
    layout.box.y +
    (vertical === 'bottom'
      ? Math.max(0, layout.box.height - layout.height)
      : vertical === 'middle'
        ? Math.max(0, (layout.box.height - layout.height) / 2)
        : 0)
  return {
    x,
    y,
    textAnchor:
      horizontal === 'left'
        ? ('start' as const)
        : horizontal === 'right'
          ? ('end' as const)
          : ('middle' as const),
  }
}

/** Grow from the anchored top-left only while content/font changes, never on drag. */
export function growCanvasText(
  element: TextElement,
  options: Partial<TextLayoutOptions> = DEFAULT_TEXT_OPTIONS,
): TextElement {
  if (!normalizeTextOptions(options).autoGrowShapes || !element.text)
    return element
  const factor = insetFactor(element)
  const padding = element.type === 'text' ? 0 : 12
  const width = Math.min(
    COORDINATE_LIMIT,
    Math.max(element.width, (element.fontSize * 3 + padding * 2) / factor),
  )
  const lines = wrapCanvasText(
    element.text,
    Math.max(1, width * factor - padding * 2),
    element.fontSize,
    element,
  )
  const height = Math.min(
    COORDINATE_LIMIT,
    Math.max(
      element.height,
      Math.ceil((lines.length * element.fontSize * 1.3 + padding * 2) / factor),
    ),
  )
  return width === element.width && height === element.height
    ? element
    : { ...element, width, height }
}

/** Keep text changes and validated geometry together in a single history entry. */
export function adaptCanvasText(
  before: CanvasDocument,
  next: CanvasDocument,
  options: Partial<TextLayoutOptions> = DEFAULT_TEXT_OPTIONS,
): CanvasDocument {
  if (!normalizeTextOptions(options).autoGrowShapes) return next
  const previous = new Map(
    before.elements.map((element) => [element.id, element]),
  )
  let adapted = next
  for (const element of next.elements) {
    if (!('text' in element) || !isElementEditable(adapted, element.id))
      continue
    const old = previous.get(element.id)
    if (
      old &&
      'text' in old &&
      old.text === element.text &&
      old.fontSize === element.fontSize &&
      old.fontFamily === element.fontFamily &&
      old.fontWeight === element.fontWeight &&
      old.fontStyle === element.fontStyle
    )
      continue
    const grown = growCanvasText(element, options)
    if (grown !== element) {
      // Existing operations preserve area/connection membership and lock rules.
      adapted = updateElement(adapted, element.id, {
        width: grown.width,
        height: grown.height,
      })
    }
  }
  return adapted
}
