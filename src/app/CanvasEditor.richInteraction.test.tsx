import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CanvasEditor, {
  type CanvasEditorController,
  type CanvasEditorProps,
} from './CanvasEditor'
import { connectElements, createElement } from './canvasOperations'
import { createCanvasDocument } from './lcanvas'
import { DEFAULT_CANVAS_CONTROLS } from './canvasControls'

let frames: Map<number, FrameRequestCallback>
let nextFrame = 0
function paint() {
  act(() => {
    const callbacks = [...frames.values()]
    frames.clear()
    for (const callback of callbacks) callback(performance.now())
  })
}
function fixture() {
  let board = createCanvasDocument('Rich interactions')
  board = createElement(board, {
    id: 'a',
    type: 'rectangle',
    x: 20,
    y: 30,
    width: 140,
    height: 100,
    text: 'First',
  })
  return createElement(board, {
    id: 'b',
    type: 'rectangle',
    x: 300,
    y: 200,
    width: 140,
    height: 100,
    text: 'Second',
  })
}
function mount(document = fixture(), props: Partial<CanvasEditorProps> = {}) {
  let controller: CanvasEditorController | null = null
  const changed = vi.fn()
  const view = render(
    <CanvasEditor
      document={document}
      grid="dots"
      aiOpen={false}
      onToggleAI={vi.fn()}
      onDocumentChange={changed}
      onControllerReady={(value) => {
        controller = value
      }}
      {...props}
    />,
  )
  const stage = screen.getByRole('region', {
    name: 'Rich interactions canvas view',
  })
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
    x: 10,
    y: 20,
    left: 10,
    top: 20,
    right: 610,
    bottom: 420,
    width: 600,
    height: 400,
    toJSON: () => ({}),
  })
  const object = (id: string) =>
    view.container.querySelector(`[data-element-id="${id}"]`)!
  const select = (id: string, shiftKey = false) => {
    fireEvent.pointerDown(object(id), {
      button: 0,
      clientX: 80,
      clientY: 90,
      shiftKey,
    })
    fireEvent.pointerUp(stage, { clientX: 80, clientY: 90, shiftKey })
  }
  const openQuick = (id: string) => {
    fireEvent.contextMenu(object(id), { clientX: 100, clientY: 120 })
    return within(
      screen.getByRole('dialog', { name: 'Quick object properties' }),
    )
  }
  return {
    ...view,
    stage,
    object,
    select,
    openQuick,
    changed,
    current: () => controller!.getDocument(),
  }
}

describe('rich canvas interactions', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('PointerEvent', MouseEvent)
    frames = new Map()
    nextFrame = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback)
      return nextFrame
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  })
  it.each([
    ['left', 310],
    ['right', 450],
  ] as const)(
    'drags a side handle onto the target %s side as one undoable relationship',
    (side, x) => {
      const test = mount()
      test.select('a')
      fireEvent.pointerDown(
        screen.getByRole('button', { name: 'Connect from bottom' }),
        { button: 0, clientX: 100, clientY: 150 },
      )
      fireEvent.pointerMove(test.stage, { clientX: x, clientY: 270 })
      paint()
      expect(screen.getByTestId('connection-preview')).toBeInTheDocument()
      expect(test.changed).not.toHaveBeenCalled()
      fireEvent.pointerUp(test.stage, { clientX: x, clientY: 270 })
      expect(test.current().elements.at(-1)).toMatchObject({
        type: 'connection',
        fromId: 'a',
        toId: 'b',
        fromSide: 'bottom',
        toSide: side,
      })
      expect(test.changed).toHaveBeenCalledOnce()
      expect(screen.queryByTestId('connection-preview')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      expect(test.current().elements).toHaveLength(2)
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    },
  )
  it('cancels a relationship drag without changing geometry or consuming Undo', () => {
    const test = mount()
    test.select('a')
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Connect from right' }),
      { button: 0, clientX: 170, clientY: 100 },
    )
    fireEvent.pointerMove(test.stage, { clientX: 310, clientY: 270 })
    paint()
    fireEvent.keyDown(test.stage, { key: 'Escape' })
    fireEvent.pointerUp(test.stage, { clientX: 310, clientY: 270 })
    expect(test.current()).toEqual(fixture())
    expect(test.changed).not.toHaveBeenCalled()
    expect(screen.queryByTestId('connection-preview')).toBeNull()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })
  it('keeps the dragged source attachment fixed after the other object crosses its position', () => {
    const test = mount()
    test.select('a')
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Connect from bottom' }),
      { button: 0, clientX: 100, clientY: 150 },
    )
    fireEvent.pointerMove(test.stage, { clientX: 310, clientY: 270 })
    fireEvent.pointerUp(test.stage, { clientX: 310, clientY: 270 })
    const link = test.current().elements.at(-1)!
    fireEvent.pointerDown(test.object('b'), {
      button: 0,
      clientX: 350,
      clientY: 270,
    })
    fireEvent.pointerMove(test.stage, { clientX: -100, clientY: -30 })
    fireEvent.pointerUp(test.stage, { clientX: -100, clientY: -30 })
    expect(
      test
        .object(link.id)
        .querySelector('[data-connection-path]')
        ?.getAttribute('d'),
    ).toMatch(/^M 90 130 /u)
    expect(test.current().elements.at(-1)).toMatchObject({
      fromSide: 'bottom',
      toSide: 'left',
    })
  })
  it('resizes from an unmarked edge away from its relationship handle', () => {
    const test = mount()
    test.select('a')
    const edge = screen.getByRole('button', {
      name: 'Resize selected object bottom',
    })
    expect(edge).toHaveAttribute('fill', 'transparent')
    expect(edge).toHaveAttribute('stroke', 'none')
    fireEvent.pointerDown(edge, { button: 0, clientX: 65, clientY: 150 })
    fireEvent.pointerMove(test.stage, { clientX: 65, clientY: 180 })
    fireEvent.pointerUp(test.stage, { clientX: 65, clientY: 180 })
    expect(test.current().elements[0]).toMatchObject({
      x: 20,
      y: 30,
      width: 140,
      height: 130,
    })
    expect(test.current().elements).toHaveLength(2)
    expect(test.changed).toHaveBeenCalledOnce()
  })
  it('right-clicks a shape to format text without opening the full inspector', () => {
    const test = mount()
    const panel = test.openQuick('a')
    fireEvent.change(panel.getByLabelText('Horizontal alignment'), {
      target: { value: 'left' },
    })
    fireEvent.change(panel.getByLabelText('Vertical alignment'), {
      target: { value: 'bottom' },
    })
    fireEvent.change(panel.getByLabelText('Font family'), {
      target: { value: 'serif' },
    })
    fireEvent.change(panel.getByLabelText('Font color'), {
      target: { value: '#ff3300' },
    })
    fireEvent.click(panel.getByLabelText('Bold'))
    fireEvent.click(panel.getByLabelText('Italic'))
    expect(test.current().elements[0]).toMatchObject({
      textAlign: 'left',
      verticalAlign: 'bottom',
      fontFamily: 'serif',
      textColor: '#ff3300',
      fontWeight: 'bold',
      fontStyle: 'italic',
    })
    expect(test.current().elements[1]).not.toHaveProperty('textAlign')
    expect(test.object('a').querySelector('text')).toHaveAttribute(
      'text-anchor',
      'start',
    )
    expect(test.object('a').querySelector('text')).toHaveAttribute(
      'fill',
      '#ff3300',
    )
    expect(screen.queryByRole('form', { name: 'Object properties' })).toBeNull()
  })
  it('right-clicks a selected group and applies one shared color change with one Undo', () => {
    const test = mount()
    test.select('a')
    test.select('b', true)
    const panel = test.openQuick('a')
    expect(panel.getByText('2 selected objects')).toBeVisible()
    fireEvent.change(panel.getByLabelText('Stroke color'), {
      target: { value: '#1166aa' },
    })
    expect(test.current().elements.map((element) => element.color)).toEqual([
      '#1166aa',
      '#1166aa',
    ])
    expect(test.changed).toHaveBeenCalledOnce()
    fireEvent.keyDown(
      screen.getByRole('dialog', { name: 'Quick object properties' }),
      { key: 'Escape' },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(test.current().elements.map((element) => element.color)).toEqual([
      '#7C5CFC',
      '#7C5CFC',
    ])
  })
  it('offers rich line and pointer choices and reverses a relationship from its quick panel', () => {
    const test = mount(
      connectElements(fixture(), 'a', 'b', {
        id: 'link',
        fromSide: 'bottom',
        toSide: 'left',
      }),
    )
    const panel = test.openQuick('link')
    fireEvent.change(panel.getByLabelText('Connection path'), {
      target: { value: 'curve' },
    })
    fireEvent.change(panel.getByLabelText('Line type'), {
      target: { value: 'dotted' },
    })
    fireEvent.change(panel.getByLabelText('End pointer'), {
      target: { value: 'diamond' },
    })
    fireEvent.click(panel.getByRole('button', { name: 'Reverse connection' }))
    expect(test.current().elements.at(-1)).toMatchObject({
      fromId: 'b',
      toId: 'a',
      fromSide: 'left',
      toSide: 'bottom',
      style: 'curve',
      linePattern: 'dotted',
      endPointer: 'diamond',
    })
    expect(
      test.object('link').querySelector('[data-connection-path]'),
    ).toHaveAttribute('stroke-dasharray', '1 5')
  })
  it('adds a shape at the clicked world position on a translated and zoomed canvas', () => {
    const board = { ...fixture(), viewport: { x: -100, y: 50, zoom: 2 } }
    const test = mount(board)
    fireEvent.contextMenu(test.stage, { clientX: 210, clientY: 170 })
    const panel = within(screen.getByRole('dialog', { name: 'Add to canvas' }))
    fireEvent.click(panel.getByRole('button', { name: 'Hexagon' }))
    expect(test.current().elements.at(-1)).toMatchObject({
      type: 'hexagon',
      x: 150,
      y: 50,
    })
    expect(test.changed).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('exposes the additional shapes and a line tool in the drawing tools', () => {
    const test = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Add star' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add cylinder' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add line' }))
    expect(
      test
        .current()
        .elements.slice(-3)
        .map((element) => element.type),
    ).toEqual(['star', 'cylinder', 'line'])
  })
  it('pauses and minimizes an embedded page by unmounting it and persists the controls in the document', () => {
    const board = createElement(fixture(), {
      id: 'embed',
      type: 'embed',
      kind: 'web',
      src: 'https://example.com/reference',
      title: 'Reference',
      x: 20,
      y: 350,
      width: 360,
      height: 260,
      paused: false,
    })
    const test = mount(board)
    expect(test.object('embed').querySelector('iframe')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Pause Reference' }))
    expect(test.current().elements.at(-1)).toMatchObject({ paused: true })
    expect(test.object('embed').querySelector('iframe')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Resume Reference' }))
    expect(test.object('embed').querySelector('iframe')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Minimize Reference' }))
    expect(test.current().elements.at(-1)).toMatchObject({ minimized: true })
    expect(test.object('embed').querySelector('iframe')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Expand Reference' }))
    expect(test.current().elements.at(-1)).toMatchObject({
      minimized: false,
      paused: false,
    })
    expect(test.object('embed').querySelector('iframe')).not.toBeNull()
  })
  it.each([true, false])(
    'honors object snapping enabled=%s during an actual drag',
    (enabled) => {
      let board = createCanvasDocument('Rich interactions')
      board = createElement(board, {
        id: 'a',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      })
      board = createElement(board, {
        id: 'b',
        type: 'rectangle',
        x: 200,
        y: 300,
        width: 100,
        height: 100,
      })
      const test = mount(board, {
        controlOptions: { ...DEFAULT_CANVAS_CONTROLS, snapToObjects: enabled },
      })
      fireEvent.pointerDown(test.object('a'), {
        button: 0,
        clientX: 50,
        clientY: 60,
      })
      fireEvent.pointerMove(test.stage, { clientX: 247, clientY: 80 })
      paint()
      if (enabled)
        expect(screen.getAllByTestId('object-snap-guide')).toHaveLength(1)
      else expect(screen.queryByTestId('object-snap-guide')).toBeNull()
      fireEvent.pointerUp(test.stage, { clientX: 247, clientY: 80 })
      expect(test.current().elements[0]).toMatchObject({
        x: enabled ? 200 : 197,
        y: 20,
      })
    },
  )
})
