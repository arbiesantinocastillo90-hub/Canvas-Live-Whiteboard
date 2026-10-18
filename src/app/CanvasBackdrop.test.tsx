import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CanvasEditor, { type CanvasEditorController } from './CanvasEditor'
import { connectElements, createElement } from './canvasOperations'
import { createCanvasDocument } from './lcanvas'

const rectangle = (
  left: number,
  top: number,
  width: number,
  height: number,
) => ({
  x: left,
  y: top,
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  toJSON: () => ({}),
})
let resize: (() => void) | undefined
let pending: Map<number, FrameRequestCallback>
let sequence: number
function paint() {
  act(() => {
    const frames = [...pending.values()]
    pending.clear()
    frames.forEach((callback) => callback(performance.now()))
  })
}
function board() {
  let document = createElement(createCanvasDocument('Backdrop'), {
    id: 'one',
    type: 'rectangle',
    x: -80,
    y: -30,
    width: 140,
    height: 90,
    text: 'Across the gutter',
    fill: '#112233',
  })
  document = createElement(document, {
    id: 'two',
    type: 'ellipse',
    x: 300,
    y: 100,
    width: 140,
    height: 90,
  })
  return connectElements(document, 'one', 'two', { id: 'edge' })
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.stubGlobal('PointerEvent', MouseEvent)
  pending = new Map()
  sequence = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pending.set(++sequence, callback)
    return sequence
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback
      }
      observe() {}
      disconnect() {}
    },
  )
})

describe('full-deck canvas continuation', () => {
  it('aligns the decorative drawing and grid to the actual stage and puts controls at deck level', () => {
    let controller: CanvasEditorController | null = null
    const document = board()
    const changed = vi.fn()
    const view = render(
      <div className="app-shell">
        <div className="workspace-deck">
          <aside className="dock-panel" data-pinned="true" />
          <div className="canvas-column">
            <CanvasEditor
              document={document}
              grid="dots"
              aiOpen={false}
              dockHost={null}
              onToggleAI={vi.fn()}
              onDocumentChange={changed}
              onControllerReady={(value) => {
                controller = value
              }}
            />
          </div>
          <aside className="dock-panel" data-pinned="true" />
        </div>
      </div>,
    )
    const deck = view.container.querySelector<HTMLElement>('.workspace-deck')!
    const column = view.container.querySelector<HTMLElement>('.canvas-column')!
    const stage = screen.getByRole('region', { name: 'Backdrop canvas view' })
    vi.spyOn(deck, 'getBoundingClientRect').mockReturnValue(
      rectangle(0, 0, 1003, 832),
    )
    const columnRect = vi
      .spyOn(column, 'getBoundingClientRect')
      .mockReturnValue(rectangle(270, 0, 400, 832))
    const stageRect = vi
      .spyOn(stage, 'getBoundingClientRect')
      .mockReturnValue(rectangle(270, 40, 400, 770))
    act(() => resize?.())
    paint()
    const backdrop = deck.querySelector<HTMLElement>('.canvas-backdrop')!
    expect(backdrop.parentElement).toBe(deck)
    expect(backdrop).toHaveAttribute('aria-hidden', 'true')
    expect(backdrop).toHaveAttribute('inert')
    expect(backdrop.style.getPropertyValue('--canvas-grid-x')).toBe('270px')
    expect(backdrop.style.getPropertyValue('--canvas-grid-y')).toBe('40px')
    expect(backdrop.querySelector('svg > g')).toHaveAttribute(
      'transform',
      'translate(270 40) scale(1)',
    )
    expect(
      backdrop.querySelector('[data-element-id], [role="button"], [tabindex]'),
    ).toBeNull()
    const allIds = [...view.container.querySelectorAll('[id]')].map(
      (element) => element.id,
    )
    expect(new Set(allIds).size).toBe(allIds.length)
    const rail = screen.getByRole('toolbar', { name: 'Canvas controls' })
    expect(rail.parentElement).toBe(deck)
    expect(rail).toHaveClass('canvas-deck-rail')
    expect(rail.style.getPropertyValue('--deck-rail-right')).toBe('333px')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(controller!.getDocument().viewport.zoom).toBeCloseTo(1.2)
    const viewport = controller!.getDocument().viewport
    expect(backdrop.querySelector('svg > g')).toHaveAttribute(
      'transform',
      `translate(${viewport.x + 270} ${viewport.y + 40}) scale(1.2)`,
    )
    // Swapping equally sized pinned panels can move the stage without resizing it.
    columnRect.mockReturnValue(rectangle(330, 0, 400, 832))
    stageRect.mockReturnValue(rectangle(330, 40, 400, 770))
    fireEvent(window, new Event('resize'))
    paint()
    expect(backdrop.style.getPropertyValue('--canvas-grid-x')).toBe(
      `${viewport.x + 330}px`,
    )
    expect(rail.style.getPropertyValue('--deck-rail-right')).toBe('273px')
    expect(changed).toHaveBeenCalledOnce()
    view.unmount()
    expect(pending.size).toBe(0)
  })

  it('removes decoration and portal controls while the editor is inactive', () => {
    const document = board()
    function Editor({ active }: { active: boolean }) {
      return (
        <div className="app-shell">
          <div className="workspace-deck">
            <div className="canvas-column">
              <CanvasEditor
                document={document}
                grid="lines"
                aiOpen={false}
                dockHost={null}
                active={active}
                onToggleAI={vi.fn()}
                onDocumentChange={vi.fn()}
              />
            </div>
          </div>
        </div>
      )
    }
    const view = render(<Editor active />)
    expect(view.container.querySelector('.canvas-backdrop')).not.toBeNull()
    view.rerender(<Editor active={false} />)
    expect(view.container.querySelector('.canvas-backdrop')).toBeNull()
    expect(view.container.querySelector('.canvas-deck-rail')).toBeNull()
    view.unmount()
    expect(pending.size).toBe(0)
  })
})
