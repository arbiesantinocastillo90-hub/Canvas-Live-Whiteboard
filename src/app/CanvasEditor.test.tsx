import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CanvasEditor from './CanvasEditor'
import { createCanvasDocument, type CanvasDocument } from './lcanvas'
import {
  addLayer,
  assignElementArea,
  connectElements,
  createElement,
  updateLayer,
} from './canvasOperations'

const bounds = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 600,
  bottom: 400,
  width: 600,
  height: 400,
  toJSON: () => ({}),
}

function shape(
  document = createCanvasDocument('Plan'),
  id = 'box',
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
  })
}

function mount(document = createCanvasDocument('Plan'), aiOpen = false) {
  const onDocumentChange = vi.fn()
  const onToggleAI = vi.fn()
  const onToggleFocus = vi.fn()
  const rendered = render(
    <CanvasEditor
      document={document}
      grid="dots"
      aiOpen={aiOpen}
      onToggleAI={onToggleAI}
      onDocumentChange={onDocumentChange}
      onToggleFocus={onToggleFocus}
    />,
  )
  const stage = screen.getByRole('region', { name: 'Plan canvas view' })
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(bounds)
  function latest(): CanvasDocument {
    return onDocumentChange.mock.lastCall?.[0] ?? document
  }
  function object(id: string) {
    const item = rendered.container.querySelector(`[data-element-id="${id}"]`)
    if (!item) throw new Error(`Object ${id} is not visible`)
    return item
  }
  function select(id: string) {
    fireEvent.pointerDown(object(id), { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerUp(stage, { clientX: 0, clientY: 0 })
  }
  return {
    ...rendered,
    stage,
    onDocumentChange,
    onToggleAI,
    onToggleFocus,
    latest,
    object,
    select,
  }
}

function mountDock(document = createCanvasDocument('Plan')) {
  const onDocumentChange = vi.fn()
  function DockEditor() {
    const [host, setHost] = useState<HTMLDivElement | null>(null)
    const [panel, setPanel] = useState('tools')
    return (
      <>
        <div ref={setHost} data-testid="right-dock" data-canvas-root>
          <button
            type="button"
            aria-label="Show properties"
            onClick={() => setPanel('properties')}
          >
            Properties
          </button>
          <button
            type="button"
            aria-label="Close right dock"
            onClick={() => setPanel('none')}
          >
            ×
          </button>
        </div>
        <CanvasEditor
          document={document}
          grid="dots"
          aiOpen={panel === 'ai'}
          onToggleAI={() => setPanel(panel === 'ai' ? 'none' : 'ai')}
          onDocumentChange={onDocumentChange}
          dockHost={host}
          toolsOpen={panel === 'tools'}
          onToolsOpenChange={(open) => setPanel(open ? 'tools' : 'none')}
          propertiesOpen={panel === 'properties'}
          onPropertiesOpenChange={(open) =>
            setPanel(open ? 'properties' : 'none')
          }
        />
      </>
    )
  }
  const rendered = render(<DockEditor />)
  const stage = screen.getByRole('region', { name: 'Plan canvas view' })
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(bounds)
  return {
    ...rendered,
    stage,
    host: screen.getByTestId('right-dock'),
    onDocumentChange,
    latest: (): CanvasDocument =>
      onDocumentChange.mock.lastCall?.[0] ?? document,
    object: (id: string) => {
      const item = rendered.container.querySelector(`[data-element-id="${id}"]`)
      if (!item) throw new Error(`Object ${id} is not visible`)
      return item
    },
  }
}

describe('shared right canvas dock', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('PointerEvent', MouseEvent)
  })

  it('renders drawing tools only in the dock and retains canvas editing history', () => {
    const { host, container, latest, onDocumentChange } = mountDock()
    expect(
      container.querySelector('.canvas-editor .canvas-edit-toolbar'),
    ).toBeNull()
    expect(
      within(host).getByRole('toolbar', { name: 'Canvas tools' }),
    ).toBeVisible()
    const toolsLauncher = screen.getByRole('button', {
      name: 'Open right panel',
    })
    expect(toolsLauncher).toHaveAttribute('data-dock-trigger', 'right')
    expect(
      screen.queryByRole('button', { name: 'Open object properties' }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Open AI workspace panel' }),
    ).toBeNull()
    expect(
      within(screen.getByRole('toolbar', { name: 'Canvas controls' }))
        .getAllByRole('button')
        .filter((button) => button.hasAttribute('data-dock-trigger')),
    ).toHaveLength(1)
    fireEvent.click(toolsLauncher)
    fireEvent.click(toolsLauncher)
    expect(toolsLauncher).toHaveAttribute('aria-expanded', 'true')
    expect(onDocumentChange).not.toHaveBeenCalled()
    for (const name of [
      'Add rectangle',
      'Add ellipse',
      'Add diamond',
      'Add area',
    ]) {
      expect(screen.getAllByRole('button', { name })).toHaveLength(1)
      expect(
        within(host).getByRole('button', { name }).textContent?.trim(),
      ).toBe('')
      expect(within(host).getByRole('button', { name })).toHaveAttribute(
        'title',
      )
      fireEvent.click(within(host).getByRole('button', { name }))
    }
    expect(latest().elements.map((element) => element.type)).toEqual([
      'rectangle',
      'ellipse',
      'diamond',
      'area',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Close right dock' }))
    expect(screen.queryByRole('toolbar', { name: 'Canvas tools' })).toBeNull()
    expect(onDocumentChange).toHaveBeenCalledTimes(4)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(latest().elements).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Open right panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(latest().elements).toHaveLength(4)
    expect(
      container.querySelector('.canvas-editor .canvas-inspector-slot'),
    ).toBeNull()
  })

  it('keeps unapplied property text when the dock is closed and reopened', () => {
    const { host, latest, onDocumentChange } = mountDock()
    fireEvent.click(within(host).getByRole('button', { name: 'Add text' }))
    expect(screen.queryByRole('toolbar', { name: 'Canvas tools' })).toBeNull()
    const field = within(host).getByRole('textbox', { name: 'Text' })
    fireEvent.change(field, { target: { value: 'Retain my draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close right dock' }))
    expect(screen.queryByRole('textbox', { name: 'Text' })).toBeNull()
    expect(onDocumentChange).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Show properties' }))
    expect(within(host).getByRole('textbox', { name: 'Text' })).toHaveValue(
      'Retain my draft',
    )
    fireEvent.click(
      within(host).getByRole('button', { name: 'Apply properties' }),
    )
    expect(latest().elements[0]).toMatchObject({
      type: 'text',
      text: 'Retain my draft',
    })
  })

  it('creates connections using dock style controls and keeps the chosen mode across a close', () => {
    const document = shape(
      shape(createCanvasDocument('Plan'), 'from'),
      'to',
      300,
    )
    const { host, object, latest, onDocumentChange } = mountDock(document)
    fireEvent.click(
      within(host).getByRole('button', { name: 'Connect objects' }),
    )
    fireEvent.change(within(host).getByLabelText('New connection arrows'), {
      target: { value: 'both' },
    })
    fireEvent.change(within(host).getByLabelText('New connection path'), {
      target: { value: 'elbow' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Close right dock' }))
    expect(onDocumentChange).not.toHaveBeenCalled()
    fireEvent.pointerDown(object('from'), { button: 0 })
    fireEvent.pointerDown(object('to'), { button: 0 })
    expect(latest().elements.at(-1)).toMatchObject({
      type: 'connection',
      fromId: 'from',
      toId: 'to',
      startArrow: true,
      endArrow: true,
      style: 'elbow',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open right panel' }))
    expect(
      within(host).getByRole('button', { name: 'Select objects' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not fall back to a top toolbar while the shared dock host is being attached', () => {
    const onDocumentChange = vi.fn()
    const rendered = render(
      <CanvasEditor
        document={createCanvasDocument('Plan')}
        grid="dots"
        aiOpen={false}
        onToggleAI={vi.fn()}
        onDocumentChange={onDocumentChange}
        dockHost={null}
        toolsOpen
        propertiesOpen
      />,
    )
    expect(screen.queryByRole('toolbar', { name: 'Drawing tools' })).toBeNull()
    expect(screen.queryByRole('toolbar', { name: 'Canvas tools' })).toBeNull()
    expect(
      rendered.container.querySelector('.canvas-inspector-slot'),
    ).toBeNull()
    expect(onDocumentChange).not.toHaveBeenCalled()
  })
})

describe('manual LCANVAS editor', () => {
  it('initializes a restored tool once and keeps a subsequent user tool choice', () => {
    const document = createCanvasDocument('Plan')
    const onSessionChange = vi.fn()
    const props = {
      document,
      grid: 'dots' as const,
      aiOpen: false,
      onToggleAI: vi.fn(),
      onDocumentChange: vi.fn(),
      onSessionChange,
    }
    const test = render(
      <CanvasEditor
        {...props}
        initialSession={{ tool: 'pan', activeLayerId: document.layers[0].id }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Pan canvas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Select objects' }))
    test.rerender(
      <CanvasEditor
        {...props}
        initialSession={{
          tool: 'connect',
          activeLayerId: document.layers[0].id,
        }}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Select objects' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(onSessionChange).toHaveBeenLastCalledWith({
      tool: 'select',
      activeLayerId: document.layers[0].id,
    })
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('PointerEvent', MouseEvent)
  })

  it('creates supported shapes, standalone text and an area on the active layer', () => {
    const { latest, onDocumentChange } = mount()
    for (const name of [
      'Add rectangle',
      'Add ellipse',
      'Add diamond',
      'Add text',
      'Add area',
    ])
      fireEvent.click(screen.getByRole('button', { name }))
    expect(latest().elements.map((element) => element.type)).toEqual([
      'rectangle',
      'ellipse',
      'diamond',
      'text',
      'area',
    ])
    expect(
      latest().elements.every(
        (element) => element.layerId === latest().layers[0].id,
      ),
    ).toBe(true)
    expect(onDocumentChange).toHaveBeenCalledTimes(5)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(latest().elements).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(latest().elements).toHaveLength(5)
  })

  it('treats a complete multi-move drag as one content transaction', () => {
    const { stage, object, latest, onDocumentChange } = mount(shape())
    fireEvent.pointerDown(object('box'), {
      button: 0,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(stage, { clientX: 120, clientY: 110 })
    fireEvent.pointerMove(stage, { clientX: 150, clientY: 130 })
    expect(onDocumentChange).not.toHaveBeenCalled()
    fireEvent.pointerUp(stage, { clientX: 150, clientY: 130 })
    expect(latest().elements[0]).toMatchObject({ x: 60, y: 50 })
    expect(onDocumentChange).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(latest().elements[0]).toMatchObject({ x: 10, y: 20 })
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(latest().elements[0]).toMatchObject({ x: 60, y: 50 })
  })

  it('rolls back a cancelled gesture without saving or adding undo entries', () => {
    const { stage, object, onDocumentChange } = mount(shape())
    fireEvent.pointerDown(object('box'), { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(stage, { clientX: 100, clientY: 60 })
    fireEvent.pointerCancel(stage)
    expect(onDocumentChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(object('box').querySelector('rect')).toHaveAttribute('x', '10')
  })

  it('resizes from the corner and restores dimensions on undo', () => {
    const { stage, select, latest } = mount(shape())
    select('box')
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Resize selected object' }),
      { button: 0, clientX: 150, clientY: 120 },
    )
    fireEvent.pointerMove(stage, { clientX: 210, clientY: 150 })
    fireEvent.pointerUp(stage, { clientX: 210, clientY: 150 })
    expect(latest().elements[0]).toMatchObject({ width: 200, height: 130 })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(latest().elements[0]).toMatchObject({ width: 140, height: 100 })
  })

  it('uses world coordinates after zooming and keeps camera movement outside content undo', () => {
    const { stage, object, latest } = mount(shape())
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(latest().viewport.zoom).toBe(1.2)
    fireEvent.pointerDown(object('box'), { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(stage, { clientX: 120, clientY: 60 })
    fireEvent.pointerUp(stage, { clientX: 120, clientY: 60 })
    expect(latest().elements[0]).toMatchObject({ x: 110, y: 70 })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(latest().elements[0]).toMatchObject({ x: 10, y: 20 })
    expect(latest().viewport.zoom).toBe(1.2)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(latest().viewport.zoom).toBe(1.2)
  })

  it('pans using its explicit tool and preserves view controls beside closed panels', () => {
    const { stage, latest, onToggleAI, onToggleFocus } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Pan canvas' }))
    fireEvent.pointerDown(stage, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(stage, { clientX: 40, clientY: 20 })
    fireEvent.pointerUp(stage, { clientX: 40, clientY: 20 })
    expect(latest().viewport).toEqual({ x: 40, y: 20, zoom: 1 })
    for (const name of ['Undo', 'Reset view', 'Redo', 'Zoom in', 'Zoom out'])
      expect(screen.getByRole('button', { name })).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'Open AI workspace panel' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Full screen canvas' }))
    expect(onToggleAI).toHaveBeenCalledOnce()
    expect(onToggleFocus).toHaveBeenCalledOnce()
  })

  it('temporarily pans over an object while Space is held and restores the select tool on release', () => {
    const { stage, object, latest } = mount(shape())
    stage.focus()
    fireEvent.keyDown(stage, { key: ' ' })
    expect(stage).toHaveAttribute('data-mode', 'pan')
    fireEvent.pointerDown(object('box'), {
      button: 0,
      clientX: 10,
      clientY: 20,
    })
    fireEvent.pointerMove(stage, { clientX: 50, clientY: 70 })
    fireEvent.pointerUp(stage, { clientX: 50, clientY: 70 })
    expect(latest().viewport).toMatchObject({ x: 40, y: 50 })
    expect(latest().elements[0]).toMatchObject({ x: 10, y: 20 })
    fireEvent.keyUp(window, { key: ' ' })
    expect(stage).toHaveAttribute('data-mode', 'select')
    fireEvent.pointerDown(object('box'), {
      button: 0,
      clientX: 10,
      clientY: 20,
    })
    fireEvent.pointerMove(stage, { clientX: 30, clientY: 40 })
    fireEvent.pointerUp(stage, { clientX: 30, clientY: 40 })
    expect(latest().elements[0]).toMatchObject({ x: 30, y: 40 })
    fireEvent.keyDown(stage, { key: ' ' })
    fireEvent.blur(window)
    expect(stage).toHaveAttribute('data-mode', 'select')
  })

  it('creates plain elbow connections and recalculates endpoints when shapes move', () => {
    const document = shape(
      shape(createCanvasDocument('Plan'), 'from', 10, 20),
      'to',
      310,
      200,
    )
    const { object, stage, latest } = mount(document)
    fireEvent.click(screen.getByRole('button', { name: 'Connect objects' }))
    fireEvent.change(screen.getByLabelText('New connection arrows'), {
      target: { value: 'none' },
    })
    fireEvent.change(screen.getByLabelText('New connection path'), {
      target: { value: 'elbow' },
    })
    fireEvent.pointerDown(object('from'), { button: 0 })
    fireEvent.pointerDown(object('to'), { button: 0 })
    const connection = latest().elements.at(-1)
    expect(connection).toMatchObject({
      type: 'connection',
      fromId: 'from',
      toId: 'to',
      startArrow: false,
      endArrow: false,
      style: 'elbow',
    })
    if (!connection) throw new Error('Missing connection')
    const path = object(connection.id).querySelector(
      'path[vector-effect="non-scaling-stroke"]',
    )
    expect(path).not.toHaveAttribute('marker-end')
    const before = path?.getAttribute('d')
    fireEvent.pointerDown(object('from'), { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(stage, { clientX: 60, clientY: 0 })
    fireEvent.pointerUp(stage, { clientX: 60, clientY: 0 })
    expect(
      object(connection.id)
        .querySelector('path[vector-effect="non-scaling-stroke"]')
        ?.getAttribute('d'),
    ).not.toBe(before)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(
      object(connection.id)
        .querySelector('path[vector-effect="non-scaling-stroke"]')
        ?.getAttribute('d'),
    ).toBe(before)
  })

  it('supports both arrowheads and removes attached connections when deleting a shape', () => {
    const document = shape(
      shape(createCanvasDocument('Plan'), 'from'),
      'to',
      310,
      100,
    )
    const { object, latest, select, stage } = mount(document)
    fireEvent.click(screen.getByRole('button', { name: 'Connect objects' }))
    fireEvent.change(screen.getByLabelText('New connection arrows'), {
      target: { value: 'both' },
    })
    fireEvent.pointerDown(object('from'), { button: 0 })
    fireEvent.pointerDown(object('to'), { button: 0 })
    const edge = latest().elements.at(-1)
    if (!edge) throw new Error('Missing connection')
    expect(object(edge.id).querySelector('path[marker-start]')).toHaveAttribute(
      'marker-end',
    )
    select('from')
    fireEvent.keyDown(stage, { key: 'Delete' })
    expect(latest().elements.map((element) => element.id)).toEqual(['to'])
    fireEvent.keyDown(stage, { key: 'z', ctrlKey: true })
    expect(latest().elements).toHaveLength(3)
  })

  it('moves an area and its explicit members as one undoable transaction', () => {
    let document = createElement(createCanvasDocument('Plan'), {
      type: 'area',
      id: 'area',
      x: 0,
      y: 0,
      width: 600,
      height: 400,
    })
    document = shape(document, 'inside', 40, 60)
    document = assignElementArea(document, 'inside', 'area')
    const { object, stage, latest } = mount(document)
    fireEvent.pointerDown(object('area'), { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(stage, { clientX: 100, clientY: 80 })
    fireEvent.pointerUp(stage, { clientX: 100, clientY: 80 })
    expect(
      latest().elements.find((element) => element.id === 'area'),
    ).toMatchObject({ x: 100, y: 80 })
    expect(
      latest().elements.find((element) => element.id === 'inside'),
    ).toMatchObject({ x: 140, y: 140, areaId: 'area' })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(
      latest().elements.find((element) => element.id === 'inside'),
    ).toMatchObject({ x: 40, y: 60, areaId: 'area' })
  })

  it('respects hidden and locked layers', () => {
    let document = addLayer(shape(), 'Hidden', 'hidden')
    document = createElement(document, {
      type: 'ellipse',
      id: 'hidden-object',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      layerId: 'hidden',
    })
    document = updateLayer(
      updateLayer(document, 'hidden', { visible: false }),
      'layer-main',
      { locked: true },
    )
    const { object, container, stage, onDocumentChange, select } =
      mount(document)
    expect(
      container.querySelector('[data-element-id="hidden-object"]'),
    ).toBeNull()
    select('box')
    expect(object('box')).toHaveAttribute('data-editable', 'false')
    expect(
      screen.queryByRole('button', { name: 'Resize selected object' }),
    ).toBeNull()
    fireEvent.pointerDown(object('box'), { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(stage, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(stage)
    expect(onDocumentChange).not.toHaveBeenCalled()
  })

  it('closes AI before opening object properties and closes properties before opening AI', () => {
    const { onToggleAI } = mount(createCanvasDocument('Plan'), true)
    fireEvent.click(
      screen.getByRole('button', { name: 'Open object properties' }),
    )
    expect(onToggleAI).toHaveBeenCalledOnce()
    expect(
      screen.getByRole('button', { name: 'Close object properties' }),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Close AI workspace panel' }),
    )
    expect(
      screen.getByRole('button', { name: 'Open object properties' }),
    ).toBeInTheDocument()
  })

  it('keeps hidden objects inspectable through the object list without drawing their selection frame', () => {
    let document = addLayer(createCanvasDocument('Plan'), 'Hidden', 'hidden')
    document = createElement(document, {
      type: 'ellipse',
      id: 'hidden-object',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      layerId: 'hidden',
    })
    document = updateLayer(document, 'hidden', { visible: false })
    const { container } = mount(document)
    fireEvent.click(
      screen.getByRole('button', { name: 'Open object properties' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Select Ellipse on Hidden' }),
    )
    expect(screen.getByText('Layer hidden or locked.')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Clear object selection' }),
    ).toBeInTheDocument()
    expect(container.querySelector('.canvas-selection')).toBeNull()
  })

  it('collapses object properties when entering full screen', () => {
    const { onToggleFocus } = mount()
    fireEvent.click(
      screen.getByRole('button', { name: 'Open object properties' }),
    )
    expect(
      screen.getByRole('complementary', {
        name: 'Canvas properties and layers',
      }),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Full screen canvas' }))
    expect(onToggleFocus).toHaveBeenCalledOnce()
    expect(
      screen.queryByRole('complementary', {
        name: 'Canvas properties and layers',
      }),
    ).toBeNull()
  })

  it('renders literal text without HTML, links or imported IDs in fragment references', () => {
    const document = createElement(createCanvasDocument('Plan'), {
      type: 'diamond',
      id: 'odd ) "',
      x: 0,
      y: 0,
      width: 240,
      height: 200,
      text: '<script>alert(1)</script>\nhttps://example.com',
    })
    const { container } = mount(document)
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
    expect(container.querySelector('script,a,foreignObject')).toBeNull()
    expect(container.querySelector('clipPath')?.id).toMatch(/^[\w-]+$/u)
  })

  it('restores an attached edge together with an area membership after undo', () => {
    let document = createElement(createCanvasDocument('Plan'), {
      type: 'area',
      id: 'area',
      x: 0,
      y: 0,
      width: 600,
      height: 400,
    })
    document = shape(shape(document, 'a', 20, 30), 'b', 300, 200)
    document = assignElementArea(
      assignElementArea(document, 'a', 'area'),
      'b',
      'area',
    )
    document = connectElements(document, 'a', 'b', {
      id: 'edge',
      areaId: 'area',
    })
    const { object, stage, latest } = mount(document)
    fireEvent.pointerDown(object('a'), { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(stage, { clientX: -200, clientY: 0 })
    fireEvent.pointerUp(stage, { clientX: -200, clientY: 0 })
    expect(
      latest().elements.find((element) => element.id === 'a')?.areaId,
    ).toBeNull()
    expect(
      latest().elements.find((element) => element.id === 'edge')?.areaId,
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(
      latest().elements.find((element) => element.id === 'a')?.areaId,
    ).toBe('area')
    expect(
      latest().elements.find((element) => element.id === 'edge')?.areaId,
    ).toBe('area')
  })
})
