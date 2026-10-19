import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CanvasEditor, { type CanvasEditorController } from './CanvasEditor'
import { connectElements, createElement } from './canvasOperations'
import {
  createCanvasDocument,
  SHAPE_TYPES,
  type CanvasDocument,
  connectionEndpoints,
} from './lcanvas'

let frames: Map<number, FrameRequestCallback>
let nextFrame = 0
function paint() {
  act(() => {
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback(performance.now())
  })
}
function fixture() {
  let board = createCanvasDocument('Reconnect test')
  for (const [id, x, y] of [
    ['a', 20, 30],
    ['b', 300, 200],
    ['c', 500, 30],
  ] as const)
    board = createElement(board, {
      id,
      type: 'rectangle',
      x,
      y,
      width: 140,
      height: 100,
      text: id,
    })
  return connectElements(board, 'a', 'b', {
    id: 'link',
    fromSide: 'right',
    toSide: 'left',
    style: 'curve',
    linePattern: 'dashed',
    startPointer: 'circle',
    endPointer: 'diamond',
  })
}
function mount(document = fixture(), dockMode = false) {
  let controller: CanvasEditorController | null = null
  const changed = vi.fn()
  const editor = (board = document, active = true, key = 'first') => (
    <CanvasEditor
      key={key}
      active={active}
      document={board}
      grid="dots"
      aiOpen={false}
      onToggleAI={vi.fn()}
      onDocumentChange={changed}
      onControllerReady={(value) => {
        controller = value
      }}
      dockHost={dockMode ? null : undefined}
    />
  )
  const view = render(editor(), {
    wrapper: ({ children }) => <div className="workspace-deck">{children}</div>,
  })
  const stage = screen.getByRole('region', {
    name: 'Reconnect test canvas view',
  })
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
    x: 10,
    y: 20,
    left: 10,
    top: 20,
    right: 810,
    bottom: 620,
    width: 800,
    height: 600,
    toJSON: () => ({}),
  })
  const object = (id: string) =>
    view.container.querySelector(`[data-element-id="${id}"]`)!
  const select = (id: string) => {
    fireEvent.pointerDown(object(id), { button: 0, clientX: 170, clientY: 100 })
    fireEvent.pointerUp(stage, { clientX: 170, clientY: 100 })
  }
  const begin = (endpoint: 'start' | 'end' = 'end') => {
    select('link')
    fireEvent.pointerDown(
      screen.getByRole('button', {
        name: `Reconnect relationship ${endpoint}`,
      }),
      {
        button: 0,
        clientX: endpoint === 'start' ? 170 : 310,
        clientY: endpoint === 'start' ? 100 : 270,
      },
    )
  }
  const move = (x: number, y: number) => {
    fireEvent.pointerMove(stage, { clientX: x, clientY: y })
    paint()
  }
  return {
    ...view,
    stage,
    object,
    select,
    begin,
    move,
    changed,
    current: () => controller!.getDocument(),
    release: (x: number, y: number) =>
      fireEvent.pointerUp(stage, { clientX: x, clientY: y }),
    hide: () => view.rerender(editor(document, false)),
    replaceFile: (board: CanvasDocument) =>
      view.rerender(editor(board, true, 'second')),
  }
}

describe('selected relationship endpoint dragging', () => {
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

  it('shows exactly two handles only on an editable selected relationship', () => {
    const test = mount()
    expect(
      screen.queryAllByRole('button', { name: /^Reconnect relationship/ }),
    ).toHaveLength(0)
    test.select('a')
    expect(
      screen.queryAllByRole('button', { name: /^Reconnect relationship/ }),
    ).toHaveLength(0)
    test.select('link')
    expect(
      screen.getAllByRole('button', { name: /^Reconnect relationship/ }),
    ).toHaveLength(2)
    expect(
      screen.queryByRole('button', { name: 'Resize selected object' }),
    ).toBeNull()
  })

  it.each([
    ['left', 510, 100],
    ['right', 650, 100],
    ['top', 580, 50],
    ['bottom', 580, 150],
  ] as const)(
    'reconnects the end to the nearest %s side in one Undo step',
    (side, x, y) => {
      const test = mount()
      const original = test.current()
      test.begin()
      test.move(400, 100)
      test.move(x, y)
      expect(test.current()).toEqual(original)
      expect(test.changed).not.toHaveBeenCalled()
      expect(
        screen.getByTestId('relationship-endpoint-target'),
      ).toHaveAttribute('data-target-id', 'c')
      expect(
        screen.getByTestId('relationship-endpoint-target'),
      ).toHaveAttribute('data-target-side', side)
      const path = screen
        .getByTestId('relationship-endpoint-preview')
        .querySelector('[data-connection-path]')!
      expect(path.getAttribute('d')).toContain('C ')
      expect(path.getAttribute('marker-start')).toContain('reconnection-start')
      expect(path.getAttribute('marker-end')).toContain('reconnection-end')
      expect(path).toHaveAttribute('stroke-dasharray', '8 5')
      test.release(x, y)
      expect(test.current().elements.at(-1)).toMatchObject({
        id: 'link',
        fromId: 'a',
        fromSide: 'right',
        toId: 'c',
        toSide: side,
        style: 'curve',
        linePattern: 'dashed',
        startPointer: 'circle',
        endPointer: 'diamond',
      })
      expect(test.changed).toHaveBeenCalledOnce()
      expect(screen.queryByTestId('relationship-endpoint-preview')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      expect(test.current()).toEqual(original)
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
      fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
      expect(test.current().elements.at(-1)).toMatchObject({
        toId: 'c',
        toSide: side,
      })
    },
  )

  it('moves the start while preserving the opposite endpoint and the current camera', () => {
    const board = { ...fixture(), viewport: { x: -100, y: 50, zoom: 2 } }
    const test = mount(board)
    test.begin('start')
    test.move(910, 180)
    test.release(910, 180)
    expect(test.current().elements.at(-1)).toMatchObject({
      fromId: 'c',
      fromSide: 'left',
      toId: 'b',
      toSide: 'left',
    })
    expect(test.current().viewport).toEqual(board.viewport)
    expect(test.changed).toHaveBeenCalledOnce()
  })

  it.each(SHAPE_TYPES)(
    'attaches automatically to a %s without changing its geometry',
    (type) => {
      const board = fixture()
      const target = board.elements.find((item) => item.id === 'c')!
      const document = {
        ...board,
        elements: board.elements.map((item) =>
          item.id === 'c' ? { ...target, type } : item,
        ),
      } as CanvasDocument
      const test = mount(document)
      test.begin()
      test.move(580, 50)
      test.release(580, 50)
      expect(test.current().elements.at(-1)).toMatchObject({
        toId: 'c',
        toSide: 'top',
      })
      expect(test.current().elements.find((item) => item.id === 'c')).toEqual(
        document.elements.find((item) => item.id === 'c'),
      )
    },
  )

  it('changes the side on the same object and treats an unchanged drop as no edit', () => {
    const test = mount()
    test.begin()
    test.release(310, 270)
    expect(test.changed).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    test.begin()
    test.release(380, 220)
    expect(test.current().elements.at(-1)).toMatchObject({
      toId: 'b',
      toSide: 'top',
    })
    expect(test.changed).toHaveBeenCalledOnce()
  })

  it('shows a floating preview over empty space and restores the attachment on release', () => {
    const test = mount()
    const original = test.current()
    test.begin()
    test.move(720, 540)
    const preview = screen.getByTestId('relationship-endpoint-preview')
    expect(
      preview.querySelector('[data-connection-path]')!.getAttribute('d'),
    ).toContain('C ')
    expect(screen.queryByTestId('relationship-endpoint-target')).toBeNull()
    expect(test.object('link')).toHaveAttribute('data-reconnecting', 'true')
    expect(test.current()).toEqual(original)
    test.release(720, 540)
    expect(test.current()).toEqual(original)
    expect(test.changed).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })

  it.each(['start', 'end'] as const)(
    'keeps an Auto %s attachment unchanged when its handle is clicked',
    (endpoint) => {
      const board = fixture()
      const document: CanvasDocument = {
        ...board,
        elements: board.elements.map((item) =>
          item.type === 'connection'
            ? { ...item, fromSide: 'auto', toSide: 'auto' }
            : item,
        ),
      }
      const test = mount(document)
      test.select('link')
      const connection = document.elements.find(
        (item) => item.type === 'connection',
      )!
      const ends = connectionEndpoints(document, connection)
      const point = {
        clientX: 10 + (endpoint === 'start' ? ends.x1 : ends.x2),
        clientY: 20 + (endpoint === 'start' ? ends.y1 : ends.y2),
      }
      fireEvent.pointerDown(
        screen.getByRole('button', {
          name: `Reconnect relationship ${endpoint}`,
        }),
        { button: 0, ...point },
      )
      fireEvent.pointerUp(test.stage, point)
      expect(test.current()).toEqual(document)
      expect(test.changed).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    },
  )

  it.each([
    'Escape',
    'pointercancel',
    'lostpointercapture',
    'blur',
    'inactive',
    'windowblur',
  ] as const)(
    'cancels a valid target preview on %s without changes or history',
    (reason) => {
      const test = mount()
      const original = test.current()
      test.begin()
      test.move(510, 100)
      expect(
        screen.getByTestId('relationship-endpoint-target'),
      ).toBeInTheDocument()
      if (reason === 'Escape') fireEvent.keyDown(test.stage, { key: 'Escape' })
      else if (reason === 'pointercancel') fireEvent.pointerCancel(test.stage)
      else if (reason === 'lostpointercapture')
        fireEvent.lostPointerCapture(test.stage)
      else if (reason === 'blur')
        fireEvent.blur(test.stage, { relatedTarget: null })
      else if (reason === 'windowblur') fireEvent(window, new Event('blur'))
      else {
        test.hide()
        paint()
      }
      test.release(510, 100)
      expect(screen.queryByTestId('relationship-endpoint-preview')).toBeNull()
      expect(test.current()).toEqual(original)
      expect(test.changed).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    },
  )

  it.each(['locked', 'hidden'] as const)(
    'rejects a target on a %s layer',
    (state) => {
      const board = fixture()
      const document: CanvasDocument = {
        ...board,
        layers: [
          ...board.layers,
          {
            id: 'target-layer',
            name: 'Target',
            locked: state === 'locked',
            visible: state !== 'hidden',
          },
        ],
        elements: board.elements.map((item) =>
          item.id === 'c' ? { ...item, layerId: 'target-layer' } : item,
        ),
      }
      const test = mount(document)
      test.begin()
      test.move(510, 100)
      expect(screen.queryByTestId('relationship-endpoint-target')).toBeNull()
      test.release(510, 100)
      expect(test.current()).toEqual(document)
      expect(test.changed).not.toHaveBeenCalled()
    },
  )

  it('ignores the opposite object instead of making a self relationship', () => {
    const test = mount()
    const original = test.current()
    test.begin()
    test.move(170, 100)
    expect(screen.queryByTestId('relationship-endpoint-target')).toBeNull()
    test.release(170, 100)
    expect(test.current()).toEqual(original)
    expect(test.changed).not.toHaveBeenCalled()
  })

  it('uses only an area border as an attachment target', () => {
    const board = fixture()
    const document = {
      ...board,
      elements: board.elements.map((item) =>
        item.id === 'c'
          ? {
              id: 'c',
              type: 'area' as const,
              name: 'Area target',
              x: 500,
              y: 30,
              width: 140,
              height: 100,
              color: '#667788',
              fill: null,
              layerId: 'layer-main',
              areaId: null,
            }
          : item,
      ),
    }
    const test = mount(document)
    test.begin()
    test.move(580, 100)
    expect(screen.queryByTestId('relationship-endpoint-target')).toBeNull()
    test.release(580, 100)
    expect(test.changed).not.toHaveBeenCalled()
    test.begin()
    test.move(580, 50)
    test.release(580, 50)
    expect(test.current().elements.at(-1)).toMatchObject({
      toId: 'c',
      toSide: 'top',
    })
  })

  it('discards queued preview work when the active file is replaced', () => {
    const test = mount()
    test.begin()
    fireEvent.pointerMove(test.stage, { clientX: 510, clientY: 100 })
    const next = createCanvasDocument('Another file')
    test.replaceFile(next)
    paint()
    expect(test.current()).toEqual(next)
    expect(test.changed).not.toHaveBeenCalled()
    expect(screen.queryByTestId('relationship-endpoint-preview')).toBeNull()
  })

  it('cannot commit after leaving Work even before its cancellation frame runs', () => {
    const test = mount()
    const original = test.current()
    test.begin()
    test.move(510, 100)
    test.hide()
    test.release(510, 100)
    paint()
    expect(test.current()).toEqual(original)
    expect(test.changed).not.toHaveBeenCalled()
    expect(screen.queryByTestId('relationship-endpoint-preview')).toBeNull()
  })

  it('continues the temporary path through panel gaps without drawing its virtual node', () => {
    const test = mount(fixture(), true)
    const backdrop = test.container.querySelector('.canvas-backdrop')!
    expect(backdrop).not.toBeNull()
    const originalPath = backdrop
      .querySelector('[data-connection-path]')!
      .getAttribute('d')
    const originalRectangles = backdrop.querySelectorAll('rect').length
    test.begin()
    test.move(720, 540)
    const previewPath = screen
      .getByTestId('relationship-endpoint-preview')
      .querySelector('[data-connection-path]')!
      .getAttribute('d')
    expect(previewPath).not.toEqual(originalPath)
    expect(backdrop.querySelector('[data-connection-path]')).toHaveAttribute(
      'd',
      previewPath!,
    )
    expect(backdrop.querySelectorAll('[data-connection-path]')).toHaveLength(1)
    expect(backdrop.querySelectorAll('rect')).toHaveLength(originalRectangles)
    expect(test.current()).toEqual(fixture())
    fireEvent.keyDown(test.stage, { key: 'Escape' })
    expect(backdrop.querySelector('[data-connection-path]')).toHaveAttribute(
      'd',
      originalPath!,
    )
    expect(test.changed).not.toHaveBeenCalled()
  })
})
