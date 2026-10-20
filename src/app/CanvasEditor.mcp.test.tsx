import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CanvasEditor, { type CanvasEditorController } from './CanvasEditor'
import { createElement } from './canvasOperations'
import { createCanvasDocument } from './lcanvas'

function mount() {
  let controller: CanvasEditorController | null = null
  const onDocumentChange = vi.fn()
  const document = createElement(createCanvasDocument('MCP plan'), {
    id: 'existing',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 100,
    height: 80,
  })
  const rendered = render(
    <CanvasEditor
      document={document}
      grid="dots"
      aiOpen={false}
      onToggleAI={vi.fn()}
      onDocumentChange={onDocumentChange}
      onControllerReady={(ready) => {
        controller = ready
      }}
    />,
  )
  function ready() {
    if (!controller) throw new Error('Editor is unavailable.')
    return controller
  }
  return {
    ...rendered,
    document,
    ready,
    onDocumentChange,
    stage: screen.getByRole('region', { name: 'MCP plan canvas view' }),
  }
}

describe('MCP edits in the manual editor history', () => {
  beforeEach(() => {
    vi.stubGlobal('PointerEvent', MouseEvent)
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each(['inactive', 'unmounted'])(
    'rejects a retained controller after its canvas is %s',
    (state) => {
      const test = mount()
      const controller = test.ready()
      if (state === 'unmounted') test.unmount()
      else
        test.rerender(
          <CanvasEditor
            document={test.document}
            active={false}
            grid="dots"
            aiOpen={false}
            onToggleAI={vi.fn()}
            onDocumentChange={test.onDocumentChange}
          />,
        )
      expect(() =>
        controller.execute({ kind: 'move', id: 'existing', x: 250, y: 120 }),
      ).toThrow('Open this canvas before editing it.')
      expect(controller.getDocument().elements[0]).toMatchObject({ x: 0, y: 0 })
      expect(test.onDocumentChange).not.toHaveBeenCalled()
    },
  )

  it('renders an AI transaction and shares the same undo/redo stack with manual edits', () => {
    const test = mount()
    act(() => {
      test.ready().execute({ kind: 'move', id: 'existing', x: 250, y: 120 })
    })
    expect(test.ready().getDocument().elements[0]).toMatchObject({
      x: 250,
      y: 120,
    })
    expect(
      test.container.querySelector('[data-element-id="existing"] rect'),
    ).toHaveAttribute('x', '250')
    fireEvent.click(screen.getByRole('button', { name: 'Add ellipse' }))
    expect(test.ready().getDocument().elements).toHaveLength(2)
    act(() => {
      test.ready().execute({ kind: 'undo' })
    })
    expect(test.ready().getDocument().elements).toHaveLength(1)
    expect(test.ready().getDocument().elements[0]).toMatchObject({ x: 250 })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(test.ready().getDocument().elements[0]).toMatchObject({ x: 0 })
    act(() => {
      test.ready().execute({ kind: 'redo' })
    })
    expect(test.ready().getDocument().elements[0]).toMatchObject({ x: 250 })
    expect(test.onDocumentChange).toHaveBeenCalledTimes(5)
  })

  it('keeps explicitly shared background edits undoable while manual keyboard input remains disabled', () => {
    const test = mount()
    const controller = test.ready()
    test.rerender(
      <CanvasEditor
        document={test.document}
        active={false}
        allowBackgroundCommands
        grid="dots"
        aiOpen={false}
        onToggleAI={vi.fn()}
        onDocumentChange={test.onDocumentChange}
      />,
    )
    fireEvent.keyDown(test.stage, { key: 'Delete' })
    expect(controller.getDocument().elements).toHaveLength(1)
    act(() => {
      controller.execute({ kind: 'move', id: 'existing', x: 240, y: 120 })
    })
    expect(controller.getDocument().elements[0]).toMatchObject({
      x: 240,
      y: 120,
    })
    act(() => {
      controller.execute({ kind: 'undo' })
    })
    expect(controller.getDocument().elements[0]).toMatchObject({ x: 0, y: 0 })
    test.unmount()
    expect(() =>
      controller.execute({ kind: 'move', id: 'existing', x: 2, y: 2 }),
    ).toThrow('Open this canvas')
  })

  it('revokes background command permission when sharing stops', () => {
    const test = mount()
    const controller = test.ready()
    test.rerender(
      <CanvasEditor
        document={test.document}
        active={false}
        allowBackgroundCommands={false}
        grid="dots"
        aiOpen={false}
        onToggleAI={vi.fn()}
        onDocumentChange={test.onDocumentChange}
      />,
    )
    expect(() =>
      controller.execute({ kind: 'move', id: 'existing', x: 2, y: 2 }),
    ).toThrow('Open this canvas')
    expect(test.onDocumentChange).not.toHaveBeenCalled()
  })

  it('commits a multi-object AI batch as one undoable change', () => {
    const test = mount()
    act(() => {
      test.ready().execute({
        kind: 'batch',
        operations: [
          { kind: 'move', id: 'existing', x: 200, y: 100 },
          {
            kind: 'create',
            element: {
              id: 'new',
              type: 'text',
              x: 300,
              y: 100,
              width: 120,
              height: 60,
              text: 'Hello',
            },
          },
        ],
      })
    })
    expect(test.onDocumentChange).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(test.ready().getDocument().elements).toHaveLength(1)
    expect(test.ready().getDocument().elements[0]).toMatchObject({ x: 0 })
  })

  it('reports affected layer identifiers when undoing an AI layer change', () => {
    const test = mount()
    act(() => {
      test
        .ready()
        .execute({ kind: 'add_layer', id: 'ai-layer', name: 'AI layer' })
    })
    let affected: string[] = []
    act(() => {
      affected = test.ready().execute({ kind: 'undo' }).affectedIds
    })
    expect(affected).toContain('ai-layer')
    expect(test.ready().getDocument().layers).toHaveLength(1)
  })

  it('publishes the last committed document during a drag and refuses an AI edit until it ends', () => {
    const test = mount()
    const object = test.container.querySelector('[data-element-id="existing"]')!
    fireEvent.pointerDown(object, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(test.stage, { clientX: 50, clientY: 40 })
    expect(test.ready().getDocument().elements[0]).toMatchObject({ x: 0, y: 0 })
    expect(() =>
      test.ready().execute({ kind: 'move', id: 'existing', x: 900, y: 900 }),
    ).toThrow('Finish the current drag first.')
    expect(test.onDocumentChange).not.toHaveBeenCalled()
    fireEvent.pointerUp(test.stage, { clientX: 50, clientY: 40 })
    expect(test.ready().getDocument().elements[0]).toMatchObject({
      x: 50,
      y: 40,
    })
    expect(test.onDocumentChange).toHaveBeenCalledTimes(1)
  })

  it('does not commit any partial canvas when a batch fails validation', () => {
    const test = mount()
    expect(() =>
      test.ready().execute({
        kind: 'batch',
        operations: [
          { kind: 'move', id: 'existing', x: 200, y: 100 },
          { kind: 'move', id: 'unknown', x: 200, y: 100 },
        ],
      }),
    ).toThrow()
    expect(test.ready().getDocument().elements[0]).toMatchObject({ x: 0 })
    expect(test.onDocumentChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })
})
