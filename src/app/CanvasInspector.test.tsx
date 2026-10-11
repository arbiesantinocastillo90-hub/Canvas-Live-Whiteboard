import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CanvasInspector } from './CanvasInspector'
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

function mount(document = fixture(), selectedId: string | null = 'shape-one') {
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

describe('canvas properties and layers', () => {
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

  it('rejects a shape assigned to an area that cannot contain it', () => {
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
    fireEvent.change(screen.getByLabelText('Containing area'), {
      target: { value: 'tiny-area' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply properties' }))
    expect(onDocumentChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/contain|outside|fit/iu)
  })

  it('assigns valid area membership and displays its name', () => {
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
    const { changed } = mount(document)
    expect(
      screen.getByRole('combobox', { name: 'Containing area' }),
    ).toBeEnabled()
    expect(screen.getByRole('combobox', { name: 'Object layer' })).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Containing area'), {
      target: { value: 'area' },
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

  it('changes connection path and arrows in one transaction', () => {
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
    expect(screen.getByRole('combobox', { name: 'Arrows' })).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Arrows'), {
      target: { value: 'both' },
    })
    fireEvent.change(screen.getByLabelText('Connection path'), {
      target: { value: 'elbow' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply properties' }))
    expect(onDocumentChange).toHaveBeenCalledOnce()
    expect(changed().elements[2]).toMatchObject({
      style: 'elbow',
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
    for (const name of [
      'Hide layer Ideas',
      'Lock layer Ideas',
      'Move layer Ideas forward',
      'Move layer Ideas backward',
    ]) {
      const action = screen.getByRole('button', { name })
      expect(action).toHaveAttribute('title', name)
      expect(action.textContent?.trim()).toBe('')
      expect(action.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    }
    fireEvent.click(screen.getByRole('button', { name: 'Hide layer Ideas' }))
    expect(changed().layers[1].visible).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Lock layer Ideas' }))
    expect(changed().layers[1].locked).toBe(true)
    fireEvent.click(
      screen.getByRole('button', { name: 'Move layer Ideas backward' }),
    )
    expect(changed().layers[0].id).toBe(layerId)
    expect(
      screen.getByRole('button', { name: 'Move layer Ideas backward' }),
    ).toBeDisabled()
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
    const list = screen.getByRole('region', { name: 'Objects' })
    fireEvent.click(
      within(list).getByRole('button', { name: 'Select Rectangle on Main' }),
    )
    expect(onSelect).toHaveBeenCalledWith('shape-one')
    expect(screen.getByText('Main · rectangle · hidden')).toBeVisible()
  })
})
