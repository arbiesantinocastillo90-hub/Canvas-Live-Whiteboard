import { useState } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CanvasInspector } from './CanvasInspector'
import { CANVAS_LAYER_DRAG_MIME } from './canvasLayerDrag'
import {
  createCanvasDocument,
  DEFAULT_LAYER_ID,
  type CanvasDocument,
  type ShapeElement,
} from './lcanvas'

function shape(id = 'shape-one', x = 30): ShapeElement {
  return {
    id,
    type: 'rectangle',
    x,
    y: 40,
    width: 100,
    height: 70,
    color: '#334455',
    fill: null,
    text: '',
    fontSize: 20,
    layerId: DEFAULT_LAYER_ID,
    areaId: null,
  }
}

function fixture(): CanvasDocument {
  return { ...createCanvasDocument('Plan'), elements: [shape()] }
}

function mount(
  document = fixture(),
  selectedId: string | null = 'shape-one',
  selectedIds?: string[],
) {
  const onDocumentChange = vi.fn()
  const onActiveLayerChange = vi.fn()
  const onError = vi.fn()
  const onSelect = vi.fn()
  function Harness() {
    const [current, setCurrent] = useState(document)
    const [selected, setSelected] = useState(selectedId)
    const [activeLayer, setActiveLayer] = useState(DEFAULT_LAYER_ID)
    return (
      <CanvasInspector
        document={current}
        selectedId={selected}
        selectedIds={selectedIds}
        activeLayerId={activeLayer}
        onDocumentChange={(next) => {
          onDocumentChange(next)
          setCurrent(next)
        }}
        onActiveLayerChange={(id) => {
          onActiveLayerChange(id)
          setActiveLayer(id)
        }}
        onError={onError}
        onSelect={(id) => {
          onSelect(id)
          setSelected(id)
        }}
      />
    )
  }
  render(<Harness />)
  function changed(): CanvasDocument {
    return onDocumentChange.mock.calls.at(-1)![0] as CanvasDocument
  }
  return { onDocumentChange, onActiveLayerChange, onError, onSelect, changed }
}

function transfer(): DataTransfer {
  const values = new Map<string, string>()
  return {
    effectAllowed: 'none',
    dropEffect: 'none',
    setData: (type: string, value: string) => values.set(type, value),
    getData: (type: string) => values.get(type) ?? '',
  } as unknown as DataTransfer
}
function drag(
  type: string,
  target: Element,
  dataTransfer: DataTransfer,
  clientY = 0,
) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    dataTransfer: { value: dataTransfer },
    clientY: { value: clientY },
  })
  fireEvent(target, event)
}

describe('canvas properties and layers', () => {
  it('commits valid tweaks before clearing selection without Apply', () => {
    const { changed, onDocumentChange } = mount()
    fireEvent.change(screen.getByLabelText('Width'), {
      target: { value: '275' },
    })
    fireEvent.change(screen.getByLabelText('Text inside shape'), {
      target: { value: 'Remember this' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear object selection' }),
    )
    expect(changed().elements[0]).toMatchObject({
      width: 275,
      text: 'Remember this',
    })
    expect(onDocumentChange).toHaveBeenCalledOnce()
    expect(screen.getByText('No selection')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'Select Remember this on Main' }),
    )
    expect(screen.getByLabelText('Width')).toHaveValue(275)
  })

  it('debounces a valid draft without replacing its focused field', () => {
    vi.useFakeTimers()
    try {
      const { changed, onDocumentChange } = mount()
      const field = screen.getByLabelText('Text inside shape')
      field.focus()
      fireEvent.change(field, { target: { value: 'First' } })
      act(() => vi.advanceTimersByTime(200))
      fireEvent.change(field, { target: { value: 'First and second' } })
      act(() => vi.advanceTimersByTime(299))
      expect(onDocumentChange).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(1))
      expect(changed().elements[0]).toMatchObject({ text: 'First and second' })
      expect(onDocumentChange).toHaveBeenCalledOnce()
      expect(screen.getByLabelText('Text inside shape')).toBe(field)
      expect(field).toHaveFocus()
    } finally {
      vi.useRealTimers()
    }
  })

  it('preserves the last valid object when an incomplete geometry draft loses selection', () => {
    const { onDocumentChange } = mount()
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Text inside shape'), {
      target: { value: 'Must stay draft' },
    })
    fireEvent.blur(screen.getByLabelText('Width'))
    expect(onDocumentChange).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear object selection' }),
    )
    expect(onDocumentChange).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Select Rectangle on Main' }),
    )
    expect(screen.getByLabelText('Width')).toHaveValue(100)
    expect(screen.getByLabelText('Text inside shape')).toHaveValue('')
  })

  it('cancels delayed properties when external edits or locking replace the source', () => {
    vi.useFakeTimers()
    try {
      const onDocumentChange = vi.fn()
      const document = fixture()
      const props = {
        selectedId: 'shape-one',
        activeLayerId: DEFAULT_LAYER_ID,
        onSelect: vi.fn(),
        onActiveLayerChange: vi.fn(),
        onDocumentChange,
      }
      const test = render(<CanvasInspector {...props} document={document} />)
      fireEvent.change(screen.getByLabelText('Text inside shape'), {
        target: { value: 'Stale draft' },
      })
      const updated = {
        ...document,
        elements: [{ ...shape(), text: 'AI version' }],
      }
      test.rerender(<CanvasInspector {...props} document={updated} />)
      act(() => vi.advanceTimersByTime(500))
      expect(onDocumentChange).not.toHaveBeenCalled()
      expect(screen.getByLabelText('Text inside shape')).toHaveValue(
        'AI version',
      )
      fireEvent.change(screen.getByLabelText('Width'), {
        target: { value: '250' },
      })
      test.rerender(
        <CanvasInspector
          {...props}
          document={{
            ...updated,
            layers: [{ ...document.layers[0], locked: true }],
          }}
        />,
      )
      act(() => vi.advanceTimersByTime(500))
      expect(onDocumentChange).not.toHaveBeenCalled()
      expect(screen.getByLabelText('Width')).toHaveValue(100)
      expect(screen.getByLabelText('Width')).toBeDisabled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps pending properties across a camera-only replacement and commits the latest view', () => {
    vi.useFakeTimers()
    try {
      const document = fixture()
      const onDocumentChange = vi.fn()
      const props = {
        selectedId: 'shape-one',
        activeLayerId: DEFAULT_LAYER_ID,
        onSelect: vi.fn(),
        onActiveLayerChange: vi.fn(),
        onDocumentChange,
      }
      const test = render(<CanvasInspector {...props} document={document} />)
      const field = screen.getByLabelText('Width')
      field.focus()
      fireEvent.change(field, { target: { value: '275' } })
      const updated = {
        ...structuredClone(document),
        viewport: { x: 125, y: -70, zoom: 1.5 },
      }
      test.rerender(<CanvasInspector {...props} document={updated} />)
      expect(screen.getByLabelText('Width')).toBe(field)
      expect(field).toHaveFocus()
      expect(field).toHaveValue(275)
      act(() => vi.advanceTimersByTime(300))
      expect(onDocumentChange).toHaveBeenCalledOnce()
      expect(onDocumentChange.mock.lastCall?.[0]).toMatchObject({
        viewport: updated.viewport,
        elements: [{ width: 275 }],
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('auto applies connection source and target sides on blur', () => {
    const document = fixture()
    document.elements.push(shape('shape-two', 260), {
      id: 'connection',
      type: 'connection',
      fromId: 'shape-one',
      toId: 'shape-two',
      style: 'straight',
      startArrow: false,
      endArrow: true,
      color: '#334455',
      layerId: DEFAULT_LAYER_ID,
      areaId: null,
    })
    const { changed } = mount(document, 'connection')
    fireEvent.change(screen.getByLabelText('Source side'), {
      target: { value: 'bottom' },
    })
    fireEvent.change(screen.getByLabelText('Target side'), {
      target: { value: 'top' },
    })
    fireEvent.blur(screen.getByLabelText('Target side'))
    expect(changed().elements[2]).toMatchObject({
      fromSide: 'bottom',
      toSide: 'top',
    })
  })
  it('applies text and geometry together as one document change', () => {
    const { onDocumentChange, changed } = mount()
    fireEvent.change(screen.getByLabelText('Text inside shape'), {
      target: { value: 'First milestone\nReady' },
    })
    fireEvent.change(screen.getByLabelText('Width'), {
      target: { value: '240' },
    })
    fireEvent.change(screen.getByLabelText('Height'), {
      target: { value: '130' },
    })
    expect(onDocumentChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Apply properties' }))
    expect(onDocumentChange).toHaveBeenCalledOnce()
    expect(changed().elements[0]).toMatchObject({
      text: 'First milestone\nReady',
      width: 240,
      height: 130,
    })
    expect(
      screen.getByRole('button', { name: 'Select First milestone on Main' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('applies text alignment, fonts and color together with its geometry draft', () => {
    const { changed, onDocumentChange } = mount()
    fireEvent.change(screen.getByLabelText('Width'), {
      target: { value: '240' },
    })
    fireEvent.change(screen.getByLabelText('Horizontal alignment'), {
      target: { value: 'right' },
    })
    fireEvent.change(screen.getByLabelText('Vertical alignment'), {
      target: { value: 'top' },
    })
    fireEvent.change(screen.getByLabelText('Font family'), {
      target: { value: 'mono' },
    })
    fireEvent.change(screen.getByLabelText('Font color'), {
      target: { value: '#1122aa' },
    })
    fireEvent.click(screen.getByLabelText('Bold'))
    fireEvent.click(screen.getByLabelText('Italic'))
    expect(onDocumentChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Apply properties' }))
    expect(onDocumentChange).toHaveBeenCalledOnce()
    expect(changed().elements[0]).toMatchObject({
      width: 240,
      textAlign: 'right',
      verticalAlign: 'top',
      fontFamily: 'mono',
      textColor: '#1122aa',
      fontWeight: 'bold',
      fontStyle: 'italic',
    })
  })

  it('retains pending relationship styles when reversing before the draft debounce', () => {
    const document = fixture()
    document.elements.push(shape('shape-two', 260), {
      id: 'connection',
      type: 'connection',
      fromId: 'shape-one',
      toId: 'shape-two',
      style: 'straight',
      startArrow: false,
      endArrow: true,
      color: '#334455',
      layerId: DEFAULT_LAYER_ID,
      areaId: null,
    })
    const { changed } = mount(document, 'connection')
    fireEvent.change(screen.getByLabelText('Connection path'), {
      target: { value: 'curve' },
    })
    fireEvent.change(screen.getByLabelText('End pointer'), {
      target: { value: 'circle' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reverse connection' }))
    expect(changed().elements[2]).toMatchObject({
      fromId: 'shape-two',
      toId: 'shape-one',
      style: 'curve',
      endPointer: 'circle',
    })
  })

  it('reports invalid numbers without committing a document', () => {
    const { onDocumentChange, onError } = mount()
    fireEvent.change(screen.getByLabelText('X'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply properties' }))
    expect(onDocumentChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a value for X')
    expect(onError).toHaveBeenCalledWith('Enter a value for X.')
  })

  it('keeps text field labels exact when existing text is nonempty', () => {
    const document = fixture()
    document.elements[0] = {
      id: 'shape-one',
      type: 'text',
      x: 30,
      y: 40,
      width: 100,
      height: 70,
      color: '#334455',
      text: 'Existing note',
      fontSize: 20,
      layerId: DEFAULT_LAYER_ID,
      areaId: null,
    }
    const { changed } = mount(document)
    const field = screen.getByRole('textbox', { name: 'Text' })
    expect(field).toHaveValue('Existing note')
    fireEvent.change(field, { target: { value: 'Updated note' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply properties' }))
    expect(changed().elements[0]).toMatchObject({ text: 'Updated note' })
    expect(screen.getByRole('textbox', { name: 'Text' })).toHaveValue(
      'Updated note',
    )
  })

  it('omits area assignment while keeping object layers editable', () => {
    const document = fixture()
    document.elements.push({
      id: 'tiny-area',
      type: 'area',
      name: 'Small area',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      color: '#334455',
      fill: null,
      layerId: DEFAULT_LAYER_ID,
      areaId: null,
    })
    const { onDocumentChange } = mount(document)
    expect(screen.queryByLabelText('Containing area')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Object layer' })).toBeEnabled()
    expect(onDocumentChange).not.toHaveBeenCalled()
  })

  it('retains imported area membership and displays its name while changing geometry', () => {
    const document = fixture()
    document.elements.push({
      id: 'area',
      type: 'area',
      name: 'Roadmap',
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      color: '#334455',
      fill: null,
      layerId: DEFAULT_LAYER_ID,
      areaId: null,
    })
    document.elements[0].areaId = 'area'
    const { changed } = mount(document)
    expect(screen.queryByLabelText('Containing area')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Object layer' })).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Width'), {
      target: { value: '200' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply properties' }))
    expect(changed().elements[0].areaId).toBe('area')
    expect(screen.getByText('Inside Roadmap')).toBeVisible()
  })

  it('moves an area and all its members in one transaction', () => {
    const document = fixture()
    document.elements[0].areaId = 'area'
    document.elements.push({
      id: 'area',
      type: 'area',
      name: 'Roadmap',
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      color: '#334455',
      fill: null,
      layerId: DEFAULT_LAYER_ID,
      areaId: null,
    })
    const { onDocumentChange, changed } = mount(document, 'area')
    expect(screen.getByText('1 member · moves together')).toBeVisible()
    expect(screen.queryByLabelText('Containing area')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('X'), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply properties' }))
    expect(onDocumentChange).toHaveBeenCalledOnce()
    expect(changed().elements[0]).toMatchObject({
      x: 230,
      y: 40,
      areaId: 'area',
    })
  })

  it('locks member editing when the containing area layer is locked', () => {
    const document = fixture()
    document.layers.push({
      id: 'area-layer',
      name: 'Containers',
      visible: true,
      locked: true,
    })
    document.elements[0].areaId = 'area'
    document.elements.push({
      id: 'area',
      type: 'area',
      name: 'Roadmap',
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      color: '#334455',
      fill: null,
      layerId: 'area-layer',
      areaId: null,
    })
    mount(document)
    expect(
      screen.getByRole('button', { name: 'Apply properties' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Delete selected object' }),
    ).toBeDisabled()
    expect(screen.getByLabelText('Text inside shape')).toBeDisabled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Unlock layer Containers' }),
    )
    expect(
      screen.getByRole('button', { name: 'Apply properties' }),
    ).toBeEnabled()
  })

  it('changes connection path, line and pointer styles in one transaction', () => {
    const document = fixture()
    document.elements.push(shape('shape-two', 260), {
      id: 'connection',
      type: 'connection',
      fromId: 'shape-one',
      toId: 'shape-two',
      style: 'straight',
      startArrow: false,
      endArrow: true,
      color: '#334455',
      layerId: DEFAULT_LAYER_ID,
      areaId: null,
    })
    const { changed, onDocumentChange } = mount(document, 'connection')
    expect(screen.queryByLabelText('Width')).not.toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'Connection path' }),
    ).toBeEnabled()
    expect(
      screen.getByRole('combobox', { name: 'Start pointer' }),
    ).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Start pointer'), {
      target: { value: 'circle' },
    })
    fireEvent.change(screen.getByLabelText('End pointer'), {
      target: { value: 'diamond' },
    })
    fireEvent.change(screen.getByLabelText('Line type'), {
      target: { value: 'dashed' },
    })
    fireEvent.change(screen.getByLabelText('Connection path'), {
      target: { value: 'elbow' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply properties' }))
    expect(onDocumentChange).toHaveBeenCalledOnce()
    expect(changed().elements[2]).toMatchObject({
      style: 'elbow',
      linePattern: 'dashed',
      startPointer: 'circle',
      endPointer: 'diamond',
      startArrow: true,
      endArrow: true,
    })
  })

  it('adds and activates a layer, then supports rename, hide, lock and order', () => {
    const { changed, onActiveLayerChange } = mount(fixture(), null)
    fireEvent.change(screen.getByLabelText('New layer name'), {
      target: { value: 'Notes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add layer' }))
    const layerId = changed().layers[1].id
    expect(onActiveLayerChange).toHaveBeenCalledWith(layerId)
    expect(
      screen.getByRole('button', { name: 'Use layer Notes' }),
    ).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByLabelText('Rename layer Notes'), {
      target: { value: 'Ideas' },
    })
    fireEvent.click(
      screen
        .getAllByRole('button', { name: 'Rename' })
        .find((button) => !button.hasAttribute('disabled'))!,
    )
    expect(changed().layers[1].name).toBe('Ideas')
    for (const name of ['Hide layer Ideas', 'Lock layer Ideas']) {
      const action = screen.getByRole('button', { name })
      expect(action).toHaveAttribute('title', name)
      expect(action.textContent?.trim()).toBe('')
      expect(action.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    }
    fireEvent.click(screen.getByRole('button', { name: 'Hide layer Ideas' }))
    expect(changed().layers[1].visible).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Lock layer Ideas' }))
    expect(changed().layers[1].locked).toBe(true)
    expect(
      screen.queryByRole('button', {
        name: /Move layer .* (forward|backward)/,
      }),
    ).toBeNull()
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Drag layer Ideas' }),
      { key: 'ArrowDown', altKey: true },
    )
    expect(changed().layers[0].id).toBe(layerId)
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Drag layer Ideas' }),
      { key: 'ArrowUp', altKey: true },
    )
    expect(changed().layers[1].id).toBe(layerId)
  })

  it('moves a selected object to a named layer and reports that layer', () => {
    const document = fixture()
    document.layers.push({
      id: 'notes',
      name: 'Notes',
      visible: true,
      locked: false,
    })
    const { changed } = mount(document)
    fireEvent.change(screen.getByLabelText('Object layer'), {
      target: { value: 'notes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply properties' }))
    expect(changed().elements[0].layerId).toBe('notes')
    expect(
      screen.getByRole('button', { name: 'Select Rectangle on Notes' }),
    ).toBeVisible()
  })

  it('deletes one selected shape and its connection, then clears selection', () => {
    const document = fixture()
    document.elements.push(shape('shape-two', 260), {
      id: 'connection',
      type: 'connection',
      fromId: 'shape-one',
      toId: 'shape-two',
      style: 'straight',
      startArrow: false,
      endArrow: true,
      color: '#334455',
      layerId: DEFAULT_LAYER_ID,
      areaId: null,
    })
    const { changed, onSelect, onDocumentChange } = mount(document)
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete selected object' }),
    )
    expect(changed().elements.map((item) => item.id)).toEqual(['shape-two'])
    expect(onSelect).toHaveBeenCalledWith(null)
    expect(onDocumentChange).toHaveBeenCalledOnce()
    expect(screen.getByText('No selection')).toBeVisible()
  })

  it('selects hidden objects from the list with their layer context', () => {
    const document = fixture()
    document.layers[0].visible = false
    const { onSelect } = mount(document, null)
    const list = screen.getByRole('list', { name: 'Objects in Main' })
    fireEvent.click(
      within(list).getByRole('button', { name: 'Select Rectangle on Main' }),
    )
    expect(onSelect).toHaveBeenCalledWith('shape-one')
    expect(screen.getByText('Main · rectangle · hidden')).toBeVisible()
  })

  it('combines objects into expandable layers and reveals an externally selected object', () => {
    const document = fixture()
    const props = {
      document,
      activeLayerId: DEFAULT_LAYER_ID,
      onSelect: vi.fn(),
      onActiveLayerChange: vi.fn(),
      onDocumentChange: vi.fn(),
    }
    const test = render(<CanvasInspector {...props} selectedId={null} />)
    expect(screen.queryByRole('heading', { name: 'Objects' })).toBeNull()
    expect(screen.getByRole('list', { name: 'Objects in Main' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse layer Main' }))
    expect(
      screen.queryByRole('button', { name: 'Select Rectangle on Main' }),
    ).toBeNull()
    test.rerender(<CanvasInspector {...props} selectedId="shape-one" />)
    expect(
      screen.getByRole('button', { name: 'Select Rectangle on Main' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('button', { name: 'Collapse layer Main' }),
    ).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows a layer insertion marker and commits its drop as one ordered document change', () => {
    const document = fixture()
    document.layers.push(
      { id: 'notes', name: 'Notes', visible: true, locked: false },
      { id: 'front', name: 'Front', visible: true, locked: false },
    )
    const { changed, onDocumentChange } = mount(document, null)
    const data = transfer()
    const target = screen
      .getByRole('button', { name: 'Use layer Front' })
      .closest('li')!
    drag(
      'dragstart',
      screen.getByRole('button', { name: 'Drag layer Main' }),
      data,
    )
    drag('dragover', target, data, -1)
    expect(target).toHaveAttribute('data-drop-position', 'before')
    drag('drop', target, data, -1)
    expect(changed().layers.map((layer) => layer.id)).toEqual([
      'notes',
      'front',
      DEFAULT_LAYER_ID,
    ])
    expect(onDocumentChange).toHaveBeenCalledOnce()
    expect(target).not.toHaveAttribute('data-drop-position')
  })

  it('moves an object into a collapsed target layer and expands it in one transaction', () => {
    const document = fixture()
    document.layers.push({
      id: 'notes',
      name: 'Notes',
      visible: true,
      locked: false,
    })
    const { changed, onDocumentChange, onActiveLayerChange } = mount(document)
    fireEvent.click(
      screen.getByRole('button', { name: 'Collapse layer Notes' }),
    )
    const data = transfer()
    const target = screen
      .getByRole('button', { name: 'Use layer Notes' })
      .closest('li')!
    drag(
      'dragstart',
      screen.getByRole('button', { name: 'Select Rectangle on Main' }),
      data,
    )
    drag('dragover', target, data)
    expect(target).toHaveAttribute('data-drop-position', 'inside')
    drag('drop', target, data)
    expect(changed().elements[0]).toMatchObject({
      ...document.elements[0],
      layerId: 'notes',
    })
    expect(onDocumentChange).toHaveBeenCalledOnce()
    expect(onActiveLayerChange).toHaveBeenCalledWith('notes')
    expect(
      screen.getByRole('button', { name: 'Select Rectangle on Notes' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('button', { name: 'Collapse layer Notes' }),
    ).toHaveAttribute('aria-expanded', 'true')
  })

  it('refuses external or altered drag payloads without changing a document', () => {
    const document = fixture()
    document.layers.push({
      id: 'notes',
      name: 'Notes',
      visible: true,
      locked: false,
    })
    const { onDocumentChange } = mount(document)
    const target = screen
      .getByRole('button', { name: 'Use layer Notes' })
      .closest('li')!
    const data = transfer()
    data.setData(
      CANVAS_LAYER_DRAG_MIME,
      JSON.stringify({ version: 1, kind: 'object', id: 'shape-one' }),
    )
    drag('drop', target, data)
    expect(onDocumentChange).not.toHaveBeenCalled()
    drag(
      'dragstart',
      screen.getByRole('button', { name: 'Select Rectangle on Main' }),
      data,
    )
    data.setData(
      CANVAS_LAYER_DRAG_MIME,
      JSON.stringify({ version: 1, kind: 'object', id: 'missing' }),
    )
    drag('drop', target, data)
    expect(onDocumentChange).not.toHaveBeenCalled()
  })

  it('rechecks source lock state if it changes while an object is being dragged', () => {
    const document = fixture()
    document.layers.push({
      id: 'notes',
      name: 'Notes',
      visible: true,
      locked: false,
    })
    const { onDocumentChange, changed } = mount(document)
    const data = transfer()
    drag(
      'dragstart',
      screen.getByRole('button', { name: 'Select Rectangle on Main' }),
      data,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Lock layer Main' }))
    const target = screen
      .getByRole('button', { name: 'Use layer Notes' })
      .closest('li')!
    drag('drop', target, data)
    expect(onDocumentChange).toHaveBeenCalledOnce()
    expect(changed().elements[0].layerId).toBe(DEFAULT_LAYER_ID)
    expect(
      screen.getByRole('button', { name: 'Select Rectangle on Main' }),
    ).toHaveAttribute('draggable', 'false')
  })

  it('retains shared multi-selection properties and applies changes only to editable objects', () => {
    const document = fixture()
    document.layers.push({
      id: 'locked',
      name: 'Locked',
      visible: true,
      locked: true,
    })
    document.elements.push(shape('second', 150), {
      ...shape('protected', 300),
      layerId: 'locked',
    })
    const { changed, onDocumentChange } = mount(document, 'shape-one', [
      'shape-one',
      'second',
      'protected',
    ])
    expect(
      screen.getByRole('group', { name: '3 selected objects' }),
    ).toBeVisible()
    fireEvent.change(screen.getByLabelText('Stroke color'), {
      target: { value: '#123abc' },
    })
    expect(onDocumentChange).toHaveBeenCalledOnce()
    expect(changed().elements.map((element) => element.color)).toEqual([
      '#123abc',
      '#123abc',
      '#334455',
    ])
    for (const button of screen.getAllByRole('button', {
      name: 'Select Rectangle on Main',
    }))
      expect(button).toHaveAttribute('aria-pressed', 'true')
  })
})
