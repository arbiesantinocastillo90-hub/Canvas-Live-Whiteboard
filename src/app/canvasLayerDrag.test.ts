import { describe, expect, it } from 'vitest'
import {
  createCanvasDocument,
  DEFAULT_LAYER_ID,
  type CanvasDocument,
} from './lcanvas'
import { createElement, addLayer } from './canvasOperations'
import {
  canDropCanvasLayerItem,
  dropCanvasLayerItem,
  inspectorLayerElements,
  readCanvasLayerDrag,
  type CanvasLayerDrag,
} from './canvasLayerDrag'

function fixture() {
  let document = addLayer(createCanvasDocument('Plan'), 'Notes', 'notes')
  document = addLayer(document, 'Front', 'front')
  return createElement(document, {
    type: 'rectangle',
    id: 'shape',
    x: 0,
    y: 0,
    width: 100,
    height: 70,
    layerId: DEFAULT_LAYER_ID,
  })
}
const layerDrag: CanvasLayerDrag = {
  version: 1,
  kind: 'layer',
  id: DEFAULT_LAYER_ID,
}
const objectDrag: CanvasLayerDrag = { version: 1, kind: 'object', id: 'shape' }

describe('validated inspector layer dragging', () => {
  it('accepts only bounded known internal item payloads', () => {
    const document = fixture()
    expect(readCanvasLayerDrag(JSON.stringify(objectDrag), document)).toEqual(
      objectDrag,
    )
    for (const value of [
      '',
      '{',
      'x'.repeat(2049),
      'null',
      '[]',
      JSON.stringify({ ...objectDrag, id: 'missing' }),
      JSON.stringify({ ...layerDrag, version: 2 }),
      JSON.stringify({ ...objectDrag, path: 'C:/private' }),
      JSON.stringify({ ...objectDrag, kind: 'command' }),
    ])
      expect(readCanvasLayerDrag(value, document)).toBeNull()
  })

  it('maps before and after visual drops to the actual front-to-back document order', () => {
    const document = fixture()
    const front = dropCanvasLayerItem(document, layerDrag, 'front', 'before')
    expect(front.layers.map((layer) => layer.id)).toEqual([
      'notes',
      'front',
      DEFAULT_LAYER_ID,
    ])
    const middle = dropCanvasLayerItem(document, layerDrag, 'front', 'after')
    expect(middle.layers.map((layer) => layer.id)).toEqual([
      'notes',
      DEFAULT_LAYER_ID,
      'front',
    ])
    expect(document.layers.map((layer) => layer.id)).toEqual([
      DEFAULT_LAYER_ID,
      'notes',
      'front',
    ])
    expect(dropCanvasLayerItem(document, layerDrag, 'notes', 'after')).toBe(
      document,
    )
  })

  it('moves only the object layer through the validated operation, preserving geometry and references', () => {
    const document = fixture()
    const moved = dropCanvasLayerItem(document, objectDrag, 'notes', 'inside')
    expect(moved.elements[0]).toEqual({
      ...document.elements[0],
      layerId: 'notes',
    })
    expect(document.elements[0].layerId).toBe(DEFAULT_LAYER_ID)
    expect(dropCanvasLayerItem(moved, objectDrag, 'notes', 'inside')).toBe(
      moved,
    )
  })

  it('refuses removed, hidden and locked source or target objects using the latest document', () => {
    const document = fixture()
    for (const patch of [{ locked: true }, { visible: false }]) {
      for (const id of ['notes', DEFAULT_LAYER_ID]) {
        const unavailable = {
          ...document,
          layers: document.layers.map((layer) =>
            layer.id === id ? { ...layer, ...patch } : layer,
          ),
        }
        expect(canDropCanvasLayerItem(unavailable, objectDrag, 'notes')).toBe(
          false,
        )
        expect(() =>
          dropCanvasLayerItem(unavailable, objectDrag, 'notes', 'inside'),
        ).toThrow()
      }
    }
    expect(
      canDropCanvasLayerItem(
        { ...document, elements: [] },
        objectDrag,
        'notes',
      ),
    ).toBe(false)
    expect(canDropCanvasLayerItem(document, objectDrag, 'missing')).toBe(false)
  })

  it('keeps imported locked-area membership protected even when the object layer is writable', () => {
    let document = fixture()
    document = createElement(document, {
      id: 'area',
      type: 'area',
      x: -100,
      y: -100,
      width: 1000,
      height: 1000,
      layerId: 'front',
    })
    document = {
      ...document,
      elements: document.elements.map((element) =>
        element.id === 'shape' && element.type !== 'area'
          ? { ...element, areaId: 'area' }
          : element,
      ),
      layers: document.layers.map((layer) =>
        layer.id === 'front' ? { ...layer, locked: true } : layer,
      ),
    }
    expect(canDropCanvasLayerItem(document, objectDrag, 'notes')).toBe(false)
    expect(() =>
      dropCanvasLayerItem(document, objectDrag, 'notes', 'inside'),
    ).toThrow()
  })

  it('lists objects in drawing order with the frontmost first and areas at the bottom', () => {
    const document = fixture()
    const entries = [
      { ...document.elements[0], id: 'back' },
      {
        id: 'area',
        type: 'area',
        name: 'Area',
        x: -100,
        y: -100,
        width: 1000,
        height: 1000,
        color: '#334455',
        fill: null,
        layerId: DEFAULT_LAYER_ID,
        areaId: null,
      },
      { ...document.elements[0], id: 'front' },
    ] as CanvasDocument['elements']
    expect(
      inspectorLayerElements(
        { ...document, elements: entries },
        DEFAULT_LAYER_ID,
      ).map((element) => element.id),
    ).toEqual(['front', 'back', 'area'])
  })
})
