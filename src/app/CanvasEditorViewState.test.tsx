import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CanvasEditor, {
  type CanvasEditorController,
  type CanvasEditorProps,
} from './CanvasEditor'
import { createCanvasDocument } from './lcanvas'
import { createElement } from './canvasOperations'
import { zoomAt } from './canvasViewport'

function mount(overrides: Partial<CanvasEditorProps> = {}) {
  let controller: CanvasEditorController | null = null
  const onDocumentChange = vi.fn()
  const onStatusChange = vi.fn()
  const document = createElement(createCanvasDocument('View state'), {
    type: 'rectangle',
    id: 'shape',
    x: 20,
    y: 30,
    width: 100,
    height: 70,
  })
  const result = render(
    <CanvasEditor
      document={document}
      grid="dots"
      aiOpen={false}
      onToggleAI={() => undefined}
      onDocumentChange={onDocumentChange}
      onStatusChange={onStatusChange}
      onControllerReady={(ready) => {
        controller = ready
      }}
      {...overrides}
    />,
  )
  return {
    ...result,
    document,
    onDocumentChange,
    onStatusChange,
    stage: screen.getByRole('region', { name: 'View state canvas view' }),
    controller() {
      if (!controller) throw new Error('Editor controller did not mount')
      return controller
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('copied canvas view state', () => {
  it('restores the copied camera, visible selection, tool, and layer without fitting or editing', () => {
    const viewport = { x: -129.25, y: 317.75, zoom: 1.65 }
    const connection = {
      arrowStyle: 'both' as const,
      style: 'elbow' as const,
      sourceSide: 'bottom' as const,
      targetSide: 'auto' as const,
    }
    const { controller, stage, onDocumentChange } = mount({
      initialSession: { tool: 'select', activeLayerId: null },
      initialViewState: {
        viewport,
        selectedIds: ['shape', 'missing', 'shape'],
        tool: 'pan',
        activeLayerId: 'layer-main',
        connection,
      },
    })
    expect(controller().getViewState()).toEqual({
      viewport,
      selectedIds: ['shape'],
      tool: 'pan',
      activeLayerId: 'layer-main',
      connection,
    })
    expect(stage).toHaveAttribute('data-mode', 'pan')
    expect(stage).toHaveAttribute('data-selection-count', '1')
    expect(stage.querySelector('svg > g')).toHaveAttribute(
      'transform',
      'translate(-129.25 317.75) scale(1.65)',
    )
    expect(onDocumentChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Connect objects' }))
    expect(screen.getByLabelText('New connection arrows')).toHaveValue('both')
    expect(screen.getByLabelText('New connection path')).toHaveValue('elbow')
    expect(screen.getByLabelText('New connection source side')).toHaveValue(
      'bottom',
    )
    expect(screen.getByLabelText('New connection target side')).toHaveValue(
      'auto',
    )
    fireEvent.change(screen.getByLabelText('New connection arrows'), {
      target: { value: 'none' },
    })
    expect(controller().getViewState()).toMatchObject({
      tool: 'connect',
      connection: { ...connection, arrowStyle: 'none' },
    })
  })

  it('copies the most recent wheel camera before its animation frame is drawn', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(91)
    const { controller, stage, onDocumentChange, document } = mount()
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
    fireEvent.wheel(stage, { deltaY: -80, clientX: 210, clientY: 170 })
    const expected = zoomAt(document.viewport, Math.exp(0.16), {
      x: 200,
      y: 150,
    })
    expect(controller().getViewState().viewport).toEqual(expected)
    expect(controller().getDocument().viewport).toEqual(expected)
    expect(onDocumentChange).not.toHaveBeenCalled()
    const copied = controller().getViewState()
    copied.viewport.x = 999
    copied.selectedIds.push('invented')
    expect(controller().getViewState()).toMatchObject({
      viewport: expected,
      selectedIds: [],
    })
  })

  it('moves status reporting to the parent without losing accessible canvas instructions', () => {
    const { container, onStatusChange, stage, controller } = mount({
      statusInFooter: true,
      initialViewState: {
        viewport: { x: 0, y: 0, zoom: 1.25 },
        selectedIds: ['shape'],
        tool: 'select',
        activeLayerId: 'layer-main',
      },
    })
    expect(container.querySelector('.canvas-view-status')).toBeNull()
    expect(onStatusChange).toHaveBeenLastCalledWith({
      instructions:
        'Drag to move · Edge to resize · Side handle to connect · Right-click for properties · Scroll to zoom',
      selection: 'rectangle · Main',
      visibleCount: 1,
      zoom: 1.25,
    })
    expect(stage).toHaveAccessibleDescription(
      'Drag to move · Edge to resize · Side handle to connect · Right-click for properties · Scroll to zoom',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Pan canvas' }))
    expect(controller().getViewState().tool).toBe('pan')
    expect(onStatusChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        instructions: 'Drag to pan · Scroll to zoom',
      }),
    )
  })

  it('retains the standalone editor status bar when no parent footer is supplied', () => {
    const { container } = mount()
    expect(container.querySelector('.canvas-view-status')).toBeVisible()
    expect(screen.getByLabelText('Canvas zoom')).toHaveTextContent('100%')
  })
})
