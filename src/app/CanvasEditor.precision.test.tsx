import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CanvasEditor from './CanvasEditor'
import CanvasControlOptions from './CanvasControlOptions'
import {
  DEFAULT_CANVAS_CONTROLS,
  type CanvasControlSettings,
} from './canvasControls'
import { createCanvasDocument, type CanvasDocument } from './lcanvas'
import { createElement } from './canvasOperations'
import { CANVAS_CLIPBOARD_MIME, createCanvasClipboard } from './canvasClipboard'
import { DEFAULT_ITEM_PRESENTATION } from './itemPresentation'

function document() {
  return createElement(
    createElement(createCanvasDocument('Precision'), {
      id: 'a',
      type: 'rectangle',
      x: 10,
      y: 20,
      width: 140,
      height: 100,
    }),
    { id: 'b', type: 'diamond', x: 190, y: 30, width: 100, height: 80 },
  )
}

function mount(
  options: Partial<CanvasControlSettings> = {},
  board = document(),
) {
  const onDocumentChange = vi.fn()
  const controls = { ...DEFAULT_CANVAS_CONTROLS, ...options }
  const result = render(
    <CanvasEditor
      document={board}
      grid="dots"
      aiOpen={false}
      onToggleAI={() => {}}
      onDocumentChange={onDocumentChange}
      controlOptions={controls}
    />,
  )
  const stage = screen.getByRole('region', { name: 'Precision canvas view' })
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 600,
    bottom: 400,
    width: 600,
    height: 400,
    toJSON: () => ({}),
  })
  const object = (id: string) =>
    result.container.querySelector(`[data-element-id="${id}"]`)!
  function selectAll() {
    fireEvent.keyDown(stage, { key: 'a', ctrlKey: true })
  }
  return {
    ...result,
    stage,
    object,
    selectAll,
    onDocumentChange,
    latest: (): CanvasDocument => onDocumentChange.mock.lastCall?.[0] ?? board,
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('PointerEvent', MouseEvent)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('canvas precision gestures', () => {
  it('shows every selected member while the transparent marquee is still moving', () => {
    const test = mount({
      selectionFill: '#ff0000',
      selectionOpacity: 0.12,
      selectionStroke: '#00ff00',
      selectionDashed: true,
      selectionStrokeWidth: 3,
    })
    fireEvent.pointerDown(test.stage, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(test.stage, { clientX: 320, clientY: 160 })
    act(() => {
      vi.advanceTimersByTime(20)
    })
    const marquee = screen.getByTestId('canvas-marquee')
    expect(marquee).toHaveAttribute('fill', '#ff0000')
    expect(marquee).toHaveAttribute('fill-opacity', '0.12')
    expect(marquee).toHaveAttribute('stroke', '#00ff00')
    expect(marquee).toHaveAttribute('stroke-dasharray', '5 4')
    expect(
      test.container.querySelectorAll('[data-selection-member]'),
    ).toHaveLength(2)
    expect(test.object('a')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.pointerUp(test.stage, { clientX: 320, clientY: 160 })
    expect(screen.queryByTestId('canvas-marquee')).not.toBeInTheDocument()
    expect(
      test.container.querySelectorAll('[data-selection-member]'),
    ).toHaveLength(2)
    expect(test.onDocumentChange).not.toHaveBeenCalled()
  })

  it('selects touched objects when configured, and restores selection on Escape', () => {
    const test = mount({ selectionBehavior: 'intersect' })
    fireEvent.pointerDown(test.stage, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(test.stage, { clientX: 30, clientY: 40 })
    act(() => {
      vi.advanceTimersByTime(20)
    })
    expect(test.object('a')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.keyDown(test.stage, { key: 'Escape' })
    expect(test.object('a')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('canvas-marquee')).not.toBeInTheDocument()
  })

  it('snaps a group anchor, preserves relative positions, and undoes once', () => {
    const test = mount({ snapToGrid: true })
    test.selectAll()
    fireEvent.pointerDown(test.object('a'), {
      button: 0,
      clientX: 30,
      clientY: 30,
    })
    fireEvent.pointerMove(test.stage, { clientX: 47, clientY: 45 })
    fireEvent.pointerUp(test.stage, { clientX: 47, clientY: 45 })
    expect(test.latest().elements[0]).toMatchObject({ x: 24, y: 24 })
    expect(test.latest().elements[1]).toMatchObject({ x: 204, y: 34 })
    expect(test.onDocumentChange).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(test.latest().elements[0]).toMatchObject({ x: 10, y: 20 })
  })

  it('bypasses snapping with Alt during object movement instead of panning', () => {
    const test = mount({ snapToGrid: true })
    fireEvent.pointerDown(test.object('a'), {
      button: 0,
      clientX: 30,
      clientY: 30,
      altKey: true,
    })
    fireEvent.pointerMove(test.stage, {
      clientX: 47,
      clientY: 45,
      altKey: true,
    })
    fireEvent.pointerUp(test.stage, { clientX: 47, clientY: 45, altKey: true })
    expect(test.latest().elements[0]).toMatchObject({ x: 27, y: 35 })
    expect(test.latest().viewport).toEqual({ x: 0, y: 0, zoom: 1 })
  })

  it('snaps only the resized edge and keeps its opposite corner anchored', () => {
    const test = mount({ snapToGrid: true })
    fireEvent.pointerDown(test.object('a'), {
      button: 0,
      clientX: 30,
      clientY: 30,
    })
    fireEvent.pointerUp(test.stage, { clientX: 30, clientY: 30 })
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Resize selected object' }),
      { button: 0, clientX: 150, clientY: 120 },
    )
    fireEvent.pointerMove(test.stage, { clientX: 163, clientY: 133 })
    fireEvent.pointerUp(test.stage, { clientX: 163, clientY: 133 })
    expect(test.latest().elements[0]).toMatchObject({
      x: 10,
      y: 20,
      width: 158,
      height: 124,
    })
  })

  it('snaps creation and paste as a group without reshaping copied contents', () => {
    const test = mount({ snapToGrid: true })
    fireEvent.click(screen.getByRole('button', { name: 'Add rectangle' }))
    const created = test.latest().elements.at(-1)!
    if (created.type === 'connection') throw new Error('Expected a rectangle')
    expect(created.x % 24).toBe(0)
    expect(created.y % 24).toBe(0)
    const raw = createCanvasClipboard(document(), ['a', 'b'])!
    fireEvent.paste(test.stage, {
      clipboardData: {
        getData: (type: string) => (type === CANVAS_CLIPBOARD_MIME ? raw : ''),
      },
    })
    const pasted = test
      .latest()
      .elements.slice(-2)
      .filter((item) => item.type !== 'connection')
    expect(pasted[0]).toMatchObject({ width: 140, height: 100 })
    expect(pasted[0].x % 24).toBe(0)
    expect(pasted[1].x - pasted[0].x).toBe(180)
    expect(pasted[1].y - pasted[0].y).toBe(10)
  })

  it('uses one-grid keyboard nudges with a precise Alt override', () => {
    const test = mount({ snapToGrid: true })
    test.selectAll()
    fireEvent.keyDown(test.stage, { key: 'ArrowRight' })
    expect(test.latest().elements[0]).toMatchObject({ x: 24, y: 20 })
    fireEvent.keyDown(test.stage, { key: 'ArrowRight', altKey: true })
    expect(test.latest().elements[0]).toMatchObject({ x: 25, y: 20 })
  })

  it('shows optional metric rulers and multiplier zoom while keeping the world grid aligned', () => {
    const test = mount({
      rulers: true,
      rulerUnit: 'mm',
      zoomUnit: 'multiplier',
      gridSpacing: 32,
    })
    expect(
      screen.getByRole('img', { name: 'Canvas rulers in millimeters' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Canvas zoom')).toHaveTextContent('1×')
    expect(test.stage.style.getPropertyValue('--canvas-grid-size')).toBe('32px')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByLabelText('Canvas zoom')).toHaveTextContent('1.2×')
  })
})

describe('precision options', () => {
  it('offers selection, grid, rulers and zoom settings with bounded values', () => {
    const changed = vi.fn()
    render(
      <CanvasControlOptions
        value={DEFAULT_CANVAS_CONTROLS}
        onChange={changed}
      />,
    )
    fireEvent.click(screen.getByLabelText('Snap to grid'))
    expect(changed).toHaveBeenLastCalledWith({
      ...DEFAULT_CANVAS_CONTROLS,
      snapToGrid: true,
    })
    fireEvent.change(screen.getByLabelText('Grid spacing in pixels'), {
      target: { value: 99999 },
    })
    expect(changed.mock.lastCall?.[0].gridSpacing).toBe(1000)
    fireEvent.change(screen.getByLabelText('Selection behavior'), {
      target: { value: 'intersect' },
    })
    expect(changed.mock.lastCall?.[0].selectionBehavior).toBe('intersect')
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset canvas controls' }),
    )
    expect(changed).toHaveBeenLastCalledWith(DEFAULT_CANVAS_CONTROLS)
  })

  it('keeps updated card metadata separate from drawing undo and pending edits', () => {
    const board = document()
    const changed = vi.fn()
    const ready = vi.fn()
    const props = {
      grid: 'dots' as const,
      aiOpen: false,
      onToggleAI: () => {},
      onDocumentChange: changed,
      onControllerReady: ready,
    }
    const test = render(<CanvasEditor {...props} document={board} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add rectangle' }))
    expect(changed.mock.lastCall?.[0].elements).toHaveLength(3)
    const presentation = {
      ...DEFAULT_ITEM_PRESENTATION,
      color: '#FF0000',
      description: 'Updated card',
    }
    test.rerender(
      <CanvasEditor {...props} document={{ ...board, presentation }} />,
    )
    const controller = ready.mock.lastCall?.[0]
    expect(controller.getDocument().elements).toHaveLength(3)
    expect(controller.getDocument().presentation).toEqual(presentation)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(changed.mock.lastCall?.[0].elements).toHaveLength(2)
    expect(changed.mock.lastCall?.[0].presentation).toEqual(presentation)
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(changed.mock.lastCall?.[0].elements).toHaveLength(3)
    expect(changed.mock.lastCall?.[0].presentation).toEqual(presentation)
  })
})
