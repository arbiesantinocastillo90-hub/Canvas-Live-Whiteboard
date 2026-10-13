import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CanvasEditor, { type CanvasEditorController } from './CanvasEditor'
import { createCanvasDocument } from './lcanvas'
import {
  addLayer,
  assignElementArea,
  connectElements,
  createElement,
  updateLayer,
} from './canvasOperations'
import { CANVAS_CLIPBOARD_MIME, createCanvasClipboard } from './canvasClipboard'
import { WorkspaceCommandsProvider } from './WorkspaceCommands'

let frames: Map<number, FrameRequestCallback>
let frameId: number
function paint() {
  act(() => {
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback(performance.now())
  })
}
function box(
  document = createCanvasDocument('Plan'),
  id = 'a',
  x = 10,
  y = 20,
) {
  return createElement(document, {
    type: 'rectangle',
    id,
    x,
    y,
    width: 140,
    height: 100,
    text: 'Original',
  })
}
function mount(document = box(), active = true, managed = false) {
  const changed = vi.fn()
  let controller: CanvasEditorController | null = null
  const editor = (
    <CanvasEditor
      document={document}
      grid="dots"
      active={active}
      aiOpen={false}
      onToggleAI={vi.fn()}
      onDocumentChange={changed}
      onControllerReady={(value) => {
        controller = value
      }}
    />
  )
  const result = render(
    managed ? (
      <WorkspaceCommandsProvider>{editor}</WorkspaceCommandsProvider>
    ) : (
      editor
    ),
  )
  const stage = screen.getByRole('region', { name: 'Plan canvas view' })
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
  const object = (id: string) => {
    const element = result.container.querySelector(`[data-element-id="${id}"]`)
    if (!element) throw new Error(`Missing ${id}`)
    return element
  }
  const select = (id: string, shiftKey = false) => {
    fireEvent.pointerDown(object(id), {
      button: 0,
      clientX: 50,
      clientY: 50,
      shiftKey,
    })
    fireEvent.pointerUp(stage, { clientX: 50, clientY: 50, shiftKey })
  }
  return {
    ...result,
    changed,
    stage,
    object,
    select,
    current: () => controller!.getDocument(),
    flushDraft: () => controller!.flushDraft?.(),
  }
}

describe('practical canvas interactions', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('PointerEvent', MouseEvent)
    frames = new Map()
    frameId = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback)
      return frameId
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  })

  it('Shift-selects a group, moves once, nudges precisely and deletes as one undoable change', () => {
    const test = mount(box(box(), 'b', 240, 40))
    test.select('a')
    test.select('b', true)
    expect(test.stage).toHaveAttribute('data-selection-count', '2')
    fireEvent.pointerDown(test.object('a'), {
      button: 0,
      clientX: 50,
      clientY: 50,
    })
    fireEvent.pointerMove(test.stage, { clientX: 80, clientY: 70 })
    fireEvent.pointerMove(test.stage, { clientX: 100, clientY: 90 })
    expect(test.changed).not.toHaveBeenCalled()
    expect(frames.size).toBe(1)
    fireEvent.pointerUp(test.stage, { clientX: 100, clientY: 90 })
    expect(
      test
        .current()
        .elements.map((item) => ('x' in item ? [item.x, item.y] : [])),
    ).toEqual([
      [60, 60],
      [290, 80],
    ])
    expect(test.changed).toHaveBeenCalledOnce()
    fireEvent.keyDown(test.stage, { key: 'ArrowRight' })
    fireEvent.keyDown(test.stage, { key: 'ArrowDown', shiftKey: true })
    expect(test.current().elements[0]).toMatchObject({ x: 61, y: 70 })
    fireEvent.keyDown(test.stage, { key: 'Delete' })
    expect(test.current().elements).toHaveLength(0)
    fireEvent.keyDown(test.stage, { key: 'z', ctrlKey: true })
    expect(test.current().elements).toHaveLength(2)
    expect(test.current().elements[1]).toMatchObject({ x: 291, y: 90 })
  })

  it('marquee selects fully contained visible objects and cancellation restores selection', () => {
    const test = mount(box(box(), 'b', 220, 40))
    fireEvent.pointerDown(test.stage, { button: 0, clientX: 10, clientY: 20 })
    fireEvent.pointerMove(test.stage, { clientX: 400, clientY: 190 })
    paint()
    expect(screen.getByTestId('canvas-marquee')).toBeInTheDocument()
    expect(test.stage).toHaveAttribute('data-selection-count', '2')
    fireEvent.pointerUp(test.stage, { clientX: 400, clientY: 190 })
    expect(test.changed).not.toHaveBeenCalled()
    test.select('b', true)
    fireEvent.pointerDown(test.stage, { button: 0, clientX: 10, clientY: 20 })
    fireEvent.pointerMove(test.stage, { clientX: 400, clientY: 190 })
    paint()
    fireEvent.keyDown(test.stage, { key: 'Escape' })
    expect(test.stage).toHaveAttribute('data-selection-count', '1')
    expect(test.object('a')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByTestId('canvas-marquee')).toBeNull()
  })

  it('cancels pending and painted object movement without saving or consuming Undo', () => {
    const test = mount()
    fireEvent.pointerDown(test.object('a'), {
      button: 0,
      clientX: 50,
      clientY: 50,
    })
    fireEvent.pointerMove(test.stage, { clientX: 200, clientY: 100 })
    paint()
    expect(test.object('a').querySelector('rect')).toHaveAttribute('x', '160')
    fireEvent.keyDown(test.stage, { key: 'Escape' })
    expect(test.object('a').querySelector('rect')).toHaveAttribute('x', '10')
    expect(test.changed).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    paint()
    expect(test.current().elements[0]).toMatchObject({ x: 10, y: 20 })
  })

  it.each([
    ['nw', { x: -10, y: 10, width: 160, height: 110 }],
    ['n', { x: 10, y: 10, width: 140, height: 110 }],
    ['ne', { x: 10, y: 10, width: 120, height: 110 }],
    ['e', { x: 10, y: 20, width: 120, height: 100 }],
    ['se', { x: 10, y: 20, width: 120, height: 90 }],
    ['s', { x: 10, y: 20, width: 140, height: 90 }],
    ['sw', { x: -10, y: 20, width: 160, height: 90 }],
    ['w', { x: -10, y: 20, width: 160, height: 100 }],
  ])(
    'resizes the %s handle with the opposite edge fixed',
    (handle, expected) => {
      const test = mount()
      test.select('a')
      const control = test.container.querySelector(
        `[data-resize-handle="${handle}"]`,
      )!
      fireEvent.pointerDown(control, { button: 0, clientX: 100, clientY: 100 })
      fireEvent.pointerMove(test.stage, { clientX: 80, clientY: 90 })
      fireEvent.pointerUp(test.stage, { clientX: 80, clientY: 90 })
      const resized = test.current().elements[0]
      for (const [key, value] of Object.entries(expected))
        expect(resized[key as keyof typeof resized]).toBeCloseTo(value)
      expect(test.changed).toHaveBeenCalledOnce()
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      expect(test.current().elements[0]).toMatchObject({
        x: 10,
        y: 20,
        width: 140,
        height: 100,
      })
    },
  )

  it('restores the original object when a painted drag returns to its starting point', () => {
    const test = mount()
    fireEvent.pointerDown(test.object('a'), {
      button: 0,
      clientX: 50,
      clientY: 50,
    })
    fireEvent.pointerMove(test.stage, { clientX: 150, clientY: 100 })
    paint()
    expect(test.object('a').querySelector('rect')).toHaveAttribute('x', '110')
    fireEvent.pointerMove(test.stage, { clientX: 50, clientY: 50 })
    paint()
    fireEvent.pointerUp(test.stage, { clientX: 50, clientY: 50 })
    expect(test.current().elements[0]).toMatchObject({ x: 10, y: 20 })
    expect(test.changed).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })

  it('keeps shape proportions with Shift and moves an area/member selection without doubling movement', () => {
    let document = createElement(createCanvasDocument('Plan'), {
      type: 'area',
      id: 'area',
      x: 0,
      y: 0,
      width: 400,
      height: 300,
    })
    document = assignElementArea(box(document), 'a', 'area')
    const test = mount(document)
    test.select('a')
    fireEvent.pointerDown(
      test.container.querySelector('[data-resize-handle="se"]')!,
      { button: 0, clientX: 100, clientY: 100 },
    )
    fireEvent.pointerMove(test.stage, {
      clientX: 170,
      clientY: 110,
      shiftKey: true,
    })
    fireEvent.pointerUp(test.stage, {
      clientX: 170,
      clientY: 110,
      shiftKey: true,
    })
    expect(
      test.current().elements.find((item) => item.id === 'a'),
    ).toMatchObject({ width: 210, height: 150 })
    test.select('area')
    test.select('a', true)
    fireEvent.pointerDown(test.object('area'), {
      button: 0,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(test.stage, { clientX: 130, clientY: 120 })
    fireEvent.pointerUp(test.stage, { clientX: 130, clientY: 120 })
    expect(
      test.current().elements.find((item) => item.id === 'a'),
    ).toMatchObject({ x: 40, y: 40, areaId: 'area' })
    expect(
      test.current().elements.find((item) => item.id === 'area'),
    ).toMatchObject({ x: 30, y: 20 })
  })

  it('edits text directly with multiline input, Ctrl+Enter applies once and Escape cancels', () => {
    const test = mount()
    fireEvent.doubleClick(test.object('a'))
    let field = screen.getByRole('textbox', { name: 'Edit object text' })
    expect(field).toHaveFocus()
    fireEvent.change(field, {
      target: { value: 'Line one\n<script>literal</script>' },
    })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(test.changed).not.toHaveBeenCalled()
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true })
    expect(test.changed).toHaveBeenCalledOnce()
    expect(test.current().elements[0]).toMatchObject({
      text: 'Line one\n<script>literal</script>',
    })
    expect(test.container.querySelector('script')).toBeNull()
    fireEvent.doubleClick(test.object('a'))
    field = screen.getByRole('textbox', { name: 'Edit object text' })
    fireEvent.change(field, { target: { value: 'Cancel this draft' } })
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(
      screen.queryByRole('textbox', { name: 'Edit object text' }),
    ).toBeNull()
    expect(test.changed).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(test.current().elements[0]).toMatchObject({ text: 'Original' })
  })

  it('accumulates wheel deltas per frame, anchors zoom to the pointer and leaves content redo intact', () => {
    const test = mount(createCanvasDocument('Plan'))
    fireEvent.click(screen.getByRole('button', { name: 'Add rectangle' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    fireEvent.wheel(test.stage, { clientX: 210, clientY: 120, deltaY: -20 })
    fireEvent.wheel(test.stage, { clientX: 210, clientY: 120, deltaY: -30 })
    const view = test.current().viewport
    expect(view.zoom).toBeCloseTo(Math.exp(0.1))
    expect((200 - view.x) / view.zoom).toBeCloseTo(200)
    expect((100 - view.y) / view.zoom).toBeCloseTo(100)
    expect(frames.size).toBe(1)
    paint()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(test.current().elements).toHaveLength(1)
    expect(test.current().viewport).toEqual(view)
    fireEvent.pointerDown(test.stage, { button: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(test.stage, { clientX: 150, clientY: 130 })
    fireEvent.pointerUp(test.stage, { clientX: 150, clientY: 130 })
    const panned = test.current().viewport
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(test.current().elements).toHaveLength(0)
    expect(test.current().viewport).toEqual(panned)
  })

  it('copies and pastes an area and internal connections with fresh IDs and preserves native text clipboard', () => {
    let document = createElement(createCanvasDocument('Plan'), {
      type: 'area',
      id: 'area',
      x: 0,
      y: 0,
      width: 600,
      height: 300,
    })
    document = assignElementArea(box(document), 'a', 'area')
    document = assignElementArea(box(document, 'b', 240, 40), 'b', 'area')
    document = connectElements(document, 'a', 'b', {
      id: 'edge',
      areaId: 'area',
    })
    const test = mount(document)
    test.select('area')
    const clipboard = new Map<string, string>()
    const data = {
      setData: (type: string, value: string) => clipboard.set(type, value),
      getData: (type: string) => clipboard.get(type) ?? '',
    }
    fireEvent.copy(test.stage, { clipboardData: data })
    expect(clipboard.get(CANVAS_CLIPBOARD_MIME)).toEqual(
      createCanvasClipboard(document, ['area']),
    )
    fireEvent.paste(test.stage, { clipboardData: data })
    expect(test.current().elements).toHaveLength(8)
    const copied = test.current().elements.slice(4)
    const copiedArea = copied.find((item) => item.type === 'area')!
    expect(
      copied
        .filter((item) => item.type !== 'area')
        .every((item) => item.areaId === copiedArea.id),
    ).toBe(true)
    expect(copied.find((item) => item.type === 'connection')).toMatchObject({
      fromId: copied[1].id,
      toId: copied[2].id,
    })
    fireEvent.doubleClick(test.object('a'))
    const field = screen.getByRole('textbox', { name: 'Edit object text' })
    clipboard.clear()
    expect(fireEvent.copy(field, { clipboardData: data })).toBe(true)
    expect(clipboard.size).toBe(0)
  })

  it('rejects locked group edits atomically and disables hidden canvas interaction', () => {
    let document = box(box(), 'b', 240, 40)
    document = addLayer(document, 'Locked', 'locked')
    document = createElement(document, {
      type: 'rectangle',
      id: 'locked-box',
      x: 420,
      y: 40,
      width: 100,
      height: 100,
      layerId: 'locked',
    })
    document = updateLayer(document, 'locked', { locked: true })
    const test = mount(document)
    test.select('a')
    test.select('locked-box', true)
    fireEvent.keyDown(test.stage, { key: 'ArrowRight' })
    expect(test.changed).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/locked/)
    test.rerender(
      <CanvasEditor
        document={document}
        active={false}
        grid="dots"
        aiOpen={false}
        onToggleAI={vi.fn()}
        onDocumentChange={test.changed}
      />,
    )
    paint()
    fireEvent.keyDown(test.stage, { key: ' ' })
    fireEvent.pointerDown(test.stage, { button: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(test.stage, { clientX: 150, clientY: 150 })
    fireEvent.pointerUp(test.stage, { clientX: 150, clientY: 150 })
    fireEvent.wheel(test.stage, { deltaY: -20 })
    paint()
    expect(test.changed).not.toHaveBeenCalled()
  })

  it('opens inline text when native pointer capture retargets double-click to the stage', () => {
    const test = mount()
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => test.object('a')),
    })
    try {
      fireEvent.doubleClick(test.stage, { clientX: 80, clientY: 80 })
      expect(
        screen.getByRole('textbox', { name: 'Edit object text' }),
      ).toHaveValue('Original')
      fireEvent.keyDown(
        screen.getByRole('textbox', { name: 'Edit object text' }),
        { key: 'Escape' },
      )
      expect(test.changed).not.toHaveBeenCalled()
    } finally {
      Reflect.deleteProperty(document, 'elementFromPoint')
    }
  })

  it('applies an inline edit on blur and allows F2 to reopen it', () => {
    const test = mount()
    test.select('a')
    fireEvent.keyDown(test.stage, { key: 'F2' })
    const field = screen.getByRole('textbox', { name: 'Edit object text' })
    fireEvent.change(field, { target: { value: 'Applied on blur' } })
    fireEvent.blur(field)
    expect(test.current().elements[0]).toMatchObject({
      text: 'Applied on blur',
    })
    expect(test.changed).toHaveBeenCalledOnce()
    expect(
      screen.queryByRole('textbox', { name: 'Edit object text' }),
    ).toBeNull()
  })

  it('applies a text draft before moving the object, so each edit can be undone independently', () => {
    const test = mount()
    fireEvent.doubleClick(test.object('a'))
    const field = screen.getByRole('textbox', { name: 'Edit object text' })
    fireEvent.change(field, { target: { value: 'Committed before movement' } })
    fireEvent.pointerDown(test.object('a'), {
      button: 0,
      clientX: 50,
      clientY: 50,
    })
    fireEvent.pointerMove(test.stage, { clientX: 80, clientY: 70 })
    fireEvent.pointerUp(test.stage, { clientX: 80, clientY: 70 })
    expect(test.current().elements[0]).toMatchObject({
      x: 40,
      y: 40,
      text: 'Committed before movement',
    })
    expect(test.changed).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(test.current().elements[0]).toMatchObject({
      x: 10,
      y: 20,
      text: 'Committed before movement',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(test.current().elements[0]).toMatchObject({
      x: 10,
      y: 20,
      text: 'Original',
    })
  })

  it('retains an invalid area name draft until the user corrects or cancels it', () => {
    const document = createElement(createCanvasDocument('Plan'), {
      type: 'area',
      id: 'area',
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      name: 'Original area',
    })
    const test = mount(document)
    fireEvent.doubleClick(test.object('area'))
    const field = screen.getByRole('textbox', { name: 'Edit area name' })
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true })
    expect(field).toHaveValue('')
    expect(test.current().elements[0]).toMatchObject({ name: 'Original area' })
    expect(test.changed).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    act(() => expect(() => test.flushDraft()).toThrow('Correct or cancel'))
    fireEvent.change(field, { target: { value: 'Corrected area' } })
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true })
    expect(test.current().elements[0]).toMatchObject({ name: 'Corrected area' })
    expect(test.changed).toHaveBeenCalledOnce()
    expect(screen.queryByRole('textbox', { name: 'Edit area name' })).toBeNull()
  })

  it('keeps the current canvas name when a wheel batch completes after renaming', () => {
    const test = mount()
    fireEvent.wheel(test.stage, { clientX: 210, clientY: 120, deltaY: -20 })
    test.rerender(
      <CanvasEditor
        document={{ ...test.current(), name: 'Renamed canvas' }}
        grid="dots"
        aiOpen={false}
        onToggleAI={vi.fn()}
        onDocumentChange={test.changed}
      />,
    )
    paint()
    expect(test.changed).toHaveBeenCalledOnce()
    expect(test.changed.mock.calls[0][0].name).toBe('Renamed canvas')
  })

  it('flushes the current text draft and queued camera before a controller save snapshot', () => {
    const test = mount()
    fireEvent.wheel(test.stage, { clientX: 210, clientY: 120, deltaY: -20 })
    const view = test.current().viewport
    fireEvent.doubleClick(test.object('a'))
    const field = screen.getByRole('textbox', { name: 'Edit object text' })
    fireEvent.change(field, { target: { value: 'Exact draft at Save' } })
    act(() => test.flushDraft())
    expect(test.current().elements[0]).toMatchObject({
      text: 'Exact draft at Save',
    })
    expect(test.current().viewport).toEqual(view)
    expect(
      screen.queryByRole('textbox', { name: 'Edit object text' }),
    ).toBeNull()
    expect(test.changed).toHaveBeenCalledTimes(2)
    expect(test.changed.mock.calls[1][0]).toEqual(test.current())
    expect(frames.size).toBe(0)
  })

  it('places plain pasted text at the last pointer location and rejects damaged structured data without mutation', () => {
    const test = mount(createCanvasDocument('Plan'))
    fireEvent.pointerMove(test.stage, { clientX: 410, clientY: 270 })
    const data = {
      getData: (type: string) => (type === 'text/plain' ? 'Pasted note' : ''),
    }
    fireEvent.paste(test.stage, { clipboardData: data })
    const element = test.current().elements[0]
    expect(element).toMatchObject({ type: 'text', text: 'Pasted note' })
    if (element.type !== 'text') throw new Error('Missing pasted text')
    expect(element.x + element.width / 2).toBe(400)
    expect(element.y + element.height / 2).toBe(250)
    const before = test.current()
    fireEvent.paste(test.stage, {
      clipboardData: {
        getData: (type: string) =>
          type === CANVAS_CLIPBOARD_MIME
            ? 'broken structured data'
            : 'Unwanted fallback',
      },
    })
    expect(test.current()).toEqual(before)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(test.changed).toHaveBeenCalledOnce()
  })

  it.each(['paste', 'cut'])(
    'cancels an asynchronous %s when its canvas is unmounted',
    async (kind) => {
      let resolve: ((value: string) => void) | undefined
      const pending = new Promise<string>((done) => {
        resolve = done
      })
      const readText = vi.fn(() => pending)
      const writeText = vi.fn(() => pending.then(() => undefined))
      vi.stubGlobal('navigator', {
        ...navigator,
        clipboard: { readText, writeText },
      })
      const test = mount(box(), true, true)
      test.select('a')
      fireEvent.keyDown(test.stage, {
        key: kind === 'paste' ? 'v' : 'x',
        code: kind === 'paste' ? 'KeyV' : 'KeyX',
        ctrlKey: true,
      })
      expect(kind === 'paste' ? readText : writeText).toHaveBeenCalledOnce()
      test.unmount()
      await act(async () => {
        resolve?.('Late paste')
        await pending
      })
      expect(test.changed).not.toHaveBeenCalled()
    },
  )

  it('keeps an inline draft and the copied objects when a pending cut finishes during text editing', async () => {
    let resolve: (() => void) | undefined
    const pending = new Promise<void>((done) => {
      resolve = done
    })
    const writeText = vi.fn(() => pending)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const test = mount(box(), true, true)
    test.select('a')
    fireEvent.keyDown(test.stage, { key: 'x', code: 'KeyX', ctrlKey: true })
    expect(writeText).toHaveBeenCalledOnce()
    fireEvent.doubleClick(test.object('a'))
    const field = screen.getByRole('textbox', { name: 'Edit object text' })
    fireEvent.change(field, { target: { value: 'Draft after copying' } })
    await act(async () => {
      resolve?.()
      await pending
    })
    expect(test.current().elements[0]).toMatchObject({ text: 'Original' })
    expect(field).toHaveValue('Draft after copying')
    expect(test.changed).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/Copied objects remain/)
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true })
    expect(test.current().elements[0]).toMatchObject({
      text: 'Draft after copying',
    })
    expect(test.changed).toHaveBeenCalledOnce()
  })
})
