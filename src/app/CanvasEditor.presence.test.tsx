import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CanvasEditor, { type CanvasEditorController } from './CanvasEditor'
import { createCanvasAiPresence } from './canvasAiPresenceState'
import { createElement } from './canvasOperations'
import { createCanvasDocument } from './lcanvas'
import { DEFAULT_AI_MINI_SETTINGS } from './useAiMiniSettings'

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700)
  vi.stubGlobal('PointerEvent', MouseEvent)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AI presence in the real editor', () => {
  it('leaves document, viewport, manual selection, and Undo untouched when the marker is used', () => {
    const document = createElement(createCanvasDocument('Presence editor'), {
      id: 'shape',
      type: 'rectangle',
      x: 100,
      y: 80,
      width: 140,
      height: 60,
    })
    const event = createCanvasAiPresence({
      id: 'read-operation',
      kind: 'read',
      phase: 'complete',
      at: Date.now(),
      scope: 'canvas',
      before: document,
      targetIds: ['shape'],
    })
    const changed = vi.fn()
    const openAI = vi.fn()
    let controller: CanvasEditorController | null = null
    const props = {
      document,
      grid: 'dots' as const,
      aiOpen: false,
      onToggleAI: openAI,
      onDocumentChange: changed,
      aiPresence: event,
      aiMiniSettings: { ...DEFAULT_AI_MINI_SETTINGS },
      aiClient: 'ChatGPT',
      onControllerReady: (value: CanvasEditorController | null) => {
        controller = value
      },
      initialViewState: {
        tool: 'select',
        activeLayerId: document.layers[0].id,
        viewport: { x: 25, y: 40, zoom: 1.5 },
        selectedIds: ['shape'],
      },
    }
    const view = render(<CanvasEditor {...props} />)
    const before = structuredClone(controller!.getDocument())
    const state = controller!.getViewState()
    const marker = screen.getByRole('button', {
      name: /Canvas buddy: Read here/u,
    })
    const stage = screen.getByRole('region', {
      name: 'Presence editor canvas view',
    })
    stage.focus()
    fireEvent.pointerDown(marker, {
      pointerId: 1,
      button: 0,
      clientX: 500,
      clientY: 120,
    })
    fireEvent.doubleClick(marker)
    expect(openAI).toHaveBeenCalledOnce()
    expect(controller!.getDocument()).toEqual(before)
    expect(controller!.getViewState()).toEqual(state)
    expect(changed).not.toHaveBeenCalled()
    expect(stage).toHaveFocus()
    act(() => {
      controller!.execute({ kind: 'undo' })
    })
    expect(controller!.getDocument()).toEqual(before)
    view.rerender(<CanvasEditor {...props} aiOpen />)
    fireEvent.doubleClick(
      screen.getByRole('button', { name: /Canvas buddy: Read here/u }),
    )
    expect(openAI).toHaveBeenCalledOnce()
    view.rerender(
      <CanvasEditor {...props} active={false} allowBackgroundCommands />,
    )
    expect(
      screen.queryByRole('button', { name: /Canvas buddy: Read here/u }),
    ).not.toBeInTheDocument()
    view.rerender(<CanvasEditor {...props} aiPresence={null} />)
    expect(
      view.container.querySelector('.canvas-ai-presence'),
    ).not.toBeInTheDocument()
  })
})
